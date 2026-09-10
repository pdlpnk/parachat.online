export class AdminRequestError extends Error { constructor(public status:number,message:string){super(message);} }
export async function adminRequest<T>(url:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(10000),...(options.signal?[options.signal]:[])])});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new AdminRequestError(response.status,typeof body.error==='string'?body.error:'Запрос не выполнен. Повторите попытку.');
  return body as T;
}
export const jsonRequest=(body:object,method='POST'):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
