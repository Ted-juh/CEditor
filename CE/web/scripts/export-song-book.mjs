// Writes the Song Book (songBookPanels.js) to CE/panels/Song Book/, one `.cepanel` a song: panels
// named after songs, each acting out its song with its title and original drawings, no lyrics.
//
//   node --import ./test/support/register-svelte.mjs scripts/export-song-book.mjs          # write
//   node --import ./test/support/register-svelte.mjs scripts/export-song-book.mjs --check  # exit 1 if stale
//
// The files are generated, never edited by hand: change a song in songBookPanels.js, run this,
// commit both. The test suite holds the committed files to this script (songBook.test.js). It is
// export-showcases.mjs for one collection, kept by this name for the commands above.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionDir, collectionFile } from './showcaseCollections.js';
import { exportCollections } from './export-showcases.mjs';

export const SONG_BOOK_DIR = collectionDir('songs');

/** The committed file for one song: where it goes and exactly what it holds. */
export const songFile = (id) => collectionFile('songs', id);

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  if (exportCollections(['songs'], { check }) && check) process.exit(1);
}
