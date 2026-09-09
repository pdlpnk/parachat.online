import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "../db";
import { getServerEnv } from "../env";
import { cookiePolicy, response } from "../identity/http";
import { StartError } from "../identity/service";
export async function messageContext() {
  return [getDatabase(), (await cookies()).get(cookiePolicy().client)?.value, getServerEnv().CLIENT_CREDENTIAL_PEPPER] as const;
}
export async function readBody(request: Request, field: string, limit: number) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new StartError(415, "Ожидается JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new StartError(400, "Пустой запрос.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new StartError(413, "Сообщение слишком большое."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new StartError(400, "Некорректный JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, field)) throw new StartError(400, "Некорректные поля запроса.");
  return body[field] as unknown;
}
export function messageFailure(error: unknown) {
  const result = error instanceof StartError ? response({ error: error.publicMessage }, error.status) : response({ error: "Чат временно недоступен. Повторите попытку." }, 503);
  if (error instanceof StartError && error.status === 429) result.headers.set("Retry-After", "60");
  return result;
}
