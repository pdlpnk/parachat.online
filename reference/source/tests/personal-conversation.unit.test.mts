import assert from "node:assert/strict";
import { test } from "node:test";

import { appendPersonalConversationMessage } from "../lib/services/personal-conversation.ts";

test("инициализация личного диалога не создаёт уведомление повторно", async () => {
  const notificationId = "908c4495-0d85-4b04-b46d-c085610a6131";
  const conversationId = "19e412a4-d8ea-5904-8c83-2a488e8a7e30";
  const createdMessageIds = new Set<string>();
  const createdMessages: Array<{ id?: string }> = [];
  let conversationLookup = 0;

  const database = {
    userProfile: {
      findUnique: async () => ({
        productRole: "PLAYER",
        preferredLanguage: "TR",
        marketId: "market-tr",
        createdAt: new Date("2026-08-02T12:00:00.000Z"),
        user: { displayName: "Роман" },
      }),
    },
    supportConversation: {
      findFirst: async () => {
        conversationLookup += 1;
        return null;
      },
      upsert: async () => ({ id: conversationId }),
      update: async () => ({ id: conversationId }),
    },
    supportCategory: {
      findMany: async () => [{ key: "personal-manager", roles: ["PLAYER"] }],
      upsert: async () => ({ key: "personal-manager", roles: ["PLAYER"] }),
    },
    supportStatusHistory: { upsert: async () => ({}) },
    notification: {
      findMany: async () => [{
        id: notificationId,
        title: "Пространство VX House открыто",
        body: "Теперь можно знакомиться с возможностями.",
        createdAt: new Date("2026-08-02T12:01:00.000Z"),
      }],
    },
    supportMessage: {
      findFirst: async () => null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        createdMessageIds.has(where.id) ? { id: where.id } : null,
      create: async ({ data }: { data: { id?: string } }) => {
        const id = data.id ?? "greeting-message";
        if (createdMessageIds.has(id)) throw new Error(`duplicate message ${id}`);
        createdMessageIds.add(id);
        createdMessages.push(data);
        return { id };
      },
    },
  };
  const protector = {
    encrypt: async () => ({ keyId: "test", iv: "iv", ciphertext: "ciphertext", tag: "tag" }),
  };

  const result = await appendPersonalConversationMessage(
    database as never,
    protector as never,
    {
      userId: "4bed3714-7f1d-4858-89b1-a832d8ba0945",
      messageId: notificationId,
      body: "Пространство VX House открыто",
      occurredAt: new Date("2026-08-02T12:01:00.000Z"),
    },
  );

  assert.equal(result.id, notificationId);
  assert.equal(conversationLookup, 2);
  assert.equal(createdMessages.filter(({ id }) => id === notificationId).length, 1);
});
