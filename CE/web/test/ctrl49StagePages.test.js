// ctrl49StagePages.test.js — the CTRL49's pages beyond the knobs, SOUNDCHECK, LAYERS and DISCOVER,
// in the app's store: the state that says which are on, the screen payload as the broker sends it, and the
// stand-in surface the app runs without the native host. The broker side is pinned in
// InstrumentHostServiceTests (testCtrl49StagePages, testCtrl49Discover); this mirrors what it
// promises.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyHostState, normalizeHostState, applyMockCommand, normalizeSurfaceScreen, mockSurfaceScreen,
} from '../src/CE_Application/stores/instrumentHost.js';
import { readLayersPayload, readSoundcheckPayload, readDiscoverPayload, readCuePayload, readChangesPayload } from '../src/CE_Application/screen/ctrl49Payloads.js';

const cursor = (page, more = {}) => ({ page, active: 0, turned: {}, song: -1, part: -1, sound: 0, kind: '', ...more });

function rig() {
  let state = normalizeHostState({
    rack: {
      focusedPartId: 'b',
      parts: [
        { partId: 'a', pluginName: 'Sub', keyLow: 24, keyHigh: 59 },
        { partId: 'b', pluginName: 'Pad', presetName: 'Glass Pad', keyLow: 60, keyHigh: 108, transpose: 12 },
      ],
      pages: [{ pageId: 'p1', name: 'Main', slots: [] }],
    },
    performance: { setlist: { currentIndex: 1, items: [
      { itemId: 's1', name: 'Opener' }, { itemId: 's2', name: 'Ballad' }, { itemId: 's3', name: 'Closer', missing: true },
    ] } },
  });
  return state;
}

test('both pages are off until asked for, and a payload without them reads as off', () => {
  assert.deepEqual(emptyHostState().surfacePages, { soundcheck: false, layers: false, discover: false, cue: false, changes: false });
  assert.deepEqual(normalizeHostState({}).surfacePages, { soundcheck: false, layers: false, discover: false, cue: false, changes: false });
  assert.deepEqual(normalizeHostState({ surfacePages: { soundcheck: true, layers: 'yes', discover: true, cue: 1 } }).surfacePages,
    { soundcheck: true, layers: false, discover: true, cue: false, changes: false }, 'only a real true turns a page on');
});

test('the screen payload carries one stage call, and only one of the two known ones', () => {
  const layers = normalizeSurfaceScreen({ pageKind: 'layers', call: 'set_layers', payload: [2, 0, 2, 1, 36, 300, -4],
                                          pageIndex: 3, pageCount: 5 });
  assert.equal(layers.pageKind, 'layers');
  assert.equal(layers.call, 'set_layers');
  assert.deepEqual(layers.payload, [2, 0, 2, 1, 36, 255, 0], 'bytes are clamped like the knob pages\' are');
  assert.equal(normalizeSurfaceScreen({ pageKind: 'soundcheck', call: 'set_check' }).call, 'set_check');
  assert.equal(normalizeSurfaceScreen({ call: 'os.execute' }).call, '', 'the call names a function the page runs: nothing else');
  assert.equal(normalizeSurfaceScreen({ pageKind: 'elsewhere' }).pageKind, 'control');
});

test('turning the pages on in the stand-in adds them after the performance page, LAYERS first', () => {
  let state = applyMockCommand(rig(), { cmd: 'soundcheckOnSurface', on: true });
  state = applyMockCommand(state, { cmd: 'layersOnSurface' });
  assert.deepEqual(state.surfacePages, { soundcheck: true, layers: true, discover: false, cue: false, changes: false },
    'on, and flipped with no "on"');

  const performance = mockSurfaceScreen(state, cursor(1));
  assert.equal(performance.pageKind, 'performance');
  assert.equal(performance.pageCount, 4, 'one control page, performance, then the two');

  const layers = mockSurfaceScreen(state, cursor(2));
  assert.equal(layers.pageKind, 'layers');
  assert.equal(layers.call, 'set_layers');
  assert.deepEqual(layers.labels, []);
  const parts = readLayersPayload(layers.payload);
  assert.equal(parts.focused, 1, 'starting on the rack\'s focused part');
  assert.deepEqual(parts.parts.map((p) => [p.name, p.keyLow, p.keyHigh, p.transpose]),
    [['Sub', 24, 59, 0], ['Glass Pad', 60, 108, 12]], 'a part is named by its sound, else its plug-in');

  const check = readSoundcheckPayload(mockSurfaceScreen(state, cursor(3)).payload);
  assert.equal(check.count, 3);
  assert.equal(check.selected, 1, 'starting on the song on stage');
  assert.equal(check.unchecked, 0, 'turning the page on checked the set');
  assert.deepEqual(check.songs.map((s) => s.status), ['ready', 'ready', 'problems']);

  state = applyMockCommand(state, { cmd: 'layersOnSurface', on: false });
  const shifted = mockSurfaceScreen(state, cursor(2));
  assert.equal(shifted.pageKind, 'soundcheck', 'with LAYERS off, SOUNDCHECK moves up to follow the performance page');
  assert.equal(shifted.pageCount, 3);
});

test('a zone edit from the stage page is the same command the zone editor sends', () => {
  const state = applyMockCommand(rig(), { cmd: 'setPartMidiRules', partId: 'a', keyLow: 30, transpose: -2 });
  const parts = readLayersPayload(mockSurfaceScreen(applyMockCommand(state, { cmd: 'layersOnSurface', on: true }), cursor(2)).payload).parts;
  assert.deepEqual([parts[0].keyLow, parts[0].transpose], [30, -2]);
});

test('Stage Lock refuses turning a page on, as the host does', () => {
  const locked = applyMockCommand(rig(), { cmd: 'setStageLock', enabled: true });
  assert.equal(applyMockCommand(locked, { cmd: 'layersOnSurface', on: true }).surfacePages.layers, false);
});

test('DISCOVER in the stand-in: after the other two, over the demo library', () => {
  let state = applyMockCommand(rig(), { cmd: 'discoverOnSurface', on: true });
  assert.equal(state.surfacePages.discover, true);
  const screen = mockSurfaceScreen(state, cursor(2));
  assert.equal(screen.pageKind, 'discover', 'one control page, performance, then DISCOVER');
  assert.equal(screen.call, 'set_discover');
  const view = readDiscoverPayload(screen.payload);
  assert.equal(view.state, 'suggestions', 'the demo library has enough played to have a taste');
  assert.ok(view.count > 0 && view.sounds.every((s) => s.percent > 0 && s.percent <= 100));
  assert.ok(view.neverOpened >= view.count, 'what is suggested is some of what was never opened');
  assert.ok(view.regulars.length >= 5, 'the map shows what is played');
  assert.ok(view.likeName !== '', 'and the selected sound says which of them it is like');

  const kept = readDiscoverPayload(mockSurfaceScreen(state, cursor(2), { records: [{ recordId: 'lib-12', favourite: true }] }).payload);
  assert.equal(kept.sounds.find((s) => s.name === 'Deep Hall')?.kept, true, 'a favourite the Sounds page holds shows as kept');

  state = applyMockCommand(state, { cmd: 'layersOnSurface', on: true });
  assert.equal(mockSurfaceScreen(state, cursor(3)).pageKind, 'discover', 'LAYERS comes first when both are on');
});

test('CUE in the stand-in: first after the performance page, the song on stage and a pick', () => {
  let state = applyMockCommand(rig(), { cmd: 'setSetlistItem', itemId: 's2', notes: 'Capo 2\n\nWatch the drummer', plannedSeconds: 300 });
  state = applyMockCommand(state, { cmd: 'cueOnSurface', on: true });
  state = applyMockCommand(state, { cmd: 'layersOnSurface', on: true });
  const screen = mockSurfaceScreen(state, cursor(2));
  assert.equal(screen.pageKind, 'cue', 'CUE comes before LAYERS');
  assert.equal(screen.call, 'set_cue');
  let view = readCuePayload(screen.payload);
  assert.deepEqual([view.songs, view.current, view.song, view.nextSong], [3, 1, 'Ballad', 'Closer']);
  view = readCuePayload(mockSurfaceScreen(state, cursor(2, { picked: 2 })).payload);
  assert.deepEqual([view.picked, view.pickedSong], [2, 'Closer'], 'a pick names the song pad 1 would go to');
  view = readCuePayload(mockSurfaceScreen(state, cursor(2, { picked: 1 })).payload);
  assert.equal(view.pickedSong, '', 'picking the song on stage is no pick');
  assert.equal(mockSurfaceScreen(state, cursor(3)).pageKind, 'layers');
});

test('CHANGES in the stand-in says it has no plug-in to read, rather than inventing changes', () => {
  const state = applyMockCommand(rig(), { cmd: 'changesOnSurface', on: true });
  const screen = mockSurfaceScreen(state, cursor(2));
  assert.equal(screen.pageKind, 'changes');
  assert.equal(screen.call, 'set_changes');
  const view = readChangesPayload(screen.payload);
  assert.equal(view.state, 'problem');
  assert.match(view.problemText, /plug-in/);
});
