// panelFileText.test.js — one item of a panel's file as text, and an edited text applied back.
//
// The panel file view (editor/PanelFileView.svelte) puts a control, or the panel's own settings, in
// front of a person as JSON and applies what they type. What has to hold: an item applied unchanged
// changes nothing (every control of every committed panel); an edit lands and a deleted line goes
// back to its default; the type, the id and the panel's guid stay; what the text holds back (child
// controls, scripts, embedded images, notes) survives any edit; a taken name is made unique; and a
// property nobody uses is kept but warned about, while one the panel already uses is not.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import {
  PANEL_SETTINGS_ITEM, applyControlFileText, applyPanelSettingsFileText, controlFileText, controlFullText,
  panelFileOutline, panelSettingsFileText, panelSettingsFullText,
} from '../src/CE_Application/stores/panelFileText.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);
const kids = (control) => Object.values(control?._children?.Children?._children ?? {}).filter((child) => child?._children?.Core);
function* everyControl(controls) {
  for (const control of controls ?? []) { yield control; yield* everyControl(kids(control)); }
}
const edit = (text, fn) => { const doc = JSON.parse(text); fn(doc); return JSON.stringify(doc, null, 2); };

const PANELS = ['CE/panels/Roland GAIA SH-01.cepanel', 'CE/panels/Yamaha AN1x.cepanel',
  ...['01-components', '03-states', '06-roland-gaia', '07-packages', '08-export', '09-custom-stress'].map((n) => `CE/qa/QA-${n}.cepanel`)];

test('every item of every committed panel, applied as it is shown, changes nothing', () => {
  for (const rel of PANELS) {
    const panel = open(rel);
    let count = 0;
    for (const control of everyControl(panel.controls)) {
      const result = applyControlFileText(controlFileText(control).text, control, { panelControls: panel.controls });
      assert.deepEqual({ ok: result.ok, changed: result.changed, warnings: result.warnings }, { ok: true, changed: false, warnings: [] },
        `${rel}: ${control._children.Core.id}`);
      assert.equal(result.control, control, 'nothing changed: the very same object');
      count++;
    }
    assert.ok(count > 10, `${rel}: only ${count} controls`);
    const settings = applyPanelSettingsFileText(panelSettingsFileText(panel).text, panel);
    assert.deepEqual({ ok: settings.ok, changed: settings.changed, errors: settings.errors }, { ok: true, changed: false, errors: [] }, `${rel}: panel settings`);
    // And saved after, the same file: nothing above wrote to the panel.
    assert.equal(serializePanel(panel), serializePanel(open(rel)));
  }
});

test('a control is shown as only what differs from its type, laid out to read', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const control = [...everyControl(panel.controls)].find((c) => c._children.Core.controlType === 'Slider');
  const { text } = controlFileText(control);
  const doc = JSON.parse(text);
  assert.equal(doc._type, 'Control');
  assert.equal(text.split('\n')[1].trim(), '"_type": "Control",', 'identity first');
  assert.deepEqual([doc._children.Core.id, doc._children.Core.controlType], [control._children.Core.id, 'Slider'], 'identity is always written');
  assert.ok(text.split('\n').length < JSON.stringify(control, null, 2).split('\n').length / 5, 'a fraction of the whole control');
  assert.ok(controlFullText(control).split('\n').length > text.split('\n').length, 'the reference has every field');
});

test('an edit lands, a deleted line goes back to its default, and the rest is the same objects', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const control = [...everyControl(panel.controls)].find((c) => c._children.Core.controlType === 'Slider');
  const { text } = controlFileText(control);

  const moved = applyControlFileText(edit(text, (d) => { d._children.Transform.x = 333; }), control, { panelControls: panel.controls });
  assert.equal(moved.ok && moved.changed, true);
  assert.equal(moved.control._children.Transform.x, 333);
  for (const [key, section] of Object.entries(control._children)) {
    if (key !== 'Transform') assert.equal(moved.control._children[key], section, `${key} is the same object`);
  }

  const reset = applyControlFileText(edit(text, (d) => { delete d._children.Transform; }), control, { panelControls: panel.controls });
  const pristine = applyControlFileText(edit(text, (d) => { d._children = { Core: d._children.Core }; }), control, { panelControls: panel.controls });
  assert.equal(reset.ok, true);
  assert.deepEqual(reset.control._children.Transform, pristine.control._children.Transform, 'deleting a section is its type\'s default');
  assert.notDeepEqual(reset.control._children.Transform, control._children.Transform);
});

test('the type, the id and the text itself are checked before anything is applied', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const control = [...everyControl(panel.controls)].find((c) => c._children.Core.controlType === 'Slider');
  const { text } = controlFileText(control);
  const apply = (t) => applyControlFileText(t, control, { panelControls: panel.controls });

  const typed = apply(edit(text, (d) => { d._children.Core.controlType = 'Knob'; }));
  assert.equal(typed.ok, false);
  assert.match(typed.errors[0].message, /conversion, not an edit/);
  const untyped = apply(edit(text, (d) => { delete d._children.Core.controlType; }));
  assert.match(untyped.errors[0].message, /is missing/);
  const renamedId = apply(edit(text, (d) => { d._children.Core.id = 'another'; }));
  assert.match(renamedId.errors[0].message, /stays "/);

  const broken = apply(text.replace('"_children": {', '"_children": {,'));
  assert.equal(broken.ok, false);
  assert.ok(broken.errors[0].line > 1, 'a JSON mistake says where');
  assert.equal(apply('[1, 2]').errors[0].message, 'A control is an object with its sections under "_children".');
  const schema = apply(edit(text, (d) => { d._children.Transform = 'left'; }));
  assert.equal(schema.ok, false, `the document check: ${JSON.stringify(schema)}`);
  assert.match(schema.errors[0].message, /^Transform: /);
});

test('a name another control has is made unique, as a rename is; a blank one is the type\'s', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const [first, second] = [...everyControl(panel.controls)].filter((c) => c._children.Core.controlType === 'Slider');
  const apply = (fn) => applyControlFileText(edit(controlFileText(second).text, fn), second, { panelControls: panel.controls });
  const taken = apply((d) => { d._children.Core.name = first._children.Core.name; });
  assert.equal(taken.control._children.Core.name, `${first._children.Core.name}_2`);
  assert.match(taken.warnings[0], /is the name of another control/);
  const dotted = apply((d) => { d._children.Core.name = 'osc.pitch'; });
  assert.equal(dotted.control._children.Core.name, 'osc_pitch');
  const blank = apply((d) => { delete d._children.Core.name; });
  assert.match(blank.control._children.Core.name, /^Slider/);
  assert.match(blank.warnings[0], /needs a name/);
});

test('a property nobody uses is kept and warned about; one the panel already uses is not', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const all = [...everyControl(panel.controls)];
  const control = all.find((c) => c._children.Core.controlType === 'Slider');
  const apply = (fn) => applyControlFileText(edit(controlFileText(control).text, fn), control, { panelControls: panel.controls });

  const typo = apply((d) => { d._children.Transform.widht = 40; });
  assert.equal(typo.ok, true);
  assert.equal(typo.control._children.Transform.widht, 40, 'kept as written');
  assert.equal(typo.warnings.length, 1);
  assert.match(typo.warnings[0], /"Transform\.widht" is not a property a Slider has by default/);

  const section = apply((d) => { d._children.Transfrom = { x: 1 }; });
  assert.match(section.warnings.join(' '), /"Transfrom"/, 'a misspelt section too');

  // QA-08's choice controls give their rows an `isHeader`, which no default has. A list of choices
  // added to this slider (a section it does not have, so written whole with its `_type`) with that
  // key in a row: a property the panel already knows, not a misspelling.
  assert.ok(all.some((c) => (c._children.Value?.rows ?? []).some((row) => 'isHeader' in row)), 'the fixture still uses isHeader');
  assert.equal('Value' in control._children, false, 'the fixture slider has no list of its own');
  const known = apply((d) => { d._children.Value = { _type: 'Value', rows: [{ id: 'a', displayText: 'A', isHeader: true }] }; });
  assert.deepEqual(known.warnings, [], 'a key another control has is not a misspelling');
  const unknownSection = apply((d) => { d._children.Value = { rows: [] }; });
  assert.match(unknownSection.warnings.join(' '), /"Value" is not a property a Slider has/, 'a section it lacks, without its _type, is');
});

test('what the text holds back survives any edit: a container\'s controls, scripts', () => {
  const gaia = open('CE/panels/Roland GAIA SH-01.cepanel');
  const container = gaia.controls.find((c) => kids(c).length > 3);
  const { text, heldBack } = controlFileText(container);
  assert.equal(heldBack.children, kids(container).length);
  assert.equal(JSON.parse(text)._children.Children?._children, undefined, 'the children are not in the text');
  assert.ok(text.split('\n').length < 200, `a container is its own properties: ${text.split('\n').length} lines`);

  const moved = applyControlFileText(edit(text, (d) => { d._children.Transform = { ...d._children.Transform, x: 5 }; }), container, { panelControls: gaia.controls });
  assert.equal(moved.control._children.Children._children, container._children.Children._children, 'the same children, the same objects');
  const smuggled = applyControlFileText(edit(text, (d) => { d._children.Children = { _children: {} }; }), container, { panelControls: gaia.controls });
  assert.equal(smuggled.control._children.Children._children, container._children.Children._children);
  assert.match(smuggled.warnings[0], /items of their own/);
  const emptied = applyControlFileText(edit(text, (d) => { d._children = { Core: d._children.Core }; }), container, { panelControls: gaia.controls });
  assert.equal(emptied.control._children.Children._children, container._children.Children._children, 'even with every section deleted');

  const scripted = [...everyControl(gaia.controls)].find((c) => (c._children.Scripts?.scripts ?? []).length);
  if (scripted) {
    const st = controlFileText(scripted);
    assert.equal(st.heldBack.scripts, scripted._children.Scripts.scripts.length);
    const r = applyControlFileText(edit(st.text, (d) => { d._children.Scripts = { scripts: [] }; }), scripted, { panelControls: gaia.controls });
    assert.equal(r.control._children.Scripts.scripts, scripted._children.Scripts.scripts);
    assert.match(r.warnings[0], /script screens/);
  }
});

test('an embedded image is a placeholder, and comes back as it was', () => {
  const panel = open('CE/qa/QA-08-export.cepanel');
  const image = `data:image/png;base64,${'A'.repeat(4000)}`;
  panel.bgImage = image;
  const { text, heldBack } = panelSettingsFileText(panel);
  assert.equal(heldBack.data, 1);
  assert.ok(!text.includes('AAAA'), 'the data is not in the text');
  assert.match(text, /‹image\/png, 4 KB — kept as it is #1›/);
  const same = applyPanelSettingsFileText(text, panel);
  assert.equal(same.changed, false);
  const wider = applyPanelSettingsFileText(edit(text, (d) => { d.width = 1234; }), panel);
  assert.deepEqual(wider.updates, { width: 1234 }, 'the image is not an update');
  const altered = applyPanelSettingsFileText(text.replace('4 KB', '5 KB'), panel);
  assert.match(altered.warnings.join(' '), /placeholder/);
  assert.notEqual(altered.updates.bgImage, image);
});

test('the panel settings: only what differs from a new panel, its identity kept, its own editors\' fields held back', () => {
  const panel = open('CE/panels/Roland GAIA SH-01.cepanel');
  const { text, heldBack } = panelSettingsFileText(panel);
  const doc = JSON.parse(text);
  assert.equal(doc.panelGuid, panel.panelGuid);
  assert.equal(doc.width, panel.width);
  for (const key of ['scripts', 'exportParameters', 'name', 'filePath', 'notepad', 'formatVersion', 'controls']) {
    assert.equal(key in doc, false, `${key} is held back`);
  }
  assert.equal(heldBack.scripts, panel.scripts.length);
  assert.ok(text.split('\n').length < 60, `a few dozen lines: ${text.split('\n').length}`);
  assert.ok(panelSettingsFullText(panel).split('\n').length > 80, 'the reference has every setting');

  const apply = (fn) => applyPanelSettingsFileText(edit(text, fn), panel);
  assert.deepEqual(apply((d) => { d.height = 1001; }).updates, { height: 1001 });
  const reset = apply((d) => { delete d.width; });
  assert.equal(reset.updates.width, 600, 'a deleted line is a new panel\'s value');
  assert.match(apply((d) => { d.panelGuid = 'x'; }).errors[0].message, /identity/);
  assert.match(apply((d) => { delete d.panelGuid; }).errors[0].message, /identity/);
  const named = apply((d) => { d.name = 'Other'; });
  assert.equal('name' in named.updates, false);
  assert.match(named.warnings[0], /rename the file/);
  assert.match(apply((d) => { d.widht = 3; }).warnings[0], /"widht" is not a panel setting/);
  assert.equal(apply((d) => { d.layers = 'none'; }).ok, false, 'the document check');
});

test('the outline: the panel settings, then the controls in document order, children under their container', () => {
  const gaia = open('CE/panels/Roland GAIA SH-01.cepanel');
  const rows = panelFileOutline(gaia);
  assert.equal(rows[0].key, PANEL_SETTINGS_ITEM);
  assert.equal(rows.length, 1 + [...everyControl(gaia.controls)].length);
  const container = rows.find((row) => row.childCount > 0);
  const firstChild = rows[rows.indexOf(container) + 1];
  assert.equal(firstChild.parentId, container.id);
  assert.equal(firstChild.depth, container.depth + 1);
});
