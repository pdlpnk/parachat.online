import { errorResponse, getSupportNotificationService, json, requireRequestPrincipal, requireTrustedOrigin } from "@/lib/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const principal = await requireRequestPrincipal(request);
    const form = await request.formData();
    const file = form.get("file");
    const messageId = String(form.get("messageId") ?? "");
    if (!(file instanceof File)) return json({ message: "Выберите файл" }, { status: 400 });
    return json(await getSupportNotificationService().addAttachment(principal, (await params).id, messageId, file), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
