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
import { BUILT_IN_CONTROL_SETS, ILLUSTRATED_CONTROL_SET_IDS, OFFERED_CONTROL_SETS, RETIRED_CONTROL_SET_IDS, controlSetOptionLabel, getControlSet, illustratedKinds, illustratedValueNote, isIllustratedControlSet, offeredAnatomyOptions, offeredControlSetsWith } from '../src/CE_Application/models/controlSets.js';
import { anatomyOptions, isIllustratedForm } from '../src/CE_Application/models/controlAnatomy.js';
import { mergeControlSetLists } from '../src/CE_Application/stores/controlSetLibrary.js';
import { SHIPPED_STARTER_IDS } from '../scripts/export-control-set-starters.mjs';
import { applyControlSetChoices, controlFamily, panelSetSummary } from '../src/CE_Application/utils/controlSetApply.js';
import { controlSetStyle, groupControlSets, ILLUSTRATED_GROUP_NOTE, SET_STYLES } from '../src/CE_Application/utils/controlSetGroups.js';
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

test('a control pinned to a set of your own keeps it: in the editor, the plug-in and the export', async () => {
  // The Apply window pins what is not to change to the set it was drawn with. A pin was looked up
  // among the built-ins only, so a panel on one of your own sets lost it: the knobs left unticked
  // took the new set after all.
  const { controlSetForControl, resolveControlForSet } = await import('../src/CE_Application/models/controlSetFamilies.js');
  const { serializePanel } = await import('../src/CE_Application/stores/panelModel.js');
  const mine = { ...getControlSet('tolex'), id: 'my-amp', name: 'My Amp', tokens: { ...getControlSet('tolex').tokens, accent: 'FF12AB34' } };
  panels.set([samplePanel({ controlSet: { id: 'my-amp' }, controlSets: [mine] })]);
  try {
    applyControlSetWithChoices('panel-apply', 'graphite-studio', { families: new Set(['Sliders']) });
    const panel = get(panels)[0];
    const knob = panel.controls.find((entry) => entry._children.Core.id === 'k1');
    assert.equal(knob._children.Core.controlSetId, 'my-amp');
    const panelSet = getControlSet('graphite-studio');
    assert.equal(controlSetForControl(knob, panelSet, { document: panel.controlSets }).id, 'my-amp', 'found among the panel\'s own sets');
    assert.equal(controlSetForControl(knob, panelSet, { library: [mine] }).id, 'my-amp', 'and in the library');
    assert.equal(controlSetForControl(knob, panelSet).id, 'graphite-studio', 'without them, the panel\'s set, as before');
    const drawn = resolveControlForSet({ ...knob, _children: { ...knob._children, Core: { ...knob._children.Core, controlColour: '{accent}' } } }, panelSet, { document: panel.controlSets });
    assert.equal(drawn._children.Core.controlColour, 'FF12AB34', 'drawn with its own set\'s colours');
    // The build bakes each control against its own set, from the sets the document carries.
    const exported = JSON.parse(serializePanel({ ...panel, controls: [{ ...knob, _children: { ...knob._children, Core: { ...knob._children.Core, controlColour: '{accent}' } } }] }, { bakeControlSet: panelSet, elide: false }));
    assert.equal(exported.controls[0]._children.Core.controlColour, 'FF12AB34');
  } finally {
    panels.set([]);
  }
  const canvas = source('editor/CanvasControl.svelte');
  assert.match(canvas, /controlSetForControl\(documentControl,[\s\S]*?contextSetSources\(\) : \$controlSetSources\)\)/);
  const preview = source('editor/PanelPreviewSurface.svelte');
  assert.match(preview, /setContext\(CONTROL_SET_SOURCES_CONTEXT_KEY, panelSetSources\)/);
});

test('the Library is grouped: the panel\'s set, your own, materials, the illustrated two, templates by era', () => {
  const mine = [{ id: 'my-set', name: 'My Set' }];
  const groups = groupControlSets({ librarySets: mine, builtInSets: BUILT_IN_CONTROL_SETS, panelSetId: 'kiln' });
  assert.deepEqual(groups.map((group) => group.id), ['panel', 'mine', 'materials', 'illustrated', 'templates']);
  assert.deepEqual(groups[0].sets.map((set) => set.id), ['kiln'], 'a set no longer offered still shows as the panel\'s own');
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
  assert.deepEqual(byId.illustrated.sets.map((set) => set.id).sort(), [...ILLUSTRATED_CONTROL_SET_IDS].sort());
  assert.equal(byId.illustrated.label, 'Illustrated');
  assert.equal(byId.illustrated.note, ILLUSTRATED_GROUP_NOTE, 'the group says how its sets differ');
  assert.equal(byId.templates.sets.length, 36);
  assert.ok(byId.templates.eras.length > 1, 'the templates are sub-grouped by era');
  assert.equal(byId.materials.sets.length + byId.illustrated.sets.length + byId.templates.sets.length, OFFERED_CONTROL_SETS.length, 'every offered built-in is somewhere, and only those');
  const found = groupControlSets({ librarySets: mine, builtInSets: BUILT_IN_CONTROL_SETS, query: 'tolex' });
  assert.deepEqual(found.flatMap((group) => group.sets.map((set) => set.id)), ['tolex']);
});

test('every offered built-in has a style, and a style keeps the Library to it', () => {
  const counts = {};
  for (const set of OFFERED_CONTROL_SETS) counts[controlSetStyle(set)] = (counts[controlSetStyle(set)] ?? 0) + 1;
  // Each listed by hand: an id misspelt in the list would fall to Modern and change these.
  assert.deepEqual(counts, { modern: 20, metal: 17, vintage: 15, glow: 12, illustrated: 2 });
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
  // synths. Fun but not suitable for a panel." Then Tessera, Bellows, Helix, Balance, Fan and Crown:
  // "hardly usable for a synthesizer panel". Iris and Satellite stay.
  assert.deepEqual([...RETIRED_CONTROL_SET_IDS].sort(), ['arcade', 'atlas', 'balance', 'bellows', 'crown', 'fan', 'field', 'helix', 'kiln', 'saddle', 'spool', 'tessera', 'walnut']);
  assert.deepEqual([...ILLUSTRATED_CONTROL_SET_IDS].sort(), ['iris', 'satellite']);
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

test('Iris and Satellite are marked as illustrated wherever a set or a form is chosen', () => {
  // The owner: "it should be clear for those two that they do not work as the rest as a control set."
  for (const id of ILLUSTRATED_CONTROL_SET_IDS) {
    const set = getControlSet(id);
    assert.ok(isIllustratedControlSet(set), `${id} draws its controls whole`);
    assert.equal(controlSetOptionLabel(set), `${set.name} (illustrated)`);
    assert.deepEqual(illustratedKinds(set).map((kind) => kind.tab), ['Knob', 'Button', 'Switch', 'Meter']);
    assert.ok(illustratedValueNote(set), `${id} says how its value shows`);
    assert.equal(controlSetStyle(set), 'illustrated');
  }
  for (const set of OFFERED_CONTROL_SETS.filter((entry) => !ILLUSTRATED_CONTROL_SET_IDS.includes(entry.id))) {
    assert.ok(!isIllustratedControlSet(set), `${set.id} is made of parts`);
    assert.equal(controlSetOptionLabel(set), set.name);
  }
  // A retired set says that, not "illustrated"; a copy of Iris is still one, with Iris's line.
  assert.equal(controlSetOptionLabel(getControlSet('atlas')), 'Atlas (no longer offered)');
  const copy = { ...structuredClone(getControlSet('iris')), id: 'my-iris', name: 'My Iris', basedOn: 'iris' };
  assert.ok(isIllustratedControlSet(copy));
  assert.equal(illustratedValueNote(copy), illustratedValueNote(getControlSet('iris')));
  // A copy whose knobs took a template's design no longer names the knobs.
  delete copy.families.Knob.component['Core.controlForm'];
  assert.deepEqual(illustratedKinds(copy).map((kind) => kind.noun), ['keys', 'switches', 'meters']);

  // Forms: only the twelve mechanical ones are illustrations; the 36 synth sets' forms are parts.
  assert.ok(isIllustratedForm('new-iris') && isIllustratedForm('new-satellite') && isIllustratedForm('new-atlas'));
  assert.ok(!isIllustratedForm('new-brassworks') && !isIllustratedForm('disc') && !isIllustratedForm(''));
  for (const type of ['Knob', 'Button', 'ToggleButton', 'Meter']) {
    const offered = offeredAnatomyOptions(type);
    assert.equal(offered.length, anatomyOptions(type).length - 10, `${type}: the ten retired sets' forms are not offered`);
    assert.deepEqual(offered.filter(([, name]) => name.endsWith(' (illustrated)')).map(([id]) => id), ['new-iris', 'new-satellite']);
    assert.ok(offeredAnatomyOptions(type, 'new-atlas').some(([id]) => id === 'new-atlas'), 'the chosen form stays in sight');
  }

  // Where it shows: the pickers, the Library card and group, the set's page, and the part tabs.
  assert.match(source('sections/CoreEditor.svelte'), /controlSetOptionLabel\(design\)/);
  assert.match(source('sections/CoreEditor.svelte'), /offeredAnatomyOptions\(core\.controlType/);
  assert.match(source('panels/PanelCardContent.svelte'), /controlSetOptionLabel\(set\)/);
  const settings = source('settings/ControlSetsSettings.svelte');
  assert.match(settings, /group\.note/);
  assert.match(settings, /data-illustrated-callout/);
  assert.match(settings, /Illustrated set/);
  assert.match(source('settings/ControlSetCard.svelte'), /isIllustratedControlSet\(set\)/);
  for (const tab of ['sections/KnobPartsEditor.svelte', 'sections/ButtonPartsEditor.svelte', 'sections/MeterPartsEditor.svelte']) {
    assert.match(source(tab), /<IllustratedFormNote name=/, `${tab} says when its parts do not apply`);
  }
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
