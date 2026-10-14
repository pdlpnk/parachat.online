import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
const db = process.env.TEST_DATABASE_URL;
if (!db || process.env.LINA_ALLOW_DB_TESTS !== "1" || !["localhost", "127.0.0.1"].includes(new URL(db).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(db).pathname)) throw Error("Disposable local DB required");
const origin = "http://localhost:55440";
const server = spawn(process.execPath, [".next/standalone/server.js"], { env: { ...process.env, DATABASE_URL: db, CLIENT_CREDENTIAL_PEPPER: randomBytes(32).toString("hex"), LINA_ORIGIN: origin, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "55440" }, stdio: "ignore" });
const cookie = (r: Response, name: string) => r.headers.getSetCookie().find(v => v.startsWith(name + "="))!.split(";")[0]!;
const req = (path: string, method = "GET", body?: unknown, credential = "", key?: string) => fetch(origin + path, { method, redirect: "manual", headers: { Origin: origin, "Content-Type": "application/json", Cookie: credential, ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await req("/api/health/live")).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready);
  assert.doesNotMatch(await (await req("/")).text(), /<script[^>]+src="https:\/\/connect.facebook.net/);
  const ticket = cookie(await req("/api/player/bootstrap", "POST", {}), "__Host-lina_bootstrap");
  const failed = await req("/api/player/start", "POST", { displayName: "ab", locale: "TR" }, ticket);
  assert.equal(failed.status, 400); assert.equal((await failed.json()).conversion, undefined);
  const started = await req("/api/player/start", "POST", { displayName: "Stage8 HTTP", locale: "TR" }, ticket);
  assert.equal(started.status, 200); assert.equal(started.headers.get("cache-control"), "no-store");
  const lead = (await started.json()).conversion;
  assert.equal(lead.event, "Lead"); assert.equal(lead.locale, "tr");
  assert.deepEqual(Object.keys(lead).sort(), ["event", "eventId", "locale"]);
  const credential = cookie(started, "__Host-lina_client");
  assert.match(started.headers.getSetCookie().find(v => v.startsWith("__Host-lina_client="))!, /HttpOnly/i);
  const retry = await req("/api/player/start", "POST", { displayName: "Stage8 HTTP", locale: "TR" }, ticket);
  assert.equal((await retry.json()).conversion, null); assert.equal(cookie(retry, "__Host-lina_client"), credential);
  assert.equal((await (await req("/api/player/start", "POST", {}, credential)).json()).conversion, undefined);
  const before = await (await req("/", "GET", undefined, credential)).text();
  const key = randomUUID();
  const sent = await req("/api/player/messages", "POST", { text: "Stage8 local smoke" }, credential, key);
  const first = await sent.json(); assert.equal(sent.status, 200); assert.equal(first.conversion.event, "Contact");
  assert.equal(first.conversion.locale, "tr"); assert.notEqual(first.conversion.eventId, lead.eventId);
  const repeated = await (await req("/api/player/messages", "POST", { text: "Stage8 local smoke" }, credential, key)).json();
  assert.equal(repeated.conversion, null); assert.deepEqual(repeated.message, first.message);
  assert.equal((await (await req("/api/player/messages", "POST", { text: "second" }, credential, randomUUID())).json()).conversion, null);
  const after = await (await req("/", "GET", undefined, credential)).text();
  assert.equal(after.match(/LI\d{6}/)?.[0], before.match(/LI\d{6}/)?.[0]);
  assert.ok(after.includes("Stage8 local smoke"));
  assert.equal((await req("/api/admin/conversations", "GET", undefined, credential)).status, 401);
  assert.doesNotMatch(await (await req("/admin/login")).text(), /<script[^>]+src="https:\/\/connect.facebook.net/);
  console.log("PASS Stage8 HTTP: absent Pixel, name minimum, fresh Lead/Contact, retry, reload/history, player/admin isolation");
} finally {
  await new Promise<void>(resolve => { if (server.exitCode !== null) return resolve(); server.once("exit", () => resolve()); server.kill("SIGTERM"); });
}
