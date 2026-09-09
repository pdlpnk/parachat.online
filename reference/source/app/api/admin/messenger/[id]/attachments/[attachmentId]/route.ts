import { errorResponse, getAdminMessengerService, requireAdminRequestPrincipal } from "@/lib/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const principal = await requireAdminRequestPrincipal(request);
    const { id, attachmentId } = await params;
    const attachment = await getAdminMessengerService().getAttachment(principal, id, attachmentId);
    const safeName = attachment.fileName.replace(/["\\\r\n]/g, "_");
    const inline = new URL(request.url).searchParams.get("inline") === "1" && attachment.mediaType.startsWith("image/");
    return new Response(attachment.bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": attachment.mediaType,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
