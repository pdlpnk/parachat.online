import "server-only";

import type { AdminTagAssignmentView, AdminTagView } from "@/lib/admin-tags";
import type { AuthenticatedPrincipal } from "@/lib/auth";
import { ApplicationError, createTransactionalEventServices, PrismaTransactionRunner } from "@/lib/application";
import type { PrismaClient } from "@/lib/db";

function requirePermission(actor: AuthenticatedPrincipal, permission: "users.read" | "users.write") {
  if (!actor.roleKeys.includes("admin") || !actor.permissionKeys.includes(permission)) {
    throw new ApplicationError("FORBIDDEN", "Недостаточно прав для управления тегами");
  }
}

function tagName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 60) throw new ApplicationError("VALIDATION", "Название тега должно содержать от 1 до 60 символов");
  return name;
}

export class AdminTagService {
  private readonly transactions: PrismaTransactionRunner;

  constructor(private readonly database: PrismaClient) {
    this.transactions = new PrismaTransactionRunner(database);
  }

  async list(actor: AuthenticatedPrincipal): Promise<AdminTagView[]> {
    requirePermission(actor, "users.read");
    const tags = await this.database.adminTag.findMany({
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return tags.map((tag) => ({ id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString(), userCount: tag._count.assignments }));
  }

  async create(actor: AuthenticatedPrincipal, input: { name?: unknown }): Promise<AdminTagView> {
    requirePermission(actor, "users.write");
    const name = tagName(input.name);
    return this.transactions.run(async ({ database, occurredAt }) => {
      const existing = await database.adminTag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      if (existing) throw new ApplicationError("CONFLICT", "Тег с таким названием уже существует");
      const tag = await database.adminTag.create({ data: { name }, include: { _count: { select: { assignments: true } } } });
      await createTransactionalEventServices(database, occurredAt).audit.record({ actor: { type: "user", id: actor.userId, sessionId: actor.sessionId }, action: "admin.tag.created", target: { type: "admin-tag", id: tag.id }, metadata: { name } });
      return { id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString(), userCount: tag._count.assignments };
    });
  }

  async rename(actor: AuthenticatedPrincipal, id: string, input: { name?: unknown }): Promise<AdminTagView> {
    requirePermission(actor, "users.write");
    const name = tagName(input.name);
    return this.transactions.run(async ({ database, occurredAt }) => {
      const current = await database.adminTag.findUnique({ where: { id } });
      if (!current) throw new ApplicationError("NOT_FOUND", "Тег не найден");
      const duplicate = await database.adminTag.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } } });
      if (duplicate) throw new ApplicationError("CONFLICT", "Тег с таким названием уже существует");
      const tag = await database.adminTag.update({ where: { id }, data: { name }, include: { _count: { select: { assignments: true } } } });
      await createTransactionalEventServices(database, occurredAt).audit.record({ actor: { type: "user", id: actor.userId, sessionId: actor.sessionId }, action: "admin.tag.renamed", target: { type: "admin-tag", id }, metadata: { from: current.name, to: name } });
      return { id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString(), userCount: tag._count.assignments };
    });
  }

  async remove(actor: AuthenticatedPrincipal, id: string) {
    requirePermission(actor, "users.write");
    return this.transactions.run(async ({ database, occurredAt }) => {
      const tag = await database.adminTag.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
      if (!tag) throw new ApplicationError("NOT_FOUND", "Тег не найден");
      await database.adminTag.delete({ where: { id } });
      await createTransactionalEventServices(database, occurredAt).audit.record({ actor: { type: "user", id: actor.userId, sessionId: actor.sessionId }, action: "admin.tag.deleted", target: { type: "admin-tag", id }, metadata: { name: tag.name, assignmentsRemoved: tag._count.assignments } });
      return { ok: true };
    });
  }

  async assign(actor: AuthenticatedPrincipal, userId: string, tagId: string): Promise<AdminTagAssignmentView[]> {
    requirePermission(actor, "users.write");
    return this.transactions.run(async ({ database, occurredAt }) => {
      const [user, tag] = await Promise.all([database.user.findUnique({ where: { id: userId }, select: { id: true } }), database.adminTag.findUnique({ where: { id: tagId }, select: { id: true, name: true } })]);
      if (!user) throw new ApplicationError("NOT_FOUND", "Пользователь не найден");
      if (!tag) throw new ApplicationError("NOT_FOUND", "Тег не найден");
      await database.adminTagAssignment.upsert({ where: { userId_tagId: { userId, tagId } }, create: { userId, tagId }, update: {} });
      await createTransactionalEventServices(database, occurredAt).audit.record({ actor: { type: "user", id: actor.userId, sessionId: actor.sessionId }, action: "admin.tag.assigned", target: { type: "user", id: userId }, metadata: { tagId, tagName: tag.name } });
      return this.userTags(database, userId);
    });
  }

  async unassign(actor: AuthenticatedPrincipal, userId: string, tagId: string): Promise<AdminTagAssignmentView[]> {
    requirePermission(actor, "users.write");
    return this.transactions.run(async ({ database, occurredAt }) => {
      const removed = await database.adminTagAssignment.deleteMany({ where: { userId, tagId } });
      if (removed.count) await createTransactionalEventServices(database, occurredAt).audit.record({ actor: { type: "user", id: actor.userId, sessionId: actor.sessionId }, action: "admin.tag.unassigned", target: { type: "user", id: userId }, metadata: { tagId } });
      return this.userTags(database, userId);
    });
  }

  private async userTags(database: Pick<PrismaClient, "adminTagAssignment">, userId: string): Promise<AdminTagAssignmentView[]> {
    const rows = await database.adminTagAssignment.findMany({ where: { userId }, include: { tag: true }, orderBy: { tag: { name: "asc" } } });
    return rows.map(({ tag }) => ({ id: tag.id, name: tag.name }));
  }
}
