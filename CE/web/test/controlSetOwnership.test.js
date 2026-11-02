// A look a set decides, made a control's own, and handed back (models/controlSetOwnership.js).
// The owner: a set is a quick start, but "the whole key of the editor IS changeability".

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveColourValue } from '../src/CE_Application/models/controlSets.js';
import {
  familyPatchFor, pristineControlFor, readControlPath, resolveControlForSet, writeControlPath,
} from '../src/CE_Application/models/controlSetFamilies.js';
import { colourRolePaths, ownLookControl, resetToSetPatch, setOwnership } from '../src/CE_Application/models/controlSetOwnership.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { makeControlLookOwn, resetControlLookToSet } from '../src/CE_Application/stores/controlSets.js';

const tolex = getControlSet('tolex');
const studio = getControlSet('graphite-studio');
const knob = (extra = {}) => createControl('Knob', { Core: { id: 'k1' }, Transform: { x: 0, y: 0, width: 80, height: 80 }, ...extra });
const applyPatch = (control, patch) => Object.entries(patch).reduce((out, [path, value]) => writeControlPath(out, path, value), control);
const familyPathsOf = (set, type) => {
  const family = familyPatchFor(set, type);
  return [...Object.keys(family?.component ?? {}), ...Object.entries(family?.parts ?? {}).flatMap(([part, p]) => Object.keys(p).map((path) => `Parts.${part}.${path}`))];
};

test('the inspector can tell what the set decides from what is the control\'s own', () => {
  const paths = familyPathsOf(tolex, 'Knob');
  assert.ok(paths.length > 0, 'Tolex says something about knobs');
  const untouched = setOwnership(knob(), tolex);
  for (const path of paths) assert.ok(untouched.fromSet.has(path), `${path} comes from the set`);
  assert.equal(untouched.own.size, 0, 'nothing is the knob\'s own yet');
  assert.ok(colourRolePaths(pristineControlFor('Knob')).every((path) => untouched.fromSet.has(path)), 'its colour roles follow the set');
  // The author changes one: it is theirs, the rest still the set's.
  const [first] = paths;
  const factory = readControlPath(pristineControlFor('Knob'), first);
  const changed = writeControlPath(knob(), first, typeof factory === 'number' ? factory + 7 : (typeof factory === 'boolean' ? !factory : 'x'));
  const after = setOwnership(changed, tolex);
  assert.ok(after.own.has(first));
  assert.ok(!after.fromSet.has(first));
  // A colour given a colour of its own.
  const [role] = colourRolePaths(pristineControlFor('Knob'));
  assert.ok(setOwnership(writeControlPath(knob(), role, 'FF102030'), tolex).own.has(role));
});

test('make this look my own: what the set draws, and no set changes it again', () => {
  const owned = ownLookControl(knob(), tolex);
  const drawnBefore = resolveControlForSet(knob(), tolex);
  for (const path of familyPathsOf(tolex, 'Knob')) {
    assert.deepEqual(readControlPath(owned, path), readControlPath(drawnBefore, path), `${path} is what Tolex drew`);
    assert.deepEqual(readControlPath(resolveControlForSet(owned, studio), path), readControlPath(drawnBefore, path), `${path} survives a switch to Graphite`);
  }
  assert.equal(colourRolePaths(owned).length, 0, 'its colours are colours now, not roles');
  for (const path of colourRolePaths(pristineControlFor('Knob'))) {
    assert.equal(readControlPath(resolveControlForSet(owned, studio), path), readControlPath(drawnBefore, path), `${path} keeps Tolex's colour on Graphite`);
  }
  assert.equal(setOwnership(owned, studio).fromSet.size, 0, 'nothing on it is the set\'s any more');
});

test('make this look my own, keeping the set\'s colours', () => {
  const owned = ownLookControl(knob(), tolex, {}, { keepColourRoles: true });
  assert.ok(colourRolePaths(owned).length > 0, 'the colours are still roles');
  const onStudio = resolveControlForSet(owned, studio);
  // Each keeps the role Tolex gave it (a cap may be '{control.cap}' where a new knob says
  // '{surface}'), and takes that role's colour from the set it is on.
  for (const role of colourRolePaths(owned)) {
    assert.equal(readControlPath(onStudio, role), resolveColourValue(readControlPath(owned, role), studio), `${role} follows Graphite`);
  }
  for (const path of familyPathsOf(tolex, 'Knob')) {
    // A colour the family gave as a role follows the set; everything else stays Tolex's.
    const value = readControlPath(owned, path);
    if (typeof value === 'string' && value.startsWith('{')) continue;
    assert.deepEqual(readControlPath(onStudio, path), readControlPath(resolveControlForSet(owned, tolex), path), `${path}: the shape stays Tolex's`);
  }
});

test('reset to the set: one property, or the whole control', () => {
  const owned = ownLookControl(knob(), tolex);
  // One property back to the set.
  const [path] = familyPathsOf(studio, 'Knob');
  const one = applyPatch(owned, resetToSetPatch(owned, [path]));
  assert.ok(setOwnership(one, studio).fromSet.has(path), `${path} is the set's again`);
  assert.ok(!(one._children.Core.setOverrides ?? []).includes(path), 'and no longer pinned');
  assert.ok(setOwnership(one, studio).own.size > 0, 'the rest stays the control\'s own');
  // The whole control: it draws as an untouched knob does on any set.
  const all = applyPatch(owned, resetToSetPatch(owned));
  for (const set of [studio, tolex]) {
    const fresh = resolveControlForSet(knob(), set);
    for (const p of [...familyPathsOf(set, 'Knob'), ...colourRolePaths(pristineControlFor('Knob'))]) {
      assert.deepEqual(readControlPath(resolveControlForSet(all, set), p), readControlPath(fresh, p), `${set.id}: ${p}`);
    }
  }
  assert.deepEqual(all._children.Core.setOverrides ?? [], []);
});

test('the store makes a look its own and hands it back in one write each', () => {
  panels.set([{ id: 'own-panel', name: 'Own', width: 400, height: 300, controlSet: { id: 'tolex' }, controlSets: [], controls: [knob()] }]);
  activePanelId.set('own-panel');
  try {
    let writes = 0;
    const stop = panels.subscribe(() => { writes += 1; });
    writes = 0;
    assert.equal(makeControlLookOwn(['k1']), 1);
    assert.equal(writes, 1, 'one write, one undo step');
    const owned = get(panels)[0].controls[0];
    assert.equal(setOwnership(owned, studio).fromSet.size, 0);
    writes = 0;
    assert.equal(resetControlLookToSet(['k1']), 1);
    assert.equal(writes, 1);
    stop();
    const back = get(panels)[0].controls[0];
    assert.ok(setOwnership(back, tolex).fromSet.size > 0, 'the set decides it again');
  } finally {
    panels.set([]);
    activePanelId.set(null);
  }
});
