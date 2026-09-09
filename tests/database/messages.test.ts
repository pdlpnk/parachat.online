import { utcDatabaseUrl } from "../../src/server/database-config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { credentialHash, issueBootstrap } from "../../src/server/identity/crypto";
import { resolvePlayer, startPlayer } from "../../src/server/identity/service";
import { sendMessage, pollMessages, markRead } from "../../src/server/messages/service";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.LINA_ALLOW_DB_TESTS !== "1" || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname)) throw new Error("Disposable local test DB required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url), max: 12 }) });
const other = new PrismaClient({ adapter: new PrismaPg({ connectionString: utcDatabaseUrl(url), max: 12 }) });
const pepper = randomBytes(32).toString("hex");
after(async () => { await db.$disconnect(); await other.$disconnect(); });
async function fixture() {
  const { raw } = await startPlayer(db, issueBootstrap(pepper), "Stage3", pepper);
  const cred = await db.clientCredential.findUniqueOrThrow({ where: { credentialHash: credentialHash(raw, pepper) } });
  const conv = await db.conversation.findUniqueOrThrow({ where: { clientId: cred.clientId } });
  return { raw, cred, conv };
}
const conversation = (id: string) => db.conversation.findUniqueOrThrow({ where: { id } });
async function system(id: string, n = 1) {
  for (let i = 0; i < n; i++) await db.message.create({ data: { conversationId: id, authorType: "SYSTEM", systemKey: "system.fixture", systemParams: { internal: "private" }, sourceLocale: "RU", idempotencyKey: randomUUID() } });
}
test("new identity/welcome remains archived after poll and read", async () => {
  const f = await fixture(); await pollMessages(db, f.raw, pepper, 0); await markRead(db, f.raw, pepper, 1);
  assert.deepEqual(await conversation(f.conv.id), f.conv);
});
test("first USER atomically activates conversation with persisted timestamps", async () => {
  const f = await fixture(); const m = await sendMessage(db, f.raw, pepper, " hello ", randomUUID());
  const c = await conversation(f.conv.id); assert.ok(Math.abs(Date.now() - new Date(m.createdAt).getTime()) < 10000, "real UTC timestamp"); assert.equal(m.sequence, 2); assert.equal(m.text, "hello"); assert.equal(m.authorType, "USER");
  assert.equal(c.firstUserMessageAt?.toISOString(), m.createdAt); assert.equal(c.lastMessageAt?.toISOString(), m.createdAt); assert.equal(c.closedAt, null);
});
test("later USER preserves first timestamp and advances last to saved row", async () => {
  const f = await fixture(); const a = await sendMessage(db, f.raw, pepper, "a", randomUUID()); const b = await sendMessage(db, f.raw, pepper, "b", randomUUID());
  const c = await conversation(f.conv.id); assert.equal(c.firstUserMessageAt?.toISOString(), a.createdAt); assert.equal(c.lastMessageAt?.toISOString(), b.createdAt);
});
test("committed retry is identical and changes no conversation timestamps", async () => {
  const f = await fixture(); const key = randomUUID(); const m = await sendMessage(db, f.raw, pepper, "é\nhello", key); const before = await conversation(f.conv.id);
  assert.deepEqual(await sendMessage(other, f.raw, pepper, " e\u0301\r\nhello ", key), m); assert.deepEqual(await conversation(f.conv.id), before);
});
test("same key different text returns conflict", async () => {
  const f = await fixture(), key = randomUUID(); await sendMessage(db, f.raw, pepper, "a", key); await assert.rejects(sendMessage(db, f.raw, pepper, "b", key), { status: 409 });
});
test("same text distinct keys creates two intentional messages", async () => {
  const f = await fixture(); const a = await sendMessage(db, f.raw, pepper, "same", randomUUID()), b = await sendMessage(db, f.raw, pepper, "same", randomUUID()); assert.equal(b.sequence, a.sequence + 1);
});
test("parallel first sends from independent pools have unique ordered sequences and atomic activation", async () => {
  const f = await fixture(); const rows = await Promise.all(Array.from({ length: 16 }, (_, i) => sendMessage(i % 2 ? db : other, f.raw, pepper, `parallel${i}`, randomUUID())));
  rows.sort((a, b) => a.sequence - b.sequence); assert.deepEqual(rows.map(m => m.sequence), Array.from({ length: 16 }, (_, i) => i + 2));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i]!.createdAt >= rows[i - 1]!.createdAt);
  const c = await conversation(f.conv.id); assert.equal(c.firstUserMessageAt?.toISOString(), rows[0]!.createdAt); assert.equal(c.lastMessageAt?.toISOString(), rows.at(-1)!.createdAt);
});
test("parallel same key across pools produces one USER", async () => {
  const f = await fixture(), key = randomUUID(); const rows = await Promise.all(Array.from({ length: 12 }, (_, i) => sendMessage(i % 2 ? db : other, f.raw, pepper, "retry", key)));
  assert.equal(new Set(rows.map(m => m.sequence)).size, 1); assert.equal(await db.message.count({ where: { conversationId: f.conv.id, authorType: "USER" } }), 1);
});
test("closed conversation reopens only on a new USER", async () => {
  const f = await fixture(), key = randomUUID(); await sendMessage(db, f.raw, pepper, "a", key);
  await db.conversation.update({ where: { id: f.conv.id }, data: { closedAt: new Date() } }); const closed = await conversation(f.conv.id);
  await sendMessage(db, f.raw, pepper, "a", key); await pollMessages(db, f.raw, pepper, 0); await markRead(db, f.raw, pepper, 2); assert.deepEqual(await conversation(f.conv.id), closed);
  await sendMessage(db, f.raw, pepper, "new", randomUUID()); assert.equal((await conversation(f.conv.id)).closedAt, null);
});
test("SYSTEM insertion and poll do not activate or reopen", async () => {
  const f = await fixture(); await system(f.conv.id); const c = await conversation(f.conv.id); assert.equal(c.firstUserMessageAt, null); assert.equal(c.lastMessageAt, null);
  await db.conversation.update({ where: { id: f.conv.id }, data: { closedAt: new Date() } }); const closed = await conversation(f.conv.id); await system(f.conv.id); await pollMessages(db, f.raw, pepper, 0);
  assert.equal((await conversation(f.conv.id)).closedAt?.getTime(), closed.closedAt?.getTime());
});
test("missing malformed unknown public IDs and bootstrap cannot authenticate any endpoint", async () => {
  for (const raw of [undefined, "", "LI000001", "Stage3", randomUUID(), randomBytes(32).toString("base64url"), issueBootstrap(pepper)]) {
    await assert.rejects(sendMessage(db, raw, pepper, "x", randomUUID()), { status: 401 });
    await assert.rejects(pollMessages(db, raw, pepper, 0), { status: 401 }); await assert.rejects(markRead(db, raw, pepper, 1), { status: 401 });
  }
});
test("revoked and expired sessions cannot send poll or acknowledge", async () => {
  for (const field of ["revokedAt", "expiresAt"] as const) {
    const f = await fixture(); await db.clientCredential.update({ where: { id: f.cred.id }, data: field === "revokedAt" ? { revokedAt: new Date() } : { createdAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 10000) } });
    await assert.rejects(sendMessage(db, f.raw, pepper, "x", randomUUID()), { status: 401 }); await assert.rejects(pollMessages(db, f.raw, pepper, 0), { status: 401 }); await assert.rejects(markRead(db, f.raw, pepper, 1), { status: 401 });
  }
});
test("cookie owner isolates history and same idempotency key across clients", async () => {
  const a = await fixture(), b = await fixture(), key = randomUUID(); await sendMessage(db, a.raw, pepper, "private-A", key); await sendMessage(db, b.raw, pepper, "private-B", key);
  assert.ok(!(JSON.stringify(await pollMessages(db, b.raw, pepper, 0))).includes("private-A"));
});
test("safe DTO exposes no message UUID author IDs key raw system parameters", async () => {
  const f = await fixture(); await sendMessage(db, f.raw, pepper, "plain", randomUUID()); await system(f.conv.id);
  for (const m of (await pollMessages(db, f.raw, pepper, 0)).messages) assert.deepEqual(Object.keys(m).sort(), ["authorType", "createdAt", "sequence", "text"]);
});
test("read is monotonic under parallel different cursors and repeated calls", async () => {
  const f = await fixture(); await system(f.conv.id, 5); await Promise.all([6, 2, 5, 1, 4].map(n => markRead(other, f.raw, pepper, n)));
  const before = await db.clientConversationRead.findUniqueOrThrow({ where: { conversationId: f.conv.id } }); assert.equal(before.lastReadSequence, 6);
  await markRead(db, f.raw, pepper, 6); await markRead(db, f.raw, pepper, 1); assert.deepEqual(await db.clientConversationRead.findUniqueOrThrow({ where: { conversationId: f.conv.id } }), before);
});
test("read rejects nonexistent or other-conversation-only sequence", async () => {
  const a = await fixture(), b = await fixture(); await system(a.conv.id, 3);
  for (const n of [0, -1, 1.5, 4, 999999]) await assert.rejects(markRead(db, b.raw, pepper, n), { status: 400 });
  assert.equal(await db.clientConversationRead.count({ where: { conversationId: b.conv.id } }), 0);
});
test("unread counts only incoming SYSTEM/OPERATOR and respects player marker", async () => {
  const f = await fixture(); await sendMessage(db, f.raw, pepper, "user", randomUUID());
  const admin = await db.admin.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: "Fixture", passwordHash: "fixture-only" } });
  await db.message.create({ data: { conversationId: f.conv.id, authorType: "OPERATOR", adminAuthorId: admin.id, body: "operator fixture", idempotencyKey: randomUUID() } });
  let batch = await pollMessages(db, f.raw, pepper, 0); assert.equal(batch.unreadCount, 2); assert.equal(batch.messages[2]!.authorType, "OPERATOR");
  await markRead(db, f.raw, pepper, 2); batch = await pollMessages(db, f.raw, pepper, 2); assert.equal(batch.unreadCount, 1);
  await markRead(db, f.raw, pepper, 3); assert.equal((await pollMessages(db, f.raw, pepper, 3)).unreadCount, 0);
});
test("latest SSR 100 and incremental catch-up over 250 messages are gap-free", async () => {
  const f = await fixture(); await system(f.conv.id, 250); const player = await resolvePlayer(db, f.raw, pepper); assert.equal(player!.messages.length, 100); assert.equal(player!.messages[0]!.sequence, 152); assert.equal(player!.messages.at(-1)!.sequence, 251);
  let cursor = 0; const all: number[] = [];
  for (let i = 0; i < 4; i++) { const batch = await pollMessages(db, f.raw, pepper, cursor); assert.ok(batch.messages.length <= 100); all.push(...batch.messages.map(m => m.sequence)); cursor = batch.messages.at(-1)?.sequence ?? cursor; if (!batch.hasMore) break; }
  assert.deepEqual(all, Array.from({ length: 251 }, (_, i) => i + 1)); assert.equal((await pollMessages(db, f.raw, pepper, cursor)).messages.length, 0);
});
test("shared per-client rate limit permits committed retries at ceiling", async () => {
  const f = await fixture(), key = randomUUID(); const first = await sendMessage(db, f.raw, pepper, "first", key);
  for (let i = 0; i < 29; i++) await sendMessage(db, f.raw, pepper, `rate${i}`, randomUUID());
  await assert.rejects(sendMessage(other, f.raw, pepper, "blocked", randomUUID()), { status: 429 }); assert.deepEqual(await sendMessage(other, f.raw, pepper, "first", key), first);
  const independent = await fixture(); assert.ok(await sendMessage(other, independent.raw, pepper, "allowed", randomUUID()));
});
test("failed insert rolls sequence and activation back; retry succeeds", async () => {
  const f = await fixture(), key = randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION lina_test_reject_send() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.body = 'RollbackSendFixture' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER z_lina_test_reject_send AFTER INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION lina_test_reject_send()');
  try { await assert.rejects(sendMessage(db, f.raw, pepper, "RollbackSendFixture", key)); assert.deepEqual(await conversation(f.conv.id), f.conv); }
  finally { await db.$executeRawUnsafe('DROP TRIGGER z_lina_test_reject_send ON "Message"'); await db.$executeRawUnsafe('DROP FUNCTION lina_test_reject_send()'); }
  assert.equal((await sendMessage(db, f.raw, pepper, "RollbackSendFixture", key)).sequence, 2);
});
test("validation rejects bad text/key without writing", async () => {
  const f = await fixture(); for (const text of ["", " \n", "😀".repeat(5001), "\ud800"]) await assert.rejects(sendMessage(db, f.raw, pepper, text, randomUUID()), { status: 400 });
  await assert.rejects(sendMessage(db, f.raw, pepper, "x", "bad"), { status: 400 }); assert.deepEqual(await conversation(f.conv.id), f.conv);
});
test("Unicode maximum multiline and HTML-like text survive database round trip", async () => {
  const f = await fixture(); const text = "😀".repeat(4980) + "\n<b>Україна</b>"; const m = await sendMessage(db, f.raw, pepper, text, randomUUID());
  assert.equal(m.text, text); assert.equal((await pollMessages(db, f.raw, pepper, 1)).messages[0]!.text, text);
});
