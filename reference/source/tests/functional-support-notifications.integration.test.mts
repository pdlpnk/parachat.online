import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";

import { ApplicationError } from "../lib/application/index.ts";
import type { AuthenticatedPrincipal } from "../lib/auth/index.ts";
import { AesGcmDataProtector } from "../lib/data-protection/index.ts";
import type { PrismaClient } from "../lib/db/generated/client.ts";
import { PrismaClient as NodePrismaClient } from "../lib/db/generated-node/client.ts";
import { SupportNotificationApplicationService } from "../lib/services/index.ts";

const connectionString = process.env.TEST_DATABASE_URL; if (!connectionString) throw new Error("TEST_DATABASE_URL обязателен");
const database = new NodePrismaClient({ adapter: new PrismaPg({ connectionString }) }) as unknown as PrismaClient;
const protector = new AesGcmDataProtector("test-key", Buffer.alloc(32, 7).toString("base64url"));
const service = new SupportNotificationApplicationService(database, protector);
let player: { userId: string; principal: AuthenticatedPrincipal }; let other: { userId: string; principal: AuthenticatedPrincipal }; let writer: AuthenticatedPrincipal; let rewardId: string;

async function createPlayer(marketId: string, email: string) { const user = await database.user.create({ data: { email, displayName: "Тестовый пользователь", profile: { create: { productRole: "PLAYER", marketId, preferredLanguage: "RU", contactVerificationStatus: "VERIFIED", accountStatus: "ACTIVE", playerProfile: { create: { participationStatus: "ACTIVE" } } } } } }); return { userId: user.id, principal: { userId: user.id, sessionId: randomUUID(), roleKeys: ["authenticated"], permissionKeys: [] } satisfies AuthenticatedPrincipal }; }

beforeEach(async () => {
  await database.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "User", "Market", "SupportCategory", "RewardType" CASCADE');
  const tr = await database.market.create({ data: { code: "TR", name: "Турция", defaultLanguage: "TR", isActive: true } }); player = await createPlayer(tr.id, "support-player@test.invalid"); other = await createPlayer(tr.id, "support-other@test.invalid"); writer = { userId: player.userId, sessionId: randomUUID(), roleKeys: ["system"], permissionKeys: ["support.write", "appeals.write", "notifications.write"] };
  await database.supportCategory.createMany({ data: [{ key: "task", title: "Задание", description: "Вопрос по заданию", roles: ["PLAYER", "PARTNER"], isActive: true }, { key: "appeal", title: "Апелляция", description: "Пересмотр решения", roles: ["PLAYER", "PARTNER"], isActive: true }, { key: "partner", title: "Партнёр", description: "Только партнёру", roles: ["PARTNER"], isActive: true }] });
  const type = await database.rewardType.create({ data: { key: "appealable", name: "Тестовый Reward", valueKind: "NON_MONETARY", description: "Тест", status: "PUBLISHED" } }); rewardId = (await database.vXReward.create({ data: { userId: player.userId, rewardTypeId: type.id, status: "REJECTED", title: "Отклонённый Reward", description: "Тест", nonMonetaryValue: { value: "test" }, idempotencyKey: randomUUID() } })).id;
});
after(async () => database.$disconnect());

test("категории фильтруются сервером по роли и рынку", async () => { assert.deepEqual((await service.listCategories(player.principal)).map((item) => item.key).sort(), ["appeal", "task"]); await assert.rejects(service.createConversation(player.principal, { category: "partner", priority: "NORMAL", subject: "Недоступно", body: "Сообщение" }, `support-${randomUUID()}`), (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"); assert.equal(await database.supportConversation.count(), 0); });

test("персональный Messenger создаётся один раз и объединяет продуктовые сообщения", async () => {
  await service.createNotification(writer, {
    userId: player.userId,
    category: "TASK",
    title: "Проверяем результат",
    body: "Мы получили информацию по заданию.",
  }, `notification-${randomUUID()}`);
  const first = await service.getPersonalConversation(player.principal);
  const replay = await service.getPersonalConversation(player.principal);
  assert.equal(replay.id, first.id);
  assert.equal(await database.supportConversation.count({ where: { userId: player.userId } }), 1);
  assert.match(first.messages[0]?.body ?? "", /персональный менеджер/);
  assert.match(first.messages.at(-1)?.body ?? "", /Проверяем результат/);
});

test("создание обращения атомарно пишет защищённое сообщение и историю", async () => { const ticket = await service.createConversation(player.principal, { category: "task", priority: "NORMAL", subject: "Вопрос по заданию", body: "Нужна проверка статуса" }, `support-${randomUUID()}`); assert.equal(ticket.messages[0]?.body, "Нужна проверка статуса"); assert.equal(ticket.history[0]?.toStatus, "CREATED"); const stored = await database.supportMessage.findFirstOrThrow(); assert.equal(typeof stored.bodyProtected, "object"); assert.doesNotMatch(JSON.stringify(stored.bodyProtected), /Нужна проверка статуса/); });

test("сообщения идемпотентны, append-only и получают серверное время", async () => { let ticket = await service.createConversation(player.principal, { category: "task", priority: "NORMAL", subject: "Диалог", body: "Первое сообщение" }, `support-${randomUUID()}`); const key = `message-${randomUUID()}`; ticket = await service.sendMessage(player.principal, ticket.id, "Второе сообщение", key); const replay = await service.sendMessage(player.principal, ticket.id, "Второе сообщение", key); assert.equal(replay.messages.length, 2); const message = await database.supportMessage.findFirstOrThrow({ where: { conversationId: ticket.id }, orderBy: { createdAt: "desc" } }); await assert.rejects(database.supportMessage.update({ where: { id: message.id }, data: { bodyProtected: { changed: true } } })); await assert.rejects(database.supportMessage.delete({ where: { id: message.id } })); });

test("ownership закрывает чужие обращения и сообщения", async () => { const ticket = await service.createConversation(player.principal, { category: "task", priority: "LOW", subject: "Приватный вопрос", body: "Только владельцу" }, `support-${randomUUID()}`); await assert.rejects(service.getConversation(other.principal, ticket.id), (error: unknown) => error instanceof ApplicationError && error.code === "NOT_FOUND"); await assert.rejects(service.sendMessage(other.principal, ticket.id, "Чужое сообщение", `message-${randomUUID()}`), ApplicationError); assert.equal((await service.getConversation(player.principal, ticket.id)).messages.length, 1); });

test("state machine поддержки фиксирует переходы", async () => { let ticket = await service.createConversation(player.principal, { category: "task", priority: "HIGH", subject: "Переходы статуса", body: "Тест" }, `support-${randomUUID()}`); await service.transitionConversation(writer, ticket.id, "ASSIGNED", "Назначен оператор"); await service.transitionConversation(writer, ticket.id, "WAITING_USER", "Нужен ответ пользователя"); ticket = await service.sendMessage(player.principal, ticket.id, "Уточнение пользователя", `message-${randomUUID()}`); assert.equal(ticket.status, "WAITING_OPERATOR"); assert.deepEqual(ticket.history.map((item) => item.toStatus), ["CREATED", "ASSIGNED", "WAITING_USER", "WAITING_OPERATOR"]); await assert.rejects(service.transitionConversation(writer, ticket.id, "CREATED", "Назад нельзя"), ApplicationError); });

test("апелляция проверяет ownership, допустимый Reward и хранит append-only lifecycle", async () => { const appeal = await service.createAppeal(player.principal, { rewardId, reason: "Прошу пересмотреть объяснимое решение" }, `appeal-${randomUUID()}`); assert.equal(appeal.status, "SUBMITTED"); assert.deepEqual(appeal.history.map((item) => item.toStatus), ["DRAFT", "SUBMITTED"]); await assert.rejects(service.createAppeal(other.principal, { rewardId, reason: "Чужая апелляция недопустима" }, `appeal-${randomUUID()}`), ApplicationError); await assert.rejects(database.appeal.update({ where: { id: appeal.id }, data: { reason: "Изменено" } })); await assert.rejects(database.appealStatusHistory.delete({ where: { id: appeal.history[0]!.id } })); });

test("апелляционное обращение атомарно создаёт связанный lifecycle", async () => { const ticket = await service.createConversation(player.principal, { category: "appeal", priority: "HIGH", subject: "Пересмотр Reward", body: "Прошу пересмотреть решение по указанному Reward", relatedType: "REWARD", relatedId: rewardId }, `support-${randomUUID()}`); assert.equal(ticket.appeals[0]?.status, "SUBMITTED"); assert.equal(ticket.appeals[0]?.rewardId, rewardId); assert.deepEqual(ticket.appeals[0]?.history.map((item) => item.toStatus), ["DRAFT", "SUBMITTED"]); });

test("уведомления имеют серверную историю, unread/read и ownership", async () => { const key = `notification-${randomUUID()}`; const created = await service.createNotification(writer, { userId: player.userId, category: "SUPPORT", title: "Статус обращения изменён", body: "Откройте обращение для подробностей" }, key); const replay = await service.createNotification(writer, { userId: player.userId, category: "SUPPORT", title: "Статус обращения изменён", body: "Откройте обращение для подробностей" }, key); assert.equal(replay.id, created.id); assert.equal((await service.listNotifications(player.principal))[0]?.status, "SENT"); const readKey = `read-${randomUUID()}`; const read = await service.markNotificationRead(player.principal, created.id, readKey); assert.equal(read.status, "READ"); assert.deepEqual(read.history.map((item) => item.toStatus), ["SENT", "READ"]); await assert.rejects(service.markNotificationRead(other.principal, created.id, `read-${randomUUID()}`), ApplicationError); await assert.rejects(database.notificationStatusHistory.update({ where: { id: read.history[0]!.id }, data: { reason: "Изменено" } })); });

test("ошибка создания обращения не оставляет частичных сообщений или истории", async () => { await assert.rejects(service.createConversation(player.principal, { category: "missing", priority: "NORMAL", subject: "Rollback", body: "Не должно сохраниться" }, `support-${randomUUID()}`), ApplicationError); assert.equal(await database.supportConversation.count(), 0); assert.equal(await database.supportMessage.count(), 0); assert.equal(await database.supportStatusHistory.count(), 0); });
