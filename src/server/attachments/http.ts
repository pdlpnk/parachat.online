import 'server-only';
import { constants } from 'node:fs';
import { open,unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ATTACHMENT_LIMIT } from '../../lib/attachments';
import { validMessageKey } from '../../lib/messages';
import { validUuid } from '../../lib/admin';
import { getDatabase } from '../db';
import { messageContext } from '../messages/http';
import { adminContext } from '../admin/http';
import { authenticate,sendMessage } from '../messages/service';
import { authenticateAdmin } from '../admin/auth';
import { adminSend } from '../admin/messenger';
import { StartError } from '../identity/service';
import { requireOrigin,response } from '../identity/http';
import { validateFile } from './validation';
import { storageRoot,storagePath,storeFile } from './storage';
let uploads=0;
const uploadLimit=ATTACHMENT_LIMIT+65536;
async function owner(admin:boolean,id?:string){
 const db=getDatabase();
 if(admin){const context=await adminContext();await db.$transaction(async tx=>{await authenticateAdmin(tx,context[1]);if(id&&(!validUuid(id)||!await tx.conversation.findUnique({where:{id}})))throw new StartError(404,'Диалог не найден.');});return {db,raw:context[1],pepper:'',conversationId:id};}
 const context=await messageContext();const p=await db.$transaction(tx=>authenticate(tx,context[1],context[2]));return {db,raw:context[1],pepper:context[2],conversationId:p.conversationId};
}
export async function upload(request:Request,admin:boolean,id?:string){
 requireOrigin(request);const context=await owner(admin,id),key=request.headers.get('idempotency-key');
 if(!validMessageKey(key))throw new StartError(400,'Некорректный ключ отправки.');
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new StartError(415,'Ожидается файл.');
 if(Number(request.headers.get('content-length'))>uploadLimit)throw new StartError(413,'Файл слишком большой.');
 if(uploads>=2)throw new StartError(429,'Загрузка занята. Повторите через минуту.');
 uploads++;let completed=false;let stored:Awaited<ReturnType<typeof storeFile>>|undefined;
 try{
  const reader=request.body?.getReader();if(!reader)throw new StartError(400,'Пустой запрос.');let length=0;const chunks:Uint8Array[]=[];
  const timeout=setTimeout(()=>void reader.cancel(),60000);
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>uploadLimit){await reader.cancel();throw new StartError(413,'Файл слишком большой.');}chunks.push(chunk.value);}}finally{clearTimeout(timeout);reader.releaseLock();}
  let form:FormData;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}catch{throw new StartError(400,'Некорректная загрузка.');}
  const file=form.get('file'),text=form.get('text');if(form.getAll('file').length!==1||form.getAll('text').length!==1||[...form.keys()].some(k=>!['file','text'].includes(k))||!(file instanceof File)||typeof text!=='string')throw new StartError(400,'Некорректные поля загрузки.');
  const bytes=Buffer.from(await file.arrayBuffer()),metadata=validateFile(file.name,file.type,bytes);stored=await storeFile(bytes);
  const attachment={...metadata,storageKey:stored.storageKey};
  const message=admin?await adminSend(context.db,context.raw,id!,text,key,attachment):await sendMessage(context.db,context.raw,context.pepper,text,key,attachment);
  completed=true;return response({message});
 }finally{
  uploads--;
  // Only clean up after a confirmed transaction result. An uncertain commit may still be in flight.
  // Failed requests leave private orphans for the age-gated offline cleanup.
  if(completed&&stored){const saved=stored;try{if(!await context.db.attachment.findUnique({where:{storageKey:saved.storageKey},select:{id:true}}))await unlink(storagePath(saved.root,saved.storageKey));}catch{/* Fail closed; private orphan has no download route. */}}
 }
}
export async function download(request:Request,admin:boolean,id:string){
 if(!validUuid(id))throw new StartError(404,'Файл не найден.');const context=await owner(admin);
 const attachment=await context.db.attachment.findFirst({where:{id,...(admin?{}:{conversationId:context.conversationId})}});
 if(!attachment)throw new StartError(404,'Файл не найден.');
 const file=await open(storagePath(await storageRoot(),attachment.storageKey),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
 const stat=await file.stat();if(!stat.isFile()||stat.size!==attachment.byteSize)throw new StartError(404,'Файл не найден.');
 const headers=new Headers({'Content-Type':attachment.mediaType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes','Content-Disposition':`${attachment.mediaType==='application/pdf'?'attachment':'inline'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.displayFilename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`});
 let start=0,end=stat.size-1,status=200;const range=request.headers.get('range');
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){headers.set('Content-Range',`bytes */${stat.size}`);await file.close();return new Response(null,{status:416,headers});}
 if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){headers.set('Content-Range',`bytes */${stat.size}`);await file.close();return new Response(null,{status:416,headers});}status=206;headers.set('Content-Range',`bytes ${start}-${end}/${stat.size}`);}
 headers.set('Content-Length',String(end-start+1));
 return new Response(Readable.toWeb(file.createReadStream({start,end,autoClose:true})) as ReadableStream,{status,headers});
 }catch(e){await file.close();throw e;}
}
