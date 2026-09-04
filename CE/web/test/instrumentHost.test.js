// instrumentHost.test.js — the Hostage workspace's pure logic.
//
// The store renders whatever the native side pushes, so what must hold here is the shaping:
// arbitrary payloads normalize into exactly the structure the view renders, the search filter
// behaves, and the mock reducer — the thing that makes localhost:5173 usable without the JUCE
// backend — mirrors the native semantics the C++ tests pin (InstrumentHostServiceTests).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyHostState,
  emptyPerformance,
  normalizeHostState,
  filterInstruments,
  mockHostState,
  applyMockCommand,
  advanceMockMidiLfos,
  advanceMockEnvelopes,
  advanceMockMsegs,
  advanceMockRandomModulators,
  deterministicRandomUnit,
  normalizeHostProject,
  emptyHostBuild,
  applyBuildProgress,
  normalizeHostParameters,
  applyParamValues,
  filterParameters,
  fuzzyScore,
  parameterShortlist,
  mockHostParameters,
  hostState as hostStateStore,
  hostMidiActivity,
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
  saveChainToLibrary,
  rackCanvasLayout,
  CANVAS_NODE_H,
  reorderIndexForDrop,
  canvasDropTargets,
  busDestinationWouldLoop,
  pluginTile,
  pluginInitials,
  pluginSnapshots,
  customArtworkIds,
  TILE_PATTERNS,
  normalizeSurfaceLayout,
  surfaceControlSlot,
  filterEffects,
  mockSurfaceLayout,
  emptySurfaceLayout,
  setLibraryUserMetadata,
  removeLibraryRecord,
  loadLibraryRecord,
  setPresetAudition,
  auditionLibraryRecord,
  startSoundComparison,
  stepSoundComparison,
  keepSoundComparison,
  cancelSoundComparison,
  emptyProduct,
  normalizeProduct,
  emptyReliability,
  normalizeReliability,
  emptySupportBundle,
  normalizeSupportBundle,
  normalizeHostSurface,
  normalizeMidiLearn,
  parameterControlKind,
  normalizeMidiSlot,
  midiSlotTypes,
  buildStrumPlan,
  buildArticulationMessages,
  applySmartChordVoicing,
  factoryGrooveTemplates,
  normalizeGrooveTemplate,
  applyGrooveToPattern,
  snapshotMorphValue,
  makePatternVariation,
  normalizeMicrotuning,
  parseScalaTuning,
  groupParameters,
  assignedParameterIds,
  emptyLicence,
  normalizeLicence,
} from '../src/CE_Application/stores/instrumentHost.js';
import { classifyWorkspace, workspaceOwnsChrome } from '../src/CE_Application/utils/workspaceChrome.js';
import {
  applyResponseCurve7, normalizeResponseCurvePoints, responseCurveDisplayPoints,
} from '../src/CE_Application/utils/responseCurve.js';
import {
  setHardwareConfig, captureHardwarePatch, finishHardwarePatchCapture, hostLastError,
  hostKeyboardMode, showPartRange, showKeyboardPlay,
  midiSourceWouldLoop, normalizePatchCompare, compareHardwarePatch, hostPatchCompare,
} from '../src/CE_Application/stores/instrumentHost.js';
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

test('mock reducer: rapid additions never reuse an entity identity', () => {
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    let state = normalizeHostState({});
    state = applyMockCommand(state, { cmd: 'addPart' });
    state = applyMockCommand(state, { cmd: 'addPart' });
    assert.equal(new Set(state.rack.parts.map((part) => part.partId)).size, 2);

    state = applyMockCommand(state, { cmd: 'addPattern', name: 'First' });
    state = applyMockCommand(state, { cmd: 'addPattern', name: 'Second' });
    assert.equal(new Set(state.performance.patterns.map((pattern) => pattern.patternId)).size, 2);

    const patternId = state.performance.patterns[0].patternId;
    state = applyMockCommand(state, { cmd: 'addClip', patternId });
    state = applyMockCommand(state, { cmd: 'addClip', patternId });
    assert.equal(new Set(state.performance.clips.map((clip) => clip.clipId)).size, 2);

    state = applyMockCommand(state, { cmd: 'addScene', name: 'First' });
    state = applyMockCommand(state, { cmd: 'addScene', name: 'Second' });
    assert.equal(new Set(state.performance.scenes.map((scene) => scene.sceneId)).size, 2);

    const sceneId = state.performance.scenes[0].sceneId;
    state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId });
    state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId });
    assert.equal(new Set(state.performance.setlist.items.map((item) => item.itemId)).size, 2);

    const partId = state.rack.parts[0].partId;
    state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'echo' });
    state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'humanize' });
    const slotIds = state.rack.parts[0].midiChain.map((slot) => slot.slotId);
    assert.equal(new Set(slotIds).size, slotIds.length);

    state = applyMockCommand(state, { cmd: 'startPerformanceRecording', name: 'Take 1' });
    state = applyMockCommand(state, { cmd: 'finishPerformanceRecording' });
    state = applyMockCommand(state, { cmd: 'startPerformanceRecording', name: 'Take 2' });
    state = applyMockCommand(state, { cmd: 'finishPerformanceRecording' });
    assert.equal(new Set(state.performance.performanceTakes.map((take) => take.takeId)).size, 2);
  } finally {
    Date.now = realNow;
  }
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

test('mock reducer: rack parts move without changing focus or identity', () => {
  let state = mockHostState();
  const before = state.rack.parts.map((part) => part.partId);
  state = applyMockCommand(state, { cmd: 'movePart', partId: before[0], index: 1 });
  assert.deepEqual(state.rack.parts.map((part) => part.partId), [before[1], before[0]]);
  assert.equal(state.rack.focusedPartId, before[0]);
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
    pageId: 'p1', name: 'Perf', slots: [{ slotId: 's1', assigned: true, resolved: false,
      rangeMax: '0.8', value: 0.75, valueText: '7.5 kHz' }],
  }] } });
  const slot = shaped.rack.pages[0].slots[0];
  assert.equal(slot.assigned, true);
  assert.equal(slot.resolved, false);
  assert.equal(slot.rangeMax, 0.8);
  assert.equal(slot.value, 0.75);
  assert.equal(slot.valueText, '7.5 kHz');
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
  hostStateStore.set(applyMockCommand(state, { cmd: 'renameControlPage', pageId, name: 'Live Mix' }));
  state = get(hostStateStore);
  assert.equal(state.rack.pages[0].name, 'Live Mix');

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

test('preset audition settings normalize to a safe, persistent phrase recipe', () => {
  const settings = normalizeHostState({ rack: { presetAudition: {
    enabled: true, phrase: 'scale', rootNote: 140, velocity: 0,
    noteLengthMs: 10, gapMs: 9000, playing: true,
  } } }).rack.presetAudition;
  assert.deepEqual(settings, {
    enabled: true, phrase: 'scale', rootNote: 127, velocity: 1,
    noteLengthMs: 40, gapMs: 2000, playing: true,
  });
  assert.equal(normalizeHostState({ rack: { presetAudition: { phrase: 'noise' } } })
    .rack.presetAudition.phrase, 'chord');
});

test('mock bridge persists audition controls and loads the clicked preset', () => {
  hostStateStore.set(mockHostState());
  requestLibrary('', '');
  setPresetAudition({ enabled: true, phrase: 'riff', rootNote: 48,
                      velocity: 88, noteLengthMs: 240, gapMs: 60 });
  assert.deepEqual(get(hostStateStore).rack.presetAudition, {
    enabled: true, phrase: 'riff', rootNote: 48, velocity: 88,
    noteLengthMs: 240, gapMs: 60, playing: false,
  });

  auditionLibraryRecord('lib-1', 'focused');
  const part = get(hostStateStore).rack.parts.find((p) => p.partId === 'mock-part-1');
  assert.equal(part.presetName, 'Warm Pad');
  assert.equal(part.presetRecordId, 'lib-1');
});

test('Sound Comparison Mode walks up to 20 presets, then keeps or restores', () => {
  hostStateStore.set(mockHostState());
  requestLibrary('', '');
  const original = get(hostStateStore).rack.parts[0];
  assert.equal(original.presetRecordId, '');

  startSoundComparison(original.partId, ['lib-1', 'lib-2']);
  let state = get(hostStateStore);
  assert.equal(state.rack.soundComparison.active, true);
  assert.equal(state.rack.soundComparison.count, 2);
  assert.equal(state.rack.parts[0].presetName, 'Warm Pad');

  stepSoundComparison(1);
  state = get(hostStateStore);
  assert.equal(state.rack.soundComparison.index, 1);
  assert.equal(state.rack.parts[0].presetName, 'My Growl');
  cancelSoundComparison();
  state = get(hostStateStore);
  assert.equal(state.rack.soundComparison.active, false);
  assert.equal(state.rack.parts[0].presetName, '', 'cancel restores the original sound cursor');

  startSoundComparison(original.partId, ['lib-1', 'lib-2']);
  stepSoundComparison(1);
  keepSoundComparison();
  state = get(hostStateStore);
  assert.equal(state.rack.soundComparison.active, false);
  assert.equal(state.rack.parts[0].presetName, 'My Growl', 'keep commits the compared sound');
});

test('mock reducer: the library round trip — search, capture, favourite, load-as-part', () => {
  hostStateStore.set(mockHostState());
  requestLibrary('', '');
  assert.equal(get(hostLibrary).records.length, 5);

  requestLibrary('warm', '');
  assert.equal(get(hostLibrary).records.length, 1, 'search narrows');
  requestLibrary('', 'rack');
  assert.equal(get(hostLibrary).records[0].type, 'rack', 'the type filter holds');

  requestLibrary('', '');
  saveUserPreset('mock-part-1');
  assert.equal(get(hostLibrary).records.length, 6, 'a capture joins the library');

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

test('mock reducer: a chain record captures a whole voice and lands as one', () => {
  hostStateStore.set(mockHostState());
  requestLibrary('', 'chain');
  const chains = get(hostLibrary).records;
  assert.equal(chains.length, 1, 'chains filter as their own type');
  assert.equal(chains[0].sourceType, 'chainCapture');

  requestLibrary('', '');
  const before = get(hostLibrary).counts.chains;
  saveChainToLibrary('mock-part-1', 'My Voice');
  const saved = get(hostLibrary).records.at(-1);
  assert.equal(saved.type, 'chain', 'saving a chain writes a chain record');
  assert.equal(saved.name, 'My Voice');
  assert.equal(get(hostLibrary).counts.chains, before + 1, 'and the chain count follows');

  // Landing it: the part keeps its identity, and the instrument the chain names arrives.
  const target = get(hostStateStore).rack.parts[0];
  loadLibraryRecord('lib-5', 'focused', target.partId);
  const landed = get(hostStateStore).rack.parts.find((p) => p.partId === target.partId);
  assert.equal(landed.pluginName, 'Analog One', 'the chain brings its instrument');
  assert.equal(landed.presetName, 'Big Lead', 'and the cursor names the chain that is loaded');

  const partsBefore = get(hostStateStore).rack.parts.length;
  loadLibraryRecord('lib-5', 'add');
  assert.equal(get(hostStateStore).rack.parts.length, partsBefore + 1,
    'and it can arrive as a new part instead');
});

// --- the rack canvas -----------------------------------------------------------------------------

const canvasRack = () => ({
  focusedPartId: 'p1',
  parts: [
    { partId: 'p1', pluginName: 'Keys', destinationBusId: '', midiChain: [1, 2], effects: [1],
      sends: [{ returnId: 'r1', level: 0.4 }, { returnId: 'r2', level: 0 }] },
    { partId: 'p2', pluginName: 'Bass', destinationBusId: 'b1', midiChain: [], effects: [], sends: [] },
  ],
  buses: [{ busId: 'b1', name: 'Keys bus', destinationBusId: 'b2', effects: [1] },
          { busId: 'b2', name: 'Sub', destinationBusId: '', effects: [] }],
  returns: [{ returnId: 'r1', name: 'Verb', effects: [1] }, { returnId: 'r2', name: 'Delay', effects: [] }],
  masterEffects: [1],
});
const nodeOf = (layout, id) => layout.nodes.find((n) => n.id === id);
const wireOf = (layout, from, to) => layout.wires.find((w) => w.from === from && w.to === to);

test('reorderIndexForDrop lands a row where it was dropped, in both directions', () => {
  // The list is [0,1,2,3]. `apply` is exactly what the service and the mock do with the
  // index, so the assertions can talk about the resulting ORDER rather than about an index —
  // which is the only way to notice an off-by-one that is right in one direction.
  const apply = (from, index) => {
    const list = ['a', 'b', 'c', 'd'];
    const [row] = list.splice(from, 1);
    list.splice(index, 0, row);
    return list.join('');
  };
  const drop = (from, over, after) => reorderIndexForDrop(from, over, after);

  // Downwards. This is where lifting the row out shifts everything below it up by one, and
  // where a naive "use the index you dropped on" lands the row one place short.
  assert.equal(apply(0, drop(0, 2, true)), 'bcad', 'below the third row puts it third');
  assert.equal(apply(0, drop(0, 3, true)), 'bcda', 'below the last row puts it last');
  assert.equal(apply(0, drop(0, 2, false)), 'bacd', 'above the third row puts it second');

  // Upwards. No shift, so the index is the one the pointer named.
  assert.equal(apply(3, drop(3, 0, false)), 'dabc', 'above the first row puts it first');
  assert.equal(apply(3, drop(3, 1, true)), 'abdc', 'below the second row puts it third');
  assert.equal(apply(2, drop(2, 0, false)), 'cabd');

  // Non-moves send no command at all: a no-op still costs a state push and a save.
  assert.equal(drop(1, 1, false), -1, 'dropping a row on its own top half changes nothing');
  assert.equal(drop(1, 1, true), -1, 'nor its own bottom half');
  assert.equal(drop(1, 0, true), -1, 'below the row above it is where it already is');
  assert.equal(drop(1, 2, false), -1, 'and above the row below it likewise');

  assert.equal(drop(-1, 0, false), -1, 'garbage in, no command out');
  assert.equal(drop(0, 'x', false), -1);
});

test('the drawing knows which knob drives which slot', () => {
  // One number joins the picture to the assignments: encoder index N is page slot N. Getting
  // it wrong would label every knob with its neighbour's parameter, which reads as working.
  const page = { pageId: 'p1', slots: [
    { slotId: 's1', assigned: true, displayName: 'Cutoff' },
    { slotId: 's2', assigned: false, displayName: '' },
    { slotId: 's3', assigned: true, displayName: 'Resonance' },
  ] };
  const encoder = (index) => ({ controlId: `encoder-${index + 1}`, kind: 'encoder', index });

  assert.equal(surfaceControlSlot(page, encoder(0)).slotId, 's1');
  assert.equal(surfaceControlSlot(page, encoder(2)).slotId, 's3', 'the third knob is the third slot');
  assert.equal(surfaceControlSlot(page, encoder(7)), null,
    'a knob past the end of the page drives nothing, rather than wrapping onto slot one');

  // A fader or a pad has no slot until something is dropped on it — so nothing yet — and an
  // encoder the profile says CEditor cannot address never has one.
  assert.equal(surfaceControlSlot(page, { kind: 'fader', index: 0 }), null, 'no fader slot minted yet');
  assert.equal(surfaceControlSlot(page, { kind: 'pad', index: 1 }), null, 'nor a pad slot');
  assert.equal(surfaceControlSlot(page, { kind: 'encoder', index: -1 }), null,
    'nor an encoder the profile says CEditor cannot address');

  // Once minted, a fader's or a pad's slot is found by what it rides, not by its position:
  // the fader slot sits between two encoders in the array and must not shift them.
  const mixed = { pageId: 'p3', slots: [
    { slotId: 's1', kind: 'encoder', index: 0, assigned: true, displayName: 'Cutoff' },
    { slotId: 'fader-3', kind: 'fader', index: 2, assigned: true, displayName: 'Level' },
    { slotId: 's2', kind: 'encoder', index: 1, assigned: false, displayName: '' },
    { slotId: 'pad-2', kind: 'pad', index: 1, assigned: true, displayName: 'Hold' },
  ] };
  assert.equal(surfaceControlSlot(mixed, { kind: 'fader', index: 2 }).slotId, 'fader-3');
  assert.equal(surfaceControlSlot(mixed, { kind: 'pad', index: 1 }).slotId, 'pad-2');
  assert.equal(surfaceControlSlot(mixed, encoder(1)).slotId, 's2',
    'the second encoder is still the second encoder with a fader slot ahead of it');
  assert.equal(surfaceControlSlot(mixed, { kind: 'fader', index: 0 }), null, 'an unminted fader is still nothing');
  assert.equal(surfaceControlSlot(mixed, { kind: 'button', index: 0 }), null, 'a button is not a slot kind');

  assert.equal(surfaceControlSlot(null, encoder(0)), null, 'with no page there is nothing to drive');
  assert.equal(surfaceControlSlot(page, null), null);
  assert.equal(surfaceControlSlot({ pageId: 'p2' }, encoder(0)), null, 'a page with no slots is safe');
});

test('slots without a kind read as encoders at their place among the encoders', () => {
  // Every page saved before faders and pads had slots: kind and index absent, join by
  // position. A fader slot in the array must not push the encoders' indices along.
  const state = normalizeHostState({ rack: { pages: [{ pageId: 'p', slots: [
    { slotId: 'a' }, { slotId: 'f', kind: 'fader', index: 4 }, { slotId: 'b' }, { slotId: 'p', kind: 'pad' },
  ] }] } });
  const slots = state.rack.pages[0].slots;
  assert.deepEqual(slots.map((s) => [s.kind, s.index]),
    [['encoder', 0], ['fader', 4], ['encoder', 1], ['pad', -1]]);
  assert.equal(slots[0].midiNote, -1);
  assert.equal(slots[0].toggle, false);
  assert.equal(slots[0].latched, false);
});

test('mock reducer: dropping on a fader or a pad mints its slot, then it is an ordinary slot', () => {
  let state = applyMockCommand(mockHostState(), { cmd: 'addControlPage', name: 'Live' });
  const pageId = state.rack.pages.at(-1).pageId;
  const before = state.rack.pages.at(-1).slots.length;
  state = applyMockCommand(state, { cmd: 'assignSurfaceControl', pageId, kind: 'fader', index: 2,
                                    partId: 'mock-part-1', parameterId: 'cutoff' });
  const page = state.rack.pages.find((p) => p.pageId === pageId);
  assert.equal(page.slots.length, before + 1, 'a fader slot was minted');
  const fader = surfaceControlSlot(page, { kind: 'fader', index: 2 });
  assert.ok(fader, 'and it is found by what it rides');
  assert.equal(fader.assigned, true);

  state = applyMockCommand(state, { cmd: 'assignSurfaceControl', pageId, kind: 'fader', index: 2,
                                    partId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.pages.find((p) => p.pageId === pageId).slots.length, before + 1,
    'a second drop reuses the slot rather than minting another');

  state = applyMockCommand(state, { cmd: 'learnSurfaceControl', pageId, kind: 'pad', index: 5 });
  const pad = surfaceControlSlot(state.rack.pages.find((p) => p.pageId === pageId), { kind: 'pad', index: 5 });
  assert.ok(pad, 'learning on a pad mints its slot too');
  assert.ok(pad.midiCc >= 0, 'and the mock binds it at once');

  state = applyMockCommand(state, { cmd: 'setControlSlotOptions', pageId, slotId: pad.slotId, toggle: true });
  assert.equal(surfaceControlSlot(state.rack.pages.find((p) => p.pageId === pageId), { kind: 'pad', index: 5 }).toggle, true,
    'toggle is a slot option like any other');

  state = applyMockCommand(state, { cmd: 'assignSurfaceControl', pageId, kind: 'button', index: 0,
                                    partId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.pages.find((p) => p.pageId === pageId).slots.length, before + 2,
    'a kind the surface does not address mints nothing');
});

test('a controller move carries which controller it was', () => {
  // The drawing lights the knob you are turning by matching the controller against what the
  // slots are bound to, so the event has to carry the numbers. A note-on must NOT be able to
  // light controller 0 by arithmetic accident, which is what the -1 is for.
  let seen = null;
  const unsub = hostMidiActivity.subscribe((a) => (seen = a));
  hostMidiActivity.set({ device: 'CTRL49', text: 'Controller 22: 64', cc: 22, channel: 1, value: 64, seq: 1 });
  assert.equal(seen.cc, 22);
  assert.equal(seen.channel, 1);
  assert.equal(seen.value, 64);
  hostMidiActivity.set({ device: 'CTRL49', text: 'C4 on, velocity 100', cc: -1, channel: 1, value: 0, seq: 2 });
  assert.equal(seen.cc, -1, 'a note is not a controller and says so');
  unsub();
});

// --- five hundred parameters -----------------------------------------------------------------

test('search finds a parameter from the letters somebody would actually type', () => {
  const params = [
    { id: 'p1', name: 'Filter 1 Cutoff', group: 'Filter' },
    { id: 'p2', name: 'Sub Cutoff Trim', group: 'Osc' },
    { id: 'p3', name: 'Cutoff', group: 'Filter' },
    { id: 'p4', name: 'Reverb Mix', group: 'FX' },
  ];
  const names = (q) => filterParameters(params, q).map((p) => p.name);

  // Substring search — what this used to be — finds nothing for either of these.
  assert.deepEqual(names('f1cut'), ['Filter 1 Cutoff'],
    'initials and fragments across words, which is how a long name is remembered');
  assert.ok(names('fcut').includes('Filter 1 Cutoff'));

  // Ranking is the other half: three matches, and the one you meant first.
  assert.equal(names('cut')[0], 'Cutoff', 'the shortest exact-ish name wins');
  assert.equal(names('cut').length, 3, 'without hiding the others');
  assert.ok(names('cut').indexOf('Filter 1 Cutoff') < names('cut').indexOf('Sub Cutoff Trim'),
    'a match at a word start beats one buried mid-name');

  assert.deepEqual(names(''), params.map((p) => p.name),
    'an empty search keeps the plug-in\'s own order');
  assert.deepEqual(names('zzzz'), [], 'and nonsense matches nothing rather than everything');

  // The scorer itself, at the edges.
  assert.equal(fuzzyScore('Cutoff', ''), 0, 'an empty query matches anything, neutrally');
  assert.equal(fuzzyScore('', 'cut'), -1, 'an empty name matches nothing');
  assert.equal(fuzzyScore('Cutoff', 'ffotuc'), -1, 'order matters — it is a subsequence, not a bag');
});

test('the shortlist is what you pinned and what you last touched, without repeats', () => {
  const params = [
    { id: 'a', name: 'Cutoff' }, { id: 'b', name: 'Resonance' },
    { id: 'c', name: 'Drive' },  { id: 'd', name: 'Mix' },
  ];
  const { pinned, recent } = parameterShortlist(params, ['c', 'a'], ['a', 'd', 'b']);

  assert.deepEqual(pinned.map((p) => p.id), ['c', 'a'],
    'pinned keeps the order they were marked in, not the registry order');
  assert.deepEqual(recent.map((p) => p.id), ['d', 'b'],
    'recent keeps newest-first, minus anything already pinned');
  assert.ok(!recent.some((p) => p.id === 'a'),
    'a parameter in both appears once — a pin is the stronger statement');

  // Ids that no longer exist: a plug-in swapped for another, or a version that renamed things.
  const stale = parameterShortlist(params, ['gone'], ['also-gone', 'b']);
  assert.deepEqual(stale.pinned, [], 'a pin for a parameter this plug-in does not have is skipped');
  assert.deepEqual(stale.recent.map((p) => p.id), ['b'], 'and so is a stale recent');

  assert.deepEqual(parameterShortlist(null, null, null), { pinned: [], recent: [] });
});

test('the later MIDI note modules arrive transparent', () => {
  // The rule this nearly broke and that the native side keeps too: an inserted module must
  // not change the sound by existing. A fresh echo repeats nothing, a fresh strum spreads
  // nothing, a fresh latch latches nothing.
  for (const type of ['echo', 'strum', 'humanize', 'chance', 'length', 'latch', 'mpe',
                      'articulation']) {
    const slot = normalizeMidiSlot({ slotId: 's', type });
    assert.equal(slot.type, type, `${type} is a module the UI knows`);
    assert.equal(slot.mod.echoRepeats, 0, `${type}: no repeats by default`);
    assert.equal(slot.mod.strumBeats, 0, `${type}: no spread by default`);
    assert.equal(slot.mod.strumPattern, 'ascending');
    assert.equal(slot.mod.strumCurve, 0);
    assert.equal(slot.mod.strumVelocityRamp, 0);
    assert.equal(slot.mod.humanizeTimingBeats, 0);
    assert.equal(slot.mod.humanizeVelocity, 0);
    assert.equal(slot.mod.humanizeGatePercent, 0);
    assert.equal(slot.mod.humanizePreserveChords, false);
    assert.equal(slot.mod.humanizeProtectBeats, false);
    assert.equal(slot.mod.chance, 1, `${type}: every note passes by default`);
    assert.equal(slot.mod.lengthBeats, 0);
    assert.equal(slot.mod.legato, false);
    assert.equal(slot.mod.latchOn, false, `${type}: latch starts off`);
    assert.equal(slot.mod.mpeEnabled, false, `${type}: expression conversion starts off`);
    assert.equal(slot.mod.articulationEnabled, false, `${type}: articulation triggers start off`);
  }

  // Out-of-range values are clamped rather than believed: these arrive from a text field.
  const wild = normalizeMidiSlot({ slotId: 's', type: 'echo', mod: {
    echoRepeats: 900, echoStepBeats: 1e6, echoFeedback: -3, echoTranspose: 99,
    chance: 5, humanizeVelocity: 'lots', humanizeGatePercent: 400, lengthBeats: -2,
  } });
  assert.equal(wild.mod.echoRepeats, 8, 'four hundred repeats is eight');
  assert.equal(wild.mod.echoStepBeats, 4);
  assert.equal(wild.mod.echoFeedback, 0.1);
  assert.equal(wild.mod.echoTranspose, 12);
  assert.equal(wild.mod.chance, 1);
  assert.equal(wild.mod.humanizeVelocity, 0, 'and nonsense falls back rather than becoming NaN');
  assert.equal(wild.mod.humanizeGatePercent, 100, 'gate variation is kept in its safe range');
  assert.equal(wild.mod.lengthBeats, 0);

  const mpe = normalizeMidiSlot({ slotId: 'mpe', type: 'mpe', mod: {
    mpeEnabled: true, mpeInput: 'poly aftertouch', mpeOutput: 'mpe',
    mpeInputAxis: 'wrong', mpeOutputAxis: 'timbre', mpeInputCc: -8, mpeOutputCc: 500,
    mpeOutputChannel: 19, mpeMemberFirst: 15, mpeMemberLast: 2, mpeCollapse: 'highest',
  } });
  assert.equal(mpe.mod.mpeEnabled, true);
  assert.equal(mpe.mod.mpeInput, 'poly aftertouch');
  assert.equal(mpe.mod.mpeOutput, 'mpe');
  assert.equal(mpe.mod.mpeInputAxis, 'pressure', 'unknown axes fall back safely');
  assert.equal(mpe.mod.mpeOutputAxis, 'timbre');
  assert.equal(mpe.mod.mpeInputCc, 0);
  assert.equal(mpe.mod.mpeOutputCc, 127);
  assert.equal(mpe.mod.mpeOutputChannel, 16);
  assert.deepEqual([mpe.mod.mpeMemberFirst, mpe.mod.mpeMemberLast], [2, 15],
    'a reversed member range is normalized into a usable zone');
  assert.equal(mpe.mod.mpeCollapse, 'highest');

  // A slot written before these existed has no mod block at all, and gains a transparent one.
  const old = normalizeMidiSlot({ slotId: 's', type: 'arp' });
  assert.equal(old.mod.echoRepeats, 0, 'an older session migrates by construction');
});

test('Velocity / Expression Designer curves and device ranges are deterministic', () => {
  assert.equal(applyResponseCurve7(60, {
    inputMin: 20, inputMax: 100, outputMin: 30, outputMax: 110,
    curve: 'hard', noteVelocity: true,
  }), 50, 'the hard curve squares a halfway strike inside the two calibrated ranges');
  assert.equal(applyResponseCurve7(60, {
    inputMin: 20, inputMax: 100, outputMin: 0, outputMax: 127, curve: 'linear',
  }), 64);
  assert.ok(applyResponseCurve7(20, { curve: 'soft', noteVelocity: true }) > 20,
    'soft touch makes a light strike more useful');

  const identity = normalizeResponseCurvePoints([]);
  assert.deepEqual(identity, [0, 16, 32, 48, 64, 79, 95, 111, 127]);
  const custom = [0, 0, 0, 0, 127, 127, 127, 127, 127];
  assert.equal(applyResponseCurve7(64, {
    curve: 'custom', points: custom, noteVelocity: true,
  }), 127, 'custom points are interpolated on the same nine-point grid as native');
  assert.equal(responseCurveDisplayPoints('hard')[4], 32,
    'the plotted preset is sampled from the mapping, not a separate drawing guess');

  const shaped = normalizeMidiSlot({ type: 'velocity', fx: {
    responseProfileName: `  ${'x'.repeat(100)}  `,
    velocityCurve: 'custom', velocityInputMin: 116, velocityInputMax: 18,
    velocityOutputMin: 120, velocityOutputMax: 25, velocityCurveValues: custom,
    expressionEnabled: true, expressionSource: 'channel pressure', expressionCurve: 'soft',
    expressionInputMin: 110, expressionInputMax: 4,
    expressionOutputMin: 118, expressionOutputMax: 10,
  } }).fx;
  assert.equal(shaped.responseProfileName.length, 80);
  assert.deepEqual([shaped.velocityInputMin, shaped.velocityInputMax], [18, 116]);
  assert.deepEqual([shaped.velocityOutputMin, shaped.velocityOutputMax], [25, 120]);
  assert.deepEqual([shaped.expressionInputMin, shaped.expressionInputMax], [4, 110]);
  assert.deepEqual([shaped.expressionOutputMin, shaped.expressionOutputMax], [10, 118]);
  assert.deepEqual(shaped.velocityCurveValues, custom);
});

test('Velocity / Expression Designer settings reach the browser-preview MIDI chain', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'velocity' });
  const slotId = state.rack.parts[0].midiChain.at(-1).slotId;
  state = applyMockCommand(state, {
    cmd: 'setMidiSlotOptions', partId, slotId, responseProfileName: 'CTRL49 studio',
    velocityCurve: 'hard', velocityInputMin: 112, velocityInputMax: 12,
    velocityOutputMin: 20, velocityOutputMax: 118,
    expressionEnabled: true, expressionSource: 'cc', expressionCc: 11,
    expressionCurve: 's curve', expressionInputMin: 4, expressionInputMax: 120,
  });
  const configured = state.rack.parts[0].midiChain.at(-1).fx;
  assert.equal(configured.responseProfileName, 'CTRL49 studio');
  assert.equal(configured.velocityCurve, 'hard');
  assert.deepEqual([configured.velocityInputMin, configured.velocityInputMax], [12, 112],
    'the mock mirrors native range ordering immediately');
  assert.equal(configured.expressionEnabled, true);
  assert.equal(configured.expressionSource, 'cc');
  assert.equal(configured.expressionCc, 11);
  assert.equal(configured.expressionCurve, 's curve');
});

test('Strummer plans guitar strokes, harp orders, timing feel and dynamics', () => {
  const chord = [67, 60, 72, 64];
  assert.deepEqual(buildStrumPlan(chord, { pattern: 'outside in', spread: 0.25 })
    .map((event) => event.note), [60, 72, 64, 67]);
  assert.deepEqual(buildStrumPlan(chord, { pattern: 'inside out', spread: 0.25 })
    .map((event) => event.note), [64, 67, 60, 72]);
  assert.deepEqual(buildStrumPlan(chord, { pattern: 'alternate', alternateDown: true })
    .map((event) => event.note), [72, 67, 64, 60]);

  const expressive = buildStrumPlan([60, 64, 67], {
    pattern: 'ascending', spread: 0.5, curve: 1, velocityRamp: -30,
  });
  assert.equal(expressive[0].delayBeats, 0);
  assert.equal(expressive.at(-1).delayBeats, 0.5, 'the named spread remains the total span');
  assert.deepEqual(expressive.map((event) => event.velocity), [100, 98, 70],
    'the curve clusters the early plucks while the velocity ramp reaches its exact endpoint');

  const legacy = normalizeMidiSlot({ type: 'strum', mod: { strumDown: true } });
  assert.equal(legacy.mod.strumPattern, 'descending', 'old sessions retain their stroke direction');

  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'strum' });
  const slotId = state.rack.parts[0].midiChain.at(-1).slotId;
  state = applyMockCommand(state, {
    cmd: 'setMidiSlotOptions', partId, slotId, strumBeats: 0.5,
    strumPattern: 'outside in', strumCurve: 0.65, strumVelocityRamp: -24,
  });
  const configured = state.rack.parts[0].midiChain.at(-1).mod;
  assert.equal(configured.strumPattern, 'outside in');
  assert.equal(configured.strumCurve, 0.65);
  assert.equal(configured.strumVelocityRamp, -24);
});

test('MPE Transformer settings reach the browser-preview MIDI chain', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'mpe' });
  const slotId = state.rack.parts[0].midiChain.at(-1).slotId;
  state = applyMockCommand(state, {
    cmd: 'setMidiSlotOptions', partId, slotId, mpeEnabled: true,
    mpeInput: 'mpe', mpeInputAxis: 'timbre', mpeOutput: 'cc', mpeOutputCc: 11,
    mpeOutputChannel: 16, mpeMemberFirst: 1, mpeMemberLast: 15, mpeCollapse: 'average',
  });
  const configured = state.rack.parts[0].midiChain.at(-1).mod;
  assert.equal(configured.mpeEnabled, true);
  assert.equal(configured.mpeInputAxis, 'timbre');
  assert.equal(configured.mpeOutput, 'cc');
  assert.equal(configured.mpeOutputCc, 11);
  assert.equal(configured.mpeOutputChannel, 16);
  assert.deepEqual([configured.mpeMemberFirst, configured.mpeMemberLast], [1, 15]);
  assert.equal(configured.mpeCollapse, 'average');
});

test('Articulation Manager normalizes maps and emits keyswitch, program and CC actions', () => {
  const slot = normalizeMidiSlot({ slotId: 'a', type: 'articulation', mod: {
    articulationEnabled: true, articulationMapName: `  ${'S'.repeat(90)}  `,
    articulations: [{
      articulationId: 'spiccato', name: 'Spiccato', triggerNote: 200, triggerChannel: 20,
      type: 'program change', outputChannel: 5, program: 200, bankMsb: 3, bankLsb: 9,
    }],
  } });
  assert.equal(slot.mod.articulationEnabled, true);
  assert.equal(slot.mod.articulationMapName.length, 80);
  assert.equal(slot.mod.articulations[0].triggerNote, 127);
  assert.equal(slot.mod.articulations[0].triggerChannel, 16);
  assert.equal(slot.mod.articulations[0].program, 127);
  assert.deepEqual(buildArticulationMessages(slot.mod.articulations[0], 2), [
    { type: 'cc', channel: 5, controller: 0, value: 3 },
    { type: 'cc', channel: 5, controller: 32, value: 9 },
    { type: 'program change', channel: 5, program: 127 },
  ], 'bank select is ordered before the program change');

  assert.deepEqual(buildArticulationMessages({
    type: 'keyswitch', outputChannel: 0, keyswitchNote: 24, keyswitchVelocity: 77,
  }, 4), [
    { type: 'note on', channel: 4, note: 24, velocity: 77 },
    { type: 'note off', channel: 4, note: 24, velocity: 0 },
  ]);
  assert.deepEqual(buildArticulationMessages({
    type: 'cc', outputChannel: 6, controller: 58, controllerValue: 91,
  }, 2), [{ type: 'cc', channel: 6, controller: 58, value: 91 }]);
});

test('Articulation Manager settings reach the browser-preview control stage', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'articulation' });
  const slotId = state.rack.parts[0].midiChain.at(-1).slotId;
  state = applyMockCommand(state, {
    cmd: 'setMidiSlotOptions', partId, slotId,
    articulationEnabled: true, articulationMapName: 'Solo strings',
    articulations: [{
      articulationId: 'legato', name: 'Legato', triggerNote: 12, triggerChannel: 2,
      type: 'keyswitch', outputChannel: 4, keyswitchNote: 24, keyswitchVelocity: 88,
    }],
  });
  const configured = state.rack.parts[0].midiChain.at(-1).mod;
  assert.equal(configured.articulationEnabled, true);
  assert.equal(configured.articulationMapName, 'Solo strings');
  assert.equal(configured.articulations.length, 1);
  assert.deepEqual(configured.articulations[0], {
    articulationId: 'legato', name: 'Legato', triggerNote: 12, triggerChannel: 2,
    type: 'keyswitch', outputChannel: 4, keyswitchNote: 24, keyswitchVelocity: 88,
    program: 0, bankMsb: -1, bankLsb: -1, controller: 0, controllerValue: 127,
  });
});

test('rackCanvasLayout puts columns in signal order, sources first', () => {
  const layout = rackCanvasLayout(canvasRack());
  assert.equal(nodeOf(layout, 'p1').column, 0, 'instruments are the sources');
  assert.equal(nodeOf(layout, 'p2').column, 0);
  assert.equal(nodeOf(layout, 'b1').column, 1, 'a bus sits one past what feeds it');
  assert.equal(nodeOf(layout, 'b2').column, 2, 'and a sub-bus one past that');
  assert.equal(nodeOf(layout, '@master').column, 3, 'the master is last, always');
  assert.ok(nodeOf(layout, 'p1').x < nodeOf(layout, 'b1').x, 'columns turn into left-to-right x');
  assert.equal(nodeOf(layout, 'p1').focused, true, 'the focused part is marked for the drawing');
  assert.equal(nodeOf(layout, 'p1').midi, 2, 'the node counts what is on the part');
  assert.equal(nodeOf(layout, 'p1').inserts, 1);
});

test('rackCanvasLayout reserves the slot a new part would land in', () => {
  const layout = rackCanvasLayout(canvasRack());
  const p1 = nodeOf(layout, 'p1');
  const p2 = nodeOf(layout, 'p2');

  assert.equal(layout.newPartSlot.x, p1.x, 'a new part joins the instrument column');
  assert.equal(layout.newPartSlot.y, p2.y + (p2.y - p1.y),
    'one row below the last part, on the same pitch as the rows above it');
  assert.ok(layout.height >= layout.newPartSlot.y + CANVAS_NODE_H,
    'the canvas already has room for it, so it does not grow the moment a drag starts');

  // An empty rack still offers somewhere to drop, which is the case that matters most: it is
  // the only way to get a first instrument onto the canvas.
  const empty = rackCanvasLayout({ parts: [], buses: [], returns: [] });
  assert.equal(empty.newPartSlot.y, nodeOf(empty, '@master').y,
    'with nothing in the rack the slot sits on the top row, level with the master');
});

test('rackCanvasLayout keeps a box where it was put, and lays out the rest', () => {
  const rack = canvasRack();
  rack.canvasPositions = [{ nodeId: 'p2', x: 640, y: 410 }];
  const layout = rackCanvasLayout(rack);

  const p2 = nodeOf(layout, 'p2');
  assert.equal(p2.x, 640, 'a placed box sits exactly where it was dropped');
  assert.equal(p2.y, 410);
  assert.equal(p2.placed, true, 'and is marked so, which is what offers the reset');

  // The column is a fact about the SIGNAL, not about the picture, so moving a box must not
  // change it — a wire's shape and whether it counts as a skipping run both read it, and
  // taking it from the hand position would redraw the cabling every time a box was nudged.
  assert.equal(p2.column, 0, 'the column still follows the routing, not the position');
  assert.equal(nodeOf(layout, 'p1').placed, false, 'an untouched box is still laid out');
  assert.equal(nodeOf(layout, 'p1').x, rackCanvasLayout(canvasRack()).nodes[0].x,
    'and lands exactly where it did before anything was moved');

  // Returns are placed from the same list, band or no band.
  rack.canvasPositions = [{ nodeId: 'r1', x: 12, y: 900 }];
  const withReturn = rackCanvasLayout(rack);
  assert.equal(nodeOf(withReturn, 'r1').x, 12, 'a return honours a hand position too');
  assert.equal(nodeOf(withReturn, 'r1').y, 900);

  // Garbage in the list is ignored rather than believed: a session is worth more than a box.
  const junk = rackCanvasLayout({ ...canvasRack(), canvasPositions: [{ nodeId: '', x: 1, y: 2 }, null] });
  assert.equal(nodeOf(junk, 'p1').placed, false, 'a nameless position places nothing');

  // A position for something that no longer exists is simply never applied.
  const stale = rackCanvasLayout({ ...canvasRack(), canvasPositions: [{ nodeId: 'gone', x: 5, y: 5 }] });
  assert.ok(stale.nodes.every((n) => !n.placed), 'a stale position moves nothing');
});

test('rackCanvasLayout draws where the signal actually goes', () => {
  const layout = rackCanvasLayout(canvasRack());
  assert.ok(wireOf(layout, 'p1', '@master'), 'a part naming no bus reaches the master itself');
  assert.ok(wireOf(layout, 'p2', 'b1'), 'a part naming a bus goes there and nowhere else');
  assert.equal(wireOf(layout, 'p2', '@master'), undefined, 'and not also to the master');
  assert.equal(wireOf(layout, 'b1', 'b2').kind, 'audio');
  assert.ok(wireOf(layout, 'r1', '@master'), 'a return rejoins the master path');

  assert.equal(wireOf(layout, 'p1', 'r1').kind, 'send', 'a send is drawn as a copy, not a path');
  assert.equal(wireOf(layout, 'p1', 'r2'), undefined, 'a send at zero is not a connection');
});

test('rackCanvasLayout routes a skipping wire below the nodes, never through them', () => {
  const layout = rackCanvasLayout(canvasRack());
  // Two columns skipped: the wire must leave the row, run under everything, and come back up.
  const long = wireOf(layout, 'p1', '@master').d;
  assert.equal((long.match(/V/g) ?? []).length, 2, 'a long run has two vertical moves');
  const lane = Number(long.match(/V (\d+(?:\.\d+)?)/)[1]);
  const deepest = Math.max(...layout.nodes.filter((n) => n.kind !== 'return').map((n) => n.y + 54));
  assert.ok(lane > deepest, 'and its lane sits below every node it passes');

  // One column across: the gap between the two is empty, so the direct shape is honest.
  const short = wireOf(layout, 'p2', 'b1').d;
  assert.equal((short.match(/V/g) ?? []).length, 1, 'an adjacent hop stays a simple jog');

  const verb = nodeOf(layout, 'r1');
  assert.ok(verb.y > lane, 'returns sit below the lanes, so no wire crosses one');
  assert.ok(layout.height >= verb.y + 54, 'and the canvas is tall enough to hold them');
});

test('rackCanvasLayout survives a hand-edited manifest that loops', () => {
  // The model refuses routing cycles where they are made; a file edited by hand can still
  // carry one, and a picture that hangs drawing it is worse than a wrong picture.
  const rack = canvasRack();
  rack.buses = [{ busId: 'b1', name: 'A', destinationBusId: 'b2', effects: [] },
                { busId: 'b2', name: 'B', destinationBusId: 'b1', effects: [] }];
  const layout = rackCanvasLayout(rack);
  assert.equal(layout.nodes.length, 7, 'every node is still drawn');   // 2 parts, 2 buses, 2 returns, master
  assert.ok(layout.wires.length > 0);
  assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));

  // A bus pointed at itself is dropped rather than drawn as a wire to nowhere.
  const selfRack = canvasRack();
  selfRack.buses = [{ busId: 'b1', name: 'A', destinationBusId: 'b1', effects: [] }];
  const selfLayout = rackCanvasLayout(selfRack);
  assert.equal(wireOf(selfLayout, 'b1', 'b1'), undefined);
  assert.ok(wireOf(selfLayout, 'b1', '@master'), 'it falls back to the master, as the loader does');
});

test('rackCanvasLayout draws an empty rack without inventing anything', () => {
  const layout = rackCanvasLayout({});
  assert.equal(layout.nodes.length, 1, 'the master is the only thing a rack always has');
  assert.equal(layout.nodes[0].kind, 'master');
  assert.equal(layout.wires.length, 0);
});

test('busDestinationWouldLoop catches the indirect loop, not just the obvious one', () => {
  const rack = { buses: [{ busId: 'a', destinationBusId: 'b' }, { busId: 'b', destinationBusId: '' },
                         { busId: 'c', destinationBusId: '' }] };
  assert.equal(busDestinationWouldLoop(rack, 'a', 'a'), true, 'a bus into itself');
  assert.equal(busDestinationWouldLoop(rack, 'b', 'a'), true, 'and A into B, then B into A');
  assert.equal(busDestinationWouldLoop(rack, 'c', 'a'), false, 'an unrelated bus is fine');
  assert.equal(busDestinationWouldLoop(rack, 'a', ''), false, 'the master ends every chain');

  // A manifest that already loops must not hang the check that is asked about it.
  const looped = { buses: [{ busId: 'x', destinationBusId: 'y' }, { busId: 'y', destinationBusId: 'x' }] };
  assert.equal(busDestinationWouldLoop(looped, 'x', 'y'), true);
});

test('canvasDropTargets offers only what the engine would accept', () => {
  const rack = {
    parts: [{ partId: 'p1', destinationBusId: 'b1' }, { partId: 'p2', destinationBusId: '' }],
    buses: [{ busId: 'b1', destinationBusId: 'b2' }, { busId: 'b2', destinationBusId: '' },
            { busId: 'b3', destinationBusId: '' }],
  };

  const forPart = canvasDropTargets(rack, { kind: 'part', id: 'p1' });
  assert.deepEqual(forPart, ['b2', 'b3', '@master'], 'every destination except the one it has');
  assert.deepEqual(canvasDropTargets(rack, { kind: 'part', id: 'p2' }), ['b1', 'b2', 'b3'],
    'a part already on the master is not offered the master again');

  const forBus = canvasDropTargets(rack, { kind: 'bus', id: 'b2' });
  assert.deepEqual(forBus, ['b3'],
    'itself, its current destination, and anything that would loop are all off the table');

  assert.deepEqual(canvasDropTargets(rack, { kind: 'instrument', id: 'VST3-x' }), ['p1', 'p2'],
    'an instrument lands on a part, which is what loads it');

  assert.deepEqual(canvasDropTargets(rack, {}), [], 'nothing in flight, nothing lit');
  assert.deepEqual(canvasDropTargets(rack, { kind: 'part', id: 'gone' }), [],
    'a stale payload lights nothing rather than everything');
});

// --- plug-in tiles -------------------------------------------------------------------------------

test('pluginInitials picks the letters a person would', () => {
  assert.equal(pluginInitials('Stage Keys'), 'SK');
  assert.equal(pluginInitials('Nice Reverb', 'Test Audio'), 'NR');
  assert.equal(pluginInitials('Serum'), 'SE', 'one word gives its first two letters');
  assert.equal(pluginInitials('The Legend'), 'LE', 'a leading article says nothing, so it is skipped');
  assert.equal(pluginInitials('VST Machine Two'), 'MT', 'and neither does the format');
  assert.equal(pluginInitials('Pro-53'), 'P5', 'punctuation splits words too');
  assert.equal(pluginInitials('', 'Waves'), 'WA', 'a nameless class falls back to its vendor');
  assert.equal(pluginInitials('', ''), '–', 'and never to an empty square');
});

test('pluginTile is derived from identity, so it never moves under you', () => {
  const a = pluginTile('VST3-good-synth', 'Stage Keys', 'Mock Audio');
  const b = pluginTile('VST3-good-synth', 'Stage Keys', 'Mock Audio');
  assert.deepEqual(a, b, 'the same class gives the same tile, every time');

  // A rename is a display change; the identity did not move, so the tile must not either.
  const renamed = pluginTile('VST3-good-synth', 'Stage Keys mk2', 'Mock Audio');
  assert.equal(renamed.hue, a.hue, 'the colour follows the ceId, not the name');
  assert.equal(renamed.pattern, a.pattern);
  assert.equal(renamed.initials, 'SK', 'only the letters follow the name');

  const other = pluginTile('VST3-other-synth', 'Analog One', 'Mock Audio');
  assert.notEqual(other.hue, a.hue, 'two classes in the same list are told apart');

  assert.ok(TILE_PATTERNS.includes(a.pattern), 'the pattern is one of the known set');
  assert.ok(a.hue >= 0 && a.hue < 360 && a.hue % 15 === 0, 'hues are quantised, so they read as a set');
});

test('a class that shipped artwork carries a route, and the rest carry nothing', () => {
  // The native side publishes a token; a path would mean the resource provider had to serve
  // arbitrary files. So the store passes the route through untouched and invents nothing.
  const shaped = normalizeHostState({
    instruments: [
      { ceId: 'VST3-art', name: 'Arty', snapshotUrl: '/plugin-snapshot/abc123' },
      { ceId: 'VST3-plain', name: 'Plain' },
    ],
    effectClasses: [{ ceId: 'VST3-fx-art', name: 'Verb', snapshotUrl: '/plugin-snapshot/def456' }],
  });
  assert.equal(shaped.instruments[0].snapshotUrl, '/plugin-snapshot/abc123');
  assert.equal(shaped.instruments[1].snapshotUrl, '', 'no artwork is an empty string, not undefined');
  assert.equal(shaped.effectClasses[0].snapshotUrl, '/plugin-snapshot/def456', 'effects too');

  // The lookup a tile reads: parts and canvas nodes know a ceId and nothing else.
  hostStateStore.set(shaped);
  const byCeId = get(pluginSnapshots);
  assert.equal(byCeId['VST3-art'], '/plugin-snapshot/abc123');
  assert.equal(byCeId['VST3-fx-art'], '/plugin-snapshot/def456', 'instruments and effects share one map');
  assert.ok(!('VST3-plain' in byCeId), 'a class with no artwork is absent, so the tile falls back');

  hostStateStore.set(emptyHostState());
  assert.deepEqual(get(pluginSnapshots), {}, 'and the map empties when the catalogue does');
});

test('the browser knows which plug-ins are showing a picture somebody chose', () => {
  // "Revert to its own picture" must only be offered where there is one to go back to, and
  // the four sources are not interchangeable: a capture and a vendor snapshot are the
  // plug-in's, a custom one is the user's, and only the last can be undone.
  const shaped = normalizeHostState({
    instruments: [
      { ceId: 'VST3-mine', snapshotUrl: '/plugin-snapshot/a', artworkSource: 'custom' },
      { ceId: 'VST3-theirs', snapshotUrl: '/plugin-snapshot/b', artworkSource: 'vendor' },
      { ceId: 'VST3-shot', snapshotUrl: '/plugin-snapshot/c', artworkSource: 'capture' },
      { ceId: 'VST3-plain' },
    ],
    effectClasses: [{ ceId: 'VST3-fx-mine', snapshotUrl: '/plugin-snapshot/d', artworkSource: 'custom' }],
  });
  assert.equal(shaped.instruments[3].artworkSource, '', 'no artwork is an empty source, not undefined');

  hostStateStore.set(shaped);
  const custom = get(customArtworkIds);
  assert.ok(custom.has('VST3-mine'), 'a chosen picture is offered a revert');
  assert.ok(custom.has('VST3-fx-mine'), 'effects too');
  assert.ok(!custom.has('VST3-theirs'), "the vendor's own is not something the user can revert");
  assert.ok(!custom.has('VST3-shot'), 'and neither is a capture');
  assert.ok(!custom.has('VST3-plain'));

  hostStateStore.set(emptyHostState());
  assert.equal(get(customArtworkIds).size, 0);
});

test('pluginTile carries a second channel besides colour', () => {
  // Colour alone excludes anyone who cannot separate two hues, so the hash has to spread the
  // patterns as well — a set of classes that all came out "plain" would be colour-only.
  const patterns = new Set();
  for (let i = 0; i < 40; i += 1) patterns.add(pluginTile(`VST3-class-${i}`, `Plug ${i}`).pattern);
  assert.ok(patterns.size >= 3, `patterns actually vary (got ${[...patterns].join(', ')})`);
});

test('pluginTile still answers for a class with nothing to go on', () => {
  const blank = pluginTile('', '', '');
  assert.equal(blank.initials, '–');
  assert.ok(blank.background.startsWith('hsl('), 'and still renders as a tile, not a gap');
});

test('effects browse and drop like instruments, onto anything with a chain', () => {
  const classes = [
    { ceId: 'fx-verb', name: 'Nice Reverb', vendor: 'Test Audio' },
    { ceId: 'fx-comp', name: 'Bus Comp', vendor: 'Other Labs' },
  ];
  assert.equal(filterEffects(classes, '').length, 2, 'no query, no filtering');
  assert.equal(filterEffects(classes, 'verb')[0].ceId, 'fx-verb', 'by name');
  assert.equal(filterEffects(classes, 'other')[0].ceId, 'fx-comp', 'and by vendor');

  const rack = {
    parts: [{ partId: 'p1', destinationBusId: '' }],
    buses: [{ busId: 'b1', destinationBusId: '' }],
    returns: [{ returnId: 'r1' }],
  };
  const targets = canvasDropTargets(rack, { kind: 'effect', id: 'fx-verb' });
  assert.deepEqual(targets, ['p1', 'b1', 'r1', '@master'],
    'an effect goes anywhere that HAS a chain — a part, a bus, a return, the master');

  // A part is a target for both, and they mean different things; the drop handler decides by
  // what is in flight, so the two must not be conflated here.
  assert.deepEqual(canvasDropTargets(rack, { kind: 'instrument', id: 'x' }), ['p1'],
    'an instrument still only lands on a part');
});

// --- the surface as a picture --------------------------------------------------------------------

test('normalizeSurfaceLayout keeps "cannot reach this" as a distinct answer', () => {
  const shaped = normalizeSurfaceLayout({
    profileId: 'akai-ctrl49', displayName: 'M-Audio CTRL49', aspect: '2.31',
    controls: [
      { controlId: 'encoder-1', kind: 'encoder', label: '1', x: 0.1, y: 0.1, w: 0.05, h: 0.1, index: 0 },
      { controlId: 'fader-1', kind: 'fader', label: 'F1', x: 0.2, y: 0.1, w: 0.02, h: 0.2 },
      { controlId: 'pad-1', kind: 'pad', label: '1', x: 0.8, y: 0.4, w: 0.04, h: 0.08, index: 1 },
    ],
  });
  assert.equal(shaped.aspect, 2.31);
  assert.equal(shaped.controls[0].index, 0, 'encoder 0 is a real index, not "missing"');
  assert.equal(shaped.controls[1].index, -1,
    'a control with no index reads as unmapped, never as index 0 — that would claim the first one');
  assert.equal(shaped.controls[2].index, 1);
});

test('normalizeSurfaceLayout groups controls into the regions a person thinks in', () => {
  const shaped = normalizeSurfaceLayout(mockSurfaceLayout());
  const byId = Object.fromEntries(shaped.regions.map((r) => [r.id, r]));

  assert.equal(byId.encoders.count, 8);
  assert.equal(byId.encoders.addressable, 8, 'every encoder can be reached');
  assert.equal(byId.pads.addressable, 8, 'and every pad');
  assert.equal(byId.faders.count, 9, 'all nine faders are drawn');
  assert.equal(byId.faders.addressable, 0, 'and none of them is ours to drive');

  // A region's box has to actually contain its controls, or zooming to it shows the wrong thing.
  const pads = shaped.controls.filter((c) => c.kind === 'pad');
  for (const pad of pads) {
    assert.ok(pad.x >= byId.pads.x && pad.x + pad.w <= byId.pads.x + byId.pads.w,
      `${pad.controlId} is inside the pads region horizontally`);
    assert.ok(pad.y >= byId.pads.y && pad.y + pad.h <= byId.pads.y + byId.pads.h,
      `${pad.controlId} is inside the pads region vertically`);
  }
  assert.ok(byId.pads.w < 1 && byId.pads.h < 1, 'and the region is a crop, not the whole unit');
});

test('a described controller answers with everything the form needs', () => {
  // The point of the whole feature, asserted where it is cheapest: an unknown controller is
  // not unsupported, it is undrawn. Control already worked — MIDI learn binds whatever moves.
  const shaped = normalizeSurfaceLayout({
    profileId: 'user', displayName: 'Advance 49', vendor: 'Described by you', aspect: 2.3,
    controls: [
      { controlId: 'encoder-1', kind: 'encoder', label: '1', x: 0.4, y: 0.1, w: 0.05, h: 0.08, index: 0 },
      { controlId: 'keys', kind: 'keys', label: 'Keys', x: 0, y: 0.6, w: 1, h: 0.35, index: -1 },
    ],
    userSurface: 'Advance 49', userEncoders: 8, userFaders: 4, userPads: 16,
    learning: true, heard: 5,
  });

  assert.equal(shaped.userSurface, 'Advance 49', 'the form can prefill from the answer');
  assert.deepEqual([shaped.userEncoders, shaped.userFaders, shaped.userPads], [8, 4, 16]);
  assert.equal(shaped.learning, true, 'and a running count says it is running');
  assert.equal(shaped.heard, 5, 'with how many it has heard so far');

  // The indices are the whole reason a described controller is not a second-class one: they
  // are what assignment on the drawing and live feedback key off.
  assert.equal(shaped.controls[0].index, 0, 'its knobs address page slots like any other');
  assert.equal(shaped.controls[1].index, -1, 'and its keys are drawn but honestly inert');

  const none = normalizeSurfaceLayout({ controls: [] });
  assert.equal(none.userSurface, '', 'nothing described reads as nothing, not as undefined');
  assert.equal(none.learning, false);
});

test('normalizeSurfaceLayout survives a profile that has no drawing', () => {
  const empty = normalizeSurfaceLayout({});
  assert.deepEqual(empty, emptySurfaceLayout(),
    'no layout is a legal answer — the UI says so rather than drawing nothing');
  assert.deepEqual(normalizeSurfaceLayout(null).regions, [], 'and null is not a crash');
});

// --- Stage 5: effect chains and macros -----------------------------------------------------------

test('normalizeHostState shapes effect chains and macros', () => {
  const shaped = normalizeHostState({
    effectClasses: [{ ceId: 'fx-1', name: 'Verb' }],
    rack: {
      parts: [{ partId: 'p1', effects: [{ effectId: 'e1', pluginName: 'Verb', bypassed: 1 }] }],
      masterEffects: [{ effectId: 'e2', hasProcessor: true }],
      macros: [{ macroId: 'm1', name: 'Bright', value: '0.5',
                 targets: [{ targetId: 'p1', parameterId: 'cutoff', rangeMin: 1.4,
                             rangeMax: -0.2, resolved: true }] }],
    },
  });
  assert.equal(shaped.effectClasses[0].name, 'Verb');
  assert.equal(shaped.rack.parts[0].effects[0].bypassed, false, 'truthy is not true');
  assert.equal(shaped.rack.masterEffects[0].hasProcessor, true);
  assert.equal(shaped.rack.macros[0].value, 0.5);
  assert.equal(shaped.rack.macros[0].targets[0].resolved, true);
  assert.deepEqual(
    [shaped.rack.macros[0].targets[0].rangeMin, shaped.rack.macros[0].targets[0].rangeMax],
    [0, 1], 'macro target ranges clamp and sort while normalizing saved state');
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
  state = applyMockCommand(state, { cmd: 'renameMacro', macroId, name: 'Brightness' });
  assert.equal(state.rack.macros[0].name, 'Brightness');
  state = applyMockCommand(state, { cmd: 'addMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  state = applyMockCommand(state, { cmd: 'addMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.macros[0].targets.length, 1, 'duplicate targets collapse');
  assert.equal(state.rack.macros[0].targets[0].displayName, 'Cutoff');

  state = applyMockCommand(state, { cmd: 'setMacroTargetOptions', macroId,
    targetId: 'mock-part-1', parameterId: 'cutoff', rangeMin: 0.8, rangeMax: 0.2,
    inverted: true });
  assert.deepEqual(
    (({ rangeMin, rangeMax, inverted }) => ({ rangeMin, rangeMax, inverted }))(
      state.rack.macros[0].targets[0]),
    { rangeMin: 0.2, rangeMax: 0.8, inverted: true },
    'each macro destination exposes its own range and direction');

  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 1.7 });
  assert.equal(state.rack.macros[0].value, 1, 'values clamp to 0..1');

  state = applyMockCommand(state, { cmd: 'removeMacroTarget', macroId, targetId: 'mock-part-1', parameterId: 'cutoff' });
  assert.equal(state.rack.macros[0].targets.length, 0);
  state = applyMockCommand(state, { cmd: 'removeMacro', macroId });
  assert.equal(state.rack.macros.length, 0);
});

test('modulation routes normalize their source, destination and bipolar depth', () => {
  const [route] = normalizeHostState({ rack: { modulationRoutes: [{
    routeId: 'route-1', sourceType: 'midiCc', sourceChannel: 99, sourceNumber: 200,
    sourceValue: 0.7, targetId: 'part-1', parameterId: 'cutoff', amount: -2,
    baseValue: 1.4, enabled: false, resolved: false,
  }] } }).rack.modulationRoutes;
  assert.deepEqual(route, {
    routeId: 'route-1', sourceType: 'midiCc', sourceId: '', sourceChannel: 16,
    sourceNumber: 127, sourceValue: 0.7, targetId: 'part-1', parameterId: 'cutoff',
    targetName: '', displayName: '', amount: -1, baseValue: 1, enabled: false,
    resolved: false,
  });
});

test('mock reducer: modulation route lifecycle keeps macro source values live', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Motion' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, {
    cmd: 'addModulationRoute', sourceType: 'macro', sourceId: macroId,
    targetId: 'mock-part-1', parameterId: '@gain', amount: 0.4,
  });
  const routeId = state.rack.modulationRoutes[0].routeId;
  assert.equal(state.rack.modulationRoutes[0].baseValue, 0.5,
    'the part level is remembered as an unmodulated normalized base');

  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.8 });
  assert.equal(state.rack.modulationRoutes[0].sourceValue, 0.8);
  assert.ok(Math.abs(state.rack.parts[0].volume - 1.64) < 0.0001,
    'the mock preview evaluates the route against the normalized part-level base');
  state = applyMockCommand(state, { cmd: 'setModulationRoute', routeId, amount: -4, enabled: false });
  assert.equal(state.rack.modulationRoutes[0].amount, -1);
  assert.equal(state.rack.modulationRoutes[0].enabled, false);
  assert.equal(state.rack.parts[0].volume, 1, 'disabling restores the base');
  state = applyMockCommand(state, { cmd: 'removeModulationRoute', routeId });
  assert.equal(state.rack.modulationRoutes.length, 0);
});

test('MIDI LFOs normalize ranges and safe hardware outputs', () => {
  const [lfo] = normalizeHostState({ rack: { midiLfos: [{
    lfoId: 'lfo-a', name: 'Pulse', shape: 'nonsense', rateHz: 500, syncBeats: 0,
    phaseOffset: 2, minimum: 0.9, maximum: 0.2, value: 3,
    outputs: [{ outputId: 'out-a', type: 'nrpn', channel: 30, number: 30000,
                enabled: true, resolved: false }],
  }] } }).rack.midiLfos;
  assert.equal(lfo.shape, 'sine');
  assert.equal(lfo.rateHz, 40);
  assert.equal(lfo.syncBeats, 1, 'zero falls back before clamping');
  assert.deepEqual([lfo.minimum, lfo.maximum], [0.2, 0.9]);
  assert.equal(lfo.value, 1);
  assert.deepEqual([lfo.outputs[0].channel, lfo.outputs[0].number], [16, 16383]);
  assert.equal(lfo.outputs[0].resolved, false);
});

test('mock MIDI LFO drives a macro through the matrix and configures hardware MIDI safely', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Motion' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.3 });
  state = applyMockCommand(state, { cmd: 'addMidiLfo', name: 'Slow rise' });
  const lfoId = state.rack.midiLfos[0].lfoId;
  state = applyMockCommand(state, {
    cmd: 'setMidiLfo', lfoId, sync: false, rateHz: 1, shape: 'sawUp', minimum: 0, maximum: 1,
  });
  state = applyMockCommand(state, {
    cmd: 'addModulationRoute', sourceType: 'lfo', sourceId: lfoId,
    targetId: macroId, parameterId: '@macro', amount: 0.5,
  });
  state = advanceMockMidiLfos(state, 0.25);
  assert.ok(Math.abs(state.rack.midiLfos[0].phase - 0.25) < 0.0001);
  assert.ok(Math.abs(state.rack.midiLfos[0].value - 0.25) < 0.0001);
  assert.ok(Math.abs(state.rack.macros[0].value - 0.425) < 0.0001,
    'LFO depth is added around the macro base value');

  state.rack.parts[0].hardware = true;
  state.rack.parts[0].midiOutputName = 'External synth';
  state = applyMockCommand(state, {
    cmd: 'addMidiLfoOutput', lfoId, type: 'nrpn', targetPartId: state.rack.parts[0].partId,
    channel: 4, number: 999,
  });
  assert.equal(state.rack.midiLfos[0].outputs[0].enabled, false,
    'new hardware streams never transmit until explicitly enabled');
  const outputId = state.rack.midiLfos[0].outputs[0].outputId;
  state = applyMockCommand(state, {
    cmd: 'setMidiLfoOutput', lfoId, outputId, enabled: true,
  });
  assert.equal(state.rack.midiLfos[0].outputs[0].enabled, true);

  state = applyMockCommand(state, { cmd: 'removeMidiLfo', lfoId });
  assert.equal(state.rack.modulationRoutes[0].resolved, false);
  assert.ok(Math.abs(state.rack.macros[0].value - 0.3) < 0.0001,
    'removing the generator restores the macro base');
});

test('external envelopes normalize their note filters, timing and response safely', () => {
  const [envelope] = normalizeHostState({ rack: { envelopes: [{
    envelopeId: 'env-a', name: 'Pluck', channel: 30, noteLow: 110, noteHigh: 4,
    attackMs: -1, decayMs: 90000, sustain: 2, releaseMs: -5,
    curve: -4, velocityAmount: 7, stage: 'nonsense', value: 3,
  }] } }).rack.envelopes;
  assert.equal(envelope.name, 'Pluck');
  assert.equal(envelope.channel, 16);
  assert.deepEqual([envelope.noteLow, envelope.noteHigh], [4, 110]);
  assert.deepEqual([envelope.attackMs, envelope.decayMs, envelope.releaseMs], [0, 60000, 0]);
  assert.deepEqual([envelope.sustain, envelope.curve, envelope.velocityAmount], [1, -1, 1]);
  assert.deepEqual([envelope.stage, envelope.value, envelope.gate], ['idle', 1, false]);
});

test('mock ADSR follows gate and velocity while driving a macro through the matrix', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Envelope target' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.2 });
  state = applyMockCommand(state, { cmd: 'addEnvelope', name: 'Filter pluck' });
  const envelopeId = state.rack.envelopes[0].envelopeId;
  state = applyMockCommand(state, {
    cmd: 'setEnvelope', envelopeId, channel: 2, noteLow: 48, noteHigh: 84,
    attackMs: 0, decayMs: 0, sustain: 0.6, releaseMs: 0, velocityAmount: 1,
  });
  state = applyMockCommand(state, {
    cmd: 'addModulationRoute', sourceType: 'envelope', sourceId: envelopeId,
    targetId: macroId, parameterId: '@macro', amount: 0.5,
  });
  state = applyMockCommand(state, {
    cmd: 'triggerEnvelope', envelopeId, gate: true, velocity: 0.8,
  });
  state = advanceMockEnvelopes(state, 0);
  assert.equal(state.rack.envelopes[0].stage, 'sustain');
  assert.ok(Math.abs(state.rack.envelopes[0].value - 0.48) < 0.0001);
  assert.ok(Math.abs(state.rack.macros[0].value - 0.44) < 0.0001,
    'the envelope contributes around the authored macro base');

  state = applyMockCommand(state, { cmd: 'triggerEnvelope', envelopeId, gate: false });
  assert.equal(state.rack.envelopes[0].stage, 'idle');
  assert.ok(Math.abs(state.rack.macros[0].value - 0.2) < 0.0001);

  state = applyMockCommand(state, { cmd: 'removeEnvelope', envelopeId });
  assert.equal(state.rack.envelopes.length, 0);
  assert.equal(state.rack.modulationRoutes[0].resolved, false);
  assert.ok(Math.abs(state.rack.macros[0].value - 0.2) < 0.0001);
});

test('MSEGs normalize timing and keep sorted, anchored curve points', () => {
  const [mseg] = normalizeHostState({ rack: { msegs: [{
    msegId: 'mseg-a', name: 'Motion', rateHz: 500, syncBeats: 0, phaseOffset: 4,
    points: [
      { pointId: 'end', position: 2, value: -1, curve: 8 },
      { pointId: 'start', position: -2, value: 3, curve: -8 },
      { pointId: 'middle', position: 0.7, value: 0.4, curve: 0.2 },
    ],
  }] } }).rack.msegs;
  assert.equal(mseg.name, 'Motion');
  assert.deepEqual([mseg.rateHz, mseg.syncBeats, mseg.phaseOffset], [40, 0.03125, 1]);
  assert.deepEqual(mseg.points.map((point) => point.pointId), ['start', 'middle', 'end']);
  assert.deepEqual([mseg.points[0].position, mseg.points.at(-1).position], [0, 1]);
  assert.deepEqual([mseg.points[0].value, mseg.points.at(-1).value], [1, 0]);
  assert.deepEqual([mseg.points[0].curve, mseg.points.at(-1).curve], [-1, 1]);
});

test('mock MSEG evaluates curved segments and drives a macro through the matrix', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'MSEG target' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.2 });
  state = applyMockCommand(state, { cmd: 'addMseg', name: 'Motion' });
  const msegId = state.rack.msegs[0].msegId;
  state = applyMockCommand(state, {
    cmd: 'setMseg', msegId, sync: false, rateHz: 0.01, phaseOffset: 0.5,
    points: [
      { pointId: 'start', position: 0, value: 0, curve: 0 },
      { pointId: 'end', position: 1, value: 1, curve: 1 },
    ],
  });
  state = applyMockCommand(state, { cmd: 'resetMseg', msegId });
  assert.ok(Math.abs(state.rack.msegs[0].value - 0.0625) < 0.0001,
    'curve +1 raises segment progress to the fourth power');
  state = applyMockCommand(state, {
    cmd: 'addModulationRoute', sourceType: 'mseg', sourceId: msegId,
    targetId: macroId, parameterId: '@macro', amount: 0.5,
  });
  assert.ok(Math.abs(state.rack.macros[0].value - 0.23125) < 0.0001);

  state = advanceMockMsegs(state, 0.5);
  assert.ok(state.rack.msegs[0].phase > 0.5, 'free-running MSEG advances in seconds');
  state = applyMockCommand(state, { cmd: 'setMseg', msegId, enabled: false });
  assert.ok(Math.abs(state.rack.macros[0].value - 0.2) < 0.0001);
  state = applyMockCommand(state, { cmd: 'removeMseg', msegId });
  assert.equal(state.rack.modulationRoutes[0].resolved, false);
});

test('random modulators normalize modes, timing, probability and output bounds safely', () => {
  const [random] = normalizeHostState({ rack: { randomModulators: [{
    randomId: 'random-a', name: 'Drift', mode: 'unknown', rateHz: 500, syncBeats: 0,
    seed: -12, probability: 4, smoothing: -2, stepSize: 8, chaos: -1,
    minimum: 0.9, maximum: 0.2,
  }] } }).rack.randomModulators;
  assert.equal(random.name, 'Drift');
  assert.equal(random.mode, 'sampleHold');
  assert.deepEqual([random.rateHz, random.syncBeats, random.seed], [40, 0.03125, 1]);
  assert.deepEqual(
    [random.probability, random.smoothing, random.stepSize, random.chaos], [1, 0, 1, 0]);
  assert.deepEqual([random.minimum, random.maximum], [0.2, 0.9]);
});

test('Scala tunings parse cents, ratios and comments into one safe repeating scale', () => {
  const tuning = parseScalaTuning(`! header comment
Five-limit triad
3
386.3137139
3/2 ! perfect fifth
2/1
`, 'triad.scl');
  assert.equal(tuning.enabled, true);
  assert.equal(tuning.name, 'Five-limit triad');
  assert.equal(tuning.sourceName, 'triad.scl');
  assert.equal(tuning.degreeCount, 3);
  assert.ok(Math.abs(tuning.degreesCents[1] - 386.3137139) < 1e-7);
  assert.ok(Math.abs(tuning.degreesCents[2] - 701.955000865) < 1e-6);
  assert.equal(tuning.periodCents, 1200);
  assert.throws(() => parseScalaTuning('Broken\n2\n100.0\n'), /ends before/);

  const fallback = normalizeMicrotuning({ enabled: true, degreesCents: [0, 500, 400] });
  assert.equal(fallback.enabled, false, 'a corrupt table is not left enabled');
  assert.equal(fallback.degreeCount, 12, 'bad state data falls back to a safe 12-TET table');
});

test('microtuning mock commands preserve rig addressing and opt parts in explicitly', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'setMicrotuning', rootMidiNote: 48,
    referenceFrequency: 442, mtsDeviceId: 12, mtsProgram: 3 });
  state = applyMockCommand(state, { cmd: 'importScalaTuning', sourceName: 'triad.scl', text: `Triad
3
5/4
3/2
2/1` });
  assert.equal(state.rack.microtuning.name, 'Triad');
  assert.equal(state.rack.microtuning.rootMidiNote, 48, 'import changes the scale, not its keyboard map');
  assert.equal(state.rack.microtuning.referenceFrequency, 442);
  assert.equal(state.rack.microtuning.mtsDeviceId, 12);
  assert.equal(state.rack.microtuning.mtsProgram, 3);

  state = applyMockCommand(state, { cmd: 'setPartMicrotuning', partId, enabled: true });
  assert.equal(state.rack.parts[0].microtuningEnabled, true);
  assert.equal(state.rack.parts[0].microtuningError, '');
  state = applyMockCommand(state, { cmd: 'resetMicrotuning' });
  assert.equal(state.rack.microtuning.enabled, false);
  assert.equal(state.rack.microtuning.degreeCount, 12);
  assert.equal(state.rack.microtuning.mtsDeviceId, 12, 'reset keeps the destination address');
});

test('seeded random modes restart exactly and drive a macro through the matrix', () => {
  assert.equal(deterministicRandomUnit(424242, 7, 0xc8013ea4),
    deterministicRandomUnit(424242, 7, 0xc8013ea4));
  assert.notEqual(deterministicRandomUnit(424242, 7, 0xc8013ea4),
    deterministicRandomUnit(424243, 7, 0xc8013ea4));

  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Random target' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.2 });
  state = applyMockCommand(state, { cmd: 'addRandomModulator', name: 'Drift', mode: 'randomWalk' });
  const randomId = state.rack.randomModulators[0].randomId;
  state = applyMockCommand(state, {
    cmd: 'setRandomModulator', randomId, mode: 'randomWalk', sync: false, rateHz: 2,
    seed: 424242, probability: 1, stepSize: 0.3, minimum: 0.1, maximum: 0.9,
  });
  const firstValue = state.rack.randomModulators[0].value;
  state = advanceMockRandomModulators(state, 0.5);
  assert.notEqual(state.rack.randomModulators[0].value, firstValue,
    'the bounded walk takes a deterministic step at the next boundary');
  state = applyMockCommand(state, { cmd: 'resetRandomModulator', randomId });
  assert.ok(Math.abs(state.rack.randomModulators[0].value - firstValue) < 0.000001,
    'restart reproduces the same seed from step zero');

  state = applyMockCommand(state, {
    cmd: 'setRandomModulator', randomId, mode: 'smoothRandom', probability: 1,
    smoothing: 1, rateHz: 1, minimum: 0, maximum: 1,
  });
  const start = state.rack.randomModulators[0].value;
  state = advanceMockRandomModulators(state, 0.5);
  const midway = state.rack.randomModulators[0].value;
  assert.notEqual(midway, start, 'smooth random glides during the decision interval');

  state = applyMockCommand(state, {
    cmd: 'setRandomModulator', randomId, mode: 'sampleHold', probability: 0,
    minimum: 0.1, maximum: 0.9,
  });
  assert.ok(Math.abs(state.rack.randomModulators[0].value - 0.5) < 0.000001,
    'zero chance deliberately holds the neutral value');
  state = applyMockCommand(state, {
    cmd: 'addModulationRoute', sourceType: 'random', sourceId: randomId,
    targetId: macroId, parameterId: '@macro', amount: 0.5,
  });
  assert.ok(Math.abs(state.rack.macros[0].value - 0.45) < 0.000001);

  state = applyMockCommand(state, { cmd: 'setRandomModulator', randomId, enabled: false });
  assert.ok(Math.abs(state.rack.macros[0].value - 0.2) < 0.000001);
  state = applyMockCommand(state, { cmd: 'removeRandomModulator', randomId });
  assert.equal(state.rack.randomModulators.length, 0);
  assert.equal(state.rack.modulationRoutes[0].resolved, false);
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
  state = applyMockCommand(state, { cmd: 'renameReturn', returnId, name: 'Hall' });
  assert.equal(state.rack.returns[0].name, 'Hall');

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

test('normalizeHostState carries a captured patch by name and size, never by bytes', () => {
  const state = normalizeHostState({
    rack: { parts: [{
      partId: 'p1',
      hardware: true,
      hardwarePatchName: 'Brass Pad',
      hardwarePatchBytes: 296,
      hardwareRestore: 'always',
      // The native side never sends this, and a hostile or stale payload that did must not
      // become a field anything downstream can read.
      hardwarePatch: 'AAAA',
    }] },
  });
  const part = state.rack.parts[0];
  assert.equal(part.hardwarePatchName, 'Brass Pad');
  assert.equal(part.hardwarePatchBytes, 296);
  assert.equal(part.hardwareRestore, 'always');
  assert.equal(part.hardwarePatch, undefined, 'the patch bytes are not a field of the state');
});

test('normalizeHostState clamps an unknown restore policy back to asking', () => {
  const state = normalizeHostState({
    rack: { parts: [{ partId: 'p1', hardware: true, hardwareRestore: 'sometimes' }] },
  });
  assert.equal(state.rack.parts[0].hardwareRestore, 'ask',
    'anything but ask/always/never must not become a policy that transmits');
});

test('mock reducer: total recall captures, names, re-policies and forgets a patch', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'setHardwareConfig', partId: 'mock-part-2',
                                    midiOutputId: 'mock-out-1', midiOutputName: 'Juno Out' });
  const patch = () => state.rack.parts[1];
  assert.equal(patch().hardwarePatchBytes, 0, 'a fresh hardware part has no patch');
  assert.equal(patch().hardwareRestore, 'ask', 'and defaults to asking');

  state = applyMockCommand(state, { cmd: 'captureHardwarePatch', partId: 'mock-part-2' });
  assert.equal(patch().hardwarePatchBytes, 0, 'arming alone stores nothing');

  state = applyMockCommand(state, { cmd: 'finishHardwarePatchCapture', partId: 'mock-part-2',
                                    name: 'Brass Pad' });
  assert.equal(patch().hardwarePatchName, 'Brass Pad');
  assert.ok(patch().hardwarePatchBytes > 0, 'finishing keeps what arrived');

  state = applyMockCommand(state, { cmd: 'setHardwareRestorePolicy', partId: 'mock-part-2',
                                    policy: 'always' });
  assert.equal(patch().hardwareRestore, 'always');
  state = applyMockCommand(state, { cmd: 'setHardwareRestorePolicy', partId: 'mock-part-2',
                                    policy: 'whenever' });
  assert.equal(patch().hardwareRestore, 'always', 'an unknown policy changes nothing');

  state = applyMockCommand(state, { cmd: 'clearHardwarePatch', partId: 'mock-part-2' });
  assert.equal(patch().hardwarePatchName, '');
  assert.equal(patch().hardwarePatchBytes, 0);
  assert.equal(patch().hardware, true, 'forgetting the patch keeps the part hardware');
});

test('hardware patches save to the library, load onto hardware parts and refuse plug-ins', () => {
  // Earlier tests reshape the shared store; start from the known two-part mock rack.
  hostStateStore.set(mockHostState());
  requestLibrary('', '');
  const before = get(hostLibrary).records.length;

  setHardwareConfig('mock-part-2', { midiOutputId: 'mock-out-1', midiOutputName: 'Juno Out' });
  hostLastError.set('');
  saveUserPreset('mock-part-2');
  assert.equal(get(hostLibrary).records.length, before, 'nothing captured, nothing saved');
  assert.match(get(hostLastError), /Capture a patch/, 'and it says why');

  captureHardwarePatch('mock-part-2');
  finishHardwarePatchCapture('mock-part-2', 'Brass Pad');
  hostLastError.set('');
  saveUserPreset('mock-part-2');
  const records = get(hostLibrary).records;
  assert.equal(records.length, before + 1, 'a captured patch joins the library');
  const record = records.at(-1);
  assert.equal(record.sourceType, 'hardwarePatch');
  assert.equal(record.instrument, 'Juno Out', 'named after the synth it came from');
  assert.equal(record.name, 'Brass Pad');
  assert.equal(get(hostLastError), '');
  const part2 = get(hostStateStore).rack.parts.find((p) => p.partId === 'mock-part-2');
  assert.equal(part2.presetName, 'Brass Pad', "the part's cursor lands on what it saved");

  // Onto a plug-in part: refused, part untouched.
  const part1Before = { ...get(hostStateStore).rack.parts.find((p) => p.partId === 'mock-part-1') };
  loadLibraryRecord(record.recordId, 'focused', 'mock-part-1');
  assert.match(get(hostLastError), /hardware patch/, 'a plug-in part refuses a hardware patch');
  const part1 = get(hostStateStore).rack.parts.find((p) => p.partId === 'mock-part-1');
  assert.equal(part1.hardware, part1Before.hardware);
  assert.equal(part1.presetName, part1Before.presetName);

  // Add as new part: a hardware part with the patch and no port.
  const partsBefore = get(hostStateStore).rack.parts.length;
  loadLibraryRecord(record.recordId, 'add');
  const added = get(hostStateStore).rack.parts.at(-1);
  assert.equal(get(hostStateStore).rack.parts.length, partsBefore + 1);
  assert.equal(added.hardware, true, 'the new part is hardware');
  assert.equal(added.hardwarePatchName, 'Brass Pad');
  assert.equal(added.hasInstrument, false);
});

test('one part driving another: the source is a field, loops are refused, removal resets', () => {
  let state = mockHostState();
  const [a, b] = state.rack.parts.map((p) => p.partId);
  assert.equal(state.rack.parts[0].midiSourcePartId, '', 'parts start on the keyboard');

  state = applyMockCommand(state, { cmd: 'setPartMidiSource', partId: b, sourcePartId: a });
  assert.equal(state.rack.parts[1].midiSourcePartId, a, 'B takes its MIDI from A');

  assert.equal(midiSourceWouldLoop(state.rack, a, b), true, 'A from B would loop');
  assert.equal(midiSourceWouldLoop(state.rack, a, a), true, 'a part from itself is the shortest loop');
  assert.equal(midiSourceWouldLoop(state.rack, b, ''), false, 'the keyboard ends every chain');
  hostLastError.set('');
  state = applyMockCommand(state, { cmd: 'setPartMidiSource', partId: a, sourcePartId: b });
  assert.equal(state.rack.parts[0].midiSourcePartId, '', 'and the loop is refused');
  assert.match(get(hostLastError), /would loop/);

  state = applyMockCommand(state, { cmd: 'addPart' });
  const c = state.rack.parts[2].partId;
  state = applyMockCommand(state, { cmd: 'setPartMidiSource', partId: c, sourcePartId: b });
  assert.equal(midiSourceWouldLoop(state.rack, a, c), true, 'A from C loops through B');

  state = applyMockCommand(state, { cmd: 'removePart', partId: a });
  assert.equal(state.rack.parts.find((p) => p.partId === b).midiSourcePartId, '',
    'removing A hands B back to the keyboard');
  assert.equal(state.rack.parts.find((p) => p.partId === c).midiSourcePartId, b, 'and leaves C on B');

  const normalized = normalizeHostState({ rack: { parts: [{ partId: 'x', midiSourcePartId: 'y' }] } });
  assert.equal(normalized.rack.parts[0].midiSourcePartId, 'y', 'the field normalizes through');
});

test('layer groups normalize and edit dynamic layers, voice allocation and crossfades', () => {
  const shaped = normalizeHostState({ rack: { layerGroups: [{
    layerGroupId: 'layers', allocation: 'broken', source: 'cc', controller: 999,
    members: [
      { partId: 'a', minimum: 0.8, maximum: 0.2, crossfade: 3 },
      { partId: 'b', minimum: -1, maximum: 2, crossfade: -4 },
    ],
  }] } }).rack.layerGroups[0];
  assert.equal(shaped.allocation, 'all');
  assert.equal(shaped.controller, 127);
  assert.deepEqual([shaped.members[0].minimum, shaped.members[0].maximum,
                    shaped.members[0].crossfade], [0.2, 0.8, 0.5]);

  let state = mockHostState();
  const [a, b] = state.rack.parts.map((part) => part.partId);
  state = applyMockCommand(state, { cmd: 'addLayerGroup', name: 'Strings' });
  assert.equal(state.rack.layerGroups.length, 1);
  const groupId = state.rack.layerGroups[0].layerGroupId;
  assert.deepEqual(state.rack.layerGroups[0].members.map((member) => member.partId), [a, b],
    'a new group claims the first two available keyboard parts');

  state = applyMockCommand(state, { cmd: 'setLayerGroup', layerGroupId: groupId,
    allocation: 'roundRobin', source: 'key' });
  assert.equal(state.rack.layerGroups[0].allocation, 'roundRobin');
  assert.equal(state.rack.layerGroups[0].source, 'key');
  state = applyMockCommand(state, { cmd: 'setLayerMember', layerGroupId: groupId, partId: a,
    minimum: 0.1, maximum: 0.55, crossfade: 0.08 });
  assert.deepEqual(state.rack.layerGroups[0].members[0], {
    ...state.rack.layerGroups[0].members[0], minimum: 0.1, maximum: 0.55, crossfade: 0.08,
  });

  hostLastError.set('');
  state = applyMockCommand(state, { cmd: 'setPartMidiSource', partId: b, sourcePartId: a });
  assert.equal(state.rack.parts[1].midiSourcePartId, '',
    'a grouped destination cannot simultaneously take another part as its source');
  assert.match(get(hostLastError), /Remove that part from its layer/);

  state = applyMockCommand(state, { cmd: 'removePart', partId: a });
  assert.equal(state.rack.layerGroups.length, 0,
    'removing a destination dissolves a group that can no longer allocate');
});

test('patch compare shapes the answer and the preview stands one in', () => {
  const shaped = normalizePatchCompare({ partId: 'p', recordId: 'r', nameA: 'A', nameB: 'B',
    identical: false, messagesA: 2, messagesB: 1, bytesA: 20, bytesB: 10, totalDifferences: 2,
    truncated: 'yes', differences: [{ message: 1, offset: 3, before: 0x10, after: 0x11 }, { offset: 'x' }] });
  assert.equal(shaped.identical, false);
  assert.equal(shaped.truncated, false, 'a string is not true');
  assert.deepEqual(shaped.differences[0], { message: 1, offset: 3, before: 0x10, after: 0x11 });
  assert.deepEqual(shaped.differences[1], { message: 0, offset: 0, before: -1, after: -1 }, 'garbage reads as absent bytes');
  assert.equal(normalizePatchCompare(null), null);

  hostStateStore.set(mockHostState());
  setHardwareConfig('mock-part-2', { midiOutputId: 'mock-out-1', midiOutputName: 'Juno Out' });
  hostLastError.set('');
  hostPatchCompare.set(null);
  compareHardwarePatch('mock-part-2', 'nothing');
  assert.match(get(hostLastError), /no captured patch/, 'nothing captured, nothing to compare');
  assert.equal(get(hostPatchCompare), null);

  captureHardwarePatch('mock-part-2');
  finishHardwarePatchCapture('mock-part-2', 'Brass Pad');
  requestLibrary('', '');
  saveUserPreset('mock-part-2');
  const record = get(hostLibrary).records.at(-1);
  assert.equal(get(hostStateStore).rack.parts[1].hardwarePatchTarget, 'hw:juno out',
    'the part says where its patches are filed');
  assert.equal(record.targetCeId, 'hw:juno out', 'and the saved record is filed there');

  compareHardwarePatch('mock-part-2', record.recordId);
  const same = get(hostPatchCompare);
  assert.equal(same.identical, true, 'the patch against the record it was saved as is identical');
  assert.equal(same.partId, 'mock-part-2');

  captureHardwarePatch('mock-part-2');
  finishHardwarePatchCapture('mock-part-2', 'Brass Pad edited');
  compareHardwarePatch('mock-part-2', record.recordId);
  const changed = get(hostPatchCompare);
  assert.equal(changed.identical, false, 'after an edit they differ');
  assert.ok(changed.differences.length > 0 && changed.totalDifferences === changed.differences.length);
});

test('the keyboard has two sizes, and Range on a part focuses it', () => {
  hostStateStore.set(mockHostState());
  assert.deepEqual(get(hostKeyboardMode), { mode: 'play', partId: '' }, 'play mode by default');
  showPartRange('mock-part-2');
  assert.deepEqual(get(hostKeyboardMode), { mode: 'range', partId: 'mock-part-2' });
  assert.equal(get(hostStateStore).rack.focusedPartId, 'mock-part-2', 'and the part is focused');
  showKeyboardPlay();
  assert.deepEqual(get(hostKeyboardMode), { mode: 'play', partId: '' });
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

// --- Stage 6: the performance system -------------------------------------------------------------

test('normalizeHostState shapes the performance system', () => {
  const shaped = normalizeHostState({
    performance: {
      transport: { playing: 1, tempo: '128', bar: 3, beat: 2, externalClock: true },
      // `playing: 1` is deliberate: the store is strictly boolean, like `scanning` above.
      patterns: [{
        patternId: 'p1', name: 'Riff', swing: '0.25', seed: '37',
        variationGroupId: 'vg1', variationLabel: 'A',
        variationSourcePatternId: 'p1', variationAmount: '0.85',
        lanes: [{ laneId: 'l1', type: 'drum', stepCount: '8', stepsPerBeat: 2, drumNote: 38,
                  resolved: true, lockSourceLaneId: 'source-lane',
                  steps: [{ active: true, note: 40, ratchets: 3, probability: 60 }] }],
      }],
      clips: [{ clipId: 'c1', patternId: 'p1', active: true, phase: 0.5,
                looperLayer: true, overdubPasses: '2', gestureClip: true, gesturePasses: '3',
                frozenMidi: true, frozenFromClipId: 'source', frozenCycles: '4', frozenNoteCount: '17',
                followAction: 'random', followAfterLoops: '4',
                fillPatternId: 'p-fill', fillQuantize: 'beat', fillCc: '80', fillChannel: '2',
                fillActive: true, fillPending: false }],
      scenes: [{ sceneId: 's1', name: 'Verse', clipIds: ['c1'], morphBeats: '4',
                 slots: [{ partId: 'part-1', volume: 1.4, applyVolume: true,
                           pan: -0.3, applyPan: true }],
                 macros: [{ macroId: 'macro-1', value: 0.7 }],
                 parameters: [{ targetId: 'part-1', targetCeId: 'synth-1',
                                parameterId: 'cutoff', value: 0.8 }] }],
      snapshotMorph: { active: true, sceneId: 's1', name: 'Verse',
                       durationBeats: '4', progress: '0.45', targetCount: '4' },
      setlist: { items: [{ itemId: 'i1', name: 'Opener', sceneId: 's1' }], currentIndex: 0 },
      arrangement: {
        items: [{ itemId: 'a1', name: 'Verse x8', sceneId: 's1', bars: '8' }],
        loop: true, playing: true, currentIndex: 0, queuedIndex: 0, progress: '0.5', bar: '4',
      },
      capture: { armed: true, clipId: 'c1', laneId: 'l1' },
      looper: { recording: true, overdubbing: true, targetClipId: 'c1', elapsedSeconds: '3.5' },
      gestures: { recording: true, mode: 'replace', targetClipId: 'c1', pointCount: '12',
                  targetCount: '2', truncated: true },
      performanceTakes: [{ takeId: 'take-1', name: 'Show', createdAt: 'today',
                           durationSeconds: '12.5', midiEventCount: '30', actionCount: '7',
                           truncated: true }],
      performanceRecorder: { recording: true, name: 'Show 2', elapsedSeconds: '3.5',
                             midiEventCount: '8', actionCount: '2' },
      performanceReplay: { state: 'restoring', takeId: 'take-1', name: 'Show',
                           progress: '0.25', degraded: true },
      scales: ['major', 'minor'],
    },
  });

  const perf = shaped.performance;
  assert.equal(perf.transport.playing, false, 'truthy is not true');
  assert.equal(perf.transport.externalClock, true, 'a real boolean passes through');
  assert.equal(perf.transport.tempo, 128);
  assert.equal(perf.patterns[0].swing, 0.25);
  assert.equal(perf.patterns[0].seed, 37);
  assert.equal(perf.patterns[0].variationGroupId, 'vg1');
  assert.equal(perf.patterns[0].variationLabel, 'A');
  assert.equal(perf.patterns[0].variationSourcePatternId, 'p1');
  assert.equal(perf.patterns[0].variationAmount, 0.85);
  assert.equal(perf.patterns[0].lanes[0].type, 'drum');
  assert.equal(perf.patterns[0].lanes[0].lockSourceLaneId, 'source-lane');
  assert.equal(perf.patterns[0].lanes[0].steps[0].ratchets, 3);
  assert.equal(perf.clips[0].phase, 0.5);
  assert.equal(perf.clips[0].looperLayer, true);
  assert.equal(perf.clips[0].overdubPasses, 2);
  assert.equal(perf.clips[0].gestureClip, true);
  assert.equal(perf.clips[0].gesturePasses, 3);
  assert.equal(perf.clips[0].frozenMidi, true);
  assert.equal(perf.clips[0].frozenFromClipId, 'source');
  assert.equal(perf.clips[0].frozenCycles, 4);
  assert.equal(perf.clips[0].frozenNoteCount, 17);
  assert.equal(perf.clips[0].followAction, 'random');
  assert.equal(perf.clips[0].followAfterLoops, 4);
  assert.equal(perf.clips[0].fillPatternId, 'p-fill');
  assert.equal(perf.clips[0].fillQuantize, 'beat');
  assert.equal(perf.clips[0].fillCc, 80);
  assert.equal(perf.clips[0].fillChannel, 2);
  assert.equal(perf.clips[0].fillActive, true);
  assert.equal(perf.scenes[0].clipIds[0], 'c1');
  assert.equal(perf.scenes[0].morphBeats, 4);
  assert.equal(perf.scenes[0].slots[0].pan, -0.3);
  assert.equal(perf.scenes[0].numParameters, 1);
  assert.equal(perf.snapshotMorph.active, true);
  assert.equal(perf.snapshotMorph.progress, 0.45);
  assert.equal(perf.setlist.currentIndex, 0);
  assert.equal(perf.arrangement.items[0].bars, 8);
  assert.equal(perf.arrangement.loop, true);
  assert.equal(perf.arrangement.playing, true);
  assert.equal(perf.arrangement.progress, 0.5);
  assert.equal(perf.capture.armed, true);
  assert.equal(perf.looper.recording, true);
  assert.equal(perf.looper.targetClipId, 'c1');
  assert.equal(perf.gestures.recording, true);
  assert.equal(perf.gestures.mode, 'replace');
  assert.equal(perf.gestures.pointCount, 12);
  assert.equal(perf.gestures.truncated, true);
  assert.equal(perf.performanceTakes[0].durationSeconds, 12.5);
  assert.equal(perf.performanceTakes[0].midiEventCount, 30);
  assert.equal(perf.performanceTakes[0].truncated, true);
  assert.equal(perf.performanceRecorder.recording, true);
  assert.equal(perf.performanceRecorder.actionCount, 2);
  assert.equal(perf.performanceReplay.state, 'restoring');
  assert.equal(perf.performanceReplay.progress, 0.25);
  assert.equal(perf.performanceReplay.degraded, true);
  assert.deepEqual(normalizeHostState({}).performance, emptyPerformance(),
    'an older payload loads clean');
});

test('mock reducer: patterns, lanes and steps', () => {
  let state = mockHostState();
  assert.equal(state.performance.patterns.length, 1, 'the preview ships a pattern to play with');

  state = applyMockCommand(state, { cmd: 'addPattern', name: 'Bass' });
  const patternId = state.performance.patterns[1].patternId;
  assert.equal(state.performance.patterns[1].lanes.length, 1,
    'a new pattern arrives with a lane, like the native side');

  const laneId = state.performance.patterns[1].lanes[0].laneId;
  state = applyMockCommand(state, { cmd: 'setLaneOptions', patternId, laneId, stepCount: 8 });
  assert.equal(state.performance.patterns[1].lanes[0].steps.length, 8, 'resizing keeps the array honest');

  state = applyMockCommand(state, { cmd: 'toggleStep', patternId, laneId, index: 2 });
  assert.equal(state.performance.patterns[1].lanes[0].steps[2].active, true);
  state = applyMockCommand(state, { cmd: 'setStep', patternId, laneId, index: 2, note: 48, ratchets: 4 });
  assert.equal(state.performance.patterns[1].lanes[0].steps[2].note, 48);
  assert.equal(state.performance.patterns[1].lanes[0].steps[2].ratchets, 4);

  // Euclid writes real steps the user can then edit — not a mode.
  state = applyMockCommand(state, { cmd: 'euclidFill', patternId, laneId, pulses: 3 });
  const hits = state.performance.patterns[1].lanes[0].steps.filter((s) => s.active).length;
  assert.equal(hits, 3, 'three pulses over eight steps');

  state = applyMockCommand(state, { cmd: 'clearLane', patternId, laneId });
  assert.equal(state.performance.patterns[1].lanes[0].steps.some((s) => s.active), false);

  state = applyMockCommand(state, { cmd: 'removePattern', patternId });
  assert.equal(state.performance.patterns.length, 1);
});

test('groove templates normalize, import and commit editable timing and accents', () => {
  assert.equal(factoryGrooveTemplates.length, 3);
  const bounded = normalizeGrooveTemplate({
    grooveId: 'wild', name: 'Wild', stepsPerBeat: 99,
    timingOffsets: [-5, 0.25, 8], velocityMultipliers: [0, 1, 9],
  });
  assert.equal(bounded.stepsPerBeat, 16);
  assert.deepEqual(bounded.timingOffsets, [-0.5, 0.25, 0.5]);
  assert.deepEqual(bounded.velocityMultipliers, [0.25, 1, 2]);

  const direct = normalizeHostState({ performance: { patterns: [{
    patternId: 'p', lanes: [{ laneId: 'l', type: 'note', stepsPerBeat: 4, stepCount: 2,
      steps: [{ active: true, velocity: 100 }, { active: true, velocity: 100 }] }],
  }] } }).performance.patterns[0];
  applyGrooveToPattern(direct, factoryGrooveTemplates[1], 0.5, true);
  assert.equal(direct.lanes[0].steps[1].microtiming, 0.12);
  assert.equal(direct.lanes[0].steps[0].velocity, 105);

  let state = mockHostState();
  assert.equal(state.performance.grooves.length, 3, 'factory feels exist in a fresh performance');
  state = applyMockCommand(state, { cmd: 'importGrooveTemplate', name: 'My pocket',
    stepsPerBeat: 4, timingOffsets: [0, .1, -.05, .15],
    velocityMultipliers: [1.1, .9, 1, .85] });
  const custom = state.performance.grooves.at(-1);
  assert.equal(custom.name, 'My pocket');
  assert.equal(custom.source, 'imported');

  state = applyMockCommand(state, { cmd: 'applyGrooveTemplate', patternId: 'mock-pattern-1',
    grooveId: custom.grooveId, amount: 1, applyVelocity: true });
  const pattern = state.performance.patterns[0];
  assert.equal(pattern.appliedGrooveId, custom.grooveId);
  assert.equal(pattern.lanes[0].steps[1].microtiming, 0.1,
    'the committed timing stays visible and editable on the step');

  state = applyMockCommand(state, { cmd: 'removeGrooveTemplate', grooveId: custom.grooveId });
  assert.equal(state.performance.grooves.some((groove) => groove.grooveId === custom.grooveId), false);
  state = applyMockCommand(state, { cmd: 'removeGrooveTemplate',
    grooveId: factoryGrooveTemplates[0].grooveId });
  assert.ok(state.performance.grooves.some((groove) =>
    groove.grooveId === factoryGrooveTemplates[0].grooveId), 'factory feels cannot be removed');
});

test('pattern variations create and safely regenerate related A/B/C/D patterns', () => {
  let state = mockHostState();
  const sourceId = state.performance.patterns[0].patternId;
  const sourceHits = state.performance.patterns[0].lanes[0].steps
    .filter((step) => step.active).length;

  state = applyMockCommand(state,
    { cmd: 'createPatternVariations', patternId: sourceId, amount: 0.85 });
  const family = state.performance.patterns.filter((pattern) => pattern.variationGroupId);
  assert.deepEqual(family.map((pattern) => pattern.variationLabel).sort(), ['A', 'B', 'C', 'D']);
  const sparse = family.find((pattern) => pattern.variationLabel === 'C');
  const fill = family.find((pattern) => pattern.variationLabel === 'D');
  assert.ok(sparse.lanes[0].steps.some((step) => step.active), 'C never empties the phrase');
  assert.ok(sparse.lanes[0].steps.filter((step) => step.active).length < sourceHits,
    'C is a genuinely sparser relative');
  assert.ok(fill.lanes[0].steps.filter((step) => step.active).length > sourceHits,
    'D adds editable notes in the final quarter');

  const idsBefore = family.map((pattern) => pattern.patternId).sort();
  state = applyMockCommand(state,
    { cmd: 'createPatternVariations', patternId: sparse.patternId, amount: 0.25 });
  const regenerated = state.performance.patterns.filter((pattern) => pattern.variationGroupId);
  assert.equal(regenerated.length, 4, 'regeneration replaces B/C/D instead of duplicating them');
  assert.deepEqual(regenerated.map((pattern) => pattern.patternId).sort(), idsBefore,
    'stable pattern ids keep existing clips valid');
  assert.ok(regenerated.every((pattern) => pattern.variationAmount === 0.25));
});

test('generated variation lanes remap locks without inventing locks for fill notes', () => {
  const noteSteps = Array.from({ length: 16 }, (_, index) => ({
    active: index % 4 === 0, note: 60, velocity: 100,
  }));
  const lockSteps = noteSteps.map((step, index) => ({
    active: step.active, value: index / 15,
  }));
  const source = normalizeHostState({ performance: { patterns: [{
    patternId: 'source', name: 'Pulse', seed: 12345,
    variationGroupId: 'family', variationLabel: 'A', variationSourcePatternId: 'source',
    lanes: [
      { laneId: 'notes', type: 'note', stepCount: 16, stepsPerBeat: 4, steps: noteSteps },
      { laneId: 'locks', type: 'parameter', lockSourceLaneId: 'notes',
        stepCount: 16, stepsPerBeat: 4, steps: lockSteps },
    ],
  }] } }).performance.patterns[0];

  const fill = makePatternVariation(source, 'D', 0.85, 'fill');
  assert.equal(fill.lanes[1].lockSourceLaneId, fill.lanes[0].laneId,
    'the generated lock lane targets the generated notes');
  assert.ok(fill.lanes[0].steps[13].active && !fill.lanes[1].steps[13].active,
    'a generated fill note does not acquire a made-up plug-in value');
});

test('mock held fill uses a related pattern only while the button or pedal is down', () => {
  let state = mockHostState();
  const sourceId = state.performance.patterns[0].patternId;
  state = applyMockCommand(state,
    { cmd: 'createPatternVariations', patternId: sourceId, amount: 0.55 });
  state = applyMockCommand(state, { cmd: 'addClip', patternId: sourceId, name: 'Fill test' });
  const clip = state.performance.clips.at(-1);
  const fillPattern = state.performance.patterns.find((pattern) => pattern.variationLabel === 'D');
  assert.equal(clip.fillPatternId, fillPattern.patternId,
    'a variation-family clip defaults to its related D pattern');

  state = applyMockCommand(state, { cmd: 'setClipOptions', clipId: clip.clipId,
    fillQuantize: '1/8', fillCc: 80, fillChannel: 2,
    followAction: 'random', followAfterLoops: 4 });
  state = applyMockCommand(state, { cmd: 'launchClip', clipId: clip.clipId });
  state = applyMockCommand(state, { cmd: 'setPerformanceFill', clipId: clip.clipId, active: true });
  assert.equal(state.performance.clips.at(-1).fillActive, true);
  assert.equal(state.performance.clips.at(-1).fillQuantize, '1/8');
  assert.equal(state.performance.clips.at(-1).fillCc, 80);
  assert.equal(state.performance.clips.at(-1).fillChannel, 2);
  assert.equal(state.performance.clips.at(-1).followAction, 'random');
  assert.equal(state.performance.clips.at(-1).followAfterLoops, 4);
  state = applyMockCommand(state, { cmd: 'setPerformanceFill', clipId: clip.clipId, active: false });
  assert.equal(state.performance.clips.at(-1).fillActive, false,
    'release returns to A without stopping the clip');
  assert.equal(state.performance.clips.at(-1).active, true);
});

test('mock reducer: parameter locks stay linked to their source step', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'addPattern', name: 'Locks' });
  const pattern = state.performance.patterns.at(-1);
  const patternId = pattern.patternId;
  const laneId = pattern.lanes[0].laneId;

  state = applyMockCommand(state, { cmd: 'setStepParameterLock', patternId, laneId, index: 2,
    targetId: 'mock-part-1', parameterId: 'cutoff', value: 0.72 });
  state = applyMockCommand(state, { cmd: 'setStepCcLock', patternId, laneId, index: 2,
    targetPartId: 'mock-part-1', channel: 2, ccNumber: 74, value: 0.5 });

  let locks = state.performance.patterns.at(-1).lanes
    .filter((lane) => lane.lockSourceLaneId === laneId);
  assert.equal(locks.length, 2, 'plug-in and MIDI locks coexist on one step');
  const parameterLock = locks.find((lane) => lane.type === 'parameter');
  const ccLock = locks.find((lane) => lane.type === 'cc');
  assert.equal(parameterLock.steps[2].value, 0.72);
  assert.equal(ccLock.channel, 2);
  assert.equal(ccLock.ccNumber, 74);
  assert.equal(ccLock.steps[2].value, 0.5);

  state = applyMockCommand(state, { cmd: 'setStep', patternId, laneId, index: 2,
    microtiming: 0.125, probability: 80, every: 3, offset: 1 });
  locks = state.performance.patterns.at(-1).lanes
    .filter((lane) => lane.lockSourceLaneId === laneId);
  assert.ok(locks.every((lane) => lane.steps[2].microtiming === 0.125
    && lane.steps[2].probability === 80 && lane.steps[2].every === 3
    && lane.steps[2].offset === 1), 'locks inherit timing and trigger conditions');

  state = applyMockCommand(state, { cmd: 'setLaneOptions', patternId, laneId,
    stepCount: 8, stepsPerBeat: 2, muted: true });
  locks = state.performance.patterns.at(-1).lanes
    .filter((lane) => lane.lockSourceLaneId === laneId);
  assert.ok(locks.every((lane) => lane.stepCount === 8 && lane.stepsPerBeat === 2
    && lane.steps.length === 8 && lane.muted), 'linked lanes follow the source grid and mute');

  state = applyMockCommand(state, { cmd: 'removeStepLock', patternId, laneId, index: 2,
    lockLaneId: parameterLock.laneId });
  assert.equal(state.performance.patterns.at(-1).lanes
    .filter((lane) => lane.lockSourceLaneId === laneId).length, 1,
  'one lock can be removed independently');

  state = applyMockCommand(state, { cmd: 'clearStepLocks', patternId, laneId, index: 2 });
  assert.equal(state.performance.patterns.at(-1).lanes
    .some((lane) => lane.lockSourceLaneId === laneId), false,
  'empty lock lanes are pruned after clearing the step');

  state = applyMockCommand(state, { cmd: 'setStepParameterLock', patternId, laneId, index: 0,
    targetId: 'mock-part-1', parameterId: '@pan', value: 0.25 });
  state = applyMockCommand(state, { cmd: 'clearLane', patternId, laneId });
  assert.equal(state.performance.patterns.at(-1).lanes
    .some((lane) => lane.lockSourceLaneId === laneId), false,
  'clearing the visible lane clears its hidden locks too');
});

test('mock reducer: clips, scenes and the setlist recovery rule', () => {
  let state = mockHostState();
  const patternId = state.performance.patterns[0].patternId;
  state = applyMockCommand(state, { cmd: 'addClip', patternId, name: 'Second' });
  assert.equal(state.performance.clips.length, 2);

  const clipId = state.performance.clips[1].clipId;
  state = applyMockCommand(state, { cmd: 'launchClip', clipId });
  assert.equal(state.performance.clips[1].active, true);

  state = applyMockCommand(state, { cmd: 'setPartMixer', partId: 'mock-part-1',
                                    mute: true, volume: 1.4, pan: -0.35 });
  state = applyMockCommand(state, { cmd: 'addMacro', name: 'Scene motion' });
  const macroId = state.rack.macros[0].macroId;
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.75 });

  state = applyMockCommand(state, { cmd: 'addScene', name: 'Verse' });
  const sceneId = state.performance.scenes[0].sceneId;
  state = applyMockCommand(state, { cmd: 'renameScene', sceneId, name: 'Verse A' });
  assert.equal(state.performance.scenes[0].name, 'Verse A');
  assert.deepEqual(state.performance.scenes[0].clipIds, [clipId],
    'a new scene captures what is running');
  assert.equal(state.performance.scenes[0].numSlots, 2);
  assert.equal(state.performance.scenes[0].numMacros, 1);

  state = applyMockCommand(state, { cmd: 'stopAllClips' });
  state = applyMockCommand(state, { cmd: 'setPartMixer', partId: 'mock-part-1',
                                    mute: false, volume: 0.25, pan: 0.8 });
  state = applyMockCommand(state, { cmd: 'setMacroValue', macroId, value: 0.1 });
  state = applyMockCommand(state, { cmd: 'setSceneOptions', sceneId, morphBeats: 4 });
  state = applyMockCommand(state, { cmd: 'launchScene', sceneId });
  assert.equal(state.performance.clips[1].active, true, 'recalling the scene starts its clips');
  assert.equal(state.performance.clips[0].active, false, 'and stops the ones it omits');
  assert.equal(state.rack.parts[0].mute, true, 'the scene restores discrete mixer state');
  assert.equal(state.rack.parts[0].volume, 1.4, 'and its captured continuous level');
  assert.equal(state.rack.parts[0].pan, -0.35, 'including pan');
  assert.equal(state.rack.macros[0].value, 0.75, 'and all captured macro values');
  assert.equal(state.performance.snapshotMorph.durationBeats, 4);
  assert.equal(state.performance.snapshotMorph.progress, 1,
    'the browser mock lands a morph deterministically instead of owning a clock');

  state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId, name: 'Opener' });
  state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId: 'gone', name: 'Broken' });
  const openerItemId = state.performance.setlist.items[0].itemId;
  state = applyMockCommand(state, { cmd: 'moveSetlistItem', itemId: openerItemId, index: 1 });
  assert.equal(state.performance.setlist.items[1].name, 'Opener', 'songs can be reordered');
  state = applyMockCommand(state, { cmd: 'moveSetlistItem', itemId: openerItemId, index: 0 });
  state = applyMockCommand(state, { cmd: 'setlistGo', index: 0 });
  assert.equal(state.performance.setlist.currentIndex, 0);

  state = applyMockCommand(state, { cmd: 'setlistNext' });
  assert.equal(state.performance.setlist.currentIndex, 0,
    'an item whose scene is gone leaves the rig on the last one that worked');

  state = applyMockCommand(state, { cmd: 'removeClip', clipId });
  assert.equal(state.performance.scenes[0].clipIds.includes(clipId), false,
    'removing a clip takes it out of the scenes that named it');
});

test('snapshot morph interpolation shares one clamped linear position', () => {
  assert.equal(snapshotMorphValue(0.2, 0.8, 0.5), 0.5);
  assert.equal(snapshotMorphValue(0.2, 0.8, -1), 0.2);
  assert.equal(snapshotMorphValue(0.2, 0.8, 3), 0.8);
});

test('mock reducer: song arranger orders scene blocks and plays from any block', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'launchClip', clipId: 'mock-clip-1' });
  state = applyMockCommand(state, { cmd: 'addScene', name: 'Verse' });
  const sceneId = state.performance.scenes[0].sceneId;

  state = applyMockCommand(state, { cmd: 'addArrangementItem', sceneId, name: 'Verse A' });
  state = applyMockCommand(state, { cmd: 'addArrangementItem', sceneId, name: 'Verse B', bars: 8 });
  const second = state.performance.arrangement.items[1];
  state = applyMockCommand(state, { cmd: 'moveArrangementItem', itemId: second.itemId, index: 0 });
  state = applyMockCommand(state, { cmd: 'setArrangementItem', itemId: second.itemId, bars: 12 });
  state = applyMockCommand(state, { cmd: 'setArrangementOptions', loop: true });
  assert.equal(state.performance.arrangement.items[0].name, 'Verse B');
  assert.equal(state.performance.arrangement.items[0].bars, 12);
  assert.equal(state.performance.arrangement.loop, true);

  state = applyMockCommand(state, { cmd: 'startArrangement', index: 0 });
  assert.equal(state.performance.arrangement.playing, true);
  assert.equal(state.performance.arrangement.currentIndex, 0);
  assert.equal(state.performance.clips[0].active, true, 'the block recalls its existing scene');

  state = applyMockCommand(state, { cmd: 'stopArrangement' });
  assert.equal(state.performance.arrangement.playing, false);
  assert.equal(state.performance.clips[0].active, false, 'stop ends the arranged performance');
});

test('mock reducer: MIDI freeze creates a deterministic editable clip', () => {
  let state = mockHostState();
  const sourceClip = state.performance.clips[0];
  state = applyMockCommand(state, { cmd: 'freezeMidiClip', clipId: sourceClip.clipId, cycles: 2 });
  const frozen = state.performance.clips.at(-1);
  const pattern = state.performance.patterns.find((candidate) => candidate.patternId === frozen.patternId);
  assert.equal(frozen.frozenMidi, true);
  assert.equal(frozen.frozenFromClipId, sourceClip.clipId);
  assert.equal(frozen.frozenCycles, 2);
  assert.ok(frozen.frozenNoteCount > 0);
  assert.ok(pattern.lanes.every((lane) => lane.steps.every((step) => step.probability === 100
    && step.ratchets === 1 && step.every === 1)), 'the browser preview removes generation rules');

  state = applyMockCommand(state, { cmd: 'removeClip', clipId: frozen.clipId });
  assert.equal(state.performance.patterns.some((candidate) => candidate.patternId === pattern.patternId), false,
    'a frozen clip owns and removes its private rendered pattern');
});

test('mock reducer: transport, capture and the per-part event chain', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'transportPlay' });
  assert.equal(state.performance.transport.playing, true);
  state = applyMockCommand(state, { cmd: 'setTempo', tempo: 400 });
  assert.equal(state.performance.transport.tempo, 300, 'tempo clamps');
  state = applyMockCommand(state, { cmd: 'transportStop' });
  assert.equal(state.performance.transport.playing, false);
  state = applyMockCommand(state, { cmd: 'setTransportPosition', ppq: 12 });
  state = applyMockCommand(state, { cmd: 'transportContinue' });
  assert.equal(state.performance.transport.playing, true);
  assert.equal(state.performance.transport.positionPpq, 12,
    'Continue preserves the stopped position');
  state = applyMockCommand(state, { cmd: 'transportStop' });
  state = applyMockCommand(state, { cmd: 'transportPlay' });
  assert.equal(state.performance.transport.positionPpq, 0,
    'Play remains the explicit restart action');

  const clipId = state.performance.clips[0].clipId;
  const laneId = state.performance.patterns[0].lanes[0].laneId;
  state = applyMockCommand(state, { cmd: 'armCapture', clipId, laneId });
  assert.equal(state.performance.capture.armed, true);
  state = applyMockCommand(state, { cmd: 'disarmCapture' });
  assert.equal(state.performance.capture.armed, false);

  const patternCount = state.performance.patterns.length;
  const clipCount = state.performance.clips.length;
  state = applyMockCommand(state, { cmd: 'captureRecentMidi', seconds: 30 });
  assert.equal(state.performance.patterns.length, patternCount + 1,
    'retrospective capture creates an ordinary editable pattern');
  assert.equal(state.performance.clips.length, clipCount + 1,
    'and one launchable clip that references it');
  assert.equal(state.performance.capture.lastNoteCount, 4);
  assert.equal(state.performance.capture.lastPatternId,
    state.performance.patterns.at(-1).patternId);

  state = applyMockCommand(state, { cmd: 'startMidiLoop' });
  assert.equal(state.performance.looper.recording, true);
  assert.equal(state.performance.transport.playing, true,
    'starting a first pass also starts the shared transport');
  state = applyMockCommand(state, { cmd: 'finishMidiLoop' });
  const loopLayer = state.performance.clips.find((clip) => clip.looperLayer);
  assert.ok(loopLayer?.active, 'closing the first pass creates and starts an independent layer');

  state = applyMockCommand(state, { cmd: 'startMidiLoop', clipId: loopLayer.clipId });
  assert.equal(state.performance.looper.overdubbing, true);
  state = applyMockCommand(state, { cmd: 'finishMidiLoop' });
  assert.equal(state.performance.clips.find((clip) => clip.clipId === loopLayer.clipId).overdubPasses, 1,
    'finishing an overdub merges one pass without replacing the layer');

  state = applyMockCommand(state, { cmd: 'startGestureRecording', clipId: loopLayer.clipId,
                                    mode: 'overdub' });
  assert.equal(state.performance.gestures.recording, true);
  assert.equal(state.performance.gestures.targetClipId, loopLayer.clipId);
  state = applyMockCommand(state, { cmd: 'finishGestureRecording' });
  assert.equal(state.performance.clips.find((clip) => clip.clipId === loopLayer.clipId).gesturePasses, 1,
    'a gesture pass merges into a MIDI layer');
  assert.ok(state.performance.patterns.find((pattern) => pattern.patternId === loopLayer.patternId)
    .lanes.some((lane) => lane.type === 'parameter' && lane.glide),
  'the recorded movement is editable gliding automation');

  state = applyMockCommand(state, { cmd: 'startGestureRecording' });
  state = applyMockCommand(state, { cmd: 'finishGestureRecording' });
  const gestureClip = state.performance.clips.find((clip) => clip.gestureClip);
  assert.ok(gestureClip?.active, 'a standalone gesture take creates and starts its own clip');
  const gesturePatternId = gestureClip.patternId;
  state = applyMockCommand(state, { cmd: 'clearGestureLanes', clipId: gestureClip.clipId });
  assert.equal(state.performance.patterns.find((pattern) => pattern.patternId === gesturePatternId)
    .lanes.some((lane) => lane.type === 'parameter'), false, 'Clear removes its automation lanes');
  state = applyMockCommand(state, { cmd: 'removeClip', clipId: gestureClip.clipId });
  assert.equal(state.performance.patterns.some((pattern) => pattern.patternId === gesturePatternId), false,
    'removing a private gesture clip removes its private pattern');

  const loopPatternId = loopLayer.patternId;
  state = applyMockCommand(state, { cmd: 'removeMidiLoop', clipId: loopLayer.clipId });
  assert.equal(state.performance.clips.some((clip) => clip.clipId === loopLayer.clipId), false);
  assert.equal(state.performance.patterns.some((pattern) => pattern.patternId === loopPatternId), false,
    'removing a layer also removes its private editable pattern');

  state = applyMockCommand(state, { cmd: 'setPartMidiFx', partId: 'mock-part-1', transpose: 12,
                                    constrainToScale: true, scaleType: 'dorian' });
  assert.equal(state.rack.parts[0].midiFx.transpose, 12);
  assert.equal(state.rack.parts[0].midiFx.scaleType, 'dorian');

  state = applyMockCommand(state, { cmd: 'setPartArp', partId: 'mock-part-1', enabled: true,
                                    mode: 'up-down', octaves: 3 });
  assert.equal(state.rack.parts[0].arp.enabled, true);
  assert.equal(state.rack.parts[0].arp.mode, 'up-down');
  assert.equal(state.rack.parts[0].arp.octaves, 3);
});

test('mock reducer: whole performances record, replay and remove as complete takes', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'startPerformanceRecording', name: 'Friday show' });
  assert.equal(state.performance.performanceRecorder.recording, true);
  assert.equal(state.performance.performanceRecorder.name, 'Friday show');

  state.performance.performanceRecorder.elapsedSeconds = 9.5;
  state.performance.performanceRecorder.midiEventCount = 14;
  state.performance.performanceRecorder.actionCount = 6;
  state = applyMockCommand(state, { cmd: 'finishPerformanceRecording' });
  assert.equal(state.performance.performanceRecorder.recording, false);
  assert.equal(state.performance.performanceTakes.length, 1);
  assert.equal(state.performance.performanceTakes[0].name, 'Friday show');
  assert.equal(state.performance.performanceTakes[0].midiEventCount, 14);

  const takeId = state.performance.performanceTakes[0].takeId;
  state = applyMockCommand(state, { cmd: 'replayPerformanceTake', takeId });
  assert.equal(state.performance.performanceReplay.state, 'playing');
  assert.equal(state.performance.performanceReplay.takeId, takeId);
  state = applyMockCommand(state, { cmd: 'stopPerformanceReplay' });
  assert.equal(state.performance.performanceReplay.state, 'idle');

  state = applyMockCommand(state, { cmd: 'removePerformanceTake', takeId });
  assert.equal(state.performance.performanceTakes.length, 0);
});

// --- Stage 7: the mature generated product ---------------------------------------------------

test('normalizeProduct: the DAW-facing block survives a hostile payload', () => {
  const empty = normalizeProduct(undefined);
  assert.deepEqual(empty, emptyProduct(),
    'nothing at all normalizes to the same shape the view starts from');

  const p = normalizeProduct({
    daw: {
      hostSync: 1, followingHost: 'yes', offlineRender: true,
      latencySamples: '512', tailSeconds: '2.5', outputPairs: '4', masterLevel: '0.5',
      exposedMacros: [
        { index: 0, name: 'Macro 1 — Filter', value: 0.25, bound: true },
        null,
      ],
    },
    restore: { degraded: true, missingInstruments: ['Analog One'], missingEffects: null,
               notes: ['One instrument could not be found.'] },
    platform: { name: 'Windows 11', supported: false,
                rows: [{ id: 'midi', description: 'A MIDI stack', required: true, present: false,
                         detail: 'no devices' }] },
    hardware: { owner: 'another instance', owned: 0 },
    activeHostingIncidents: [{ modulePath: 'C:\\Rusty.vst3', name: 'Rusty', count: '3' }],
    surfaceProfiles: ['akai-ctrl49', 7],
  });

  // Booleans are strictly boolean — a truthy 1 from the bridge is not a `true` the view can
  // pass straight back to `class:on`, and `'yes'` is a string that would light every readout.
  assert.equal(p.daw.hostSync, false, 'a truthy non-boolean is not a boolean');
  assert.equal(p.daw.followingHost, false);
  assert.equal(p.daw.offlineRender, true);
  assert.equal(p.hardware.owned, false);

  assert.equal(p.daw.latencySamples, 512, 'numbers arrive as numbers');
  assert.equal(p.daw.tailSeconds, 2.5);
  assert.equal(p.daw.outputPairs, 4);
  assert.equal(p.daw.masterLevel, 0.5);

  assert.equal(p.daw.exposedMacros.length, 2, 'a hole in the list is still a slot');
  assert.deepEqual(p.daw.exposedMacros[0],
    { index: 0, name: 'Macro 1 — Filter', value: 0.25, bound: true });
  assert.equal(p.daw.exposedMacros[1].bound, false, 'and an empty slot reads as unbound');

  assert.equal(p.restore.degraded, true);
  assert.deepEqual(p.restore.missingInstruments, ['Analog One']);
  assert.deepEqual(p.restore.missingEffects, [], 'a null list is an empty list, not a crash');

  assert.equal(p.platform.supported, false, 'unsupported is only ever an explicit false');
  assert.equal(normalizeProduct({ platform: {} }).platform.supported, true,
    'silence about support is not a claim of failure');
  assert.deepEqual(p.platform.rows[0],
    { id: 'midi', description: 'A MIDI stack', required: true, present: false, detail: 'no devices' });

  assert.equal(p.hardware.owner, 'another instance');
  assert.deepEqual(p.activeHostingIncidents,
    [{ modulePath: 'C:\\Rusty.vst3', name: 'Rusty', count: 3 }]);
  assert.deepEqual(p.surfaceProfiles, ['akai-ctrl49', '7']);
});

test('normalizeHostState carries the product block and the per-part output pair', () => {
  const state = normalizeHostState({
    product: { daw: { latencySamples: 256 }, hardware: { owner: 'this instance', owned: true } },
    rack: { parts: [{ partId: 'p1', outputPair: 3 }, { partId: 'p2' }] },
  });
  assert.equal(state.product.daw.latencySamples, 256);
  assert.equal(state.product.hardware.owned, true);
  assert.equal(state.rack.parts[0].outputPair, 3, 'routing is part of what the view renders');
  assert.equal(state.rack.parts[1].outputPair, 0, 'and defaults to the main pair');

  assert.deepEqual(emptyHostState().product, emptyProduct(),
    'the empty state is the same shape, so the panel renders before the first push');
});

test('mock reducer: master level, output pairs, hardware focus and the incident log', () => {
  let state = mockHostState();
  assert.equal(state.product.daw.outputPairs, 1);
  assert.equal(state.product.daw.exposedMacros.length, 16,
    'sixteen slots exist whether or not the rack has filled them');

  state = applyMockCommand(state, { cmd: 'setMasterLevel', level: 5 });
  assert.equal(state.product.daw.masterLevel, 2, 'master level clamps at the top');
  state = applyMockCommand(state, { cmd: 'setMasterLevel', level: -1 });
  assert.equal(state.product.daw.masterLevel, 0, 'and at the bottom');

  state = applyMockCommand(state, { cmd: 'setOutputPairs', pairs: 4 });
  state = applyMockCommand(state, { cmd: 'setPartOutputPair', partId: 'mock-part-1', pair: 3 });
  assert.equal(state.rack.parts[0].outputPair, 3);

  state = applyMockCommand(state, { cmd: 'setPartOutputPair', partId: 'mock-part-2', pair: 99 });
  assert.equal(state.rack.parts[1].outputPair, 3, 'a pair past the end clamps to the last one');

  // Narrowing the rack's outputs cannot leave a part pointing at a pair that no longer exists.
  state = applyMockCommand(state, { cmd: 'setOutputPairs', pairs: 1 });
  assert.equal(state.product.daw.outputPairs, 1);
  assert.equal(state.rack.parts[0].outputPair, 0, 'a part routed past the new end falls back');
  assert.equal(state.rack.parts[1].outputPair, 0);

  state = applyMockCommand(state, { cmd: 'setOutputPairs', pairs: 99 });
  assert.equal(state.product.daw.outputPairs, 8, 'output pairs clamp too');

  state = applyMockCommand(state, { cmd: 'claimHardwareSurface' });
  assert.deepEqual(state.product.hardware, { owner: 'this instance', owned: true });
  state = applyMockCommand(state, { cmd: 'releaseHardwareSurface' });
  assert.deepEqual(state.product.hardware, { owner: 'nobody', owned: false },
    'releasing hands the surface back rather than leaving it named after us');

  state.product.activeHostingIncidents = [{ modulePath: 'C:\\Rusty.vst3', name: 'Rusty', count: 2 }];
  state = applyMockCommand(state, { cmd: 'clearActiveHostingIncidents' });
  assert.deepEqual(state.product.activeHostingIncidents, [],
    'the evidence log is clearable — it informs a decision, it is not a permanent accusation');
});


// --- §17: safe startup, recovery and the support bundle ---------------------------------------

test('normalizeReliability: safe startup and the recovery report survive a hostile payload', () => {
  assert.deepEqual(normalizeReliability(undefined), emptyReliability(),
    'nothing at all normalizes to the shape the panel starts from');

  const r = normalizeReliability({
    safeMode: {
      level: 'skipSuspects',
      suspects: [
        { modulePath: 'C:\\Rusty.vst3', name: 'Rusty', reason: 'live when it died', incidents: '3' },
        null,
      ],
    },
    refusedThisRun: [{ modulePath: 'C:\\Rusty.vst3', name: 'Rusty', reason: 'not loaded' }],
    recovery: {
      interrupted: 1, lastOperation: 'loadInstrument', lastOperationDetail: 'Rusty',
      preservedStateFile: 'C:\\crash-state\\session.json', hasLastKnownGood: true,
      lastKnownGoodAt: '2026-08-27T10:00:00',
    },
    damagedState: ['Part 1 state mismatch', 7],
    automaticFailover: {
      isolationAvailable: true, enabled: false, maxAttempts: '9', retryDelayMs: '20',
      events: [
        { targetId: 'part-1', name: 'Rusty', effect: false, state: 'waiting',
          attempts: '2', error: 'processor exception', nextAttemptMs: '-10' },
        { targetId: '', state: 'future-state' },
      ],
    },
  });

  assert.equal(r.safeMode.level, 'skipSuspects');
  assert.equal(r.safeMode.suspects.length, 2, 'a hole in the list is still an entry');
  assert.equal(r.safeMode.suspects[0].incidents, 3, 'counts arrive as numbers');
  assert.equal(r.safeMode.suspects[1].modulePath, '', 'and an empty one is inert, not a crash');

  // Strictly boolean, like every other flag the panel passes to `class:`.
  assert.equal(r.recovery.interrupted, false, 'a truthy 1 is not a boolean');
  assert.equal(r.recovery.hasLastKnownGood, true);
  assert.equal(r.recovery.lastOperation, 'loadInstrument');
  assert.deepEqual(r.damagedState, ['Part 1 state mismatch', '7']);
  assert.equal(r.automaticFailover.enabled, false);
  assert.equal(r.automaticFailover.isolationAvailable, true,
    'the panel only claims process isolation when the native runtime confirms its worker');
  assert.equal(r.automaticFailover.maxAttempts, 5, 'attempt policy is clamped');
  assert.equal(r.automaticFailover.retryDelayMs, 100, 'retry delay is clamped');
  assert.equal(r.automaticFailover.events.length, 1, 'events without a target are inert');
  assert.equal(r.automaticFailover.events[0].attempts, 2);
  assert.equal(r.automaticFailover.events[0].nextAttemptMs, 0);

  // An unrecognised level reads as normal, exactly as the native side reads it: a state file
  // from a future build must not leave the panel claiming a safe mode it cannot explain.
  assert.equal(normalizeReliability({ safeMode: { level: 'quarantineEverything' } }).safeMode.level,
    'normal', 'an unknown level reads as normal');
  assert.equal(normalizeReliability({ safeMode: { level: 'noThirdParty' } }).safeMode.level,
    'noThirdParty', 'a known one is kept');
});

test('normalizeHostState carries the reliability block and each module\'s availability', () => {
  const state = normalizeHostState({
    reliability: { safeMode: { level: 'noThirdParty' } },
    modules: [
      { path: 'C:\\Old.vst3', architectures: ['x86'], unavailableReason: 'built for x86, this host is x86_64' },
      { path: 'C:\\Fine.vst3' },
    ],
  });

  assert.equal(state.reliability.safeMode.level, 'noThirdParty');
  assert.deepEqual(state.modules[0].architectures, ['x86']);
  assert.match(state.modules[0].unavailableReason, /x86_64/,
    'the reason a module is not on offer reaches the view');
  assert.equal(state.modules[1].unavailableReason, '', 'a healthy module has none');

  assert.deepEqual(emptyHostState().reliability, emptyReliability(),
    'the empty state is the same shape, so the panel renders before the first push');
});

test('normalizeSupportBundle: a preview is not a written file', () => {
  assert.deepEqual(normalizeSupportBundle(undefined), emptySupportBundle());

  const preview = normalizeSupportBundle({
    entries: [
      { name: 'support-manifest.json', description: 'What this is', sizeBytes: '0', included: true },
      { name: 'crash-state/', description: 'None recorded', included: false },
    ],
    includeStateBlobs: false,
    includeWorkerDumps: true,
  });

  assert.equal(preview.entries.length, 2);
  assert.equal(preview.entries[0].sizeBytes, 0, 'sizes arrive as numbers');
  assert.equal(preview.entries[1].included, false, 'an entry that does not apply is still shown');
  assert.equal(preview.includeWorkerDumps, true,
    'the review remembers the separate opt-in for memory-bearing worker dumps');
  assert.equal(preview.written, false,
    'a payload with no `written` is a preview — the panel must not claim a file exists');
  assert.equal(preview.path, '');

  const exported = normalizeSupportBundle({ entries: [], written: true, path: 'C:\\bundle.zip' });
  assert.equal(exported.written, true);
  assert.equal(exported.path, 'C:\\bundle.zip');
});

test('mock reducer: safe startup levels, vouching, and the recovery notice', () => {
  let state = mockHostState();
  assert.equal(state.reliability.safeMode.level, 'normal');

  // A wrong-architecture module is catalogued and out of the browser, with its reason.
  const unavailable = state.modules.filter((m) => m.unavailableReason);
  assert.ok(unavailable.length >= 2, 'the mock carries a quarantined and a wrong-architecture module');
  assert.ok(unavailable.some((m) => /x86/.test(m.unavailableReason)),
    'and the architecture one says which architecture');

  state = applyMockCommand(state, { cmd: 'setSafeMode', level: 'noThirdParty' });
  assert.equal(state.reliability.safeMode.level, 'noThirdParty');
  state = applyMockCommand(state, { cmd: 'setSafeMode', level: 'nonsense' });
  assert.equal(state.reliability.safeMode.level, 'normal', 'an unknown level falls back to normal');

  // Vouching: the native rule is that skipSuspects with nothing left to skip drops back, but a
  // safe mode the user chose is theirs to end.
  state.reliability.safeMode = {
    level: 'skipSuspects',
    suspects: [
      { modulePath: 'C:\\A.vst3', name: 'A', reason: 'live when it died', incidents: 1 },
      { modulePath: 'C:\\B.vst3', name: 'B', reason: 'live when it died', incidents: 2 },
    ],
  };
  state = applyMockCommand(state, { cmd: 'clearSafeModeSuspect', modulePath: 'C:\\A.vst3' });
  assert.equal(state.reliability.safeMode.suspects.length, 1, 'clearing removes just that one');
  assert.equal(state.reliability.safeMode.level, 'skipSuspects', 'and the level holds while one remains');

  state = applyMockCommand(state, { cmd: 'clearSafeModeSuspect', modulePath: 'C:\\B.vst3' });
  assert.equal(state.reliability.safeMode.level, 'normal',
    'the level drops back once there is nothing to skip');

  state = applyMockCommand(state, { cmd: 'setSafeMode', level: 'noThirdParty' });
  state = applyMockCommand(state, { cmd: 'clearAllSafeModeSuspects' });
  assert.equal(state.reliability.safeMode.level, 'noThirdParty',
    'clearing suspects leaves a safe mode the user chose alone');

  // The recovery notice clears; the standing offer does not.
  state.reliability.recovery = {
    interrupted: true, lastOperation: 'loadInstrument', lastOperationDetail: 'Rusty',
    preservedStateFile: 'C:\\crash-state\\session.json', hasLastKnownGood: true,
    lastKnownGoodAt: '2026-08-27T10:00:00',
  };
  state = applyMockCommand(state, { cmd: 'acknowledgeRecovery' });
  assert.equal(state.reliability.recovery.interrupted, false, 'acknowledging clears the notice');
  assert.equal(state.reliability.recovery.hasLastKnownGood, true,
    'but the known-good offer stands — it is a state, not a message');

  state.reliability.damagedState = ['Part 1 state mismatch'];
  state = applyMockCommand(state, { cmd: 'restoreLastKnownGood' });
  assert.deepEqual(state.reliability.damagedState, [],
    'going back to a rig that booted clears what the damaged one reported');

  state.reliability.automaticFailover.events = [{
    targetId: 'part-1', name: 'Rusty', effect: false, state: 'waiting', attempts: 0,
    error: 'processor exception', nextAttemptMs: 500,
  }];
  state = applyMockCommand(state, { cmd: 'setAutomaticFailover', enabled: false,
                                    maxAttempts: 8, retryDelayMs: 20 });
  assert.equal(state.reliability.automaticFailover.enabled, false);
  assert.equal(state.reliability.automaticFailover.maxAttempts, 5);
  assert.equal(state.reliability.automaticFailover.retryDelayMs, 100);
  assert.equal(state.reliability.automaticFailover.events[0].state, 'bypassed',
    'disabling automatic recovery exposes a pending incident for manual repair');
  assert.equal(state.reliability.automaticFailover.events[0].nextAttemptMs, 0);
  state = applyMockCommand(state, { cmd: 'retryFailedProcessor', targetId: 'part-1' });
  assert.equal(state.reliability.automaticFailover.events[0].state, 'recovered',
    'manual recovery stays available while automatic attempts are disabled');
  state = applyMockCommand(state, { cmd: 'dismissFailoverEvent', targetId: 'part-1' });
  assert.equal(state.reliability.automaticFailover.events.length, 0);
});


// --- §19 "Trust": the licence block -----------------------------------------------------------

test('normalizeLicence: an unknown edition never locks the product, and it always runs', () => {
  assert.deepEqual(normalizeLicence(undefined), emptyLicence(),
    'nothing at all normalizes to the free edition, which is a working product');

  const l = normalizeLicence({
    edition: 'pro', editionLabel: 'Pro', state: 'updatesExpired',
    detail: 'Licensed. Updates released after 1 January 2027 are not included.',
    licensee: 'A Customer', orderId: 'ORD-1', updatesUntil: '2027-01-01T00:00:00.000Z',
    updatesIncluded: false, runnable: true,
    maxLoadedParts: 1024, loadedParts: '3',
    seatsAllowed: '3', seatsUsed: 1, activatedHere: 1,
    seats: [{ fingerprint: 'abcd1234', machineName: 'Studio', firstSeen: '2026-01-01T00:00:00.000Z',
              lastSeen: '2026-02-01T00:00:00.000Z', isThisMachine: true }, null],
    features: [{ feature: 'patternEngine', allowed: true }, { feature: 'advancedRouting' }],
    neverGated: ['VST3 hosting', 7],
  });

  assert.equal(l.edition, 'pro');
  assert.equal(l.state, 'updatesExpired');
  assert.equal(l.updatesIncluded, false, 'a lapsed entitlement is reported');
  assert.equal(l.runnable, true, 'and the application still runs');
  assert.equal(l.loadedParts, 3, 'numbers arrive as numbers');
  assert.equal(l.seatsAllowed, 3);
  assert.equal(l.activatedHere, false, 'a truthy 1 is not a boolean');
  assert.equal(l.seats.length, 2, 'a hole in the seat list is still a row');
  assert.equal(l.seats[0].isThisMachine, true);
  assert.equal(l.features[1].allowed, false, 'a feature with no verdict is not allowed');
  assert.deepEqual(l.neverGated, ['VST3 hosting', '7']);

  // The two readings that must fail safe, because §27 forbids the alternatives.
  assert.equal(normalizeLicence({ edition: 'enterprise' }).edition, 'free',
    'an edition this build does not know reads as free, not as a lockout');
  assert.equal(normalizeLicence({ state: 'revoked' }).state, 'unlicensed',
    'and an unknown state reads as unlicensed rather than as something the panel cannot explain');
  assert.equal(normalizeLicence({}).runnable, true,
    'a payload that says nothing about running means it runs');
  assert.equal(normalizeLicence({ runnable: false }).runnable, false,
    'only an explicit false says otherwise, and nothing native ever sends one');
  assert.equal(normalizeLicence({}).updatesIncluded, true,
    'and silence about updates is not a lapse');
});

test('normalizeHostState carries the licence block', () => {
  const state = normalizeHostState({
    licence: { edition: 'core', editionLabel: 'Core', state: 'licensed', seatsAllowed: 3 },
  });
  assert.equal(state.licence.edition, 'core');
  assert.equal(state.licence.seatsAllowed, 3);
  assert.deepEqual(emptyHostState().licence, emptyLicence(),
    'the empty state is the same shape, so the panel renders before the first push');
});

test('mock reducer: the browser preview does not pretend to verify a licence', () => {
  let state = mockHostState();
  assert.equal(state.licence.edition, 'free', 'the preview is an unlicensed install');
  assert.equal(state.licence.runnable, true, 'which runs');
  assert.ok(state.licence.neverGated.length >= 8,
    'and lists what no edition may withhold');
  assert.ok(state.licence.features.every((f) => !f.allowed),
    'with the Pro systems shown as not included');

  // A signature check needs a key and crypto, and the browser preview has neither. Accepting
  // a pasted file here would make the mock the one place in the product where an unsigned
  // licence works — which is precisely the thing that must never be mocked.
  state = applyMockCommand(state, { cmd: 'installLicence', text: '{"licence":{"edition":"pro"}}' });
  assert.equal(state.licence.edition, 'free', 'a pasted licence does not upgrade the preview');
  assert.match(state.licence.detail, /verified by the native side/,
    'and it says why rather than failing silently');

  state = applyMockCommand(state, { cmd: 'removeLicence' });
  assert.equal(state.licence.edition, 'free', 'removing leaves it free');
  assert.equal(state.licence.runnable, true, 'and still running');
});


test('mock reducer: load with no part creates the part it loads into', () => {
  let state = mockHostState();
  const before = state.rack.parts.length;

  // The first click an empty rack sees is Load on an instrument. The native side creates and
  // focuses a part for it; the mock mirrors that so the browser preview behaves like the app.
  state = applyMockCommand(state, { cmd: 'loadInstrument', ceId: 'mock-analog', partId: '' });
  assert.equal(state.rack.parts.length, before + 1, 'a part is created');
  const created = state.rack.parts[state.rack.parts.length - 1];
  assert.equal(created.hasInstrument, true, 'holding the instrument');
  assert.equal(created.pluginName, 'Analog One');
  assert.equal(state.rack.focusedPartId, created.partId, 'and focused');

  // A stale explicit id is still a no-op, not a new part: that is a UI out of date.
  const parts = state.rack.parts.length;
  state = applyMockCommand(state, { cmd: 'loadInstrument', ceId: 'mock-analog', partId: 'gone' });
  assert.equal(state.rack.parts.length, parts, 'an unknown explicit part creates nothing');

  // The keyboard's command is accepted quietly — a browser has nothing to sound.
  const untouched = JSON.stringify(state.rack.parts);
  state = applyMockCommand(state, { cmd: 'hostNote', note: 60, velocity: 100, on: true });
  assert.equal(JSON.stringify(state.rack.parts), untouched, 'a note leaves the rack alone');
});


test('hostMidiActivity: every arrival bumps seq so identical notes still flash', () => {
  // The store side is a plain accumulator; the native side already proves filtering and
  // edge-triggering. What matters here is that two identical messages are distinguishable,
  // because the view flashes on seq and a keyboard test is exactly "hit the same key twice".
  let value;
  const unsubscribe = hostStateStore.subscribe(() => {});
  unsubscribe();
  let activity = { device: '', text: '', seq: 0 };
  const apply = (payload) => {
    activity = { device: String(payload?.device ?? ''), text: String(payload?.text ?? ''),
                 seq: activity.seq + 1 };
  };
  apply({ device: 'Test Keys', text: 'C4 on, velocity 96' });
  apply({ device: 'Test Keys', text: 'C4 on, velocity 96' });
  assert.equal(activity.seq, 2, 'the same note twice is two arrivals');
  assert.equal(activity.device, 'Test Keys');
  value = activity;
  assert.ok(value.text.includes('C4'));
});

test('normalizeHostSurface shapes broker payloads and fails safe on garbage', () => {
  // The broker's own vocabulary passes through untouched.
  assert.deepEqual(
    normalizeHostSurface({ state: 'connected', detail: 'ready', device: 'CTRL49 USB',
                           pageIndex: 2, activeSlot: 5, padBank: 1,
                           movementSeq: 12, movingSlot: 5 }),
    { state: 'connected', detail: 'ready', device: 'CTRL49 USB',
      pageIndex: 2, activeSlot: 5, padBank: 1, movementSeq: 12, movingSlot: 5 });
  assert.deepEqual(
    normalizeHostSurface({ state: 'heldElsewhere', detail: '', device: '' }),
    { state: 'heldElsewhere', detail: '', device: '', pageIndex: 0, activeSlot: 0, padBank: 0,
      movementSeq: 0, movingSlot: -1 });

  // Anything else — unknown states, missing fields, non-objects — lands on searching,
  // because a status row must never be the thing that crashes the devices panel.
  assert.equal(normalizeHostSurface({ state: 'exploded' }).state, 'searching');
  assert.deepEqual(normalizeHostSurface(null),
    { state: 'searching', detail: '', device: '', pageIndex: 0, activeSlot: 0, padBank: 0,
      movementSeq: 0, movingSlot: -1 });
  assert.deepEqual(normalizeHostSurface('nonsense'),
    { state: 'searching', detail: '', device: '', pageIndex: 0, activeSlot: 0, padBank: 0,
      movementSeq: 0, movingSlot: -1 });
  assert.equal(normalizeHostSurface({ detail: 7, device: 9 }).detail, '7');
  assert.deepEqual(
    normalizeHostSurface({ pageIndex: 99, activeSlot: -4, padBank: 8 }),
    { state: 'searching', detail: '', device: '', pageIndex: 3, activeSlot: 0, padBank: 3,
      movementSeq: 0, movingSlot: -1 },
    'hardware indices clamp to the physical surface');
});

test('slots normalize their MIDI-learn binding and default to unbound', () => {
  const shaped = normalizeHostState({ rack: { pages: [{ pageId: 'p', slots: [
    { slotId: 's1', midiCc: 21, midiChannel: 1 },
    { slotId: 's2' },
    { slotId: 's3', midiCc: 900, midiChannel: -4 },
  ] }] } });
  const [a, b, c] = shaped.rack.pages[0].slots;
  assert.equal(a.midiCc, 21);
  assert.equal(a.midiChannel, 1);
  assert.equal(b.midiCc, -1, 'an absent binding reads unbound');
  assert.equal(b.midiChannel, 0);
  assert.equal(c.midiCc, 127, 'garbage clamps instead of crashing');
  assert.equal(c.midiChannel, 0);
});

test('normalizeMidiLearn shapes the arming event and fails safe', () => {
  assert.deepEqual(normalizeMidiLearn({ armed: true, pageId: 'p', slotId: 's1' }),
                   { armed: true, pageId: 'p', slotId: 's1', cc: -1, note: -1 });
  assert.deepEqual(normalizeMidiLearn(null), { armed: false, pageId: '', slotId: '', cc: -1, note: -1 });
  assert.deepEqual(normalizeMidiLearn({ armed: 'yes' }), { armed: false, pageId: '', slotId: '', cc: -1, note: -1 });
  // What bound: a controller, or a pad's note — never both, and -1 for whichever it was not.
  assert.deepEqual(normalizeMidiLearn({ armed: false, pageId: 'p', slotId: 'pad-6', cc: -1, note: 36 }),
                   { armed: false, pageId: 'p', slotId: 'pad-6', cc: -1, note: 36 });
  assert.equal(normalizeMidiLearn({ note: 'C2' }).note, -1, 'a note that is not a number is no note');
});

test('mock reducer: MIDI learn binds a controller, steals it on re-learn, clear unbinds', () => {
  let state = normalizeHostState({});
  state = applyMockCommand(state, { cmd: 'addControlPage', name: 'Live' });
  const pageId = state.rack.pages[0].pageId;

  state = applyMockCommand(state, { cmd: 'learnControlSlotMidi', pageId, slotId: 's1' });
  assert.equal(state.rack.pages[0].slots[0].midiCc, 20, 'the mock hears a knob at once');
  assert.equal(state.rack.pages[0].slots[0].midiChannel, 1);

  // Learning the same controller on another slot moves it — one knob, one slot. The mock
  // derives its CC from the slot index, so drive s2 to CC 20 by hand first to exercise it.
  state.rack.pages[0].slots[1].midiCc = 20;
  state.rack.pages[0].slots[1].midiChannel = 1;
  state = applyMockCommand(state, { cmd: 'learnControlSlotMidi', pageId, slotId: 's1' });
  assert.equal(state.rack.pages[0].slots[0].midiCc, 20);
  assert.equal(state.rack.pages[0].slots[1].midiCc, -1, 'the previous holder is unbound');

  // Clearing the slot's PARAMETER leaves the hardware binding — they are separate stories.
  state = applyMockCommand(state, { cmd: 'clearControlSlot', pageId, slotId: 's1' });
  assert.equal(state.rack.pages[0].slots[0].midiCc, 20, 'parameter clear keeps the knob');

  state = applyMockCommand(state, { cmd: 'clearControlSlotMidi', pageId, slotId: 's1' });
  assert.equal(state.rack.pages[0].slots[0].midiCc, -1, 'MIDI clear unbinds it');
  assert.equal(state.rack.pages[0].slots[0].midiChannel, 0);
});

test('parts normalize their preset cursor and the mock walk cycles with wrap', () => {
  const shaped = normalizeHostState({ rack: { parts: [
    { partId: 'p1', presetRecordId: 'r1', presetName: 'Bright' }, { partId: 'p2' },
  ] } });
  assert.equal(shaped.rack.parts[0].presetName, 'Bright');
  assert.equal(shaped.rack.parts[1].presetName, '', 'no preset reads as empty, not undefined');

  let state = mockHostState();
  const empty = state.rack.parts[1].partId;   // the empty mock part
  state = applyMockCommand(state, { cmd: 'walkPartPreset', partId: empty, delta: 1 });
  assert.equal(state.rack.parts[1].presetName, '', 'a part without an instrument does not walk');

  state = applyMockCommand(state, { cmd: 'loadInstrument', partId: empty, ceId: 'mock-analog' });
  const partOf = (st) => st.rack.parts.find((p) => p.partId === empty);
  state = applyMockCommand(state, { cmd: 'walkPartPreset', partId: empty, delta: 1 });
  assert.equal(partOf(state).presetName, 'Init', 'the first step lands on the first sound');
  state = applyMockCommand(state, { cmd: 'walkPartPreset', partId: empty, delta: 1 });
  assert.equal(partOf(state).presetName, 'Bright');
  state = applyMockCommand(state, { cmd: 'walkPartPreset', partId: empty, delta: -1 });
  state = applyMockCommand(state, { cmd: 'walkPartPreset', partId: empty, delta: -1 });
  assert.equal(partOf(state).presetName, 'Dark', 'prev from the top wraps to the end');
});

test('arp velocity patterns keep rests and the mock merges them', () => {
  const shaped = normalizeHostState({ rack: { parts: [
    { partId: 'p1', arp: { enabled: true, velocityPattern: [100, 0, 90] } },
  ] } });
  assert.deepEqual(shaped.rack.parts[0].arp.velocityPattern, [100, 0, 90],
    'zero survives normalization — a rest is a value, not garbage');

  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'setPartArp', partId, velocityPattern: [64, 0, 127, 0] });
  assert.deepEqual(state.rack.parts.find((p) => p.partId === partId).arp.velocityPattern,
    [64, 0, 127, 0], 'the mock reducer keeps the drawn pattern, rests included');
  state = applyMockCommand(state, { cmd: 'setPartArp', partId, velocityPattern: [] });
  assert.deepEqual(state.rack.parts.find((p) => p.partId === partId).arp.velocityPattern, [],
    'clearing back to as-played is a plain empty array');

  // The drawn melody: degrees with rests survive normalization and the mock merge alike.
  const drawn = normalizeHostState({ rack: { parts: [
    { partId: 'p1', arp: { mode: 'pattern', degreePattern: [0, -1, 2, 7] } },
  ] } });
  assert.deepEqual(drawn.rack.parts[0].arp.degreePattern, [0, -1, 2, 7]);
  state = applyMockCommand(state, { cmd: 'setPartArp', partId, mode: 'pattern',
                                    degreePattern: [1, -1, 3] });
  const arp = state.rack.parts.find((p) => p.partId === partId).arp;
  assert.equal(arp.mode, 'pattern');
  assert.deepEqual(arp.degreePattern, [1, -1, 3], 'the melody lands rests and all');

  // The row meaning travels too: free (semitone) rows against the ground note.
  assert.equal(arp.patternSemitones, false, 'chord rows are the default');
  state = applyMockCommand(state, { cmd: 'setPartArp', partId, patternSemitones: true });
  assert.equal(state.rack.parts.find((p) => p.partId === partId).arp.patternSemitones, true);
});

test('parameterControlKind puts each parameter shape on the right control', () => {
  assert.equal(parameterControlKind({ boolean: true }), 'toggle');
  assert.equal(parameterControlKind(
    { discrete: true, numSteps: 3, valueTexts: ['Saw', 'Square', 'Sine'] }), 'segments');
  assert.equal(parameterControlKind({ discrete: true, numSteps: 3, valueTexts: [] }), 'stepper',
    'few values without labels still step exactly instead of sliding');
  assert.equal(parameterControlKind({ discrete: true, numSteps: 32, valueTexts: [] }), 'stepper');
  assert.equal(parameterControlKind({ discrete: true, numSteps: 128 }), 'slider',
    'a hundred steps is effectively continuous');
  assert.equal(parameterControlKind({ discrete: false, numSteps: 0 }), 'slider');
  assert.equal(parameterControlKind(null), 'slider', 'garbage falls back to the safe default');
});

test('valueTexts normalize and the mock parses typed text by name and number', () => {
  const shaped = normalizeHostParameters({ parameters: [
    { id: 'wave', discrete: true, numSteps: 3, valueTexts: ['Saw', 'Square', 'Sine'] },
    { id: 'cutoff' },
  ] });
  assert.deepEqual(shaped.parameters[0].valueTexts, ['Saw', 'Square', 'Sine']);
  assert.deepEqual(shaped.parameters[1].valueTexts, [], 'absent reads as empty, not undefined');
});

test('groupParameters folds registry order into named groups with an orphan bucket', () => {
  const groups = groupParameters([
    { id: 'a', group: 'Filter' }, { id: 'b', group: 'Filter' },
    { id: 'c', group: '' }, { id: 'd', group: 'Osc' },
  ]);
  assert.deepEqual(groups.map((g) => g.name), ['Filter', 'General', 'Osc']);
  assert.equal(groups[0].parameters.length, 2);
  assert.equal(groups[1].parameters[0].id, 'c', 'ungrouped rows land in General, never vanish');
  assert.deepEqual(groupParameters(null), [], 'garbage folds to nothing');
});

test('assignedParameterIds reads slots, macros and modulation for one target only', () => {
  const state = normalizeHostState({ rack: {
    pages: [{ pageId: 'p', slots: [
      { slotId: 's1', assigned: true, partId: 'part-a', parameterId: 'cutoff' },
      { slotId: 's2', assigned: true, partId: 'part-b', parameterId: 'wave' },
      { slotId: 's3' },
    ] }],
    macros: [{ macroId: 'm', targets: [{ targetId: 'part-a', parameterId: 'drive' }] }],
    modulationRoutes: [{ routeId: 'r', targetId: 'part-a', parameterId: 'resonance' }],
  } });
  const ids = assignedParameterIds(state, 'part-a');
  assert.deepEqual([...ids].sort(), ['cutoff', 'drive', 'resonance']);
  assert.equal(assignedParameterIds(state, 'part-c').size, 0);
  assert.equal(assignedParameterIds(null, 'part-a').size, 0, 'garbage reads as nothing assigned');
});

test('mock quick learn mints a page, assigns, and binds a knob at once', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'quickLearnParameter', partId, parameterId: 'cutoff' });
  const page = state.rack.pages.at(-1);
  assert.equal(page.name, 'MIDI', 'no empty slot anywhere means a fresh page');
  assert.equal(page.slots[0].parameterId, 'cutoff');
  assert.equal(page.slots[0].midiCc, 20, 'and the mock hears a knob immediately');

  state = applyMockCommand(state, { cmd: 'quickLearnParameter', partId, parameterId: 'wave' });
  assert.equal(state.rack.pages.at(-1).slots[1].parameterId, 'wave',
    'the next quick learn takes the next empty slot, not a second page');
});

test('steps carry chord notes: normalized in, mock-merged back', () => {
  const shaped = normalizeHostState({ performance: { patterns: [{ patternId: 'p', lanes: [{
    laneId: 'l', type: 'chord', stepCount: 2, stepsPerBeat: 4,
    steps: [{ active: true, chordNotes: [60, 64, 67] }, {}],
  }] }] } });
  assert.deepEqual(shaped.performance.patterns[0].lanes[0].steps[0].chordNotes, [60, 64, 67]);
  assert.deepEqual(shaped.performance.patterns[0].lanes[0].steps[1].chordNotes, [],
    'absent chords read as empty, never undefined');

  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'setStep', patternId: 'mock-pattern-1',
    laneId: 'mock-lane-1', index: 1, active: true, chord: [48, 55] });
  const step = state.performance.patterns[0].lanes[0].steps[1];
  assert.equal(step.active, true);
  assert.deepEqual(step.chordNotes, [48, 55], 'the drawn stack lands in the model');
});

test('floating editors: several at once, dock steals back, mock mirrors the policy', () => {
  let state = mockHostState();
  const a = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'loadInstrument', partId: state.rack.parts[1].partId, ceId: 'mock-analog' });
  const b = state.rack.parts[1].partId;

  state = applyMockCommand(state, { cmd: 'floatEditor', partId: a });
  state = applyMockCommand(state, { cmd: 'floatEditor', partId: b });
  assert.deepEqual([...state.floatingEditorPartIds].sort(), [a, b].sort(),
    'two parts float at the same time — the whole point');

  state = applyMockCommand(state, { cmd: 'openEditor', partId: a });
  assert.equal(state.editorOpenPartId, a);
  assert.deepEqual(state.floatingEditorPartIds, [b],
    'docking a floating part pulls its one editor back in');

  state = applyMockCommand(state, { cmd: 'floatEditor', partId: a });
  assert.equal(state.editorOpenPartId, '', 'floating the docked part empties the pane');

  state = applyMockCommand(state, { cmd: 'closeEditorWindow', partId: b });
  assert.deepEqual(state.floatingEditorPartIds, [a], 'a window close closes only its window');

  // Inserts float too: a live effect id passes the mock's gate like a loaded part does.
  state = applyMockCommand(normalizeHostState({ rack: {
    parts: [{ partId: 'p1', hasInstrument: true,
              effects: [{ effectId: 'fx1', hasProcessor: true }] }],
  } }), { cmd: 'floatEditor', partId: 'fx1' });
  assert.deepEqual(state.floatingEditorPartIds, ['fx1']);

  const shaped = normalizeHostState({ floatingEditorPartIds: ['x', 'y'] });
  assert.deepEqual(shaped.floatingEditorPartIds, ['x', 'y']);
  assert.deepEqual(normalizeHostState({}).floatingEditorPartIds, [],
    'absent reads as an empty set, never undefined');
});

test('the chorder: key maps normalize, and the mock learns and clears', () => {
  const shaped = normalizeHostState({ rack: { parts: [
    { partId: 'p1', midiFx: { chord: 'custom keys',
      keyChords: [{ key: 62, offsets: [-2, 2, 5] }] } },
  ] } });
  assert.equal(shaped.rack.parts[0].midiFx.chord, 'custom keys');
  assert.equal(shaped.rack.parts[0].midiFx.chordInversion, 0);
  assert.equal(shaped.rack.parts[0].midiFx.chordVoicing, 'close');
  assert.equal(shaped.rack.parts[0].midiFx.chordVoiceLeading, false);
  assert.deepEqual(shaped.rack.parts[0].midiFx.keyChords, [{ key: 62, offsets: [-2, 2, 5] }]);
  assert.deepEqual(normalizeHostState({}).rack.parts, [], 'nothing crashes on nothing');

  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  state = applyMockCommand(state, { cmd: 'learnKeyChord', partId });
  const learned = state.rack.parts[0].midiFx.keyChords;
  assert.deepEqual(learned, [{ key: 60, offsets: [0, 4, 7] }],
    'the mock hears a triad onto middle C at once');
  state = applyMockCommand(state, { cmd: 'clearKeyChord', partId, key: 60 });
  assert.deepEqual(state.rack.parts[0].midiFx.keyChords, [], 'clear takes it away');
});

test('Smart Chorder inversion, voicing and nearest-motion rules match the native engine', () => {
  assert.deepEqual(applySmartChordVoicing([60, 64, 67], { inversion: 1 }), [64, 67, 72]);
  assert.deepEqual(applySmartChordVoicing([60, 64, 67], { voicing: 'open' }), [60, 67, 76]);
  assert.deepEqual(applySmartChordVoicing([65, 69, 72], {
    voiceLeading: true, previous: [60, 64, 67],
  }), [60, 65, 69], 'F becomes F/C, keeping one common tone and moving the others 1–2 semitones');
  assert.deepEqual(applySmartChordVoicing([60, 64, 67]), [60, 64, 67],
    'all-default settings preserve the legacy output exactly');
});

test('MIDI slots normalize, and the mock chain adds, moves, bypasses and removes', () => {
  const shaped = normalizeMidiSlot({ slotId: 's1', type: 'chord', bypassed: true,
                                     fx: { chord: 'diatonic' } });
  assert.equal(shaped.type, 'chord');
  assert.equal(shaped.bypassed, true);
  assert.equal(shaped.fx.chord, 'diatonic');
  assert.equal(shaped.arp.mode, 'up', 'the unused block is present and defaulted, never undefined');
  assert.equal(normalizeMidiSlot({ type: 'wobble' }).type, 'arp',
    'an unknown module type falls back rather than rendering as nothing');
  const smartTranspose = normalizeMidiSlot({ type: 'transpose', fx: {
    transpose: 2, transposeMode: 'diatonic', scaleRoot: 0, scaleType: 'major',
  } });
  assert.equal(smartTranspose.fx.transposeMode, 'diatonic');
  assert.equal(smartTranspose.fx.transpose, 2);
  assert.equal(normalizeMidiSlot({ type: 'transpose', fx: { transposeMode: 'mystery' } })
    .fx.transposeMode, 'chromatic', 'old and unknown modes retain semitone transposition');

  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  const chain = () => state.rack.parts.find((p) => p.partId === partId).midiChain;
  assert.deepEqual(chain().map((s) => s.type), ['fx', 'arp'],
    'a migrated part is note shaping into the arpeggiator');

  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'chord' });
  assert.deepEqual(chain().map((s) => s.type), ['fx', 'arp', 'chord']);

  const chordId = chain()[2].slotId;
  state = applyMockCommand(state, { cmd: 'moveMidiSlot', partId, slotId: chordId, index: 1 });
  assert.deepEqual(chain().map((s) => s.type), ['fx', 'chord', 'arp'],
    'chord ahead of arp — the arrangement the welded chain could not express');

  state = applyMockCommand(state, { cmd: 'setMidiSlotOptions', partId, slotId: chordId,
                                    chord: 'diatonic', chordInversion: 2,
                                    chordVoicing: 'drop 2', chordVoiceLeading: true });
  assert.equal(chain()[1].fx.chord, 'diatonic', 'options reach the slot they name');
  assert.equal(chain()[1].fx.chordInversion, 2);
  assert.equal(chain()[1].fx.chordVoicing, 'drop 2');
  assert.equal(chain()[1].fx.chordVoiceLeading, true);

  state = applyMockCommand(state, { cmd: 'setMidiSlotBypassed', partId, slotId: chordId,
                                    bypassed: true });
  assert.equal(chain()[1].bypassed, true);
  assert.equal(chain()[1].fx.chord, 'diatonic', 'bypass keeps the settings — that is not remove');

  state = applyMockCommand(state, { cmd: 'removeMidiSlot', partId, slotId: chordId });
  assert.deepEqual(chain().map((s) => s.type), ['fx', 'arp'], 'remove closes the gap');

  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'transpose' });
  const transposeId = chain().at(-1).slotId;
  state = applyMockCommand(state, { cmd: 'setMidiSlotOptions', partId, slotId: transposeId,
                                    transposeMode: 'diatonic', transpose: 3,
                                    scaleRoot: 9, scaleType: 'minor' });
  assert.deepEqual({
    mode: chain().at(-1).fx.transposeMode,
    amount: chain().at(-1).fx.transpose,
    root: chain().at(-1).fx.scaleRoot,
    scale: chain().at(-1).fx.scaleType,
  }, { mode: 'diatonic', amount: 3, root: 9, scale: 'minor' },
  'the mock UI command carries all four smart-transpose controls together');

  state = applyMockCommand(state, { cmd: 'addMidiSlot', partId, type: 'humanize' });
  const humanizeId = chain().at(-1).slotId;
  state = applyMockCommand(state, { cmd: 'setMidiSlotOptions', partId, slotId: humanizeId,
                                    humanizeTimingBeats: 0.03, humanizeVelocity: 12,
                                    humanizeGatePercent: 35, humanizePreserveChords: true,
                                    humanizeProtectBeats: true });
  assert.deepEqual({
    timing: chain().at(-1).mod.humanizeTimingBeats,
    velocity: chain().at(-1).mod.humanizeVelocity,
    gate: chain().at(-1).mod.humanizeGatePercent,
    chords: chain().at(-1).mod.humanizePreserveChords,
    beats: chain().at(-1).mod.humanizeProtectBeats,
  }, { timing: 0.03, velocity: 12, gate: 35, chords: true, beats: true },
  'all Humanizer dimensions and constraints reach its slot');

  // The part-level setters are doors onto the chain, so one truth reaches the screen.
  state = applyMockCommand(state, { cmd: 'setPartArp', partId, mode: 'down' });
  assert.equal(chain()[1].arp.mode, 'down',
    'setPartArp lands on the chain, not beside it');
  assert.ok(midiSlotTypes.includes('velocity'), 'every module type the native side offers is listed');
});

test('group buses: parts join one, removal releases them, loops are refused', () => {
  const shaped = normalizeHostState({ rack: {
    buses: [{ busId: 'b1', name: 'Keys', level: 0.5, latencyMs: 12 }],
    parts: [{ partId: 'p1', destinationBusId: 'b1' }],
  } });
  assert.equal(shaped.rack.buses[0].name, 'Keys');
  assert.equal(shaped.rack.buses[0].latencyMs, 12, 'the latency a bus adds is carried, not hidden');
  assert.equal(shaped.rack.parts[0].destinationBusId, 'b1');
  assert.deepEqual(normalizeHostState({}).rack.buses, [], 'absent reads as no buses');

  let state = mockHostState();
  const a = state.rack.parts[0].partId;
  const b = state.rack.parts[1].partId;
  state = applyMockCommand(state, { cmd: 'addBus', name: 'Keys' });
  state = applyMockCommand(state, { cmd: 'addBus', name: 'Sub' });
  const [keys, sub] = state.rack.buses.map((x) => x.busId);
  state = applyMockCommand(state, { cmd: 'renameBus', busId: keys, name: 'Keys Group' });
  assert.equal(state.rack.buses[0].name, 'Keys Group');

  state = applyMockCommand(state, { cmd: 'setPartDestination', partId: a, busId: keys });
  state = applyMockCommand(state, { cmd: 'setPartDestination', partId: b, busId: keys });
  assert.equal(state.rack.parts[0].destinationBusId, keys);
  assert.equal(state.rack.parts[1].destinationBusId, keys, 'two instruments join one bus');

  state = applyMockCommand(state, { cmd: 'setBusDestination', busId: keys, destinationBusId: sub });
  assert.equal(state.rack.buses[0].destinationBusId, sub, 'a bus can feed another bus');

  state = applyMockCommand(state, { cmd: 'setBusDestination', busId: sub, destinationBusId: keys });
  assert.equal(state.rack.buses[1].destinationBusId, '', 'closing the loop changes nothing');
  state = applyMockCommand(state, { cmd: 'setBusDestination', busId: keys, destinationBusId: keys });
  assert.equal(state.rack.buses[0].destinationBusId, sub, 'and a bus into itself is refused too');

  state = applyMockCommand(state, { cmd: 'setPartDestination', partId: a, busId: 'ghost' });
  assert.equal(state.rack.parts[0].destinationBusId, keys,
    'routing into a bus that does not exist leaves the part where it was');

  state = applyMockCommand(state, { cmd: 'removeBus', busId: keys });
  assert.equal(state.rack.buses.length, 1);
  assert.equal(state.rack.parts[0].destinationBusId, '',
    'a removed bus puts its instruments back on the master, never into silence');
});
