import { errorResponse, getAdminTagService, json, readJsonBody, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { requireTrustedOrigin(request); return json(await getAdminTagService().rename(await requireAdminRequestPrincipal(request), (await params).id, await readJsonBody(request) as { name?: unknown })); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { requireTrustedOrigin(request); return json(await getAdminTagService().remove(await requireAdminRequestPrincipal(request), (await params).id)); }
  catch (error) { return errorResponse(error); }
}
