// historyLabels.test.js — undo steps people can read.
//
// History stores the state before each step, not the step, so a step's name is worked out by
// comparing two neighbouring states. These pin the names, and the timeline the Edit menu, the
// toolbar tooltips and the History window read, through the real store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { describeHistoryStep } from '../src/CE_Application/utils/historyLabels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { applyControlPatchesById, removeControl, updateControlProperty } from '../src/CE_Application/stores/controls.js';
import {
  beginHistoryTransaction, commitHistoryTransaction, historyTimeline, initHistory, jumpToHistory,
  pushSnapshot, redo, redoLabel, scheduleSnapshot, undo, undoLabel,
} from '../src/CE_Application/stores/history.js';

initHistory();

const knob = (id, name = id, extra = {}) => createControl('Knob', { Core: { id, name }, Transform: { x: 10, y: 10, width: 40, height: 40 }, ...extra });
const panelState = (controls, extra = {}) => ({ name: 'p', width: 600, height: 400, controls, ...extra });
const withSection = (control, section, patch) => ({
  ...control, _children: { ...control._children, [section]: { ...control._children[section], ...patch } },
});

// --- Names ----------------------------------------------------------------------------------------

test('one control: move, resize, rotate, rename, edit a section', () => {
  const a = knob('k1', 'Cutoff');
  const before = panelState([a]);
  const step = (next) => describeHistoryStep(before, panelState([next]));
  assert.equal(step(withSection(a, 'Transform', { x: 30 })), 'Move Cutoff');
  assert.equal(step(withSection(a, 'Transform', { x: 5, width: 60 })), 'Resize Cutoff', 'a left-edge resize moves x too');
  assert.equal(step(withSection(a, 'Transform', { rotation: 45 })), 'Rotate Cutoff');
  assert.equal(step(withSection(a, 'Core', { name: 'Resonance' })), 'Rename Cutoff to Resonance');
  assert.equal(step(withSection(a, 'Background', { visible: false })), 'Edit background of Cutoff');
  assert.equal(step(withSection(withSection(a, 'Background', { visible: false }), 'Transform', { x: 1 })), 'Edit Cutoff');
});

test('adding, deleting, and several controls at once', () => {
  const a = knob('k1', 'Cutoff');
  const b = knob('k2', 'Drive');
  const c = knob('k3', 'Mix');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a, b])), 'Add Drive');
  assert.equal(describeHistoryStep(panelState([a, b, c]), panelState([a])), 'Delete 2 controls');
  const moved = [a, b, c].map((control) => withSection(control, 'Transform', { x: 99 }));
  assert.equal(describeHistoryStep(panelState([a, b, c]), panelState(moved)), 'Move 3 controls');
  const coloured = [a, b].map((control) => withSection(control, 'Background', { visible: false }));
  assert.equal(describeHistoryStep(panelState([a, b]), panelState(coloured)), 'Edit background of 2 controls');
  assert.equal(describeHistoryStep(panelState([a, b]), panelState([withSection(a, 'Transform', { x: 1 }), withSection(b, 'Core', { name: 'x' })])), 'Edit 2 controls');
  assert.equal(describeHistoryStep(panelState([a, b]), panelState([b, a])), 'Reorder controls');
});

test('a control moved inside a container is named, not its container', () => {
  const child = knob('inner', 'Env Amount');
  const box = createControl('Container', { Core: { id: 'box', name: 'Filter' } });
  box._children.Children = { _type: 'Children', layout: 'none', _children: { inner: child } };
  const movedChild = withSection(child, 'Transform', { y: 80 });
  const rebuilt = { ...box, _children: { ...box._children, Children: { ...box._children.Children, _children: { inner: movedChild } } } };
  assert.equal(describeHistoryStep(panelState([box]), panelState([rebuilt])), 'Move Env Amount');
});

test('panel settings, and both halves together', () => {
  const a = knob('k1', 'Cutoff');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a], { width: 800 })), 'Resize panel');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a], { notepad: { notes: ['x'] } })), 'Edit notes');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a], { exportSettings: { vendor: 'x' } })), 'Change panel settings');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a, knob('k2', 'Drive')], { width: 700 })), 'Add Drive · Resize panel');
  assert.equal(describeHistoryStep(panelState([a]), panelState([a])), 'Change', 'nothing to name');
});

test('a custom component being designed is described by its parts', () => {
  const part = (x) => ({ _type: 'Part', _children: { Layout: { x, y: 0, width: 10, height: 10 } } });
  const component = (parts, extra = {}) => ({ control: { _children: { Core: { id: 'cc' }, Parts: { _type: 'Parts', _children: parts }, ...extra } } });
  assert.equal(describeHistoryStep(component({ a: part(0) }), component({ a: part(0), knob: part(5) }), 'component'), 'Add part knob');
  assert.equal(describeHistoryStep(component({ a: part(0) }), component({ a: part(9) }), 'component'), 'Move or resize part a');
  assert.equal(describeHistoryStep(component({ a: part(0), b: part(1) }), component({}), 'component'), 'Delete 2 parts');
  assert.equal(describeHistoryStep(component({}, { States: { a: 1 } }), component({}, { States: { a: 2 } }), 'component'), 'Edit states');
});

// --- Through the real store ------------------------------------------------------------------------

function livePanel(tag) {
  const panel = createPanel(`labels-${tag}`);
  panel.controls = [knob(`${tag}_a`, 'Cutoff'), knob(`${tag}_b`, 'Drive')];
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `labels-${tag}`);
  setActivePanel(live.id);
  pushSnapshot();
  return live.id;
}

test('the timeline names each step, knows which are undone, and jumps', () => {
  livePanel('t');
  applyControlPatchesById(new Map([['t_a', { 'Transform.x': 200 }]]));
  pushSnapshot();
  updateControlProperty('t_b', 'Core.name', 'Overdrive');
  pushSnapshot();
  removeControl('t_a');
  pushSnapshot();

  let timeline = historyTimeline();
  assert.deepEqual(timeline.steps.map((s) => s.label), ['Move Cutoff', 'Rename Drive to Overdrive', 'Delete Cutoff']);
  assert.equal(timeline.position, 3);
  assert.equal(undoLabel(), 'Delete Cutoff');
  assert.equal(redoLabel(), '');

  undo();
  timeline = historyTimeline();
  assert.equal(timeline.position, 2);
  assert.deepEqual(timeline.steps.map((s) => [s.label, s.applied]), [
    ['Move Cutoff', true], ['Rename Drive to Overdrive', true], ['Delete Cutoff', false],
  ], 'an undone step keeps its name, and is marked');
  assert.equal(redoLabel(), 'Delete Cutoff');

  assert.equal(jumpToHistory(0), 0);
  const atStart = get(panels).find((p) => p.name === 'labels-t').controls;
  assert.equal(atStart.length, 2);
  assert.equal(atStart[0]._children.Transform.x, 10, 'back to before the first step');
  assert.equal(atStart[1]._children.Core.name, 'Drive');

  assert.equal(jumpToHistory(3), 3);
  const atEnd = get(panels).find((p) => p.name === 'labels-t').controls;
  assert.deepEqual(atEnd.map((c) => c._children.Core.name), ['Overdrive'], 'and forward to the end');
  assert.deepEqual(historyTimeline().steps.map((s) => s.label), ['Move Cutoff', 'Rename Drive to Overdrive', 'Delete Cutoff'],
    'the names are the same after the round trip');
});

test('an edit still waiting on the debounce is not folded into the last step\'s name', () => {
  livePanel('d');
  applyControlPatchesById(new Map([['d_a', { 'Transform.x': 200 }]]));
  pushSnapshot();
  updateControlProperty('d_b', 'Core.name', 'Overdrive');     // not committed yet
  scheduleSnapshot();
  assert.deepEqual(historyTimeline().steps.map((s) => s.label), ['Move Cutoff']);
  pushSnapshot();
  assert.deepEqual(historyTimeline().steps.map((s) => s.label), ['Move Cutoff', 'Rename Drive to Overdrive']);
});

test('a command that names itself keeps its name through undo and redo', () => {
  livePanel('x');
  let outside = 1;
  const transaction = beginHistoryTransaction({
    capture: () => outside,
    restore: (value) => { outside = value; },
    label: 'Recall Bright Pad',
  });
  outside = 2;
  assert.equal(commitHistoryTransaction(transaction), true);
  assert.equal(undoLabel(), 'Recall Bright Pad');
  undo();
  assert.equal(outside, 1);
  assert.equal(redoLabel(), 'Recall Bright Pad');
  redo();
  assert.equal(outside, 2);
  assert.equal(undoLabel(), 'Recall Bright Pad');
});
