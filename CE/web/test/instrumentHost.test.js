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

test('the instrument host is a chrome-owning workspace like script and screen', () => {
  const kind = classifyWorkspace({ activeTab: { type: 'instrumentHost', id: 'instrumentHost' } });
  assert.equal(kind, 'instrumentHost');
  assert.equal(workspaceOwnsChrome(kind), true,
    'tree/display/properties panels are panel-editor chrome and stay hidden over the rack');
  assert.equal(workspaceOwnsChrome(classifyWorkspace({ activeTab: { type: 'settings' } })), false,
    'and the settings tab keeps behaving as before');
});
