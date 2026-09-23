import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createInteractionPreviewSession, panelPreviewSessions, updatePanelPreviewSession, syncPanelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { deviceParameterValues, clearDeviceParameterValues, recordDeviceParameterValue } from '../src/CE_Application/stores/deviceParameterValues.js';
import { syncDeviceRuntimeStateToPanelPreview, syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';

function component(id, parameter = id) {
  return { _children: {
    Core: { id, name: id, controlType: 'CustomComponent' },
    ValueChannels: { _children: { value: { name: 'value', type: 'int', min: 0, max: 127, defaultValue: 0 } } },
    DeviceBindings: { bindings: [{ kind: 'deviceParameter', deviceRole: 'synth', parameterId: parameter, port: 'value' }] },
  } };
}

function setup(controls) {
  panels.set([{ id: 'batch-panel', controls }]);
  activePanelId.set('batch-panel');
  activeEditorTab.set({ type: 'panel', id: 'batch-panel' });
  panelPreviewSessions.set(Object.fromEntries(controls.map(control => [control._children.Core.id, createInteractionPreviewSession(control)])));
  clearDeviceParameterValues();
}

test('reconciling controls preserves existing sessions and publishes only actual changes', () => {
  const controls = [component('a'), component('b')];
  setup(controls);
  const original = get(panelPreviewSessions);
  let publications = 0;
  const stop = panelPreviewSessions.subscribe(() => publications++);
  publications = 0;
  syncPanelPreviewSessions(controls);
  assert.equal(publications, 0);
  syncPanelPreviewSessions([...controls, component('c')]);
  assert.equal(publications, 1);
  assert.equal(get(panelPreviewSessions).a, original.a);
  assert.equal(get(panelPreviewSessions).b, original.b);
  stop();
});

test('a full hardware snapshot publishes one preview update; repeated values publish none', () => {
  const controls = Array.from({ length: 150 }, (_, i) => component(`fader${i}`));
  setup(controls);
  const values = Object.fromEntries(controls.map((control, i) => [control._children.Core.id, i % 128]));
  let publications = 0;
  const stop = panelPreviewSessions.subscribe(() => publications++);
  try {
    publications = 0;
    syncDeviceRuntimeStateToPanelPreview({ synth: values });
    assert.equal(publications, 1);
    const first = get(panelPreviewSessions);
    for (const [id, value] of Object.entries(values)) assert.equal(first[id].customValues.value, value);
    publications = 0;
    syncDeviceRuntimeStateToPanelPreview({ synth: { ...values } });
    assert.equal(publications, 0, 'returning the same object from writable.update would still notify');
    assert.equal(get(panelPreviewSessions), first);
    syncDeviceRuntimeStateToPanelPreview({ synth: { ...values, fader0: 127 } });
    assert.equal(publications, 1);
    assert.equal(get(panelPreviewSessions).fader0.customValues.value, 127);
    assert.equal(get(panelPreviewSessions).fader149, first.fader149);
  } finally { stop(); }
});

test('repeated parameter values do not wake parameter displays either', () => {
  clearDeviceParameterValues();
  let publications = 0;
  const stop = deviceParameterValues.subscribe(() => publications++);
  try {
    publications = 0;
    recordDeviceParameterValue('synth', 'cutoff', 64);
    recordDeviceParameterValue('synth', 'cutoff', 64);
    assert.equal(publications, 1);
    recordDeviceParameterValue('synth', 'cutoff', 65);
    assert.equal(publications, 2);
  } finally { stop(); }
});

test('one snapshot merges different channels on the same component', () => {
  const control = component('xy', 'x');
  control._children.ValueChannels._children.y = { name: 'y', type: 'int', min: 0, max: 127, defaultValue: 0 };
  control._children.DeviceBindings.bindings.push({ kind: 'deviceParameter', deviceRole: 'synth', parameterId: 'y', port: 'y' });
  setup([control]);
  syncDeviceRuntimeStateToPanelPreview({ synth: { x: 40, y: 70 } });
  assert.deepEqual(get(panelPreviewSessions).xy.customValues, { value: 40, y: 70 });
});

test('feedback guards survive batching and repeated values can apply after drag release', () => {
  setup([component('a'), component('b', 'a')]);
  updatePanelPreviewSession('a', { dragging: true });
  syncDeviceRuntimeStateToPanelPreview({ synth: { a: 99 } });
  assert.equal(get(panelPreviewSessions).a.customValues.value, 0);
  assert.equal(get(panelPreviewSessions).b.customValues.value, 99);
  updatePanelPreviewSession('a', { dragging: false });
  syncDeviceRuntimeStateToPanelPreview({ synth: { a: 99 } });
  assert.equal(get(panelPreviewSessions).a.customValues.value, 99);
  syncDeviceParameterToPanelPreview('synth', 'a', 50, { skipControlId: 'a' });
  assert.equal(get(panelPreviewSessions).a.customValues.value, 99);
  assert.equal(get(panelPreviewSessions).b.customValues.value, 50);
});

test('binding edits and newly nested controls invalidate the receive index', () => {
  setup([component('a', 'old')]);
  syncDeviceParameterToPanelPreview('synth', 'old', 20);
  const changed = component('a', 'new');
  const parent = { _children: { Core: { id: 'group', controlType: 'Group' }, Children: { _children: { a: changed } } } };
  panels.set([{ id: 'batch-panel', controls: [parent] }]);
  assert.equal(syncDeviceParameterToPanelPreview('synth', 'old', 30), 0);
  assert.equal(syncDeviceParameterToPanelPreview('synth', 'new', 40), 1);
  assert.equal(get(panelPreviewSessions).a.customValues.value, 40);
});

test('preview control lookup cache follows immutable controls-array revisions', () => {
  setup([component('slider')]);
  updatePanelPreviewSession('slider', { pressed: true }); // populate the old document's index

  const replacement = {
    _children: {
      Core: { id: 'slider', name: 'slider', controlType: 'Slider' },
      Behavior: {
        family: 'range', role: 'slider', valueMode: 'range', activeHandlePolicy: 'endFirst',
        min: 0, max: 127, defaultStartValue: 0, defaultEndValue: 127,
      },
    },
  };
  panels.set([{ id: 'batch-panel', controls: [replacement] }]);
  panelPreviewSessions.set({});
  updatePanelPreviewSession('slider', { pressed: true });

  assert.equal(get(panelPreviewSessions).slider.activeHandle, 'end',
    'a new controls array must not reuse the previous document revision\'s id index');
});
