import "server-only";

import type { DatabaseClient } from "@/lib/db";

export class PrismaSupportNotificationRepository {
  constructor(private readonly database: DatabaseClient) {}

  findProfile(userId: string) { return this.database.userProfile.findUnique({ where: { userId }, select: { productRole: true, accountStatus: true, market: { select: { id: true, code: true, name: true, isActive: true } } } }); }
  listCategories(role: "PLAYER" | "PARTNER", marketId: string) { return this.database.supportCategory.findMany({ where: { isActive: true, OR: [{ marketId: null }, { marketId }] }, orderBy: { title: "asc" } }).then((items) => items.filter((item) => Array.isArray(item.roles) && item.roles.includes(role))); }
  findCategory(key: string) { return this.database.supportCategory.findUnique({ where: { key } }); }
  listConversations(userId: string) { return this.database.supportConversation.findMany({ where: { userId }, include: { categoryDefinition: true, messages: { include: { author: { select: { displayName: true } }, attachments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }, statusHistory: { orderBy: { occurredAt: "asc" } }, appeals: { include: { statusHistory: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "desc" } } }, orderBy: { updatedAt: "desc" } }); }
  findConversation(id: string, userId: string) { return this.database.supportConversation.findFirst({ where: { id, userId }, include: { categoryDefinition: true, messages: { include: { author: { select: { displayName: true } }, attachments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }, statusHistory: { orderBy: { occurredAt: "asc" } }, appeals: { include: { statusHistory: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "desc" } } } }); }
  findAttachment(id: string, userId: string) { return this.database.supportAttachment.findFirst({ where: { id, message: { conversation: { userId } } }, include: { message: { select: { conversationId: true } } } }); }
  findAppeal(id: string, userId: string) { return this.database.appeal.findFirst({ where: { id, userId }, include: { statusHistory: { orderBy: { occurredAt: "asc" } } } }); }
  listNotifications(userId: string, take = 20) { return this.database.notification.findMany({ where: { userId, channel: "IN_APP", status: { in: ["SENT", "READ"] } }, include: { statusHistory: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "desc" }, take }); }
  findNotification(id: string, userId: string) { return this.database.notification.findFirst({ where: { id, userId, channel: "IN_APP" }, include: { statusHistory: { orderBy: { occurredAt: "asc" } } } }); }
}
