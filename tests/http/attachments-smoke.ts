import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {passwordHash} from '../../src/server/admin/password';
import {ADMIN_ACCOUNT_EMAIL} from '../../src/server/admin/account';
const database=process.env.TEST_DATABASE_URL;
if(!database||process.env.LINA_ALLOW_DB_TESTS!=='1'||!['localhost','127.0.0.1'].includes(new URL(database).hostname)||!/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(database).pathname))throw Error('Disposable local DB required');
const storage=await mkdtemp(join(tmpdir(),'lina-upload-test-')),origin='http://localhost:55440',pool=new Pool({connectionString:database});
const server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'55440',DATABASE_URL:database,LINA_ORIGIN:origin,CLIENT_CREDENTIAL_PEPPER:randomBytes(32).toString('hex'),ATTACHMENT_STORAGE_DIR:storage},stdio:'ignore'});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64');
async function req(path:string,cookie?:string,body?:unknown){return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
function cookie(r:Response,name:string){return r.headers.getSetCookie().find(s=>s.startsWith(name+'='))!.split(';')[0]!;}
async function player(){const b=cookie(await req('/api/player/bootstrap',undefined,{}),'__Host-lina_bootstrap');return cookie(await req('/api/player/start',b,{displayName:'Attachment HTTP'}),'__Host-lina_client');}
async function upload(cookie:string|undefined,key=randomUUID(),text='',name='photo.png',mime='image/png',bytes:Buffer=png,path='/api/player/attachments',source=origin){const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)],{type:mime}),name);form.set('text',text);return fetch(origin+path,{method:'POST',headers:{Origin:source,'Idempotency-Key':key,...(cookie?{Cookie:cookie}:{})},body:form});}
let checks=0;function status(r:Response,expected:number){assert.equal(r.status,expected);checks++;return r;}
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await req('/api/health/live')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await pool.query('DELETE FROM "AdminLoginThrottle"');const pass='Attachment HTTP fixture password';await pool.query('INSERT INTO "Admin"(id,email,"displayName","passwordHash","updatedAt") VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash","disabledAt"=NULL',[randomUUID(),ADMIN_ACCOUNT_EMAIL,'QA',await passwordHash(pass)]);
 const admin=cookie(status(await req('/api/admin/login',undefined,{password:pass}),200),'__Host-lina_admin'),a=await player(),b=await player();
 status(await upload(undefined),401);status(await upload(admin),401);status(await upload(a,randomUUID(),'','a.png','image/png',png,'/api/player/attachments','https://evil.invalid'),403);
 status(await upload(a,randomUUID(),'','a.jpg'),415);status(await upload(a,randomUUID(),'','a.png','image/png',Buffer.from('<html>')),415);status(await upload(a,randomUUID(),'','a.png','image/png',Buffer.alloc(10*1024*1024+1)),413);
 const key=randomUUID(),sent=await status(await upload(a,key,'caption'),200).json();const id=sent.message.attachments[0].id;assert.equal(sent.message.text,'caption');assert.deepEqual(await status(await upload(a,key,'caption'),200).json(),sent);status(await upload(a,key,'different'),409);assert.equal((await readdir(storage)).length,2); // Conflicting request leaves an unreferenced private orphan for age-gated cleanup.
 const read=status(await req('/api/player/attachments/'+id,a),200);assert.equal(read.headers.get('x-content-type-options'),'nosniff');assert.equal(read.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await read.arrayBuffer()),png);
 status(await req('/api/player/attachments/'+id,b),404);status(await req('/api/player/attachments/'+id),401);status(await req('/api/admin/attachments/'+id,a),401);status(await req('/api/admin/attachments/'+id,admin),200);
 const range=status(await fetch(origin+'/api/player/attachments/'+id,{headers:{Cookie:a,Range:'bytes=0-7'}}),206);assert.equal(range.headers.get('content-range'),`bytes 0-7/${png.length}`);assert.equal((await range.arrayBuffer()).byteLength,8);
 status(await fetch(origin+'/api/player/attachments/'+id,{headers:{Cookie:a,Range:'bytes=999999-'}}),416);
 const row=(await pool.query('SELECT "conversationId" FROM "Attachment" WHERE id=$1',[id])).rows[0];
 const pdf=await status(await upload(admin,randomUUID(),'','note.pdf','application/pdf',Buffer.from('%PDF-1.7\n%%EOF\n'),`/api/admin/conversations/${row.conversationId}/attachments`),200).json();const pdfId=pdf.message.attachments[0].id;
 assert.match(status(await req('/api/player/attachments/'+pdfId,a),200).headers.get('content-disposition')!,/^attachment;/);assert.equal(pdf.message.text,'');
 const poll=await status(await req('/api/player/messages?after=0',a),200).json();assert.equal(poll.messages.at(-1).attachments[0].id,pdfId);assert.doesNotMatch(JSON.stringify(poll),/storageKey|checksum|passwordHash/);
 await writeFile(join(storage,'not-a-storage-key'),'private');status(await req('/api/player/attachments/not-a-storage-key',a),404);
 const t=await status(await req('/api/admin/tags',admin,{name:'Color '+randomUUID(),color:'blue'}),200).json();assert.equal(t.color,'blue');status(await req('/api/admin/tags',admin,{name:'bad',color:'#fff'}),400);
 console.log(`PASS: ${checks} attachment HTTP checks: private storage, multipart limits, ownership, retry, byte ranges, PDF download, text/attachment-only, colors.`);
}finally{await pool.end();await new Promise<void>(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',()=>resolve());server.kill('SIGTERM');});await rm(storage,{recursive:true,force:true});}
