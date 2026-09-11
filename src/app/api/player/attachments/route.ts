import { upload } from '@/server/attachments/http';
import { messageFailure } from '@/server/messages/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return await upload(request,false);}catch(e){return messageFailure(e);}}
