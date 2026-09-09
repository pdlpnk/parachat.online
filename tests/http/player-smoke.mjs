import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
const database = process.env.TEST_DATABASE_URL;
if (!database || process.env.LINA_ALLOW_DB_TESTS !== '1' || !['127.0.0.1', 'localhost'].includes(new URL(database).hostname) || !/^\/lina_test(?:_[a-z0-9_]+)?$/.test(new URL(database).pathname)) throw new Error('Disposable local test DB required');
const origin = 'http://localhost:55440';
const pepper = randomBytes(32).toString('hex');
const pool = new Pool({ connectionString: database });
const servers = [55440, 55442].map((port) => spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), DATABASE_URL: database, LINA_ORIGIN: origin, CLIENT_CREDENTIAL_PEPPER: pepper },
  stdio: 'ignore',
}));
async function request(path, { port = 55440, cookie, body, originHeader = origin, method = 'GET' } = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { Origin: originHeader, 'Content-Type': 'application/json' } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function cookie(response, name) {
  return response.headers.getSetCookie().find((v) => v.startsWith(`${name}=`))?.split(';')[0];
}
try {
  for (const port of [55440, 55442]) {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await request('/api/health/live', { port })).ok) { ready = true; break; } } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'local server startup');
  }
  const anonymous = await (await request('/')).text();
  assert.match(anonymous, /Ваше имя/);
  assert.doesNotMatch(anonymous, /credentialHash|CLIENT_CREDENTIAL_PEPPER/);
  assert.equal((await request('/dev/messenger')).status, 404, 'design fixtures are unavailable in production');
  assert.ok(!(await (await request('/?preview=messenger')).text()).includes('Дизайн-превью'));
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/health/live')).status, 200);
  for (const path of ['/api/player/start', '/api/player/bootstrap']) {
    for (const bad of ['https://evil.invalid', 'null', '']) assert.equal((await request(path, { method: 'POST', originHeader: bad, body: { displayName: 'Evil' } })).status, 403);
  }
  const prepared = await request('/api/player/bootstrap', { method: 'POST' });
  const bootstrap = cookie(prepared, '__Host-lina_bootstrap');
  assert.ok(bootstrap);
  const again = await request('/api/player/bootstrap', { method: 'POST', cookie: bootstrap });
  assert.equal(cookie(again, '__Host-lina_bootstrap'), undefined, 'bootstrap lifetime is not extended');
  const invalid = await request('/api/player/start', { method: 'POST', cookie: bootstrap, body: { displayName: '   ' } });
  assert.equal(invalid.status, 400);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => request('/api/player/start', {
    port: i % 2 ? 55442 : 55440, method: 'POST', cookie: bootstrap, body: { displayName: '<b>Smoke Роман</b>', liId: 'LI000001', avatarEmoji: 'evil', authorType: 'OPERATOR' },
  })));
  assert.ok(responses.every((r) => r.status === 200));
  const credentials = responses.map((r) => cookie(r, '__Host-lina_client'));
  assert.equal(new Set(credentials).size, 1, 'two Node processes return one credential');
  const clientCookie = credentials[0];
  assert.ok(clientCookie);
  const raw = clientCookie.split('=')[1];
  for (const response of responses) {
    assert.deepEqual(await response.json(), { ok: true });
    const header = response.headers.getSetCookie().find((v) => v.startsWith('__Host-lina_client='));
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/']) assert.ok(header.includes(flag));
    assert.ok(!/domain=/i.test(header));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  // Lost all Set-Cookie responses: retry with only the still-installed bootstrap.
  const replay = await request('/api/player/start', { method: 'POST', cookie: bootstrap, body: { displayName: '<b>Smoke Роман</b>' } });
  assert.equal(cookie(replay, '__Host-lina_client'), clientCookie);
  const rendered = await (await request('/', { cookie: clientCookie })).text();
  assert.doesNotMatch(rendered, /Ваше имя/);
  assert.match(rendered, /&lt;b&gt;Smoke Роман&lt;\/b&gt;/);
  assert.ok(!rendered.includes(raw)); assert.ok(!rendered.includes(pepper));
  assert.doesNotMatch(rendered, /credentialHash|adminAuthorId|passwordHash/);
  const li = rendered.match(/LI[0-9]{6}/)[0];
  assert.ok((await (await request('/', { cookie: clientCookie, port: 55442 })).text()).includes(li));
  assert.match(await (await request(`/?liId=${li}`)).text(), /Ваше имя/);
  for (const token of ['malformed', li, randomBytes(32).toString('base64url')]) {
    const badCookie = `__Host-lina_client=${token}`;
    assert.match(await (await request('/', { cookie: badCookie })).text(), /Ваше имя/);
    const cleanup = await request('/api/player/bootstrap', { method: 'POST', cookie: badCookie });
    assert.ok(cleanup.headers.getSetCookie().some((v) => v.startsWith('__Host-lina_client=;') && /Max-Age=0/.test(v)));
  }
  const row = (await pool.query('SELECT c.id, cr."credentialHash", v."firstUserMessageAt", v."lastSequence", (SELECT count(*)::int FROM "Message" m WHERE m."conversationId"=v.id) AS messages FROM "Client" c JOIN "ClientCredential" cr ON cr."clientId"=c.id JOIN "Conversation" v ON v."clientId"=c.id WHERE c."liId"=$1', [li])).rows[0];
  assert.equal(row.messages, 1); assert.equal(row.lastSequence, 1); assert.equal(row.firstUserMessageAt, null);
  assert.notEqual(row.credentialHash, raw); assert.ok(!rendered.includes(row.credentialHash));
  await pool.query('UPDATE "ClientCredential" SET "revokedAt"=now() WHERE "clientId"=$1', [row.id]);
  assert.match(await (await request('/', { cookie: clientCookie })).text(), /Ваше имя/);
  assert.equal((await request('/api/player/start', { method: 'POST', cookie: bootstrap, body: { displayName: '<b>Smoke Роман</b>' } })).status, 409);
  const revokedCleanup = await request('/api/player/bootstrap', { method: 'POST', cookie: `${clientCookie}; ${bootstrap}` });
  assert.ok(cookie(revokedCleanup, '__Host-lina_bootstrap'));
  assert.notEqual(cookie(revokedCleanup, '__Host-lina_bootstrap'), bootstrap);
  for (const path of ['/api/messages', '/api/admin/login', `/api/client?liId=${li}`]) assert.equal((await request(path, { method: 'POST', body: {} })).status, 404);
  console.log('PASS: production HTTP flow, two-process parallel/lost-response retry, cookie flags, SSR escaping, DTO secrecy, invalid-cookie cleanup, origin enforcement, DB invariants, health and absent legacy/admin routes.');
} finally {
  await pool.end();
  await Promise.all(servers.map((child) => new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGTERM'); })));
}
