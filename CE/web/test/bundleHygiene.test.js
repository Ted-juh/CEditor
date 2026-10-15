// bundleHygiene.test.js — the rules that decide how big the built bundle is, and how much of it
// the page holds in memory.
//
// Each is an invariant that vite.config.js depends on and none can defend itself: breaking one
// still compiles, still passes every other test, and still runs correctly in the app. The only
// symptom is the size of dist/, or of the page, which nobody reads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '..', 'src');

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (['.js', '.svelte', '.ts'].includes(extname(entry.name))) yield full;
  }
}

// --- Rule 1: no barrel imports of lucide ------------------------------------------------------
// Tree-shaking is off in vite.config.js — deliberately, because Rollup's include pass was 93% of
// a 4m22s build. The trade only works while every icon is imported by its own path: an
// untree-shaken `from 'lucide-svelte'` pulls the whole ~1800-icon index in behind it.
//
// This is not hypothetical. MidiLearnChips.svelte imported two icons that way, and because every
// lucide icon module carries a full licence banner that the minifier is obliged to preserve, the
// MidiMonitorTab chunk that renders those chips built at 5.79 MB — 99.7% of it the same notice
// repeated 1702 times, for 27 kB of actual code. Per-icon imports took the chunk to 27 kB and the
// whole build from 4506 modules to 1359.

test('every lucide icon is imported by its own path, never from the barrel', () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      // `from 'lucide-svelte'` exactly — `lucide-svelte/icons/pipette` is the good form.
      if (/\bfrom\s+['"]lucide-svelte['"]/.test(line)) {
        offenders.push(`${relative(SRC, file)}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'import each icon from lucide-svelte/icons/<name> instead — see vite.config.js on treeshake:false',
  );
});

// --- Rule 2: if a build is lying around, no chunk may exceed the configured ceiling ------------
// vite.config.js sets chunkSizeWarningLimit deliberately high (4000 kB) and says why: this bundle
// is read off local disk by WebViewHost, not downloaded, so the usual network budget does not
// apply. It also says the limit "is set to catch runaway growth, not to be met". A warning at
// that size means something is wrong, not that the app grew.
//
// dist/ is gitignored and not every checkout has one, so this checks a build only when there is
// one to check. `npm run build` before `npm test` and it becomes a real gate.

test('no built chunk exceeds vite.config.js chunkSizeWarningLimit', () => {
  const config = readFileSync(resolve(here, '..', 'vite.config.js'), 'utf8');
  const limitKb = Number(config.match(/chunkSizeWarningLimit:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(limitKb), 'vite.config.js must declare chunkSizeWarningLimit');

  let assets;
  try {
    assets = readdirSync(resolve(here, '..', 'dist', 'assets'));
  } catch {
    return; // no build here; nothing to check
  }

  const oversized = assets
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, kb: statSync(resolve(here, '..', 'dist', 'assets', name)).size / 1000 }))
    .filter((c) => c.kb > limitKb)
    .map((c) => `${c.name} ${Math.round(c.kb)} kB`);

  assert.deepEqual(oversized, [], `chunks above the ${limitKb} kB ceiling`);
});

// --- Rule 3: every chunk is held one byte per character ---------------------------------------
// V8 stores a script's source two bytes per character from the first character past U+00FF, and
// keeps it for the life of the page. vite.config.js writes everything past ASCII as an escape and
// fails the build on a chunk that still has one (a regex literal, which esbuild leaves as written).
// This checks that the failure happens, and that it names the chunk and the escape to write.

test('the build refuses a chunk that V8 would hold two bytes per character', async () => {
  const { oneByteChunks } = await import('../vite.config.js');
  const plugin = oneByteChunks();
  const run = (bundle) => plugin.generateBundle.call({ error(message) { throw new Error(message); } }, {}, bundle);

  // Latin-1 is one byte: paper.js keeps "Jürg Lehni" in its licence banner, and that is fine.
  run({
    'assets/paper-core.js': { type: 'chunk', code: '/*! Copyright (c) J\u00fcrg Lehni */ x="\\u2014";' },
    'assets/style.css': { type: 'asset', source: 'a::before{content:"\u2014"}' },
  });

  assert.throws(
    () => run({ 'assets/main.js': { type: 'chunk', code: 'const m=s=>s.replace(/\u266F/g,"#");' } }),
    /assets\/main\.js has U\+266F .*write it as \\u266F/,
  );
  assert.throws(
    () => run({ 'assets/fontWorker.js': { type: 'asset', source: 't.replace(/^\uFEFF/,"")' } }),
    /assets\/fontWorker\.js has U\+FEFF/,
    'a worker bundle is emitted as an asset and is checked as well',
  );
});
