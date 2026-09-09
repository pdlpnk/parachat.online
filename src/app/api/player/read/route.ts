import { requireOrigin, response } from "@/server/identity/http";
import { messageContext, messageFailure, readBody } from "@/server/messages/http";
import { markRead } from "@/server/messages/service";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const sequence = await readBody(request, "sequence", 512);
    return response(await markRead(...await messageContext(), sequence));
  } catch (error) { return messageFailure(error); }
}
