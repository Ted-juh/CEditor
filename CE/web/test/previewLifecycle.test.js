import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { get } from 'svelte/store';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, setPreviewModeEnabled, previewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { initPanelRuntime, approveCurrentPanelScripts } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const script = (id, event, source) => ({ id, name: id, event, source,
  language: 'javascript', scope: 'panel', enabled: true });
function panel(id) {
  const control = createControl('ToggleButton', { name: 'release_toggle' });
  control._children.Core.name = 'release_toggle';
  return { id, name: id, controls: [control], scripting: { modules: MODULES.map(m => m.id) }, scripts: [
    script(id+'-ready', 'onPanelReady', `function onPanelReady(info) {
      set('release_toggle.value', true); log('${id} READY '+info.firstTime);
    }`),
    script(id+'-close', 'onPanelClose', `async function onPanelClose() {
      log('${id} CLOSE '+get('release_toggle.value'));
      await Promise.resolve();
      set('release_toggle.Transform.x', 987);
      log('${id} CLOSE AFTER '+get('release_toggle.value'));
    }`),
    script(id+'-destroy', 'onPanelDestroy', `function onPanelDestroy() {
      log('${id} DESTROY '+get('release_toggle.value'));
      set('release_toggle.Transform.x', 654);
    }`),
  ] };
}
const messages = () => get(scriptTrace).map(t => t.message);
async function until(text) {
  for (let n=0; n<100 && !messages().includes(text); n++) await delay(10);
  assert.ok(messages().includes(text), messages().join('\n'));
}
function select(id) {
  activePanelId.set(id);
  activeEditorTab.set({ type: 'panel', id });
}
initPanelRuntime();

test('Close reads final value, async Close writes roll back, and immediate restart survives', async () => {
  const p = panel('close');
  panels.set([p]); select(p.id); approveCurrentPanelScripts(); clearScriptTrace();
  const before = p.controls[0]._children.Transform.x;
  try {
    setPreviewModeEnabled(true);
    await until('close READY true');
    await setPreviewModeEnabled(false);
    assert.ok(messages().includes('close CLOSE true'));
    assert.ok(messages().includes('close CLOSE AFTER true'));
    assert.equal(get(panels)[0].controls[0]._children.Transform.x, before);
    assert.deepEqual(get(panelPreviewSessions), {});
    setPreviewModeEnabled(true);
    await until('close READY false');
    const stopping = setPreviewModeEnabled(false);
    setPreviewModeEnabled(true);
    await stopping;
    await delay(50);
    assert.equal(get(previewModeEnabled), true);
    assert.equal(get(panelPreviewSessions)[p.controls[0]._children.Core.id].checked, true);
    assert.equal(messages().filter(m => m === 'close CLOSE true').length, 2);
  } finally { await setPreviewModeEnabled(false); panels.set([]); }
});

test('panel switch destroys against outgoing panel and starts incoming/returning panel once', async () => {
  const a=panel('switch-a'), b=panel('switch-b');
  const bBefore=b.controls[0]._children.Transform.x;
  panels.set([a,b]); select(b.id); approveCurrentPanelScripts();
  select(a.id); approveCurrentPanelScripts(); clearScriptTrace();
  try {
    setPreviewModeEnabled(true); await until('switch-a READY true');
    select(b.id); await until('switch-b READY true');
    assert.equal(messages().filter(m => m === 'switch-a DESTROY true').length, 1);
    assert.equal(get(panels).find(p=>p.id===a.id).controls[0]._children.Transform.x,654);
    assert.equal(get(panels).find(p=>p.id===b.id).controls[0]._children.Transform.x,bBefore);
    select(a.id); await until('switch-a READY false');
    assert.equal(messages().filter(m => m === 'switch-b DESTROY true').length, 1);
    assert.equal(get(panelPreviewSessions)[a.controls[0]._children.Core.id].checked,true);
    assert.equal(messages().filter(m => m.startsWith('switch-a READY')).length, 2);
  } finally { await setPreviewModeEnabled(false); panels.set([]); }
});
