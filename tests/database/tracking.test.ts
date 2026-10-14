import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { utcDatabaseUrl } from "../../src/server/database-config";
import { issueBootstrap, credentialHash } from "../../src/server/identity/crypto";
import { startPlayer, resolvePlayer } from "../../src/server/identity/service";
import { sendPlayerMessage, pollMessages } from "../../src/server/messages/service";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.LINA_ALLOW_DB_TESTS !== "1" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname)) throw Error("Disposable local test DB required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url) }) });
const other = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url) }) });
const pepper = randomBytes(32).toString("hex");
after(async () => { await db.$disconnect(); await other.$disconnect(); });

test("parallel Start/double click/lost-response retry yields one Lead, one Client and welcome", async () => {
  const ticket = issueBootstrap(pepper);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => startPlayer(i % 2 ? db : other, ticket, "Tracking QA", pepper, "TR")));
  assert.equal(results.filter(r => r.conversion?.event === "Lead").length, 1);
  assert.equal(results.find(r => r.conversion)?.conversion?.locale, "tr");
  assert.equal(new Set(results.map(r => r.raw)).size, 1);
  assert.equal((await startPlayer(db, ticket, "Tracking QA", pepper, "TR")).conversion, null);
  const player = await resolvePlayer(db, results[0]!.raw, pepper);
  assert.equal(player?.messages.length, 1); assert.ok(!("conversion" in player!));
});
test("failed Start does not produce a conversion or identity", async () => {
  const ticket = issueBootstrap(pepper), count = await db.client.count();
  await assert.rejects(startPlayer(db, ticket, "ab", pepper), { status: 400 });
  assert.equal(await db.client.count(), count);
});
test("first USER only: concurrent sends, retry, restoration, polling and later sends", async () => {
  const p = await startPlayer(db, issueBootstrap(pepper), "Contact QA", pepper, "FA");
  const keys = Array.from({ length: 5 }, () => randomUUID());
  const results = await Promise.all(keys.map((key, i) => sendPlayerMessage(i % 2 ? db : other, p.raw, pepper, "hello", key)));
  assert.equal(results.filter(r => r.conversion?.event === "Contact").length, 1);
  assert.equal(results.find(r => r.conversion)?.conversion?.locale, "fa");
  for (const key of keys) assert.equal((await sendPlayerMessage(other, p.raw, pepper, "hello", key)).conversion, null);
  assert.equal((await sendPlayerMessage(db, p.raw, pepper, "later", randomUUID())).conversion, null);
  assert.ok((await pollMessages(db, p.raw, pepper, 0)).messages.every(m => !("conversion" in m)));
});
test("same-key concurrent retries yield exactly one fresh Contact receipt", async () => {
  const p = await startPlayer(db, issueBootstrap(pepper), "Retry QA", pepper), key = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => sendPlayerMessage(i % 2 ? db : other, p.raw, pepper, "hello", key)));
  assert.equal(results.filter(r => r.conversion).length, 1);
  assert.equal(new Set(results.map(r => r.message.sequence)).size, 1);
});
test("welcome/OPERATOR are not Contact; attachment-only first USER is Contact; failure rolls back", async () => {
  const p = await startPlayer(db, issueBootstrap(pepper), "File QA", pepper, "AZ");
  const owner = await db.clientCredential.findUniqueOrThrow({ where: { credentialHash: credentialHash(p.raw, pepper) }, include: { client: { include: { conversation: true } } } });
  const id = owner.client.conversation!.id;
  const admin = await db.admin.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: "QA", passwordHash: "test-only" } });
  await db.message.create({ data: { conversationId: id, authorType: "OPERATOR", adminAuthorId: admin.id, body: "operator", idempotencyKey: randomUUID() } });
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id } })).firstUserMessageAt, null);
  const file = { storageKey: randomBytes(16).toString("hex"), displayFilename: "test.png", mediaType: "image/png", byteSize: 8, checksum: "a".repeat(64) };
  const key = randomUUID();
  await assert.rejects(sendPlayerMessage(db, p.raw, pepper, "", key, { ...file, byteSize: 0 }));
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id } })).firstUserMessageAt, null);
  const result = await sendPlayerMessage(db, p.raw, pepper, "", key, file);
  assert.equal(result.conversion?.event, "Contact"); assert.equal(result.conversion?.locale, "az");
  assert.equal((await sendPlayerMessage(db, p.raw, pepper, "", key, file)).conversion, null);
});
