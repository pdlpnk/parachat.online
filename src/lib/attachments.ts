export const ATTACHMENT_LIMIT = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.mp4';
export type AttachmentDTO = { id: string; displayFilename: string; mediaType: string; byteSize: number };
export function fileSize(bytes:number){return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MiB`:`${Math.ceil(bytes/1024)} KiB`;}
