import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import {
  activeEditorTab, activePanelId, panels,
} from '../src/CE_Application/stores/panels.js';
import {
  panelPreviewSessions,
} from '../src/CE_Application/stores/interactionPreview.js';
import {
  applyValues, beginSnapshotValueHistory, captureSnapshot, commitSnapshotValueHistory,
  recallSnapshot,
} from '../src/CE_Application/stores/snapshots.js';
import {
  canUndo, initHistory, pushSnapshot, redo, resetHistoryBaseline, undo,
} from '../src/CE_Application/stores/history.js';
import { componentDocuments, componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';

const parameters = [
  { id: 'arp.rate', label: 'Rate', controlName: 'arp', path: 'arp.rate', min: 1, max: 32, section: 'Arp', field: 'rate' },
  { id: 'arp.gate', label: 'Gate', controlName: 'arp', path: 'arp.gate', min: 0, max: 1, section: 'Arp', field: 'gate' },
];

function setupPanel(name = 'Snapshots') {
  initHistory();
  componentWorkspaceMode.set('panel');
  componentDocuments.set([]);
  const panel = createPanel(name);
  panel.controls = [{ _children: { Core: { id: 'arp', name: 'arp', controlType: 'Arp' }, Arp: {} } }];
  panel.exportParameters = parameters;
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  panelPreviewSessions.set({ arp: { sectionValues: { Arp: { rate: 4, gate: 0.25, octave: 2 } } } });
  resetHistoryBaseline();
  return panel;
}

const liveArp = () => get(panelPreviewSessions).arp?.sectionValues?.Arp;

test('applyValues publishes one working copy so multiple fields on one section survive', () => {
  const panel = setupPanel('Batch');
  const written = applyValues({ 'arp.rate': 12, 'arp.gate': 0.8 }, { panel, parameters });
  assert.equal(written, 2);
  assert.deepEqual(liveArp(), { rate: 12, gate: 0.8, octave: 2 });
});

test('Recall is one undoable transaction over every written preview value', () => {
  const panel = setupPanel('Recall');
  panels.update((list) => list.map((entry) => entry.id === panel.id ? {
    ...entry,
    snapshots: [{ id: 'target', name: 'Target', scope: 'panel', capturedAt: 'fixed',
      values: { 'arp.rate': 24, 'arp.gate': 0.75 } }],
  } : entry));
  resetHistoryBaseline();

  assert.equal(recallSnapshot('target'), 2);
  assert.deepEqual(liveArp(), { rate: 24, gate: 0.75, octave: 2 });
  assert.equal(canUndo(), true);

  undo();
  assert.deepEqual(liveArp(), { rate: 4, gate: 0.25, octave: 2 });
  redo();
  assert.deepEqual(liveArp(), { rate: 24, gate: 0.75, octave: 2 });
});

test('Roll undo restores all live values and removes its before-randomise document snapshot', () => {
  const panel = setupPanel('Roll');
  const values = { 'arp.rate': 18, 'arp.gate': 0.6 };
  const history = beginSnapshotValueHistory(values, { panel, parameters });
  assert.ok(captureSnapshot({ name: 'Before randomise', now: 'fixed' }));
  assert.equal(applyValues(values, { panel, parameters }), 2);
  assert.equal(commitSnapshotValueHistory(history), true);

  assert.equal(get(panels)[0].snapshots.length, 1);
  assert.deepEqual(liveArp(), { rate: 18, gate: 0.6, octave: 2 });

  undo();
  assert.equal(get(panels)[0].snapshots.length, 0);
  assert.deepEqual(liveArp(), { rate: 4, gate: 0.25, octave: 2 });

  redo();
  assert.equal(get(panels)[0].snapshots.length, 1);
  assert.deepEqual(liveArp(), { rate: 18, gate: 0.6, octave: 2 });
});

test('the active note index is view state and survives an unrelated content undo', () => {
  const panel = setupPanel('Notes');
  panels.update((list) => list.map((entry) => entry.id === panel.id ? {
    ...entry,
    notepad: { notes: [{ name: 'One', content: '' }, { name: 'Two', content: '' }], activeNoteIndex: 0 },
  } : entry));
  resetHistoryBaseline();

  panels.update((list) => list.map((entry) => entry.id === panel.id ? {
    ...entry,
    notepad: { ...entry.notepad, notes: [{ name: 'One', content: 'edited' }, entry.notepad.notes[1]] },
    modified: true,
  } : entry));
  pushSnapshot();
  panels.update((list) => list.map((entry) => entry.id === panel.id ? {
    ...entry,
    notepad: { ...entry.notepad, activeNoteIndex: 1 },
  } : entry));
  pushSnapshot();

  undo();
  assert.equal(get(panels)[0].notepad.notes[0].content, '');
  assert.equal(get(panels)[0].notepad.activeNoteIndex, 1);
});
