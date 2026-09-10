import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
const N = 32768, r = 8, p = 3;
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= 12 && [...value].length <= 128 && Buffer.byteLength(value) <= 512 && !/[\p{Cc}\p{Cs}]/u.test(value);
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function passwordHash(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error('Пароль должен содержать 12–128 символов без управляющих знаков.');
  const salt = randomBytes(16), key = await derive(password, salt);
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: unknown, stored: string | undefined): Promise<boolean> {
  if (!validPassword(password)) return false;
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored ?? '');
  // Missing/disabled users take the same expensive derivation path; never return hash details.
  const key = await derive(password, Buffer.from(match?.[1] ?? '00'.repeat(16), 'hex'));
  const expected = Buffer.from(match?.[2] ?? '00'.repeat(64), 'hex');
  return timingSafeEqual(key, expected) && !!match;
}
export function adminTokenHash(raw: string): string { return createHash('sha256').update('LINA.admin.session.v1\0').update(raw).digest('hex'); }
