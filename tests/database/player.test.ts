import { utcDatabaseUrl } from "../../src/server/database-config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { credentialHash, issueBootstrap, readBootstrap } from "../../src/server/identity/crypto";
import { resolvePlayer, startPlayer } from "../../src/server/identity/service";
import { emojiForLiNumber } from "../../src/lib/emoji";

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.LINA_ALLOW_DB_TESTS !== "1" || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname)) throw new Error("Disposable local test DB required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url), max: 12 }) });
const otherDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url) }) });
const pepper = randomBytes(32).toString("hex");
after(async () => { await db.$disconnect(); await otherDb.$disconnect(); });

test("atomic identity, permanent conversation, welcome, hash-only storage and safe DTO", async () => {
  const result = await startPlayer(db, issueBootstrap(pepper), "  Роман  ", pepper);
  const hash = credentialHash(result.raw, pepper);
  const row = await db.clientCredential.findUniqueOrThrow({ where: { credentialHash: hash }, include: { client: { include: { conversation: { include: { messages: true } } } } } });
  assert.match(row.client.liId, /^LI[0-9]{6}$/);
  assert.equal(row.client.avatarEmoji, emojiForLiNumber(row.client.liNumber));
  assert.equal(row.client.displayName, "Роман");
  assert.equal(row.client.conversation!.firstUserMessageAt, null);
  assert.equal(row.client.conversation!.lastMessageAt, null);
  assert.equal(row.client.conversation!.messages.length, 1);
  const welcome = row.client.conversation!.messages[0]!;
  assert.equal(welcome.authorType, "SYSTEM"); assert.equal(welcome.sequence, 1);
  assert.equal(welcome.clientAuthorId, null); assert.equal(welcome.adminAuthorId, null);
  assert.deepEqual(welcome.systemParams, { name: "Роман" });
  assert.equal(welcome.sourceLocale, "RU"); assert.equal(welcome.body, null);
  assert.ok(!JSON.stringify(row).includes(result.raw));
  const player = await resolvePlayer(db, result.raw, pepper);
  assert.ok(player); assert.equal(player.liId, row.client.liId);
  assert.deepEqual(Object.keys(player).sort(), ["avatarEmoji", "displayName", "liId", "locale", "messages"]);
  assert.ok(!JSON.stringify(player).includes(hash));
  assert.deepEqual(await resolvePlayer(db, result.raw, pepper), player);
  assert.equal((await db.clientCredential.findUniqueOrThrow({ where: { id: row.id } })).lastUsedAt, null);
});
test("parallel starts across independent DB pools and lost-response retries produce one identity", async () => {
  const ticket = issueBootstrap(pepper);
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => startPlayer(i % 2 ? db : otherDb, ticket, "Retry", pepper)));
  assert.equal(new Set(results.map((r) => r.raw)).size, 1);
  // Discard the first HTTP cookie result: the browser still has its original bootstrap.
  const replay = await startPlayer(otherDb, ticket, "Retry", pepper);
  assert.equal(replay.raw, results[0]!.raw);
  assert.equal(replay.expiresAt.getTime(), results[0]!.expiresAt.getTime());
  const credential = await db.clientCredential.findUniqueOrThrow({ where: { credentialHash: credentialHash(replay.raw, pepper) } });
  assert.equal(await db.conversation.count({ where: { clientId: credential.clientId } }), 1);
  assert.equal(await db.message.count({ where: { conversation: { clientId: credential.clientId } } }), 1);
  assert.equal(await db.clientCredential.count({ where: { clientId: credential.clientId } }), 1);
  await assert.rejects(startPlayer(db, ticket, "Changed", pepper), { status: 409 });
});
test("different bootstrap permits identical display names and independent permanent emoji", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => startPlayer(db, issueBootstrap(pepper), "Roman", pepper)));
  const players = await Promise.all(results.map((r) => resolvePlayer(db, r.raw, pepper)));
  assert.equal(new Set(players.map((p) => p!.liId)).size, 8);
  assert.equal(new Set(players.map((p) => p!.avatarEmoji)).size, 8);
});
test("missing, malformed, unknown, public IDs and bootstrap cannot authenticate", async () => {
  for (const value of [undefined, "", "LI000001", "LI999998", "Roman", randomBytes(32).toString("base64url"), issueBootstrap(pepper)]) assert.equal(await resolvePlayer(db, value, pepper), null);
});
test("revoked or expired credentials are anonymous and bootstrap never resurrects them", async () => {
  for (const field of ["revokedAt", "expiresAt"] as const) {
    const ticket = issueBootstrap(pepper);
    const result = await startPlayer(db, ticket, "Unavailable", pepper);
    await db.clientCredential.update({ where: { credentialHash: credentialHash(result.raw, pepper) }, data: field === "revokedAt" ? { revokedAt: new Date() } : { createdAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 10000) } });
    assert.equal(await resolvePlayer(db, result.raw, pepper), null);
    await assert.rejects(startPlayer(db, ticket, "Unavailable", pepper), { status: 409 });
  }
});
test("admin-session tokens do not resolve through client credentials", async () => {
  const raw = randomBytes(32).toString("base64url");
  await db.admin.create({ data: { email: `${randomBytes(8).toString("hex")}@example.invalid`, displayName: "Test", passwordHash: "test-only", sessions: { create: { tokenHash: credentialHash(raw, pepper), idleExpiresAt: new Date(Date.now() + 60000), absoluteExpiresAt: new Date(Date.now() + 120000) } } } });
  assert.equal(await resolvePlayer(db, raw, pepper), null);
});
test("failed creation rolls back every row even after identity allocation", async () => {
  const ticket = issueBootstrap(pepper);
  // Force a late failure without changing production service: an expired DB statement timeout inside an outer transaction is not needed.
  // A transaction-scoped trigger rejects only this fixture's welcome after Client/Conversation insertion.
  await db.$executeRawUnsafe(`CREATE FUNCTION lina_test_reject_welcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."systemParams"->>'name' = 'RollbackFixture' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER lina_test_reject BEFORE INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION lina_test_reject_welcome()');
  try {
    await assert.rejects(startPlayer(db, ticket, "RollbackFixture", pepper));
    assert.equal(await db.client.count({ where: { displayName: "RollbackFixture" } }), 0);
    assert.equal(await db.clientCredential.count({ where: { credentialHash: credentialHash(readBootstrap(ticket, pepper)!.raw, pepper) } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER lina_test_reject ON "Message"');
    await db.$executeRawUnsafe('DROP FUNCTION lina_test_reject_welcome()');
  }
  assert.ok(await startPlayer(db, ticket, "RollbackFixture", pepper));
});

test("shared creation ceiling rejects new identities but permits committed retries", async () => {
  const ticket = issueBootstrap(pepper);
  const issued = await startPlayer(db, ticket, "RateFixture", pepper);
  const credential = await db.clientCredential.findUniqueOrThrow({ where: { credentialHash: credentialHash(issued.raw, pepper) } });
  const hashes = Array.from({ length: 120 }, () => randomBytes(32).toString("hex"));
  await db.clientCredential.createMany({ data: hashes.map((hash) => ({ clientId: credential.clientId, credentialHash: hash, expiresAt: new Date(Date.now() + 60000) })) });
  try {
    await assert.rejects(startPlayer(otherDb, issueBootstrap(pepper), "Limited", pepper), { status: 429 });
    assert.equal((await startPlayer(otherDb, ticket, "RateFixture", pepper)).raw, issued.raw);
    assert.equal(await db.client.count({ where: { displayName: "Limited" } }), 0);
  } finally { await db.clientCredential.deleteMany({ where: { credentialHash: { in: hashes } } }); }
});
