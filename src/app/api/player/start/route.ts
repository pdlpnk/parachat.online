import { cookies } from "next/headers";
import { getDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { cookiePolicy, failure, requireOrigin, response } from "@/server/identity/http";
import { resolvePlayer, startPlayer, StartError } from "@/server/identity/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const policy = cookiePolicy();
    const jar = await cookies();
    const db = getDatabase();
    const pepper = getServerEnv().CLIENT_CREDENTIAL_PEPPER;
    if (await resolvePlayer(db, jar.get(policy.client)?.value, pepper)) {
      const result = response({ ok: true });
      result.cookies.set(policy.bootstrap, "", { ...policy.flags, maxAge: 0 });
      return result;
    }
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new StartError(415, "Неверный формат запроса.");
    // Stream limit applies even when Content-Length is missing or dishonest.
    const reader = request.body?.getReader();
    if (!reader) throw new StartError(400, "Введите имя.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) { await reader.cancel(); throw new StartError(413, "Запрос слишком большой."); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new StartError(400, "Неверный формат запроса."); }
    const issued = await startPlayer(db, jar.get(policy.bootstrap)?.value, body?.displayName, pepper);
    const result = response({ ok: true });
    result.cookies.set(policy.client, issued.raw, { ...policy.flags, expires: issued.expiresAt });
    result.cookies.set(policy.bootstrap, "", { ...policy.flags, maxAge: 0 });
    return result;
  } catch (error) { return failure(error); }
}
