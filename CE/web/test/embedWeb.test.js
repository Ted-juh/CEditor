// embedWeb.test.js — what the player, the plug-in and Hostage carry of the web build.
//
// scripts/embed-web.mjs writes the files player.html and host.html can reach, gzip-compressed, into
// dist-embed/, which CMake embeds as PlayerWebData and the C++ inflates as a page asks. A file left
// out is a blank or broken plug-in, so these build a small dist/ with one file reached each way a
// real build reaches one, and editor-only files that must stay out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMBEDDED_PAGES, reachableFiles, writeEmbeddedBundle } from '../scripts/embed-web.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** A dist/ shaped like Vite's: three pages, chunks, a worker, CSS with a font, wasm, a manifest. */
function fakeDist() {
  const root = mkdtempSync(path.join(tmpdir(), 'embed-web-'));
  const dist = path.join(root, 'dist');
  const publicDir = path.join(root, 'public');
  const files = {
    'player.html': '<script type="module" src="./assets/player-A1.js"></script><link rel="stylesheet" href="./assets/player-A1.css">',
    'host.html': '<script type="module" src="./assets/host-B2.js"></script>',
    'index.html': '<script type="module" src="./assets/main-C3.js"></script>',
    'logo.png': 'png',
    'assets/player-A1.js': 'import "./shared-D4.js"; const lazy = () => import("./lazy-E5.js"); new Worker(new URL("" + "/assets/fontWorker-F6.js", import.meta.url));',
    'assets/player-A1.css': '@font-face { src: url(./font-G7.woff2) format("woff2"); }',
    'assets/font-G7.woff2': 'font',
    'assets/shared-D4.js': 'export const x = 1;',
    'assets/lazy-E5.js': 'fetch(new URL("glue-H8.wasm", import.meta.url));',
    'assets/glue-H8.wasm': 'wasm',
    'assets/fontWorker-F6.js': 'self.onmessage = () => {};',
    'assets/host-B2.js': 'import "./shared-D4.js";',
    'assets/main-C3.js': 'import "./shared-D4.js"; import("./editorOnly-I9.js");',
    'assets/editorOnly-I9.js': 'export const editor = true;',
    // Named by no built file, listed by the manifest as a dynamic import of the player's chunk.
    'assets/stub-J0.js': 'export {};',
    '.vite/manifest.json': JSON.stringify({
      'player.html': { file: 'assets/player-A1.js', imports: ['_shared-D4.js'], dynamicImports: ['stub.mjs'], css: ['assets/player-A1.css'] },
      '_shared-D4.js': { file: 'assets/shared-D4.js' },
      'stub.mjs': { file: 'assets/stub-J0.js' },
      'host.html': { file: 'assets/host-B2.js' },
      'index.html': { file: 'assets/main-C3.js', dynamicImports: ['editorOnly.js'] },
      'editorOnly.js': { file: 'assets/editorOnly-I9.js' },
    }),
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), text);
  }
  mkdirSync(publicDir);
  writeFileSync(path.join(publicDir, 'logo.png'), 'png');
  return { root, dist, publicDir, out: path.join(root, 'dist-embed'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('the player and host pages take what they can reach, and nothing of the editor', () => {
  const fake = fakeDist();
  try {
    assert.deepEqual(EMBEDDED_PAGES, ['player.html', 'host.html']);
    assert.deepEqual(reachableFiles(fake.dist, { publicDir: fake.publicDir }), [
      'assets/font-G7.woff2', 'assets/fontWorker-F6.js', 'assets/glue-H8.wasm', 'assets/host-B2.js',
      'assets/lazy-E5.js', 'assets/player-A1.css', 'assets/player-A1.js', 'assets/shared-D4.js',
      'assets/stub-J0.js', 'host.html', 'logo.png', 'player.html',
    ]);
  } finally { fake.cleanup(); }
});

test('each file is written compressed under its own name, and inflates to what was built', () => {
  const fake = fakeDist();
  try {
    const { files, bytes, compressed } = writeEmbeddedBundle(fake.dist, fake.out, { publicDir: fake.publicDir });
    assert.deepEqual(readdirSync(fake.out).sort(), files.map((file) => `${path.basename(file)}.gz`).sort());
    for (const file of files) {
      const inflated = gunzipSync(readFileSync(path.join(fake.out, `${path.basename(file)}.gz`)));
      assert.deepEqual(inflated, readFileSync(path.join(fake.dist, file)), file);
    }
    assert.ok(bytes > 0 && compressed > 0);
    // The same build writes the same bytes, so a rebuild does not relink four binaries for nothing.
    const first = readFileSync(path.join(fake.out, 'player.html.gz'));
    writeEmbeddedBundle(fake.dist, fake.out, { publicDir: fake.publicDir });
    assert.deepEqual(readFileSync(path.join(fake.out, 'player.html.gz')), first);
  } finally { fake.cleanup(); }
});

test('a build without its page, or with two files of one name, is refused', () => {
  const fake = fakeDist();
  try {
    rmSync(path.join(fake.dist, 'host.html'));
    assert.throws(() => writeEmbeddedBundle(fake.dist, fake.out), /host\.html is not in/);
  } finally { fake.cleanup(); }
  const twice = fakeDist();
  try {
    mkdirSync(path.join(twice.dist, 'other'));
    writeFileSync(path.join(twice.dist, 'other', 'shared-D4.js'), 'a second file of the same name');
    // The C++ finds a file by its name alone, so which of the two a page meant cannot be told.
    assert.throws(() => reachableFiles(twice.dist), /two built files are named shared-D4\.js/);
  } finally { twice.cleanup(); }
});

test('what is built is what is embedded: npm run build writes it, CMake takes it, the C++ inflates it', () => {
  const pkg = JSON.parse(read('CE/web/package.json'));
  assert.match(pkg.scripts.build, /^vite build && node scripts\/embed-web\.mjs$/);
  assert.match(read('CE/web/vite.config.js'), /manifest: true,/);
  const cmake = read('CMakeLists.txt');
  assert.match(cmake, /file\(GLOB_RECURSE PLAYER_WEB_DIST CONFIGURE_DEPENDS "\$\{CE_ROOT\}\/web\/dist-embed\/\*"\)/);
  assert.doesNotMatch(cmake, /GLOB_RECURSE PLAYER_WEB_DIST CONFIGURE_DEPENDS "\$\{CE_ROOT\}\/web\/dist\/\*"/, 'the whole of dist/ is embedded again');
  assert.match(cmake, /if \(NOT PLAYER_WEB_DIST\)\s*\n\s*message\(FATAL_ERROR/);
  const helper = read('CE/src/EmbeddedWebBundle.h');
  assert.match(helper, /find \(name \+ "\.gz", size\)/);
  assert.match(helper, /GZIPDecompressorInputStream::gzipFormat/);
  // Both pages' providers go through it, and neither walks the bundle on its own any more.
  for (const rel of ['CE/src/Player/PlayerHost.cpp', 'CE/src/InstrumentHost/HostRuntimeShared.h']) {
    const source = read(rel);
    assert.ok(source.includes('#include "EmbeddedWebBundle.h"'), `${rel} does not use the helper`);
    assert.ok(source.includes('ceditor::embeddedWebFile (basename)'), `${rel} does not look files up through it`);
    assert.ok(!source.includes('PlayerWebData::namedResourceListSize'), `${rel} reads the bundle itself, and would miss a compressed file`);
  }
});
