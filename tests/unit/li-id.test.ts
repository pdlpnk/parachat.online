import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLiId, isLiId, normalizeLiIdSearch } from "../../src/lib/li-id";

test("formats the entire LI ID range", () => {
  assert.equal(formatLiId(1), "LI000001");
  assert.equal(formatLiId(241), "LI000241");
  assert.equal(formatLiId(999999), "LI999999");
});

test("rejects invalid numeric identity values", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 1000000, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => formatLiId(value), RangeError);
  }
});

test("normalizes admin search without accepting malformed identifiers", () => {
  for (const value of ["LI000241", "li000241", "241", "  li241  ", "000241"]) {
    assert.equal(normalizeLiIdSearch(value), "LI000241");
  }
  for (const value of ["", "0", "LI000000", "LI1000000", "VX000241", "LI-241", "2.41", "1e2", "LI 241", "１２３", "241x"]) {
    assert.equal(normalizeLiIdSearch(value), null);
  }
  assert.equal(isLiId("LI000001"), true);
  for (const value of ["li000001", "LI1", "LI000000", "LI1000000", " LI000001"]) assert.equal(isLiId(value), false);
});
