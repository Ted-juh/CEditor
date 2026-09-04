import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizeSha256, crashWorkerIdentity, normalizeSymbolManifest,
  matchingSymbolArchives, verifySymbolMatch,
} from '../../../tools/scripts/resolve-worker-symbols.mjs';

const workerHash = 'a'.repeat(64);
const pdbHash = 'b'.repeat(64);
const manifestPath = path.join('/private', '1.2.3', workerHash.slice(0, 16), 'symbols.json');
const manifest = {
  schemaVersion: 1,
  visibility: 'private-not-shipped',
  product: { name: 'Hostage', version: '1.2.3' },
  binary: { name: 'CEditorPluginWorker.exe', sha256: workerHash },
  symbols: { name: 'CEditorPluginWorker.pdb', sha256: pdbHash },
};

test('worker SHA-256 identity is strict and case-normalized', () => {
  assert.equal(normalizeSha256(workerHash.toUpperCase()), workerHash);
  assert.equal(normalizeSha256('../not-a-hash'), null);
  assert.deepEqual(crashWorkerIdentity({ workerSha256: workerHash, plugin: 'Synth' }), {
    ok: true, workerSha256: workerHash, plugin: 'Synth', generation: null,
  });
});

test('symbol manifests cannot escape their private archive directory', () => {
  assert.equal(normalizeSymbolManifest({
    ...manifest, symbols: { name: '../CEditorPluginWorker.pdb', sha256: pdbHash },
  }, manifestPath), null);
  assert.equal(normalizeSymbolManifest({
    ...manifest, symbols: { name: '..\\CEditorPluginWorker.pdb', sha256: pdbHash },
  }, manifestPath), null);
  assert.equal(normalizeSymbolManifest({ ...manifest, visibility: 'customer-stage' }, manifestPath), null);
});

test('only the exact worker hash selects a private symbol archive', () => {
  const candidates = [
    { manifestPath, manifest },
    { manifestPath: '/private/other/symbols.json',
      manifest: { ...manifest, binary: { ...manifest.binary, sha256: 'c'.repeat(64) } } },
  ];
  const result = matchingSymbolArchives({ workerSha256: workerHash, plugin: 'Synth' }, candidates);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].pdbPath,
    path.join(path.dirname(manifestPath), 'CEditorPluginWorker.pdb'));
});

test('a selected PDB still has to pass its archived content hash', async () => {
  const match = normalizeSymbolManifest(manifest, manifestPath);
  assert.deepEqual(await verifySymbolMatch(match, {
    exists: () => true, hash: async () => pdbHash,
  }), { ok: true, pdbPath: match.pdbPath });
  assert.match((await verifySymbolMatch(match, {
    exists: () => true, hash: async () => 'c'.repeat(64),
  })).error, /failed its archived SHA-256/);
  assert.match((await verifySymbolMatch(match, {
    exists: () => false, hash: async () => pdbHash,
  })).error, /missing/);
});

test('the CLI discovers a retained archive and rejects a subsequently corrupted PDB', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hostage-symbol-resolver-'));
  try {
    const pdbBytes = Buffer.from('private pdb fixture');
    const actualPdbHash = createHash('sha256').update(pdbBytes).digest('hex');
    const archive = path.join(root, 'symbols', '1.2.3', workerHash.slice(0, 16));
    mkdirSync(archive, { recursive: true });
    writeFileSync(path.join(root, 'slot.json'), JSON.stringify({ workerSha256: workerHash }));
    writeFileSync(path.join(archive, 'CEditorPluginWorker.pdb'), pdbBytes);
    writeFileSync(path.join(archive, 'symbols.json'), JSON.stringify({
      ...manifest,
      symbols: { ...manifest.symbols, sha256: actualPdbHash },
    }));

    const script = fileURLToPath(new URL(
      '../../../tools/scripts/resolve-worker-symbols.mjs', import.meta.url));
    const args = [script, '--metadata', path.join(root, 'slot.json'),
      '--symbols', path.join(root, 'symbols')];
    const good = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /MATCH:.*CEditorPluginWorker\.pdb/);

    writeFileSync(path.join(archive, 'CEditorPluginWorker.pdb'), 'corrupted');
    const bad = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /failed its archived SHA-256[\s\S]*no PDB passed verification/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
