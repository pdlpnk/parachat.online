import type { MessageDTO } from './messages';
export type TagDTO = { id: string; name: string };
export type ConversationDTO = { id: string; displayName: string; liId: string; avatarEmoji: string; active: boolean; closed: boolean; lastMessageAt: string | null; preview: string; unread: number; tags: TagDTO[] };
export type AdminList = { conversations: ConversationDTO[]; total: number; unread: number; page: number };
export type AdminDetail = { conversation: ConversationDTO; messages: MessageDTO[]; readSequence: number; unreadCount: number; hasMore: boolean };
export function adminEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[\x21-\x7e]+$/.test(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function tagName(value: unknown): { name: string; normalizedName: string } | null {
  if (typeof value !== 'string' || value.length > 240) return null;
  const name = value.trim().replace(/\s+/gu, ' ').normalize('NFC');
  if (!name || [...name].length > 60 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name) || !/[^\p{Z}\p{M}]/u.test(name)) return null;
  return { name, normalizedName: name.toLowerCase() };
}
export function adminSearch(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFC').slice(0, 80) : '';
}
export function validUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
