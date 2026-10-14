import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSENT_KEY } from "../../src/lib/tracking";

test("consent persistence, cross-tab refusal, blocked storage and selective cookie cleanup", async () => {
  assert.ok(!process.env.NEXT_PUBLIC_META_PIXEL_ID, "this test never configures or contacts a Pixel");
  const api = await import("../../src/lib/meta-pixel");
  const keys = ["localStorage", "window", "document", "location"];
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let stored: string | null = null, readOnly = false, notifications = 0;
  const cookies: string[] = [], commands: unknown[][] = [];
  const fbq = Object.assign((...args: unknown[]) => commands.push(args), { queue: [["track", "Lead"]] });
  const globals = {
    localStorage: { getItem: () => stored, setItem: (key: string, value: string) => { assert.equal(key, CONSENT_KEY); if (readOnly) throw Error("read-only"); stored = value; } },
    window: { fbq },
    document: { set cookie(value: string) { cookies.push(value); } },
    location: { hostname: "parachat.online", pathname: "/", reload: () => { throw Error("disabled Pixel must not reload"); } },
  };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: globals[key as keyof typeof globals] });
  const unsubscribe = api.subscribeConsent(() => { notifications++; });
  try {
    assert.equal(api.PIXEL_ENABLED, false);
    assert.equal(api.getConsent(), null);
    api.activatePixel("/"); assert.equal(commands.length, 0);
    api.setConsent("granted"); assert.equal(stored, "granted"); assert.equal(api.getConsent(), "granted");
    stored = "denied"; api.syncConsent({ key: CONSENT_KEY } as StorageEvent);
    assert.equal(api.getConsent(), "denied"); assert.deepEqual(commands.at(-1), ["consent", "revoke"]);
    assert.equal(fbq.queue.length, 0);
    assert.ok(cookies.length > 0); assert.ok(cookies.every(value => /^_fb[pc]=; Max-Age=0;/.test(value)));
    stored = "granted"; api.syncConsent({ key: CONSENT_KEY } as StorageEvent);
    readOnly = true; api.setConsent("denied");
    assert.equal(stored, "granted"); assert.equal(api.getConsent(), "denied", "current refusal overrides stale storage");
    assert.equal(notifications, 4);
  } finally {
    unsubscribe();
    keys.forEach((key, index) => { const descriptor = prior[index]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  }
});
