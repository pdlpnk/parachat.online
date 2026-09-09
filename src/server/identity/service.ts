import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { emojiForLiNumber } from "../../lib/emoji";
import { validateDisplayName } from "../../lib/player";
import { CREDENTIAL_SECONDS, credentialHash, readBootstrap, validCredential } from "./crypto";

import { messageDTO, messageSelect } from "../messages/dto";

export const STARTS_PER_MINUTE = 120;

export class StartError extends Error {
  constructor(public readonly status: number, public readonly publicMessage: string) { super(publicMessage); }
}
const playerSelect = {
  displayName: true, liId: true, avatarEmoji: true, locale: true,
  conversation: { select: { messages: {
    orderBy: { sequence: "desc" as const }, take: 100,
    select: messageSelect,
  } } },
} as const;

export async function resolvePlayer(db: PrismaClient, raw: string | undefined, pepper: string, now = new Date()) {
  if (!validCredential(raw)) return null;
  const credential = await db.clientCredential.findUnique({
    where: { credentialHash: credentialHash(raw, pepper) },
    select: { expiresAt: true, revokedAt: true, client: { select: playerSelect } },
  });
  if (!credential || credential.revokedAt || credential.expiresAt <= now || !credential.client.conversation) return null;
  const { conversation, ...client } = credential.client;
  return { ...client, messages: conversation.messages.reverse().map(messageDTO) };
}
export type Player = NonNullable<Awaited<ReturnType<typeof resolvePlayer>>>;

/** Only trusted route code receives the raw result, solely to install the HttpOnly cookie. */
export async function startPlayer(db: PrismaClient, bootstrap: string | undefined, input: unknown, pepper: string) {
  const name = validateDisplayName(input);
  if (!name) throw new StartError(400, "Введите имя от 1 до 80 символов без управляющих знаков.");
  const ticket = readBootstrap(bootstrap, pepper);
  if (!ticket) throw new StartError(409, "Время ожидания истекло. Нажмите «Начать» ещё раз.");
  const hash = credentialHash(ticket.raw, pepper);
  const expiresAt = await db.$transaction(async (tx) => {
    // Shared PostgreSQL transaction lock, not a Node-process lock. Hash collisions only serialize unrelated starts.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt.asIntN(64, BigInt(`0x${hash.slice(0, 16)}`))})::text`;
    if (!readBootstrap(bootstrap, pepper)) throw new StartError(409, "Время ожидания истекло. Нажмите «Начать» ещё раз.");
    const existing = await tx.clientCredential.findUnique({ where: { credentialHash: hash }, select: {
      expiresAt: true, revokedAt: true, client: { select: { displayName: true } },
    } });
    if (existing) {
      if (existing.revokedAt || existing.expiresAt <= new Date()) throw new StartError(409, "Сессия недоступна. Обновите страницу.");
      if (existing.client.displayName !== name) throw new StartError(409, "Начало чата уже подтверждено с другим именем. Повторите исходное имя.");
      return existing.expiresAt;
    }
    // Coarse shared safety ceiling; deployment must also limit requests per IP at a trusted ingress.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1279872577, 2)::text`;
    const recent = await tx.clientCredential.count({ where: { createdAt: { gte: new Date(Date.now() - 60000) } } });
    if (recent >= STARTS_PER_MINUTE) throw new StartError(429, "Слишком много новых чатов. Попробуйте через минуту.");
    const client = await tx.client.create({ data: {
      displayName: name, locale: "RU", avatarEmoji: randomBytes(16).toString("hex"),
    }, select: { id: true, liNumber: true } });
    await tx.client.update({ where: { id: client.id }, data: { avatarEmoji: emojiForLiNumber(client.liNumber) } });
    const conversation = await tx.conversation.create({ data: { clientId: client.id }, select: { id: true } });
    await tx.message.create({ data: {
      conversationId: conversation.id, authorType: "SYSTEM", systemKey: "system.welcome",
      systemParams: { name }, sourceLocale: "RU", idempotencyKey: "player-start:welcome:v1",
    } });
    const expiry = new Date(Date.now() + CREDENTIAL_SECONDS * 1000);
    await tx.clientCredential.create({ data: { clientId: client.id, credentialHash: hash, expiresAt: expiry } });
    return expiry;
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
  return { raw: ticket.raw, expiresAt };
}
