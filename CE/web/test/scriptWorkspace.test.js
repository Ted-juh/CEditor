import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { SCRIPT_TARGETS, portabilityForScript } from '../src/CE_Application/scripting/scriptCommandRegistry.js';
import { deserializeScriptWorkspaceDocument, normalizeScriptWorkspaceMode, serializeScriptWorkspaceDocument } from '../src/CE_Application/scripting/scriptDocumentModel.js';
import { createDebugSession } from '../src/CE_Application/scripting/scriptDebugger.js';
import { emitScript, exportWarningsForScript } from '../src/CE_Application/scripting/scriptEmitters.js';
import { compilePanelScripts } from '../src/CE_Application/scripting/scriptPanelExport.js';
import { validateScriptForProject } from '../src/CE_Application/scripting/scriptProjectValidation.js';
import { runPanelPreviewScriptsForPatch } from '../src/CE_Application/scripting/scriptBindings.js';
import { createMacroRoutingScript, createScriptDocument } from '../src/CE_Application/scripting/scriptSamples.js';
import { createScriptContext, executeScript, validateScript } from '../src/CE_Application/scripting/scriptRuntime.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { activeEditorTab, activePanel, activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import {
  latestMidiPreview,
  latestDeviceSyncResult,
  latestPresetListScan,
  latestBulkDumpSend,
  latestDumpCollectionResult,
  latestDumpParseResult,
  latestProfileSourceValidation,
  latestProfileTestResult,
  mapDeviceRole,
  parseProfileDump,
  previewParameterMessage,
  runTestsForProfile,
  selectedSyncDirection,
  selectedMidiInputId,
  startDeviceSync,
  startPresetListScan,
  startBulkDumpSend,
  cancelBulkDumpSend,
  collectProfileDumps,
  validateProfileSource,
  restoreProjectDeviceSession,
  deviceDiagnostics,
  deviceRuntimeConflicts,
  deviceRoleMappings,
  latestDeviceIdentityMismatch,
  latestDeviceIdentityOverride,
  overrideDeviceIdentityMismatch,
  recordDeviceRuntimeConflictForTest,
  clearDeviceRuntimeConflict,
} from '../src/CE_Application/stores/deviceProfiles.js';
import { normalizeDeviceSession } from '../src/CE_Application/stores/appSettingsSchema.js';
import {
  createProjectDeviceSessionSnapshot,
  projectDeviceSessionDiagnostics,
} from '../src/CE_Application/stores/projectDeviceSession.js';

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

test('device script can request profile-defined bulk dump jobs', () => {
  const script = {
    id: 'sh201Bulk',
    event: 'onClick',
    target: 'requestButton',
    scope: 'device',
    steps: [{
      id: 'rq1',
      command: 'requestDeviceDump',
      args: {
        profileId: 'roland-sh-201',
        deviceRole: 'mainSynth',
        request: 'requestTemporaryPatchBulk',
        phase: 'commit',
      },
    }],
  };
  const result = executeScript(script, createScriptContext({
    event: { name: 'onClick', phase: 'commit' },
    device: { profileId: 'roland-sh-201', role: 'mainSynth' },
  }));

  assert.equal(result.deviceMessages.length, 1);
  assert.equal(result.deviceMessages[0].type, 'deviceRequest');
  assert.equal(result.deviceMessages[0].profileId, 'roland-sh-201');
  assert.equal(result.deviceMessages[0].request, 'requestTemporaryPatchBulk');
  assert.match(emitScript(script, 'ce'), /requestTemporaryPatchBulk/);
  assert.match(emitScript(script, 'javascript'), /requestDeviceDump/);
  assert.equal(portabilityForScript(script).portable, false);
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

test('top-level conditions and if command gate runtime steps', () => {
  const falseCondition = executeScript({
    id: 'skip',
    event: 'onValueChanged',
    target: 'macro',
    condition: 'false',
    steps: [{ id: 'patch', command: 'setValue', args: { target: 'cutoff.value', value: 1 } }],
  }, createScriptContext());

  assert.equal(falseCondition.patches.length, 0);
  assert.equal(falseCondition.trace.some((entry) => entry.type === 'SKIP'), true);

  const falseIf = executeScript({
    id: 'ifSkip',
    event: 'onValueChanged',
    target: 'macro',
    steps: [
      { id: 'if', command: 'if', args: { condition: { op: '>', args: [{ ref: 'event.value' }, 0.9] } } },
      { id: 'patch', command: 'setValue', args: { target: 'cutoff.value', value: 1 } },
    ],
  }, createScriptContext({ event: { value: 0.5 } }));

  assert.equal(falseIf.patches.length, 0);
  assert.equal(falseIf.trace.some((entry) => entry.type === 'IF'), true);
});

test('panel serialization preserves attached scripts', () => {
  const panel = createPanel('Scripted Panel');
  panel.scripts = [createMacroRoutingScript()];
  const restored = deserializePanel(serializePanel(panel), '', 'Restored Scripted Panel');

  assert.equal(restored.scripts.length, 1);
  assert.equal(restored.scripts[0].id, 'macroRouting');
});

test('script workspace keeps the last active panel while script tab is focused', () => {
  const panel = createPanel('Context Panel');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'script', id: 'script_doc' });

  assert.equal(get(activePanel)?.id, panel.id);
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

test('script workspace migrates legacy diehard mode to expert mode', () => {
  assert.equal(normalizeScriptWorkspaceMode('diehard'), 'expert');

  const restored = deserializeScriptWorkspaceDocument({
    kind: 'ceditor.scriptWorkspace',
    name: 'Legacy Expert Workspace',
    mode: 'diehard',
    scripts: [createMacroRoutingScript()],
  });

  assert.equal(restored.mode, 'expert');
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

test('project validation accepts active device profile parameter targets', () => {
  const panel = createPanel('Device Validation Panel');
  panel.controls = [
    { _children: { Core: { id: 'macro', name: 'Macro', controlType: 'Slider' } } },
  ];
  const issues = validateScriptForProject({
    id: 'device',
    event: 'onParameterCommitted',
    target: 'cutoff',
    scope: 'device',
    steps: [{ id: 'sysex', command: 'sendSysex', args: { bytes: [0xf0, 0x7d, 0xf7] } }],
  }, {
    panel,
    deviceProfile: { parameters: [{ id: 'filter.cutoff' }] },
  });

  assert.equal(issues.some((issue) => issue.code === 'dead-target'), false);
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

test('Lua exporter emits valid operational code for richer command graphs', () => {
  const script = {
    id: 'luaRich',
    event: 'onChanged',
    target: 'toggle',
    steps: [
      { command: 'routeValue', args: { from: 'macro.value', to: 'custom.cutoff', transform: { op: 'curve', args: [{ ref: 'event.value' }], from: 0.1, to: 0.95, shape: 'sqrt' } } },
      { command: 'setPartColor', args: { part: 'custom.ring', color: '#22CC88' } },
      { command: 'setAnimation', args: { target: 'custom', animation: 'pulse', enabled: true } },
      { command: 'startTimer', args: { id: 'debounce', ms: 120 } },
      { command: 'emitEvent', args: { event: 'settled', target: 'custom', value: { ref: 'event.value' } } },
      { command: 'log', args: { message: 'done', value: { ref: 'event.value' } } },
    ],
  };

  const lua = emitScript(script, 'lua');
  assert.match(lua, /curve\(event\.value, 0\.1, 0\.95, "sqrt"\)/);
  assert.match(lua, /setPartColor\("custom\.ring", "#22CC88"\)/);
  assert.match(lua, /startTimer\("debounce", 120\)/);
  assert.doesNotMatch(lua, /^\s*-- /m);
});

test('export warnings are deduplicated by message', () => {
  const warnings = exportWarningsForScript({
    id: 'repeatLog',
    event: 'manual',
    target: 'panel',
    steps: [
      { command: 'log', args: { message: 'one' } },
      { command: 'log', args: { message: 'two' } },
      { command: 'log', args: { message: 'three' } },
    ],
  });

  assert.deepEqual(warnings, ['log is runtime-only and may not export cleanly.']);
});

test('local device profile source can validate, preview, and run tests without native bridge', () => {
  const profileId = 'local-script-test-profile';
  const source = JSON.stringify({
    id: profileId,
    name: 'Local Script Test',
    variables: { channel: 1, deviceId: 16 },
    identity: {
      requestDeviceId: '$deviceId',
      manufacturerId: ['7D'],
      familyCode: ['00', '01'],
      modelNumber: ['00', '02'],
      revision: ['00', '00', '00', '01'],
    },
    parameters: [{
      id: 'filter.cutoff',
      name: 'Filter Cutoff',
      type: 'integer',
      range: { min: 0, max: 127 },
      default: 64,
      encoding: { type: 'u7' },
      messageRecipe: 'ccFilterCutoff',
      sendPolicy: { mode: 'continuous' },
      access: { realtimeSafe: true },
    }, {
      id: 'osc.waveform',
      name: 'Waveform',
      type: 'choice',
      choices: [
        { id: 'saw', label: 'Saw', value: 1 },
        { id: 'triangle', label: 'Triangle', value: 2 },
      ],
      encoding: { type: 'enum' },
      access: { canRead: true, canWrite: false, dumpReadable: true },
    }, {
      id: 'preset.name',
      name: 'Preset Name',
      type: 'text',
      default: '',
      encoding: { type: 'text-ascii', length: 7, pad: 32 },
      access: { canRead: true, canWrite: false, dumpReadable: true },
    }, {
      id: 'preset.packedName',
      name: 'Packed Preset Name',
      type: 'text',
      default: '',
      encoding: { type: 'text-nibbled-ascii', length: 3, pad: 32 },
      access: { canRead: true, canWrite: false, dumpReadable: true },
    }],
    messageRecipes: [{ id: 'ccFilterCutoff', kind: 'cc', channel: '$channel', controller: 74, value: '$encodedValue' }],
    requests: [{
      id: 'requestCurrentPatchDump',
      name: 'Request Current Patch Dump',
      kind: 'sysex',
      template: ['F0', '7D', '$deviceId', '00', '01', 'F7'],
      response: { dump: 'currentPatchDump' },
    }, {
      id: 'requestPresetName',
      name: 'Request Preset Name',
      kind: 'sysex',
      template: ['F0', '7D', '$deviceId', '02', '$slot', 'F7'],
    }],
    startup: { policy: 'pull', sync: [{ request: 'requestCurrentPatchDump' }] },
    presetBrowser: { request: 'requestPresetName', slotVariable: 'slot', slots: [1, 3] },
    dumpDefinitions: [{
      id: 'currentPatchDump',
      name: 'Current Patch Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '01'], suffix: ['F7'] },
      payload: { offset: 4 },
      completion: { expectedMessages: 1, expectedBytes: 6 },
      mappings: [
        { parameter: 'filter.cutoff', offset: 0 },
      ],
    }, {
      id: 'presetNameDump',
      name: 'Preset Name Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '03'], suffix: ['F7'] },
      payload: { offset: 4, size: 8 },
      completion: {
        expectedMessages: 1,
        expectedBytes: 13,
        byteRanges: [
          { label: 'slot', offset: 4, length: 1 },
          { label: 'name', offset: 5, length: 7, codec: 'text-ascii' },
        ],
      },
      mappings: [
        { parameter: 'preset.name', offset: 1, codec: { type: 'text-ascii', length: 7, pad: 32 } },
      ],
    }, {
      id: 'packedPresetNameDump',
      name: 'Packed Preset Name Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '04'], suffix: ['F7'] },
      payload: { offset: 4, size: 6 },
      completion: { expectedMessages: 1, expectedBytes: 11 },
      mappings: [
        { parameter: 'preset.packedName', offset: 0, codec: { type: 'text-nibbled-ascii', length: 3, pad: 32 } },
      ],
    }, {
      id: 'unsupportedNameDump',
      name: 'Unsupported Name Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '05'], suffix: ['F7'] },
      payload: { offset: 4, size: 2 },
      completion: { expectedMessages: 1, expectedBytes: 7 },
      mappings: [
        { parameter: 'preset.name', offset: 0, codec: { type: 'unsupported-name-codec', length: 2 } },
      ],
    }, {
      id: 'splitPatchCutoffDump',
      name: 'Split Patch Cutoff Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '06', '00'], suffix: ['F7'] },
      payload: { offset: 5, size: 1 },
      completion: {
        collectionId: 'splitPatchDump',
        expectedMessages: 2,
        expectedBytes: 7,
        collectionBytes: 2,
        addressRange: { label: 'cutoff', start: 0, length: 1 },
      },
      mappings: [
        { parameter: 'filter.cutoff', offset: 0 },
      ],
    }, {
      id: 'splitPatchWaveformDump',
      name: 'Split Patch Waveform Dump',
      kind: 'sysex',
      matcher: { prefix: ['F0', '7D', '$deviceId', '06', '01'], suffix: ['F7'] },
      payload: { offset: 5, size: 1 },
      completion: {
        collectionId: 'splitPatchDump',
        expectedMessages: 2,
        expectedBytes: 7,
        collectionBytes: 2,
        addressRange: { label: 'waveform', start: 1, length: 1 },
      },
      mappings: [
        { parameter: 'osc.waveform', offset: 0 },
      ],
    }],
    tests: [
      { name: 'Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 10 06 01 F7' },
      {
        name: 'Identity Reply',
        kind: 'identityReply',
        inputHex: 'F0 7E 10 06 02 7D 00 01 00 02 00 00 00 01 F7',
        expectedValues: {
          'identity.deviceId': '10',
          'identity.manufacturerId': '7D',
          'identity.familyCode': '00 01',
          'identity.modelNumber': '00 02',
          'identity.revision': '00 00 00 01',
        },
      },
      { name: 'Filter Cutoff 64', parameter: 'filter.cutoff', value: 64, expectedHex: 'B0 4A 40' },
      { name: 'Request Current Patch Dump', kind: 'request', request: 'requestCurrentPatchDump', expectedHex: 'F0 7D 10 00 01 F7' },
      { name: 'Request Preset Name 3', kind: 'request', request: 'requestPresetName', variables: { slot: 3 }, expectedHex: 'F0 7D 10 02 03 F7' },
      {
        name: 'Parse Preset Name Dump',
        kind: 'dumpParse',
        inputHex: 'F0 7D 10 03 03 50 61 64 20 30 30 33 F7',
        expectedValues: { 'preset.name': 'Pad 003' },
      },
      {
        name: 'Parse Packed Preset Name Dump',
        kind: 'dumpParse',
        inputHex: 'F0 7D 10 04 05 00 06 01 06 04 F7',
        expectedValues: { 'preset.packedName': 'Pad' },
      },
    ],
  });

  validateProfileSource(profileId, source);
  assert.equal(get(latestProfileSourceValidation).ok, true);

  previewParameterMessage({
    requestId: 'local-preview',
    profileId,
    parameterId: 'filter.cutoff',
    value: 64,
    source,
  });
  assert.equal(get(latestMidiPreview).transaction.hex, 'B0 4A 40');

  runTestsForProfile(profileId, { source });
  assert.equal(get(latestProfileTestResult).passed, 7);
  assert.equal(get(latestProfileTestResult).results[0].actualHex, 'F0 7E 10 06 01 F7');
  assert.equal(get(latestProfileTestResult).results[1].actualValues['identity.modelNumber'], '00 02');
  assert.equal(get(latestProfileTestResult).results[2].actualHex, 'B0 4A 40');
  assert.equal(get(latestProfileTestResult).results[3].actualHex, 'F0 7D 10 00 01 F7');
  assert.equal(get(latestProfileTestResult).results[4].actualHex, 'F0 7D 10 02 03 F7');
  assert.equal(get(latestProfileTestResult).results[5].actualValues['preset.name'], 'Pad 003');
  assert.equal(get(latestProfileTestResult).results[6].actualValues['preset.packedName'], 'Pad');

  parseProfileDump({
    requestId: 'local-parse-partial',
    profileId,
    source,
    hex: 'F0 7D 10 03 03 50 61 F7',
  });
  assert.equal(get(latestDumpParseResult).matchStatus, 'partial');
  assert.equal(get(latestDumpParseResult).expectedBytes, 13);
  assert.equal(get(latestDumpParseResult).receivedBytes, 8);

  parseProfileDump({
    requestId: 'local-parse-unsupported',
    profileId,
    source,
    hex: 'F0 7D 10 05 41 42 F7',
  });
  assert.equal(get(latestDumpParseResult).matchStatus, 'unsupportedCodec');

  collectProfileDumps({
    requestId: 'local-collection-partial',
    profileId,
    source,
    hexMessages: ['F0 7D 10 06 00 40 F7'],
  });
  assert.equal(get(latestDumpCollectionResult).status, 'partial');
  assert.equal(get(latestDumpCollectionResult).expectedMessageCount, 2);
  assert.equal(get(latestDumpCollectionResult).receivedBytes, 1);
  assert.equal(get(latestDumpCollectionResult).missingRanges[0].start, 1);

  collectProfileDumps({
    requestId: 'local-collection-complete',
    profileId,
    source,
    hexMessages: ['F0 7D 10 06 00 40 F7', 'F0 7D 10 06 01 02 F7'],
  });
  assert.equal(get(latestDumpCollectionResult).status, 'complete');
  assert.equal(get(latestDumpCollectionResult).values['filter.cutoff'], 64);
  assert.equal(get(latestDumpCollectionResult).values['osc.waveform'], 'triangle');

  startDeviceSync({ profileId, source, dryRun: true, correlationId: 'local-sync' });
  assert.equal(get(latestDeviceSyncResult).transaction.hex, 'F0 7D 10 00 01 F7');
  assert.equal(get(latestDeviceSyncResult).expectedDumpId, 'currentPatchDump');

  startDeviceSync({
    profileId,
    source,
    dryRun: true,
    correlationId: 'local-push',
    syncDirection: 'push',
    values: { 'filter.cutoff': 64 },
  });
  assert.equal(get(latestDeviceSyncResult).syncDirection, 'push');
  assert.equal(get(latestDeviceSyncResult).transactions[0].hex, 'B0 4A 40');

  startPresetListScan({ profileId, source, dryRun: true });
  assert.equal(get(latestPresetListScan).total, 2);
  assert.deepEqual(get(latestPresetListScan).entries.map((entry) => entry.requestHex), [
    'F0 7D 10 02 01 F7',
    'F0 7D 10 02 03 F7',
  ]);
});

test('local bulk dump send preview chunks and cancels queued jobs', () => {
  startBulkDumpSend({
    bulkSendId: 'local-bulk-preview',
    deviceRole: 'mainSynth',
    profileId: 'test-cc-synth',
    hex: 'F0 7D 10 01 02 03 F7',
    chunkSizeBytes: 3,
    chunkDelayMs: 9,
    expectedCollectionId: 'splitPatchDump',
    ackHex: 'F0 7D 10 7E 01 F7',
    nakHex: 'F0 7D 10 7E 00 F7',
    retries: 1,
    dryRun: true,
  });

  const preview = get(latestBulkDumpSend);
  assert.equal(preview.status, 'preview');
  assert.equal(preview.totalChunks, 3);
  assert.equal(preview.chunkDelayMs, 9);
  assert.equal(preview.expectedCollectionId, 'splitPatchDump');
  assert.equal(preview.verificationStatus, 'waiting');
  assert.equal(preview.ackStatus, 'waiting');
  assert.equal(preview.retriesRemaining, 1);
  assert.deepEqual(preview.chunks.map((chunk) => chunk.hex), [
    'F0 7D 10',
    '01 02 03',
    'F7',
  ]);

  startBulkDumpSend({
    bulkSendId: 'local-bulk-cancel',
    deviceRole: 'mainSynth',
    profileId: 'test-cc-synth',
    hex: 'F0 7D 10 01 02 03 F7',
    chunkSizeBytes: 4,
    dryRun: false,
  });
  assert.equal(get(latestBulkDumpSend).status, 'running');

  cancelBulkDumpSend({ bulkSendId: 'local-bulk-cancel' });
  const cancelled = get(latestBulkDumpSend);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.chunks.every((chunk) => chunk.status === 'cancelled'), true);
});

test('device session settings preserve MIDI input mappings', () => {
  const session = normalizeDeviceSession({
    selectedProfileId: 'test-sysex-synth',
    selectedDestinationId: 'out-1',
    selectedInputId: 'in-1',
    roleMappings: {
      mainSynth: {
        role: 'mainSynth',
        profileId: 'test-sysex-synth',
        midiDestination: { type: 'hardwareOutput', id: 'out-1', name: 'Synth Out' },
        midiInput: { type: 'hardwareInput', id: 'in-1', name: 'Synth In' },
        syncDirection: 'live',
      },
    },
  });

  assert.equal(session.selectedInputId, 'in-1');
  assert.equal(session.selectedSyncDirection, 'live');
  assert.equal(session.roleMappings.mainSynth.midiInput.type, 'hardwareInput');
  assert.equal(session.roleMappings.mainSynth.midiInput.name, 'Synth In');
  assert.equal(session.roleMappings.mainSynth.syncDirection, 'live');
});

test('identity overrides and live conflict state surface for the device tab', () => {
  latestDeviceIdentityMismatch.set({
    deviceRole: 'mainSynth',
    profileId: 'test-sysex-synth',
    error: 'Identity modelNumber mismatch',
  });

  overrideDeviceIdentityMismatch({
    deviceRole: 'mainSynth',
    profileId: 'test-sysex-synth',
    reason: 'test accepted mismatch',
  });

  assert.equal(get(latestDeviceIdentityMismatch), null);
  assert.equal(get(latestDeviceIdentityOverride).identityStatus, 'overridden');

  const recorded = recordDeviceRuntimeConflictForTest('mainSynth', 'filter.cutoff', 64, 65);
  assert.equal(recorded, true);
  assert.equal(get(deviceRuntimeConflicts).mainSynth['filter.cutoff'].panelValue, 64);
  assert.equal(get(deviceRuntimeConflicts).mainSynth['filter.cutoff'].deviceValue, 65);

  clearDeviceRuntimeConflict('mainSynth', 'filter.cutoff');
  assert.equal(get(deviceRuntimeConflicts).mainSynth['filter.cutoff'], undefined);
});

test('panel documents serialize portable project device session mappings', () => {
  const panel = createPanel('Portable Device Panel');
  const session = createProjectDeviceSessionSnapshot({
    selectedProfileId: 'test-sysex-synth',
    selectedDestinationId: 'out-1',
    selectedInputId: 'in-1',
    selectedSyncDirection: 'live',
    roleMappings: {
      mainSynth: {
        role: 'mainSynth',
        profileId: 'test-sysex-synth',
        midiDestination: { type: 'hardwareOutput', id: 'out-1', name: 'Synth Out' },
        midiInput: { type: 'hardwareInput', id: 'in-1', name: 'Synth In' },
        syncDirection: 'live',
        variables: { deviceId: 16 },
        timingOverrides: { minDelayBetweenMessagesMs: 25 },
      },
    },
  });

  const text = serializePanel(panel, { deviceSession: session });
  const raw = JSON.parse(text);
  const restored = deserializePanel(text, 'C:/tmp/portable.ceditor', 'Portable Device Panel');

  assert.equal(raw.deviceSession.schemaVersion, 1);
  assert.equal(raw.deviceSession.roleMappings.mainSynth.midiInput.name, 'Synth In');
  assert.equal(raw.deviceSession.roleMappings.mainSynth.syncDirection, 'live');
  assert.equal(raw.deviceSession.roleMappings.mainSynth.variables.deviceId, 16);
  assert.equal(restored.deviceSession.selectedSyncDirection, 'live');
  assert.equal(restored.deviceSession.roleMappings.mainSynth.midiDestination.id, 'out-1');
  assert.equal(restored.deviceSession.roleMappings.mainSynth.timingOverrides.minDelayBetweenMessagesMs, 25);
});

test('project device session diagnostics report missing portable resources', () => {
  const session = createProjectDeviceSessionSnapshot({
    roleMappings: {
      mainSynth: {
        role: 'mainSynth',
        profileId: 'missing-synth',
        midiDestination: { type: 'hardwareOutput', id: 'out-missing', name: 'Missing Out' },
        midiInput: { type: 'hardwareInput', id: 'in-missing', name: 'Missing In' },
        syncDirection: 'pull',
      },
    },
  });

  const diagnostics = projectDeviceSessionDiagnostics(session, {
    profiles: [{ id: 'test-cc-synth' }],
    midiDestinations: [{ type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }],
    midiInputs: [{ type: 'none', id: 'none', name: 'No MIDI Input' }],
  });

  assert.equal(diagnostics.ok, false);
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'missing-profile'), true);
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'missing-midi-destination'), true);
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'missing-midi-input'), true);
});

test('restoring a project device session applies role mappings locally', () => {
  const session = createProjectDeviceSessionSnapshot({
    selectedProfileId: 'test-cc-synth',
    selectedDestinationId: 'portable-out',
    selectedInputId: 'portable-in',
    selectedSyncDirection: 'push',
    roleMappings: {
      mainSynth: {
        role: 'mainSynth',
        profileId: 'test-cc-synth',
        midiDestination: { type: 'hardwareOutput', id: 'portable-out', name: 'Portable Out' },
        midiInput: { type: 'hardwareInput', id: 'portable-in', name: 'Portable In' },
        syncDirection: 'push',
      },
    },
  });

  const result = restoreProjectDeviceSession(session, { source: 'test' });

  assert.equal(result.deviceSession.selectedInputId, 'portable-in');
  assert.equal(get(selectedMidiInputId), 'portable-in');
  assert.equal(get(selectedSyncDirection), 'push');
  assert.equal(get(deviceRoleMappings).mainSynth.midiDestination.name, 'Portable Out');
  assert.equal(get(deviceRoleMappings).mainSynth.midiInput.name, 'Portable In');
  assert.equal(get(deviceDiagnostics).issues.some((issue) => issue.projectDeviceSession === true), true);
});

test('device role mapping tracks selected MIDI input locally', () => {
  mapDeviceRole('mainSynth', 'test-cc-synth', {
    midiDestination: { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' },
    midiInput: { type: 'hardwareInput', id: 'virtual-in', name: 'Virtual In' },
    syncDirection: 'push',
  });

  assert.equal(get(selectedMidiInputId), 'virtual-in');
  assert.equal(get(selectedSyncDirection), 'push');
  assert.equal(get(deviceRoleMappings).mainSynth.midiInput.name, 'Virtual In');
  assert.equal(get(deviceRoleMappings).mainSynth.syncDirection, 'push');
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
