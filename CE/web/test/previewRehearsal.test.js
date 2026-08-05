// previewRehearsal.test.js — preview is a rehearsal, not an edit.
//
// Two routes reached the authored document during a preview and stayed there: a script's set()
// (the editor installs no runtime host, so panelRuntime writes straight through
// updateControlProperty) and the component gesture handlers in PanelPreviewSurface, which call
// updateControlProperty directly. Stopping preview restored neither, and the panels subscriber
// autosaved both.
//
// What is asserted here is the bracket: whatever changed between preview on and preview off is put
// back, whoever wrote it — and the rules a preview registered do not outlive it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { previewModeEnabled, setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import {
  beginPreviewRehearsal, endPreviewRehearsal, isRehearsing, setPreviewRehearsalEnabled,
} from '../src/CE_Application/stores/previewRehearsal.js';
import { updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

function seed(name = 'Cutoff') {
  const control = createControl('Knob', { name });
  panels.set([{
    id: 'p', name: 'P', controls: [control], modified: false,
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  return control._children.Core.id;
}


test('a change made during a rehearsal is put back when it ends', () => {
  try {
    const id = seed();
    const before = JSON.stringify(get(panels));

    beginPreviewRehearsal();
    assert.equal(isRehearsing(), true);
    updateControlProperty(id, 'Transform.x', 512);
    assert.equal(get(panels)[0].controls[0]._children.Transform.x, 512, 'the change did land');

    assert.equal(endPreviewRehearsal(), true, 'the restore reported that it wrote');
    assert.equal(JSON.stringify(get(panels)), before, 'the document is byte-identical again');
    assert.equal(isRehearsing(), false);
  } finally { panels.set([]); }
});

test('a rehearsal that changed nothing does not touch the store', () => {
  try {
    seed();
    const before = get(panels);
    beginPreviewRehearsal();
    assert.equal(endPreviewRehearsal(), false, 'nothing to put back, so nothing written');
    assert.equal(get(panels), before, 'the same array instance — modified stays as it was');
  } finally { panels.set([]); }
});

test('a control created during a rehearsal is gone after it', () => {
  try {
    seed();
    beginPreviewRehearsal();
    panels.update((list) => list.map((p) => ({
      ...p, controls: [...p.controls, createControl('Button', { name: 'Generated' })],
    })));
    assert.equal(get(panels)[0].controls.length, 2);
    endPreviewRehearsal();
    assert.equal(get(panels)[0].controls.length, 1, 'the generated control did not survive');
    assert.equal(get(panels)[0].controls[0]._children.Core.name, 'Cutoff');
  } finally { panels.set([]); }
});

test('the preview toggle brackets the run, both ways', () => {
  try {
    const id = seed();
    const before = JSON.stringify(get(panels));

    setPreviewModeEnabled(true);
    assert.equal(get(previewModeEnabled), true);
    assert.equal(isRehearsing(), true, 'turning preview on opened the bracket');
    updateControlProperty(id, 'Transform.y', 999);

    setPreviewModeEnabled(false);
    assert.equal(get(previewModeEnabled), false);
    assert.equal(isRehearsing(), false, 'turning preview off closed it');
    assert.equal(JSON.stringify(get(panels)), before, 'and put the document back');
  } finally {
    setPreviewModeEnabled(false);
    panels.set([]);
  }
});

test('turning preview on twice does not re-photograph a document already being rehearsed', () => {
  try {
    const id = seed();
    const before = JSON.stringify(get(panels));

    setPreviewModeEnabled(true);
    updateControlProperty(id, 'Transform.x', 111);
    setPreviewModeEnabled(true);              // a redundant call must not adopt the changed state
    updateControlProperty(id, 'Transform.x', 222);
    setPreviewModeEnabled(false);

    assert.equal(JSON.stringify(get(panels)), before, 'restored to before the FIRST on');
  } finally {
    setPreviewModeEnabled(false);
    panels.set([]);
  }
});

test('the player does not rehearse: a host turns it off and drops any open snapshot', () => {
  try {
    const id = seed();
    setPreviewRehearsalEnabled(true);
    beginPreviewRehearsal();
    assert.equal(isRehearsing(), true);

    setPreviewRehearsalEnabled(false);        // what setRuntimeHost does when the player starts
    assert.equal(isRehearsing(), false, 'the snapshot was dropped, not applied');

    updateControlProperty(id, 'Transform.x', 42);
    assert.equal(beginPreviewRehearsal(), false, 'and no new rehearsal opens');
    endPreviewRehearsal();
    assert.equal(get(panels)[0].controls[0]._children.Transform.x, 42, "the player's write stands");
  } finally {
    setPreviewRehearsalEnabled(true);
    panels.set([]);
  }
});
