import assert from "node:assert/strict";
import { test } from "node:test";
import { parseServerEnv } from "../../src/server/env-schema";

const url = "postgresql://lina:test-secret@127.0.0.1:5432/lina_test";

test("accepts a separate PostgreSQL URL and required identity configuration", () => {
  assert.equal(parseServerEnv({ DATABASE_URL: url, LINA_ORIGIN: "http://localhost:3000", CLIENT_CREDENTIAL_PEPPER: "a".repeat(64) }).NODE_ENV, "development");
  assert.equal(parseServerEnv({ DATABASE_URL: url, NODE_ENV: "production", LINA_ORIGIN: "https://lina.example", CLIENT_CREDENTIAL_PEPPER: "a".repeat(64) }).NODE_ENV, "production");
});

test("fails fast for missing, example or invalid environment without leaking values", () => {
  for (const input of [
    { DATABASE_URL: url, LINA_ORIGIN: "http://localhost:3000" },
    { DATABASE_URL: url, CLIENT_CREDENTIAL_PEPPER: "a".repeat(64) },
    { DATABASE_URL: url, LINA_ORIGIN: "http://external.example", CLIENT_CREDENTIAL_PEPPER: "a".repeat(64) },
    {}, { DATABASE_URL: "sqlite:test-secret" }, { DATABASE_URL: "postgres://user:CHANGE_ME@localhost/lina" },
    { DATABASE_URL: url, NODE_ENV: "staging" }, { DATABASE_URL: url, CLIENT_CREDENTIAL_PEPPER: "test-secret" },
  ]) {
    assert.throws(() => parseServerEnv(input), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Invalid server environment:/);
      assert.doesNotMatch(error.message, /test-secret|CHANGE_ME|postgresql:\/\//);
      return true;
    });
  }
});
