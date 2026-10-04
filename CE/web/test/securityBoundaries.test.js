import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { get } from 'svelte/store';
import { evaluatePanelSource, initialiseJavascriptSandbox } from '../src/CE_Application/scripting/scriptSandbox.js';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { scriptExecutionStatus } from '../src/CE_Application/scripting/scriptTrust.js';
import { previewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { initPanelRuntime, deliverSysexForTesting, approveCurrentPanelScripts,
  ensurePanelExecutionApproved, runScript } from '../src/CE_Application/scripting/panelRuntime.js';

await initialiseJavascriptSandbox();
test('guest globals, constructors and host callbacks cannot reach the privileged page', () => {
  globalThis.__securitySecret = 'host-only';
  const api = { get: () => 42 };
  const handlers = evaluatePanelSource(`function probe() {
    return [typeof window, typeof document, typeof fetch, typeof __JUCE__, typeof process,
      typeof globalThis.__securitySecret, Function('return typeof window')(), get()];
  }`, api, ['probe']);
  assert.deepEqual(handlers.probe(), ['undefined', 'undefined', 'undefined', 'undefined',
    'undefined', 'undefined', 'undefined', 42]);
  const constructorProbe = evaluatePanelSource(`function probe() {
    return get.constructor('return typeof window + ":" + typeof process')(); }`, api, ['probe']);
  assert.equal(constructorProbe.probe(), 'undefined:undefined');
  evaluatePanelSource(`({}).__proto__.securityPollution = true`, {}, []);
  assert.equal({}.securityPollution, undefined);
  delete globalThis.__securitySecret;
});

test('inbound MIDI does not execute imported code; approval is session-local and content-bound', async () => {
  const script = { id: 'security-script', language: 'javascript', scope: 'panel', event: 'onClick',
    enabled: true, source: `log('security-top-level'); function onClick() { log('security-click'); }` };
  const panel = { id: 'security-panel', name: 'Security test', controls: [], scripts: [script],
    trusted: true, scripting: { trusted: true } };
  panels.set([panel]); activePanelId.set(panel.id); activeEditorTab.set({ type: 'panel', id: panel.id });
  initPanelRuntime();
  clearScriptTrace();
  deliverSysexForTesting({ hex: 'F07D01F7' });
  await setTimeout(20);
  assert.equal(get(scriptTrace).some(t => t.message.includes('security-top-level')), false);
  assert.equal(get(scriptExecutionStatus).blocked, true);
  await runScript(script);
  assert.equal(get(scriptTrace).some(t => t.message.includes('security-click')), false);
  approveCurrentPanelScripts();
  deliverSysexForTesting({ hex: 'F07D01F7' });
  await setTimeout(20);
  assert.ok(get(scriptTrace).some(t => t.message.includes('security-top-level')));
  const changed = { ...script, source: script.source + '\nlog("changed-source");' };
  panels.set([{ ...panel, scripts: [changed] }]);
  assert.equal(ensurePanelExecutionApproved(), false);
  deliverSysexForTesting({ hex: 'F07D01F7' });
  await setTimeout(20);
  assert.equal(get(scriptTrace).some(t => t.message.includes('changed-source')), false);
  const lifecycle = { ...script, event: 'onPanelReady',
    source: `function onPanelReady() { log('approved-preview-ready'); }` };
  panels.set([{ ...panel, scripts: [lifecycle] }]);
  previewModeEnabled.set(true);
  await setTimeout(20);
  assert.equal(get(scriptTrace).some(t => t.message.includes('approved-preview-ready')), false);
  approveCurrentPanelScripts();
  await setTimeout(20);
  assert.ok(get(scriptTrace).some(t => t.message.includes('approved-preview-ready')));
  previewModeEnabled.set(false);
  const python = { ...script, language: 'python', source: 'print("requires-native-opt-in")' };
  panels.set([{ ...panel, scripts: [python] }]);
  approveCurrentPanelScripts();
  assert.equal(ensurePanelExecutionApproved(), false, 'ordinary approval never grants Python authority');
  approveCurrentPanelScripts(undefined, { allowNative: true });
  assert.equal(ensurePanelExecutionApproved(), true);
  panels.set([{ ...panel, scripts: [{ ...python, source: python.source + '\n# edited' }] }]);
  assert.equal(ensurePanelExecutionApproved(), false, 'edits revoke native approval too');
  const native = { ...script, language: 'cpp', source: 'void onClick() {}' };
  panels.set([{ ...panel, scripts: [native] }]);
  approveCurrentPanelScripts();
  assert.equal(ensurePanelExecutionApproved(), true, 'interpreted C++ preview needs ordinary approval');
  assert.equal(ensurePanelExecutionApproved(null, true), false, 'compiled export needs native approval');
  panels.set([]); activePanelId.set(null);
});
