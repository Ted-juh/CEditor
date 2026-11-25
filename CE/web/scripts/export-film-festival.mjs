// Writes the Film Festival (filmFestivalPanels.js) to CE/panels/Film Festival/, one `.cepanel` a
// film: eight homages to films' title sequences, each a tour of a corner of the Animation Designer.
//
//   node --import ./test/support/register-svelte.mjs scripts/export-film-festival.mjs          # write
//   node --import ./test/support/register-svelte.mjs scripts/export-film-festival.mjs --check  # exit 1 if stale
//
// The files are generated, never edited by hand: change a film in filmFestivalPanels.js, run this,
// commit both. The test suite holds the committed files to this script (filmFestival.test.js).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILMS } from './filmFestivalPanels.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FESTIVAL_DIR = join(HERE, '../../panels/Film Festival');

/** The committed file for one film: where it goes and exactly what it holds. */
export function filmFile(id) {
  const [, make] = FILMS.find(([key]) => key === id);
  const panel = make();
  return { path: join(FESTIVAL_DIR, `${panel.name}.cepanel`), text: `${serializePanel(panel)}\n` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let stale = 0;
  mkdirSync(FESTIVAL_DIR, { recursive: true });
  for (const [id] of FILMS) {
    const { path, text } = filmFile(id);
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
    console.log(`All ${FILMS.length} films are up to date.`);
  } else {
    console.log(`Exported ${FILMS.length} films to ${FESTIVAL_DIR}`);
  }
}
