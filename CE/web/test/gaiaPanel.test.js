// gaiaPanel.test.js — the GAIA editor panel, which is a drawing and still has to stay true.
//
// QA-06 is the coverage sheet: laid out by algorithm so it cannot miss a parameter, and it looks
// nothing like a synthesiser. This is the other one — the SH-01's own layout, hand-placed. Being
// hand-placed is exactly why it needs a gate: a coordinate typo puts a control on top of another
// one, and a renamed parameter silently drops it off the panel with nothing to notice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from 'svelte/server';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';
import { buildGaiaPanel, serializeGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { TONE_STRIP } from '../../../tools/scripts/gaia-panel/layout.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PANEL = path.join(REPO, 'CE/panels/Roland GAIA SH-01.cepanel');
const panel = buildGaiaPanel();

const boundIds = () => {
  const ids = [];
  for (const control of panel.controls) {
    for (const binding of control._children?.DeviceBindings?.bindings ?? []) {
      if (binding.parameterId) ids.push(binding.parameterId);
    }
  }
  return ids;
};

test('every layout slot resolves to a real parameter', () => {
  // buildGaiaPanel throws when layout.mjs names a parameter the profile does not have, so simply
  // building it is the assertion. Stated here so the reason is on the record.
  assert.ok(panel.controls.length > 300, `expected a full panel, got ${panel.controls.length} controls`);
});

test('all three tones carry the same controls', () => {
  // The three strips come from one spec, so they can only differ if the resolve step is wrong —
  // which is the failure that sends every edit to tone 1 while looking completely correct.
  const counts = [1, 2, 3].map((tone) => boundIds().filter((id) => id.startsWith(`tone${tone}.`)).length);
  const perStrip = TONE_STRIP.boxes.reduce((total, box) => total + box.controls.length, 0);
  assert.deepEqual(counts, [perStrip, perStrip, perStrip], `tone strips differ: ${counts.join(' / ')}`);
});

test('no parameter is bound twice', () => {
  const ids = boundIds();
  const seen = new Set();
  const duplicated = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual([...new Set(duplicated)], [], 'two controls drive the same parameter — one of them is a coordinate typo');
});

test('nothing is placed outside the panel', () => {
  for (const control of panel.controls) {
    const { x, y, width, height } = control._children.Transform;
    const id = control._children.Core.id;
    assert.ok(x >= 0 && y >= 0, `${id} sits off the top-left at ${x},${y}`);
    assert.ok(x + width <= panel.width, `${id} runs past the right edge (${x}+${width} > ${panel.width})`);
    assert.ok(y + height <= panel.height, `${id} runs past the bottom (${y}+${height} > ${panel.height})`);
  }
});

test('no two interactive controls overlap', () => {
  // Labels and section boxes are allowed to sit under things — captions are drawn over the box
  // they belong to, by design. Two controls a user can grab are never both grabbable.
  const boxes = panel.controls
    .filter((c) => (c._children?.DeviceBindings?.bindings ?? []).length > 0)
    .map((c) => ({ id: c._children.Core.id, ...c._children.Transform }));

  const collisions = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        collisions.push(`${a.id} over ${b.id}`);
      }
    }
  }
  assert.deepEqual(collisions.slice(0, 8), [], `overlapping controls:\n  ${collisions.slice(0, 8).join('\n  ')}`);
});

test('every control renders', () => {
  const controls = JSON.parse(serializeGaiaPanel()).controls.map(expandControl);
  const failures = [];
  for (const control of controls) {
    try {
      const { body } = render(CanvasControl, { props: { control, allControls: controls, editorInteractionEnabled: false } });
      if (!body || body.length < 32) failures.push(`${control._children.Core.id}: ${body?.length ?? 0} bytes`);
    } catch (error) {
      failures.push(`${control._children.Core.id}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], `controls failed to render:\n  ${failures.join('\n  ')}`);
});

test('the committed panel matches the generator', () => {
  assert.equal(readFileSync(PANEL, 'utf8'), serializeGaiaPanel(),
    'CE/panels/Roland GAIA SH-01.cepanel is stale — run: node tools/scripts/gaia-panel/make-gaia-panel.mjs');
});
