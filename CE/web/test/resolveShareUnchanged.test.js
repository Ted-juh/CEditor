// resolveShareUnchanged.test.js — the canvas keeps only what resolving a control changed.
//
// resolveInteractiveControl copies a control so its variant, bindings and states can be written
// into it. The canvas kept those copies for as long as a control was drawn: 296 KB for each of
// GAIA's custom components, all of it drawings the controls otherwise share. With shareUnchanged
// the parts that came out as they went in are the control's own frozen objects again.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rel = 'CE/panels/Roland GAIA SH-01.cepanel';
const panel = deserializePanel(readText(path.join(REPO, rel)), rel, null);
const custom = flatControls(panel.controls).filter((c) => c._children.Core.controlType === 'CustomComponent');

function* objectsIn(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  yield value;
  for (const child of Object.values(value)) yield* objectsIn(child, seen);
}

test('a shared resolve draws exactly what a copying one does, for every GAIA custom component', () => {
  assert.ok(custom.length > 100);
  for (const session of [{}, { valueNormalized: 0.8, hovered: true, pressed: false }]) {
    for (const control of custom) {
      const copied = resolveInteractiveControl(control, session).control;
      const shared = resolveInteractiveControl(control, session, { shareUnchanged: true }).control;
      assert.equal(JSON.stringify(shared), JSON.stringify(copied), control._children.Core.name);
    }
  }
});

test('and holds a fraction of the objects, the rest being the control\'s own shared ones', () => {
  let copiedOwn = 0;
  let sharedOwn = 0;
  for (const control of custom) {
    const sourceObjects = new Set(objectsIn(control));
    const copied = resolveInteractiveControl(control, {}).control;
    const shared = resolveInteractiveControl(control, {}, { shareUnchanged: true }).control;
    copiedOwn += [...objectsIn(copied)].filter((o) => !sourceObjects.has(o)).length;
    sharedOwn += [...objectsIn(shared)].filter((o) => !sourceObjects.has(o)).length;
  }
  assert.ok(sharedOwn * 4 < copiedOwn, `${sharedOwn} objects of their own shared, ${copiedOwn} copied`);
});

test('without the option the result is all copies, as every other caller expects', () => {
  const control = custom[0];
  const copied = resolveInteractiveControl(control, {}).control;
  const sourceObjects = new Set(objectsIn(control));
  assert.equal([...objectsIn(copied)].filter((o) => sourceObjects.has(o)).length, 0, 'nothing of the source');
  assert.ok([...objectsIn(copied)].every((o) => !Object.isFrozen(o)), 'and nothing frozen');
});
