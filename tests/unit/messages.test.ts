import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mergeMessages, normalizeMessage, validMessageKey, validSequence, localMessageTime, type MessageDTO } from "../../src/lib/messages";
import { messageDTO } from "../../src/server/messages/dto";
import { createPoller } from "../../src/lib/polling";

test("message text normalizes edges, NFC and newlines while retaining plaintext", () => {
  assert.equal(normalizeMessage("  e\u0301\r\n<b>x</b>\rsecond  "), "é\n<b>x</b>\nsecond");
  assert.equal(normalizeMessage("👩‍💻\n  中 Україна"), "👩‍💻\n  中 Україна");
});
test("message limits count Unicode scalar values, reject empty/control/surrogate", () => {
  assert.equal(normalizeMessage("😀".repeat(5000)), "😀".repeat(5000));
  for (const bad of [null, {}, "", " \n\t", "\u200b", "\u0301", "a\u0000", "\ud800", "😀".repeat(5001)]) assert.equal(normalizeMessage(bad), null);
});
test("canonical v4 idempotency key and bounded integer cursor", () => {
  assert.ok(validMessageKey(randomUUID()));
  for (const bad of [undefined, "", "a".repeat(160), randomUUID().toUpperCase(), "0".repeat(36)]) assert.equal(validMessageKey(bad), false);
  for (const good of [0, 1, 2147483647]) assert.ok(validSequence(good));
  for (const bad of [-1, 1.2, NaN, Infinity, 2147483648, "2"]) assert.equal(validSequence(bad), false);
});
const message = (sequence: number): MessageDTO => ({ sequence, authorType: "USER", text: `text${sequence}`, createdAt: "2026-09-09T07:00:00.000Z" });
test("merge orders interleaved poll/send and deduplicates repeated batches", () => {
  const current = [message(1), message(4)];
  const merged = mergeMessages(current, [message(2), message(3), message(4), message(3)]);
  assert.deepEqual(merged.map(m => m.sequence), [1, 2, 3, 4]); assert.equal(mergeMessages(merged, merged), merged);
});
test("DTO contains only four safe fields; system params and raw body stay private", () => {
  const dto = messageDTO({ sequence: 1, authorType: "SYSTEM", body: null, systemKey: "system.future", systemParams: { secret: "private" }, createdAt: new Date("2026-09-09T07:00:00Z") });
  assert.deepEqual(Object.keys(dto).sort(), ["authorType", "createdAt", "sequence", "text"]);
  assert.equal(dto.text, "Системное сообщение."); assert.equal(dto.createdAt, "2026-09-09T07:00:00.000Z");
  assert.match(localMessageTime(dto.createdAt), /^\d{2}:\d{2}$/);
});
test("poller catches up, pauses, ignores aborted late results and never overlaps", async () => {
  let inFlight = 0, max = 0, calls = 0;
  const cursors: number[] = [];
  let delivered!: () => void; const done = new Promise<void>(r => { delivered = r; });
  const poller = createPoller(1, async cursor => {
    calls++; inFlight++; max = Math.max(max, inFlight);
    await new Promise(r => setTimeout(r, 3)); inFlight--;
    return { messages: [message(cursor + 1)], hasMore: cursor < 3, readSequence: 0, unreadCount: 0 };
  }, (_, cursor) => { cursors.push(cursor); if (cursor === 4) { poller.pause(); delivered(); } }, e => { throw e; }, 100);
  poller.resume(); poller.resume(); await done; assert.equal(max, 1); assert.equal(calls, 3); assert.deepEqual(cursors, [2, 3, 4]);
  let resolve!: (value: { messages: MessageDTO[]; hasMore: boolean; readSequence: number; unreadCount: number }) => void;
  const late = createPoller(0, () => new Promise(r => { resolve = r; }), () => assert.fail("late delivery"), () => assert.fail("late error"));
  late.resume(); late.pause(); resolve({ messages: [message(1)], hasMore: false, readSequence: 0, unreadCount: 0 }); await new Promise(r => setTimeout(r, 0));
});
test("poller stops malformed non-advancing catch-up without an infinite loop", async () => {
  let fail!: () => void; const done = new Promise<void>(r => { fail = r; });
  const poller = createPoller(2, async () => ({ messages: [], hasMore: true, readSequence: 0, unreadCount: 0 }), () => assert.fail(), () => { poller.pause(); fail(); });
  poller.resume(); await done;
});

test("UTC connection options preserve existing settings and override timezone last", async () => {
  const { utcDatabaseUrl } = await import("../../src/server/database-config");
  const url = new URL(utcDatabaseUrl("postgresql://user:secret@localhost/db?options=-c%20statement_timeout%3D2000%20-c%20timezone%3DEurope%2FKiev"));
  assert.equal(url.searchParams.get("options"), "-c statement_timeout=2000 -c timezone=Europe/Kiev -c timezone=UTC");
  assert.equal(url.pathname, "/db");
});
