import 'server-only';
import { cookies } from 'next/headers';
import { getDatabase } from '../db';
import { getServerEnv } from '../env';
import { StartError } from '../identity/service';
export function adminCookie() {
  const secure=getServerEnv().NODE_ENV==='production';
  return { name:secure?'__Host-lina_admin':'lina_admin', flags:{httpOnly:true,secure,sameSite:'lax' as const,path:'/'} };
}
export async function adminContext() { return [getDatabase(),(await cookies()).get(adminCookie().name)?.value] as const; }
export async function adminBody(request: Request, fields: string[], limit=2048): Promise<Record<string,unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new StartError(415,'Ожидается JSON.');
  const reader=request.body?.getReader(); if (!reader) throw new StartError(400,'Пустой запрос.');
  const chunks:Uint8Array[]=[]; let length=0;
  try { for (;;) { const {value,done}=await reader.read(); if(done)break; length+=value.length;
    if(length>limit){await reader.cancel();throw new StartError(413,'Запрос слишком большой.');} chunks.push(value);
  }} finally {reader.releaseLock();}
  let value; try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));} catch {throw new StartError(400,'Некорректный JSON.');}
  if(!value || Array.isArray(value) || typeof value!=='object' || Object.keys(value).length!==fields.length || fields.some(f=>!Object.hasOwn(value,f)))throw new StartError(400,'Некорректные поля запроса.');
  return value;
}
