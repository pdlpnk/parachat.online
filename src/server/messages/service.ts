import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { normalizeMessage, validMessageKey, validSequence } from "../../lib/messages";
import { credentialHash, validCredential } from "../identity/crypto";
import { StartError } from "../identity/service";
import { messageDTO, messageSelect } from "./dto";
export const SENDS_PER_MINUTE = 30;
export const MESSAGE_BATCH = 100;
type Tx = Prisma.TransactionClient;
async function authenticate(tx: Tx, raw: string | undefined, pepper: string) {
  if (!validCredential(raw)) throw new StartError(401, "Сессия завершена. Обновите страницу.");
  const rows = await tx.$queryRaw<{ clientId: string; conversationId: string; expiresAt: Date }[]>`
    SELECT c."clientId", v.id AS "conversationId", c."expiresAt" FROM "ClientCredential" c
    JOIN "Conversation" v ON v."clientId" = c."clientId"
    WHERE c."credentialHash" = ${credentialHash(raw, pepper)} AND c."revokedAt" IS NULL AND c."expiresAt" > clock_timestamp()
    FOR SHARE OF c`;
  if (!rows[0]) throw new StartError(401, "Сессия завершена. Обновите страницу.");
  return rows[0];
}
const options = { maxWait: 5000, timeout: 10000 };
export async function sendMessage(db: PrismaClient, raw: string | undefined, pepper: string, input: unknown, key: unknown) {
  const text = normalizeMessage(input);
  if (!text) throw new StartError(400, "Введите сообщение от 1 до 5000 символов.");
  if (!validMessageKey(key)) throw new StartError(400, "Некорректный ключ отправки.");
  return db.$transaction(async tx => {
    const owner = await authenticate(tx, raw, pepper);
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${owner.conversationId}::uuid FOR UPDATE`;
    const [clock] = await tx.$queryRaw<{ now: Date; createdAt: Date }[]>`SELECT clock_timestamp() AS now,
      GREATEST(clock_timestamp(), COALESCE("lastMessageAt", '-infinity'::timestamptz))::timestamptz(3) AS "createdAt"
      FROM "Conversation" WHERE id = ${owner.conversationId}::uuid`;
    if (!clock || owner.expiresAt <= clock.now) throw new StartError(401, "Сессия завершена. Обновите страницу.");
    const prior = await tx.message.findUnique({ where: { conversationId_idempotencyKey: { conversationId: owner.conversationId, idempotencyKey: key } } });
    if (prior) {
      if (prior.authorType !== "USER" || prior.clientAuthorId !== owner.clientId || prior.body !== text) throw new StartError(409, "Ключ уже использован для другого сообщения.");
      return messageDTO(prior);
    }
    const recent = await tx.message.count({ where: { conversationId: owner.conversationId, authorType: "USER", createdAt: { gte: new Date(clock.now.getTime() - 60000) } } });
    if (recent >= SENDS_PER_MINUTE) throw new StartError(429, "Слишком много сообщений. Попробуйте через минуту.");
    const saved = await tx.message.create({ data: { conversationId: owner.conversationId, clientAuthorId: owner.clientId, authorType: "USER", body: text, idempotencyKey: key, createdAt: clock.createdAt }, select: messageSelect });
    await tx.$executeRaw`UPDATE "Conversation" SET "firstUserMessageAt" = COALESCE("firstUserMessageAt", ${saved.createdAt}), "lastMessageAt" = ${saved.createdAt}, "closedAt" = NULL, "updatedAt" = ${saved.createdAt} WHERE id = ${owner.conversationId}::uuid`;
    return messageDTO(saved);
  }, options);
}
export async function pollMessages(db: PrismaClient, raw: string | undefined, pepper: string, after: number) {
  if (!validSequence(after)) throw new StartError(400, "Некорректная позиция истории.");
  return db.$transaction(async tx => {
    const owner = await authenticate(tx, raw, pepper);
    const batch = await tx.message.findMany({ where: { conversationId: owner.conversationId, sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: MESSAGE_BATCH + 1, select: messageSelect });
    const marker = await tx.clientConversationRead.findUnique({ where: { conversationId: owner.conversationId } });
    const readSequence = marker?.lastReadSequence ?? 0;
    const unreadCount = await tx.message.count({ where: { conversationId: owner.conversationId, sequence: { gt: readSequence }, authorType: { in: ["SYSTEM", "OPERATOR"] } } });
    return { messages: batch.slice(0, MESSAGE_BATCH).map(messageDTO), hasMore: batch.length > MESSAGE_BATCH, readSequence, unreadCount };
  }, options);
}
export async function markRead(db: PrismaClient, raw: string | undefined, pepper: string, sequence: unknown) {
  if (!validSequence(sequence) || sequence === 0) throw new StartError(400, "Некорректная позиция чтения.");
  return db.$transaction(async tx => {
    const owner = await authenticate(tx, raw, pepper);
    if (!await tx.message.findUnique({ where: { conversationId_sequence: { conversationId: owner.conversationId, sequence } }, select: { sequence: true } })) throw new StartError(400, "Сообщение не найдено.");
    const [result] = await tx.$queryRaw<{ readSequence: number }[]>`INSERT INTO "ClientConversationRead" ("conversationId", "lastReadSequence", "lastReadAt") VALUES (${owner.conversationId}::uuid, ${sequence}, clock_timestamp())
      ON CONFLICT ("conversationId") DO UPDATE SET "lastReadSequence" = GREATEST("ClientConversationRead"."lastReadSequence", EXCLUDED."lastReadSequence"),
      "lastReadAt" = CASE WHEN EXCLUDED."lastReadSequence" > COALESCE("ClientConversationRead"."lastReadSequence", 0) THEN EXCLUDED."lastReadAt" ELSE "ClientConversationRead"."lastReadAt" END
      RETURNING "lastReadSequence" AS "readSequence"`;
    return result!;
  }, options);
}
