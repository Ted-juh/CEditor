// componentCopy.test.js — step 3 of simplifying custom components: a placed copy's Component tab.
//
// Before: the tab was "Properties", last in the list: a Public API card (the contract's name, "5
// public items", counts of inputs, outputs and props), Open Designer and Open Settings, the Source
// card with its fingerprint ("Library 1.1.0 changes 1 thing in Parts", never what the author said
// changed), Published Inputs, Editable Properties with an image as a text field of its data URL,
// and a list of Published Outputs. Now: Component, first, opened when a copy is selected: which
// component, a notice quoting what changed when the library has a newer version, the copy's
// values and settings, and More for what to do with changes made in the copy's own designer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { instantiateCustomComponentPackageControl } from '../src/CE_Application/utils/customComponentPackage.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import {
  bindingLabel, copyDifferences, copySettingRows, copyStanding, copyValuePatch, copyValueRows,
  imageSource, parseCopyValue, resetCopyPatch,
} from '../src/CE_Application/utils/componentCopy.js';
import CustomComponentTab from '../src/CE_Application/sections/CustomComponentTab.svelte';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
let family = 0;

/** A knob saved to the library as `name` 1.0.0, and a copy of it as placed on a panel. */
function placedKnob() {
  const name = `Copy Knob ${family += 1}`;
  const component = createControl('CustomComponent');
  applyPatchObject(component, createCustomComponentStarterPatch('starter.filmstripKnob'));
  component._children.Core.name = name;
  // A package's family is its addressable name, and the starter's is the same for every test.
  component._children.ExternalAPI.addressableName = `copyKnob${family}`;
  component._children.PublishedProperties.editableProperties = {
    label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true, defaultValue: 'FILMSTRIP' },
    needle: { path: 'Parts.pointer.Background.Fill.colour', label: 'Needle colour', type: 'color', enabled: true, part: 'pointer', defaultValue: 'FFEAF6FF' },
  };
  component._children.Parts._children.pointer._children.Background._children.Fill.colour = 'FFEAF6FF';
  const v1 = customComponentLibrary.saveControl(component, { name, version: '1.0.0' });
  const copy = instantiateCustomComponentPackageControl(v1.envelope);
  return { name, component, copy };
}

const library = () => get(customComponentLibrary);

test('a copy placed from the library, up to date, says so in a line', () => {
  const { name, copy } = placedKnob();
  const standing = copyStanding(copy, library());
  assert.deepEqual([standing.name, standing.version, standing.state, standing.line],
    [name, '1.0.0', 'library', 'version 1.0.0 · from your library']);
  assert.deepEqual(standing.newer, []);
});

test('a newer version in the library: the notice quotes what changed, newest first', () => {
  const { name, component, copy } = placedKnob();
  component._children.Parts._children.pointer._children.Background._children.Fill.colour = 'FFFF3B30';
  customComponentLibrary.saveControl(component, { name, version: '1.1.0', changes: 'The needle is red now.' });
  component._children.Parts._children.label._children.Text.content = 'DIAL';
  customComponentLibrary.saveControl(component, { name, version: '1.2.0', changes: 'Says DIAL.' });
  const standing = copyStanding(copy, library());
  assert.equal(standing.state, 'update');
  assert.deepEqual(standing.newer, [
    { version: '1.2.0', changes: 'Says DIAL.' },
    { version: '1.1.0', changes: 'The needle is red now.' },
  ]);
  assert.ok(copyDifferences(standing.report).some((row) => /pointer/.test(row.what)), 'More lists what the update changes');
});

test('a copy changed in its own designer, and one that is also behind the library', () => {
  const { name, component, copy } = placedKnob();
  copy._children.Parts._children.background._children.Corners = { _type: 'Corners', radius: 14 };
  copy._children.Parts._children.background._children.Layout.width = 77;
  assert.equal(copyStanding(copy, library()).state, 'edited');
  component._children.Parts._children.pointer._children.Background._children.Fill.colour = 'FFFF3B30';
  customComponentLibrary.saveControl(component, { name, version: '1.1.0', changes: 'Red.' });
  const standing = copyStanding(copy, library());
  assert.equal(standing.state, 'diverged');
  assert.ok(standing.report.localEdits > 0);
});

test('a component made on the panel, and one whose package the library no longer has', () => {
  const local = createControl('CustomComponent');
  local._children.Core.name = 'Dial';
  assert.deepEqual([copyStanding(local, library()).state, copyStanding(local, library()).line],
    ['local', 'made on this panel · not in your library']);
  const { copy } = placedKnob();
  const without = library().filter((entry) => entry.id !== copy._children.Designer.sourcePackage.id && entry.name !== copy._children.Designer.sourcePackage.name);
  assert.equal(copyStanding(copy, without).state, 'missing');
});

test('its values: where each starts on this panel, what it is bound to, and what it resets to', () => {
  const { copy } = placedKnob();
  copy._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, bindings: [{ kind: 'deviceParameter', parameterId: 'filter.cutoff', port: 'mainValue' }] };
  let [row] = copyValueRows(copy);
  assert.deepEqual([row.name, row.label, row.bound, row.customized], ['mainValue', 'Knob Value', 'filter.cutoff', false]);
  applyPatchObject(copy, copyValuePatch('mainValue', parseCopyValue('0.8', row.type, row.value)));
  [row] = copyValueRows(copy, library().find((entry) => entry.name === copy._children.Designer.sourcePackage.name).component);
  assert.equal(row.value, 0.8);
  assert.equal(row.customized, true, 'against the library\'s own start for it');
  assert.equal(bindingLabel({ kind: 'oscControl' }), 'Bound');
  assert.equal(bindingLabel(null), '');
});

test('its settings: changed on this copy, reset one by one or all together', () => {
  const { copy } = placedKnob();
  copy._children.Parts._children.label._children.Text.content = 'CUTOFF';
  const rows = copySettingRows(copy);
  assert.deepEqual(rows.map((row) => `${row.label}:${row.customized}`), ['Label:true', 'Needle colour:false']);
  assert.deepEqual(resetCopyPatch(copy), { 'Parts.label.Text.content': 'FILMSTRIP' });
  assert.equal(imageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(imageSource('knobFrames'), '', 'not something a browser can draw');
});

test('the tab draws the copy: which component, its value and settings, Export for one made here', () => {
  const local = createControl('CustomComponent');
  local._children.Core.name = 'Dial';
  const body = render(CustomComponentTab, { props: { control: local } }).body
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(body, /Dial made on this panel · not in your library Export…/);
  assert.match(body, /Main Value/);
  assert.match(body, /Not bound/);
  const tab = src('CE_Application/sections/CustomComponentTab.svelte');
  // Gone: the counts, the API card, a data URL to read, the outputs list.
  assert.doesNotMatch(tab, /Public API|public items|Published Outputs|Open Public API Editor/);
  assert.doesNotMatch(tab, /value=\{row\.value \?\? ''\}[^>]*image/);
  // Colours go through the display panel's swatch, which opens the Colors tool on the field.
  assert.match(tab, /<SwatchCluster swatches=\{\[\{ key: `setting_\$\{row\.name\}`[^}]*target: \{ type: 'control', controlId, path: row\.path \}/);
});

test('Component is first, opens when a copy is selected, and keeps the tab between copies', () => {
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panel, /const allComponentTabs = \[[\s\S]{0,400}\{ id: 'properties', icon: ComponentIcon, label: 'Component'/);
  assert.match(panel, /if \(isCopy && !lastSelectionWasCopy && viewMode === 'single' && componentTabs\.some\(\(tab\) => tab\.id === 'properties'\)\) \{\s*setActiveSingleTab\('properties'\);/);
  assert.match(panel, /lastSelectionWasCopy = isCopy;/, 'from one copy to the next, the tab stays');
  assert.match(src('CE_Application/panels/sectionEditorLoaders.js'), /properties: \(\) => import\('\.\.\/sections\/CustomComponentTab\.svelte'\)/);
});

test('an image read from a file never lands on a component selected meanwhile', () => {
  for (const [file, id] of [['CustomComponentTab.svelte', 'controlId'], ['CustomSettingsEditor.svelte', 'coreId']]) {
    const source = src(`CE_Application/sections/${file}`);
    const body = source.slice(source.indexOf('function chooseImage'), source.indexOf('function', source.indexOf('function chooseImage') + 10));
    assert.match(body, new RegExp(`const targetId = ${id};`), file);
    assert.match(body, new RegExp(`if \\(${id} === targetId\\)`), file);
  }
});
