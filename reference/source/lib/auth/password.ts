import "server-only";

import { constantTimeEqual, decodeBase64Url, encodeBase64Url } from "./encoding";

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 600_000;
const MAX_ACCEPTED_ITERATIONS = 2_000_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const textEncoder = new TextEncoder();

interface ParsedPasswordHash {
  readonly valid: boolean;
  readonly iterations: number;
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
}

function fallbackHash(): ParsedPasswordHash {
  return {
    valid: false,
    iterations: ITERATIONS,
    salt: new Uint8Array(SALT_BYTES),
    hash: new Uint8Array(HASH_BYTES),
  };
}

function parsePasswordHash(encodedHash?: string | null): ParsedPasswordHash {
  const parts = encodedHash?.split("$") ?? [];
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== ALGORITHM) return fallbackHash();

  const iterations = Number(parts[2]?.replace(/^i=/u, ""));
  const salt = decodeBase64Url(parts[3] ?? "");
  const hash = decodeBase64Url(parts[4] ?? "");

  if (
    !Number.isSafeInteger(iterations) ||
    iterations < ITERATIONS ||
    iterations > MAX_ACCEPTED_ITERATIONS ||
    !salt ||
    salt.length < SALT_BYTES ||
    !hash ||
    hash.length !== HASH_BYTES
  ) {
    return fallbackHash();
  }

  return { valid: true, iterations, salt, hash };
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = new Uint8Array(salt).buffer;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const byteLength = textEncoder.encode(password).length;
  if (byteLength < 8 || byteLength > 1024) {
    throw new RangeError("Пароль должен содержать от 8 до 1024 байт в UTF-8");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, ITERATIONS);
  return `$${ALGORITHM}$i=${ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encodedHash?: string | null) {
  const parsed = parsePasswordHash(encodedHash);
  const actual = await derivePassword(password, parsed.salt, parsed.iterations);
  return parsed.valid && constantTimeEqual(actual, parsed.hash);
}

export function passwordNeedsRehash(encodedHash: string) {
  const parsed = parsePasswordHash(encodedHash);
  return !parsed.valid || parsed.iterations < ITERATIONS;
}
