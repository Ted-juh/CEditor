import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { SCRIPT_TARGETS, portabilityForScript } from '../src/CE_Application/scripting/scriptCommandRegistry.js';
import { deserializeScriptWorkspaceDocument, serializeScriptWorkspaceDocument } from '../src/CE_Application/scripting/scriptDocumentModel.js';
import { createDebugSession } from '../src/CE_Application/scripting/scriptDebugger.js';
import { emitScript, exportWarningsForScript } from '../src/CE_Application/scripting/scriptEmitters.js';
import { compilePanelScripts } from '../src/CE_Application/scripting/scriptPanelExport.js';
import { validateScriptForProject } from '../src/CE_Application/scripting/scriptProjectValidation.js';
import { runPanelPreviewScriptsForPatch } from '../src/CE_Application/scripting/scriptBindings.js';
import { createMacroRoutingScript, createScriptDocument } from '../src/CE_Application/scripting/scriptSamples.js';
import { createScriptContext, executeScript, validateScript } from '../src/CE_Application/scripting/scriptRuntime.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { activeEditorTab, activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';

test('macro routing command graph produces preview patches and queued MIDI', () => {
  const script = createMacroRoutingScript();
  const result = executeScript(script, createScriptContext({ event: { value: 0.72, phase: 'preview' } }));

  assert.equal(result.patches.length, 2);
  assert.equal(result.patches[0].target, 'cutoff.value');
  assert.equal(Math.round(result.patches[0].value), 8662);
  assert.equal(result.patches[1].target, 'resonance.value');
  assert.equal(Math.round(result.patches[1].value * 100) / 100, 0.64);
  assert.equal(result.deviceMessages.length, 1);
  assert.equal(result.deviceMessages[0].queued, true);
  assert.equal(result.deviceMessages[0].value, 91);
});

test('script validation catches unknown commands', () => {
  const issues = validateScript({
    id: 'bad',
    event: 'onValueChanged',
    target: 'x',
    steps: [{ id: 'bad-step', command: 'teleport', args: {} }],
  });

  assert.equal(issues.some((issue) => issue.level === 'error'), true);
});

test('all registered export targets emit non-empty source views', () => {
  const script = createMacroRoutingScript();
  for (const target of SCRIPT_TARGETS) {
    const output = emitScript(script, target.id);
    assert.equal(typeof output, 'string');
    assert.equal(output.length > 12, true, target.id);
  }
});

test('native exporters use target language event and runtime conventions', () => {
  const script = createMacroRoutingScript();
  const csharp = emitScript(script, 'csharp');
  const go = emitScript(script, 'go');
  const rust = emitScript(script, 'rust');
  const cpp = emitScript(script, 'cpp');
  const kotlin = emitScript(script, 'kotlin');
  const swift = emitScript(script, 'swift');

  assert.match(csharp, /CeEvent evt/);
  assert.match(csharp, /evt\.Value/);
  assert.doesNotMatch(csharp, /event\.value/);
  assert.match(go, /func OnControlChanged\(event ce\.Event\)/);
  assert.match(go, /_ = event\.Value/);
  assert.match(go, /math\.Round/);
  assert.match(rust, /ctx\.set_value/);
  assert.match(rust, /ctx\.midi\(\)\.send_cc/);
  assert.match(rust, /127\.0/);
  assert.match(cpp, /CeContext& ctx, const CeEvent& event/);
  assert.match(cpp, /ctx\.setValue/);
  assert.match(kotlin, /fun onControlChanged\(event: CeEvent\)/);
  assert.match(kotlin, /127\.0/);
  assert.match(swift, /func onControlChanged\(_ event: CeEvent\)/);
  assert.match(swift, /127\.0/);
});

test('sample document includes portable and device-specific scripts', () => {
  const document = createScriptDocument({ id: 'doc_test' });
  const macro = document.scripts.find((script) => script.id === 'macroRouting');
  const sysex = document.scripts.find((script) => script.id === 'sendCutoffSysex');

  assert.equal(portabilityForScript(macro).exportSafe, true);
  assert.equal(portabilityForScript(sysex).portable, false);
  assert.equal(exportWarningsForScript(sysex).length > 0, true);
});

test('script guardrails block raw code by default', () => {
  const result = executeScript({
    id: 'raw',
    event: 'manual',
    target: 'developer',
    rawLanguage: 'javascript',
    steps: [{ id: 'log', command: 'log', args: { message: 'raw' } }],
  });

  assert.equal(result.blocked[0].reason, 'raw-code-disabled');
});

test('panel serialization preserves attached scripts', () => {
  const panel = createPanel('Scripted Panel');
  panel.scripts = [createMacroRoutingScript()];
  const restored = deserializePanel(serializePanel(panel), '', 'Restored Scripted Panel');

  assert.equal(restored.scripts.length, 1);
  assert.equal(restored.scripts[0].id, 'macroRouting');
});

test('panel preview script binding applies script patches to target preview sessions', () => {
  const source = { _children: { Core: { id: 'macro', name: 'Macro', controlType: 'Slider' }, Scripts: { _type: 'Scripts', enabled: true, runInPreview: true, scripts: [] } } };
  const target = { _children: { Core: { id: 'cutoff', name: 'Cutoff', controlType: 'Slider' }, Scripts: { _type: 'Scripts', enabled: true, runInPreview: true, scripts: [] } } };
  const panel = createPanel('Preview Script Panel');
  panel.controls = [source, target];
  panel.scripts = [{
    id: 'macroToCutoff',
    name: 'macroToCutoff',
    event: 'onValueChanged',
    target: 'macro',
    enabled: true,
    steps: [
      { id: 'set-cutoff', command: 'setValue', args: { target: 'cutoff.value', value: { op: 'scale', args: [{ ref: 'event.value' }, 0, 1, 80, 12000] } } },
    ],
  }];

  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  panelPreviewSessions.set({});

  runPanelPreviewScriptsForPatch({
    panel,
    controls: panel.controls,
    sourceControl: source,
    patch: { valueOverride: 0.5 },
  });

  const targetSession = get(panelPreviewSessions).cutoff;
  assert.equal(targetSession.valueOverrideEnabled, true);
  assert.equal(targetSession.valueOverride, 6040);
});

test('script workspace documents serialize and restore with file metadata', () => {
  const document = createScriptDocument({ id: 'doc_serialized', name: 'Serial Test' });
  const text = serializeScriptWorkspaceDocument(document);
  const restored = deserializeScriptWorkspaceDocument(text, 'C:/tmp/serial.cescript.json', 'Serial File');

  assert.equal(restored.filePath, 'C:/tmp/serial.cescript.json');
  assert.equal(restored.name, 'Serial Test');
  assert.equal(restored.scripts.some((script) => script.id === 'macroRouting'), true);
  assert.equal(restored.modified, false);
});

test('project validation catches dead targets, unsafe raw code, and MIDI range errors', () => {
  const panel = createPanel('Validation Panel');
  panel.controls = [
    { _children: { Core: { id: 'macro', name: 'Macro', controlType: 'Slider' } } },
  ];
  const issues = validateScriptForProject({
    id: 'problem',
    event: 'onValueChanged',
    target: 'missing',
    rawLanguage: 'javascript',
    scope: 'panel',
    steps: [
      { id: 'dead', command: 'setValue', args: { target: 'ghost.value', value: { ref: 'event.value' } } },
      { id: 'cc', command: 'sendCC', args: { channel: 99, cc: 200, value: 1 } },
      { id: 'sysex', command: 'sendSysex', args: { bytes: [0xF0, 0x300, 0xF7] } },
    ],
  }, { panel });

  assert.equal(issues.some((issue) => issue.code === 'dead-target'), true);
  assert.equal(issues.some((issue) => issue.code === 'raw-code-blocked'), true);
  assert.equal(issues.some((issue) => issue.code === 'invalid-midi-channel'), true);
  assert.equal(issues.some((issue) => issue.code === 'invalid-byte'), true);
});

test('project validation keeps sample workspace targets out of real-error grouping', () => {
  const issues = validateScriptForProject(createMacroRoutingScript(), { panel: null });
  assert.equal(issues.some((issue) => issue.code === 'dead-target'), false);
});

test('debugger session pauses at breakpoints and reports why skipped scripts did not run', () => {
  const script = createMacroRoutingScript();
  script.debug = { breakpoints: ['macro-resonance'], watchPaths: ['event.value'] };
  const session = createDebugSession(script, createScriptContext({
    event: { name: 'onControlChanged', target: 'macroControl', value: 0.5 },
  }));

  assert.equal(session.paused, true);
  assert.equal(session.pausedAt, 'macro-resonance');
  assert.equal(session.frames.length, 2);
  assert.equal(session.watches[0].value, 0.5);

  const skipped = createDebugSession({ ...script, enabled: false }, createScriptContext());
  assert.match(skipped.reasonNotRun, /disabled/i);
});

test('panel script export compiles panel and control attachments with validation', () => {
  const panel = createPanel('Export Panel');
  panel.controls = [{
    _children: {
      Core: { id: 'macro', name: 'Macro', controlType: 'Slider' },
      Scripts: {
        _type: 'Scripts',
        enabled: true,
        scripts: [{
          id: 'controlScript',
          name: 'controlScript',
          event: 'onValueChanged',
          target: 'macro',
          steps: [{ id: 'log', command: 'log', args: { message: 'ok' } }],
        }],
      },
    },
  }];
  panel.scripts = [createMacroRoutingScript()];

  const compiled = compilePanelScripts(panel, 'typescript');
  assert.equal(compiled.scripts.length, 2);
  assert.equal(compiled.scripts.every((file) => file.code.length > 20), true);
  assert.equal(compiled.target, 'typescript');
});

test('runtime handles richer command library actions', () => {
  const result = executeScript({
    id: 'rich',
    event: 'onValueChanged',
    target: 'macro',
    scope: 'panel',
    steps: [
      { id: 'route', command: 'routeValue', args: { from: 'event.value', to: 'cutoff.value', transform: { op: 'scale', args: [{ ref: 'event.value' }, 0, 1, 0, 100] } } },
      { id: 'visible', command: 'setVisible', args: { target: 'advancedGroup', visible: false } },
      { id: 'state', command: 'setPanelState', args: { state: 'advanced' } },
      { id: 'timer', command: 'startTimer', args: { id: 'blink', ms: 120 } },
      { id: 'event', command: 'emitEvent', args: { event: 'onCustomEvent', target: 'macro', value: { ref: 'event.value' } } },
      { id: 'nrpn', command: 'sendNRPN', args: { channel: 1, parameterMsb: 1, parameterLsb: 2, value: 1024 } },
    ],
  }, createScriptContext({ event: { name: 'onValueChanged', target: 'macro', value: 0.25 } }));

  assert.equal(result.patches.some((patch) => patch.target === 'cutoff.value' && patch.value === 25), true);
  assert.equal(result.patches.some((patch) => patch.target === 'advancedGroup.visible' && patch.value === false), true);
  assert.equal(result.timers[0].id, 'blink');
  assert.equal(result.events[0].name, 'onCustomEvent');
  assert.equal(result.deviceMessages[0].type, 'nrpn');
});
