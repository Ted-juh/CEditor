// Layer 3 community library service — a real HTTP backend over the flywheel curation logic
// (tools/library.mjs). Dependency-free (node:http). File-persisted. This is the server the
// "needs a backend" item called for; auth/scale are production concerns layered on top.
// Run: node CE/dpd/server.mjs   (PORT env, default 8787)
import { createServer as httpCreate } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library } from './tools/library.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = join(HERE, 'build', 'library-store.json');

export function createLibraryServer({ persist = true } = {}) {
  const lib = new Library();
  if (persist && existsSync(STORE)) {
    try { const d = JSON.parse(readFileSync(STORE, 'utf8')); lib.entries = new Map(d.entries); lib.reputation = new Map(d.reputation); } catch {}
  }
  const save = () => { if (!persist) return; mkdirSync(dirname(STORE), { recursive: true }); writeFileSync(STORE, JSON.stringify({ entries: [...lib.entries], reputation: [...lib.reputation] }, null, 2)); };

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });

  const server = httpCreate(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && p[0] === 'profiles' && p.length === 1) {
        const profiles = [...lib.entries.keys()].map((id) => { const c = lib.canonical(id); return { id, version: c.version, confirmations: c.confirmations, completeness: c.profile.completeness, hardwareVerified: c.hardwareVerified }; });
        return json(res, 200, { profiles });
      }
      if (req.method === 'GET' && p[0] === 'profiles' && p[2] === 'versions') return json(res, 200, { versions: lib.versionList(p[1]) });
      if (req.method === 'GET' && p[0] === 'profiles' && p[2] === 'caution') return json(res, 200, { caution: lib.cautionFor(p[1], url.searchParams.get('op')) });
      if (req.method === 'GET' && p[0] === 'profiles' && p.length === 2) { const c = lib.canonical(p[1]); return c ? json(res, 200, c.profile) : json(res, 404, { error: 'not found' }); }
      if (req.method === 'GET' && p[0] === 'reputation' && p[1]) return json(res, 200, { user: p[1], reputation: lib.rep(p[1]) });
      if (req.method === 'POST' && p[0] === 'profiles' && p.length === 1) {
        const b = await readBody(req);
        const result = lib.submit(b.profile, b.user ?? '@anon', { hardwareVerified: !!b.hardwareVerified });
        save();
        return json(res, result.status === 'rejected' ? 422 : 200, result);
      }
      if (req.method === 'POST' && p[2] === 'pin') { const b = await readBody(req); const r = lib.pin(p[1], b.version); save(); return json(res, 200, r); }
      return json(res, 404, { error: 'unknown route' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  });
  return { server, lib };
}

if (process.argv[1]?.endsWith('server.mjs')) {
  const port = process.env.PORT ?? 8787;
  createLibraryServer().server.listen(port, () => console.log(`DPD library service on http://localhost:${port}  (GET /profiles, POST /profiles, ...)`));
}
