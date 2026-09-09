import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { avatarEmojiForVxId, PLAYER_AVATAR_EMOJI_POOL } from "../lib/user-avatar.ts";

test("player avatar pool is large, safe and internally unique", () => {
  assert.equal(PLAYER_AVATAR_EMOJI_POOL.length, 160);
  assert.equal(new Set(PLAYER_AVATAR_EMOJI_POOL).size, PLAYER_AVATAR_EMOJI_POOL.length);
  assert.ok(PLAYER_AVATAR_EMOJI_POOL.every((emoji) => !/[A-Za-z0-9]/u.test(emoji)));
  assert.ok(PLAYER_AVATAR_EMOJI_POOL.every((emoji) => !/[\u{1F1E6}-\u{1F1FF}]/u.test(emoji)));
});

test("VX IDs deterministically map to unique emoji while the pool is available", () => {
  const assigned = PLAYER_AVATAR_EMOJI_POOL.map((_, index) => avatarEmojiForVxId(`VX${String(index + 1).padStart(6, "0")}`));
  assert.deepEqual(assigned, PLAYER_AVATAR_EMOJI_POOL);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.equal(avatarEmojiForVxId("VX000001"), avatarEmojiForVxId("VX000001"));
});

test("pool exhaustion uses stable distinct combinations and invalid IDs fail safely", () => {
  const firstCombination = avatarEmojiForVxId("VX000161");
  const secondCombination = avatarEmojiForVxId("VX000162");
  assert.equal(firstCombination, "🐼🐼");
  assert.equal(secondCombination, "🐼🦊");
  assert.notEqual(firstCombination, secondCombination);
  assert.equal(avatarEmojiForVxId("invalid"), null);
});

test("player-facing and admin contact surfaces use the shared UserAvatar component", async () => {
  const sources = await Promise.all([
    "components/admin/admin-messenger-workspace.tsx",
    "components/admin/admin-users-workspace.tsx",
    "components/dashboard/workspace-shell.tsx",
    "components/messenger/personal-messenger.tsx",
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")));

  for (const source of sources) {
    assert.match(source, /import \{ UserAvatar \} from "@\/components\/ui\/user-avatar";/u);
    assert.match(source, /<UserAvatar/u);
  }
});
