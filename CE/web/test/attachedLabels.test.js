// attachedLabels.test.js — a knob's Labels move, copy and delete with it (utils/attachedLabels.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  addAttachedLabel, applyControlPatchesById, duplicateControl, duplicateControlsInPlace, removeControl,
  updateInspectorControlProperty, updateSelectedProperty,
} from '../src/CE_Application/stores/controls.js';
import { copySelection, pasteSelection } from '../src/CE_Application/stores/clipboard.js';
import { attachedFollowers, attachedLabelRect, followMoves, withAttached } from '../src/CE_Application/utils/attachedLabels.js';
import { nestAttached } from '../src/CE_Application/utils/componentTreeView.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';

function panelWithKnob() {
  const panel = createPanel('Labels');
  panel.controls = [createControl('Knob', { Core: { id: 'k1', name: 'Cutoff' }, Transform: { x: 100, y: 100, width: 80, height: 80 } })];
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  return panel;
}
const controls = () => flatControls(get(panels)[0].controls);
const byId = (id) => controls().find((c) => c._children.Core.id === id);
const at = (id) => { const t = byId(id)._children.Transform; return [t.x, t.y]; };

test('the Labels tab adds a Label beside the knob, attached to it, showing what it was asked to', () => {
  panelWithKnob();
  const name = addAttachedLabel('k1', 'name');
  const value = addAttachedLabel('k1', 'value');
  const min = addAttachedLabel('k1', 'min');
  const max = addAttachedLabel('k1', 'max');
  for (const label of [name, value, min, max]) {
    assert.equal(label._children.Core.attachedTo, 'k1');
    assert.equal(label._children.Background._children.Border.enabled, false, 'bare: no border');
  }
  assert.deepEqual([name, value, min, max].map((l) => l._children.Text.shows), ['name', 'value', 'min', 'max']);
  assert.equal(name._children.Core.name, 'Cutoff Name');
  assert.equal(value._children.Text._children.Font.size, 12, 'lettered as the knob lettered its value');
  const t = (l) => l._children.Transform;
  assert.ok(t(name).y + t(name).height <= 100, 'the name above the knob');
  assert.ok(t(value).y >= 180, 'the value below it');
  assert.ok(t(min).x < t(max).x, 'min at the start of the arc, max at its end');
  assert.deepEqual([...get(selectedComponentIds)], [], 'the selection is left alone');
  assert.equal(addAttachedLabel('k1', 'nonsense'), null);
});

test('moved however it is moved, its Labels go as far; one moved with it goes once', () => {
  panelWithKnob();
  const value = addAttachedLabel('k1', 'value')._children.Core.id;
  const [vx, vy] = at(value);
  applyControlPatchesById(new Map([['k1', { 'Transform.x': 150 }]]));
  assert.deepEqual(at(value), [vx + 50, vy], 'a drag or Align');
  updateInspectorControlProperty('k1', 'Transform.y', 130);
  assert.deepEqual(at(value), [vx + 50, vy + 30], 'the inspector');
  selectedComponentIds.set(new Set(['k1', value]));
  updateSelectedProperty('Transform.x', 160);
  assert.equal(at(value)[0], 160, 'set with it, it went where it was told');
  applyControlPatchesById(new Map([['k1', { 'Transform.x': 170 }], [value, { 'Transform.x': 170 }]]));
  assert.equal(at(value)[0], 170, 'dragged with it: once');
  // Moved on its own, it stays where it was put, and follows from there.
  applyControlPatchesById(new Map([[value, { 'Transform.x': 300 }]]));
  applyControlPatchesById(new Map([['k1', { 'Transform.x': 180 }]]));
  assert.equal(at(value)[0], 310);
});

test('copied with it and attached to the copy; deleted with it', () => {
  panelWithKnob();
  const value = addAttachedLabel('k1', 'value')._children.Core.id;
  duplicateControl(['k1']);
  assert.equal(controls().length, 4);
  const copy = controls().find((c) => c._children.Core.controlType === 'Knob' && c._children.Core.id !== 'k1');
  const copiedLabel = controls().find((c) => c._children.Core.controlType === 'Label' && c._children.Core.id !== value);
  assert.equal(copiedLabel._children.Core.attachedTo, copy._children.Core.id);
  assert.ok(get(selectedComponentIds).has(copiedLabel._children.Core.id));

  // Alt+drag leaves copies behind, attached to each other too.
  duplicateControlsInPlace(['k1']);
  assert.equal(controls().length, 6);

  // Copy and paste: the pasted Label is the pasted knob's.
  selectedComponentIds.set(new Set(['k1']));
  copySelection();
  pasteSelection();
  const pasted = [...get(selectedComponentIds)].map(byId);
  assert.equal(pasted.length, 2);
  const pastedKnob = pasted.find((c) => c._children.Core.controlType === 'Knob');
  assert.equal(pasted.find((c) => c._children.Core.controlType === 'Label')._children.Core.attachedTo, pastedKnob._children.Core.id);

  // A Label copied alone stays with its knob.
  selectedComponentIds.set(new Set([value]));
  copySelection();
  pasteSelection();
  assert.equal(byId([...get(selectedComponentIds)][0])._children.Core.attachedTo, 'k1');

  const before = controls().length;
  removeControl('k1');
  assert.equal(controls().length, before - 3, 'the knob, its Label, and the Label pasted on its own');
  assert.ok(!controls().some((c) => c._children.Core.attachedTo === 'k1'));
});

test('what a gesture takes along, and what a move leaves alone', () => {
  const knob = createControl('Knob', { Core: { id: 'k', name: 'K' }, Transform: { x: 0, y: 0 } });
  const label = createControl('Label', { Core: { id: 'l', attachedTo: 'k' }, Transform: { x: 0, y: 90 } });
  const free = createControl('Label', { Core: { id: 'f' } });
  const tree = [knob, label, free];
  assert.deepEqual([...attachedFollowers(tree, ['k'])], ['l']);
  assert.deepEqual([...attachedFollowers(tree, ['k', 'l'])], [], 'selected with it: not a follower');
  assert.deepEqual([...withAttached(tree, ['f'])], ['f']);
  const moved = [{ ...knob, _children: { ...knob._children, Transform: { ...knob._children.Transform, x: 10 } } }, label, free];
  assert.deepEqual([...followMoves(tree, moved)], [['l', { 'Transform.x': 10, 'Transform.y': 90 }]]);
  assert.equal(followMoves(tree, tree).size, 0);
  // A slider's min and max sit at the ends of its track, the value between them.
  const slider = createControl('Slider', { Transform: { x: 0, y: 0, width: 200, height: 40 } });
  const [min, max, value] = ['min', 'max', 'value'].map((s) => attachedLabelRect(slider, s, { size: 11, width: 30 }));
  assert.ok(min.x + min.width <= value.x && value.x + value.width <= max.x);
});

test('the tree lists a knob\'s Labels under it, and a chain of attachments loses no row', () => {
  const k = createControl('Knob', { Core: { id: 'k' } });
  const a = createControl('Label', { Core: { id: 'a', attachedTo: 'k' } });
  const b = createControl('Label', { Core: { id: 'b', attachedTo: 'a' } });
  const free = createControl('Label', { Core: { id: 'f' } });
  const rows = nestAttached([a, free, k, b]);
  assert.deepEqual(rows.map((r) => [r.ctrl._children.Core.id, r.attached]), [['f', false], ['k', false], ['a', true], ['b', false]]);
  const loop = nestAttached([
    createControl('Label', { Core: { id: 'x', attachedTo: 'y' } }),
    createControl('Label', { Core: { id: 'y', attachedTo: 'x' } }),
  ]);
  assert.equal(loop.length, 2);
});

test('the surfaces: the drag shows the Labels following, Alt+click takes them, the tree nests them', () => {
  const canvas = readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8');
  assert.match(canvas, /dragFollowers = attachedFollowers\(panelControls/);
  assert.match(canvas, /followers: dragFollowers \}\)/);
  assert.match(canvas, /if \(!moved && e\?\.altKey === true[\s\S]*?withAttached\(panelControls, \[owner\]\)/);
  const tree = readFileSync(new URL('../src/CE_Application/panels/ComponentTree.svelte', import.meta.url), 'utf8');
  assert.match(tree, /nestAttached\(\[\.\.\.sortControlsForRender\(list\)\]/);
  const shortcuts = readFileSync(new URL('../src/CE_Application/utils/editorShortcuts.js', import.meta.url), 'utf8');
  assert.match(shortcuts, /if \(moving\.has\(c\._children\.Core\.attachedTo\)\) continue;/);
});

test('a Label can show a button\'s own text, lettered as the button lettered it, and the button then prints none', async () => {
  const { shownText } = await import('../src/CE_Application/utils/labelShows.js');
  const { makeAttachedLabel } = await import('../src/CE_Application/utils/attachedLabelFactory.js');
  const { textShownOwners } = await import('../src/CE_Application/utils/attachedLabels.js');
  const key = createControl('Button', { Core: { id: 'b1', name: 'Trigger' }, Transform: { x: 10, y: 10, width: 120, height: 56 },
    Text: { content: 'TRIGGER', _children: { Font: { family: 'Space Mono', weightValue: 700, letterSpacing: 1.5 }, Fill: { colour: 'FFE0E0E0' } } } });
  assert.equal(shownText(key, 'text'), 'TRIGGER');
  const caption = makeAttachedLabel(key, 'text', { core: { id: 'c1' } });
  assert.equal(caption._children.Text.shows, 'text');
  assert.equal(caption._children.Core.attachedTo, 'b1');
  const font = caption._children.Text._children.Font;
  assert.deepEqual([font.family, font.weightValue, font.letterSpacing], ['Space Mono', 700, 1.5], 'its face, weight and spacing');
  assert.equal(caption._children.Text._children.Fill.colour, 'FFE0E0E0', 'and its colour');
  assert.ok(caption._children.Transform.y >= 66, 'under the key');
  assert.deepEqual([...textShownOwners([key, caption])], ['b1']);
  assert.equal(textShownOwners([key]).size, 0);
});

test('a key drawn from its parts, its caption a Label, comes in as the bare device and the Label as text', async () => {
  const { getControlSet } = await import('../src/CE_Application/models/controlSets.js');
  const { planComponentFromSelection } = await import('../src/CE_Application/utils/customComponentFromControls.js');
  const { makeAttachedLabel } = await import('../src/CE_Application/utils/attachedLabelFactory.js');
  const key = createControl('Button', { Core: { id: 'b1', name: 'Trigger' }, Transform: { x: 20, y: 20, width: 120, height: 56 }, Text: { content: 'TRIGGER' } });
  const caption = makeAttachedLabel(key, 'text', { core: { id: 'c1', name: 'Trigger Text' } });
  const plan = (controls) => planComponentFromSelection({ id: 'p', controlSet: { id: 'switchboard' }, controlSets: [], controls }, controls.map((c) => c._children.Core.id),
    { set: getControlSet('switchboard'), name: 'T', valueControlsAs: 'layers' });
  const alone = plan([key]);
  assert.ok(alone.ok, JSON.stringify(alone.refused));
  assert.ok(Object.keys(alone.component._children.Parts._children).some((name) => /caption/.test(name)), 'on its own it prints its caption');
  const together = plan([key, caption]);
  assert.ok(together.ok, JSON.stringify(together.refused));
  const parts = together.component._children.Parts._children;
  assert.ok(!Object.keys(parts).some((name) => /caption/.test(name)), 'with the Label, the device prints none');
  assert.ok(Object.values(parts).some((part) => part._children?.Text?.content === 'TRIGGER'), 'the Label brings the words');
});

test('the Meter and Button tabs carry the Labels section, and each offers what that control can have shown', () => {
  const editor = readFileSync(new URL('../src/CE_Application/sections/AttachedLabelsEditor.svelte', import.meta.url), 'utf8');
  assert.match(editor, /isMeter \? \['name', 'value', 'min', 'max', 'unit', 'caption'\]/);
  assert.match(editor, /: \['text', 'name'\]\);/);
  for (const tab of ['MeterEditor', 'ButtonPartsEditor']) {
    const source = readFileSync(new URL(`../src/CE_Application/sections/${tab}.svelte`, import.meta.url), 'utf8');
    assert.match(source, /<AttachedLabelsEditor \{control\} \/>/, tab);
  }
  const canvas = readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8');
  assert.match(canvas, /if \(captionShownByLabel\) return '';/);
  assert.match(canvas, /captionShown=\{captionShownByLabel\}/);
  const anatomy = readFileSync(new URL('../src/CE_Application/editor/ControlAnatomy.svelte', import.meta.url), 'utf8');
  assert.match(anatomy, /let bareDevice = \$derived\(partsDrawn && captionShown\);/);
  const meter = readFileSync(new URL('../src/CE_Application/editor/MeterRenderer.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(meter, /meter-readout|meter-label/);
});
