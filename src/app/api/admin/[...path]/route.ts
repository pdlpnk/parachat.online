import { upload,download } from '@/server/attachments/http';
import { response, requireOrigin } from '@/server/identity/http';
import { StartError } from '@/server/identity/service';
import { messageFailure } from '@/server/messages/http';
import { adminBody, adminContext, adminCookie } from '@/server/admin/http';
import { adminLogin, adminLogout } from '@/server/admin/auth';
import { adminHistory, adminRead, adminSend, attachTag, changeTag, listConversations, listTags, setArchive } from '@/server/admin/messenger';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function handle(request:Request,ctx:Context){
  try {
    const {path}=await ctx.params, method=request.method;
    if(method!=='GET')requireOrigin(request);
    if(method==='POST'&&path.length===3&&path[0]==='conversations'&&path[2]==='attachments')return await upload(request,true,path[1]);
    if(method==='GET'&&path.length===2&&path[0]==='attachments')return await download(request,true,path[1]!);
    const context=await adminContext(), query=new URL(request.url).searchParams;
    if(method==='POST' && path.join('/')==='login'){
      const b=await adminBody(request,['password']); const session=await adminLogin(context[0],b.password);
      const result=response({ok:true});const c=adminCookie();result.cookies.set(c.name,session.raw,{...c.flags,expires:session.expiresAt});return result;
    }
    if(method==='POST' && path.join('/')==='logout'){
      await adminBody(request,[]);await adminLogout(...context);const result=response({ok:true});const c=adminCookie();result.cookies.set(c.name,'',{...c.flags,maxAge:0});return result;
    }
    if(method==='GET' && path.join('/')==='conversations'){
      if([...query.keys()].some(k=>!['state','q','tag','page'].includes(k)) || new Set(query.keys()).size!==query.size || (query.has('page')&&!/^(0|[1-9][0-9]{0,5})$/.test(query.get('page')!)))throw new StartError(400,'Некорректный фильтр.');
      return response(await listConversations(...context,{state:query.get('state')??'active',q:query.get('q')??'',tag:query.get('tag')??'',page:Number(query.get('page')??0)}));
    }
    if(path[0]==='conversations' && path.length===3){
      const id=path[1]!,action=path[2];
      if(method==='GET' && action==='messages'){
        if(query.size>1 || (query.size===1&&(!query.has('after')||!/^(0|[1-9][0-9]{0,9})$/.test(query.get('after')!))))throw new StartError(400,'Некорректная позиция.');
        return response(await adminHistory(...context,id,query.has('after')?Number(query.get('after')):undefined));
      }
      if(method==='POST' && action==='messages'){const b=await adminBody(request,['text'],65536);return response({message:await adminSend(...context,id,b.text,request.headers.get('idempotency-key'))});}
      if(method==='POST' && action==='read'){const b=await adminBody(request,['sequence'],512);return response(await adminRead(...context,id,b.sequence));}
      if(method==='POST' && action==='state'){const b=await adminBody(request,['closed'],512);return response(await setArchive(...context,id,b.closed));}
      if(method==='POST' && action==='tags'){const b=await adminBody(request,['tagId','attached'],512);return response(await attachTag(...context,id,b.tagId,b.attached));}
    }
    if(path[0]==='tags'&&path.length===1){
      if(method==='GET')return response({tags:await listTags(...context)});
      if(method==='POST'){const b=await adminBody(request,['name','color']);return response(await changeTag(...context,'create',undefined,b.name,b.color));}
    }
    if(path[0]==='tags'&&path.length===2){
      if(method==='PATCH'){const b=await adminBody(request,['name','color']);return response(await changeTag(...context,'rename',path[1],b.name,b.color));}
      if(method==='DELETE'){await adminBody(request,[]);return response(await changeTag(...context,'delete',path[1]));}
    }
    return response({error:'Не найдено.'},404);
  }catch(e){return messageFailure(e);}
}
export const GET=handle,POST=handle,PATCH=handle,DELETE=handle;
