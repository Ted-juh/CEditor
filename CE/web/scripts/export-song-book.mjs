// Writes the Song Book (songBookPanels.js) to CE/panels/Song Book/, one `.cepanel` a song: panels
// named after songs, each acting out its song with its title and original drawings, no lyrics.
//
//   node --import ./test/support/register-svelte.mjs scripts/export-song-book.mjs          # write
//   node --import ./test/support/register-svelte.mjs scripts/export-song-book.mjs --check  # exit 1 if stale
//
// The files are generated, never edited by hand: change a song in songBookPanels.js, run this,
// commit both. The test suite holds the committed files to this script (songBook.test.js).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SONGS } from './songBookPanels.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SONG_BOOK_DIR = join(HERE, '../../panels/Song Book');

/** The committed file for one song: where it goes and exactly what it holds. */
export function songFile(id) {
  const [, make] = SONGS.find(([key]) => key === id);
  const panel = make();
  return { path: join(SONG_BOOK_DIR, `${panel.name}.cepanel`), text: `${serializePanel(panel)}\n` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let stale = 0;
  mkdirSync(SONG_BOOK_DIR, { recursive: true });
  for (const [id] of SONGS) {
    const { path, text } = songFile(id);
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
    console.log(`All ${SONGS.length} songs are up to date.`);
  } else {
    console.log(`Exported ${SONGS.length} songs to ${SONG_BOOK_DIR}`);
  }
}
