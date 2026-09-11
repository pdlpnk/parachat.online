import { download } from '@/server/attachments/http';
import { messageFailure } from '@/server/messages/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{return await download(request,false,(await context.params).id);}catch(e){return messageFailure(e);}}
