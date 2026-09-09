import { errorResponse, getAdminMessengerService, json, readJsonBody, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const body = await readJsonBody(request);
    const action = body.action === "edit" || body.action === "delete" ? body.action : "create";
    return json(await getAdminMessengerService().note(await requireAdminRequestPrincipal(request), (await params).id, {
      action,
      logicalId: typeof body.logicalId === "string" ? body.logicalId : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
