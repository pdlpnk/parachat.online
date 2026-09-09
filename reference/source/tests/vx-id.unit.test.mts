import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isVxId, normalizeVxIdSearch } from "../lib/vx-id.ts";

test("VX ID search accepts full, lowercase and numeric forms", () => {
  assert.equal(normalizeVxIdSearch("VX000284"), "VX000284");
  assert.equal(normalizeVxIdSearch("vx000284"), "VX000284");
  assert.equal(normalizeVxIdSearch("000284"), "VX000284");
  assert.equal(normalizeVxIdSearch("284"), "VX000284");
  assert.equal(normalizeVxIdSearch("VX1000000"), null);
  assert.equal(normalizeVxIdSearch("member-284"), null);
});

test("VX ID format is strict", () => {
  assert.equal(isVxId("VX000001"), true);
  assert.equal(isVxId("vx000001"), false);
  assert.equal(isVxId("VX1"), false);
  assert.equal(isVxId("VX-000001"), false);
});

test("migration backfills deterministically and enables database invariants", async () => {
  const sql = await readFile(new URL("../prisma/migrations/20260818090000_add_user_vx_id/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /ORDER BY "createdAt" ASC, "id" ASC/u);
  assert.match(sql, /CREATE SEQUENCE "User_vxId_seq"/u);
  assert.match(sql, /MAXVALUE 999999/u);
  assert.match(sql, /ALTER COLUMN "vxId" SET NOT NULL/u);
  assert.match(sql, /CREATE UNIQUE INDEX "User_vxId_key"/u);
  assert.match(sql, /User_vxId_immutable/u);
});

test("admin search uses normalized VX ID without replacing existing search", async () => {
  const messenger = await readFile(new URL("../lib/services/admin-messenger-service.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../lib/repositories/prisma-admin-repository.ts", import.meta.url), "utf8");
  assert.match(messenger, /normalizeVxIdSearch\(query\)/u);
  assert.match(repository, /normalizeVxIdSearch\(search\)/u);
  assert.match(messenger, /displayName/u);
  assert.match(messenger, /email/u);
});
