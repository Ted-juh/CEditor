// scriptApprovalOrder.test.js — a panel's script approval survives its scripts starting.
//
// Approval is a fingerprint of the panel's scripts in a canonical order, and that order came from
// localeCompare. The script sandbox's lockdown (SES) replaces localeCompare with a plain code-unit
// comparison when the first script loads, so a panel approved before then was fingerprinted in the
// locale's order and checked, from its first handler on, in the other. Wherever the two disagree
// ("gaia_tone_copy" and "gaia_tone1_copy_click": "_" sorts before "1" in the locale, after it by
// code unit) the approval lapsed as the scripts started, they were reset, and the author was asked
// again. The GAIA panel is such a panel; its browser checks found it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { approveCurrentPanelScripts, ensurePanelExecutionApproved, initPanelRuntime } from '../src/CE_Application/scripting/panelRuntime.js';

const script = (id) => ({ id, name: id, event: 'onPanelLoad', language: 'javascript', scope: 'panel', enabled: true,
  source: `function onPanelLoad() { log('${id}'); }` });

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 5));

test('an approval made before the sandbox starts holds after localeCompare is replaced', async () => {
  const ids = ['gaia_tone_copy', 'gaia_tone1_copy_click'];
  // The premise: the locale and code units order these two differently.
  assert.notDeepEqual([...ids].sort((a, b) => a.localeCompare(b)), [...ids].sort());

  const panel = { id: 'approval-order', name: 'approval order', controls: [], scripts: ids.map(script) };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  initPanelRuntime();
  approveCurrentPanelScripts();
  assert.equal(ensurePanelExecutionApproved(), true);

  // What the lockdown does to localeCompare, done here without the sandbox.
  const original = String.prototype.localeCompare;
  // eslint-disable-next-line no-extend-native
  String.prototype.localeCompare = function codeUnits(other) {
    const a = String(this), b = String(other);
    return a < b ? -1 : a > b ? 1 : 0;
  };
  try {
    // A later task, as the scripts' own loading is: the request is built again, not reused.
    await nextTask();
    assert.equal(ensurePanelExecutionApproved(), true, 'still approved once the scripts have started');
    assert.equal(ensurePanelExecutionApproved(panel.scripts[1]), true, 'and for each script as its handlers load');
  } finally {
    String.prototype.localeCompare = original;
  }
});

test('the request reused within a task is rebuilt when the panel is replaced, even in that task', () => {
  const panel = { id: 'approval-memo', name: 'approval memo', controls: [], scripts: [script('one'), script('two')] };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  approveCurrentPanelScripts();
  for (let i = 0; i < 500; i++) assert.equal(ensurePanelExecutionApproved(panel.scripts[i % 2]), true);

  // Changed code, in the same task: a new document, so not the request that was approved.
  const edited = { ...panel, scripts: [panel.scripts[0], { ...panel.scripts[1], source: 'function onPanelLoad() { log("changed"); }' }] };
  panels.set([edited]);
  assert.equal(ensurePanelExecutionApproved(), false, 'an edited script is not covered by the earlier approval');
  assert.equal(ensurePanelExecutionApproved(edited.scripts[1]), false);
  // A copy of a script that is not the set's own is checked as it is, never against the reuse.
  approveCurrentPanelScripts();
  assert.equal(ensurePanelExecutionApproved({ ...edited.scripts[0], source: 'function onPanelLoad() { log("other"); }' }), false);
  assert.equal(ensurePanelExecutionApproved(edited.scripts[0]), true);
});
