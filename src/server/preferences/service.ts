import type {PrismaClient} from '../../generated/prisma/client';
import {preferencePatch,type Preferences} from '../../lib/preferences';
import {authenticate} from '../messages/service';
import {StartError} from '../identity/service';
const rates=new Map<string,{start:number;count:number}>();
export async function savePreferences(db:PrismaClient,raw:string|undefined,pepper:string,input:unknown):Promise<Preferences>{
 const patch=preferencePatch(input);if(!patch)throw new StartError(400,'Некорректные настройки.');
 return db.$transaction(async tx=>{
  const owner=await authenticate(tx,raw,pepper);
  const now=Date.now();for(const [id,b] of rates)if(now-b.start>=60000)rates.delete(id);
  const bucket=rates.get(owner.clientId)??{start:now,count:0};
  if(bucket.count>=30||(!rates.has(owner.clientId)&&rates.size>=10000))throw new StartError(429,"Слишком много запросов.");
  bucket.count++;rates.set(owner.clientId,bucket);
  // Shared advisory lock bounds writes across Node processes without changing identity/activity timestamps.
  const locked=await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${owner.clientId}, 6)) AS locked`;
  if(!locked[0]?.locked)throw new StartError(429,'Настройки сохраняются. Повторите попытку.');
  const c=await tx.client.update({where:{id:owner.clientId},data:{...(patch.theme?{uiTheme:patch.theme}:{}),...(patch.font?{uiFont:patch.font}:{}),...(patch.locale?{locale:patch.locale}:{})},select:{uiTheme:true,uiFont:true,locale:true}});
  return {theme:c.uiTheme,font:c.uiFont,locale:c.locale} as Preferences;
 });
}
