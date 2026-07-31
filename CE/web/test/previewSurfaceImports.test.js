// previewSurfaceImports.test.js — a helper used and not imported is a feature that dies on contact.
//
// PanelPreviewSurface.svelte is ~4000 lines and is not unit-tested: it is the live editor surface,
// so what it does is verified by driving the real app. That leaves one gap a browser finds and a
// suite does not — a layout helper called but never imported. It throws a ReferenceError inside a
// pointer handler, the handler dies mid-strike, and the feature is simply silent.
//
// That is not hypothetical. The Drum Pads' `accent` corner shipped into a browser calling
// drumVelocity() with no import for it, and the symptom was a corner that made no sound at all —
// nothing in the console anybody was watching, nothing in the suite, and indistinguishable from
// "the zone map is wrong".
//
// So this reads the source. For every function a layout module exports, if the surface calls it,
// the surface must import it. Cheap, and it covers every helper rather than the one that broke.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', 'src', 'CE_Application', rel), 'utf8');

const SURFACE = 'editor/PanelPreviewSurface.svelte';

/** The names one import statement brings in, for a module the file imports by path. */
function importedFrom(source, modulePath) {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'[^']*${modulePath}'`, 'g');
  const names = new Set();
  for (const m of source.matchAll(re)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** The function names a module exports. */
function exportedFrom(source) {
  return [...source.matchAll(/export function ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
}

// The layout modules whose helpers the surface calls directly. Not every util in the app — only the
// ones this file reaches into, which is where the mistake is possible.
const MODULES = [
  'utils/drumPadLayout.js',
  'utils/chordPadLayout.js',
  'utils/arpLayout.js',
  'utils/turingLayout.js',
];

test('every layout helper the preview surface calls is one it imports', () => {
  const surface = src(SURFACE);
  // Strip comments: a name mentioned in prose is not a call, and this file explains itself a lot.
  const code = surface.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const missing = [];

  for (const modulePath of MODULES) {
    const imported = importedFrom(surface, modulePath.split('/').pop());
    for (const name of exportedFrom(src(modulePath))) {
      // Called as a bare function — not `L.name(`, not a property, not part of a longer word.
      const called = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`).test(code);
      if (called && !imported.has(name)) missing.push(`${name} (${modulePath})`);
    }
  }

  assert.deepEqual(missing, [],
    `called but not imported — these throw at the first pointer event:\n  ${missing.join('\n  ')}`);
});
