import "server-only";

import { randomUUID } from "node:crypto";

import { ADMIN_MESSENGER_ROLES, isAdminMessengerRole, type AdminMessengerDetail, type AdminMessengerList, type AdminMessengerNote, type AdminMessengerScope } from "@/lib/admin-messenger";
import type { AuthenticatedPrincipal } from "@/lib/auth";
import { ApplicationError, createTransactionalEventServices, PrismaTransactionRunner } from "@/lib/application";
import type { AesGcmDataProtector, EncryptedPayload } from "@/lib/data-protection";
import { Prisma, type PrismaClient } from "@/lib/db";
import type { SupportConversationView } from "@/lib/support";
import { databaseLocale, decodeSystemMessage, renderSystemMessage } from "@/lib/i18n";
import { normalizeVxIdSearch } from "@/lib/vx-id";
import { ensurePersonalConversationRecord } from "./personal-conversation";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function requireAdmin(actor: AuthenticatedPrincipal) {
  if (!actor.roleKeys.includes("admin") || !actor.permissionKeys.includes("support.admin")) {
    throw new ApplicationError("FORBIDDEN", "Недостаточно прав для Messenger");
  }
}

function cleanText(value: unknown, min = 1, max = 5000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw new ApplicationError("VALIDATION", "Проверьте текст сообщения");
  return text;
}

function object(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function adminReadAt(context: Prisma.JsonValue, actorId: string) {
  const reads = object(object(context).adminMessengerReads as Prisma.JsonValue);
  const value = reads[actorId];
  return typeof value === "string" && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
}

type ConversationRecord = Awaited<ReturnType<AdminMessengerService["conversationRecord"]>>;

export class AdminMessengerService {
  private readonly transactions: PrismaTransactionRunner;

  constructor(private readonly database: PrismaClient, private readonly protector: AesGcmDataProtector) {
    this.transactions = new PrismaTransactionRunner(database);
  }

  async list(actor: AuthenticatedPrincipal, search = "", scope: AdminMessengerScope = "active", tagId?: string): Promise<AdminMessengerList> {
    requireAdmin(actor);
    const query = search.trim();
    const vxId = normalizeVxIdSearch(query);
    const searchFilters: Prisma.UserProfileWhereInput[] = query ? [
      { user: { displayName: { contains: query, mode: "insensitive" } } },
      { user: { email: { contains: query, mode: "insensitive" } } },
      ...(vxId ? [{ user: { vxId } }] : []),
      ...(/^[0-9a-f-]{8,}$/i.test(query) ? [{ userId: query }] : []),
    ] : [];
    const profiles = await this.database.userProfile.findMany({
      where: {
        productRole: { in: [...ADMIN_MESSENGER_ROLES] },
        contactVerificationStatus: "VERIFIED",
        user: { disabledAt: null },
        ...(tagId ? { user: { disabledAt: null, adminTagAssignments: { some: { tagId } } } } : {}),
        ...(query ? { OR: searchFilters } : {}),
      },
      include: { user: { include: { adminTagAssignments: { include: { tag: true }, orderBy: { tag: { name: "asc" } } } } }, market: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const items: AdminMessengerList["items"] = [];
    for (const profile of profiles) {
      const ensured = await ensurePersonalConversationRecord(this.database, this.protector, profile.userId);
      const conversation = await this.database.supportConversation.findUniqueOrThrow({
        where: { id: ensured.id },
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { internalNotes: true } },
        },
      });
      const hasInboundUserMessage = await this.database.supportMessage.count({
        where: { conversationId: conversation.id, authorType: "USER" },
      });
      const archived = hasInboundUserMessage === 0 || conversation.status === "CLOSED";
      if (scope === "active" && archived) continue;
      if (scope === "archive" && !archived) continue;
      const readAt = adminReadAt(conversation.context, actor.userId);
      const unreadCount = await this.database.supportMessage.count({
        where: {
          conversationId: conversation.id,
          authorType: "USER",
          ...(readAt ? { createdAt: { gt: readAt } } : {}),
        },
      });
      const last = conversation.messages[0];
      const lastMessage = last
        ? decoder.decode(await this.protector.decrypt(last.bodyProtected as unknown as EncryptedPayload, {
          classification: "confidential",
          purpose: "support-message",
          resourceType: "SupportConversation",
          resourceId: conversation.id,
        }))
        : "Диалог создан";
      items.push({
        userId: profile.userId,
        vxId: profile.user.vxId,
        conversationId: conversation.id,
        name: profile.user.displayName || "Участник VX House",
        email: profile.user.email,
        avatarEmoji: profile.user.avatarEmoji,
        market: profile.market.name,
        role: profile.productRole,
        registeredAt: profile.user.createdAt.toISOString(),
        online: Boolean(profile.user.updatedAt && Date.now() - profile.user.updatedAt.getTime() < 15 * 60_000),
        lastMessage: lastMessage.replace(/\s+/g, " ").trim(),
        lastMessageAt: last?.createdAt.toISOString() ?? null,
        unreadCount,
        hasNotes: conversation._count.internalNotes > 0,
        tags: profile.user.adminTagAssignments.map(({ tag }) => ({ id: tag.id, name: tag.name })),
      });
    }

    items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    const tags = await this.database.adminTag.findMany({ include: { _count: { select: { assignments: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return {
      items,
      unreadCount: items.reduce((sum, item) => sum + item.unreadCount, 0),
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString(), userCount: tag._count.assignments })),
    };
  }

  async detail(actor: AuthenticatedPrincipal, conversationId: string): Promise<AdminMessengerDetail> {
    requireAdmin(actor);
    const record = await this.conversationRecord(conversationId);
    if (!record || !isAdminMessengerRole(record.user.profile?.productRole ?? "")) {
      throw new ApplicationError("NOT_FOUND", "Диалог участника не найден");
    }
    if (record.user.profile?.contactVerificationStatus !== "VERIFIED") {
      throw new ApplicationError("NOT_FOUND", "Диалог участника не найден");
    }
    const activeItem = (await this.list(actor, record.user.email, "active")).items.find((item) => item.conversationId === conversationId);
    const listItem = activeItem ?? (await this.list(actor, record.user.email, "archive")).items.find((item) => item.conversationId === conversationId);
    if (!listItem) throw new ApplicationError("NOT_FOUND", "Диалог участника не найден");
    return {
      player: {
        ...listItem,
        profileHref: `/admin/users/${record.userId}`,
      },
      conversation: await this.conversationView(record),
      notes: await this.noteViews(record.internalNotes),
    };
  }

  async markRead(actor: AuthenticatedPrincipal, conversationId: string) {
    requireAdmin(actor);
    const conversation = await this.database.supportConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new ApplicationError("NOT_FOUND", "Диалог не найден");
    const context = object(conversation.context);
    const reads = object(context.adminMessengerReads as Prisma.JsonValue);
    await this.database.supportConversation.update({
      where: { id: conversationId },
      data: {
        context: { ...context, adminMessengerReads: { ...reads, [actor.userId]: new Date().toISOString() } } as Prisma.InputJsonValue,
        updatedAt: conversation.updatedAt,
      },
    });
    return { ok: true };
  }

  async sendMessage(actor: AuthenticatedPrincipal, conversationId: string, body: string) {
    requireAdmin(actor);
    const text = cleanText(body);
    await this.transactions.run(async ({ database, occurredAt }) => {
      const conversation = await database.supportConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) throw new ApplicationError("NOT_FOUND", "Диалог не найден");
      const protectedBody = await this.encrypt(text, "support-message", conversationId);
      const message = await database.supportMessage.create({
        data: { conversationId, authorType: "OPERATOR", authorId: actor.userId, bodyProtected: protectedBody as never, createdAt: occurredAt },
      });
      await database.supportConversation.update({ where: { id: conversationId }, data: { updatedAt: occurredAt } });
      await createTransactionalEventServices(database, occurredAt).audit.record({
        actor: { type: "user", id: actor.userId, sessionId: actor.sessionId },
        action: "admin.messenger.message.sent",
        target: { type: "support-conversation", id: conversationId },
        metadata: { messageId: message.id },
      });
    });
    return this.detail(actor, conversationId);
  }

  async addAttachment(actor: AuthenticatedPrincipal, conversationId: string, messageId: string, file: File) {
    requireAdmin(actor);
    if (!allowedTypes.has(file.type)) throw new ApplicationError("VALIDATION", "Разрешены JPG, PNG, WEBP и PDF");
    if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new ApplicationError("VALIDATION", "Размер файла не должен превышать 10 МБ");
    const message = await this.database.supportMessage.findFirst({ where: { id: messageId, conversationId, authorId: actor.userId, authorType: "OPERATOR" } });
    if (!message) throw new ApplicationError("FORBIDDEN", "Файл можно добавить только к своему сообщению");
    const id = randomUUID();
    const fileName = file.name.trim().replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 240) || "attachment";
    const contentProtected = await this.protector.encrypt(new Uint8Array(await file.arrayBuffer()), {
      classification: "confidential", purpose: "support-attachment", resourceType: "SupportAttachment", resourceId: id,
    });
    return this.database.supportAttachment.create({ data: { id, messageId, fileName, mediaType: file.type, sizeBytes: file.size, contentProtected: contentProtected as never } });
  }

  async getAttachment(actor: AuthenticatedPrincipal, conversationId: string, attachmentId: string) {
    requireAdmin(actor);
    const attachment = await this.database.supportAttachment.findFirst({ where: { id: attachmentId, message: { conversationId } } });
    if (!attachment) throw new ApplicationError("NOT_FOUND", "Файл не найден");
    const bytes = await this.protector.decrypt(attachment.contentProtected as unknown as EncryptedPayload, {
      classification: "confidential", purpose: "support-attachment", resourceType: "SupportAttachment", resourceId: attachment.id,
    });
    return { ...attachment, bytes };
  }

  async note(actor: AuthenticatedPrincipal, conversationId: string, input: { action: "create" | "edit" | "delete"; logicalId?: string; body?: string }) {
    requireAdmin(actor);
    await this.transactions.run(async ({ database, occurredAt }) => {
      const conversation = await database.supportConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) throw new ApplicationError("NOT_FOUND", "Диалог не найден");
      const logicalId = input.action === "create" ? randomUUID() : String(input.logicalId ?? "");
      if (!logicalId) throw new ApplicationError("VALIDATION", "Заметка не найдена");
      const body = input.action === "delete" ? "" : cleanText(input.body, 1, 3000);
      const envelope = JSON.stringify({ messengerNote: 1, logicalId, action: input.action, body });
      await database.supportInternalNote.create({
        data: {
          conversationId,
          authorId: actor.userId,
          bodyProtected: await this.encrypt(envelope, "support-internal-note", conversationId) as never,
          createdAt: occurredAt,
        },
      });
      await createTransactionalEventServices(database, occurredAt).audit.record({
        actor: { type: "user", id: actor.userId, sessionId: actor.sessionId },
        action: `admin.messenger.note.${input.action}`,
        target: { type: "support-conversation", id: conversationId },
        metadata: { logicalId },
      });
    });
    return this.detail(actor, conversationId);
  }

  async conversationRecord(conversationId: string) {
    return this.database.supportConversation.findUnique({
      where: { id: conversationId },
      include: {
        categoryDefinition: true,
        user: { include: { profile: { include: { market: true } }, adminTagAssignments: { include: { tag: true } } } },
        messages: { include: { author: true, attachments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
        internalNotes: { include: { author: true }, orderBy: { createdAt: "asc" } },
        statusHistory: { orderBy: { occurredAt: "asc" } },
        appeals: { include: { statusHistory: { orderBy: { occurredAt: "asc" } } } },
      },
    });
  }

  private async conversationView(item: NonNullable<ConversationRecord>): Promise<SupportConversationView> {
    const context = object(item.context);
    const readValue = context.playerMessengerReadAt;
    const readAt = typeof readValue === "string" && Number.isFinite(new Date(readValue).getTime()) ? new Date(readValue) : null;
    const locale = databaseLocale(item.user.profile?.preferredLanguage ?? "EN");
    return {
      id: item.id,
      category: { key: item.categoryDefinition.key, title: item.categoryDefinition.title, description: item.categoryDefinition.description },
      priority: item.priority,
      status: item.status,
      subject: item.subject,
      context,
      unreadCount: item.messages.filter((message) => message.authorType !== "USER" && (!readAt || message.createdAt > readAt)).length,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      messages: await Promise.all(item.messages.map(async (message) => {
        const raw = decoder.decode(await this.protector.decrypt(message.bodyProtected as unknown as EncryptedPayload, {
          classification: "confidential", purpose: "support-message", resourceType: "SupportConversation", resourceId: item.id,
        }));
        const system = message.authorType === "SYSTEM" ? decodeSystemMessage(raw) : null;
        return { id: message.id, authorType: message.authorType, authorLabel: message.authorType === "USER" ? item.user.displayName || "Игрок" : message.author?.displayName || (message.authorType === "SYSTEM" ? "VX House" : "Менеджер"), body: system ? renderSystemMessage(locale, system.key, system.params) : raw, ...(system ? { systemKey: system.key, systemParams: system.params } : {}), createdAt: message.createdAt.toISOString(), attachments: message.attachments.map(({ id, fileName, mediaType, sizeBytes }) => ({ id, fileName, mediaType, sizeBytes })) };
      })),
      history: item.statusHistory.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() })),
      appeals: [],
    };
  }

  private async noteViews(rows: NonNullable<ConversationRecord>["internalNotes"]): Promise<AdminMessengerNote[]> {
    const current = new Map<string, AdminMessengerNote>();
    for (const row of rows) {
      const raw = decoder.decode(await this.protector.decrypt(row.bodyProtected as unknown as EncryptedPayload, {
        classification: "confidential", purpose: "support-internal-note", resourceType: "SupportConversation", resourceId: row.conversationId,
      }));
      let envelope: { logicalId: string; action: string; body: string } | null = null;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.messengerNote === 1) envelope = { logicalId: String(parsed.logicalId), action: String(parsed.action), body: String(parsed.body ?? "") };
      } catch {}
      const logicalId = envelope?.logicalId ?? row.id;
      if (envelope?.action === "delete") {
        current.delete(logicalId);
        continue;
      }
      const previous = current.get(logicalId);
      current.set(logicalId, {
        id: row.id,
        logicalId,
        body: envelope?.body ?? raw,
        author: row.author.displayName || row.author.email,
        createdAt: previous?.createdAt ?? row.createdAt.toISOString(),
        modifiedAt: previous ? row.createdAt.toISOString() : null,
        edited: Boolean(previous),
      });
    }
    return [...current.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private encrypt(value: string, purpose: "support-message" | "support-internal-note", resourceId: string) {
    return this.protector.encrypt(encoder.encode(value), {
      classification: "confidential", purpose, resourceType: "SupportConversation", resourceId,
    });
  }
}
