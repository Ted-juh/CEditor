// drawTimeEvents.test.js — what the preview surface does while it draws, it does without writing state.
//
// PanelPreviewSurface reconciles some instruments' input while it draws them (resolvedPreviewFor
// runs in the template): a Harmoniser's held keys, a Kinetic's launch. Svelte refuses a write of
// reactive state inside that derivation (state_unsafe_mutation), and an event dispatch writes state
// (the runtime's execution status, and whatever a handler sets). So events found while drawing are
// raised after it (afterDraw), and what the drawing itself needs is kept in plain maps.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const surface = readFileSync(join(here, '..', 'src', 'CE_Application', 'editor', 'PanelPreviewSurface.svelte'), 'utf8');

/** The body of one `function name(...) { ... }` in the surface, by brace counting. */
function body(name) {
  const start = surface.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is in the surface`);
  let depth = 0;
  for (let i = surface.indexOf('{', start); i < surface.length; i += 1) {
    if (surface[i] === '{') depth += 1;
    else if (surface[i] === '}' && (depth -= 1) === 0) return surface.slice(start, i + 1);
  }
  throw new Error(`${name} has no end`);
}

test('the Harmoniser raises onVoiced after the drawing, not inside it', () => {
  // Its input is reconciled in applyHarmoniserValueSource, inside the drawing. Raised there, the
  // first key played its chord and the note-input listener died with the refusal: every key after
  // it, and the first key's own note-off, played nothing.
  assert.match(body('applyHarmoniserValueSource'), /pumpHarmInput\(control\)/);
  const raise = body('raiseHarmVoiced');
  assert.match(raise, /afterDraw\(\(\) => raiseComponent\(control, 'onVoiced'/);
  assert.doesNotMatch(raise.replace(/afterDraw\(\(\) => raiseComponent/, ''), /raiseComponent\(/);
});

test('a Kinetic throws its ball again from a new launch where the ball is drawn', () => {
  // The effect that did this runs after the drawing, and a stopped ball has nothing to draw it
  // again: the new launch was not shown until the ball was started, and then it jumped.
  const source = body('applyKineticValueSource');
  const rethrow = source.indexOf('rethrowOnNewLaunch(control)');
  assert.ok(rethrow > 0, 'the value source re-throws from a changed launch');
  assert.ok(rethrow < source.indexOf('kineticStateMap[id] ?? kineticInitial(control)'), 'before it reads the ball');
  assert.match(body('rethrowOnNewLaunch'), /kineticStateMap\[id\] = /);
});
