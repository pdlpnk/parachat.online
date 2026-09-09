import { errorResponse, getAdminTagService, json, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function PUT(request: Request, { params }: { params: Promise<{ userId: string; tagId: string }> }) {
  try { requireTrustedOrigin(request); const values = await params; return json(await getAdminTagService().assign(await requireAdminRequestPrincipal(request), values.userId, values.tagId)); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string; tagId: string }> }) {
  try { requireTrustedOrigin(request); const values = await params; return json(await getAdminTagService().unassign(await requireAdminRequestPrincipal(request), values.userId, values.tagId)); }
  catch (error) { return errorResponse(error); }
}
