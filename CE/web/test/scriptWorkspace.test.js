import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  createScriptDocument,
  deserializeScriptWorkspaceDocument,
  serializeScriptWorkspaceDocument,
} from '../src/CE_Application/scripting/scriptDocumentModel.js';
import { createScript } from '../src/CE_Application/scripting/scriptModel.js';
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

test('panel serialization preserves attached scripts', () => {
  const panel = createPanel('Scripted Panel');
  panel.scripts = [createScript({
    id: 'macroRouting',
    language: 'lua',
    event: 'onValueChanged',
    source: 'function onValueChanged(value)\n  set("cutoff.value", value)\nend\n',
  })];
  const restored = deserializePanel(serializePanel(panel), '', 'Restored Scripted Panel');

  assert.equal(restored.scripts.length, 1);
  assert.equal(restored.scripts[0].id, 'macroRouting');
  assert.match(restored.scripts[0].source, /function onValueChanged/);
});

test('script workspace keeps the last active panel while script tab is focused', () => {
  const panel = createPanel('Context Panel');
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'script', id: 'script_doc' });

  assert.equal(get(activePanel)?.id, panel.id);
});

test('script workspace documents serialize and restore with file metadata', () => {
  const document = createScriptDocument({ id: 'doc_serialized', name: 'Serial Test' });
  document.scripts = [createScript({ id: 'onlyScript', language: 'lua', event: 'onValueChanged' })];
  const text = serializeScriptWorkspaceDocument(document);
  const restored = deserializeScriptWorkspaceDocument(text, 'C:/tmp/serial.cescript.json', 'Serial File');

  assert.equal(restored.filePath, 'C:/tmp/serial.cescript.json');
  assert.equal(restored.name, 'Serial Test');
  assert.equal(restored.scripts.some((script) => script.id === 'onlyScript'), true);
  assert.equal(restored.modified, false);
});

test('a new script workspace starts empty — no seeded samples', () => {
  assert.deepEqual(createScriptDocument({ id: 'doc_fresh' }).scripts, []);
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


test('loading a document drops retired command-graph scripts instead of stubbing them', () => {
  // Pre-retirement documents carry `steps[]` and no source. Nothing can run them, so they must
  // not come back as empty handlers wearing their old names.
  const restored = deserializeScriptWorkspaceDocument({
    kind: 'ceditor.scriptWorkspace',
    name: 'Legacy Workspace',
    scripts: [
      { id: 'macroRouting', name: 'macroRouting', event: 'onValueChanged', steps: [{ id: 's', command: 'setValue', args: {} }] },
      { id: 'realOne', name: 'realOne', event: 'onValueChanged', language: 'lua', source: 'function onValueChanged(v)\nend\n' },
    ],
  });

  assert.deepEqual(restored.scripts.map((s) => s.id), ['realOne']);
});
