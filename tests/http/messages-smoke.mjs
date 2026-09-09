import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
const database = process.env.TEST_DATABASE_URL;
if (!database || process.env.LINA_ALLOW_DB_TESTS !== '1' || !['127.0.0.1', 'localhost'].includes(new URL(database).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(database).pathname)) throw new Error('Disposable local test DB required');
const origin = 'http://localhost:55440', pepper = randomBytes(32).toString('hex');
const pool = new Pool({ connectionString: database });
const servers = [55440, 55442].map(port => spawn(process.execPath, ['.next/standalone/server.js'], { env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), DATABASE_URL: database, LINA_ORIGIN: origin, CLIENT_CREDENTIAL_PEPPER: pepper }, stdio: 'ignore' }));
async function req(path, { port = 55440, cookie, body, rawBody, key, originHeader = origin, method = 'GET', headers = {} } = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { Origin: originHeader, 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...headers }, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
}
const cookieOf = (r, name) => r.headers.getSetCookie().find(v => v.startsWith(`${name}=`))?.split(';')[0];
let assertions = 0;
async function status(path, options, expected) {
  const response = await req(path, options); assert.equal(response.status, expected, `${options.method ?? 'GET'} ${path}`); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.doesNotMatch(JSON.stringify(result), /credentialHash|clientAuthorId|adminAuthorId|conversationId|passwordHash|Prisma|SELECT|stack/); assertions++; return result;
}
async function identity(name) {
  const bootstrap = cookieOf(await req('/api/player/bootstrap', { method: 'POST' }), '__Host-lina_bootstrap');
  const r = await req('/api/player/start', { method: 'POST', cookie: bootstrap, body: { displayName: name } }); assert.equal(r.status, 200);
  return cookieOf(r, '__Host-lina_client');
}
try {
  for (const port of [55440, 55442]) {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await req('/api/health/live', { port })).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready);
  }
  const cookie = await identity('Stage3 HTTP'), key = randomUUID();
  const send = (text, extra = {}) => ({ method: 'POST', cookie, key: randomUUID(), body: { text }, ...extra });
  const first = await status('/api/player/messages', send('<b>real text</b>\nУкраїна 😀', { key }), 200);
  assert.deepEqual(Object.keys(first.message).sort(), ['authorType', 'createdAt', 'sequence', 'text']); assert.equal(first.message.sequence, 2);
  assert.deepEqual(await status('/api/player/messages', send('<b>real text</b>\nУкраїна 😀', { key, port: 55442 }), 200), first);
  await status('/api/player/messages', send('different', { key }), 409);
  for (const badKey of [undefined, 'short', randomUUID().toUpperCase()]) await status('/api/player/messages', send('hello', { key: badKey }), 400);
  for (const text of ['', ' \n\t', '😀'.repeat(5001)]) await status('/api/player/messages', send(text), 400);
  await status('/api/player/messages', send('x', { rawBody: JSON.stringify({ text: 'a'.repeat(70000) }) }), 413);
  await status('/api/player/messages', send('x', { rawBody: '{bad json' }), 400);
  await status('/api/player/messages', send('x', { headers: { 'Content-Type': 'text/plain' } }), 415);
  for (const field of ['conversationId', 'clientId', 'liId', 'authorType', 'sequence', 'createdAt', 'idempotencyKey']) await status('/api/player/messages', send('x', { body: { text: 'x', [field]: 'forged' } }), 400);
  for (const path of ['/api/player/messages', '/api/player/read']) {
    for (const bad of ['https://evil.invalid', '', 'null']) await status(path, send('x', { originHeader: bad }), 403);
    await status(path, send('x', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
  }
  for (const badCookie of [undefined, '__Host-lina_client=LI000001', '__Host-lina_client=invalid', `__Host-lina_client=${randomBytes(32).toString('base64url')}`]) {
    await status('/api/player/messages', send('x', { cookie: badCookie }), 401);
    await status('/api/player/messages?after=0', { cookie: badCookie }, 401);
    await status('/api/player/read', { method: 'POST', cookie: badCookie, body: { sequence: 1 } }, 401);
  }
  const next = await status('/api/player/messages?after=1', { cookie }, 200); assert.deepEqual(next.messages, [first.message]); assert.equal(next.hasMore, false);
  assert.deepEqual((await status('/api/player/messages?after=2', { cookie }, 200)).messages, []);
  for (const query of ['', '?after=-1', '?after=1.5', '?after=2147483648', '?after=1&conversationId=other', '?after=1&after=2']) await status(`/api/player/messages${query}`, { cookie }, 400);
  await status('/api/player/read', { method: 'POST', cookie, body: { sequence: 2 } }, 200);
  assert.equal((await status('/api/player/read', { method: 'POST', cookie, body: { sequence: 1 } }, 200)).readSequence, 2);
  await status('/api/player/read', { method: 'POST', cookie, body: { sequence: 999999 } }, 400);
  await status('/api/player/read', { method: 'POST', cookie, body: { sequence: 2, conversationId: 'other' } }, 400);
  const html = await (await req('/', { cookie })).text(); assert.match(html, /&lt;b&gt;real text&lt;\/b&gt;/); assert.doesNotMatch(html, /<b>real text<\/b>/); assert.ok(!html.includes(pepper)); assert.ok(!html.includes(cookie.split('=')[1]));
  const sharedKey = randomUUID(); const same = await Promise.all(Array.from({ length: 12 }, (_, i) => status('/api/player/messages', send('parallel retry', { key: sharedKey, port: i % 2 ? 55440 : 55442 }), 200)));
  assert.equal(new Set(same.map(r => r.message.sequence)).size, 1);
  const unique = await Promise.all(Array.from({ length: 8 }, (_, i) => status('/api/player/messages', send('intentional same text', { port: i % 2 ? 55440 : 55442 }), 200)));
  assert.equal(new Set(unique.map(r => r.message.sequence)).size, 8);
  await Promise.all([2, 10, 4, 11, 3].map((sequence, i) => status('/api/player/read', { method: 'POST', port: i % 2 ? 55440 : 55442, cookie, body: { sequence } }, 200)));
  assert.equal((await status('/api/player/messages?after=11', { cookie }, 200)).readSequence, 11);
  const li = html.match(/LI[0-9]{6}/)[0]; const row = (await pool.query('SELECT v.* FROM "Conversation" v JOIN "Client" c ON c.id=v."clientId" WHERE c."liId"=$1', [li])).rows[0];
  const rows = (await pool.query('SELECT * FROM "Message" WHERE "conversationId"=$1 AND "authorType"=\'USER\' ORDER BY sequence', [row.id])).rows;
  assert.equal(row.firstUserMessageAt.toISOString(), rows[0].createdAt.toISOString()); assert.equal(row.lastMessageAt.toISOString(), rows.at(-1).createdAt.toISOString());
  for (let i = 0; i < 20; i++) await status('/api/player/messages', send(`rate ${i}`), 200);
  await status('/api/player/messages', send('over rate', { port: 55442 }), 429);
  assert.deepEqual(await status('/api/player/messages', send('<b>real text</b>\nУкраїна 😀', { key }), 200), first);
  const stranger = await identity('Stage3 isolated'); assert.equal((await status('/api/player/messages?after=0', { cookie: stranger }, 200)).messages.length, 1);
  await pool.query('UPDATE "Conversation" SET "closedAt"=clock_timestamp() WHERE id=$1', [row.id]);
  await status('/api/player/messages', send('<b>real text</b>\nУкраїна 😀', { key }), 200);
  assert.ok((await pool.query('SELECT "closedAt" FROM "Conversation" WHERE id=$1', [row.id])).rows[0].closedAt);
  await pool.query('UPDATE "ClientCredential" SET "revokedAt"=clock_timestamp() WHERE "clientId"=$1', [row.clientId]);
  await status('/api/player/messages', send('revoked'), 401); await status('/api/player/messages?after=0', { cookie }, 401); await status('/api/player/read', { method: 'POST', cookie, body: { sequence: 1 } }, 401);
  assert.equal((await req('/dev/messenger')).status, 404);
  console.log(`PASS: ${assertions} production HTTP responses checked, two Node processes, safe DTO/errors, CSRF, bounded bodies, real send/reload, retry, concurrent sequence/activation/read/rate and revoked session.`);
} finally {
  await pool.end(); await Promise.all(servers.map(child => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGTERM'); })));
}
