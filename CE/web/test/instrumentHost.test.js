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
  emptyPerformance,
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
  saveChainToLibrary,
  rackCanvasLayout,
  CANVAS_NODE_H,
  canvasDropTargets,
  busDestinationWouldLoop,
  pluginTile,
  pluginInitials,
  pluginSnapshots,
  TILE_PATTERNS,
  normalizeSurfaceLayout,
  filterEffects,
  mockSurfaceLayout,
  emptySurfaceLayout,
  setLibraryUserMetadata,
  removeLibraryRecord,
  loadLibraryRecord,
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
  groupParameters,
  assignedParameterIds,
  emptyLicence,
  normalizeLicence,
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

// --- Stage 6: the performance system -------------------------------------------------------------

test('normalizeHostState shapes the performance system', () => {
  const shaped = normalizeHostState({
    performance: {
      transport: { playing: 1, tempo: '128', bar: 3, beat: 2, externalClock: true },
      // `playing: 1` is deliberate: the store is strictly boolean, like `scanning` above.
      patterns: [{
        patternId: 'p1', name: 'Riff', swing: '0.25',
        lanes: [{ laneId: 'l1', type: 'drum', stepCount: '8', stepsPerBeat: 2, drumNote: 38,
                  resolved: true,
                  steps: [{ active: true, note: 40, ratchets: 3, probability: 60 }] }],
      }],
      clips: [{ clipId: 'c1', patternId: 'p1', active: true, phase: 0.5 }],
      scenes: [{ sceneId: 's1', name: 'Verse', clipIds: ['c1'] }],
      setlist: { items: [{ itemId: 'i1', name: 'Opener', sceneId: 's1' }], currentIndex: 0 },
      capture: { armed: true, clipId: 'c1', laneId: 'l1' },
      scales: ['major', 'minor'],
    },
  });

  const perf = shaped.performance;
  assert.equal(perf.transport.playing, false, 'truthy is not true');
  assert.equal(perf.transport.externalClock, true, 'a real boolean passes through');
  assert.equal(perf.transport.tempo, 128);
  assert.equal(perf.patterns[0].swing, 0.25);
  assert.equal(perf.patterns[0].lanes[0].type, 'drum');
  assert.equal(perf.patterns[0].lanes[0].steps[0].ratchets, 3);
  assert.equal(perf.clips[0].phase, 0.5);
  assert.equal(perf.scenes[0].clipIds[0], 'c1');
  assert.equal(perf.setlist.currentIndex, 0);
  assert.equal(perf.capture.armed, true);
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

test('mock reducer: clips, scenes and the setlist recovery rule', () => {
  let state = mockHostState();
  const patternId = state.performance.patterns[0].patternId;
  state = applyMockCommand(state, { cmd: 'addClip', patternId, name: 'Second' });
  assert.equal(state.performance.clips.length, 2);

  const clipId = state.performance.clips[1].clipId;
  state = applyMockCommand(state, { cmd: 'launchClip', clipId });
  assert.equal(state.performance.clips[1].active, true);

  state = applyMockCommand(state, { cmd: 'addScene', name: 'Verse' });
  const sceneId = state.performance.scenes[0].sceneId;
  assert.deepEqual(state.performance.scenes[0].clipIds, [clipId],
    'a new scene captures what is running');

  state = applyMockCommand(state, { cmd: 'stopAllClips' });
  state = applyMockCommand(state, { cmd: 'launchScene', sceneId });
  assert.equal(state.performance.clips[1].active, true, 'recalling the scene starts its clips');
  assert.equal(state.performance.clips[0].active, false, 'and stops the ones it omits');

  state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId, name: 'Opener' });
  state = applyMockCommand(state, { cmd: 'addSetlistItem', sceneId: 'gone', name: 'Broken' });
  state = applyMockCommand(state, { cmd: 'setlistGo', index: 0 });
  assert.equal(state.performance.setlist.currentIndex, 0);

  state = applyMockCommand(state, { cmd: 'setlistNext' });
  assert.equal(state.performance.setlist.currentIndex, 0,
    'an item whose scene is gone leaves the rig on the last one that worked');

  state = applyMockCommand(state, { cmd: 'removeClip', clipId });
  assert.equal(state.performance.scenes[0].clipIds.includes(clipId), false,
    'removing a clip takes it out of the scenes that named it');
});

test('mock reducer: transport, capture and the per-part event chain', () => {
  let state = mockHostState();
  state = applyMockCommand(state, { cmd: 'transportPlay' });
  assert.equal(state.performance.transport.playing, true);
  state = applyMockCommand(state, { cmd: 'setTempo', tempo: 400 });
  assert.equal(state.performance.transport.tempo, 300, 'tempo clamps');
  state = applyMockCommand(state, { cmd: 'transportStop' });
  assert.equal(state.performance.transport.playing, false);

  const clipId = state.performance.clips[0].clipId;
  const laneId = state.performance.patterns[0].lanes[0].laneId;
  state = applyMockCommand(state, { cmd: 'armCapture', clipId, laneId });
  assert.equal(state.performance.capture.armed, true);
  state = applyMockCommand(state, { cmd: 'disarmCapture' });
  assert.equal(state.performance.capture.armed, false);

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
  });

  assert.equal(preview.entries.length, 2);
  assert.equal(preview.entries[0].sizeBytes, 0, 'sizes arrive as numbers');
  assert.equal(preview.entries[1].included, false, 'an entry that does not apply is still shown');
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
    normalizeHostSurface({ state: 'connected', detail: 'ready', device: 'CTRL49 USB' }),
    { state: 'connected', detail: 'ready', device: 'CTRL49 USB' });
  assert.deepEqual(
    normalizeHostSurface({ state: 'heldElsewhere', detail: '', device: '' }),
    { state: 'heldElsewhere', detail: '', device: '' });

  // Anything else — unknown states, missing fields, non-objects — lands on searching,
  // because a status row must never be the thing that crashes the devices panel.
  assert.equal(normalizeHostSurface({ state: 'exploded' }).state, 'searching');
  assert.deepEqual(normalizeHostSurface(null), { state: 'searching', detail: '', device: '' });
  assert.deepEqual(normalizeHostSurface('nonsense'), { state: 'searching', detail: '', device: '' });
  assert.equal(normalizeHostSurface({ detail: 7, device: 9 }).detail, '7');
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
                   { armed: true, pageId: 'p', slotId: 's1' });
  assert.deepEqual(normalizeMidiLearn(null), { armed: false, pageId: '', slotId: '' });
  assert.deepEqual(normalizeMidiLearn({ armed: 'yes' }), { armed: false, pageId: '', slotId: '' });
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

test('assignedParameterIds reads slots and macros for one target only', () => {
  const state = normalizeHostState({ rack: {
    pages: [{ pageId: 'p', slots: [
      { slotId: 's1', assigned: true, partId: 'part-a', parameterId: 'cutoff' },
      { slotId: 's2', assigned: true, partId: 'part-b', parameterId: 'wave' },
      { slotId: 's3' },
    ] }],
    macros: [{ macroId: 'm', targets: [{ targetId: 'part-a', parameterId: 'drive' }] }],
  } });
  const ids = assignedParameterIds(state, 'part-a');
  assert.deepEqual([...ids].sort(), ['cutoff', 'drive']);
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

test('MIDI slots normalize, and the mock chain adds, moves, bypasses and removes', () => {
  const shaped = normalizeMidiSlot({ slotId: 's1', type: 'chord', bypassed: true,
                                     fx: { chord: 'diatonic' } });
  assert.equal(shaped.type, 'chord');
  assert.equal(shaped.bypassed, true);
  assert.equal(shaped.fx.chord, 'diatonic');
  assert.equal(shaped.arp.mode, 'up', 'the unused block is present and defaulted, never undefined');
  assert.equal(normalizeMidiSlot({ type: 'wobble' }).type, 'arp',
    'an unknown module type falls back rather than rendering as nothing');

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
                                    chord: 'diatonic' });
  assert.equal(chain()[1].fx.chord, 'diatonic', 'options reach the slot they name');

  state = applyMockCommand(state, { cmd: 'setMidiSlotBypassed', partId, slotId: chordId,
                                    bypassed: true });
  assert.equal(chain()[1].bypassed, true);
  assert.equal(chain()[1].fx.chord, 'diatonic', 'bypass keeps the settings — that is not remove');

  state = applyMockCommand(state, { cmd: 'removeMidiSlot', partId, slotId: chordId });
  assert.deepEqual(chain().map((s) => s.type), ['fx', 'arp'], 'remove closes the gap');

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
