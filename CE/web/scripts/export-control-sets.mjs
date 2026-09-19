// Writes the built-in control sets that ship as files to CE/sets/, one
// `<name>.ceditor-controlset.json` each — the importable form of a set (models/controlSetPackage.js).
//
//   node scripts/export-control-sets.mjs          # write
//   node scripts/export-control-sets.mjs --check  # exit 1 if a committed file is stale
//
// The files are what a user hands to "Import set…" on the panel card, and what the test suite
// reads back to prove a set survives the trip. They are generated from the definitions in
// models/, never edited by hand: change the definition, run this, commit both.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_IN_CONTROL_SETS, getControlSet } from '../src/CE_Application/models/controlSets.js';
import { controlSetFileName, createControlSetEnvelope } from '../src/CE_Application/models/controlSetPackage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SETS_DIR = join(HERE, '../../sets');
// Every built-in set ships as a file too: the file is the form a set is shared and edited in.
export const SHIPPED_SET_IDS = BUILT_IN_CONTROL_SETS.map((set) => set.id);
// A fixed stamp, so the committed files change only when a set does.
const EXPORTED_AT = '2026-09-18T00:00:00.000Z';

export function shippedSetFile(id) {
  const set = getControlSet(id);
  if (!set) throw new Error(`No built-in control set "${id}"`);
  const envelope = createControlSetEnvelope(set, { exportedAt: EXPORTED_AT, author: 'CEditor', license: 'MIT' });
  return { path: join(SETS_DIR, controlSetFileName(set)), text: `${JSON.stringify(envelope, null, 2)}\n` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let stale = 0;
  mkdirSync(SETS_DIR, { recursive: true });
  for (const id of SHIPPED_SET_IDS) {
    const { path, text } = shippedSetFile(id);
    if (check) {
      let current = '';
      try { current = readFileSync(path, 'utf8'); } catch { /* missing counts as stale */ }
      if (current !== text) { stale += 1; console.error(`stale: ${path}`); }
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${path}`);
    }
  }
  if (check && stale) process.exit(1);
}
