import {requireOrigin} from '@/server/identity/http';
import {messageContext,messageFailure,readBody} from '@/server/messages/http';
import {response} from '@/server/identity/http';
import {savePreferences} from '@/server/preferences/service';
export const runtime='nodejs';
export async function PATCH(request:Request){
 try{requireOrigin(request);const [db,raw,pepper]=await messageContext();
 const body=await readBody(request,'',512,true);
 return response(await savePreferences(db,raw,pepper,body));
 }catch(error){return messageFailure(error);}
}
