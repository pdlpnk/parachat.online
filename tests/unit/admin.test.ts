import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminEmail,tagName,adminSearch,validUuid } from '../../src/lib/admin';
import { adminTokenHash,passwordHash,verifyPassword,validPassword } from '../../src/server/admin/password';
import { credentialHash } from '../../src/server/identity/crypto';
import { randomBytes,randomUUID } from 'node:crypto';
test('admin input normalizes email, tag whitespace/NFC, literal search and UUID',()=>{
 assert.equal(adminEmail(' Manager@Example.com '),'manager@example.com');assert.equal(adminEmail('x'),null);
 assert.deepEqual(tagName('  VIP   Клиент '),{name:'VIP Клиент',normalizedName:'vip клиент'});assert.equal(tagName('x'.repeat(61)),null);assert.equal(tagName('\u200b'),null);
 assert.equal(adminSearch(' li000001 '),'li000001');assert.ok(validUuid(randomUUID()));assert.ok(!validUuid('LI000001'));
});
test('scrypt uses independent salts, verifies without plaintext storage and rejects wrong password',async()=>{
 const pass='Test-only password 42';const a=await passwordHash(pass),b=await passwordHash(pass);assert.notEqual(a,b);assert.ok(!a.includes(pass));assert.ok(await verifyPassword(pass,a));assert.ok(!await verifyPassword('Wrong password 42',a));assert.ok(!await verifyPassword(pass,undefined));
 assert.ok(!validPassword('short'));assert.ok(!validPassword('a'.repeat(129)));assert.ok(!validPassword('password\u0000abc'));
});
test('admin token hash is distinct from player HMAC and never raw',()=>{const raw=randomBytes(32).toString('base64url');const hash=adminTokenHash(raw);assert.match(hash,/^[a-f0-9]{64}$/);assert.notEqual(hash,raw);assert.notEqual(hash,credentialHash(raw,'a'.repeat(64)));});
