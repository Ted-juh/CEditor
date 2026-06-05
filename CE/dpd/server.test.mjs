// Integration test for the library service: starts it on an ephemeral port and exercises the API.
// Run: node CE/dpd/server.test.mjs
import { createLibraryServer } from './server.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const mk = (id, params) => ({ schemaVersion: 1, id, version: '1.0.0', kind: 'model',
  scopes: { main: { kind: 'global', instances: 1, parameters: params } }, completeness: 'partial' });
const cutoff = { id: 'cutoff', valueType: 'continuous', address: '00 00 00 0C', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { read: true, write: true } };
const reso = { id: 'reso', valueType: 'continuous', address: '00 00 00 0F', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { read: true, write: true } };

const { server } = createLibraryServer({ persist: false });
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().then((j) => ({ code: r.status, j })));
const get = (path) => fetch(base + path).then((r) => r.json().then((j) => ({ code: r.status, j })));

try {
  let r = await post('/profiles', { profile: mk('roland.x', [cutoff]), user: '@a' });
  eq(r.j.status, 'created', 'POST new profile -> created');

  r = await post('/profiles', { profile: mk('x.bad', [{ ...cutoff, range: { min: 0, max: 200 } }]), user: '@a' });
  eq(r.code, 422, 'broken profile -> HTTP 422');
  eq(r.j.status, 'rejected', 'broken profile -> rejected by round-trip gate');

  r = await get('/profiles/roland.x/caution?op=bulkSend');
  ok(typeof r.j.caution === 'string', 'unconfirmed -> caution string on bulk send');

  r = await post('/profiles', { profile: mk('roland.x', [cutoff]), user: '@b' });
  eq(r.j.status, 'confirmed', 'identical resubmit -> confirmed');
  eq(r.j.confirmations, 2, 'confirmations = 2');

  r = await get('/profiles/roland.x/caution?op=bulkSend');
  eq(r.j.caution, null, 'confirmed (2) -> no caution');

  r = await post('/profiles', { profile: mk('roland.x', [cutoff, reso]), user: '@c' });
  eq(r.j.status, 'merged', 'superset -> merged');

  r = await get('/profiles');
  eq(r.j.profiles.map((x) => x.id), ['roland.x'], 'GET /profiles lists canonical ids');
  ok(r.j.profiles[0].version === '1.1.0', 'list shows merged version 1.1.0');

  r = await get('/profiles/roland.x/versions');
  eq(r.j.versions, ['1.0.0', '1.1.0'], 'GET versions');

  r = await get('/profiles/roland.x');
  ok(r.j.scopes.main.parameters.length === 2, 'GET canonical profile has merged params');

  r = await get('/reputation/@a');
  ok(r.j.reputation >= 1, 'reputation endpoint');
} finally {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
