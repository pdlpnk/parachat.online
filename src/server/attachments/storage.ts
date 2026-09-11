import { constants } from 'node:fs';
import { mkdir,open,realpath,unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StartError } from '../identity/service';
export async function storageRoot(){
 const configured=process.env.ATTACHMENT_STORAGE_DIR;
 if(!configured||!path.isAbsolute(configured))throw new StartError(503,'Хранилище вложений не настроено.');
 const root=path.resolve(configured);
 if(root==='/'||root.split(path.sep).some(p=>['public','.next','static'].includes(p)))throw new StartError(503,'Хранилище вложений недоступно.');
 await mkdir(root,{recursive:true,mode:0o700});
 const canonical=await realpath(root);
 if(canonical==='/'||canonical.split(path.sep).some(p=>['public','.next','static'].includes(p)))throw new StartError(503,'Хранилище вложений недоступно.');
 return canonical;
}
export function storagePath(root:string,key:string){if(!/^[a-f0-9]{32}$/.test(key))throw new StartError(404,'Файл не найден.');return path.join(root,key);}
export async function storeFile(bytes:Buffer){const root=await storageRoot(),storageKey=randomUUID().replaceAll('-',''),file=await open(storagePath(root,storageKey),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(bytes);await file.sync();}catch(e){await unlink(storagePath(root,storageKey)).catch(()=>{});throw e;}finally{await file.close();}return {root,storageKey};}
