// Button and switch forms become the control's own parts (docs/design/changeable-control-sets.md,
// piece B; the owner: "the whole idea of the editor is that components are adjustable in any way").

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { readControlPath, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { EDITOR_PATHS } from '../src/CE_Application/models/controlSetDesigns.js';
import { CONTROL_FORMS, FORM_SETS, setAnatomy } from '../src/CE_Application/models/controlAnatomy.js';
import { BUTTON_DEVICE_PARTS, BUTTON_DEVICE_TYPES, buttonDeviceDrawn } from '../src/CE_Application/models/buttonDeviceParts.js';
import { BUTTON_FORMS_AS_PARTS, TOGGLE_FORMS_AS_PARTS, buttonFormFamily } from '../src/CE_Application/models/buttonFormParts.js';
import { DEVICE_SHAPES, deviceShapePath, devicePatternCells } from '../src/CE_Application/utils/deviceShapes.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { applyFormAsParts } from '../src/CE_Application/stores/controlSets.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const subpaths = (d) => (d.match(/M/g) ?? []).length;

test('device shapes: every kind draws in its box, and patterns repeat it', () => {
  for (const kind of DEVICE_SHAPES) assert.ok(deviceShapePath(kind, 10, 10, 60, 40, { depth: 20, radius: 4 }), kind);
  assert.equal(deviceShapePath('rect', 0, 0, 0, 10), '', 'an empty box draws nothing');
  assert.equal(subpaths(deviceShapePath('pair', 0, 0, 100, 40, { depth: 10 })), 2, 'a pair is two halves');
  assert.equal(subpaths(deviceShapePath('ring', 0, 0, 40, 40, { depth: 30 })), 2, 'a ring has a hole');
  assert.equal(subpaths(deviceShapePath('crosshair', 0, 0, 160, 80, { depth: 40 })), 4, 'four hairlines');
  assert.equal(deviceShapePath('diamond', 0, 0, 100, 50), 'M50 0 L100 25 L50 50 L0 25 Z');
  assert.equal(devicePatternCells('solid', 0, 0, 10, 10).length, 1);
  assert.equal(devicePatternCells('lines', 0, 0, 10, 28, { count: 4 }).length, 4);
  assert.equal(devicePatternCells('grid', 0, 0, 73, 43, { count: 5, rows: 3 }).length, 15);
});

test('every button and switch has the six parts, hidden, so it draws as it always did', () => {
  for (const type of BUTTON_DEVICE_TYPES) {
    const control = createControl(type);
    const parts = control._children.Parts._children;
    assert.deepEqual(Object.keys(parts), BUTTON_DEVICE_PARTS, type);
    for (const name of BUTTON_DEVICE_PARTS) assert.equal(parts[name].visible, false, `${type}.${name}`);
    assert.equal(buttonDeviceDrawn(control), false, type);
  }
  // "Original parts" is the button's own box, even where its set turns its parts on.
  const tolexKey = resolveControlForSet(createControl('Button'), getControlSet('tolex'));
  assert.equal(buttonDeviceDrawn(tolexKey), true);
  tolexKey._children.Core.controlForm = 'original';
  assert.equal(buttonDeviceDrawn(tolexKey), false);
  assert.equal(createControl('Knob')._children.Parts._children.key, undefined, 'a knob has its own parts');
  // Two buttons do not share one parts object.
  const [a, b] = [createControl('Button'), createControl('Button')];
  a._children.Parts._children.key.visible = true;
  assert.equal(b._children.Parts._children.key.visible, false);
});

test('every recipe writes only what a set may write, and lands on a factory control', () => {
  assert.deepEqual(BUTTON_FORMS_AS_PARTS, CONTROL_FORMS.Button.slice(0, 12).map(([id]) => id));
  assert.deepEqual(TOGGLE_FORMS_AS_PARTS, CONTROL_FORMS.ToggleButton.slice(0, 12).map(([id]) => id));
  for (const [type, forms] of [['Button', BUTTON_FORMS_AS_PARTS], ['ToggleButton', TOGGLE_FORMS_AS_PARTS]]) {
    for (const form of forms) {
      const family = buttonFormFamily(type, form);
      assert.ok(family.parts.key?.visible, `${form}: its key is on`);
      for (const path of Object.keys(family.component)) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${path}`);
      for (const [name, patch] of Object.entries(family.parts)) {
        assert.ok(BUTTON_DEVICE_PARTS.includes(name), `${form}: ${name} is a part`);
        for (const path of Object.keys(patch)) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${name}.${path}`);
      }
      const drawn = resolveControlForSet(createControl(type), { ...getControlSet('graphite'), id: `test-${form}`, families: { [type]: family } });
      assert.equal(buttonDeviceDrawn(drawn), true, `${form}: drawn with its parts`);
      for (const [name, patch] of Object.entries(family.parts)) {
        for (const path of Object.keys(patch)) assert.notEqual(readControlPath(drawn, `Parts.${name}.${path}`), undefined, `${form}: ${name}.${path} lands`);
      }
    }
  }
  assert.equal(buttonFormFamily('Button', 'new-studio'), null, 'a direction form is still drawn by code');
  assert.equal(buttonFormFamily('Meter', 'bar'), null, 'a meter is not a button (models/meterFormParts.js)');
  assert.ok(buttonFormFamily('MomentaryButton', 'tile'), 'every button type takes the button forms');
});

test('the sets that drew these forms draw them with parts, and name no form', () => {
  let drawn = 0;
  for (const id of FORM_SETS.slice(0, 12)) {
    const set = getControlSet(id);
    if (!set) continue;
    for (const type of ['Button', 'ToggleButton']) {
      const control = resolveControlForSet(createControl(type), set);
      if (!setAnatomy(type, id) || !buttonDeviceDrawn(control)) continue;
      assert.equal(control._children.Core.controlForm || '', '', `${id} ${type}: no form`);
      drawn += 1;
    }
  }
  assert.ok(drawn >= 18, `${drawn} sets' buttons and switches are drawn with parts`);
  // Tolex: a typewriter key and a bakelite lever, in its colours.
  const key = resolveControlForSet(createControl('Button'), getControlSet('tolex'))._children.Parts._children.key;
  assert.equal(key.shape, 'ellipse');
  assert.match(key.activeColour, /^[0-9A-F]{8}$/i, 'the accent resolves');
  const lever = resolveControlForSet(createControl('ToggleButton'), getControlSet('tolex'))._children.Parts._children;
  assert.equal(lever.key.swing, 76.2);
  assert.equal(lever.indicator.follows, 'key', 'the ball rides the lever');
});

test('choosing a converted form, or Convert to Parts, writes the parts in one step and turns off the rest', () => {
  panels.set([{ id: 'forms', name: 'Forms', width: 400, height: 300, controlSet: { id: 'tolex' }, controlSets: [],
    controls: [createControl('ToggleButton', { Core: { id: 't1', controlForm: 'lever' } })] }]);
  activePanelId.set('forms');
  try {
    assert.equal(applyFormAsParts(['t1'], 'guard'), 1);
    let switchControl = get(panels)[0].controls[0];
    assert.equal(switchControl._children.Core.controlForm, '');
    assert.equal(switchControl._children.Parts._children.guard.visible, true);
    // Then a form that has no guard: it goes.
    assert.equal(applyFormAsParts(['t1'], 'slide'), 1);
    switchControl = get(panels)[0].controls[0];
    assert.equal(switchControl._children.Parts._children.guard.visible, false);
    assert.equal(switchControl._children.Parts._children.legend.visible, true);
    // Pinned: Tolex's own family does not draw its lever over it.
    const drawn = resolveControlForSet(switchControl, getControlSet('tolex'));
    assert.equal(drawn._children.Parts._children.key.swing, 0);
  } finally {
    panels.set([]);
    activePanelId.set(null);
  }
  assert.match(source('sections/CoreEditor.svelte'), /formAsPartsRecipe\(core\?\.controlType, form\)/);
});

test('the form frame draws the parts, caption and all, and the canvas treats them as a form', () => {
  const anatomy = source('editor/ControlAnatomy.svelte');
  assert.match(anatomy, /\{#if partsDrawn\}\s*<ButtonDeviceParts /);
  assert.match(anatomy, /data-form=\{partsDrawn \|\| meterPartsDrawn \? 'parts' : form\}/);
  const canvas = source('editor/CanvasControl.svelte');
  assert.match(canvas, /anatomyForm\(core\?\.controlType, core\?\.controlForm\) \|\| buttonDeviceDrawn\(renderControl\)/);
  assert.match(canvas, /BUTTON_DEVICE_TYPES\.has\(String\(core\?\.controlType \?\? ''\)\)\s*\? renderPartEntries\.filter\(\(\[partName\]\) => !isButtonDevicePart\(partName\)\)/);
  const parts = source('editor/ButtonDeviceParts.svelte');
  assert.match(parts, /String\(part\?\.follows \?\? ''\) !== 'key'/);
  assert.match(parts, /active && String\(part\.activeColour/);
});

test('the Button tab, Switch on a toggle, edits every part; each field names its property', () => {
  const panel = source('panels/PropertiesPanel.svelte');
  assert.match(panel, /\{ id: 'button',\s+icon: RectangleHorizontal, label: 'Button', section: 'Parts', when: \(control\) => BUTTON_DEVICE_TYPES\.has/);
  assert.match(panel, /tab\.id === 'button' && getSection\(\$selectedControl, 'Core'\)\?\.controlType === 'ToggleButton' \? \{ \.\.\.tab, label: 'Switch', icon: ToggleRight \}/);
  assert.match(source('panels/sectionEditorLoaders.js'), /button: \(\) => import\('\.\.\/sections\/ButtonPartsEditor\.svelte'\)/);
  const editor = source('sections/ButtonPartsEditor.svelte');
  // One chip per part, the key called Actuator on a switch and Key on a button.
  assert.match(editor, /\{#each BUTTON_DEVICE_PARTS as name \(name\)\}/);
  assert.match(editor, /name === 'key' \? \(isSwitch \? 'Actuator' : 'Key'\)/);
  // Every key a part has is a field, and every field names its path, so it carries the marks.
  const keys = ['visible', 'shape', 'shapeDepth', 'Background.Corners.radius', 'pattern', 'patternCount', 'patternRows',
    'Layout.x', 'Layout.y', 'Layout.width', 'Layout.height', 'Layout.rotation', 'pivotX', 'pivotY', 'zIndex',
    'Background.Fill.colour', 'opacity', 'Background.Effects.Material.kind', 'Background.Border.thickness',
    'Background.Fill.gradientEnabled', 'Background.Border.colour', 'travelX', 'travelY', 'swing', 'activeOpacity',
    'activeColour', 'follows', 'offText', 'onText', 'fontSize'];
  for (const key of keys) assert.ok(editor.includes(`path={\`\${prefix}.${key}\`}`), key);
  const cells = editor.match(/<PropertyCell /g).length;
  assert.equal((editor.match(/<PropertyCell [^>]*path=/g) ?? []).length, cells, 'every cell names its path');
  // Colours go through the Colors dock, never a picker of their own.
  assert.doesNotMatch(editor, /type="color"/);
  assert.equal((editor.match(/onswatchclick=/g) ?? []).length, 3);
  // Device parts write only keys a set may write too.
  for (const key of ['shape', 'shapeDepth', 'pattern', 'travelX', 'swing', 'activeColour', 'follows', 'Layout.rotation', 'Background.Fill.gradient']) {
    assert.ok(EDITOR_PATHS.some((pattern) => pattern.test(key)), key);
  }
});
