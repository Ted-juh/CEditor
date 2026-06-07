// Emit the C++ engine's legacy profile format (.ceditor-device.json) FROM a resolved DPD profile,
// so OUTBOUND is also DPD-sourced (single source of truth) without rewriting the engine.
// Writes a NEW id (roland-gaia-dpd) so the working profile is untouched. Outbound is already
// proven byte-identical (verify.mjs); this lets the live engine consume the DPD too.
// Run: node CE/dpd/tools/emit-legacy.mjs roland.gaia
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile } from './dpd.mjs';
import { buildLegacyProfile } from '../emit-legacy-core.mjs';

const id = process.argv[2] ?? 'roland.gaia';
const resolved = resolveProfile(id);
// Byte-identical to the previous inline construction; the conversion now lives in the browser-safe
// core so the in-app Designer can produce the same legacy profile on save.
const legacy = buildLegacyProfile(resolved, { legacyId: 'roland-gaia-dpd' });

const HERE = dirname(fileURLToPath(import.meta.url));
const out = join(HERE, '..', '..', 'profiles', 'test', 'roland-gaia-dpd.ceditor-device.json');
writeFileSync(out, JSON.stringify(legacy, null, 2));
console.log(`wrote ${out}`);
console.log(`  ${legacy.parameters.length} params; sample addresses: ` +
  legacy.parameters.filter((p) => p.address).slice(0, 3).map((p) => `${p.id}@${p.address}`).join(', '));

// Maintain the web-side map: legacy profile id -> its DPD source + version. The editor's
// merge-on-drop uses this to find the self-contained slice (mergeParams) and stamp source=id@version,
// since the C++ profile *summary* surfaces only id/name/filePath. Merge-friendly (many devices).
const webGen = join(HERE, '..', '..', 'web', 'src', 'CE_Application', 'generated');
mkdirSync(webGen, { recursive: true });
const mapFile = join(webGen, 'dpdProfileMap.json');
const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
map[legacy.id] = { dpdSource: id, version: resolved.version };
writeFileSync(mapFile, JSON.stringify(map, null, 2));
console.log(`wrote ${mapFile} (${legacy.id} -> ${id}@${resolved.version})`);
