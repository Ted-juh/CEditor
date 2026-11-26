// Writes the showcase collections (showcaseCollections.js) to their folders under CE/panels/, one
// `.cepanel` a panel: the Film Festival, the Song Book, Mechanisms, the Gallery, the Animated Synths
// and the Components' Knob (CE/panels/Components/Knob/).
//
//   node --import ./test/support/register-svelte.mjs scripts/export-showcases.mjs                   # write all
//   node --import ./test/support/register-svelte.mjs scripts/export-showcases.mjs --check           # exit 1 if stale
//   node --import ./test/support/register-svelte.mjs scripts/export-showcases.mjs gallery --check   # one collection
//
// The files are generated, never edited by hand: change a panel in its script, run this, commit both.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS, collectionDir, collectionFile } from './showcaseCollections.js';

/** Write (or with `check`, compare) the named collections; the number of stale files. */
export function exportCollections(keys, { check = false, log = console.log, warn = console.error } = {}) {
  let stale = 0;
  for (const key of keys) {
    mkdirSync(collectionDir(key), { recursive: true });
    for (const [id] of COLLECTIONS[key].list) {
      const { path, text } = collectionFile(key, id);
      if (check) {
        let current = '';
        try { current = readFileSync(path, 'utf8'); } catch { /* missing counts as stale */ }
        if (current !== text) { stale += 1; warn(`stale: ${path}`); }
      } else {
        writeFileSync(path, text);
      }
    }
    const count = COLLECTIONS[key].list.length;
    log(check ? `${COLLECTIONS[key].folder}: ${count} panels checked` : `${COLLECTIONS[key].folder}: ${count} panels written to ${collectionDir(key)}`);
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const named = args.filter((arg) => !arg.startsWith('--'));
  const unknown = named.filter((key) => !COLLECTIONS[key]);
  if (unknown.length) { console.error(`No such collection: ${unknown.join(', ')}. The collections: ${Object.keys(COLLECTIONS).join(', ')}`); process.exit(2); }
  const stale = exportCollections(named.length ? named : Object.keys(COLLECTIONS), { check });
  if (check && stale) process.exit(1);
}
