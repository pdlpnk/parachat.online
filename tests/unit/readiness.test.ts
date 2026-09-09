import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReadiness } from "../../src/server/readiness";
import { GET as live } from "../../src/app/api/health/live/route";

test("readiness reports a successful database probe", async () => {
  assert.deepEqual(await checkReadiness(async () => 1), { status: 200, body: { status: "ready", database: "available" } });
});

test("readiness sanitizes errors including synchronous failures", async () => {
  const result = await checkReadiness(() => { throw new Error("postgresql://secret:password@internal/database"); });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { status: "not_ready", database: "unavailable" });
});

test("readiness times out a stalled database", async () => {
  const result = await checkReadiness(() => new Promise(() => {}), 10);
  assert.equal(result.status, 503);
});

test("liveness is independent of database configuration and is not cached", async () => {
  const response = live();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "alive" });
});
