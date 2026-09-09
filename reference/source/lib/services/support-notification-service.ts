import "server-only";

import { randomUUID } from "node:crypto";
import type { AuthenticatedPrincipal } from "@/lib/auth";
import { ApplicationError, hashCommandPayload, PrismaTransactionRunner } from "@/lib/application";
import type { AesGcmDataProtector, EncryptedPayload } from "@/lib/data-protection";
import type { PrismaClient } from "@/lib/db";
import { assertTransition, appealStateMachine, supportStateMachine } from "@/lib/domain";
import { databaseLocale, decodeSystemMessage, renderSystemMessage } from "@/lib/i18n";
import { PrismaIdempotencyRepository, PrismaSupportNotificationRepository } from "@/lib/repositories";
import type { AppealStatus, AppealView, CreateAppealInput, CreateConversationInput, NotificationView, SupportConversationView, SupportStatus } from "@/lib/support";
import { ensurePersonalConversationRecord } from "./personal-conversation";

const encoder = new TextEncoder(); const decoder = new TextDecoder();
const keyPattern = /^[A-Za-z0-9_.:-]{8,160}$/;
function requireKey(key: string) { if (!keyPattern.test(key)) throw new ApplicationError("VALIDATION", "Некорректный ключ идемпотентности"); }
function requirePermission(actor: AuthenticatedPrincipal, key: string) { if (!actor.permissionKeys.includes(key)) throw new ApplicationError("FORBIDDEN", "Недостаточно прав"); }
function text(value: string, min: number, max: number, label: string) { const result = value.trim(); if (result.length < min || result.length > max) throw new ApplicationError("VALIDATION", `Поле «${label}» заполнено некорректно`); return result; }
function profileAllowed(profile: Awaited<ReturnType<PrismaSupportNotificationRepository["findProfile"]>>) { if (!profile || !profile.market.isActive || profile.accountStatus === "SUSPENDED" || profile.accountStatus === "CLOSED") throw new ApplicationError("FORBIDDEN", "Сервис недоступен для профиля"); return profile; }
function history<T extends string>(items: Array<{ id: string; fromStatus: T | null; toStatus: T; reason: string; occurredAt: Date }>) { return items.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })); }
function conversationContext(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function playerReadAt(value: unknown) { const raw = conversationContext(value).playerMessengerReadAt; if (typeof raw !== "string") return null; const date = new Date(raw); return Number.isFinite(date.getTime()) ? date : null; }

type ConversationRecord = NonNullable<Awaited<ReturnType<PrismaSupportNotificationRepository["findConversation"]>>>;
type AppealRecord = NonNullable<Awaited<ReturnType<PrismaSupportNotificationRepository["findAppeal"]>>>;
type NotificationRecord = NonNullable<Awaited<ReturnType<PrismaSupportNotificationRepository["findNotification"]>>>;

export class SupportNotificationApplicationService {
  private readonly transactions: PrismaTransactionRunner;
  constructor(private readonly database: PrismaClient, private readonly protector: AesGcmDataProtector) { this.transactions = new PrismaTransactionRunner(database); }

  async listCategories(principal: AuthenticatedPrincipal) { const repository = new PrismaSupportNotificationRepository(this.database); const profile = profileAllowed(await repository.findProfile(principal.userId)); return (await repository.listCategories(profile.productRole, profile.market.id)).map(({ key, title, description }) => ({ key, title, description })); }
  async listConversations(principal: AuthenticatedPrincipal) { const repository = new PrismaSupportNotificationRepository(this.database); profileAllowed(await repository.findProfile(principal.userId)); return Promise.all((await repository.listConversations(principal.userId)).map((item) => this.conversationView(item))); }
  async getConversation(principal: AuthenticatedPrincipal, id: string) { const repository = new PrismaSupportNotificationRepository(this.database); profileAllowed(await repository.findProfile(principal.userId)); const item = await repository.findConversation(id, principal.userId); if (!item) throw new ApplicationError("NOT_FOUND", "Обращение не найдено"); return this.conversationView(item); }
  async getPersonalConversation(principal: AuthenticatedPrincipal) {
    const repository = new PrismaSupportNotificationRepository(this.database);
    profileAllowed(await repository.findProfile(principal.userId));
    const conversation = await ensurePersonalConversationRecord(this.database, this.protector, principal.userId);
    return this.conversationView((await repository.findConversation(conversation.id, principal.userId))!);
  }

  async markConversationRead(principal: AuthenticatedPrincipal, id: string) {
    const repository = new PrismaSupportNotificationRepository(this.database);
    profileAllowed(await repository.findProfile(principal.userId));
    const conversation = await repository.findConversation(id, principal.userId);
    if (!conversation) throw new ApplicationError("NOT_FOUND", "Диалог не найден");
    const context = conversationContext(conversation.context);
    await this.database.supportConversation.update({
      where: { id },
      data: { context: { ...context, playerMessengerReadAt: new Date().toISOString() }, updatedAt: conversation.updatedAt },
    });
    return this.conversationView((await repository.findConversation(id, principal.userId))!);
  }

  createConversation(principal: AuthenticatedPrincipal, input: CreateConversationInput, idempotencyKey: string) {
    requireKey(idempotencyKey); if (!["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(input.priority)) throw new ApplicationError("VALIDATION", "Некорректный приоритет"); const clean = { ...input, subject: text(input.subject, 3, 240, "Тема"), body: text(input.body, 1, 5000, "Сообщение") };
    return this.transactions.run(async ({ database, occurredAt }) => {
      const repository = new PrismaSupportNotificationRepository(database); const receipts = new PrismaIdempotencyRepository(database); const requestHash = hashCommandPayload(clean); const replay = await receipts.find("support.create", idempotencyKey);
      if (replay) { if (replay.actorId !== principal.userId || replay.requestHash !== requestHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого обращения"); const stored = await repository.findConversation(replay.resultId, principal.userId); if (!stored) throw new ApplicationError("NOT_FOUND", "Обращение не найдено"); return this.conversationView(stored); }
      const profile = profileAllowed(await repository.findProfile(principal.userId)); const category = await repository.findCategory(clean.category);
      if (!category || !category.isActive || (category.marketId && category.marketId !== profile.market.id) || !Array.isArray(category.roles) || !category.roles.includes(profile.productRole)) throw new ApplicationError("FORBIDDEN", "Категория недоступна для роли и рынка");
      if ((clean.relatedType && !clean.relatedId) || (!clean.relatedType && clean.relatedId)) throw new ApplicationError("VALIDATION", "Связанный контекст указан не полностью");
      if (clean.relatedType === "USER_TASK" && !(await database.userTask.findFirst({ where: { id: clean.relatedId, userId: principal.userId }, select: { id: true } }))) throw new ApplicationError("NOT_FOUND", "Связанное задание не найдено");
      if (clean.relatedType === "REWARD" && !(await database.vXReward.findFirst({ where: { id: clean.relatedId, userId: principal.userId }, select: { id: true } }))) throw new ApplicationError("NOT_FOUND", "Связанный Reward не найден");
      const context = { role: profile.productRole, market: profile.market.code, relatedType: clean.relatedType ?? null, relatedId: clean.relatedId ?? null };
      const conversation = await database.supportConversation.create({ data: { userId: principal.userId, category: category.key, priority: clean.priority, status: "CREATED", subject: clean.subject, context }, select: { id: true } });
      const bodyProtected = await this.protector.encrypt(encoder.encode(clean.body), { classification: "confidential", purpose: "support-message", resourceType: "SupportConversation", resourceId: conversation.id });
      await database.supportMessage.create({ data: { conversationId: conversation.id, authorType: "USER", authorId: principal.userId, bodyProtected: bodyProtected as never, createdAt: occurredAt } });
      await database.supportStatusHistory.create({ data: { conversationId: conversation.id, fromStatus: null, toStatus: "CREATED", actorId: principal.userId, reason: "Пользователь создал обращение", occurredAt } });
      if (category.key === "appeal" && clean.relatedType && clean.relatedId) {
        if (clean.relatedType === "USER_TASK") { const task = await database.userTask.findFirst({ where: { id: clean.relatedId, userId: principal.userId }, select: { status: true } }); if (!task || task.status !== "REJECTED") throw new ApplicationError("CONFLICT", "Апелляция доступна только для отклонённого задания"); }
        if (clean.relatedType === "REWARD") { const reward = await database.vXReward.findFirst({ where: { id: clean.relatedId, userId: principal.userId }, select: { status: true } }); if (!reward || !["REJECTED", "CANCELLED", "EXPIRED"].includes(reward.status)) throw new ApplicationError("CONFLICT", "Reward не допускает апелляцию в текущем статусе"); }
        const duplicate = await database.appeal.findFirst({ where: { userId: principal.userId, ...(clean.relatedType === "USER_TASK" ? { userTaskId: clean.relatedId } : { rewardId: clean.relatedId }), status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] } }, select: { id: true } }); if (duplicate) throw new ApplicationError("CONFLICT", "По этому решению уже есть активная апелляция");
        const appeal = await database.appeal.create({ data: { userId: principal.userId, conversationId: conversation.id, ...(clean.relatedType === "USER_TASK" ? { userTaskId: clean.relatedId } : { rewardId: clean.relatedId }), status: "DRAFT", reason: clean.body }, select: { id: true } });
        await database.appealStatusHistory.create({ data: { appealId: appeal.id, fromStatus: null, toStatus: "DRAFT", actorId: principal.userId, reason: "Апелляция создана вместе с обращением", occurredAt } });
        await database.appeal.update({ where: { id: appeal.id }, data: { status: "SUBMITTED", submittedAt: occurredAt } });
        await database.appealStatusHistory.create({ data: { appealId: appeal.id, fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: principal.userId, reason: "Апелляция отправлена на проверку", occurredAt } });
      }
      await receipts.create({ operation: "support.create", key: idempotencyKey, actorId: principal.userId, requestHash, resultType: "SupportConversation", resultId: conversation.id, createdAt: occurredAt });
      return this.conversationView((await repository.findConversation(conversation.id, principal.userId))!);
    });
  }

  sendMessage(principal: AuthenticatedPrincipal, conversationId: string, body: string, idempotencyKey: string) {
    requireKey(idempotencyKey); const cleanBody = text(body, 1, 5000, "Сообщение");
    return this.transactions.run(async ({ database, occurredAt }) => {
      const repository = new PrismaSupportNotificationRepository(database); const receipts = new PrismaIdempotencyRepository(database); const requestHash = hashCommandPayload({ conversationId, body: cleanBody }); const replay = await receipts.find("support.message", idempotencyKey);
      if (replay) { if (replay.actorId !== principal.userId || replay.requestHash !== requestHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого сообщения"); const stored = await repository.findConversation(conversationId, principal.userId); if (!stored) throw new ApplicationError("NOT_FOUND", "Обращение не найдено"); return this.conversationView(stored); }
      const conversation = await repository.findConversation(conversationId, principal.userId); if (!conversation) throw new ApplicationError("NOT_FOUND", "Обращение не найдено"); if (conversation.status === "CLOSED") throw new ApplicationError("CONFLICT", "Закрытое обращение не принимает сообщения");
      const bodyProtected = await this.protector.encrypt(encoder.encode(cleanBody), { classification: "confidential", purpose: "support-message", resourceType: "SupportConversation", resourceId: conversation.id });
      const message = await database.supportMessage.create({ data: { conversationId, authorType: "USER", authorId: principal.userId, bodyProtected: bodyProtected as never, createdAt: occurredAt }, select: { id: true } });
      let next = conversation.status; if (conversation.status === "WAITING_USER" || conversation.status === "RESOLVED") next = "WAITING_OPERATOR";
      if (next !== conversation.status) { assertTransition(supportStateMachine, conversation.status, next); await database.supportConversation.update({ where: { id: conversationId }, data: { status: next, updatedAt: occurredAt } }); await database.supportStatusHistory.create({ data: { conversationId, fromStatus: conversation.status, toStatus: next, actorId: principal.userId, reason: "Пользователь отправил сообщение", occurredAt } }); } else await database.supportConversation.update({ where: { id: conversationId }, data: { updatedAt: occurredAt } });
      await receipts.create({ operation: "support.message", key: idempotencyKey, actorId: principal.userId, requestHash, resultType: "SupportMessage", resultId: message.id, createdAt: occurredAt });
      return this.conversationView((await repository.findConversation(conversationId, principal.userId))!);
    });
  }

  async addAttachment(principal: AuthenticatedPrincipal, conversationId: string, messageId: string, file: File) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) throw new ApplicationError("VALIDATION", "Разрешены JPG, PNG, WEBP и PDF");
    if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new ApplicationError("VALIDATION", "Размер файла не должен превышать 10 МБ");
    const fileName = file.name.trim().replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 240) || "attachment";
    const conversation = await new PrismaSupportNotificationRepository(this.database).findConversation(conversationId, principal.userId);
    if (!conversation || conversation.status === "CLOSED") throw new ApplicationError("NOT_FOUND", "Диалог недоступен");
    const message = conversation.messages.find((item) => item.id === messageId && item.authorId === principal.userId);
    if (!message) throw new ApplicationError("FORBIDDEN", "Файл можно добавить только к своему сообщению");
    const id = randomUUID();
    const contentProtected = await this.protector.encrypt(new Uint8Array(await file.arrayBuffer()), { classification: "confidential", purpose: "support-attachment", resourceType: "SupportAttachment", resourceId: id });
    await this.database.supportAttachment.create({ data: { id, messageId, fileName, mediaType: file.type, sizeBytes: file.size, contentProtected: contentProtected as never } });
    return { id, fileName, mediaType: file.type, sizeBytes: file.size };
  }

  async getAttachment(principal: AuthenticatedPrincipal, attachmentId: string) {
    const attachment = await new PrismaSupportNotificationRepository(this.database).findAttachment(attachmentId, principal.userId);
    if (!attachment) throw new ApplicationError("NOT_FOUND", "Файл не найден");
    const bytes = await this.protector.decrypt(attachment.contentProtected as unknown as EncryptedPayload, { classification: "confidential", purpose: "support-attachment", resourceType: "SupportAttachment", resourceId: attachment.id });
    return { bytes, fileName: attachment.fileName, mediaType: attachment.mediaType };
  }

  transitionConversation(actor: AuthenticatedPrincipal, conversationId: string, target: SupportStatus, reason: string) { requirePermission(actor, "support.write"); return this.transactions.run(async ({ database, occurredAt }) => { const item = await database.supportConversation.findUnique({ where: { id: conversationId } }); if (!item) throw new ApplicationError("NOT_FOUND", "Обращение не найдено"); try { assertTransition(supportStateMachine, item.status, target); } catch { throw new ApplicationError("CONFLICT", "Переход статуса недоступен"); } await database.supportConversation.update({ where: { id: item.id }, data: { status: target, closedAt: target === "CLOSED" ? occurredAt : null } }); await database.supportStatusHistory.create({ data: { conversationId: item.id, fromStatus: item.status, toStatus: target, actorId: actor.userId, reason: text(reason, 3, 500, "Причина"), occurredAt } }); }); }

  createAppeal(principal: AuthenticatedPrincipal, input: CreateAppealInput, idempotencyKey: string) {
    requireKey(idempotencyKey); if (Boolean(input.userTaskId) === Boolean(input.rewardId)) throw new ApplicationError("VALIDATION", "Укажите одно задание или один Reward"); const reason = text(input.reason, 10, 5000, "Причина");
    return this.transactions.run(async ({ database, occurredAt }) => {
      const repository = new PrismaSupportNotificationRepository(database); const receipts = new PrismaIdempotencyRepository(database); const requestHash = hashCommandPayload({ ...input, reason }); const replay = await receipts.find("appeal.create", idempotencyKey);
      if (replay) { if (replay.actorId !== principal.userId || replay.requestHash !== requestHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другой апелляции"); const stored = await repository.findAppeal(replay.resultId, principal.userId); if (!stored) throw new ApplicationError("NOT_FOUND", "Апелляция не найдена"); return this.appealView(stored); }
      profileAllowed(await repository.findProfile(principal.userId));
      if (input.userTaskId) { const task = await database.userTask.findFirst({ where: { id: input.userTaskId, userId: principal.userId }, select: { status: true } }); if (!task || task.status !== "REJECTED") throw new ApplicationError("CONFLICT", "Апелляция доступна только для отклонённого задания владельца"); }
      if (input.rewardId) { const reward = await database.vXReward.findFirst({ where: { id: input.rewardId, userId: principal.userId }, select: { status: true } }); if (!reward || !["REJECTED", "CANCELLED", "EXPIRED"].includes(reward.status)) throw new ApplicationError("CONFLICT", "Reward не допускает апелляцию в текущем статусе"); }
      if (input.conversationId && !(await repository.findConversation(input.conversationId, principal.userId))) throw new ApplicationError("NOT_FOUND", "Связанное обращение не найдено");
      const duplicate = await database.appeal.findFirst({ where: { userId: principal.userId, ...(input.userTaskId ? { userTaskId: input.userTaskId } : { rewardId: input.rewardId }), status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] } }, select: { id: true } }); if (duplicate) throw new ApplicationError("CONFLICT", "По этому решению уже есть активная апелляция");
      const appeal = await database.appeal.create({ data: { userId: principal.userId, conversationId: input.conversationId, userTaskId: input.userTaskId, rewardId: input.rewardId, status: "DRAFT", reason }, select: { id: true } });
      await database.appealStatusHistory.create({ data: { appealId: appeal.id, fromStatus: null, toStatus: "DRAFT", actorId: principal.userId, reason: "Апелляция создана", occurredAt } });
      assertTransition(appealStateMachine, "DRAFT", "SUBMITTED"); await database.appeal.update({ where: { id: appeal.id }, data: { status: "SUBMITTED", submittedAt: occurredAt } }); await database.appealStatusHistory.create({ data: { appealId: appeal.id, fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: principal.userId, reason: "Апелляция отправлена на проверку", occurredAt } });
      await receipts.create({ operation: "appeal.create", key: idempotencyKey, actorId: principal.userId, requestHash, resultType: "Appeal", resultId: appeal.id, createdAt: occurredAt }); return this.appealView((await repository.findAppeal(appeal.id, principal.userId))!);
    });
  }

  transitionAppeal(actor: AuthenticatedPrincipal, appealId: string, target: AppealStatus, reason: string) { requirePermission(actor, "appeals.write"); return this.transactions.run(async ({ database, occurredAt }) => { const item = await database.appeal.findUnique({ where: { id: appealId } }); if (!item) throw new ApplicationError("NOT_FOUND", "Апелляция не найдена"); try { assertTransition(appealStateMachine, item.status, target); } catch { throw new ApplicationError("CONFLICT", "Переход апелляции недоступен"); } const decision = ["UPHELD", "PARTIALLY_UPHELD", "DENIED"].includes(target); const cleanReason = text(reason, 3, 1000, "Причина"); await database.appeal.update({ where: { id: item.id }, data: { status: target, reviewerId: actor.userId, decisionReason: decision ? cleanReason : item.decisionReason, decidedAt: decision ? occurredAt : item.decidedAt } }); await database.appealStatusHistory.create({ data: { appealId: item.id, fromStatus: item.status, toStatus: target, actorId: actor.userId, reason: cleanReason, occurredAt } }); }); }

  async listNotifications(principal: AuthenticatedPrincipal) { const repository = new PrismaSupportNotificationRepository(this.database); profileAllowed(await repository.findProfile(principal.userId)); return (await repository.listNotifications(principal.userId)).map((item) => this.notificationView(item)); }
  createNotification(actor: AuthenticatedPrincipal, input: { userId: string; category: string; title: string; body: string; relatedType?: string; relatedId?: string }, idempotencyKey: string) { requirePermission(actor, "notifications.write"); requireKey(idempotencyKey); return this.transactions.run(async ({ database, occurredAt }) => { const repository = new PrismaSupportNotificationRepository(database); const receipts = new PrismaIdempotencyRepository(database); const clean = { ...input, category: text(input.category, 2, 120, "Категория"), title: text(input.title, 3, 240, "Заголовок"), body: text(input.body, 1, 5000, "Текст") }; const requestHash = hashCommandPayload(clean); const replay = await receipts.find("notification.create", idempotencyKey); if (replay) { if (replay.actorId !== actor.userId || replay.requestHash !== requestHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого уведомления"); const stored = await repository.findNotification(replay.resultId, input.userId); if (!stored) throw new ApplicationError("NOT_FOUND", "Уведомление не найдено"); return this.notificationView(stored); } profileAllowed(await repository.findProfile(input.userId)); const notification = await database.notification.create({ data: { userId: input.userId, type: clean.category, channel: "IN_APP", status: "SENT", title: clean.title, body: clean.body, relatedType: clean.relatedType, relatedId: clean.relatedId, idempotencyKey, sentAt: occurredAt }, select: { id: true } }); await database.notificationStatusHistory.create({ data: { notificationId: notification.id, fromStatus: null, toStatus: "SENT", actorId: actor.userId, reason: "Сервер создал уведомление", occurredAt } }); await receipts.create({ operation: "notification.create", key: idempotencyKey, actorId: actor.userId, requestHash, resultType: "Notification", resultId: notification.id, createdAt: occurredAt }); return this.notificationView((await repository.findNotification(notification.id, input.userId))!); }); }
  markNotificationRead(principal: AuthenticatedPrincipal, id: string, idempotencyKey: string) { requireKey(idempotencyKey); return this.transactions.run(async ({ database, occurredAt }) => { const repository = new PrismaSupportNotificationRepository(database); const receipts = new PrismaIdempotencyRepository(database); const requestHash = hashCommandPayload({ id }); const replay = await receipts.find("notification.read", idempotencyKey); if (replay) { if (replay.actorId !== principal.userId || replay.requestHash !== requestHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого уведомления"); const stored = await repository.findNotification(replay.resultId, principal.userId); if (!stored) throw new ApplicationError("NOT_FOUND", "Уведомление не найдено"); return this.notificationView(stored); } const item = await repository.findNotification(id, principal.userId); if (!item) throw new ApplicationError("NOT_FOUND", "Уведомление не найдено"); if (item.status !== "READ") { if (item.status !== "SENT") throw new ApplicationError("CONFLICT", "Уведомление нельзя отметить прочитанным"); await database.notification.update({ where: { id }, data: { status: "READ", readAt: occurredAt } }); await database.notificationStatusHistory.create({ data: { notificationId: id, fromStatus: "SENT", toStatus: "READ", actorId: principal.userId, reason: "Пользователь открыл уведомление", occurredAt } }); } await receipts.create({ operation: "notification.read", key: idempotencyKey, actorId: principal.userId, requestHash, resultType: "Notification", resultId: id, createdAt: occurredAt }); return this.notificationView((await repository.findNotification(id, principal.userId))!); }); }

  private async conversationView(item: ConversationRecord): Promise<SupportConversationView> {
    const context = conversationContext(item.context);
    const readAt = playerReadAt(context);
    const profile = await this.database.userProfile.findUnique({ where: { userId: item.userId }, select: { preferredLanguage: true } });
    const locale = databaseLocale(profile?.preferredLanguage ?? "EN");
    const unreadCount = item.messages.filter((message) => message.authorType !== "USER" && (!readAt || message.createdAt > readAt)).length;
    return { id: item.id, category: { key: item.categoryDefinition.key, title: item.categoryDefinition.title, description: item.categoryDefinition.description }, priority: item.priority, status: item.status, subject: item.subject, context, unreadCount, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), messages: await Promise.all(item.messages.map(async (message) => {
      const raw = decoder.decode(await this.protector.decrypt(message.bodyProtected as unknown as EncryptedPayload, { classification: "confidential", purpose: "support-message", resourceType: "SupportConversation", resourceId: item.id }));
      const system = message.authorType === "SYSTEM" ? decodeSystemMessage(raw) : null;
      return { id: message.id, authorType: message.authorType, authorLabel: message.authorType === "USER" ? "Вы" : message.author?.displayName ?? (message.authorType === "SYSTEM" ? "VX House" : "Ваш менеджер"), body: system ? renderSystemMessage(locale, system.key, system.params) : raw, ...(system ? { systemKey: system.key, systemParams: system.params } : {}), createdAt: message.createdAt.toISOString(), attachments: message.attachments.map(({ id, fileName, mediaType, sizeBytes }) => ({ id, fileName, mediaType, sizeBytes })) };
    })), history: history(item.statusHistory), appeals: item.appeals.map((appeal) => this.appealView(appeal)) };
  }
  private appealView(item: AppealRecord): AppealView { return { id: item.id, status: item.status, reason: item.reason, decisionReason: item.decisionReason, userTaskId: item.userTaskId, rewardId: item.rewardId, createdAt: item.createdAt.toISOString(), submittedAt: item.submittedAt?.toISOString() ?? null, decidedAt: item.decidedAt?.toISOString() ?? null, history: history(item.statusHistory) }; }
  private notificationView(item: NotificationRecord): NotificationView { return { id: item.id, category: item.type, status: item.status, title: item.title, body: item.body, relatedType: item.relatedType, relatedId: item.relatedId, createdAt: item.createdAt.toISOString(), sentAt: item.sentAt?.toISOString() ?? null, readAt: item.readAt?.toISOString() ?? null, history: history(item.statusHistory) }; }
}
