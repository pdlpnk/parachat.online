import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ADMIN_ACCOUNT_EMAIL } from '../../src/server/admin/account';
import { passwordHash } from '../../src/server/admin/password';
const database=process.env.TEST_DATABASE_URL;
if(!database||process.env.LINA_ALLOW_DB_TESTS!=='1'||!['localhost','127.0.0.1'].includes(new URL(database).hostname)||!/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(database).pathname))throw Error('Disposable local test DB required');
const origin='http://localhost:55440',pool=new Pool({connectionString:database});
const server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'55440',DATABASE_URL:database,LINA_ORIGIN:origin,CLIENT_CREDENTIAL_PEPPER:randomBytes(32).toString('hex')},stdio:'ignore'});
let checks=0;
type Options={method?:string;cookie?:string;body?:unknown;origin?:string;key?:string;raw?:string};
async function req(path:string,o:Options={}){return fetch(`http://127.0.0.1:55440${path}`,{method:o.method??'GET',redirect:'manual',headers:{...(o.cookie?{Cookie:o.cookie}:{}),Origin:o.origin??origin,'Content-Type':'application/json',...(o.key?{'Idempotency-Key':o.key}:{})},body:o.raw??(o.body===undefined?undefined:JSON.stringify(o.body))});}
async function check(path:string,o:Options,code:number){const r=await req(path,o);assert.equal(r.status,code,path);assert.equal(r.headers.get('cache-control'),'no-store');const data=await r.json();assert.doesNotMatch(JSON.stringify(data),/passwordHash|tokenHash|adminAuthorId|credentialHash|Prisma|stack/);checks++;return data;}
function cookie(r:Response,name:string){return r.headers.getSetCookie().find(v=>v.startsWith(name+'='))!.split(';')[0]!;}
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await req('/api/health/live')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const email=ADMIN_ACCOUNT_EMAIL,password='HTTP test password!';
 await pool.query('INSERT INTO "Admin" (id,email,"displayName","passwordHash","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()) ON CONFLICT (email) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "disabledAt"=NULL',[randomUUID(),email,'HTTP admin',await passwordHash(password)]);
 await pool.query('DELETE FROM "AdminLoginThrottle"');
 const landing=await req('/admin');assert.equal(landing.status,200);const html=await landing.text();assert.match(html,/type="password"/);assert.doesNotMatch(html,/type="email"|shared-admin@lina.invalid/);assert.equal((html.match(/<input\b/g)??[]).length,1);assert.equal((await req('/admin/login')).status,307);
 await check('/api/admin/login',{method:'POST',body:{email,password}},400);
 await check('/api/admin/login',{method:'POST',body:{}},400);
 await check('/api/admin/conversations',{},401);await check('/api/admin/tags',{},401);
 for(const bad of ['https://evil.invalid','null',''])await check('/api/admin/login',{method:'POST',origin:bad,body:{password}},403);
 await check('/api/admin/login',{method:'POST',raw:'x'.repeat(2049)},413);
 await check('/api/admin/login',{method:'POST',body:{password:'incorrect password'}},401);
 const login=await req('/api/admin/login',{method:'POST',body:{password}});assert.equal(login.status,200);const admin=cookie(login,'__Host-lina_admin');assert.match(login.headers.get('set-cookie')!,/HttpOnly/i);assert.match(login.headers.get('set-cookie')!,/Secure/i);assert.match(login.headers.get('set-cookie')!,/SameSite=lax/i);assert.match(login.headers.get('set-cookie')!,/Path=\//i);
 const workspace=await req('/admin',{cookie:admin});assert.equal(workspace.status,200);assert.doesNotMatch(await workspace.text(),/type="password"|HTTP admin|shared-admin@lina.invalid/);
 const bootstrap=cookie(await req('/api/player/bootstrap',{method:'POST'}),'__Host-lina_bootstrap');
 const player=cookie(await req('/api/player/start',{method:'POST',cookie:bootstrap,body:{displayName:'HTTP stage4'}}),'__Host-lina_client');
 await check('/api/admin/conversations',{cookie:player},401);await check('/api/player/messages?after=0',{cookie:admin},401);
 const list=await check('/api/admin/conversations?state=archive&q=HTTP%20stage4',{cookie:admin},200),id=list.conversations[0].id,base=`/api/admin/conversations/${id}`;
 const key=randomUUID(),send={method:'POST',cookie:admin,key,body:{text:'Reply\n😀 <b>literal</b>'}};
 const reply=await check(base+'/messages',send,200);assert.equal(reply.message.authorType,'OPERATOR');
 assert.deepEqual(await check(base+'/messages',send,200),reply);await check(base+'/messages',{...send,body:{text:'changed'}},409);
 for(const body of [{text:'x',authorType:'USER'},{text:''},{text:'😀'.repeat(5001)}])await check(base+'/messages',{...send,key:randomUUID(),body},400);
 await check(base+'/messages',{...send,raw:'x'.repeat(65537)},413);await check(base+'/messages',{...send,origin:'https://evil.invalid'},403);
 const seen=await check('/api/player/messages?after=1',{cookie:player},200);assert.deepEqual(seen.messages,[reply.message]);
 await check('/api/player/messages',{method:'POST',cookie:player,key:randomUUID(),body:{text:'User incoming'}},200);
 const detail=await check(base+'/messages',{cookie:admin},200);assert.equal(detail.unreadCount,1);assert.equal(detail.conversation.active,true);
 await check(base+'/read',{method:'POST',cookie:admin,body:{sequence:3}},200);
 await check(base+'/state',{method:'POST',cookie:admin,body:{closed:true}},200);
 const tag=await check('/api/admin/tags',{method:'POST',cookie:admin,body:{name:'HTTP '+randomUUID(),color:'blue'}},200);
 await check(base+'/tags',{method:'POST',cookie:admin,body:{tagId:tag.id,attached:true}},200);
 await check('/api/admin/tags/'+tag.id,{method:'PATCH',cookie:admin,body:{name:'Renamed '+randomUUID(),color:'blue'}},200);
 assert.equal((await check('/api/admin/conversations?state=archive&tag='+tag.id,{cookie:admin},200)).total,1);
 await check('/api/admin/tags/'+tag.id,{method:'DELETE',cookie:admin,body:{}},200);
 await check('/api/admin/logout',{method:'POST',cookie:admin,body:{}},200);await check(base+'/messages',{cookie:admin},401);
 await pool.query('DELETE FROM "AdminLoginThrottle"');
 for(let i=0;i<20;i++)await check('/api/admin/login',{method:'POST',body:{password:'x'}},401);
 await check('/api/admin/login',{method:'POST',body:{password}},429);
 assert.equal((await req('/dev/messenger')).status,404);await check('/api/admin/signup',{method:'POST',body:{}},404);
 console.log(`PASS: ${checks} admin HTTP checks, production cookies/SSR, isolation, origin, body limits, send/retry/player polling, read/archive/tags/logout/login ceiling.`);
}finally{await pool.end();await new Promise<void>(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',()=>resolve());server.kill('SIGTERM');});}
