import { errorResponse, getSupportNotificationService, json, requireRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    return json(await getSupportNotificationService().markConversationRead(
      await requireRequestPrincipal(request),
      (await params).id,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
