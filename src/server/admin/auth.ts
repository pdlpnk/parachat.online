import { randomBytes } from 'node:crypto';
import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import { adminEmail } from '../../lib/admin';
import { validCredential } from '../identity/crypto';
import { StartError } from '../identity/service';
import { adminTokenHash, verifyPassword } from './password';
export const ADMIN_IDLE_MS = 30 * 60 * 1000, ADMIN_ABSOLUTE_MS = 12 * 60 * 60 * 1000, LOGIN_LIMIT = 20;
export const txOptions = { maxWait: 5000, timeout: 10000 };
export async function adminLogin(db: PrismaClient, emailInput: unknown, password: unknown) {
  // One persistent bucket, not one row per untrusted email/IP. Reservation commits even on failed login.
  const slots = await db.$queryRaw<{ attempts: number }[]>`INSERT INTO "AdminLoginThrottle" (id, "windowStartedAt", attempts) VALUES (1, clock_timestamp(), 1)
    ON CONFLICT (id) DO UPDATE SET attempts = CASE WHEN "AdminLoginThrottle"."windowStartedAt" <= clock_timestamp() - interval '1 minute' THEN 1 ELSE "AdminLoginThrottle".attempts + 1 END,
    "windowStartedAt" = CASE WHEN "AdminLoginThrottle"."windowStartedAt" <= clock_timestamp() - interval '1 minute' THEN clock_timestamp() ELSE "AdminLoginThrottle"."windowStartedAt" END
    WHERE "AdminLoginThrottle"."windowStartedAt" <= clock_timestamp() - interval '1 minute' OR "AdminLoginThrottle".attempts < ${LOGIN_LIMIT} RETURNING attempts`;
  if (!slots.length) throw new StartError(429, 'Слишком много попыток входа. Повторите через минуту.');
  const email = adminEmail(emailInput);
  const admin = email ? await db.admin.findUnique({ where: { email } }) : null;
  const matches = await verifyPassword(password, admin?.passwordHash);
  if (!matches || !admin || admin.disabledAt) throw new StartError(401, 'Неверный email или пароль.');
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Admin" WHERE id = ${admin.id}::uuid AND "disabledAt" IS NULL AND "passwordHash" = ${admin.passwordHash} FOR SHARE`;
    if (!rows.length) throw new StartError(401, 'Неверный email или пароль.');
    const raw = randomBytes(32).toString('base64url'), now = new Date();
    const expiresAt = new Date(now.getTime() + ADMIN_ABSOLUTE_MS);
    await tx.adminSession.create({ data: { adminId: admin.id, tokenHash: adminTokenHash(raw), idleExpiresAt: new Date(now.getTime() + ADMIN_IDLE_MS), absoluteExpiresAt: expiresAt } });
    return { raw, expiresAt };
  }, txOptions);
}
export async function authenticateAdmin(tx: Prisma.TransactionClient, raw: string | undefined, touch = false) {
  if (!validCredential(raw)) throw new StartError(401, 'Сессия администратора завершена. Войдите снова.');
  const [admin] = await tx.$queryRaw<{ id: string; displayName: string; sessionId: string }[]>`SELECT a.id, a."displayName", s.id AS "sessionId" FROM "AdminSession" s JOIN "Admin" a ON a.id = s."adminId"
    WHERE s."tokenHash" = ${adminTokenHash(raw)} AND s."revokedAt" IS NULL AND a."disabledAt" IS NULL AND s."idleExpiresAt" > clock_timestamp() AND s."absoluteExpiresAt" > clock_timestamp() FOR SHARE OF a FOR UPDATE OF s`;
  if (!admin) throw new StartError(401, 'Сессия администратора завершена. Войдите снова.');
  if (touch) await tx.$executeRaw`UPDATE "AdminSession" SET "lastSeenAt" = clock_timestamp(), "idleExpiresAt" = LEAST("absoluteExpiresAt", clock_timestamp() + interval '30 minutes') WHERE id = ${admin.sessionId}::uuid`;
  return admin;
}
export async function adminSession(db: PrismaClient, raw: string | undefined) {
  return db.$transaction(async tx => { const a = await authenticateAdmin(tx, raw); return { displayName: a.displayName }; }, txOptions);
}
export async function adminLogout(db: PrismaClient, raw: string | undefined) {
  await db.$transaction(async tx => { const a = await authenticateAdmin(tx, raw); await tx.adminSession.update({ where: { id: a.sessionId }, data: { revokedAt: new Date() } }); }, txOptions);
}
