import "server-only";
import { NextResponse } from "next/server";
import { getServerEnv } from "../env";
import { StartError } from "./service";

export function cookiePolicy() {
  const secure = getServerEnv().NODE_ENV === "production";
  return {
    client: secure ? "__Host-lina_client" : "lina_client",
    bootstrap: secure ? "__Host-lina_bootstrap" : "lina_bootstrap",
    flags: { httpOnly: true, secure, sameSite: "lax" as const, path: "/" },
  };
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== getServerEnv().LINA_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new StartError(403, "Запрос отклонён. Откройте LINA в этом браузере.");
  }
}
export function response(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  const result = error instanceof StartError ? response({ error: error.publicMessage }, error.status)
    : response({ error: "Не удалось открыть чат. Попробуйте ещё раз." }, 503);
  if (error instanceof StartError && error.status === 429) result.headers.set("Retry-After", "60");
  return result;
}
