import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(WEB, 'src');
const FONT_DIR = path.join(SRC, 'assets', 'fonts');
const SHEET = path.join(FONT_DIR, 'webFonts.css');

const sheet = () => readFileSync(SHEET, 'utf8');

test('no stylesheet in the source tree imports a remote font', () => {
  // THE REGRESSION THAT MATTERS. A stylesheet `@import url(https://…)` is render-blocking, and
  // "resolves" includes "fails" — so on a machine with no route to the CDN nothing paints until
  // the network gives up. Measured on the one that used to be here: 12.5 s to
  // ERR_CONNECTION_RESET, during which the app ran 187 ms of script and painted nothing.
  //
  // Worse, Vite hoists a CSS @import to the top of whatever bundle it lands in, so a sheet needed
  // by ONE screen silently gates the whole application's startup. It also keeps working perfectly
  // on a fast connection, which is why this needs a test rather than a code review.
  //
  // Deliberately a plain text match, comments included. A false positive is loud and fixed by
  // rewording; a false negative is a twelve-second blank window nobody can explain.
  const REMOTE_IMPORT = /@import\s+(?:url\()?\s*['"]?(?:https?:)?\/\/[^'")\s;]+/g;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(css|svelte)$/.test(entry.name)) continue;
      for (const m of readFileSync(full, 'utf8').matchAll(REMOTE_IMPORT)) {
        offenders.push(`${path.relative(SRC, full)}: ${m[0].slice(0, 80)}`);
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [], `remote @import found — it will block first paint:\n${offenders.join('\n')}`);
});

test('the shipped font sheet asks the network for nothing', () => {
  // Same point one level down: an @font-face pointing at fonts.gstatic.com would not block the
  // first paint, but it would still leave the editor's own chrome dependent on a third party.
  const remote = [...sheet().matchAll(/url\(\s*['"]?((?:https?:)?\/\/[^'")\s]+)/g)].map((m) => m[1]);
  assert.deepEqual(remote, [], `webFonts.css still points off-machine:\n${remote.join('\n')}`);
});

test('every face the sheet declares is actually on disk', () => {
  // A typo'd filename produces no error anywhere: the browser fails the request, falls back, and
  // the editor just looks wrong.
  const missing = [];
  for (const m of sheet().matchAll(/url\(\s*['"]?([^'")\s]+)/g)) {
    const file = path.resolve(FONT_DIR, m[1]);
    if (!existsSync(file)) missing.push(m[1]);
  }
  assert.deepEqual(missing, [], `webFonts.css references files that do not exist:\n${missing.join('\n')}`);
});

test('both families are declared, across the weight range the editor uses', () => {
  const css = sheet();
  // The old remote request was `Archivo:wght@400;500;600;700;800` and
  // `JetBrains Mono:wght@400;500;600`. These are the variable cuts that replace them, so the
  // declared ranges have to still cover every weight the stylesheets ask for.
  assert.match(css, /font-family:\s*'Archivo'/);
  assert.match(css, /font-family:\s*'JetBrains Mono'/);
  for (const block of css.split('@font-face').slice(1)) {
    const range = block.match(/font-weight:\s*(\d+)\s+(\d+)/);
    assert.ok(range, `an @font-face block declares no variable weight range:\n${block.slice(0, 200)}`);
    const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
    const [, lo, hi] = range.map(Number);
    if (family === 'Archivo') assert.ok(lo <= 400 && hi >= 800, `Archivo range ${lo}-${hi} misses 400-800`);
    else assert.ok(lo <= 400 && hi >= 600, `${family} range ${lo}-${hi} misses 400-600`);
  }
});

test('every face swaps rather than blocking on the font file', () => {
  // Without `font-display: swap` the browser hides the text for up to three seconds waiting for
  // the face. Local files are fast, but they are still separate requests.
  const blocks = sheet().split('@font-face').slice(1);
  assert.ok(blocks.length >= 4);
  for (const block of blocks) assert.match(block, /font-display:\s*swap/);
});

test('each face is scoped by unicode-range so only the needed subsets load', () => {
  // This is what makes shipping nine files free at runtime: an English UI fetches the two latin
  // subsets and ignores the rest, while a Cyrillic panel name still renders offline.
  for (const block of sheet().split('@font-face').slice(1)) {
    assert.match(block, /unicode-range:\s*U\+/);
  }
});

test('the licence texts ship beside the fonts', () => {
  // Both faces are SIL OFL 1.1, which requires the licence to travel with the font.
  for (const name of ['OFL-Archivo.txt', 'OFL-JetBrainsMono.txt']) {
    const text = readFileSync(path.join(FONT_DIR, name), 'utf8');
    assert.match(text, /SIL Open Font License, Version 1\.1/);
  }
});

test('the editor entry point loads the sheet', () => {
  // player.js deliberately does not: the exported plugin uses none of these faces, and should not
  // carry 180 KB it never draws with.
  assert.match(readFileSync(path.join(SRC, 'main.js'), 'utf8'), /assets\/fonts\/webFonts\.css/);
  assert.doesNotMatch(readFileSync(path.join(SRC, 'player.js'), 'utf8'), /webFonts\.css/);
});
