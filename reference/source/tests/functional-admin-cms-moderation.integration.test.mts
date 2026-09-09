import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";

import { ApplicationError } from "../lib/application/index.ts";
import type { AuthenticatedPrincipal } from "../lib/auth/index.ts";
import { AesGcmDataProtector } from "../lib/data-protection/index.ts";
import type { PrismaClient } from "../lib/db/generated/client.ts";
import { PrismaClient as NodePrismaClient } from "../lib/db/generated-node/client.ts";
import { AdminApplicationService, AdminMessengerService, AdminTagService } from "../lib/services/index.ts";

const connectionString = process.env.TEST_DATABASE_URL; if (!connectionString) throw new Error("TEST_DATABASE_URL обязателен");
const database = new NodePrismaClient({ adapter: new PrismaPg({ connectionString }) }) as unknown as PrismaClient;
const protector = new AesGcmDataProtector("test-key", Buffer.alloc(32, 11).toString("base64url"));
const service = new AdminApplicationService(database, protector);
const messenger = new AdminMessengerService(database, protector);
const tags = new AdminTagService(database);
const permissions = ["admin.dashboard.read", "users.read", "users.write", "users.role.write", "users.partner.approve", "content.read", "content.write", "content.publish", "moderation.read", "moderation.write", "support.admin", "support.write", "appeals.write", "economy.admin", "economy.write", "notifications.write", "audit.read"];
let admin: AuthenticatedPrincipal; let playerId: string; let partnerId: string; let marketId: string;

async function createProductUser(email: string, role: "PLAYER" | "PARTNER") { const user = await database.user.create({ data: { email, displayName: role === "PLAYER" ? "Тестовый игрок" : "Тестовый партнёр", profile: { create: { productRole: role, marketId, preferredLanguage: "RU", contactVerificationStatus: "VERIFIED", accountStatus: role === "PLAYER" ? "ACTIVE" : "PENDING", ...(role === "PLAYER" ? { playerProfile: { create: { participationStatus: "ACTIVE" } } } : { partnerProfile: { create: { status: "PENDING" } } }) } } } }); return user.id; }

describe("Functional Integration Module 5", { concurrency: false }, () => {
beforeEach(async () => {
  await database.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "AdminTag", "User", "Market", "SupportCategory", "RewardType" CASCADE');
  const market = await database.market.create({ data: { code: "TR", name: "Турция", defaultLanguage: "TR", isActive: true } }); marketId = market.id;
  const role = await database.role.findUniqueOrThrow({ where: { key: "admin" } });
  const adminUser = await database.user.create({ data: { email: "admin@test.invalid", displayName: "Тестовый администратор", roles: { connect: { id: role.id } } } });
  admin = { userId: adminUser.id, sessionId: randomUUID(), roleKeys: ["admin"], permissionKeys: permissions };
  playerId = await createProductUser("player-admin@test.invalid", "PLAYER"); partnerId = await createProductUser("partner-admin@test.invalid", "PARTNER");
  await database.supportCategory.create({ data: { key: "task", title: "Задание", description: "Вопрос по заданию", roles: ["PLAYER", "PARTNER"], isActive: true } });
});
after(async () => database.$disconnect());

test("Dashboard рассчитывает реальные операционные показатели", async () => { const stats = await service.dashboard(admin); assert.equal(stats.users, 3); assert.equal(stats.registrationsToday, 3); assert.equal(stats.activeTasks, 0); assert.equal(stats.openSupport, 0); });

test("RBAC запрещает административное чтение без permission", async () => { const denied = { ...admin, permissionKeys: [] }; await assert.rejects(service.dashboard(denied), (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"); });

test("статус пользователя, блокировка и разблокировка пишут append-only историю", async () => { await service.execute(admin, "users", playerId, { action: "USER_STATUS", status: "SUSPENDED", reason: "Проверка административной блокировки" }); assert.ok((await database.user.findUniqueOrThrow({ where: { id: playerId } })).disabledAt); await service.execute(admin, "users", playerId, { action: "USER_STATUS", status: "ACTIVE", reason: "Проверка завершена" }); assert.equal((await database.user.findUniqueOrThrow({ where: { id: playerId } })).disabledAt, null); const history = await database.userAccountStatusHistory.findMany({ where: { userId: playerId }, orderBy: { occurredAt: "asc" } }); assert.deepEqual(history.map((item) => item.toStatus), ["SUSPENDED", "ACTIVE"]); await assert.rejects(database.userAccountStatusHistory.delete({ where: { id: history[0]!.id } })); });

test("Partner approval активирует профиль и сохраняет отдельную историю", async () => { await service.execute(admin, "users", partnerId, { action: "PARTNER_APPROVAL", status: "ACTIVE", reason: "Партнёрская проверка завершена" }); const profile = await database.userProfile.findUniqueOrThrow({ where: { userId: partnerId }, include: { partnerProfile: { include: { approvalHistory: true } } } }); assert.equal(profile.accountStatus, "ACTIVE"); assert.equal(profile.partnerProfile?.status, "ACTIVE"); assert.equal(profile.partnerProfile?.approvalHistory.length, 1); });

test("список участников показывает игроков и ожидающих одобрения партнёров", async () => {
  const participants = await service.list(admin, "users");
  assert.deepEqual(new Set(participants.items.map((item) => item.eyebrow)), new Set(["Игрок", "Партнёр"]));
  assert.ok(participants.items.some((item) => item.id === partnerId && item.status === "PENDING"));
  const player = await database.user.findUniqueOrThrow({ where: { id: playerId }, select: { vxId: true } });
  const numericVxId = player.vxId.slice(2);
  for (const query of [player.vxId, player.vxId.toLowerCase(), numericVxId]) {
    const result = await service.list(admin, "users", { search: query });
    assert.deepEqual(result.items.map((item) => item.id), [playerId]);
    assert.equal(result.items[0]?.vxId, player.vxId);
  }
});

test("единые admin tags поддерживают CRUD, несколько назначений и серверную фильтрацию", async () => {
  const first = await tags.create(admin, { name: "HOT" });
  const second = await tags.create(admin, { name: "TR" });
  await tags.assign(admin, playerId, first.id);
  await tags.assign(admin, playerId, second.id);
  assert.deepEqual((await service.list(admin, "users", { tagId: first.id })).items.map((item) => item.id), [playerId]);
  assert.deepEqual(new Set((await messenger.list(admin, "", "archive", second.id)).items.map((item) => item.userId)), new Set([playerId]));
  const renamed = await tags.rename(admin, first.id, { name: "VIP" });
  assert.equal(renamed.name, "VIP");
  assert.deepEqual(new Set((await service.list(admin, "users")).items.find((item) => item.id === playerId)?.tags?.map((tag) => tag.name)), new Set(["TR", "VIP"]));
  await tags.unassign(admin, playerId, second.id);
  assert.equal((await messenger.list(admin, "", "archive", second.id)).items.length, 0);
  await tags.remove(admin, first.id);
  assert.equal((await tags.list(admin)).length, 1);
  await assert.rejects(tags.list({ ...admin, roleKeys: ["player"], permissionKeys: [] }), (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN");
});

test("Opportunity, Instruction, Task и Reward получают обязательные версии", async () => { const inputs = [
  ["opportunities", "OPPORTUNITY", "Возможность для теста"], ["content", "INSTRUCTION", "Инструкция для теста"], ["tasks", "TASK", "Задание для теста"], ["rewards", "REWARD", "Тип Reward для теста"],
] as const; for (const [section, kind, title] of inputs) { const created = await service.create(admin, section, { action: "CONTENT_DRAFT", content: { kind, title, description: "Проверяемая версия административного контента", role: "PLAYER", market: "TR", nextStep: "Открыть условия", reason: "Создание тестовой версии" } }) as { id: string }; await service.execute(admin, section, created.id, { action: "CONTENT_PUBLISH", reason: "Контент прошёл тестовую проверку" }); const revisions = await database.adminContentRevision.findMany({ where: { entityType: kind, entityId: created.id }, orderBy: { version: "asc" } }); assert.deepEqual(revisions.map((item) => item.status), ["DRAFT", "PUBLISHED"]); await assert.rejects(database.adminContentRevision.update({ where: { id: revisions[0]!.id }, data: { reason: "Скрытая замена" } })); } assert.equal((await database.instructionVersion.findFirstOrThrow()).status, "PUBLISHED"); assert.equal((await database.taskVersion.findFirstOrThrow()).status, "PUBLISHED"); });

test("модерация сохраняет решение и переводит lifecycle задания", async () => { const version = await createSubmittedTask(); await service.execute(admin, "reviews", version.id, { action: "MODERATION_DECISION", decision: "CONFIRMED", reasonCode: "requirements-met", reason: "Результат соответствует опубликованным требованиям", comment: "Проверка завершена" }); const stored = await database.submissionVersion.findUniqueOrThrow({ where: { id: version.id }, include: { reviews: true, taskSubmission: { include: { userTask: { include: { statusHistory: true } } } } } }); assert.equal(stored.reviews[0]?.decision, "CONFIRMED"); assert.equal(stored.taskSubmission.userTask.status, "CONFIRMED"); assert.equal(stored.taskSubmission.userTask.statusHistory.at(-1)?.toStatus, "CONFIRMED"); await assert.rejects(database.submissionReview.delete({ where: { id: stored.reviews[0]!.id } })); });

test("невалидное решение откатывает транзакцию модерации", async () => { const version = await createSubmittedTask(); await database.userTask.update({ where: { id: version.userTaskId }, data: { status: "CANCELLED" } }); await assert.rejects(service.execute(admin, "reviews", version.id, { action: "MODERATION_DECISION", decision: "REJECTED", reasonCode: "invalid", reason: "Решение не должно сохраниться" }), ApplicationError); assert.equal(await database.submissionReview.count({ where: { submissionVersionId: version.id } }), 0); });

test("поддержка назначает оператора, пишет ответ и внутреннюю заметку append-only", async () => { const conversation = await database.supportConversation.create({ data: { userId: playerId, category: "task", subject: "Нужна помощь", context: {}, status: "CREATED" } }); await database.supportMessage.create({ data: { conversationId: conversation.id, authorType: "USER", authorId: playerId, bodyProtected: await encrypted("Первое сообщение", "support-message", conversation.id) } }); await service.execute(admin, "support", conversation.id, { action: "SUPPORT_ASSIGN", operatorId: admin.userId, reason: "Назначение по очереди" }); await service.execute(admin, "support", conversation.id, { action: "SUPPORT_REPLY", body: "Ответ оператора" }); await service.execute(admin, "support", conversation.id, { action: "SUPPORT_NOTE", body: "Внутренняя заметка" }); const stored = await database.supportConversation.findUniqueOrThrow({ where: { id: conversation.id }, include: { messages: true, internalNotes: true, statusHistory: true } }); assert.equal(stored.assignedToId, admin.userId); assert.equal(stored.messages.length, 2); assert.equal(stored.internalNotes.length, 1); assert.equal(stored.status, "WAITING_USER"); await assert.rejects(database.supportInternalNote.update({ where: { id: stored.internalNotes[0]!.id }, data: { bodyProtected: {} } })); });

test("Admin Messenger синхронизирует постоянный диалог, unread и append-only заметки", async () => {
  const unverified = await database.user.create({ data: { email: "unverified-admin@test.invalid", displayName: "Неподтверждённый", profile: { create: { productRole: "PLAYER", marketId, preferredLanguage: "RU", contactVerificationStatus: "UNVERIFIED", accountStatus: "PENDING", playerProfile: { create: { participationStatus: "PENDING" } } } } } });
  const initial = await messenger.list(admin);
  assert.equal(initial.items.length, 0, "подтверждённые пользователи без входящих сообщений не активируют Messenger");
  const archive = await messenger.list(admin, "", "archive");
  assert.equal(archive.items.length, 2);
  assert.equal(archive.items.some((item) => item.userId === unverified.id), false, "неподтверждённого пользователя нет даже в архиве");
  assert.deepEqual(new Set(archive.items.map((item) => item.role)), new Set(["PLAYER", "PARTNER"]));
  const partnerConversation = archive.items.find((item) => item.userId === partnerId);
  assert.equal(partnerConversation?.role, "PARTNER");
  assert.equal((await messenger.detail(admin, partnerConversation!.conversationId)).player.userId, partnerId);
  const playerVxId = await database.user.findUniqueOrThrow({ where: { id: playerId }, select: { vxId: true } });
  for (const query of [playerVxId.vxId, playerVxId.vxId.toLowerCase(), playerVxId.vxId.slice(2)]) {
    const result = await messenger.list(admin, query, "archive");
    assert.deepEqual(result.items.map((item) => item.userId), [playerId]);
    assert.equal(result.items[0]?.vxId, playerVxId.vxId);
  }
  const conversationId = archive.items.find((item) => item.userId === playerId)!.conversationId;
  assert.equal((await messenger.list(admin)).items.length, 0, "системные onboarding-сообщения не активируют диалог");
  const userMessage = await database.supportMessage.create({ data: { conversationId, authorType: "USER", authorId: playerId, bodyProtected: await encrypted("Сообщение игрока", "support-message", conversationId) } });
  await database.supportConversation.update({ where: { id: conversationId }, data: { updatedAt: userMessage.createdAt } });
  const active = await messenger.list(admin);
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0]!.userId, playerId);
  assert.equal(active.items[0]!.unreadCount, 1);
  assert.equal((await messenger.list(admin, "", "archive")).items.some((item) => item.userId === playerId), false, "активированный чат больше не находится в архиве");
  await messenger.markRead(admin, conversationId);
  assert.equal((await messenger.list(admin)).items[0]!.unreadCount, 0);
  const replied = await messenger.sendMessage(admin, conversationId, "Сообщение персонального менеджера");
  assert.equal(replied.conversation.messages.at(-1)?.authorType, "OPERATOR");
  assert.equal((await messenger.list(admin)).items[0]?.userId, playerId, "ответ администратора не убирает активный диалог");
  const created = await messenger.note(admin, conversationId, { action: "create", body: "Игрок предпочитает вечернюю связь" });
  assert.equal(created.notes.length, 1);
  const edited = await messenger.note(admin, conversationId, { action: "edit", logicalId: created.notes[0]!.logicalId, body: "Связаться с игроком после 18:00" });
  assert.equal(edited.notes[0]?.edited, true);
  const removed = await messenger.note(admin, conversationId, { action: "delete", logicalId: created.notes[0]!.logicalId });
  assert.equal(removed.notes.length, 0);
  assert.equal(await database.supportInternalNote.count({ where: { conversationId } }), 3);
});

test("Admin Messenger сохраняет и возвращает защищённое вложение", async () => {
  const conversationId = (await messenger.list(admin, "", "archive")).items.find((item) => item.userId === playerId)!.conversationId;
  const detail = await messenger.sendMessage(admin, conversationId, "Документ для игрока");
  const messageId = detail.conversation.messages.findLast((item) => item.authorType === "OPERATOR")!.id;
  const file = new File([new TextEncoder().encode("%PDF-1.4 test")], "условия.pdf", { type: "application/pdf" });
  const attachment = await messenger.addAttachment(admin, conversationId, messageId, file);
  const downloaded = await messenger.getAttachment(admin, conversationId, attachment.id);
  assert.equal(downloaded.fileName, "условия.pdf");
  assert.equal(new TextDecoder().decode(downloaded.bytes), "%PDF-1.4 test");
});

test("ручная корректировка экономики идемпотентна и не меняет прошлые записи", async () => { const key = `admin-adjust-${randomUUID()}`; const command = { action: "ECONOMY_ADJUST" as const, userId: playerId, kind: "POINTS" as const, delta: 25, reason: "Подтверждённая ручная корректировка", idempotencyKey: key }; const first = await service.execute(admin, "economy", "new", command) as { id: string }; const replay = await service.execute(admin, "economy", "new", command) as { id: string }; assert.equal(first.id, replay.id); assert.equal(await database.vXPointsLedgerEntry.count({ where: { userId: playerId } }), 1); const entry = await database.vXPointsLedgerEntry.findUniqueOrThrow({ where: { id: first.id } }); await assert.rejects(database.vXPointsLedgerEntry.update({ where: { id: entry.id }, data: { delta: 99 } })); });

test("массовые уведомления фильтруются сервером и получают общую историю", async () => { const batch = await service.create(admin, "notifications", { action: "NOTIFY", role: "PLAYER", market: "TR", type: "platform-update", title: "Обновление платформы", body: "Доступно новое важное изменение.", idempotencyKey: `batch-${randomUUID()}` }) as { id: string; recipientCount: number }; assert.equal(batch.recipientCount, 1); const notifications = await database.notification.findMany({ where: { batchId: batch.id }, include: { statusHistory: true } }); assert.equal(notifications.length, 1); assert.equal(notifications[0]?.userId, playerId); assert.equal(notifications[0]?.statusHistory[0]?.toStatus, "SENT"); });
});

async function createSubmittedTask() { const definition = await database.taskDefinition.create({ data: { key: `moderation-${randomUUID()}` } }); const taskVersion = await database.taskVersion.create({ data: { taskDefinitionId: definition.id, version: 1, status: "PUBLISHED", title: "Проверяемое задание", summary: "Тест", requirements: [], limitations: [], resultRequirements: [], resubmissionPolicy: "По решению", termsHash: "a".repeat(64), publishedAt: new Date() } }); const userTask = await database.userTask.create({ data: { userId: playerId, taskDefinitionId: definition.id, taskVersionId: taskVersion.id, status: "UNDER_REVIEW", assignmentKey: randomUUID() } }); const submission = await database.taskSubmission.create({ data: { userTaskId: userTask.id } }); const version = await database.submissionVersion.create({ data: { taskSubmissionId: submission.id, version: 1, status: "SUBMITTED", payload: { result: "test" }, contentHash: "b".repeat(64), submittedAt: new Date() } }); return { ...version, userTaskId: userTask.id }; }
async function encrypted(body: string, purpose: string, resourceId: string) { return await protector.encrypt(new TextEncoder().encode(body), { classification: "confidential", purpose, resourceType: "SupportConversation", resourceId }) as never; }
