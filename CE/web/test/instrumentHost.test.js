// instrumentHost.test.js — the Instrument Host workspace's pure logic (VIP-successor Stage 1).
//
// The store renders whatever the native side pushes, so what must hold here is the shaping:
// arbitrary payloads normalize into exactly the structure the view renders, the search filter
// behaves, and the mock reducer — the thing that makes localhost:5173 usable without the JUCE
// backend — mirrors the native semantics the C++ tests pin (InstrumentHostServiceTests).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyHostState,
  normalizeHostState,
  filterInstruments,
  mockHostState,
  applyMockCommand,
  normalizeHostProject,
  emptyHostBuild,
  applyBuildProgress,
  normalizeHostParameters,
  applyParamValues,
  filterParameters,
  mockHostParameters,
  hostState as hostStateStore,
  hostParameters,
  requestParameters,
  setParameter,
  resetParameter,
  addControlPage,
  assignControlSlot,
  clearControlSlot,
  setControlSlotValue,
  normalizeHostLibrary,
  hostLibrary,
  requestLibrary,
  saveUserPreset,
  setLibraryUserMetadata,
  removeLibraryRecord,
  loadLibraryRecord,
} from '../src/CE_Application/stores/instrumentHost.js';
import { classifyWorkspace, workspaceOwnsChrome } from '../src/CE_Application/utils/workspaceChrome.js';
import { get } from 'svelte/store';
import {
  activeEditorTab,
  openInstrumentHostTab,
  closeInstrumentHostTab,
  instrumentHostTabOpen,
} from '../src/CE_Application/stores/panels.js';

test('normalizeHostState shapes garbage into the structure the view renders', () => {
  const shaped = normalizeHostState({ rack: { parts: [{ partId: 42, volume: '0.5' }] }, scanning: 'yes' });
  assert.equal(shaped.rack.parts.length, 1);
  const part = shaped.rack.parts[0];
  assert.equal(part.partId, '42');
  assert.equal(part.volume, 0.5);
  assert.equal(part.keyHigh, 127);
  assert.equal(part.enabled, true);
  assert.equal(shaped.scanning, false, 'scanning is strictly boolean');
  assert.deepEqual(normalizeHostState(null), emptyHostState());
  assert.deepEqual(normalizeHostState('nonsense'), emptyHostState());
});

test('filterInstruments matches name and vendor, case-insensitively', () => {
  const instruments = normalizeHostState({
    instruments: [
      { ceId: 'a', name: 'Analog One', vendor: 'Mock Audio' },
      { ceId: 'b', name: 'String Machine', vendor: 'Tape Labs' },
    ],
  }).instruments;

  assert.equal(filterInstruments(instruments, '').length, 2);
  assert.equal(filterInstruments(instruments, 'analog')[0].ceId, 'a');
  assert.equal(filterInstruments(instruments, 'TAPE')[0].ceId, 'b');
  assert.equal(filterInstruments(instruments, 'nothing').length, 0);
});

test('the mock state is already normalized and demoable', () => {
  const mock = mockHostState();
  assert.deepEqual(mock, normalizeHostState(mock), 'normalizing again changes nothing');
  assert.ok(mock.instruments.length > 0, 'there is a catalogue to browse');
  assert.ok(mock.rack.parts.some((p) => p.partId === mock.rack.focusedPartId),
    'the focused part exists');
  assert.ok(mock.modules.some((m) => m.quarantined), 'the quarantine UI has something to show');
});

test('mock reducer: addPart appends and the first part takes focus', () => {
  let state = normalizeHostState({});
  state = applyMockCommand(state, { cmd: 'addPart' });
  assert.equal(state.rack.parts.length, 1);
  assert.equal(state.rack.focusedPartId, state.rack.parts[0].partId,
    'the first part added becomes focused — same rule as the native model');
  state = applyMockCommand(state, { cmd: 'addPart' });
  assert.equal(state.rack.parts.length, 2);
  assert.equal(state.rack.focusedPartId, state.rack.parts[0].partId, 'focus stays put');
});

test('mock reducer: loadInstrument stamps identity from the catalogue', () => {
  let state = mockHostState();
  const partId = state.rack.parts[1].partId;   // the empty mock part
  state = applyMockCommand(state, { cmd: 'loadInstrument', partId, ceId: 'mock-analog' });
  const part = state.rack.parts.find((p) => p.partId === partId);
  assert.equal(part.hasInstrument, true);
  assert.equal(part.pluginName, 'Analog One');
  assert.equal(part.pluginVendor, 'Mock Audio');

  const unchanged = applyMockCommand(state, { cmd: 'loadInstrument', partId, ceId: 'no-such' });
  assert.equal(unchanged.rack.parts.find((p) => p.partId === partId).pluginName, 'Analog One',
    'an unknown ceId changes nothing');
});

test('mock reducer: setPartMixer touches only the fields it names', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'setPartMixer', partId, mute: true });
  const part = state.rack.parts[0];
  assert.equal(part.mute, true);
  assert.equal(part.volume, 1, 'volume untouched');
  assert.equal(part.enabled, true, 'enabled untouched');
});

test('mock reducer: removePart refocuses the first remaining part', () => {
  let state = mockHostState();
  const focused = state.rack.focusedPartId;
  state = applyMockCommand(state, { cmd: 'removePart', partId: focused });
  assert.equal(state.rack.parts.length, 1);
  assert.equal(state.rack.focusedPartId, state.rack.parts[0].partId);
});

test('mock reducer: quarantine clears and scan paths dedupe', () => {
  let state = mockHostState();
  const quarantinedPath = state.modules.find((m) => m.quarantined).path;
  state = applyMockCommand(state, { cmd: 'clearQuarantine', modulePath: quarantinedPath });
  assert.equal(state.modules.find((m) => m.path === quarantinedPath).quarantined, false);

  state = applyMockCommand(state, { cmd: 'addScanPath', path: 'D:\\More' });
  state = applyMockCommand(state, { cmd: 'addScanPath', path: 'D:\\More' });
  assert.deepEqual(state.scanPaths, ['D:\\More'], 'adding twice stores once');
  state = applyMockCommand(state, { cmd: 'removeScanPath', path: 'D:\\More' });
  assert.deepEqual(state.scanPaths, []);
});

test('opening the instrument host tab survives the panel-selection sync', () => {
  // The regression this pins: syncPanelSelection() keeps activeEditorTab consistent with the
  // panel list and early-returns for every non-panel tab type it knows. When it did not know
  // 'instrumentHost', it treated the new tab as a panel tab pointing at nothing and reset it
  // to { type: 'panel', id: null } the instant the tab opened — tab in the strip, empty
  // canvas behind it. Driving the real store exercises the same subscription chain.
  openInstrumentHostTab();
  assert.deepEqual(get(activeEditorTab), { type: 'instrumentHost', id: 'instrumentHost' });
  assert.equal(get(instrumentHostTabOpen), true);

  closeInstrumentHostTab();
  assert.equal(get(instrumentHostTabOpen), false);
  assert.notEqual(get(activeEditorTab).type, 'instrumentHost');
});

test('mock reducer: the editor opens on loaded parts and follows focus', () => {
  let state = mockHostState();
  const loaded = state.rack.parts[0].partId;   // Stage Keys, has an instrument
  const empty = state.rack.parts[1].partId;

  state = applyMockCommand(state, { cmd: 'openEditor', partId: empty });
  assert.equal(state.editorOpenPartId, '', 'an empty part cannot open an editor');

  state = applyMockCommand(state, { cmd: 'openEditor', partId: loaded });
  assert.equal(state.editorOpenPartId, loaded);

  state = applyMockCommand(state, { cmd: 'focusPart', partId: empty });
  assert.equal(state.editorOpenPartId, '', 'focusing an empty part hides the editor');

  state = applyMockCommand(state, { cmd: 'openEditor', partId: loaded });
  state = applyMockCommand(state, { cmd: 'removePart', partId: loaded });
  assert.equal(state.editorOpenPartId, '', 'removing the part closes its editor');

  state = applyMockCommand(state, { cmd: 'closeEditor' });
  assert.equal(state.editorOpenPartId, '');
});

test('normalizeHostState shapes the editor and audio fields', () => {
  const shaped = normalizeHostState({
    editorOpenPartId: 42,
    audio: { enabled: true, running: 'yes', deviceName: 'Speakers', sampleRate: '48000' },
  });
  assert.equal(shaped.editorOpenPartId, '42');
  assert.equal(shaped.audio.enabled, true);
  assert.equal(shaped.audio.running, false, 'running is strictly boolean');
  assert.equal(shaped.audio.deviceName, 'Speakers');
  assert.equal(shaped.audio.sampleRate, 48000);
});

test('the instrument host is a chrome-owning workspace like script and screen', () => {
  const kind = classifyWorkspace({ activeTab: { type: 'instrumentHost', id: 'instrumentHost' } });
  assert.equal(kind, 'instrumentHost');
  assert.equal(workspaceOwnsChrome(kind), true,
    'tree/display/properties panels are panel-editor chrome and stay hidden over the rack');
  assert.equal(workspaceOwnsChrome(classifyWorkspace({ activeTab: { type: 'settings' } })), false,
    'and the settings tab keeps behaving as before');
});

// --- the Host Project manifest and the build stream ---------------------------------------------

test('normalizeHostProject shapes garbage and defaults the target flags on', () => {
  const project = normalizeHostProject({ productName: 42, includeVst3: false });
  assert.equal(project.productName, '42');
  assert.equal(project.includeStandalone, true, 'absent flag defaults on');
  assert.equal(project.includeVst3, false);
  assert.equal(project.appId, '');
});

test('applyBuildProgress folds lines while running and lands on the verdict', () => {
  let build = emptyHostBuild();
  build = applyBuildProgress(build, { line: '$ node build-host-product.mjs' });
  assert.equal(build.running, true);
  build = applyBuildProgress(build, { line: 'staged Standalone/My Rack.exe' });
  build = applyBuildProgress(build, { line: 'Host product build failed (exit code 3).', done: true, ok: false });
  assert.equal(build.running, false);
  assert.equal(build.done, true);
  assert.equal(build.ok, false);
  assert.equal(build.lines.length, 3, 'the terminal line joins the log');
});

test('the build log keeps a bounded tail rather than growing forever', () => {
  let build = emptyHostBuild();
  for (let i = 0; i < 250; i += 1) build = applyBuildProgress(build, { line: `line ${i}` });
  assert.equal(build.lines.length, 200);
  assert.equal(build.lines.at(-1), 'line 249');
});

test('module rows carry the instrument count the browser filters by', () => {
  const shaped = normalizeHostState({ modules: [{ path: 'X.vst3', numClasses: 3, numInstruments: 1 }] });
  assert.equal(shaped.modules[0].numInstruments, 1);
  assert.equal(normalizeHostState({ modules: [{ path: 'Y.vst3' }] }).modules[0].numInstruments, 0);
});

test('mock reducer: browsing a scan folder adds the stand-in path once', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'browseScanPath' });
  state = applyMockCommand(state, { cmd: 'browseScanPath' });
  assert.deepEqual(state.scanPaths, ['D:\\Browsed VST3s']);
});

// --- the Stage 2 parameter view ------------------------------------------------------------------

test('normalizeHostParameters shapes garbage into the structure the view renders', () => {
  const shaped = normalizeHostParameters({ partId: 7, parameters: [{ id: 9, value: '0.5', discrete: 1 }] });
  assert.equal(shaped.partId, '7');
  assert.equal(shaped.parameters[0].id, '9');
  assert.equal(shaped.parameters[0].value, 0.5);
  assert.equal(shaped.parameters[0].discrete, false, 'truthy is not true — the native side sends real booleans');
  assert.equal(shaped.parameters[0].automatable, true, 'absent automatable defaults on');
});

test('applyParamValues patches the matching part and ignores the rest', () => {
  const registry = mockHostParameters('part-1');
  const patched = applyParamValues(registry, {
    partId: 'part-1',
    changes: [{ id: 'cutoff', value: 0.9, text: '0.90' }, { id: 'no-such', value: 1 }],
  });
  assert.equal(patched.parameters[0].value, 0.9);
  assert.equal(patched.parameters[0].text, '0.90');
  assert.equal(patched.parameters[1].value, 0, 'unnamed parameters are untouched');

  const other = applyParamValues(registry, { partId: 'part-2', changes: [{ id: 'cutoff', value: 1 }] });
  assert.equal(other, registry, "another part's delta leaves the snapshot alone");
});

test('filterParameters matches name, group and id', () => {
  const { parameters } = mockHostParameters('p');
  assert.equal(filterParameters(parameters, 'cut').length, 1);
  assert.equal(filterParameters(parameters, 'oscil').length, 1, 'group text matches');
  assert.equal(filterParameters(parameters, 'drive').length, 1, 'id matches');
  assert.equal(filterParameters(parameters, '').length, 3);
});

test('mock reducer: the parameter view round-trips set and reset', () => {
  hostStateStore.set(mockHostState()); // what initInstrumentHostBridge seeds in a plain browser
  const partId = 'mock-part-1'; // has an instrument in mockHostState
  requestParameters(partId);
  assert.equal(get(hostParameters).partId, partId);

  setParameter(partId, 'cutoff', 0.75);
  assert.equal(get(hostParameters).parameters[0].value, 0.75);
  assert.equal(get(hostParameters).parameters[0].text, '0.75');

  setParameter(partId, 'wave', 1);
  assert.equal(get(hostParameters).parameters[1].text, 'Sine', 'discrete text follows the step');

  resetParameter(partId, 'cutoff');
  assert.equal(get(hostParameters).parameters[0].value, 0.5);

  // Since Stage 5 an empty part still answers — with its mixer addresses only.
  requestParameters('mock-part-2');
  assert.equal(get(hostParameters).partId, 'mock-part-2');
  assert.ok(get(hostParameters).parameters.length > 0
              && get(hostParameters).parameters.every((d) => d.id.startsWith('@')),
    'an empty part keeps only its mixer registry');
});

// --- neutral control pages -----------------------------------------------------------------------

test('normalizeHostState shapes pages and slots with their resolution status', () => {
  const shaped = normalizeHostState({ rack: { pages: [{
    pageId: 'p1', name: 'Perf', slots: [{ slotId: 's1', assigned: true, resolved: false, rangeMax: '0.8' }],
  }] } });
  const slot = shaped.rack.pages[0].slots[0];
  assert.equal(slot.assigned, true);
  assert.equal(slot.resolved, false);
  assert.equal(slot.rangeMax, 0.8);
  assert.deepEqual(normalizeHostState({}).rack.pages, [], 'a Stage 1 payload has no pages and loads clean');
});

test('mock reducer: the page lifecycle — add, assign from the loaded part, drive, clear', () => {
  hostStateStore.set(mockHostState());
  const partId = 'mock-part-1';
  requestParameters(partId);

  addControlPage('My Page');
  let state = get(hostStateStore);
  assert.equal(state.rack.pages.length, 1);
  assert.equal(state.rack.pages[0].slots.length, 8);
  const pageId = state.rack.pages[0].pageId;

  assignControlSlot(pageId, 's1', partId, 'cutoff');
  state = get(hostStateStore);
  assert.equal(state.rack.pages[0].slots[0].resolved, true);
  assert.equal(state.rack.pages[0].slots[0].displayName, 'Cutoff');

  // Assigning against the empty part mirrors the native refusal: nothing changes.
  assignControlSlot(pageId, 's2', 'mock-part-2', 'cutoff');
  assert.equal(get(hostStateStore).rack.pages[0].slots[1].assigned, false);

  // The slot slider drives the bound parameter through the same mapping hardware will use.
  setControlSlotValue(pageId, 's1', 0.9);
  assert.equal(get(hostParameters).parameters[0].value, 0.9);

  clearControlSlot(pageId, 's1');
  assert.equal(get(hostStateStore).rack.pages[0].slots[0].assigned, false);
});

test('mock reducer: auto pages generate from the loaded part and regenerate in place', () => {
  hostStateStore.set(mockHostState());
  let state = applyMockCommand(get(hostStateStore), { cmd: 'generateControlPages', partId: 'mock-part-1' });
  state = applyMockCommand(state, { cmd: 'addControlPage', name: 'Mine' });
  state = applyMockCommand(state, { cmd: 'generateControlPages', partId: 'mock-part-1' });
  assert.equal(state.rack.pages.length, 2, 'regeneration replaced its own page, kept the user page');
  const auto = state.rack.pages.find((p) => p.generated);
  assert.equal(auto.name, 'Stage Keys');
  assert.equal(auto.slots[0].displayName, 'Cutoff');
  assert.equal(auto.slots[3].assigned, false);

  const unchanged = applyMockCommand(state, { cmd: 'generateControlPages', partId: 'mock-part-2' });
  assert.equal(unchanged.rack.pages.length, 2, 'an empty part generates nothing');
});

// --- the Stage 4 library -------------------------------------------------------------------------

test('normalizeHostLibrary shapes records with availability and user metadata', () => {
  const shaped = normalizeHostLibrary({ records: [{ recordId: 1, available: 'yes', reason: 7, tags: ['a', 2] }],
                                        counts: { total: '3' } });
  const record = shaped.records[0];
  assert.equal(record.recordId, '1');
  assert.equal(record.available, false, 'truthy strings are not availability');
  assert.equal(record.reason, '7');
  assert.deepEqual(record.tags, ['a', '2']);
  assert.equal(shaped.counts.total, 3);
});

test('mock reducer: the library round trip — search, capture, favourite, load-as-part', () => {
  hostStateStore.set(mockHostState());
  requestLibrary('', '');
  assert.equal(get(hostLibrary).records.length, 4);

  requestLibrary('warm', '');
  assert.equal(get(hostLibrary).records.length, 1, 'search narrows');
  requestLibrary('', 'rack');
  assert.equal(get(hostLibrary).records[0].type, 'rack', 'the type filter holds');

  requestLibrary('', '');
  saveUserPreset('mock-part-1');
  assert.equal(get(hostLibrary).records.length, 5, 'a capture joins the library');

  setLibraryUserMetadata('lib-2', { favourite: true });
  assert.equal(get(hostLibrary).records.find((r) => r.recordId === 'lib-2').favourite, true);

  const partsBefore = get(hostStateStore).rack.parts.length;
  loadLibraryRecord('lib-1', 'add');
  const parts = get(hostStateStore).rack.parts;
  assert.equal(parts.length, partsBefore + 1, 'loading as a new part grows the rack');
  assert.equal(parts.at(-1).pluginName, 'Warm Pad');

  loadLibraryRecord('lib-3', 'add');
  assert.equal(get(hostStateStore).rack.parts.length, partsBefore + 1,
    'an unavailable record loads nothing');

  removeLibraryRecord('lib-1');
  assert.equal(get(hostLibrary).records.some((r) => r.recordId === 'lib-1'), true,
    'factory records refuse removal in the mock too');
});

// --- Stage 5: effect chains and macros -----------------------------------------------------------

test('normalizeHostState shapes effect chains and macros', () => {
  const shaped = normalizeHostState({
    effectClasses: [{ ceId: 'fx-1', name: 'Verb' }],
    rack: {
      parts: [{ partId: 'p1', effects: [{ effectId: 'e1', pluginName: 'Verb', bypassed: 1 }] }],
      masterEffects: [{ effectId: 'e2', hasProcessor: true }],
      macros: [{ macroId: 'm1', name: 'Bright', value: '0.5',
                 targets: [{ targetId: 'p1', parameterId: 'cutoff', resolved: true }] }],
    },
  });
  assert.equal(shaped.effectClasses[0].name, 'Verb');
  assert.equal(shaped.rack.parts[0].effects[0].bypassed, false, 'truthy is not true');
  assert.equal(shaped.rack.masterEffects[0].hasProcessor, true);
  assert.equal(shaped.rack.macros[0].value, 0.5);
  assert.equal(shaped.rack.macros[0].targets[0].resolved, true);
  assert.deepEqual(normalizeHostState({}).rack.masterEffects, [], 'older payloads load clean');
});

test('mock reducer: the effect chain lifecycle on part and master', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addEffect', chainId: 'mock-part-1', ceId: 'mock-reverb' });
  state = applyMockCommand(state, { cmd: 'addEffect', chainId: 'master', ceId: 'mock-comp' });
  assert.equal(state.rack.parts[0].effects[0].pluginName, 'Sweet Reverb');
  assert.equal(state.rack.masterEffects[0].pluginName, 'Big Comp');

  const effectId = state.rack.parts[0].effects[0].effectId;
  state = applyMockCommand(state, { cmd: 'setEffectBypassed', effectId, bypassed: true });
  assert.equal(state.rack.parts[0].effects[0].bypassed, true);
  state = applyMockCommand(state, { cmd: 'removeEffect', effectId });
  assert.equal(state.rack.parts[0].effects.length, 0);
  assert.equal(state.rack.masterEffects.length, 1, 'the other chain is untouched');
});

test('mock reducer: macros collect targets and hold their value', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Bright' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'addMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  state = applyMockCommand(state, { cmd: 'addMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.macros[0].targets.length, 1, 'duplicate targets collapse');
  assert.equal(state.rack.macros[0].targets[0].displayName, 'Cutoff');

  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 1.7 });
  assert.equal(state.rack.macros[0].value, 1, 'values clamp to 0..1');

  state = applyMockCommand(state, { cmd: 'removeMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.macros[0].targets.length, 0);
  state = applyMockCommand(state, { cmd: 'removeMacro', macroId });
  assert.equal(state.rack.macros.length, 0);
});

// --- Stage 5 completion: returns, sends, hardware parts, multi-out, engine -----------------------

test('normalizeHostState shapes returns, sends, hardware and engine fields', () => {
  const shaped = normalizeHostState({
    audio: { cpu: '0.3', xruns: 2, inputChannels: 4 },
    rack: {
      masterLatencyMs: '10.5',
      returns: [{ returnId: 'r1', name: 'Verb Bus', level: '0.5',
                  effects: [{ effectId: 'e9', hasProcessor: true }] }],
      parts: [{
        partId: 'p1',
        sends: [{ returnId: 'r1', level: '1.5' }],
        extraOuts: [{ pairIndex: '1', gain: 0.5 }],
        outputChannels: 4,
        latencyMs: 10,
        hardware: true,
        midiOutputId: 'port-1',
        midiOutputName: 'AN1x',
        midiOutChannel: 3,
        audioReturnChannel: 2,
        programNumber: 45,
        midiOutError: 'gone',
      }],
    },
  });
  assert.equal(shaped.audio.cpu, 0.3);
  assert.equal(shaped.audio.xruns, 2);
  assert.equal(shaped.rack.masterLatencyMs, 10.5);
  assert.equal(shaped.rack.returns[0].name, 'Verb Bus');
  assert.equal(shaped.rack.returns[0].effects[0].hasProcessor, true);
  const part = shaped.rack.parts[0];
  assert.equal(part.sends[0].level, 1.5);
  assert.equal(part.extraOuts[0].pairIndex, 1);
  assert.equal(part.hardware, true);
  assert.equal(part.midiOutChannel, 3);
  assert.equal(part.audioReturnChannel, 2);
  assert.equal(part.midiOutError, 'gone');
  const older = normalizeHostState({});
  assert.deepEqual(older.rack.returns, [], 'older payloads load clean');
  assert.equal(older.audio.cpu, 0);
});

test('mock reducer: returns and sends, with the drop-stranded-sends rule', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addReturn', name: 'Verb Bus' });
  const returnId = state.rack.returns[0].returnId;
  assert.equal(state.rack.returns[0].name, 'Verb Bus');

  state = applyMockCommand(state, { cmd: 'addEffect', chainId: returnId, ceId: 'mock-reverb' });
  assert.equal(state.rack.returns[0].effects[0].pluginName, 'Sweet Reverb',
    'the return chain takes effects like any other chain');

  state = applyMockCommand(state, { cmd: 'setSendLevel', partId: 'mock-part-1', returnId, level: 1.5 });
  assert.equal(state.rack.parts[0].sends[0].level, 1.5);
  state = applyMockCommand(state, { cmd: 'setReturnLevel', returnId, level: 5 });
  assert.equal(state.rack.returns[0].level, 2, 'levels clamp to 0..2');

  state = applyMockCommand(state, { cmd: 'removeReturn', returnId });
  assert.equal(state.rack.returns.length, 0);
  assert.equal(state.rack.parts[0].sends.length, 0, 'stranded sends are dropped, never dangling');
});

test('mock reducer: hardware parts carry their config and the port-gone diagnostic', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'setHardwareConfig', partId: 'mock-part-2',
                                    midiOutputId: 'mock-out-1', midiOutputName: 'AN1x MIDI Out',
                                    midiOutChannel: 3, programNumber: 45 });
  const part = state.rack.parts[1];
  assert.equal(part.hardware, true);
  assert.equal(part.midiOutChannel, 3);
  assert.equal(part.midiOutError, '', 'a known port opens clean');

  state = applyMockCommand(state, { cmd: 'setHardwareConfig', partId: 'mock-part-2',
                                    midiOutputId: 'unplugged' });
  assert.ok(state.rack.parts[1].midiOutError, 'a gone port is a diagnostic on the part');

  state = applyMockCommand(state, { cmd: 'clearHardware', partId: 'mock-part-2' });
  assert.equal(state.rack.parts[1].hardware, false);
  assert.equal(state.rack.parts[1].midiOutError, '');
});

test('mock reducer: explicit multi-output routes add, retune and remove', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'setExtraOut', partId: 'mock-part-1', pairIndex: 1, gain: 1 });
  state = applyMockCommand(state, { cmd: 'setExtraOut', partId: 'mock-part-1', pairIndex: 1, gain: 0.5 });
  assert.equal(state.rack.parts[0].extraOuts.length, 1, 'the same pair updates in place');
  assert.equal(state.rack.parts[0].extraOuts[0].gain, 0.5);
  state = applyMockCommand(state, { cmd: 'setExtraOut', partId: 'mock-part-1', pairIndex: 0, gain: 1 });
  assert.equal(state.rack.parts[0].extraOuts.length, 1, 'the main pair is refused');
  state = applyMockCommand(state, { cmd: 'removeExtraOut', partId: 'mock-part-1', pairIndex: 1 });
  assert.equal(state.rack.parts[0].extraOuts.length, 0);
});

test('mock parameters: a part answers with its mixer addresses beside the plug-in rows', () => {
  hostStateStore.set(mockHostState());
  hostStateStore.set(applyMockCommand(get(hostStateStore), { cmd: 'addReturn', name: 'Verb Bus' }));
  requestParameters('mock-part-1');
  const rows = get(hostParameters).parameters;
  assert.ok(rows.some((d) => d.id === 'cutoff'), 'the plug-in rows are there');
  assert.ok(rows.some((d) => d.id === '@gain' && d.group === 'Mixer'), 'and the fader');
  assert.ok(rows.some((d) => d.id.startsWith('@send:') && d.name === 'Send — Verb Bus'),
    'and one send per return');

  // A virtual write moves the rack itself, not just the registry row.
  setParameter('mock-part-1', '@gain', 0.25);
  assert.equal(get(hostStateStore).rack.parts[0].volume, 0.5, '@gain writes the fader');

  requestParameters('mock-part-2');
  assert.ok(get(hostParameters).parameters.every((d) => d.id.startsWith('@')),
    'an empty part keeps only its mixer registry');
});
