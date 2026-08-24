// historyDirtyTagsContexts.test.js — the three holes E1/S6 left in undo.
//
// 1. The dirty dot was stuck on: restoreSnapshot hardcoded `modified: true`, so undoing all the
//    way back to the last save still claimed unsaved changes. History now keeps a per-context
//    marker of the saved state and compares against it.
// 2. Two unrelated edits inside the 400 ms debounce merged into one undo step, and a held arrow
//    key emitted no snapshot at all until release. Changes now carry a tag: a different tag
//    inside the window flushes the pending step first, and flushHistory() commits the tail.
// 3. Only panels and component documents had undo. Any workspace can now register its own
//    snapshot/restore pair, and a registered context that says it is active outranks the panel
//    fallback (which always resolves to *something*, so without that its edits would be recorded
//    against whatever panel sits behind it).
//
// Timing note: the scheduler treats changes arriving in one synchronous burst as one logical edit
// (a three-control nudge is three store writes), with a 20 ms grace for the same loop written
// with an await in it. So a test that wants two SEPARATE edits has to wait longer than that —
// which is what `apart()` is for. Two human edits are never that close.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { mutatePanelControlsByIdsInList } from '../src/CE_Application/stores/panelDocumentHelpers.js';
import {
  initHistory,
  pushSnapshot,
  flushHistory,
  tagNextChange,
  scheduleSnapshot,
  markContextSaved,
  markSavedBaseline,
  clearSavedBaseline,
  registerHistoryContext,
  unregisterHistoryContext,
  resetHistoryBaseline,
  undo,
  redo,
  canUndo,
  canRedo,
  undoAvailable,
} from '../src/CE_Application/stores/history.js';

initHistory();

/** Longer than the burst grace, so the next change counts as a separate edit. */
const apart = () => new Promise((resolve) => setTimeout(resolve, 35));

function livePanel(tag, count = 3) {
  const panel = createPanel(`hist-${tag}`);
  panel.controls = Array.from({ length: count }, (unused, i) =>
    createControl('Knob', { Core: { id: `${tag}_k${i}` }, Transform: { x: i * 10, y: 5 } }));
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `hist-${tag}`);
  setActivePanel(live.id);
  activeEditorTab.set({ type: 'panel', id: live.id });
  return live.id;
}

const panelOf = (panelId) => get(panels).find((p) => p.id === panelId);
const xOf = (panelId, id) =>
  panelOf(panelId).controls.find((c) => c._children.Core.id === id)._children.Transform.x;

function moveControl(panelId, id, x) {
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, [id], (draft) => {
    draft._children.Transform.x = x;
    return true;
  }));
}

/** Force the panel clean, the way a save does. */
function markPanelClean(panelId) {
  panels.update((list) => list.map((p) => (p.id === panelId ? { ...p, modified: false } : p)));
}

// --- 1. the dirty flag ------------------------------------------------------

test('undo back to the saved state clears the dirty flag', async () => {
  const panelId = livePanel('dirty');
  markPanelClean(panelId);
  markContextSaved({ kind: 'panel', id: panelId });
  pushSnapshot();
  assert.equal(panelOf(panelId).modified, false);

  moveControl(panelId, 'dirty_k1', 77);
  pushSnapshot();
  assert.equal(panelOf(panelId).modified, true, 'an edit must dirty the panel');

  undo();
  assert.equal(xOf(panelId, 'dirty_k1'), 10, 'undo did not put the old x back');
  assert.equal(panelOf(panelId).modified, false,
    'undoing back to the saved state still showed a dirty dot');

  redo();
  assert.equal(panelOf(panelId).modified, true, 'redoing away from the saved state must dirty again');
});

test('undo to a state that is not the saved one stays dirty', async () => {
  const panelId = livePanel('dirty2');
  markPanelClean(panelId);
  markSavedBaseline();
  pushSnapshot();

  moveControl(panelId, 'dirty2_k0', 100);
  pushSnapshot();
  await apart();
  moveControl(panelId, 'dirty2_k1', 200);
  pushSnapshot();

  undo();
  assert.equal(xOf(panelId, 'dirty2_k1'), 10);
  assert.equal(panelOf(panelId).modified, true,
    'one step back from two edits is not the saved state and must stay dirty');

  undo();
  assert.equal(panelOf(panelId).modified, false, 'two steps back IS the saved state');
});

test('a saved marker is adopted from the document without an explicit save hook', () => {
  // Every save/open path already clears `modified`; history watches that rather than requiring
  // each of them to know it exists. markContextSaved() stays for paths that do not.
  const panelId = livePanel('adopt');
  markPanelClean(panelId);
  pushSnapshot();               // commit observes modified === false and adopts the marker

  moveControl(panelId, 'adopt_k2', 55);
  pushSnapshot();
  undo();
  assert.equal(panelOf(panelId).modified, false, 'the observed clean state was not adopted');
});

test('with no saved marker a restore stays dirty', () => {
  // Never seen clean, so history cannot prove the restore lands on the saved state. Old
  // behaviour is the safe answer here, not a bug.
  const panelId = livePanel('nomark');
  panels.update((list) => list.map((p) => (p.id === panelId ? { ...p, modified: true } : p)));
  clearSavedBaseline({ kind: 'panel', id: panelId });
  pushSnapshot();

  moveControl(panelId, 'nomark_k0', 12);
  pushSnapshot();
  clearSavedBaseline({ kind: 'panel', id: panelId });
  undo();
  assert.equal(panelOf(panelId).modified, true);
});

// --- 2. the debounce window -------------------------------------------------

test('two unrelated edits inside the debounce window are two undo steps', async () => {
  const panelId = livePanel('split');
  pushSnapshot();

  moveControl(panelId, 'split_k0', 500);   // pending, nothing committed yet
  await apart();
  moveControl(panelId, 'split_k1', 600);   // different control -> flushes the first
  flushHistory();

  assert.equal(xOf(panelId, 'split_k0'), 500);
  assert.equal(xOf(panelId, 'split_k1'), 600);

  undo();
  assert.equal(xOf(panelId, 'split_k1'), 10, 'the second edit did not undo on its own');
  assert.equal(xOf(panelId, 'split_k0'), 500, 'the first edit was dragged back with it — they merged');

  undo();
  assert.equal(xOf(panelId, 'split_k0'), 0);
});

test('repeated edits to the same control stay one undo step', async () => {
  // The debounce still has a job: a drag or a scrub is one step, however many frames it took.
  const panelId = livePanel('drag');
  pushSnapshot();

  for (const x of [100, 140, 180, 220]) {
    moveControl(panelId, 'drag_k1', x);
    await apart();
  }
  flushHistory();
  assert.equal(xOf(panelId, 'drag_k1'), 220);

  undo();
  assert.equal(xOf(panelId, 'drag_k1'), 10, 'a scrub should undo in one step, back to where it started');
  assert.equal(canUndo(), false, 'a scrub left more than one undo step behind');
});

test('a multi-control edit written as several store writes is still one step', () => {
  // Nudging a three-control selection calls updateControlProperty three times. Tag those apart
  // and one arrow press costs three undo steps — worse than what this replaced.
  const panelId = livePanel('multi');
  pushSnapshot();

  moveControl(panelId, 'multi_k0', 1);
  moveControl(panelId, 'multi_k1', 11);
  moveControl(panelId, 'multi_k2', 21);
  flushHistory();

  undo();
  assert.equal(xOf(panelId, 'multi_k0'), 0);
  assert.equal(xOf(panelId, 'multi_k1'), 10);
  assert.equal(xOf(panelId, 'multi_k2'), 20);
  assert.equal(canUndo(), false, 'one nudge of a three-control selection cost more than one step');
});

test('flushHistory commits the tail of a held key, and is a no-op when nothing is pending', async () => {
  // The held-arrow-key hole: every repeat reset the 400 ms timer, so a key held for two seconds
  // produced no snapshot at all. The keyup handler calls this.
  const panelId = livePanel('held');
  pushSnapshot();
  assert.equal(canUndo(), false);

  flushHistory();
  assert.equal(canUndo(), false, 'flushing with nothing pending invented an undo step');

  for (const x of [1, 2, 3, 4, 5]) {
    tagNextChange('nudge:x:1');
    moveControl(panelId, 'held_k0', x);
    await apart();
  }
  assert.equal(canUndo(), false, 'nothing should be committed while the key is still down');

  flushHistory();                              // keyup
  assert.equal(canUndo(), true, 'the held nudge never reached history');
  assert.equal(get(undoAvailable), true);
  undo();
  assert.equal(xOf(panelId, 'held_k0'), 0, 'the whole held nudge should undo as one step');
});

test('an explicit tag separates two nudges that touch the same control', async () => {
  // Left-then-up moves one control both times, so the derived tag cannot tell them apart. The
  // key handler tags them by axis and direction instead.
  const panelId = livePanel('axis');
  pushSnapshot();

  tagNextChange('nudge:x:-1');
  moveControl(panelId, 'axis_k1', 9);
  await apart();
  tagNextChange('nudge:y:-1');
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, ['axis_k1'], (draft) => {
    draft._children.Transform.y = 4;
    return true;
  }));
  flushHistory();

  undo();
  const ctrl = panelOf(panelId).controls.find((c) => c._children.Core.id === 'axis_k1');
  assert.equal(ctrl._children.Transform.y, 5, 'the vertical nudge did not undo on its own');
  assert.equal(ctrl._children.Transform.x, 9, 'the horizontal nudge came back with it — they merged');
});

test('an insert and a following edit do not merge', async () => {
  const panelId = livePanel('insert');
  pushSnapshot();

  panels.update((list) => list.map((p) => (p.id === panelId
    ? { ...p, controls: [...p.controls, createControl('Knob', { Core: { id: 'insert_new' } })] }
    : p)));
  await apart();
  moveControl(panelId, 'insert_k0', 300);
  flushHistory();

  undo();
  assert.equal(xOf(panelId, 'insert_k0'), 0, 'the move did not undo on its own');
  assert.equal(panelOf(panelId).controls.length, 4, 'the insert was undone along with the move');

  undo();
  assert.equal(panelOf(panelId).controls.length, 3);
});

// --- 3. the context registry ------------------------------------------------

test('a registered context gets undo, and outranks the panel fallback', () => {
  const panelId = livePanel('reg');
  pushSnapshot();

  // A stand-in for the Device Profile Designer: its own document, its own dirty flag.
  const doc = { profile: { name: 'Base', channel: 1 }, dirty: false };
  let focused = false;
  let restoreCalls = 0;

  const unregister = registerHistoryContext({
    kind: 'deviceProfile',
    id: 'dp1',
    isActive: () => focused,
    isClean: () => doc.dirty === false,
    snapshot: () => ({ profile: { ...doc.profile } }),
    selection: () => ['channel'],
    restore: (snapshot, meta) => {
      restoreCalls++;
      doc.profile = { ...snapshot.profile };
      doc.dirty = meta.modified;
      doc.lastSelection = meta.selection;
    },
  });

  focused = true;
  resetHistoryBaseline();
  assert.equal(canUndo(), false, 'the profile context must start with its own empty stack');

  doc.profile = { ...doc.profile, name: 'Edited' };
  doc.dirty = true;
  scheduleSnapshot();
  pushSnapshot();
  assert.equal(canUndo(), true, 'a registered context recorded no undo step');

  undo();
  assert.equal(restoreCalls, 1);
  assert.equal(doc.profile.name, 'Base', 'the registered restore did not run');
  assert.deepEqual(doc.lastSelection, ['channel'], 'the captured selection was not handed back');
  assert.equal(doc.dirty, false, 'undo back to the clean state must clear the workspace dirty flag');
  assert.equal(canRedo(), true);

  redo();
  assert.equal(doc.profile.name, 'Edited');
  assert.equal(doc.dirty, true, 'redoing away from the saved state must dirty again');

  // The panel behind it is untouched and takes over the moment focus leaves.
  assert.equal(xOf(panelId, 'reg_k0'), 0);
  focused = false;
  resetHistoryBaseline();
  moveControl(panelId, 'reg_k0', 42);
  pushSnapshot();
  undo();
  assert.equal(xOf(panelId, 'reg_k0'), 0, 'the built-in panel context stopped working');
  assert.equal(doc.profile.name, 'Edited', 'a panel undo reached into the registered context');

  unregister();
});

test('registered contexts keep separate stacks and are forgotten on unregister', () => {
  livePanel('reg2');
  const docs = {
    a: { value: 0, active: false },
    b: { value: 0, active: false },
  };
  const make = (key) => registerHistoryContext({
    kind: 'deviceProfile',
    id: key,
    isActive: () => docs[key].active,
    snapshot: () => ({ value: docs[key].value }),
    restore: (snapshot) => { docs[key].value = snapshot.value; },
  });
  const offA = make('a');
  const offB = make('b');

  docs.a.active = true;
  resetHistoryBaseline();
  docs.a.value = 5;
  pushSnapshot();
  assert.equal(canUndo(), true);

  docs.a.active = false;
  docs.b.active = true;
  resetHistoryBaseline();
  assert.equal(canUndo(), false, 'b inherited a\'s stack');
  docs.b.value = 9;
  pushSnapshot();
  undo();
  assert.equal(docs.b.value, 0);
  assert.equal(docs.a.value, 5, 'undoing in b reached into a');

  docs.b.active = false;
  docs.a.active = true;
  resetHistoryBaseline();
  assert.equal(canUndo(), true, 'a lost its stack while b was focused');

  offA();
  offB();
  docs.a.active = true;
  assert.equal(canUndo(), false, 'an unregistered context left its stack behind');
  docs.a.active = false;
  docs.b.active = false;
  resetHistoryBaseline();
});

test('a registered context is tagged per changed field', async () => {
  const doc = { name: 'x', channel: 1, active: true };
  const off = registerHistoryContext({
    kind: 'settings',
    id: 'main',
    isActive: () => doc.active,
    snapshot: () => ({ name: doc.name, channel: doc.channel }),
    restore: (snapshot) => { doc.name = snapshot.name; doc.channel = snapshot.channel; },
  });
  resetHistoryBaseline();

  doc.name = 'y';
  scheduleSnapshot();
  await apart();
  doc.channel = 2;                 // a different field — must not merge with the rename
  scheduleSnapshot();
  flushHistory();

  undo();
  assert.equal(doc.channel, 1, 'the channel change did not undo on its own');
  assert.equal(doc.name, 'y', 'the rename came back with it — two unrelated settings merged');

  undo();
  assert.equal(doc.name, 'x');

  doc.active = false;
  off();
});

test('the reserved kinds are rejected', () => {
  const stub = { id: 'x', isActive: () => false, snapshot: () => ({}), restore: () => {} };
  assert.throws(() => registerHistoryContext({ ...stub, kind: 'panel' }), /reserved/);
  assert.throws(() => registerHistoryContext({ ...stub, kind: 'component' }), /reserved/);
  assert.throws(() => registerHistoryContext({ ...stub, kind: 'ok', isActive: null }), /isActive/);
  assert.throws(() => registerHistoryContext({ ...stub, kind: 'ok', snapshot: null }), /snapshot/);
  unregisterHistoryContext('ok', 'x');
});

test('a registered context with a throwing isActive does not break undo elsewhere', () => {
  const panelId = livePanel('robust');
  const off = registerHistoryContext({
    kind: 'brokenWorkspace',
    id: 'b1',
    isActive: () => { throw new Error('boom'); },
    snapshot: () => ({}),
    restore: () => {},
  });
  resetHistoryBaseline();

  moveControl(panelId, 'robust_k0', 64);
  pushSnapshot();
  undo();
  assert.equal(xOf(panelId, 'robust_k0'), 0, 'one broken workspace took panel undo down with it');
  off();
});

// --- performance property, still intact -------------------------------------

test('snapshots still share control objects and still exclude asset payloads', () => {
  const panelId = livePanel('share', 8);
  panels.update((list) => list.map((p) => (p.id === panelId
    ? { ...p, bgImage: 'data:image/png;base64,AAAA', modified: false }
    : p)));
  pushSnapshot();
  const before = panelOf(panelId).controls;

  moveControl(panelId, 'share_k3', 999);
  assert.equal(before[0], panelOf(panelId).controls[0],
    'an untouched control should be the same object — the tag scan must not clone anything');
  assert.notEqual(before[3], panelOf(panelId).controls[3]);

  pushSnapshot();
  panels.update((list) => list.map((p) => (p.id === panelId
    ? { ...p, bgImage: 'data:image/png;base64,BBBB' }
    : p)));
  pushSnapshot();
  undo();
  assert.equal(panelOf(panelId).bgImage, 'data:image/png;base64,BBBB',
    'undo reverted a base64 asset payload — those are deliberately outside the snapshot');
});

test('the 400 ms debounce still commits on its own', async () => {
  // Everything above flushes by hand. The timer path commits the snapshot held
  // for the pending group rather than re-reading the store, so it needs its own
  // check that the state it commits is the right one.
  const panelId = livePanel('timer');
  pushSnapshot();

  moveControl(panelId, 'timer_k1', 321);
  assert.equal(canUndo(), false, 'the debounce committed immediately');

  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(canUndo(), true, 'the debounce never fired');

  undo();
  assert.equal(xOf(panelId, 'timer_k1'), 10);
});
