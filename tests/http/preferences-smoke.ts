import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const db=process.env.TEST_DATABASE_URL;
if(!db||process.env.LINA_ALLOW_DB_TESTS!=='1'||!['localhost','127.0.0.1'].includes(new URL(db).hostname)||!/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(db).pathname))throw Error('Disposable local DB required');
const origin='http://localhost:55440';const server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,DATABASE_URL:db,CLIENT_CREDENTIAL_PEPPER:randomBytes(32).toString('hex'),LINA_ORIGIN:origin,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'55440'},stdio:'ignore'});
const cookie=(r:Response,n:string)=>r.headers.getSetCookie().find(v=>v.startsWith(n+'='))!.split(';')[0]!;
async function req(path:string,method='GET',body?:unknown,c='',source=origin){return fetch(origin+path,{method,headers:{Origin:source,'Content-Type':'application/json',Cookie:c},body:body===undefined?undefined:JSON.stringify(body)});}
async function start(locale:string){const b=cookie(await req('/api/player/bootstrap','POST',{}),'__Host-lina_bootstrap');return cookie(await req('/api/player/start','POST',{displayName:'Stage6 QA',locale},b),'__Host-lina_client');}
try{
 for(let i=0;i<100;i++){try{if((await req('/api/health/live')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await req('/api/player/preferences','PATCH',{theme:'coral'})).status,401);
 const a=await start('FA'),b=await start('EN');
 for(const [patch,status] of [[{theme:'bad'},400],[{font:'bad'},400],[{locale:'DE'},400],[{clientId:'another',theme:'coral'},400],[{theme:'x'.repeat(600)},413]] as const)assert.equal((await req('/api/player/preferences','PATCH',patch,a)).status,status);
 assert.equal((await req('/api/player/preferences','PATCH',{theme:'coral'},a,'https://evil.invalid')).status,403);
 const r=await req('/api/player/preferences','PATCH',{theme:'coral',font:'tech',locale:'FA'},a);assert.equal(r.status,200);assert.deepEqual(await r.json(),{theme:'coral',font:'tech',locale:'FA'});assert.equal(r.headers.get('cache-control'),'no-store');
 const html=await (await req('/','GET',undefined,a)).text();assert.match(html,/data-theme="coral"/);assert.match(html,/data-font="tech"/);assert.match(html,/dir="rtl"/);assert.match(html,/dir="ltr">LI\d{6}/);assert.match(html,/سلام/);
 const other=await(await req('/','GET',undefined,b)).text();assert.match(other,/data-theme="light"/);assert.match(other,/lang="en"/);
 assert.equal((await req('/dev/messenger')).status,404);
 const before=await(await req('/api/player/messages?after=0','GET',undefined,a)).json();await req('/api/player/preferences','PATCH',{locale:'TR'},a);const after=await(await req('/api/player/messages?after=0','GET',undefined,a)).json();assert.deepEqual(after.messages,before.messages);assert.match(await(await req('/','GET',undefined,a)).text(),/Merhaba/);
 assert.doesNotMatch(JSON.stringify(after),/passwordHash|storageKey|uiTheme|adminTag|credentialHash/);
 console.log('PASS preferences HTTP: auth/Origin/body/whitelist/ownership, FA start, SSR theme/font/RTL/LI, locale welcome, safe DTO, preview 404');
}finally{await new Promise<void>(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',()=>resolve());server.kill('SIGTERM');});}
