import { utcDatabaseUrl } from "../../src/server/database-config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { emojiForLiNumber } from "../../src/lib/emoji";

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl || process.env.LINA_ALLOW_DB_TESTS !== "1") {
  throw new Error("DB tests require TEST_DATABASE_URL and LINA_ALLOW_DB_TESTS=1 for a disposable local lina_test database");
}
const url = new URL(rawUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
  throw new Error("DB tests refuse nonlocal or non-lina_test databases");
}
const pool = new Pool({ connectionString: rawUrl, max: 10 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(rawUrl) }) });

before(async () => {
  // This destructive cleanup is allowed only by the explicit local-test guard above.
  await pool.query('TRUNCATE "Client", "Admin", "AdminTag" CASCADE');
});
after(async () => { await prisma.$disconnect(); await pool.end(); });

async function createClient() {
  const connection = await pool.connect();
  const clientId = randomUUID();
  const conversationId = randomUUID();
  try {
    await connection.query("BEGIN");
    // Temporary unique value exists only inside this test fixture transaction.
    const { rows: [client] } = await connection.query<{ liNumber: number; liId: string }>(
      'INSERT INTO "Client" (id, "displayName", "avatarEmoji", "updatedAt") VALUES ($1, $2, $3, now()) RETURNING "liNumber", "liId"',
      [clientId, "Test client", randomUUID().slice(0, 20)],
    );
    assert.ok(client);
    await connection.query('UPDATE "Client" SET "avatarEmoji"=$1 WHERE id=$2', [emojiForLiNumber(client.liNumber), clientId]);
    await connection.query('INSERT INTO "Conversation" (id, "clientId", "updatedAt") VALUES ($1, $2, now())', [conversationId, clientId]);
    await connection.query("COMMIT");
    return { clientId, conversationId, ...client };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally { connection.release(); }
}

function sqlState(code: string) {
  return (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function systemMessage(conversationId: string, key: string = randomUUID()) {
  const { rows: [message] } = await pool.query<{ id: string; sequence: number }>(
    'INSERT INTO "Message" (id, "conversationId", "authorType", "systemKey", "systemParams", "sourceLocale", "idempotencyKey") VALUES ($1, $2, \'SYSTEM\', \'system.welcome\', \'{}\', \'EN\', $3) RETURNING id, sequence',
    [randomUUID(), conversationId, key],
  );
  assert.ok(message);
  return message;
}

test("concurrent clients receive distinct generated LI identities and emoji", async () => {
  const clients = await Promise.all(Array.from({ length: 20 }, () => createClient()));
  assert.equal(new Set(clients.map((item) => item.liId)).size, 20);
  for (const client of clients) assert.equal(client.liId, `LI${String(client.liNumber).padStart(6, "0")}`);
});

test("database rejects missing/duplicate conversations and immutable identity changes", async () => {
  const client = await createClient();
  await assert.rejects(pool.query('INSERT INTO "Conversation" (id, "clientId", "updatedAt") VALUES ($1, $2, now())', [randomUUID(), client.clientId]), sqlState("23505"));
  await assert.rejects(pool.query('DELETE FROM "Conversation" WHERE id=$1', [client.conversationId]), sqlState("23514"));
  await assert.rejects(pool.query('UPDATE "Client" SET "liNumber"="liNumber"+1000 WHERE id=$1', [client.clientId]), sqlState("428C9"));
  await assert.rejects(pool.query('UPDATE "Client" SET "liNumber"=DEFAULT WHERE id=$1', [client.clientId]), sqlState("23514"));
  await assert.rejects(pool.query('UPDATE "Client" SET "liId"=\'LI999999\' WHERE id=$1', [client.clientId]), sqlState("428C9"));
  await assert.rejects(pool.query('INSERT INTO "Client" (id, "displayName", "avatarEmoji", "updatedAt") VALUES ($1, \'Orphan\', \'orphan\', now())', [randomUUID()]), sqlState("23514"));
});

test("rolled-back LI numbers are not reused", async () => {
  const connection = await pool.connect();
  let allocated: number;
  try {
    await connection.query("BEGIN");
    const result = await connection.query('INSERT INTO "Client" (id, "displayName", "avatarEmoji", "updatedAt") VALUES ($1, \'Rollback\', \'rollback\', now()) RETURNING "liNumber"', [randomUUID()]);
    allocated = result.rows[0].liNumber;
    await connection.query("ROLLBACK");
  } finally { connection.release(); }
  assert.ok((await createClient()).liNumber > allocated!);
});

test("message ordering is concurrent-safe, per conversation, and idempotency is unique", async () => {
  const client = await createClient();
  const messages = await Promise.all(Array.from({ length: 20 }, () => systemMessage(client.conversationId)));
  assert.deepEqual(messages.map((item) => item.sequence).sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index + 1));
  await systemMessage(client.conversationId, "same-request");
  await assert.rejects(systemMessage(client.conversationId, "same-request"), sqlState("23505"));
  const other = await createClient();
  assert.equal((await systemMessage(other.conversationId)).sequence, 1);
  await assert.rejects(pool.query('UPDATE "Message" SET sequence=2 WHERE id=$1', [messages[0]!.id]), sqlState("23514"));
  const { rows: [conversation] } = await pool.query('SELECT "firstUserMessageAt", "closedAt" FROM "Conversation" WHERE id=$1', [client.conversationId]);
  assert.equal(conversation.firstUserMessageAt, null);
  assert.equal(conversation.closedAt, null);
});

test("message allocation waits for the earlier transaction and rollback leaves no message", async () => {
  const client = await createClient();
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query('UPDATE "Conversation" SET "lastSequence"="lastSequence"+1 WHERE id=$1', [client.conversationId]);
    let completed = false;
    const waiting = systemMessage(client.conversationId).then((message) => { completed = true; return message; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(completed, false);
    await connection.query("ROLLBACK");
    assert.equal((await waiting).sequence, 1);
  } finally { await connection.query("ROLLBACK"); connection.release(); }
});

test("author and SYSTEM constraints prevent spoofed ownership and invalid content", async () => {
  const client = await createClient();
  const other = await createClient();
  await assert.rejects(pool.query('INSERT INTO "Message" (id, "conversationId", "authorType", "clientAuthorId", body, "idempotencyKey") VALUES ($1,$2,\'USER\',$3,\'Hello\',$4)', [randomUUID(), client.conversationId, other.clientId, randomUUID()]), sqlState("23503"));
  await assert.rejects(pool.query('INSERT INTO "Message" (id, "conversationId", "authorType", body, "idempotencyKey") VALUES ($1,$2,\'SYSTEM\',\'unstructured\',$3)', [randomUUID(), client.conversationId, randomUUID()]), sqlState("23514"));
  await assert.rejects(pool.query('INSERT INTO "Message" (id, "conversationId", "authorType", body, "idempotencyKey") VALUES ($1,$2,\'USER\',\'no author\',$3)', [randomUUID(), client.conversationId, randomUUID()]), sqlState("23514"));
});

test("read cursors reference existing messages, move forward, and do not reorder conversations", async () => {
  const client = await createClient();
  const before = (await pool.query('SELECT "updatedAt", "lastMessageAt" FROM "Conversation" WHERE id=$1', [client.conversationId])).rows[0];
  await systemMessage(client.conversationId);
  await systemMessage(client.conversationId);
  await pool.query('INSERT INTO "ClientConversationRead" ("conversationId", "lastReadSequence") VALUES ($1,2)', [client.conversationId]);
  await assert.rejects(pool.query('UPDATE "ClientConversationRead" SET "lastReadSequence"=1 WHERE "conversationId"=$1', [client.conversationId]), sqlState("23514"));
  await assert.rejects(pool.query('UPDATE "ClientConversationRead" SET "lastReadSequence"=999 WHERE "conversationId"=$1', [client.conversationId]), sqlState("23503"));
  const after = (await pool.query('SELECT "updatedAt", "lastMessageAt" FROM "Conversation" WHERE id=$1', [client.conversationId])).rows[0];
  assert.deepEqual(after, before);
});

test("tag relation is unique and deleting a tag preserves the client", async () => {
  const client = await createClient();
  const tagId = randomUUID();
  await pool.query('INSERT INTO "AdminTag" (id,name,"normalizedName","updatedAt") VALUES ($1,\'HOT\',\'hot\',now())', [tagId]);
  await pool.query('INSERT INTO "ClientTag" ("clientId","tagId") VALUES ($1,$2)', [client.clientId, tagId]);
  await assert.rejects(pool.query('INSERT INTO "ClientTag" ("clientId","tagId") VALUES ($1,$2)', [client.clientId, tagId]), sqlState("23505"));
  await pool.query('DELETE FROM "AdminTag" WHERE id=$1', [tagId]);
  assert.equal((await pool.query('SELECT id FROM "Client" WHERE id=$1', [client.clientId])).rowCount, 1);
  assert.equal((await pool.query('SELECT * FROM "ClientTag" WHERE "clientId"=$1', [client.clientId])).rowCount, 0);
});

test("attachment composite FK rejects a message from another conversation", async () => {
  const first = await createClient();
  const second = await createClient();
  const message = await systemMessage(first.conversationId);
  await assert.rejects(pool.query('INSERT INTO "Attachment" (id,"conversationId","messageId","storageKey","displayFilename","mediaType","byteSize",checksum) VALUES ($1,$2,$3,$4,\'file.pdf\',\'application/pdf\',10,$5)', [randomUUID(), second.conversationId, message.id, randomUUID(), "a".repeat(64)]), sqlState("23503"));
});

test("Prisma reads generated LI identity and inserts a DB-ordered message", async () => {
  const fixture = await createClient();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: fixture.clientId } });
  assert.equal(client.liId, fixture.liId);
  const message = await prisma.message.create({ data: {
    conversationId: fixture.conversationId, authorType: "SYSTEM", systemKey: "system.welcome",
    systemParams: { name: "Test" }, sourceLocale: "EN", idempotencyKey: randomUUID(),
  } });
  assert.equal(message.sequence, 1);
});
