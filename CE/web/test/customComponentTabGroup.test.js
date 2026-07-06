import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { resolveCustomInteractionPatch, seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';

function makeTabGroup() {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.tabGroup'));
  return control;
}

function pageVisibility(resolved) {
  const parts = resolved.control._children.Parts._children;
  return {
    one: parts.pageOne.visible !== false,
    two: parts.pageTwo.visible !== false,
    three: parts.pageThree.visible !== false,
  };
}

test('tab group starter validates as a package', () => {
  const validation = validateCustomComponentPackage(makeTabGroup());
  assert.equal(validation.ok, true, validation.issues.join(', '));
});

test('rule states swap the visible page from the tab channel', () => {
  const control = makeTabGroup();
  assert.deepEqual(pageVisibility(resolveInteractiveControl(control, { customValues: { tab: 'one' } })),
    { one: true, two: false, three: false });
  assert.deepEqual(pageVisibility(resolveInteractiveControl(control, { customValues: { tab: 'two' } })),
    { one: false, two: true, three: false });
  assert.deepEqual(pageVisibility(resolveInteractiveControl(control, { customValues: { tab: 'three' } })),
    { one: false, two: false, three: true });
});

test('clicking a generated tab zone selects that tab and highlights its button', () => {
  const control = makeTabGroup();
  const resolved = resolveInteractiveControl(control, { customValues: { tab: 'one' } });
  const zones = resolved.control._children.HitZones._children;
  const zoneEntry = { name: 'tabBtn_zone_2', zone: zones.tabBtn_zone_2 };

  const patch = resolveCustomInteractionPatch(control, { customValues: seedCustomValues(control) }, zoneEntry, null);
  assert.equal(patch.customValues.tab, 'two');

  const after = resolveInteractiveControl(control, { customValues: patch.customValues });
  assert.equal(after.control._children.Parts._children.tabBtn_2.meta.active, true);
  assert.equal(after.control._children.Parts._children.tabBtn_1.meta.active, false);
  assert.deepEqual(pageVisibility(after), { one: false, two: true, three: false });
});
