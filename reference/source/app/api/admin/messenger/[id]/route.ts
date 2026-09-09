import { errorResponse, getAdminMessengerService, json, requireAdminRequestPrincipal } from "@/lib/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return json(await getAdminMessengerService().detail(await requireAdminRequestPrincipal(request), (await params).id));
  } catch (error) {
    return errorResponse(error);
  }
}
