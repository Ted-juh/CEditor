// scriptPanelKeep.test.js — ce.panel.keep(), the one way out of a rehearsal.
//
// Preview puts the panel back when it stops (stores/previewRehearsal.js), which is right for the
// common case and wrong for the one where the author MEANT it: run a recolouring script, keep the
// result, save. keep() is that exception, and it works by patching the photograph rather than by
// writing anything of its own — so a kept value survives the restore because the restore is what
// puts it there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import {
  beginPreviewRehearsal, endPreviewRehearsal, isRehearsing,
} from '../src/CE_Application/stores/previewRehearsal.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

const traced = () => get(scriptTrace).map((t) => `[${t.kind}] ${t.message}`).join('\n');
const xOf = (i = 0) => get(panels)[0].controls[i]._children.Transform.x;

function seed(extra = []) {
  const control = createControl('Knob', { name: 'Cutoff' });
  panels.set([{
    id: 'p', name: 'P', controls: [control, ...extra], modified: false,
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  return scriptApiForTesting('', 'keep-test');
}

test('a kept property survives the restore; an unkept one beside it does not', () => {
  try {
    const api = seed();
    beginPreviewRehearsal();

    api.set('Cutoff.Transform.x', 400);
    api.set('Cutoff.Transform.y', 400);
    assert.equal(api.ce.panel.keep('Cutoff.Transform.x'), true);

    endPreviewRehearsal();
    assert.equal(xOf(), 400, 'the kept property stayed');
    assert.equal(get(panels)[0].controls[0]._children.Transform.y, 0, 'the unkept one went back');
  } finally { panels.set([]); }
});

test('keep() with no path keeps the whole run, and closes the rehearsal', () => {
  try {
    const api = seed();
    beginPreviewRehearsal();
    api.set('Cutoff.Transform.x', 123);
    api.set('Cutoff.Transform.y', 456);

    assert.equal(api.ce.panel.keep(), true);
    assert.equal(isRehearsing(), false, 'there is no longer a photograph to put back');

    endPreviewRehearsal();   // the stop path still runs, and must be a no-op now
    assert.equal(xOf(), 123);
    assert.equal(get(panels)[0].controls[0]._children.Transform.y, 456);
  } finally { panels.set([]); }
});

test('keep() outside a preview says so rather than pretending', () => {
  try {
    const api = seed();
    assert.equal(api.ce.panel.keep('Cutoff.Transform.x'), false);
    assert.match(traced(), /nothing to keep/);
  } finally { panels.set([]); }
});

test('a script-created control cannot be kept, and the message says why', () => {
  try {
    const generated = createControl('Button', { name: 'pad1' });
    generated._children.Core.generatedBy = 'script';
    const api = seed([generated]);
    beginPreviewRehearsal();

    api.set('pad1.Transform.x', 50);
    assert.equal(api.ce.panel.keep('pad1.Transform.x'), false);
    assert.match(traced(), /created by a script/);
    assert.match(traced(), /sit beside the new one/, 'the reason, not just the refusal');
  } finally { endPreviewRehearsal(); panels.set([]); }
});

test('keeping an unknown control, or a path that leads nowhere, is refused', () => {
  try {
    const api = seed();
    beginPreviewRehearsal();

    assert.equal(api.ce.panel.keep('NoSuchControl.Transform.x'), false);
    assert.match(traced(), /not found on the active panel/);

    clearScriptTrace();
    assert.equal(api.ce.panel.keep('Cutoff.Nonsense.field'), false);
    assert.match(traced(), /does not lead to a property/);
  } finally { endPreviewRehearsal(); panels.set([]); }
});

test('keep() reaches a control nested inside a container', () => {
  try {
    const inner = createControl('Knob', { name: 'Inner' });
    const group = createControl('Container', { name: 'Bay' });
    group._children.Children._children = { Inner: inner };
    panels.set([{
      id: 'p', name: 'P', controls: [group], modified: false,
      scripting: { modules: MODULES.map((m) => m.id) },
    }]);
    activePanelId.set('p');
    clearScriptTrace();
    const api = scriptApiForTesting('', 'keep-nested');

    beginPreviewRehearsal();
    api.set('Inner.Transform.x', 77);
    assert.equal(api.ce.panel.keep('Inner.Transform.x'), true, 'the snapshot walk found it nested');
    endPreviewRehearsal();

    assert.equal(
      get(panels)[0].controls[0]._children.Children._children.Inner._children.Transform.x, 77);
  } finally { panels.set([]); }
});
