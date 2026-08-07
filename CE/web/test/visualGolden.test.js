// visualGolden.test.js — pin what controls actually PAINT, not just that they painted.
//
// Three rendering bugs shipped in a row while the whole suite was green:
//
//   1. a linked border drew its four corner arcs in white at double width
//   2. every border threw away its alpha, so a 40% hairline painted fully opaque
//   3. every Label was born inside a 2px white rectangle nobody asked for
//
// All three emitted perfectly valid markup. The render gate in qaPanels.test.js asks whether a
// control produced output; all three produced plenty. They were found by cropping a screenshot and
// looking at it — twice by a human, once by finally doing the same thing deliberately.
//
// A fourth followed: the knob pointer rotated about its own midpoint instead of the knob's centre,
// so at minimum it aimed up-and-left where the instrument aims down-and-left. That one survived
// even the first version of THIS file, because the summary captured colour and forgot geometry.
//
// So this pins the paint. Each specimen is server-rendered and reduced to the things that decide
// what you see — stroke colours and widths, fills, shape primitives, and the transforms and pivots
// that place them — and compared against a committed baseline. A change in any of them fails with
// a readable diff instead of a pixel percentage.
//
// WHY NOT A PIXEL DIFF. A real screenshot needs a browser and a running dev server, and it drifts
// on font hinting between machines, which makes it flaky exactly where it needs to be trusted.
// Every bug above was in the emitted markup, which is deterministic. The tradeoff is that a purely
// visual regression — one that changes no attribute — would slip through; nothing here claims
// otherwise, and that is what the QA sheets and a human eye are still for.
//
// UPDATING A BASELINE, when a change is intended:
//
//     UPDATE_GOLDEN=1 npm test
//
// and read the diff in the commit. A baseline updated without looking at it is worse than none.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';

import { render } from 'svelte/server';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
import { gaiaArpGrid, gaiaEnvelope, gaiaFader, gaiaKnob, gaiaLeds } from '../../../tools/scripts/gaia-panel/components.mjs';

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const UPDATING = process.env.UPDATE_GOLDEN === '1';

/**
 * Reduce rendered markup to what decides its appearance.
 *
 * Not the raw HTML: Svelte's scoped class hashes and the defs-id namespacing change for reasons
 * that have nothing to do with how a control looks, and a baseline that churns on those is a
 * baseline people regenerate without reading. What is kept is every stroke, every fill, the shape
 * primitives, and the transforms — which between them are what all four bugs moved.
 */
function paintSummary(body) {
  const strokes = [...body.matchAll(/stroke="([^"]+)"[^>]*?stroke-width="([^"]+)"/g)]
    .map(([, colour, width]) => `stroke ${colour} @ ${width}`);
  const fills = [...body.matchAll(/fill="(?!none)([^"]+)"/g)].map(([, colour]) => `fill ${colour}`);
  const backgrounds = [...body.matchAll(/background(?:-color)?:\s*([^;"]+)/g)].map(([, value]) => `bg ${value.trim()}`);
  const shapes = [...body.matchAll(/<(rect|circle|ellipse|path|polygon|line)\b/g)].map(([, kind]) => `shape ${kind}`);

  // Transforms, because geometry is appearance too. The knob pointer pointed the wrong way for
  // three revisions: it rotated about its own midpoint instead of the knob's centre, so at minimum
  // it aimed up-and-left where the hardware aims down-and-left. Nothing above would have noticed —
  // the strokes and fills were identical, only the transform-origin was wrong.
  const transforms = [...body.matchAll(/transform:\s*([^;"]+)/g)].map(([, value]) => `transform ${value.trim()}`);
  const origins = [...body.matchAll(/transform-origin:\s*([^;"]+)/g)].map(([, value]) => `origin ${value.trim()}`);

  const tally = (entries) => {
    const counts = new Map();
    for (const entry of entries) counts.set(entry, (counts.get(entry) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n}x ${k}`);
  };

  return [
    ...tally(shapes),
    ...tally(strokes),
    ...tally(fills),
    ...tally(backgrounds),
    ...tally(transforms),
    ...tally(origins),
  ].join('\n');
}

function renderControl(control) {
  const { body } = render(CanvasControl, {
    props: { control, allControls: [control], editorInteractionEnabled: false },
  });
  return body;
}

/** Position a prebuilt custom component so its geometry is fixed rather than incidental. */
function place(control, id, width, height) {
  control._children.Core.id = id;
  Object.assign(control._children.Transform, { x: 0, y: 0, width, height });
  return control;
}

/**
 * The specimens, each chosen because it is the shape of something that went wrong.
 */
const SPECIMENS = {
  // Would have caught bug 3: a Label at defaults, whose Background.Border is enabled at 2px white.
  'label-default': () => createControl('Label', { Core: { id: 'g_label' }, Text: { content: 'Label' } }),

  // Would have caught bug 2: the button types specify a 40% white hairline, which painted opaque.
  'togglebutton-default': () => createControl('ToggleButton', { Core: { id: 'g_toggle' }, Text: { content: 'Toggle' } }),

  // Would have caught bug 1: a coloured, rounded, linked border — sides one colour, corners another.
  'coloured-rounded-border': () => createControl('Background', {
    Core: { id: 'g_border' },
    Transform: { width: 40, height: 80 },
    Background: {
      _children: {
        Fill: { colour: 'FF101418' },
        Border: { enabled: true, linked: true, thickness: 1, colour: '66FFFFFF' },
        Corners: { radius: 6 },
      },
    },
  }),

  // The GAIA controls, so the panel's own look is pinned too.
  'gaia-fader': () => place(gaiaFader({ width: 30, height: 104 }), 'g_fader', 30, 104),
  'gaia-knob': () => place(gaiaKnob({ size: 54 }), 'g_knob', 54, 54),
  'gaia-leds': () => place(
    gaiaLeds({ options: [{ label: 'SAW', value: 0 }, { label: 'SQR', value: 1 }, { label: 'SINE', value: 2 }] }),
    'g_leds', 96, 53,
  ),

  // The printed envelope, which is nothing BUT geometry: five points, four rotated segments, and
  // a pivot on each. The first draft of the wave glyphs had exactly this shape of bug — strokes
  // rotating about their own centres, so every polyline came apart into scattered marks — and it
  // rendered without an error and without a failing test. Angles and origins are the whole
  // specimen here.
  'gaia-envelope': () => place(gaiaEnvelope({ stages: 'adsr', width: 200, height: 42 }), 'g_env', 200, 42),
};

for (const [name, build] of Object.entries(SPECIMENS)) {
  test(`${name} paints what it painted before`, () => {
    const summary = paintSummary(renderControl(build()));
    const file = path.join(GOLDEN_DIR, `${name}.txt`);

    if (UPDATING) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(file, `${summary}\n`);
      return;
    }

    let baseline;
    try {
      baseline = readText(file).trimEnd();
    } catch {
      assert.fail(`no baseline for "${name}" — run: UPDATE_GOLDEN=1 npm test, then read the diff before committing it`);
    }

    assert.equal(summary, baseline,
      `"${name}" paints differently than its baseline.\n`
      + 'If the change is intended: UPDATE_GOLDEN=1 npm test, then READ the diff in the commit.\n');
  });
}

test('a specimen that loses its border fails the gate', () => {
  // The gate is only worth having if it bites, and the bug it exists for is a border going missing
  // or changing colour. Proven here rather than asserted in a comment.
  const control = SPECIMENS['coloured-rounded-border']();
  const before = paintSummary(renderControl(control));

  control._children.Background._children.Border.enabled = false;
  const after = paintSummary(renderControl(control));

  assert.notEqual(after, before, 'switching a border off changed nothing in the paint summary');
});

test('a rotated part that loses its pivot fails the gate', () => {
  // The knob pointer bug, exactly: same parts, same colours, wrong transform-origin.
  const control = SPECIMENS['gaia-knob']();
  const before = paintSummary(renderControl(control));

  delete control._children.Parts._children.pointer._children.Layout.pivotY;
  const after = paintSummary(renderControl(control));

  assert.notEqual(after, before, 'moving a rotated part\'s pivot changed nothing in the paint summary');
});

test('a polyline whose strokes lose their pivot fails the gate', () => {
  // The wave-glyph bug in its own right: a segment authored as "start here, this long, at this
  // angle" rotates about its own centre unless pinned to its left edge, so it swings half its
  // length backwards and the shape falls apart. Same colours, same lengths, same angles — only
  // the origin moves, which is exactly the class of defect a colour-only summary cannot see.
  const control = SPECIMENS['gaia-envelope']();
  const before = paintSummary(renderControl(control));

  for (const part of Object.values(control._children.Parts._children)) delete part._children.Layout.pivotX;
  const after = paintSummary(renderControl(control));

  assert.notEqual(after, before, 'unpinning every segment pivot changed nothing in the paint summary');
});

test('the arpeggio grid draws its steps, rows and blocks', () => {
  // Not a golden — the grid materializes its ruler, rows and blocks at render time from
  // Designer.arpeggiator, so what is worth pinning is that it HAS them. A grid that renders as an
  // empty rectangle is the failure mode, and it renders perfectly happily.
  const control = place(gaiaArpGrid({ width: 1200, height: 240, steps: 32 }), 'g_arp', 1200, 240);
  const body = renderControl(control);

  assert.match(body, /\bC4\b/, 'no note labels — the piano-roll rows did not materialize');
  assert.match(body, /\b32\b/, 'no step 32 on the ruler — the step count did not reach the grid');
  assert.ok(body.length > 20000, `arpeggio grid rendered thin (${body.length} bytes) — rows or blocks are missing`);
});

test('a specimen that loses its alpha fails the gate', () => {
  // The exact regression: 66FFFFFF painting as FFFFFF.
  const control = SPECIMENS['coloured-rounded-border']();
  const before = paintSummary(renderControl(control));

  control._children.Background._children.Border.colour = 'FFFFFFFF';
  const after = paintSummary(renderControl(control));

  assert.notEqual(after, before, 'dropping a border\'s alpha changed nothing in the paint summary');
});
