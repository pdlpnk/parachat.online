import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_EMOJI_POOL, emojiForLiNumber } from "../../src/lib/emoji";

test("emoji pool has 160 distinct values without flags or letters", () => {
  assert.equal(CLIENT_EMOJI_POOL.length, 160);
  assert.equal(new Set(CLIENT_EMOJI_POOL).size, 160);
  for (const emoji of CLIENT_EMOJI_POOL) assert.doesNotMatch(emoji, /[A-Za-z0-9\u{1F1E6}-\u{1F1FF}]/u);
});

test("assignment is stable, unique and fits the DB field across the full LI range", () => {
  const assigned = new Set<string>();
  for (let number = 1; number <= 999999; number++) {
    const emoji = emojiForLiNumber(number);
    assert.ok([...emoji].length <= 32);
    assert.equal(assigned.has(emoji), false, `collision at ${number}`);
    assigned.add(emoji);
  }
  assert.equal(emojiForLiNumber(1), CLIENT_EMOJI_POOL[0]);
  assert.equal(emojiForLiNumber(160), CLIENT_EMOJI_POOL[159]);
  assert.equal(emojiForLiNumber(161), "🐼🐼");
  assert.equal(emojiForLiNumber(162), "🐼🦊");
  assert.equal(emojiForLiNumber(999999), emojiForLiNumber(999999));
});

test("emoji assignment rejects invalid sequence values", () => {
  for (const number of [0, -1, 0.1, NaN, 1000000]) assert.throws(() => emojiForLiNumber(number), RangeError);
});
