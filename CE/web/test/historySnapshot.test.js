// historySnapshot.test.js — undo has to be exact, and it has to be cheap.
//
// It was exact and it was not cheap. A snapshot was `JSON.stringify(panel)`, and the in-memory
// model is the EXPANDED control tree: the GAIA panel is 4.8 MB on disk and 21 MB as a string,
// taking ~190 ms to build. That ran on a 400 ms debounce after every edit — a fifth of a second of
// dead main thread every time you let go of something — and MAX_HISTORY of them is a gigabyte for
// the collector to walk. That is what "the editor feels sluggish" was.
//
// A snapshot is now a shallow copy that SHARES the control objects, which costs one pointer per
// control and retains only what an edit actually replaced. The whole thing rests on ONE property:
//
//     nothing mutates a control in place
//
// which the store already honours (mutatePanelControlsInList deepClones what it edits and returns
// everything else by reference) and which Svelte's reactivity already requires — an in-place
// mutation shows up as "the canvas did not update" long before it shows up as broken undo.
//
// This file holds that property down from the history side. Every test edits through the REAL
// store API, because a test that builds its own objects proves nothing about what the app does to
// them. Two things are asserted each time: undo restores the old value, and the snapshot taken
// beforehand did not move underneath.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import {
  mutatePanelControlsByIdsInList,
} from '../src/CE_Application/stores/panelDocumentHelpers.js';
import { initHistory, pushSnapshot, undo, redo, canUndo } from '../src/CE_Application/stores/history.js';

// The app calls this at startup, and it is what subscribes the baseline to the active context —
// without it every test after the first measures its first edit against the PREVIOUS test's panel
// and pushes that onto this one's undo stack. Found by writing the no-op test and watching it
// restore a panel it had never heard of.
initHistory();

/** A panel with `count` real controls, live in the store and active. */
function livePanel(count, tag) {
  const panel = createPanel(`history-${tag}`);
  panel.controls = Array.from({ length: count }, (unused, i) =>
    createControl('Knob', { Core: { id: `${tag}_k${i}` }, Transform: { x: i * 10, y: 5 } }));
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `history-${tag}`);
  setActivePanel(live.id);
  return live.id;
}

const controlsOf = (panelId) => get(panels).find((p) => p.id === panelId).controls;
const byId = (panelId, id) => controlsOf(panelId).find((c) => c._children.Core.id === id);

/** Move one control through the store's own mutate path — what a drag ends up calling. */
function moveControl(panelId, id, x) {
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, [id], (draft) => {
    draft._children.Transform.x = x;
    return true;
  }));
}

test('undo restores the previous value', () => {
  const panelId = livePanel(6, 'basic');
  pushSnapshot();                       // baseline
  moveControl(panelId, 'basic_k2', 111);
  pushSnapshot();
  assert.equal(byId(panelId, 'basic_k2')._children.Transform.x, 111);

  undo();
  assert.equal(byId(panelId, 'basic_k2')._children.Transform.x, 20, 'undo did not put the old x back');

  redo();
  assert.equal(byId(panelId, 'basic_k2')._children.Transform.x, 111, 'redo did not reapply the edit');
});

test('an edit does not reach back into a snapshot already taken', () => {
  // THE property. A snapshot shares control objects with the live model, so if any edit path
  // mutated one in place instead of replacing it, the history entry would silently follow the
  // model and undo would restore the state it was supposed to undo.
  const panelId = livePanel(8, 'share');
  pushSnapshot();
  const before = controlsOf(panelId);
  const beforeJson = JSON.stringify(before);

  moveControl(panelId, 'share_k3', 999);
  moveControl(panelId, 'share_k5', 888);

  assert.equal(JSON.stringify(before), beforeJson,
    'the pre-edit control objects changed — something mutated a control in place, and undo cannot be trusted');
  assert.notEqual(before[3], controlsOf(panelId)[3], 'an edited control should be a NEW object, not the same one changed');
  assert.equal(before[0], controlsOf(panelId)[0], 'an untouched control should be the same object — that is the sharing this relies on');
});

test('a no-op edit does not create an undo step', () => {
  // The string compare used to dedupe this. Reference comparison alone would not: the store
  // replaces the object whether or not the value differs, so the value check on changed controls
  // has to stay — otherwise every click that "changes" x to the x it already had costs a step.
  const panelId = livePanel(5, 'noop');
  pushSnapshot();
  moveControl(panelId, 'noop_k1', 7);
  pushSnapshot();
  while (canUndo()) undo();

  const steps = () => { let n = 0; while (canUndo()) { undo(); n++; } return n; };
  moveControl(panelId, 'noop_k1', byId(panelId, 'noop_k1')._children.Transform.x);
  pushSnapshot();
  assert.equal(steps(), 0, 'setting a value to what it already was created an undo step');
});

test('panel settings outside the control tree still undo', () => {
  // The chrome — size, colours, notepad — is not shared; it is small and gets copied. Easy to
  // drop when the control tree is what you are thinking about.
  const panelId = livePanel(3, 'chrome');
  pushSnapshot();
  panels.update((list) => list.map((p) => (p.id === panelId ? { ...p, width: 1234, bgColour: 'FF010203' } : p)));
  pushSnapshot();

  undo();
  const panel = get(panels).find((p) => p.id === panelId);
  assert.notEqual(panel.width, 1234, 'a panel width change did not undo');
  assert.notEqual(panel.bgColour, 'FF010203', 'a panel colour change did not undo');
});

test('a snapshot of a big panel is cheap', () => {
  // The regression that matters, stated as a budget rather than a description. 400 controls is the
  // GAIA panel's order; stringifying it was ~190 ms. If someone reintroduces a serialize-the-world
  // snapshot this is what catches it, and the margin is wide enough not to be flaky on a slow box.
  const panelId = livePanel(400, 'big');
  pushSnapshot();
  moveControl(panelId, 'big_k7', 42);

  const started = performance.now();
  for (let i = 0; i < 20; i++) {
    moveControl(panelId, `big_k${i}`, 100 + i);
    pushSnapshot();
  }
  const perSnapshot = (performance.now() - started) / 20;

  assert.ok(perSnapshot < 25,
    `${perSnapshot.toFixed(1)} ms per edit+snapshot on a 400-control panel — the snapshot is serializing the whole document again`);
});
