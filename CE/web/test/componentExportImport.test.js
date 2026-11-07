// componentExportImport.test.js — step 1 of simplifying custom components to "import, change, choose
// what the panel may change, export".
//
// Before: a component open on its own (File › New Custom Component, or opened from the library) got
// the drawing surface and a properties panel that said "No panel open", so none of the designer's
// tabs and no way to save it; Save was greyed out. Exporting was "Save local package" at the bottom
// of Publish › Package & Library, after a contract page of eight sections and three systems of checks
// that blocked nothing; importing a file was a paste box and a File button on that same page. Now:
// the panel works for it, Export… (and Ctrl+S) saves it to the library and/or a file with three
// checks that matter, File › Import Component… and a dropped file bring one in, and Variants are
// hidden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { existsSync, readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, activePanelId, setActiveEditorTab } from '../src/CE_Application/stores/panels.js';
import { addControl, selectedControl, standaloneComponentControl, updateSelectedProperty, updateSelectedInspectorProperty } from '../src/CE_Application/stores/controls.js';
import { componentDocuments, createComponentDocument } from '../src/CE_Application/stores/componentWorkspace.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { createCustomComponentExportEnvelope, createCustomComponentLibraryEnvelope as libraryEnvelope } from '../src/CE_Application/utils/customComponentPackage.js';
import { componentExportChecks, componentExportFileName, componentExportName, componentExportVersion } from '../src/CE_Application/utils/componentExport.js';
import { exportComponent } from '../src/CE_Application/stores/componentExport.js';
import { componentPackagesFromText, importComponentText, mayBeComponentFile } from '../src/CE_Application/stores/componentImport.js';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function knob() {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));
  return control;
}

/** A component open on its own, in front: the tab the File menu's New Custom Component opens. */
function standalone(control = null) {
  panels.set([]);
  activePanelId.set(null);
  componentDocuments.set([]);
  const document = createComponentDocument({ name: 'Untitled Component', control });
  setActiveEditorTab({ type: 'component', id: document.id });
  return document;
}
const current = () => get(componentDocuments).at(-1);

test('a component open on its own is the selection, and the properties panel\'s writes reach it', () => {
  const document = standalone();
  assert.equal(get(standaloneComponentControl)?._children?.Core?.id, document.id);
  assert.equal(get(selectedControl)?._children?.Core?.id, document.id, 'the panel reads it as the selected control');
  updateSelectedProperty('Core.tooltip', 'Turn me');
  updateSelectedInspectorProperty('Transform.opacity', 0.5);
  assert.equal(current().control._children.Core.tooltip, 'Turn me');
  assert.equal(current().control._children.Transform.opacity, 0.5);
  assert.equal(current().modified, true);
  // The panel draws for it, in component mode, and its toolbar keeps only what has no panel to need.
  const panelSource = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panelSource, /\{#if \$activePanel \|\| standaloneComponent\}/);
  assert.match(panelSource, /let contextMode = \$derived\(\$selectedComponentId != null \|\| standaloneComponent \? 'component' : 'panel'\);/);
  assert.match(src('CE_Application/panels/PropertiesToolbar.svelte'), /\{#if panel\}\s*<div class="toolbar-divider"><\/div>\s*<button class="toolbar-btn" class:active=\{panel\.modified\} title="Save panel"/);
});

test('the checks: something drawn, a value something changes, settings that point somewhere', () => {
  const blank = createControl('CustomComponent');
  const blankChecks = componentExportChecks(blank);
  assert.equal(blankChecks[0].level, 'warn');
  assert.match(blankChecks[0].text, /draws nothing/);
  assert.equal(blankChecks[1].level, 'warn');
  assert.match(blankChecks[1].text, /no hit zone.*display.*knob or a button needs one/);

  const checks = componentExportChecks(knob());
  assert.deepEqual(checks.map((check) => check.level), ['ok', 'ok', 'ok']);
  assert.match(checks[0].text, /^It draws something: \d+ layers\.$/);
  assert.match(checks[1].text, /^Its value can be changed: knobZone drives Knob Value\.$/);
  assert.match(checks[2].text, /settings? points? at something that exists\.$/);

  const broken = knob();
  broken._children.PublishedProperties.editableProperties.ghost = { path: 'Parts.nothingHere.Text.content', label: 'Ghost', type: 'text', enabled: true };
  const settings = componentExportChecks(broken)[2];
  assert.equal(settings.level, 'warn');
  assert.match(settings.text, /“ghost” points at something that no longer exists/);
  assert.equal(settings.fix, 'drop-missing-settings');
});

test('the suggested version follows what the library holds under that name', () => {
  const control = knob();
  assert.equal(componentExportName(control), control._children.Core.name);
  assert.deepEqual(componentExportVersion(control, [], 'Fresh'), { version: '1.0.0', was: null });
  const library = [{ name: 'Fresh', version: '1.0.0' }, { name: 'fresh', version: '1.2.0' }, { name: 'Other', version: '4.0.0' }];
  assert.deepEqual(componentExportVersion(control, library, 'Fresh'), { version: '1.3.0', was: '1.2.0' });
  assert.equal(componentExportFileName('Filmstrip Knob', '1.1.0'), 'Filmstrip Knob-1.1.0.ceditor-component.json');
  assert.equal(componentExportFileName('a/b:c', ''), 'a-b-c-1.0.0.ceditor-component.json');
});

test('Export saves it to the library, and a component open on its own takes the name and is saved', () => {
  standalone(knob());
  const before = get(customComponentLibrary).length;
  const result = exportComponent(current().control, { name: 'Test Knob', version: '1.0.0', changes: 'First.', toLibrary: true });
  assert.equal(result.ok, true);
  assert.equal(get(customComponentLibrary).length, before + 1);
  const entry = get(customComponentLibrary).find((item) => item.name === 'Test Knob');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.envelope.metadata.changes, 'First.', 'what changed travels with it');
  assert.equal(current().name, 'Test Knob', 'the tab takes the name');
  assert.equal(current().modified, false, 'closing it no longer asks');
  assert.equal(current().control._children.Designer.packageVersion, '1.0.0', 'and it is that library version');
  assert.equal(exportComponent(current().control, { name: 'X', toLibrary: false, toFile: false }).ok, false, 'somewhere to save it is needed');
});

test('a component on a panel, exported, becomes a linked copy of what it saved', () => {
  const panel = createPanel('P');
  panels.set([panel]);
  activePanelId.set(panel.id);
  setActiveEditorTab({ type: 'panel', id: panel.id });
  const made = addControl('CustomComponent');
  const id = made._children.Core.id;
  const onPanel = () => get(panels)[0].controls.find((control) => control._children.Core.id === id);
  exportComponent(onPanel(), { name: 'Panel Dial', version: '2.0.0', toLibrary: true });
  assert.equal(onPanel()._children.Designer.packageName, 'Panel Dial');
  assert.equal(onPanel()._children.Designer.packageVersion, '2.0.0');
  assert.equal(onPanel()._children.Core.name, made._children.Core.name, 'a copy keeps its own name on the panel');
});

test('Import reads one component or a library\'s worth, and opens a single one', () => {
  const envelope = createCustomComponentExportEnvelope(knob(), { name: 'Imported Knob', version: '1.4.0' });
  assert.equal(componentPackagesFromText(JSON.stringify(envelope)).envelopes.length, 1);
  const bundle = libraryEnvelope([envelope, createCustomComponentExportEnvelope(knob(), { name: 'Second', version: '1.0.0' })]);
  assert.equal(componentPackagesFromText(JSON.stringify(bundle)).envelopes.length, 2);
  assert.match(componentPackagesFromText('{').error, /not JSON/);
  assert.match(componentPackagesFromText('{"a":1}').error, /no CEditor component/);
  assert.match(componentPackagesFromText('').error, /empty/);

  componentDocuments.set([]);
  const result = importComponentText(JSON.stringify(envelope), 'Imported Knob-1.4.0.ceditor-component.json');
  assert.equal(result.ok, true);
  assert.ok(get(customComponentLibrary).some((item) => item.name === 'Imported Knob' && item.version === '1.4.0'));
  assert.equal(current()?.name, 'Imported Knob', 'it opened, to be changed and exported');
  assert.equal(importComponentText('nonsense', 'x.json').ok, false);
  assert.equal(mayBeComponentFile({ name: 'Knob-1.0.0.ceditor-component.json' }), true);
  assert.equal(mayBeComponentFile({ name: 'photo.png', type: 'image/png' }), false);
});

test('Variants are hidden: no Publish page, no picker on a copy, no "Variant" setting on a new one', () => {
  const panel = createPanel('V');
  panels.set([panel]);
  activePanelId.set(panel.id);
  setActiveEditorTab({ type: 'panel', id: panel.id });
  const made = addControl('CustomComponent');
  const editable = get(panels)[0].controls.find((control) => control._children.Core.id === made._children.Core.id)
    ._children.PublishedProperties.editableProperties;
  assert.ok(!('variant' in editable), 'a new component offers no Variant setting');
  assert.ok('variant' in createControl('CustomComponent')._children.PublishedProperties.editableProperties,
    'the type\'s defaults keep it: a saved component is a difference from them');
  // The Publish page, which had a Variants page, is gone: the Settings tab replaced it.
  assert.ok(!existsSync(new URL('../src/CE_Application/sections/CustomPublishEditor.svelte', import.meta.url)));
  assert.doesNotMatch(src('CE_Application/sections/CustomInstancePropertiesEditor.svelte'), /setActiveVariant|<select/);
});

test('the way in and the way out are where an author looks', () => {
  const menu = src('CE_Application/layout/MenuBar.svelte');
  assert.match(menu, /label: 'Import Component\.\.\.', action: \(\) => importComponentFromFile\(\)/);
  assert.match(menu, /label: 'Open Component from Library\.\.\.', action: \(\) => openSavedCustomComponent\(\)/);
  assert.match(menu, /const canSave = \(\) => \['script', 'component', 'screen'\]\.includes\(get\(activeEditorTab\)\?\.type\) \|\| hasPanel\(\);/);
  assert.match(menu, /if \(get\(activeEditorTab\)\?\.type === 'component'\) openComponentExport\(\);/);
  const app = src('App.svelte');
  assert.match(app, /if \(get\(activeEditorTab\)\?\.type === 'component'\) \{ openComponentExport\(\); return; \}/, 'Ctrl+S exports one');
  assert.match(app, /ondragover=\{handleWindowDragOver\} ondrop=\{handleWindowDrop\}/);
  assert.match(app, /<ComponentExportDialog \/>/);
  assert.match(src('CE_Application/editor/EditorCanvas.svelte'), /data-testid="component-export-launch"[\s\S]{0,40}Export…/);
});
