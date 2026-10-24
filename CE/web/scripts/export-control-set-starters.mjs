// Writes the sixty control-set starters that ship as files to CE/panels/Control set starters/, one
// `<set id>.cepanel` each — the editable sample panels the installer puts beside the app.
//
//   node --import ./test/support/register-svelte.mjs scripts/export-control-set-starters.mjs          # write
//   node --import ./test/support/register-svelte.mjs scripts/export-control-set-starters.mjs --check  # exit 1 if stale
//
// Each file is what the gallery opens for that set (models/controlSetStarter.js), written down. They
// are generated, never edited by hand: change the starter or the set, run this, commit both. The
// test suite holds the committed files to this script (controlSetStarter.test.js).
//
// What the gallery leaves to chance is fixed here, so that a file changes only when what it shows
// does. The panel's identity is a hash of the set id, and its script id is named for the set, where
// the gallery takes a count of the panels opened so far. Its controls are numbered from a hash too:
// the gallery numbers them from a counter that starts at the clock, which renamed all of them on
// every export. Each starter counts from a number of its own, in the shape the editor's ids have,
// so nothing in the file says it was made differently from a starter opened in the app.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTER_CONTROL_SETS } from '../src/CE_Application/models/controlSetCoverage.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STARTERS_DIR = join(HERE, '../../panels/Control set starters');
export const SHIPPED_STARTER_IDS = STARTER_CONTROL_SETS.map(({ id }) => id);

const hashOf = (text) => createHash('sha256').update(text).digest('hex');

/** The committed file for one starter: where it goes and exactly what it holds. */
export function starterFile(id) {
  // The first control's number, from 1.7e12 to 1.8e12: the range the editor's clock-based ids are
  // in. No two starters share an id (the test checks), so controls copied from two of them into one
  // panel arrive as distinct as two made in the editor would.
  let n = 1_700_000_000_000 + (parseInt(hashOf(`ceditor-starter-controls:${id}`).slice(0, 12), 16) % 100_000_000_000);
  const panel = createControlSetStarter(id, { nextId: () => n++ });
  // Stable identity for the distributed example; the gallery creates a fresh panel identity.
  const h = hashOf(`ceditor-starter:${id}`);
  panel.panelGuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  panel.scriptId = `${id.replace(/\W+/g, '_')}_starter`;
  panel.filePath = null;
  return { path: join(STARTERS_DIR, `${id}.cepanel`), text: `${serializePanel(panel)}\n` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let stale = 0;
  mkdirSync(STARTERS_DIR, { recursive: true });
  for (const id of SHIPPED_STARTER_IDS) {
    const { path, text } = starterFile(id);
    if (check) {
      let current = '';
      try { current = readFileSync(path, 'utf8'); } catch { /* missing counts as stale */ }
      if (current !== text) { stale += 1; console.error(`stale: ${path}`); }
    } else {
      writeFileSync(path, text);
    }
  }
  if (check) {
    if (stale) process.exit(1);
    console.log(`All ${SHIPPED_STARTER_IDS.length} starters are up to date.`);
  } else {
    console.log(`Exported ${SHIPPED_STARTER_IDS.length} editable starters to ${STARTERS_DIR}`);
  }
}
