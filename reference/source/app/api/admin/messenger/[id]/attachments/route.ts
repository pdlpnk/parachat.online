import { errorResponse, getAdminMessengerService, json, requireAdminRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const principal = await requireAdminRequestPrincipal(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ message: "Выберите файл" }, { status: 400 });
    return json(await getAdminMessengerService().addAttachment(principal, (await params).id, String(form.get("messageId") ?? ""), file), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
