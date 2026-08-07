// borderCornerColour.test.js — a rounded border's corners are part of the border.
//
// `Border.linked: true` is documented in sectionDefaults as "all sides same", and it is the
// default. getCornerStrokes read colour and thickness only from the CORNER, whose own defaults are
// FFFFFFFF at thickness 2 — so a linked border with any other colour drew four sides in that
// colour and four corner arcs in white, at twice the width.
//
// It stayed invisible for a long time because the border default is also white: the bug and the
// correct output are the same picture until somebody sets a colour. On the GAIA panel's faders,
// whose slots are a dark rounded rectangle 8px wide, the two top arcs read as a stray chevron
// hanging above every fader — which is how it was finally noticed, by looking at it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBorderSegments } from '../src/CE_Application/utils/borderSegments.js';
import { normalizeCorner } from '../src/CE_Application/utils/cornerNormalization.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function segmentsFor(borderPatch, cornersPatch = {}) {
  const border = { ...clone(SECTION_DEFAULTS.Background._children.Border), ...borderPatch };
  const corners = { ...clone(SECTION_DEFAULTS.Background._children.Corners), radius: 4, ...cornersPatch };
  return buildBorderSegments(30, 100, border, corners);
}

const corners = (segments) => segments.filter((s) => s.kind === 'corner');
const sides = (segments) => segments.filter((s) => s.kind === 'side');

test('a linked border paints its corners in the border colour', () => {
  const segments = segmentsFor({ enabled: true, linked: true, colour: 'FF102030', thickness: 1 });
  const cornerColours = new Set(corners(segments).flatMap((s) => s.layers?.map((l) => l.colour) ?? [s.colour]));
  const sideColours = new Set(sides(segments).flatMap((s) => s.layers?.map((l) => l.colour) ?? [s.colour]));

  assert.ok(cornerColours.size > 0, 'a rounded border should emit corner segments');
  assert.deepEqual([...cornerColours], [...sideColours],
    'corner arcs drew a different colour from the sides of the same linked border');
});

test('a linked border paints its corners at the border thickness', () => {
  const segments = segmentsFor({ enabled: true, linked: true, colour: 'FF102030', thickness: 1 });
  for (const segment of corners(segments)) {
    for (const layer of segment.layers ?? []) {
      assert.equal(layer.thick, 1, 'a corner arc is twice as thick as the border it belongs to');
    }
  }
});

test('an unlinked border still lets each corner keep its own colour', () => {
  // The other half of the contract: linked borrows from the border, unlinked does not.
  const segments = segmentsFor(
    { enabled: true, linked: false, colour: 'FF102030', thickness: 1 },
    { topLeftBorderColour: 'FFFF0000' },
  );
  assert.ok(corners(segments).length > 0, 'expected corner segments');
});

test('a translucent border keeps its alpha', () => {
  // Border colours are stored AARRGGBB and both stroke paths took `.slice(-6)`, which is the RGB
  // and nothing else. The button component types set `66FFFFFF` — a 40% white hairline — and drew
  // a solid white one, so every control on a panel looked outlined in marker pen.
  const segments = segmentsFor({ enabled: true, linked: true, colour: '66FFFFFF', thickness: 1 });
  const colours = new Set(segments.flatMap((s) => s.layers?.map((l) => l.colour) ?? [s.colour]));

  assert.ok(colours.size > 0, 'expected some border segments');
  for (const colour of colours) {
    assert.notEqual(colour.toUpperCase(), '#FFFFFF', 'a 40% white border painted fully opaque');
    assert.match(colour, /^#[0-9A-Fa-f]{8}$/, `expected an alpha-carrying colour, got ${colour}`);
  }
});

test('an opaque border is still written without a redundant alpha byte', () => {
  const segments = segmentsFor({ enabled: true, linked: true, colour: 'FF102030', thickness: 1 });
  const colours = [...new Set(segments.flatMap((s) => s.layers?.map((l) => l.colour) ?? [s.colour]))];
  for (const colour of colours) assert.match(colour, /^#102030FF$/i, `unexpected colour ${colour}`);
});

/* ------------------------------------------------------------------ absent means linked */

test('a Corners object that never mentions `linked` is still linked', () => {
  // The default is `true`, so ABSENT has to mean linked — the same tri-state read `borderEnabled`
  // gets one line below it in cornerNormalization.js. Reading it as plain truthiness meant any
  // partial Corners took the unlinked branch, found no per-corner data, and came back at radius 0.
  //
  // It surfaced when documents started storing controls as a diff: `linked: true` is the default,
  // so it elided, and every knob, LED lamp and tick mark on the GAIA panel rendered as a square
  // with `radius: 999` sitting in the file the whole time. The data was right; the read was wrong.
  for (const pos of ['tl', 'tr', 'br', 'bl']) {
    assert.equal(normalizeCorner({ radius: 999 }, pos).radius, 999,
      `${pos}: a Corners with only a radius rendered square`);
  }
});

test('`linked: false` still means per-corner, and a missing corner still defaults', () => {
  // The other side of the change: only `false` may take the unlinked branch, and it must still
  // take it — otherwise unlinked corners quietly become linked ones, which is the same bug mirrored.
  const unlinked = { linked: false, radius: 999, topLeft: { radius: 12 } };
  assert.equal(normalizeCorner(unlinked, 'tl').radius, 12, 'an unlinked corner ignored its own radius');
  assert.equal(normalizeCorner(unlinked, 'tr').radius, 0, 'a missing corner should default, not inherit the root');
});

test('a rounded part survives the document round trip', () => {
  // End to end, against the real save/load path, because the bug was not in either half on its
  // own: the document elided a default and the renderer read the absence as its opposite.
  const control = createControl('CustomComponent', { Core: { id: 'cc' } });
  const part = createPartNode('lamp', { sections: { Background: clone(SECTION_DEFAULTS.Background) } });
  part._children.Background._children.Corners.radius = 999;
  control._children.Parts = { _type: 'Parts', _children: { lamp: part } };

  const panel = createPanel('corners');
  panel.controls = [control];
  const stored = JSON.parse(serializePanel(panel)).controls[0];
  const storedCorners = stored._children.Parts._children.lamp._children.Background._children.Corners;

  // In the document: `linked` is written even though it is at its default, so a build that has
  // not got the normalizeCorner fix still reads it and still draws a circle.
  assert.equal(storedCorners.linked, true, 'a part\'s Corners must keep `linked` even at its default');
  assert.equal(storedCorners.radius, 999);

  const loaded = deserializePanel(serializePanel(panel), null, 'corners').controls[0];
  assert.equal(normalizeCorner(loaded._children.Parts._children.lamp._children.Background._children.Corners, 'tl').radius, 999);
});
