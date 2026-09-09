import { errorResponse, getAdminMessengerService, json, requireAdminRequestPrincipal } from "@/lib/server";
import type { AdminMessengerScope } from "@/lib/admin-messenger";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminRequestPrincipal(request);
    const params = new URL(request.url).searchParams;
    const scope: AdminMessengerScope = params.get("scope") === "archive" ? "archive" : "active";
    return json(await getAdminMessengerService().list(principal, params.get("q") ?? "", scope, params.get("tag") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
