// Resolve one exported live-worker crash sidecar to its exact private PDB archive.
//
// This tool is deliberately read-only. It does not upload dumps, modify archives or trust a path
// from either JSON document. The crash sidecar supplies only the executable SHA-256; PDB paths are
// derived from locally discovered symbols.json files and confined to each manifest's directory.

import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function normalizeSha256(value) {
  const result = String(value ?? '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(result) ? result : null;
}

export function crashWorkerIdentity(raw) {
  const workerSha256 = normalizeSha256(raw?.workerSha256);
  if (workerSha256 == null)
    return { ok: false, error: 'crash metadata has no valid workerSha256' };
  return {
    ok: true,
    workerSha256,
    plugin: String(raw?.plugin ?? '').slice(0, 256),
    generation: Number.isSafeInteger(raw?.generation) ? raw.generation : null,
  };
}

export function normalizeSymbolManifest(raw, manifestPath) {
  const binarySha256 = normalizeSha256(raw?.binary?.sha256);
  const pdbSha256 = normalizeSha256(raw?.symbols?.sha256);
  const pdbName = String(raw?.symbols?.name ?? '');
  if (raw?.schemaVersion !== 1 || raw?.visibility !== 'private-not-shipped'
      || binarySha256 == null || pdbSha256 == null
      || path.posix.basename(pdbName) !== pdbName || path.win32.basename(pdbName) !== pdbName
      || !pdbName.toLowerCase().endsWith('.pdb'))
    return null;
  return {
    manifestPath,
    binarySha256,
    pdbSha256,
    pdbPath: path.join(path.dirname(manifestPath), pdbName),
    productName: String(raw?.product?.name ?? ''),
    productVersion: String(raw?.product?.version ?? ''),
  };
}

export function matchingSymbolArchives(crashMetadata, candidates) {
  const identity = crashWorkerIdentity(crashMetadata);
  if (!identity.ok) return { identity, matches: [] };
  const matches = [];
  for (const candidate of candidates ?? []) {
    const normalized = normalizeSymbolManifest(candidate?.manifest, candidate?.manifestPath ?? '');
    if (normalized != null && normalized.binarySha256 === identity.workerSha256)
      matches.push(normalized);
  }
  return { identity, matches };
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifySymbolMatch(match, dependencies = {}) {
  const exists = dependencies.exists ?? existsSync;
  const hash = dependencies.hash ?? sha256File;
  if (!match || !exists(match.pdbPath))
    return { ok: false, error: 'matching PDB file is missing' };
  const actual = normalizeSha256(await hash(match.pdbPath));
  if (actual == null || actual !== match.pdbSha256)
    return { ok: false, error: 'matching PDB failed its archived SHA-256' };
  return { ok: true, pdbPath: match.pdbPath };
}

function discoverManifests(root) {
  const found = [];
  const pending = [path.resolve(root)];
  while (pending.length > 0) {
    const directory = pending.pop();
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.toLowerCase() === 'symbols.json') found.push(file);
    }
  }
  return found.sort();
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; ++index) {
    const flag = argv[index];
    if (flag === '--metadata') result.metadata = argv[++index];
    else if (flag === '--symbols') result.symbols = argv[++index];
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!result.metadata || !result.symbols)
    throw new Error('usage: resolve-worker-symbols.mjs --metadata <slot.json> --symbols <private-symbols>');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const crashMetadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
  const candidates = [];
  for (const manifestPath of discoverManifests(args.symbols)) {
    try {
      candidates.push({ manifestPath, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) });
    } catch {
      // A broken archive is not a candidate; other retained releases remain searchable.
    }
  }

  const { identity, matches } = matchingSymbolArchives(crashMetadata, candidates);
  if (!identity.ok) throw new Error(identity.error);
  if (matches.length === 0)
    throw new Error(`no private symbol archive matches worker ${identity.workerSha256}`);

  let verified = 0;
  for (const match of matches) {
    const result = await verifySymbolMatch(match);
    if (!result.ok) {
      console.error(`REJECTED: ${match.manifestPath}: ${result.error}`);
      continue;
    }
    ++verified;
    console.log(`MATCH: ${result.pdbPath}`);
    console.log(`  product: ${match.productName || '(unknown)'} ${match.productVersion || ''}`.trimEnd());
    console.log(`  worker:  ${identity.workerSha256}`);
  }
  if (verified === 0) throw new Error('matching manifests were found, but no PDB passed verification');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`REFUSED: ${error.message}`);
    process.exitCode = 2;
  });
}
