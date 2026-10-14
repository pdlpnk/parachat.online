import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createPixelController, createTrackingGate, parseConsent, trackablePath, validPixelId } from "../../src/lib/tracking";
import { conversionReceipt } from "../../src/server/tracking";
import { CONSENT_WORDS } from "../../src/lib/consent-i18n";
import { LOCALES } from "../../src/lib/preferences";

test("missing/invalid Pixel ID is disabled; consent is opt-in and routes allowlisted", () => {
  for (const id of [undefined, "", "CHANGE_ME", " <script>"]) assert.equal(validPixelId(id), false);
  for (const value of [null, "yes", "true", "unknown"]) assert.equal(parseConsent(value), null);
  assert.equal(parseConsent("denied"), "denied");
  assert.equal(parseConsent("granted"), "granted");
  for (const path of ["/admin", "/admin/login", "/api/admin/login", "/api/health", "/api/health/live", "/dev/messenger", "/unknown"]) assert.equal(trackablePath(path), false);
  assert.equal(trackablePath("/"), true);
});
test("PageView only after consent, once per route visit, not rerender/refresh; admin excluded", () => {
  const calls: unknown[][] = [], gate = createTrackingGate((...args) => calls.push(args));
  gate.page("/", null); gate.page("/", "denied"); assert.equal(calls.length, 0);
  gate.page("/", "granted"); gate.page("/", "granted"); gate.page("/", null); gate.page("/", "granted");
  assert.deepEqual([...calls], [["track", "PageView"]]);
  gate.page("/admin", "granted"); assert.equal(calls.length, 1);
  gate.page("/", "granted"); assert.equal(calls.length, 2);
  const reloaded = createTrackingGate((...args) => calls.push(args));
  reloaded.page("/", "granted"); assert.equal(calls.length, 3);
});
test("conversions require receipt and consent; duplicates suppressed; parameters are strictly selected", () => {
  const calls: unknown[][] = [], gate = createTrackingGate((...args) => calls.push(args));
  const receipt = { ...conversionReceipt("Lead", "TR"), displayName: "PRIVATE", clientId: "PRIVATE", text: "PRIVATE" };
  gate.conversion(receipt, "/", null); gate.conversion(receipt, "/", "denied"); gate.conversion(receipt, "/admin", "granted");
  for (const value of [undefined, null, {}, { ...receipt, eventId: "LI000001" }, { ...receipt, locale: "xx" }]) gate.conversion(value, "/", "granted");
  assert.equal(calls.length, 0);
  gate.conversion(receipt, "/", "granted"); gate.conversion(receipt, "/", "granted");
  assert.deepEqual([...calls], [["track", "Lead", { content_name: "LINA Chat", content_category: "Chat", locale: "tr" }, { eventID: receipt.eventId }]]);
  gate.conversion({ event: "Contact", eventId: randomUUID(), locale: "fa" }, "/", "granted");
  assert.equal(calls.length, 2);
});
test("five locales have complete consent copy and opaque, non-identifying conversion receipts", () => {
  for (const locale of LOCALES) {
    for (const text of Object.values(CONSENT_WORDS[locale])) assert.ok(text.length > 0);
    const receipt = conversionReceipt("Contact", locale);
    assert.deepEqual(Object.keys(receipt).sort(), ["event", "eventId", "locale"]);
    assert.equal(receipt.locale, locale.toLowerCase());
    assert.notEqual(receipt.eventId, conversionReceipt("Contact", locale).eventId);
  }
});
test("vendor loader never runs without ID/consent or on admin; grant initializes once; revoke blocks events", () => {
  let loads = 0;
  const calls: unknown[][] = [], load = () => { loads++; }, send = (...args: unknown[]) => { calls.push(args); };
  const disabled = createPixelController(false, load, send);
  disabled.activate("/", "granted"); disabled.conversion(conversionReceipt("Lead", "RU"), "/", "granted");
  assert.equal(loads, 0); assert.equal(calls.length, 0);
  const pixel = createPixelController(true, load, send);
  pixel.activate("/", null); pixel.activate("/", "denied"); pixel.activate("/admin", "granted");
  assert.equal(loads, 0);
  pixel.activate("/", "granted"); pixel.deactivate("/"); pixel.activate("/", "granted");
  assert.equal(loads, 1); assert.equal(calls.filter(c => c[1] === "PageView").length, 1);
  pixel.deactivate("/admin");
  pixel.conversion(conversionReceipt("Lead", "RU"), "/admin", "granted");
  pixel.conversion(conversionReceipt("Lead", "RU"), "/", "denied");
  assert.equal(calls.filter(c => c[1] === "Lead").length, 0);
  assert.deepEqual(calls.at(-1), ["consent", "revoke"]);
});
