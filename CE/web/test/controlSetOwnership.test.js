// A look a set decides, made a control's own, and handed back (models/controlSetOwnership.js).
// The owner: a set is a quick start, but "the whole key of the editor IS changeability".

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, isTokenReference, resolveColourValue } from '../src/CE_Application/models/controlSets.js';
import {
  familyPatchFor, pristineControlFor, readControlPath, resolveControlForSet, writeControlPath,
} from '../src/CE_Application/models/controlSetFamilies.js';
import { colourRoleName, colourRolePaths, ownLookControl, resetToSetPatch, setOwnership } from '../src/CE_Application/models/controlSetOwnership.js';
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

test('Revert: one override goes back to the set', () => {
  // Two overrides on a knob that follows Graphite.
  const paths = familyPathsOf(studio, 'Knob').filter((p) => typeof readControlPath(pristineControlFor('Knob'), p) === 'number');
  assert.ok(paths.length >= 2, 'Graphite sets at least two numbers on a knob');
  let control = knob();
  for (const p of paths.slice(0, 2)) control = writeControlPath(control, p, readControlPath(pristineControlFor('Knob'), p) + 3);
  const before = setOwnership(control, studio);
  assert.ok(before.own.has(paths[0]) && before.own.has(paths[1]), 'both are overrides');
  assert.notEqual(before.setValues.get(paths[0]), undefined, 'and the inspector can say what the set would give');
  const reverted = applyPatch(control, resetToSetPatch(control, [paths[0]]));
  const after = setOwnership(reverted, studio);
  assert.ok(after.fromSet.has(paths[0]), `${paths[0]} is inherited again`);
  assert.ok(after.own.has(paths[1]), 'the other stays an override');
});

test('Detach from Set, then Reattach to Set', () => {
  const owned = ownLookControl(knob(), tolex);
  assert.equal(owned._children.Core.detachedFromSet, 'tolex');
  const detached = setOwnership(owned, studio);
  assert.equal(detached.detached, 'tolex');
  assert.equal(detached.own.size, 0, 'a detached control has no overrides: its look is stored on it');
  // Reattach: it draws as an untouched knob does, on any set.
  const all = applyPatch(owned, resetToSetPatch(owned));
  assert.equal(all._children.Core.detachedFromSet, undefined);
  for (const set of [studio, tolex]) {
    const fresh = resolveControlForSet(knob(), set);
    for (const p of [...familyPathsOf(set, 'Knob'), ...colourRolePaths(pristineControlFor('Knob'))]) {
      assert.deepEqual(readControlPath(resolveControlForSet(all, set), p), readControlPath(fresh, p), `${set.id}: ${p}`);
    }
  }
  assert.deepEqual(all._children.Core.setOverrides ?? [], []);
});

test('a colour drawn from a role names it', () => {
  const ownership = setOwnership(knob(), tolex);
  assert.ok(ownership.roles.size > 0);
  for (const [path, token] of ownership.roles) {
    assert.ok(isTokenReference(token), `${path}: ${token}`);
    assert.ok(ownership.fromSet.has(path), `${path} is inherited`);
  }
  assert.equal(colourRoleName('{control.cap}'), 'Control Cap');
  assert.equal(colourRoleName('{surface}'), 'Surface');
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

test('the properties panel marks overrides and offers the commands, in the agreed wording', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  // A field that names its property is marked: a bar and a bold label for an override, Revert,
  // and the colour role it is drawn from.
  const cell = read('properties/PropertyCell.svelte');
  assert.match(cell, /getContext\('ce\.setOwnership'\)/);
  assert.match(cell, /class:override=\{mark\?\.override\}/);
  assert.match(cell, /Override\. Set value: \$\{describeValue\(ownership\.setValues\.get\(key\)\)\}\. Revert restores it\./);
  assert.match(cell, />Revert<\/button>/);
  // SectionRenderer provides it for the base control, not a state's value.
  const renderer = read('panels/SectionRenderer.svelte');
  assert.match(renderer, /setContext\('ce\.setOwnership'/);
  assert.match(renderer, /stateTargetKey === BASE_STATE_TARGET/);
  // The card on Core › Control design.
  const card = read('sections/ControlSetOverridesCard.svelte');
  for (const words of ['Clear Overrides', 'Detach from Set', 'Reattach to Set', 'inherited from panel', 'Linked to set colour roles']) {
    assert.ok(card.includes(words), words);
  }
  assert.match(read('sections/CoreEditor.svelte'), /<ControlSetOverridesCard \{control\} \/>/);
  for (const [file, path] of [['sections/CoreEditor.svelte', 'path="Core.controlForm"'], ['sections/BackgroundEditor.svelte', 'path={`${pathPrefix}.Fill.colour`}'], ['sections/TextEditor.svelte', 'path={`${textPathPrefix}.Fill.colour`}'], ['sections/SliderEditor.svelte', 'path="Behavior.majorTickCount"']]) {
    assert.ok(read(file).includes(path), `${file}: ${path}`);
  }
  // The wording: established terms, not chat.
  const dialog = read('layout/ApplyControlSetDialog.svelte');
  assert.ok(dialog.includes('Apply Control Set: '));
  assert.ok(dialog.includes('Others keep their current appearance.'));
  const settings = read('settings/ControlSetsSettings.svelte');
  assert.ok(settings.includes('Built-in set. Editing creates a copy.'));
  // What a person reads: the code's comments are left out.
  const shown = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const text of [card, dialog, settings, read('settings/ControlSetCard.svelte')].map(shown)) {
    for (const casual of ['your own', '(mine)', 'keeps the look it has now', 'Ticked:', 'on panel<']) {
      assert.ok(!text.includes(casual), `no "${casual}"`);
    }
  }
});
