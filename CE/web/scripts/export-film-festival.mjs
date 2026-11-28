// Writes the Film Festival (filmFestivalPanels.js) to CE/panels/Film Festival/, one `.cepanel` a
// film: homages to films' title sequences, each a tour of a corner of the Animation Designer.
//
//   node --import ./test/support/register-svelte.mjs scripts/export-film-festival.mjs          # write
//   node --import ./test/support/register-svelte.mjs scripts/export-film-festival.mjs --check  # exit 1 if stale
//
// The files are generated, never edited by hand: change a film in filmFestivalPanels.js, run this,
// commit both. The test suite holds the committed files to this script (filmFestival.test.js). It is
// export-showcases.mjs for one collection, kept by this name for the commands above.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionDir, collectionFile } from './showcaseCollections.js';
import { exportCollections } from './export-showcases.mjs';

export const FESTIVAL_DIR = collectionDir('films');

/** The committed file for one film: where it goes and exactly what it holds. */
export const filmFile = (id) => collectionFile('films', id);

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  if (exportCollections(['films'], { check }) && check) process.exit(1);
}
