import type { AttachmentDTO } from "../../lib/attachments";
import { validateDisplayName, systemText } from "../../lib/player";
import type { MessageDTO } from "../../lib/messages";
export const messageSelect = { attachments: { select: { id: true, displayFilename: true, mediaType: true, byteSize: true } }, sequence: true, authorType: true, body: true, systemKey: true, systemParams: true, createdAt: true } as const;
export function messageDTO(m: { attachments?: AttachmentDTO[]; sequence: number; authorType: MessageDTO["authorType"]; body: string | null; systemKey: string | null; systemParams: unknown; createdAt: Date }): MessageDTO {
  return { ...(m.authorType === "SYSTEM" && m.systemKey === "system.welcome" ? {system:{key:m.systemKey,params:{...(m.systemParams && typeof m.systemParams === "object" && "name" in m.systemParams && validateDisplayName(m.systemParams.name) ? {name:validateDisplayName(m.systemParams.name)!}: {})}}}:{}), ...(m.attachments?.length ? { attachments: m.attachments.map(a=>({id:a.id,displayFilename:a.displayFilename,mediaType:a.mediaType,byteSize:a.byteSize})) } : {}), sequence: m.sequence, authorType: m.authorType, text: m.authorType === "SYSTEM" ? systemText(m.systemKey, m.systemParams) : m.body ?? "", createdAt: m.createdAt.toISOString() };
}
