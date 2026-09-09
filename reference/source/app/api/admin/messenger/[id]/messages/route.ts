import { deriveNetworkIdentifier, errorResponse, getAdminMessengerService, json, limitRequest, readJsonBody, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const principal = await requireAdminRequestPrincipal(request);
    await limitRequest({ namespace: "admin.messenger.message", key: `${principal.userId}:${deriveNetworkIdentifier(request)}`, limit: 80, windowSeconds: 3600 });
    const body = await readJsonBody(request);
    return json(await getAdminMessengerService().sendMessage(principal, (await params).id, String(body.body ?? "")));
  } catch (error) {
    return errorResponse(error);
  }
}
