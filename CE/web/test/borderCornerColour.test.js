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
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

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
