import { errorResponse, getAdminMessengerService, json, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    return json(await getAdminMessengerService().markRead(await requireAdminRequestPrincipal(request), (await params).id));
  } catch (error) {
    return errorResponse(error);
  }
}
