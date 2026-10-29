// The DAW-state hooks in the panel view, as the exported plug-in's page runs them with its window
// open: the page's onDawSaveState answers are handed to the processor, the panel starts from the
// processor's state, and a restore while the window is open reaches the page's scripts. The editor
// installs no sink and raises neither.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { get } from 'svelte/store';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import {
  initPanelRuntime, approveCurrentPanelScripts, setDawStateSink, setDawRestoreForNextStart,
  raiseDawRestoreState, collectDawSaveState,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const script = (id, event, source, language = 'javascript') => ({ id, name: id, event, source, language, scope: 'panel', enabled: true });
function panel(id, scripts) {
  const control = createControl('Knob', { name: 'k' });
  control._children.Core.name = 'k';
  return { id, name: id, controls: [control], scripting: { modules: MODULES.map((m) => m.id) }, scripts };
}
const messages = () => get(scriptTrace).map((t) => t.message);
async function until(check, what) {
  for (let n = 0; n < 200 && !check(); n++) await delay(10);
  assert.ok(check(), `${what}\n${messages().join('\n')}`);
}
function open(p) {
  panels.set([p]);
  activePanelId.set(p.id);
  activeEditorTab.set({ type: 'panel', id: p.id });
  approveCurrentPanelScripts();
  clearScriptTrace();
}
initPanelRuntime();

// `state` belongs to each script, so the scripts share the value through the knob.
const SCRIPTS = [
  script('save-count', 'onDawSaveState', 'function onDawSaveState(store) { return { count: get("k.value") }; }'),
  script('save-mode', 'onDawSaveState', 'function onDawSaveState(store) { return { mode: "js", sawCount: store.count }; }'),
  script('restore', 'onDawRestoreState', 'function onDawRestoreState(store) { set("k.value", store.count ?? 0); log("RESTORED " + JSON.stringify(store)); }'),
  script('ready', 'onPanelReady', 'function onPanelReady() { log("READY " + get("k.value")); }'),
];

test('the page starts from the processor state, raised after build and before ready', async () => {
  const p = panel('daw-start', SCRIPTS);
  open(p);
  const sent = [];
  setDawStateSink((store) => sent.push(store));
  setDawRestoreForNextStart({ count: 41 });
  try {
    setPreviewModeEnabled(true);
    await until(() => messages().includes('READY 41'), 'ready after the restore');
    const restoredAt = messages().indexOf('RESTORED {"count":41}');
    assert.ok(restoredAt >= 0 && restoredAt < messages().indexOf('READY 41'));
    // …and the page then tells the processor what it would save: every handler's keys, merged, each
    // handler shown what the ones before it returned.
    await until(() => sent.length > 0, 'the page hands its state over');
    assert.deepEqual(sent.at(-1), { count: 41, mode: 'js', sawCount: 41 });
  } finally {
    setDawStateSink(null);
    await setPreviewModeEnabled(false);
    panels.set([]);
  }
});

test('a restore while the window is open reaches the page, and the next save says so', async () => {
  const p = panel('daw-live', SCRIPTS);
  open(p);
  const sent = [];
  setDawStateSink((store) => sent.push(store));
  try {
    setPreviewModeEnabled(true);
    await until(() => messages().some((m) => m.startsWith('READY ')), 'ready with nothing restored');
    await raiseDawRestoreState({ count: 7 });
    await until(() => sent.some((s) => s.count === 7), 'the restored value is saved again');
    assert.deepEqual(await collectDawSaveState(), { count: 7, mode: 'js', sawCount: 7 });
  } finally {
    setDawStateSink(null);
    await setPreviewModeEnabled(false);
    panels.set([]);
  }
});

test('the editor installs no sink: no restore at start, nothing handed over', async () => {
  const p = panel('daw-editor', SCRIPTS);
  open(p);
  setDawRestoreForNextStart({ count: 99 });
  try {
    setPreviewModeEnabled(true);
    await until(() => messages().some((m) => m.startsWith('READY ')), 'ready without a restore');
    assert.ok(!messages().some((m) => m.startsWith('RESTORED')));
  } finally {
    setDawRestoreForNextStart(null);
    await setPreviewModeEnabled(false);
    panels.set([]);
  }
});
