import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { adminSearch, tagName, validUuid, type AdminList, type ConversationDTO } from '../../lib/admin';
import { normalizeMessage, validMessageKey, validSequence } from '../../lib/messages';
import { StartError } from '../identity/service';
import { messageDTO, messageSelect } from '../messages/dto';
import { authenticateAdmin, txOptions } from './auth';
const notFound = () => new StartError(404, 'Диалог или тег не найден.');
function requireId(id: string) { if (!validUuid(id)) throw notFound(); }
const clientSelect = { displayName: true, liId: true, avatarEmoji: true, tags: { select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: 'asc' as const } } } };
export async function listConversations(db: PrismaClient, raw: string | undefined, options: { state: string; q?: string; tag?: string; page?: number }): Promise<AdminList> {
  const { state, tag } = options, page = options.page ?? 0, q = adminSearch(options.q);
  if (!['active','archive'].includes(state) || !Number.isInteger(page) || page < 0 || page > 100000) throw new StartError(400, 'Некорректный фильтр.');
  if (tag) requireId(tag);
  return db.$transaction(async tx => {
    const admin = await authenticateAdmin(tx, raw);
    const status = state === 'active' ? Prisma.sql`v."firstUserMessageAt" IS NOT NULL AND v."closedAt" IS NULL` : Prisma.sql`(v."firstUserMessageAt" IS NULL OR v."closedAt" IS NOT NULL)`;
    // Search is literal, not SQL wildcard matching. LI is a public identifier, never authentication.
    const search = q ? (/^li[0-9]{6}$/i.test(q) ? Prisma.sql`AND c."liId" = ${q.toUpperCase()}` : Prisma.sql`AND position(lower(${q} COLLATE lina_unicode) in lower(c."displayName" COLLATE lina_unicode)) > 0`) : Prisma.empty;
    const tagged = tag ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ClientTag" ct WHERE ct."clientId"=c.id AND ct."tagId"=${tag}::uuid)` : Prisma.empty;
    const [result] = await tx.$queryRaw<{ items: ConversationDTO[]; total: number; unread: number }[]>(Prisma.sql`
      WITH filtered AS (
        SELECT v.id, v."clientId", c."displayName", c."liId", c."avatarEmoji", v."lastMessageAt", v."closedAt" IS NOT NULL AS closed,
          (v."firstUserMessageAt" IS NOT NULL AND v."closedAt" IS NULL) AS active,
          (SELECT count(*)::int FROM "Message" m WHERE m."conversationId"=v.id AND m."authorType"='USER' AND m.sequence>COALESCE(r."lastReadSequence",0)) AS unread
        FROM "Conversation" v JOIN "Client" c ON c.id=v."clientId"
        LEFT JOIN "AdminConversationRead" r ON r."conversationId"=v.id AND r."adminId"=${admin.id}::uuid
        WHERE ${status} ${search} ${tagged}
      ), selected AS (SELECT * FROM filtered ORDER BY "lastMessageAt" DESC NULLS LAST, id DESC LIMIT 50 OFFSET ${page*50}),
      rows AS (
        SELECT s.id,s."displayName",s."liId",s."avatarEmoji",s.active,s.closed,s."lastMessageAt",s.unread,
          COALESCE((SELECT left(m.body,160) FROM "Message" m WHERE m."conversationId"=s.id AND m."authorType" IN ('USER','OPERATOR') ORDER BY m.sequence DESC LIMIT 1),'Новый контакт') AS preview,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) ORDER BY t.name) FROM "ClientTag" ct JOIN "AdminTag" t ON t.id=ct."tagId" WHERE ct."clientId"=s."clientId"),'[]'::jsonb) AS tags
        FROM selected s
      ) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY "lastMessageAt" DESC NULLS LAST,id DESC) FROM rows),'[]'::jsonb) AS items,
        (SELECT count(*)::int FROM filtered) AS total, (SELECT COALESCE(sum(unread),0)::int FROM filtered) AS unread`);
    return { conversations: result!.items, total: result!.total, unread: result!.unread, page };
  }, txOptions);
}
export async function adminHistory(db: PrismaClient, raw: string | undefined, id: string, after?: number) {
  requireId(id); if (after !== undefined && !validSequence(after)) throw new StartError(400, 'Некорректная позиция истории.');
  return db.$transaction(async tx => {
    const admin = await authenticateAdmin(tx, raw);
    const v = await tx.conversation.findUnique({ where: { id }, select: { id: true, firstUserMessageAt: true, closedAt: true, lastMessageAt: true, client: { select: clientSelect } } });
    if (!v) throw notFound();
    const messages = await tx.message.findMany({ where: { conversationId: id, ...(after === undefined ? {} : { sequence: { gt: after } }) }, orderBy: { sequence: after === undefined ? 'desc' : 'asc' }, take: after === undefined ? 100 : 101, select: messageSelect });
    const read = await tx.adminConversationRead.findUnique({ where: { conversationId_adminId: { conversationId: id, adminId: admin.id } } });
    const readSequence = read?.lastReadSequence ?? 0;
    const unreadCount = await tx.message.count({ where: { conversationId: id, authorType: 'USER', sequence: { gt: readSequence } } });
    const conversation: ConversationDTO = { id, displayName: v.client.displayName, liId: v.client.liId, avatarEmoji: v.client.avatarEmoji, active: !!v.firstUserMessageAt && !v.closedAt, closed: !!v.closedAt, lastMessageAt: v.lastMessageAt?.toISOString() ?? null, preview: '', unread: unreadCount, tags: v.client.tags.map(t => t.tag) };
    return { conversation, messages: (after === undefined ? messages.reverse() : messages.slice(0,100)).map(messageDTO), hasMore: after !== undefined && messages.length>100, readSequence, unreadCount };
  }, txOptions);
}
export async function adminSend(db: PrismaClient, raw: string | undefined, id: string, input: unknown, key: unknown) {
  requireId(id); const text = normalizeMessage(input);
  if (!text || !validMessageKey(key)) throw new StartError(400, 'Введите 1–5000 символов и корректный ключ отправки.');
  return db.$transaction(async tx => {
    const admin = await authenticateAdmin(tx, raw, true);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`LINA.admin.send:${admin.id}`},0))::text`;
    const [v] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Conversation" WHERE id=${id}::uuid FOR UPDATE`;
    if (!v) throw notFound();
    const existing = await tx.message.findUnique({ where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: key } } });
    if (existing) {
      if (existing.authorType !== 'OPERATOR' || existing.adminAuthorId !== admin.id || existing.body !== text) throw new StartError(409, 'Ключ уже использован для другого сообщения.');
      return messageDTO(existing);
    }
    const [clock] = await tx.$queryRaw<{ now: Date; createdAt: Date }[]>`SELECT clock_timestamp() AS now,GREATEST(clock_timestamp(),COALESCE("lastMessageAt",'-infinity'::timestamptz))::timestamptz(3) AS "createdAt" FROM "Conversation" WHERE id=${id}::uuid`;
    if (await tx.message.count({ where: { adminAuthorId: admin.id, createdAt: { gte: new Date(clock!.now.getTime()-60000) } } }) >= 60) throw new StartError(429, 'Слишком много сообщений. Повторите через минуту.');
    const saved = await tx.message.create({ data: { conversationId: id, authorType: 'OPERATOR', adminAuthorId: admin.id, body: text, idempotencyKey: key, createdAt: clock!.createdAt }, select: messageSelect });
    // Replying in Archive is allowed but does not silently reopen or activate a contact.
    await tx.$executeRaw`UPDATE "Conversation" SET "lastMessageAt"=${saved.createdAt},"updatedAt"=${saved.createdAt} WHERE id=${id}::uuid`;
    return messageDTO(saved);
  }, txOptions);
}
export async function adminRead(db: PrismaClient, raw: string | undefined, id: string, sequence: unknown) {
  requireId(id); if (!validSequence(sequence) || !sequence) throw new StartError(400, 'Некорректная позиция чтения.');
  return db.$transaction(async tx => {
    const admin = await authenticateAdmin(tx, raw, true);
    if (!await tx.message.findUnique({ where: { conversationId_sequence: { conversationId: id, sequence } }, select: { sequence: true } })) throw notFound();
    const [row] = await tx.$queryRaw<{ readSequence: number }[]>`INSERT INTO "AdminConversationRead" ("conversationId","adminId","lastReadSequence","lastReadAt") VALUES (${id}::uuid,${admin.id}::uuid,${sequence},clock_timestamp())
      ON CONFLICT ("conversationId","adminId") DO UPDATE SET "lastReadSequence"=GREATEST("AdminConversationRead"."lastReadSequence",EXCLUDED."lastReadSequence"),
      "lastReadAt"=CASE WHEN EXCLUDED."lastReadSequence">COALESCE("AdminConversationRead"."lastReadSequence",0) THEN EXCLUDED."lastReadAt" ELSE "AdminConversationRead"."lastReadAt" END RETURNING "lastReadSequence" AS "readSequence"`;
    return row!;
  }, txOptions);
}
export async function setArchive(db: PrismaClient, raw: string | undefined, id: string, closed: unknown) {
  requireId(id); if (typeof closed !== 'boolean') throw new StartError(400, 'Некорректное действие.');
  return db.$transaction(async tx => {
    await authenticateAdmin(tx, raw, true);
    const rows = await tx.$queryRaw<{ id: string }[]>`UPDATE "Conversation" SET "closedAt"=CASE WHEN ${closed} THEN COALESCE("closedAt",clock_timestamp()) ELSE NULL END WHERE id=${id}::uuid RETURNING id`;
    if (!rows.length) throw notFound(); return { ok: true };
  }, txOptions);
}
export async function listTags(db: PrismaClient, raw: string | undefined) {
  return db.$transaction(async tx => { await authenticateAdmin(tx,raw); return tx.adminTag.findMany({ select: { id:true,name:true }, orderBy: { name:'asc' } }); },txOptions);
}
export async function changeTag(db: PrismaClient, raw: string | undefined, action: 'create'|'rename'|'delete', id?: string, input?: unknown) {
  if (action !== 'create') requireId(id!);
  const name = action === 'delete' ? null : tagName(input);
  if (action !== 'delete' && !name) throw new StartError(400,'Название тега: 1–60 символов.');
  try {
    return await db.$transaction(async tx => {
      await authenticateAdmin(tx,raw,true);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1279872577,4)::text`;
      if (name) { const [normalized] = await tx.$queryRaw<{value:string}[]>`SELECT lower(${name.name} COLLATE lina_unicode) AS value`; name.normalizedName = normalized!.value; }
      if (action==='create') {
        if (await tx.adminTag.count() >= 200) throw new StartError(400,'Достигнут лимит 200 тегов.');
        return tx.adminTag.create({ data:name!, select:{id:true,name:true} });
      }
      if (!await tx.adminTag.findUnique({where:{id}})) throw notFound();
      if (action==='delete') { await tx.adminTag.delete({where:{id}}); return {ok:true}; }
      return tx.adminTag.update({where:{id},data:name!,select:{id:true,name:true}});
    },txOptions);
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code==='P2002') throw new StartError(409,'Тег с таким названием уже существует.'); throw e; }
}
export async function attachTag(db: PrismaClient, raw: string | undefined, id: string, tagId: unknown, attached: unknown) {
  requireId(id); if (!validUuid(tagId) || typeof attached !== 'boolean') throw new StartError(400,'Некорректный тег.');
  return db.$transaction(async tx => {
    await authenticateAdmin(tx,raw,true);
    const v=await tx.conversation.findUnique({where:{id},select:{clientId:true}});
    if (!v || !await tx.adminTag.findUnique({where:{id:tagId}})) throw notFound();
    if (attached) await tx.clientTag.upsert({where:{clientId_tagId:{clientId:v.clientId,tagId}},create:{clientId:v.clientId,tagId},update:{}});
    else await tx.clientTag.deleteMany({where:{clientId:v.clientId,tagId}});
    return {ok:true};
  },txOptions);
}
