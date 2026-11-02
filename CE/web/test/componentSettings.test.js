// componentSettings.test.js — step 2 of simplifying custom components: the Settings tab replaces
// Publish, and every value is the panel's unless its author keeps it in.
//
// Before: a value reached the panel only once published (Publish › Contract › Published Inputs /
// Outputs, or a Quick Publish recipe); the Device tab and links offered nothing else. The settings a
// copy could change were "Editable Properties", an Add / Selected / Remove editor with a Path field,
// and their defaults were a separate thing to fill in, which the Quality list then warned about.
// Package & Library held the library's details and file actions inside the designer, and the
// designer opened on a "Not reusable yet" bar of readiness steps.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getComponentPorts } from '../src/CE_Application/models/componentPorts.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createCustomComponentStarterPatch, createValueChannel } from '../src/CE_Application/utils/customComponentFactory.js';
import { dropEditablePropertiesWithMissingTargets, dropVariantSettingWithoutVariants, summarizeCustomComponent } from '../src/CE_Application/utils/customComponentPackage.js';
import { panelValueEntries, panelValuePatch, valueIsForPanel } from '../src/CE_Application/utils/componentPanelValues.js';
import {
  addSettingPatch, refreshSettingDefaultsPatch, removeSettingPatch, settingLabelPatch, settingOptions,
  settingRows, settingTarget, settingValuePatch, valueRows, valueSummary,
} from '../src/CE_Application/utils/componentSettings.js';
import { componentExportDetails } from '../src/CE_Application/utils/componentExport.js';
import { exportComponent, exportWholeLibrary, saveLibraryEntryToFile } from '../src/CE_Application/stores/componentExport.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { panels, activePanelId, setActiveEditorTab } from '../src/CE_Application/stores/panels.js';
import { componentDocuments, createComponentDocument } from '../src/CE_Application/stores/componentWorkspace.js';
import { LIBRARY_SORT_KEYS } from '../src/CE_Application/utils/componentLibraryModel.js';
import CustomSettingsEditor from '../src/CE_Application/sections/CustomSettingsEditor.svelte';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function knob() {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));
  dropEditablePropertiesWithMissingTargets(control);
  dropVariantSettingWithoutVariants(control);
  return control;
}

/** The knob, with a value of its own made on Interact and never published. */
function knobWithGain() {
  const control = knob();
  control._children.ValueChannels._children.gain = createValueChannel('gain', { label: 'Gain', min: 0, max: 2, defaultValue: 1 });
  return control;
}

const channelsOf = (entries) => entries.map(([name, entry]) => String(entry?.channel || name));

// --- Values ------------------------------------------------------------------------------------

test('every value is the panel\'s: a value never published binds on the Device tab and links', () => {
  const control = knobWithGain();
  assert.deepEqual(channelsOf(panelValueEntries(control, 'input')), ['mainValue', 'gain']);
  assert.deepEqual(channelsOf(panelValueEntries(control, 'output')), ['mainValue', 'gain']);
  const ports = getComponentPorts(control).map((port) => port.id);
  assert.ok(ports.includes('gain') && ports.includes('out:gain'), `Device tab ports: ${ports.join(', ')}`);
  // Under its own label and range, which the Device tab and the links editor show.
  const gain = panelValueEntries(control, 'input').find(([name]) => name === 'gain')[1];
  assert.deepEqual([gain.label, gain.min, gain.max], ['Gain', 0, 2]);
  // The library counts the same values.
  assert.deepEqual([summarizeCustomComponent(control).publicInputs, summarizeCustomComponent(control).publicOutputs], [2, 2]);
});

test('a published entry keeps its name, label and range; one switched off keeps its value out', () => {
  const control = knobWithGain();
  control._children.PublishedProperties.inputs.mainValue.label = 'Cutoff';
  const [name, entry] = panelValueEntries(control, 'input')[0];
  assert.deepEqual([name, entry.label], ['mainValue', 'Cutoff']);
  control._children.PublishedProperties.inputs.mainValue.enabled = false;
  assert.deepEqual(channelsOf(panelValueEntries(control, 'input')), ['gain']);
  assert.deepEqual(channelsOf(panelValueEntries(control, 'input', { includeInternal: true })), ['mainValue', 'gain'],
    'the "allInternals" link policy still reaches it');
});

test('the Settings tab\'s tick keeps a value in, and gives it back, published or not', () => {
  const control = knobWithGain();
  applyPatchObject(control, panelValuePatch(control, 'mainValue', false));
  assert.equal(valueIsForPanel(control, 'mainValue'), false);
  assert.equal(getComponentPorts(control).some((port) => port.channel === 'mainValue'), false);
  assert.equal(control._children.PublishedProperties.inputs.mainValue.enabled, false, 'its published entries switch with it');
  applyPatchObject(control, panelValuePatch(control, 'mainValue', true));
  assert.equal(valueIsForPanel(control, 'mainValue'), true);
  applyPatchObject(control, panelValuePatch(control, 'gain', false));
  assert.deepEqual([control._children.ValueChannels._children.gain.publicInput, control._children.ValueChannels._children.gain.publicOutput], [false, false]);
  assert.deepEqual(valueRows(control).map((row) => `${row.label}:${row.forPanel}`), ['Knob Value:true', 'Gain:false']);
});

test('a value says what it is in a few words', () => {
  assert.equal(valueSummary({ type: 'float', min: 0, max: 1, defaultValue: 0.5 }), '0 to 1, starts at 0.5');
  assert.equal(valueSummary({ type: 'bool', defaultValue: true }), 'on or off, starts on');
  assert.equal(valueSummary({ type: 'enum', values: ['A', 'B'], defaultValue: 'A' }), '2 choices, starts at A');
});

// --- Settings ----------------------------------------------------------------------------------

test('each setting says what it changes, and shows the component\'s own value', () => {
  const rows = settingRows(knob());
  assert.deepEqual(rows.map((row) => `${row.label} | ${row.what} | ${row.kind}`), [
    'Label | the text of “label” | text',
    'Filmstrip Source | the image of “knobFrames” | image',
  ]);
  assert.equal(rows[0].value, 'FILMSTRIP');
  assert.equal(settingTarget('Parts.pointer.Background.Fill.colour').what, 'the fill of “pointer”');
  assert.equal(settingTarget('Parts.pointer.visible').what, 'whether “pointer” is shown');
  assert.equal(settingTarget('Parts.label.Text.Fill.colour').what, 'the text colour of “label”');
});

test('+ Add a setting offers the component\'s own layers, grouped, and marks what is a setting already', () => {
  const groups = settingOptions(knob());
  assert.deepEqual(groups.map((group) => group.group), ['Texts', 'Colours', 'Images', 'Show / hide']);
  const colours = groups.find((group) => group.group === 'Colours').items;
  assert.deepEqual(colours.map((item) => `${item.name} ${item.detail}`), ['background fill', 'label text colour', 'fallbackRing fill', 'pointer fill']);
  assert.equal(groups[0].items[0].added, true, 'the label\'s text is a setting already');
  // A run of numbered layers (tick0 … tick10) is not offered one by one.
  const ticks = knob();
  for (let i = 0; i < 4; i += 1) ticks._children.Parts._children[`tick${i}`] = { _type: 'Part', kind: 'rectangle', _children: { Background: {} } };
  assert.equal(settingOptions(ticks).flatMap((group) => group.items).some((item) => /^tick\d/.test(item.name)), false);
});

test('a setting starts as the component looks now; changing it changes the component and its default', () => {
  const control = knob();
  const pointer = settingOptions(control).find((group) => group.group === 'Colours').items.find((item) => item.name === 'pointer');
  const { name, patch } = addSettingPatch(control, pointer);
  applyPatchObject(control, patch);
  const fill = control._children.Parts._children.pointer._children.Background._children.Fill.colour;
  assert.deepEqual(control._children.PublishedProperties.editableProperties[name],
    { path: 'Parts.pointer.Background.Fill.colour', label: 'Pointer colour', type: 'color', enabled: true, part: 'pointer', defaultValue: fill });
  applyPatchObject(control, settingValuePatch(control, name, 'FFFF0000'));
  assert.equal(control._children.Parts._children.pointer._children.Background._children.Fill.colour, 'FFFF0000');
  assert.equal(control._children.PublishedProperties.editableProperties[name].defaultValue, 'FFFF0000');
  applyPatchObject(control, settingLabelPatch(name, 'Needle colour'));
  assert.equal(settingRows(control).find((row) => row.name === name).label, 'Needle colour');
  // Added twice, it is not two settings.
  assert.deepEqual(addSettingPatch(control, pointer).patch, {});
  // Removed, the map is replaced so a saved component records the removal.
  const removal = removeSettingPatch(control, name);
  assert.deepEqual(Object.keys(removal), ['PublishedProperties.editableProperties']);
  assert.equal(name in removal['PublishedProperties.editableProperties'], false);
});

test('a setting switched off is switched back on rather than added twice', () => {
  const control = knob();
  control._children.PublishedProperties.editableProperties.label.enabled = false;
  const label = settingOptions(control)[0].items[0];
  assert.equal(label.added, false);
  assert.deepEqual(addSettingPatch(control, label), { name: 'label', patch: { 'PublishedProperties.editableProperties.label.enabled': true } });
});

test('on export, every setting\'s default becomes what the component shows', () => {
  const control = knob();
  control._children.PublishedProperties.editableProperties.label.defaultValue = 'OLD';
  control._children.Parts._children.label._children.Text.content = 'CUTOFF';
  const refreshed = refreshSettingDefaultsPatch(control);
  assert.equal(refreshed['PublishedProperties.editableProperties.label.defaultValue'], 'CUTOFF');
  // The starter's filmstrip setting had no default at all, and gets the image it shows.
  assert.match(refreshed['PublishedProperties.editableProperties.filmstrip.defaultValue'], /^data:image\/svg\+xml,/);

  panels.set([]);
  activePanelId.set(null);
  componentDocuments.set([]);
  const document = createComponentDocument({ name: 'Untitled Component', control });
  setActiveEditorTab({ type: 'component', id: document.id });
  const live = () => get(componentDocuments).at(-1).control;
  const result = exportComponent(live(), {
    name: 'Cutoff Knob', version: '1.0.0', toLibrary: true,
    details: { description: 'A knob for the filter.', category: 'display', tags: 'knob, filter', author: 'Tester', license: 'CC0' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.entry.envelope.component._children.PublishedProperties.editableProperties.label.defaultValue, 'CUTOFF',
    'what is saved starts as the component looked');
  assert.equal(live()._children.PublishedProperties.editableProperties.label.defaultValue, 'CUTOFF', 'and so does the component');
  const saved = get(customComponentLibrary).find((entry) => entry.name === 'Cutoff Knob');
  assert.deepEqual([saved.description, saved.category, saved.tags, saved.author, saved.license],
    ['A knob for the filter.', 'display', ['knob', 'filter'], 'Tester', 'CC0']);
  // The Export window fills its Details in from that, next time.
  assert.deepEqual(componentExportDetails(live(), get(customComponentLibrary), 'Cutoff Knob'),
    { description: 'A knob for the filter.', category: 'display', tags: 'knob, filter', author: 'Tester', license: 'CC0' });
  // The dock Library tab's file actions name their files as Export does.
  assert.equal(saveLibraryEntryToFile(saved), 'Cutoff Knob-1.0.0.ceditor-component.json');
  assert.match(exportWholeLibrary(get(customComponentLibrary)), /^ceditor-component-library-\d{4}-\d{2}-\d{2}\.json$/);
});

// --- Where it is ---------------------------------------------------------------------------------

test('the Settings tab draws the two lists for a component', () => {
  const body = render(CustomSettingsEditor, { props: { control: knob() } }).body
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(body, /What a panel that uses this component can change\./);
  assert.match(body, /Knob Value 0 to 1, starts at 0\.5 Panel can use it/);
  assert.match(body, /Label the text of “label”/);
  assert.match(body, /Add a setting/);
  // Colours go through the Colors tool or a typed code: no colour picker here.
  assert.doesNotMatch(src('CE_Application/sections/CustomSettingsEditor.svelte'), /type="color"|ColorPicker|SwatchCluster/);
});

test('Settings replaces Publish; Package & Library\'s parts went to Export and the Library tab; no readiness bar', () => {
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panel, /\{ id: 'publish', +icon: SlidersVertical, label: 'Settings', section: 'PublishedProperties' \}/);
  assert.match(src('CE_Application/panels/sectionEditorLoaders.js'), /publish: \(\) => import\('\.\.\/sections\/CustomSettingsEditor\.svelte'\)/);
  const dialog = src('CE_Application/layout/ComponentExportDialog.svelte');
  assert.match(dialog, /Details \(optional\)/);
  for (const field of ['description', 'category', 'tags', 'author', 'license']) assert.match(dialog, new RegExp(`bind:value=\\{details\\.${field}\\}`));
  const libraryTab = src('CE_Application/components/LibraryTab.svelte');
  assert.match(libraryTab, /data-testid="library-import" onclick=\{\(\) => importComponentFromFile\(\)\}/);
  assert.match(libraryTab, /data-testid="library-export-all"/);
  const detail = src('CE_Application/components/library/LibraryDetail.svelte');
  assert.match(detail, /Open in Designer/);
  assert.match(detail, /Save as file…/);
  assert.equal(LIBRARY_SORT_KEYS.includes('ready'), false);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.doesNotMatch(designer, /<strong>Not reusable yet:<\/strong>/);
  assert.doesNotMatch(designer, /readinessNudgeSteps|analyzeCustomComponentReadiness/);
});
