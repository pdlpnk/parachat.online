import { errorResponse, getSupportNotificationService, json, requireRequestPrincipal } from "@/lib/server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { return json(await getSupportNotificationService().getConversation(await requireRequestPrincipal(request), (await params).id)); } catch (error) { return errorResponse(error); } }
