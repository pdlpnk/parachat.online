import type { SupportConversationView } from "@/lib/support";
import type { AdminTagAssignmentView, AdminTagView } from "@/lib/admin-tags";

export const ADMIN_MESSENGER_ROLES = ["PLAYER", "PARTNER"] as const;
export type AdminMessengerRole = (typeof ADMIN_MESSENGER_ROLES)[number];
export type AdminMessengerScope = "active" | "archive";

export function isAdminMessengerRole(value: string): value is AdminMessengerRole {
  return ADMIN_MESSENGER_ROLES.some((role) => role === value);
}

export type AdminMessengerPlayer = {
  userId: string;
  vxId: string;
  conversationId: string;
  name: string;
  email: string;
  avatarEmoji: string | null;
  market: string;
  role: AdminMessengerRole;
  registeredAt: string;
  online: boolean;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  hasNotes: boolean;
  tags: AdminTagAssignmentView[];
};

export type AdminMessengerNote = {
  id: string;
  logicalId: string;
  body: string;
  author: string;
  createdAt: string;
  modifiedAt: string | null;
  edited: boolean;
};

export type AdminMessengerDetail = {
  player: AdminMessengerPlayer & {
    profileHref: string;
  };
  conversation: SupportConversationView;
  notes: AdminMessengerNote[];
};

export type AdminMessengerList = {
  items: AdminMessengerPlayer[];
  unreadCount: number;
  tags: AdminTagView[];
};
