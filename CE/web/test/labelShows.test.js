import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlFamily } from '../src/CE_Application/models/controlSetFamilies.js';
import { authoredShownText, labelShows, labelSourceId, shownText, withShownLettering } from '../src/CE_Application/utils/labelShows.js';
import { isScenery } from '../src/CE_Application/utils/sceneryModel.js';

const knob = () => createControl('Knob', {
  Core: { id: 'k1', name: 'Cutoff' },
  Behavior: { min: 20, max: 20000, defaultValue: 1200, defaultCurrentValue: 1200, unit: 'Hz' },
});
const label = (text, core = {}) => createControl('Label', { Core: { id: 'l1', name: 'Cutoff Value', ...core }, Text: text });

test('a Label shows a control\'s name, value, min, max and unit, printed as the control prints them', () => {
  const k = knob();
  assert.equal(shownText(k, 'name'), 'Cutoff');
  assert.equal(shownText(k, 'unit'), 'Hz');
  assert.match(shownText(k, 'value'), /1200|1\.2/, 'the value, as its readout prints it');
  assert.match(shownText(k, 'min'), /20/);
  assert.match(shownText(k, 'max'), /20000|20k|20\.0/);
  // A live session moves it.
  const moved = shownText(k, 'value', { valueOverrideEnabled: true, valueOverride: 5000 });
  assert.notEqual(moved, shownText(k, 'value'));
  // A meter prints as its readout does.
  const meter = createControl('Meter', { Core: { id: 'm1', name: 'Level' }, Meter: { value: 0.5, valuePrecision: 1, valuePrefix: '', valueSuffix: ' dB' } });
  assert.equal(shownText(meter, 'value'), '0.5 dB');
  assert.equal(shownText(meter, 'unit'), 'dB');
});

test('a Label finds what it shows: the control it names, else the one it is attached to', () => {
  const attached = label({ shows: 'value' }, { attachedTo: 'k1' });
  assert.equal(labelShows(attached), 'value');
  assert.equal(labelSourceId(attached), 'k1');
  const named = label({ shows: 'name', showsControl: 'k2' }, { attachedTo: 'k1' });
  assert.equal(labelSourceId(named), 'k2');
  assert.equal(labelShows(label({ shows: 'nonsense' })), '');
  // On the editor's canvas, from the control as it is authored, found among the panel's controls,
  // nested ones too.
  const group = createControl('Group', { Core: { id: 'g1' } });
  group._children.Children = { _children: { k1: knob() } };
  assert.equal(authoredShownText(label({ shows: 'name' }, { attachedTo: 'k1' }), [group]), 'Cutoff');
  assert.equal(authoredShownText(label({ shows: '' }), [group]), null, 'its own words: nothing to work out');
  assert.equal(authoredShownText(label({ shows: 'value' }, { attachedTo: 'gone' }), [group]), null, 'its control is not on the panel: its own words');
  // Nothing a Label does not use is written on every control: a linked library copy still matches its package.
  assert.equal('attachedTo' in knob()._children.Core, false);
  assert.equal('shows' in label({ content: 'FILTER' })._children.Text, false);
});

test('a shown Label takes the set\'s lettering for the knob\'s part, unless it is the author\'s', () => {
  const graphite = getControlSet('graphite-studio');
  const made = label({ shows: 'value' }, { attachedTo: 'k1' });
  made._children.Text = withShownLettering(made._children.Text, 'value');
  const drawn = resolveControlFamily(made, graphite);
  const font = drawn._children.Text._children.Font;
  // The set's type block letters a knob's value; the shown Label takes the same family.
  const knobDrawn = resolveControlFamily(knob(), graphite)._children.Parts._children.labelValue._children.Text._children.Font;
  assert.equal(font.family, knobDrawn.family);
  // The author's own size stays.
  const own = structuredClone(made);
  own._children.Text._children.Font.family = 'Courier New';
  assert.equal(resolveControlFamily(own, graphite)._children.Text._children.Font.family, 'Courier New');
});

test('a Label that shows a value is never folded into the still scenery', () => {
  assert.equal(isScenery(label({ content: 'FILTER' })), true);
  assert.equal(isScenery(label({ shows: 'value' }, { attachedTo: 'k1' })), false);
});

test('the Label\'s Text tab offers Shows and Attached to, and the surfaces work out its words', () => {
  const editor = readFileSync(new URL('../src/CE_Application/sections/TextEditor.svelte', import.meta.url), 'utf8');
  assert.match(editor, /label="Shows"[\s\S]*?setShows\(event\.currentTarget\.value\)/);
  assert.match(editor, /label="Attached to"[\s\S]*?onclick=\{detach\}/);
  const canvas = readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8');
  assert.match(canvas, /authoredShownText\(renderControl, panelControls\)/);
  const surface = readFileSync(new URL('../src/CE_Application/editor/PanelPreviewSurface.svelte', import.meta.url), 'utf8');
  assert.match(surface, /return applyLabelShowsSource\(control, applySetlistValueSource/);
});
