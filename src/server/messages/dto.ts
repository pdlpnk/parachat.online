import { systemText } from "../../lib/player";
import type { MessageDTO } from "../../lib/messages";
export const messageSelect = { sequence: true, authorType: true, body: true, systemKey: true, systemParams: true, createdAt: true } as const;
export function messageDTO(m: { sequence: number; authorType: MessageDTO["authorType"]; body: string | null; systemKey: string | null; systemParams: unknown; createdAt: Date }): MessageDTO {
  return { sequence: m.sequence, authorType: m.authorType, text: m.authorType === "SYSTEM" ? systemText(m.systemKey, m.systemParams) : m.body ?? "", createdAt: m.createdAt.toISOString() };
}
