// Edit a set by editing a control (docs/design/changeable-control-sets.md, piece C): a control's
// overrides applied to its set's family, a built-in copied first; Edit on Panel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { readControlPath, resolveControlForSet, writeControlPath } from '../src/CE_Application/models/controlSetFamilies.js';
import { setOwnership } from '../src/CE_Application/models/controlSetOwnership.js';
import {
  controlOverrides, describeLookPath, describeLookValue, familyPatchFromControl, familySize, setWithFamilyPatch,
} from '../src/CE_Application/models/setFromControl.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { controlSetLibrary } from '../src/CE_Application/stores/controlSetLibrary.js';
import {
  applyLookToSet, applySetEditSession, applyToSetPreview, endSetEditSession, placeFamilyControlForEditing, setEditSession,
} from '../src/CE_Application/stores/setFromControl.js';

const tolex = getControlSet('tolex');
const knob = (id, extra = {}) => createControl('Knob', { Core: { id }, Transform: { x: 0, y: 0, width: 80, height: 80 }, ...extra });
// A knob styled by its author: a scalloped cap, its fill moved to the accent role.
const styled = (id) => writeControlPath(writeControlPath(writeControlPath(knob(id), 'Parts.bodyCap.outline', 'scallop'),
  'Parts.bodyCap.outlineCount', 10), 'Parts.bodyCap.Background.Fill.colour', '{accent}');

function withPanel(controls, setId, run, { controlSets = [] } = {}) {
  const libraryBefore = get(controlSetLibrary);
  panels.set([{ id: 'p1', name: 'Sets', width: 600, height: 400, controlSet: { id: setId }, controlSets, controls }]);
  activePanelId.set('p1');
  try {
    return run();
  } finally {
    panels.set([]);
    activePanelId.set(null);
    controlSetLibrary.set(libraryBefore);
    setEditSession.set(null);
  }
}

test('a styled control lists its overrides in the inspector\'s words, a role swap among them', () => {
  const { entries } = controlOverrides(styled('k1'), tolex);
  const byPath = Object.fromEntries(entries.map((entry) => [entry.path, entry]));
  assert.equal(byPath['Parts.bodyCap.outline'].value, 'scallop');
  assert.deepEqual([byPath['Parts.bodyCap.outline'].part, byPath['Parts.bodyCap.outline'].property], ['Cap', 'Outline']);
  assert.equal(byPath['Parts.bodyCap.outlineCount'].property, 'Points');
  // The cap's fill moved from its role to the accent: the author's, and the set's role is what it was.
  assert.equal(byPath['Parts.bodyCap.Background.Fill.colour'].value, '{accent}');
  assert.match(String(byPath['Parts.bodyCap.Background.Fill.colour'].was), /^\{.+\}$/);
  assert.equal(controlOverrides(knob('k2'), tolex).entries.length, 0, 'an untouched knob has none');
  assert.deepEqual(describeLookPath('Background.Border.colour'), { part: '', property: 'Border Colour' });
  assert.equal(describeLookValue('{control.cap}'), '🔗 Control Cap');
  assert.equal(describeLookValue('FF102030'), '#102030');
  assert.equal(describeLookValue(true), 'On');
});

test('the family takes the overrides as the control holds them, and is the author\'s own design', () => {
  const patch = familyPatchFromControl(styled('k1'), ['Parts.bodyCap.outline', 'Parts.bodyCap.Background.Fill.colour', 'Background.Fill.colour']);
  assert.deepEqual(patch.parts.bodyCap, { outline: 'scallop', 'Background.Fill.colour': '{accent}' });
  assert.ok('Background.Fill.colour' in patch.component);
  const next = setWithFamilyPatch(tolex, 'Knob', patch);
  assert.equal(next.families.Knob.parts.bodyCap.outline, 'scallop');
  assert.equal(next.chosenFamilies.Knob, 'own');
  assert.ok(familySize(next.families.Knob) >= familySize(tolex.families.Knob));
  assert.equal(tolex.families.Knob.parts?.bodyCap?.outline === 'scallop', false, 'the set given is not changed');
});

test('Apply to Set on a built-in: a copy takes the change, the panel moves to it, the knob follows it again', () => {
  withPanel([styled('k1'), knob('k2'), knob('k3', { Parts: { _children: { bodyCap: { outline: 'flutes' } } } })], 'tolex', () => {
    const preview = applyToSetPreview('k1');
    assert.equal(preview.builtIn, true);
    assert.equal(preview.copyName, 'Tolex Copy');
    const paths = preview.entries.map((entry) => entry.path);
    // k2 follows; k3 holds an outline of its own and keeps it.
    assert.deepEqual(preview.reach(paths), { follow: 1, keep: 1 });
    let writes = 0;
    const stop = panels.subscribe(() => { writes += 1; });
    writes = 0;
    const result = applyLookToSet('k1', paths, { copyName: 'My Tolex' });
    stop();
    assert.equal(writes, 1, 'one write to the panel, one undo step');
    assert.equal(result.copied, true);
    const copy = get(controlSetLibrary).find((set) => set.id === result.setId);
    assert.equal(copy.name, 'My Tolex');
    assert.equal(copy.families.Knob.parts.bodyCap.outline, 'scallop');
    const panel = get(panels)[0];
    assert.equal(panel.controlSet.id, result.setId, 'the panel uses the copy');
    assert.ok(panel.controlSets.some((set) => set.id === result.setId), 'and carries it');
    const [k1, k2, k3] = panel.controls;
    assert.equal(controlOverrides(k1, copy).entries.length, 0, 'the knob has no overrides left');
    assert.equal(readControlPath(resolveControlForSet(k1, copy), 'Parts.bodyCap.outline'), 'scallop', 'and draws the set\'s scallop');
    assert.equal(readControlPath(resolveControlForSet(k2, copy), 'Parts.bodyCap.outline'), 'scallop', 'its neighbour follows');
    assert.equal(readControlPath(resolveControlForSet(k3, copy), 'Parts.bodyCap.outline'), 'flutes', 'one with its own keeps it');
    assert.equal(getControlSet('tolex').families.Knob.parts?.bodyCap?.outline === 'scallop', false, 'Tolex itself is untouched');
  });
});

test('Apply to Set on a set of your own changes it in the library and in the panel\'s copy', () => {
  const own = { ...structuredClone(tolex), id: 'my-tolex', name: 'My Tolex', basedOn: 'tolex' };
  controlSetLibrary.update((list) => [own, ...list]);
  withPanel([styled('k1')], 'my-tolex', () => {
    const preview = applyToSetPreview('k1');
    assert.equal(preview.builtIn, false);
    const result = applyLookToSet('k1', ['Parts.bodyCap.outline']);
    assert.deepEqual(result, { setId: 'my-tolex', copied: false });
    assert.equal(get(controlSetLibrary).find((set) => set.id === 'my-tolex').families.Knob.parts.bodyCap.outline, 'scallop');
    const panel = get(panels)[0];
    assert.equal(panel.controlSet.id, 'my-tolex');
    assert.equal(panel.controlSets.find((set) => set.id === 'my-tolex').families.Knob.parts.bodyCap.outline, 'scallop');
    // Only the outline was applied: the count and the accent fill are still the knob's own.
    const left = controlOverrides(panel.controls[0], getControlSet('my-tolex', { document: panel.controlSets })).entries.map((entry) => entry.path);
    assert.ok(!left.includes('Parts.bodyCap.outline'));
    assert.ok(left.includes('Parts.bodyCap.outlineCount'));
  }, { controlSets: [own] });
});

test('Edit on Panel places the family\'s control, drawn with the set; Apply takes its look and removes it', () => {
  withPanel([knob('k2')], 'tolex', () => {
    const id = placeFamilyControlForEditing('tolex', 'Knob');
    assert.ok(id);
    assert.deepEqual({ ...get(setEditSession), controlId: undefined }, { panelId: 'p1', controlId: undefined, setId: 'tolex', type: 'Knob' });
    // Style it, then apply.
    panels.update((list) => list.map((panel) => ({
      ...panel,
      controls: panel.controls.map((control) => (control._children.Core.id === id ? writeControlPath(control, 'Parts.bodyCap.outline', 'scallop') : control)),
    })));
    const result = applySetEditSession({ copyName: 'Edited Tolex' });
    assert.equal(result.copied, true);
    assert.equal(get(setEditSession), null);
    const panel = get(panels)[0];
    assert.equal(panel.controls.length, 1, 'the placed knob is gone');
    assert.equal(readControlPath(resolveControlForSet(panel.controls[0], get(controlSetLibrary).find((set) => set.id === result.setId)), 'Parts.bodyCap.outline'), 'scallop');
    // Cancel takes it away and changes nothing.
    const again = placeFamilyControlForEditing(result.setId, 'Knob');
    assert.equal(get(panels)[0].controls.length, 2);
    endSetEditSession({ remove: true });
    assert.equal(get(panels)[0].controls.some((control) => control._children.Core.id === again), false);
  });
});

test('a role swap is an override the inspector marks; a role the family gives is not', () => {
  const swapped = writeControlPath(knob('k1'), 'Parts.bodyCap.Background.Fill.colour', '{accent}');
  assert.ok(setOwnership(swapped, tolex).own.has('Parts.bodyCap.Background.Fill.colour'));
  assert.ok(!setOwnership(knob('k1'), tolex).own.has('Parts.bodyCap.Background.Fill.colour'));
});

test('Settings › Control Sets holds every role and every family, grouped; lettering, lamp and Reset', async () => {
  const { ROLE_GROUPS, DERIVED_ROLE_GROUP, groupedFamilies, familyLabel, setLettering, withLettering, withLamp, withFamilyReset, familySourceLabel } = await import('../src/CE_Application/models/setEditing.js');
  const studio = getControlSet('graphite-studio');
  const roles = [...ROLE_GROUPS.flatMap((group) => group.roles), ...DERIVED_ROLE_GROUP.roles].map(([key]) => key);
  assert.equal(new Set(roles).size, roles.length, 'each role once');
  assert.deepEqual([...roles].sort(), Object.keys(studio.tokens).sort(), 'all 55 of a set\'s roles, the derived ones apart');
  const families = groupedFamilies(studio).flatMap((group) => group.types);
  assert.deepEqual([...families].sort(), Object.keys(studio.families).sort(), 'every family, in a group');
  assert.equal(groupedFamilies(studio)[0].label, 'Knobs and sliders');
  assert.equal(familyLabel('ToggleButton'), 'Switches');
  assert.equal(familyLabel('Orbit'), 'Orbits');
  // Lettering: every family with text takes it.
  const lettered = withLettering(studio, { family: 'Inter', weightValue: 600, letterSpacing: 0.4 });
  assert.deepEqual(setLettering(lettered), { family: 'Inter', weightValue: 600, letterSpacing: 0.4 });
  assert.equal(lettered.families.Button.component['Text.Font.weight'], 'Bold');
  assert.equal(lettered.families.Knob.parts.labelValue['Text.Font.family'], 'Inter', 'a knob\'s readout is a part with text');
  assert.equal(lettered.families.Shape?.component?.['Text.Font.family'], undefined, 'a shape has no lettering');
  assert.deepEqual(withLamp(studio, { azimuth: 400, elevation: 30 }).lamp, { azimuth: 360, elevation: 30 });
  // Reset: back to where the set came from, no longer the author's own.
  const edited = setWithFamilyPatch(studio, 'Knob', { component: {}, parts: { bodyCap: { outline: 'scallop' } } });
  assert.match(familySourceLabel(edited, 'Knob'), /^Own design · \d+ properties$/);
  const reset = withFamilyReset(edited, 'Knob', studio);
  assert.deepEqual(reset.families.Knob, studio.families.Knob);
  assert.equal(reset.chosenFamilies?.Knob, undefined);
  assert.equal(withFamilyReset(edited, 'Knob', null), null, 'nowhere to go back to');
});

test('the card lists the overrides with Revert and Apply, and the shell mounts the window and the banner', async () => {
  const { readFileSync } = await import('node:fs');
  const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const card = source('CE_Application/sections/ControlSetOverridesCard.svelte');
  assert.match(card, /resetControlLookToSet\(ids, \[entry\.path\]\)/);
  assert.match(card, /requestApplyToSet\(controls\[0\]\._children\.Core\.id, \[entry\.path\]\)/);
  assert.match(card, /label="Apply to Set…"/);
  const app = source('App.svelte');
  assert.match(app, /<ApplyToSetDialog \/>/);
  assert.match(app, /<ScriptTrustBanner \/>\s*<SetEditBanner \/>/);
  const settings = source('CE_Application/settings/ControlSetsSettings.svelte');
  assert.match(settings, /activateColorTarget\(\{\s*type: 'callback'/, 'a role\'s swatch opens the Colors dock');
  assert.doesNotMatch(settings, /type="color"/);
  assert.match(settings, /placeFamilyControlForEditing\(draft\?\.id \?\? selectedId, type, targetPanel\.id\)/);
});
