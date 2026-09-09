import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { BOOTSTRAP_SECONDS, credentialHash, issueBootstrap, readBootstrap, validCredential } from "../../src/server/identity/crypto";
import { systemText, validateDisplayName } from "../../src/lib/player";
const pepper = randomBytes(32).toString("hex");

test("Unicode name validation trims and normalizes, rejects empty/control/oversized input", () => {
  assert.equal(validateDisplayName("  Роман 李 e\u0301  "), "Роман 李 é");
  for (const value of [null, {}, "", "  ", "\u200b", "A\nB", "A\u202eB", "\ud800", "a".repeat(81), "\u0301"]) assert.equal(validateDisplayName(value), null);
  assert.equal(validateDisplayName("🙂".repeat(80)), "🙂".repeat(80));
});
test("bootstrap authenticated encryption hides random credential and enforces expiry/purpose", () => {
  const now = Date.now();
  const ticket = issueBootstrap(pepper, now);
  const decoded = readBootstrap(ticket, pepper, now)!;
  assert.ok(validCredential(decoded.raw));
  assert.equal(Buffer.from(decoded.raw, "base64url").length, 32);
  assert.ok(!ticket.includes(decoded.raw));
  assert.notEqual(readBootstrap(issueBootstrap(pepper, now), pepper, now)!.raw, decoded.raw);
  assert.equal(readBootstrap(ticket, pepper, now + BOOTSTRAP_SECONDS * 1000), null);
  assert.equal(readBootstrap(ticket, pepper, now - 1), null);
  assert.equal(readBootstrap(ticket, randomBytes(32).toString("hex"), now), null);
  assert.equal(readBootstrap(ticket.slice(0, 20) + (ticket[20] === "a" ? "b" : "a") + ticket.slice(21), pepper, now), null);
  assert.equal(readBootstrap(decoded.raw, pepper, now), null);
  const hash = credentialHash(decoded.raw, pepper);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, decoded.raw);
  assert.notEqual(hash, credentialHash(decoded.raw, "a".repeat(64)));
  for (const value of [undefined, "LI000001", "Roman", "a".repeat(44), ticket]) assert.equal(validCredential(value), false);
});
test("system renderer safely resolves known scalar params and has a neutral fallback", () => {
  assert.equal(systemText("system.welcome", { name: "Роман" }), "Привет, Роман! 👋\n\nЭто ваш личный чат с менеджером. Здесь вы сможете задать вопрос и получить ответ.");
  for (const value of [null, {}, { name: {} }, { name: "" }]) assert.equal(systemText("system.welcome", value), "Системное сообщение.");
  assert.equal(systemText("system.future", { name: "A" }), "Системное сообщение.");
  assert.ok(systemText("system.welcome", { name: "<script>" }).includes("<script>")); // React escapes text at rendering.
});
