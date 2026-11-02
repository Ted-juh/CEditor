// Settings › Control Sets and the Apply window, from the owner's list:
//   - "Changing sets should provide options WHAT you want to import from a set. Do I want the
//     background to change color? Should be optional. Do I want ALL the meters, sliders and knobs
//     etc? Can I make a selection?" — utils/controlSetApply.js, layout/ApplyControlSetDialog.svelte;
//   - the Library was "one long strip", a nightmare to scroll — grouped now, each set shown by its
//     own knob (utils/controlSetGroups.js, settings/ControlSetCard.svelte);
//   - the preview sat under the fields, out of sight — a column of its own beside them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { BUILT_IN_CONTROL_SETS, OFFERED_CONTROL_SETS, RETIRED_CONTROL_SET_IDS, getControlSet, offeredControlSetsWith } from '../src/CE_Application/models/controlSets.js';
import { mergeControlSetLists } from '../src/CE_Application/stores/controlSetLibrary.js';
import { SHIPPED_STARTER_IDS } from '../scripts/export-control-set-starters.mjs';
import { applyControlSetChoices, controlFamily, panelSetSummary } from '../src/CE_Application/utils/controlSetApply.js';
import { controlSetStyle, groupControlSets, MECHANICAL_SET_IDS, SET_STYLES } from '../src/CE_Application/utils/controlSetGroups.js';
import { DEFAULT_PANEL_COLOUR, buildSolidStyle } from '../src/CE_Application/utils/backgroundCSS.js';
import { panels } from '../src/CE_Application/stores/panels.js';
import { applyControlSetWithChoices, controlSetApplyRequest, requestControlSetApply } from '../src/CE_Application/stores/controlSets.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

function control(type, id, pin = '') {
  return createControl(type, { Core: { id, controlSetId: pin }, Transform: { x: 0, y: 0, width: 60, height: 60 } });
}

function samplePanel(extra = {}) {
  return {
    id: 'panel-apply',
    name: 'Apply test',
    width: 400,
    height: 300,
    bgColour: DEFAULT_PANEL_COLOUR,
    controlSet: { id: 'tolex' },
    controlSets: [],
    controls: [control('Knob', 'k1'), control('Knob', 'k2'), control('Slider', 's1'), control('Button', 'b1'), control('Meter', 'm1', 'ember')],
    ...extra,
  };
}

const pins = (panel) => Object.fromEntries(panel.controls.map((entry) => [entry._children.Core.id, entry._children.Core.controlSetId ?? '']));
const tolex = getControlSet('tolex');

test('the Apply window lists the kinds of control that follow the panel, and the pinned ones apart', () => {
  assert.equal(controlFamily('Knob'), 'Knobs');
  assert.equal(controlFamily('MomentaryButton'), 'Buttons');
  const summary = panelSetSummary(samplePanel());
  assert.deepEqual(summary.families, [{ label: 'Knobs', count: 2 }, { label: 'Sliders', count: 1 }, { label: 'Buttons', count: 1 }]);
  assert.equal(summary.pinned, 1);
  assert.deepEqual(summary.pinnedSets, ['ember']);
});

test('everything ticked is the old one-click Apply: the set changes, nothing is pinned', () => {
  const next = applyControlSetChoices(samplePanel(), { id: 'graphite-studio' }, {}, { oldSetId: 'tolex', oldSet: tolex, defaultPanelColour: DEFAULT_PANEL_COLOUR });
  assert.equal(next.controlSet.id, 'graphite-studio');
  assert.deepEqual(pins(next), { k1: '', k2: '', s1: '', b1: '', m1: 'ember' });
  assert.equal(next.bgColour, DEFAULT_PANEL_COLOUR, 'the background follows the new set');
  assert.equal('bgFollowsSet' in next, false);
  assert.equal('surfaceMaterial' in next, false);
});

test('a kind of control left unticked keeps its look: pinned to the set it was drawn with', () => {
  const next = applyControlSetChoices(samplePanel(), { id: 'graphite-studio' }, { families: new Set(['Knobs']) }, { oldSetId: 'tolex', oldSet: tolex, defaultPanelColour: DEFAULT_PANEL_COLOUR });
  assert.deepEqual(pins(next), { k1: '', k2: '', s1: 'tolex', b1: 'tolex', m1: 'ember' });
});

test('only the selected controls change; a pinned one changes only when asked', () => {
  const context = { oldSetId: 'tolex', oldSet: tolex, defaultPanelColour: DEFAULT_PANEL_COLOUR };
  const selected = applyControlSetChoices(samplePanel(), { id: 'graphite-studio' }, { selected: new Set(['k2', 'm1']) }, context);
  assert.deepEqual(pins(selected), { k1: 'tolex', k2: '', s1: 'tolex', b1: 'tolex', m1: 'ember' });
  const unpinned = applyControlSetChoices(samplePanel(), { id: 'graphite-studio' }, { includePinned: true }, context);
  assert.equal(pins(unpinned).m1, '', 'the meter pinned to Ember follows the panel again');
});

test('the background and the material can be kept', () => {
  const context = { oldSetId: 'tolex', oldSet: tolex, defaultPanelColour: DEFAULT_PANEL_COLOUR };
  const next = applyControlSetChoices(samplePanel(), { id: 'graphite-studio' }, { background: false, material: false }, context);
  assert.equal(next.bgColour, tolex.panel.colour.toUpperCase(), 'the colour the panel showed, written as its own');
  assert.equal(next.bgFollowsSet, false);
  assert.deepEqual(next.surfaceMaterial, tolex.panel.material, 'the old set\'s material, on the panel');
  // And the panel draws it so, even where the colour written is the default one.
  const kept = { ...samplePanel(), controlSet: { id: 'graphite-studio' }, bgFollowsSet: false };
  assert.match(buildSolidStyle(kept), /51, 51, 51|#333333/i, 'the default grey stays, not the set\'s colour');
  assert.doesNotMatch(buildSolidStyle({ ...kept, bgFollowsSet: undefined }), /51, 51, 51|#333333/i);
});

test('the store applies in one write, carries a library set, and clears what the choices took away', () => {
  panels.set([samplePanel({ bgFollowsSet: false, surfaceMaterial: { enabled: false } })]);
  try {
    assert.equal(requestControlSetApply('graphite-studio', 'panel-apply'), true);
    assert.deepEqual(get(controlSetApplyRequest), { panelId: 'panel-apply', setId: 'graphite-studio' });
    controlSetApplyRequest.set(null);
    let writes = 0;
    const stop = panels.subscribe(() => { writes += 1; });
    writes = 0;
    applyControlSetWithChoices('panel-apply', 'graphite-studio', { families: new Set(['Sliders']) });
    stop();
    assert.equal(writes, 1, 'one write, one undo step');
    const panel = get(panels)[0];
    assert.equal(panel.controlSet.id, 'graphite-studio');
    assert.equal(panel.bgFollowsSet, undefined, 'the background follows the set again');
    assert.equal(panel.surfaceMaterial, undefined, 'and so does the material');
    assert.deepEqual(pins(panel), { k1: 'tolex', k2: 'tolex', s1: '', b1: 'tolex', m1: 'ember' });
  } finally {
    panels.set([]);
  }
});

test('the Library is grouped: the panel\'s set, your own, materials, mechanisms, templates by era', () => {
  const mine = [{ id: 'my-set', name: 'My Set' }];
  const groups = groupControlSets({ librarySets: mine, builtInSets: BUILT_IN_CONTROL_SETS, panelSetId: 'kiln' });
  assert.deepEqual(groups.map((group) => group.id), ['panel', 'mine', 'materials', 'mechanical', 'templates']);
  assert.deepEqual(groups[0].sets.map((set) => set.id), ['kiln'], 'a set no longer offered still shows as the panel\'s own');
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
  assert.deepEqual(byId.mechanical.sets.map((set) => set.id).sort(), [...MECHANICAL_SET_IDS].sort());
  assert.equal(byId.templates.sets.length, 36);
  assert.ok(byId.templates.eras.length > 1, 'the templates are sub-grouped by era');
  assert.equal(byId.materials.sets.length + byId.mechanical.sets.length + byId.templates.sets.length, OFFERED_CONTROL_SETS.length, 'every offered built-in is somewhere, and only those');
  const found = groupControlSets({ librarySets: mine, builtInSets: BUILT_IN_CONTROL_SETS, query: 'tolex' });
  assert.deepEqual(found.flatMap((group) => group.sets.map((set) => set.id)), ['tolex']);
});

test('every offered built-in has a style, and a style keeps the Library to it', () => {
  const counts = {};
  for (const set of OFFERED_CONTROL_SETS) counts[controlSetStyle(set)] = (counts[controlSetStyle(set)] ?? 0) + 1;
  // Each listed by hand: an id misspelt in the list would fall to Modern and change these.
  assert.deepEqual(counts, { modern: 20, metal: 17, vintage: 15, glow: 12, mechanical: 8 });
  assert.deepEqual(SET_STYLES.map(([id]) => id).sort(), Object.keys(counts).sort());
  assert.equal(controlSetStyle({ id: 'my-amp', basedOn: 'tolex' }), 'vintage', 'your own set takes the style it was copied from');
  const vintage = groupControlSets({ builtInSets: BUILT_IN_CONTROL_SETS, panelSetId: 'neon', style: 'vintage' });
  const shown = vintage.filter((group) => group.id !== 'panel').flatMap((group) => group.sets);
  assert.equal(shown.length, 15);
  assert.ok(shown.every((set) => controlSetStyle(set) === 'vintage'));
  assert.deepEqual(vintage[0].sets.map((set) => set.id), ['neon'], 'the panel\'s own set stays in sight');
});

test('sets no longer offered: still drawn where they are used, offered nowhere', () => {
  // The owner: Walnut, Kiln, Arcade, Saddle & Brass, Field, Atlas and Spool "have nothing to do with
  // synths. Fun but not suitable for a panel."
  assert.deepEqual([...RETIRED_CONTROL_SET_IDS].sort(), ['arcade', 'atlas', 'field', 'kiln', 'saddle', 'spool', 'walnut']);
  for (const id of RETIRED_CONTROL_SET_IDS) {
    assert.ok(getControlSet(id), `${id} still resolves, so a panel drawn with it looks as it did`);
    assert.ok(!OFFERED_CONTROL_SETS.some((set) => set.id === id), `${id} is not offered`);
    assert.ok(!SHIPPED_STARTER_IDS.includes(id), `${id} has no shipped starter`);
  }
  assert.equal(OFFERED_CONTROL_SETS.length, BUILT_IN_CONTROL_SETS.length - RETIRED_CONTROL_SET_IDS.length);
  // A picker shows a retired set only where it is the one chosen.
  assert.ok(offeredControlSetsWith('walnut').some((set) => set.id === 'walnut'));
  assert.equal(offeredControlSetsWith('tolex'), OFFERED_CONTROL_SETS);
  assert.ok(!mergeControlSetLists([], [], offeredControlSetsWith('')).some((set) => set.id === 'walnut'));
  const core = source('sections/CoreEditor.svelte');
  assert.match(core, /offeredControlSetsWith\(core\.controlSetId/);
  assert.doesNotMatch(core, /BUILT_IN_CONTROL_SETS/);
  const library = readFileSync(new URL('../src/CE_Application/stores/controlSetLibrary.js', import.meta.url), 'utf8');
  assert.match(library, /mergeControlSetLists\(\$document, \$library, offeredControlSetsWith\(/);
});

test('every place a set is applied asks through the Apply window', () => {
  const settings = source('settings/ControlSetsSettings.svelte');
  assert.match(settings, /requestControlSetApply\(id, \$activePanelId\)/);
  assert.doesNotMatch(settings, /setPanelControlSet/);
  assert.match(settings, /<ControlSetCard \{set\}/, 'the Library shows each set by its knob');
  assert.match(settings, /class="column side"/, 'the preview has a column of its own');
  const card = source('panels/PanelCardContent.svelte');
  assert.match(card, /requestControlSetApply\(chosen, panel\.id\)/);
  assert.doesNotMatch(card, /setActivePanelControlSet/);
  const app = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  assert.match(app, /<ApplyControlSetDialog \/>/);
  const dialog = source('layout/ApplyControlSetDialog.svelte');
  assert.match(dialog, /applyControlSetWithChoices\(panel\.id, request\.setId/);
  assert.doesNotMatch(dialog, /type="color"/);
});
