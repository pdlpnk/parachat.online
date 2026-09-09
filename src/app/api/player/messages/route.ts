import { requireOrigin, response } from "@/server/identity/http";
import { StartError } from "@/server/identity/service";
import { messageContext, messageFailure, readBody } from "@/server/messages/http";
import { pollMessages, sendMessage } from "@/server/messages/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const after = params.get("after");
    if (params.size !== 1 || after === null || !/^(0|[1-9][0-9]{0,9})$/.test(after)) throw new StartError(400, "Некорректная позиция истории.");
    return response(await pollMessages(...await messageContext(), Number(after)));
  } catch (error) { return messageFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const text = await readBody(request, "text", 65536);
    return response({ message: await sendMessage(...await messageContext(), text, request.headers.get("idempotency-key")) });
  } catch (error) { return messageFailure(error); }
}
