export const MESSAGE_LIMIT = 5000;
export type MessageDTO = { sequence: number; authorType: "USER" | "OPERATOR" | "SYSTEM"; text: string; createdAt: string };
export function normalizeMessage(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 20000) return null;
  const text = input.replace(/\r\n?/g, "\n").trim().normalize("NFC");
  if (!text || [...text].length > MESSAGE_LIMIT || /[\p{Cs}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text) || !/[^\p{Z}\p{C}\p{M}]/u.test(text)) return null;
  return text;
}
export function validMessageKey(key: unknown): key is string {
  return typeof key === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key);
}
export function validSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}
export function mergeMessages(current: MessageDTO[], incoming: MessageDTO[]): MessageDTO[] {
  const seen = new Set(current.map(m => m.sequence));
  const added = incoming.filter(m => !seen.has(m.sequence) && !!seen.add(m.sequence));
  return added.length ? [...current, ...added].sort((a, b) => a.sequence - b.sequence) : current;
}
export function localMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
