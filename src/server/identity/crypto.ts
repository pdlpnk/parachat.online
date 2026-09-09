import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export const CREDENTIAL_SECONDS = 365 * 24 * 60 * 60;
export const BOOTSTRAP_SECONDS = 15 * 60;
const AAD = Buffer.from("LINA.player.bootstrap.v1");
export function credentialHash(raw: string, pepper: string): string {
  return createHmac("sha256", Buffer.from(pepper, "hex")).update(raw).digest("hex");
}
export function validCredential(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw)
    && Buffer.from(raw, "base64url").toString("base64url") === raw;
}
function encryptionKey(pepper: string) {
  return createHmac("sha256", Buffer.from(pepper, "hex")).update(AAD).digest();
}
/** Authenticated encryption keeps the pre-generated credential opaque even inside the bootstrap cookie. */
export function issueBootstrap(pepper: string, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(pepper), iv);
  cipher.setAAD(AAD);
  const payload = Buffer.alloc(40);
  payload.writeBigUInt64BE(BigInt(now));
  randomBytes(32).copy(payload, 8);
  return Buffer.concat([iv, cipher.update(payload), cipher.final(), cipher.getAuthTag()]).toString("base64url");
}
export function readBootstrap(value: string | undefined, pepper: string, now = Date.now()) {
  if (!value || !/^[A-Za-z0-9_-]{91}$/.test(value)) return null;
  try {
    const data = Buffer.from(value, "base64url");
    if (data.toString("base64url") !== value) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(pepper), data.subarray(0, 12));
    decipher.setAAD(AAD);
    decipher.setAuthTag(data.subarray(52));
    const payload = Buffer.concat([decipher.update(data.subarray(12, 52)), decipher.final()]);
    const issuedAt = Number(payload.readBigUInt64BE());
    if (issuedAt > now || now - issuedAt >= BOOTSTRAP_SECONDS * 1000) return null;
    return { raw: payload.subarray(8).toString("base64url"), issuedAt };
  } catch { return null; }
}
