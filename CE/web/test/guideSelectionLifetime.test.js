// guideSelectionLifetime.test.js — a selected guide must stop owning the Delete key the moment
// the user selects something else.
//
// Review finding A11, clause 2. `deleteSelectedGuide()` runs AHEAD of the control-delete branch
// in editorShortcuts, which is correct while the guide is the thing the user last touched and
// wrong the instant it is not. Two routes cleared the selected guide — a mousedown on a control
// and a click on bare canvas — and every other route did not: Ctrl+A, Tab sibling-cycling, a
// click in the component tree, and a marquee (whose own mouseup swallows in capture the click
// that would otherwise have cleared it).
//
// The concrete bug: select a guide, press Ctrl+A, press Delete. The guide is deleted and every
// selected control survives.
//
// Same shape as the stale colour target (B1), so guides.js now mirrors colorTarget.js: a change
// in the component selection clears the guide.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addGuide, guides, selectedGuide, deleteSelectedGuide } from '../src/CE_Application/stores/guides.js';

function freshPanelWithGuide() {
  const panel = createPanel('Guide Lifetime');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  addGuide('vertical', 100);
  selectedGuide.set({ orientation: 'vertical', index: 0 });
  return panel;
}

test('selecting controls clears the selected guide, so Delete no longer hits the guide', () => {
  freshPanelWithGuide();
  assert.ok(get(selectedGuide), 'precondition: a guide is selected');

  // This is the Ctrl+A step — selectAll writes the id set, and nothing else about the guide
  // changes. Before the fix the guide stayed selected right through it.
  selectedComponentIds.set(new Set(['ctrl_1', 'ctrl_2']));

  assert.equal(get(selectedGuide), null, 'a selection change means the user has moved on');
  assert.equal(deleteSelectedGuide(), false, 'so Delete must fall through to the controls');
  assert.deepEqual(get(guides).vertical, [100], 'and the guide survives');
});

test('a guide selected while nothing else is still owns Delete', () => {
  freshPanelWithGuide();

  // No selection change here: clicking a guide label does not touch selectedComponentIds, so the
  // guide is what Delete is aimed at. Removing the priority outright would have broken this.
  assert.equal(deleteSelectedGuide(), true);
  assert.deepEqual(get(guides).vertical, []);
  assert.equal(get(selectedGuide), null);
});

test('a guide selected after the controls still owns Delete', () => {
  // Order matters: select controls first, THEN click a guide. The guide is the most recent
  // intent, and clearing on selection change must not reach backwards and undo that.
  const panel = createPanel('Guide After');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set(['ctrl_9']));
  addGuide('horizontal', 40);
  selectedGuide.set({ orientation: 'horizontal', index: 0 });

  assert.equal(deleteSelectedGuide(), true);
  assert.deepEqual(get(guides).horizontal, []);
});

test('the subscribe-time replay does not clear a guide before one can be selected', () => {
  // guides.js skips the first notification for the same reason colorTarget.js does: svelte
  // replays the current value on subscribe, and acting on that would clear the selection the
  // module was imported to manage. The module is already subscribed by the time this file runs,
  // so what is asserted here is the consequence — selecting a guide with a selection already in
  // place sticks.
  const panel = createPanel('Replay');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set(['ctrl_3']));
  addGuide('vertical', 55);
  selectedGuide.set({ orientation: 'vertical', index: 0 });

  assert.deepEqual(get(selectedGuide), { orientation: 'vertical', index: 0 });
});
