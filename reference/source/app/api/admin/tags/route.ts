import { deriveNetworkIdentifier, errorResponse, getAdminTagService, json, limitRequest, readJsonBody, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function GET(request: Request) {
  try { return json(await getAdminTagService().list(await requireAdminRequestPrincipal(request))); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    requireTrustedOrigin(request);
    const principal = await requireAdminRequestPrincipal(request);
    await limitRequest({ namespace: "admin.tags.create", key: `${principal.userId}:${deriveNetworkIdentifier(request)}`, limit: 30, windowSeconds: 60 });
    return json(await getAdminTagService().create(principal, await readJsonBody(request) as { name?: unknown }), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
