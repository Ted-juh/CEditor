// The HoSTage CTRL49 screen preview: its payloads have to be the bytes the C++ sends, or the
// preview is a picture of something the keyboard never shows. The expected bytes below are the
// ones Ctrl49RackDisplayTests and the performance builders pin on the C++ side.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rackLabelPayload, rackStatePayload, performanceTitle, performanceLabelPayload,
  performanceStatePayload, browseSlotViews, soundcheckPayload, soundcheckLevelByte, layersPayload,
  readSoundcheckPayload, readLayersPayload, discoverPayload, readDiscoverPayload, cuePayload, readCuePayload,
  changesPayload, readChangesPayload, readRackStateExtension, browseStatePayload, browseLineForDisplay,
  MAX_BROWSE_LINE_CHARACTERS,
} from '../src/CE_Application/screen/ctrl49Payloads.js';
import { parseCalls } from '../src/ctrl49Preview/callScript.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

test('rack labels: title first, then eight length-prefixed labels, ASCII only', () => {
  const slots = [
    { label: 'Cutoff', assigned: true, resolved: true },
    { label: 'Résonance', assigned: true, resolved: true },
    { label: 'Gone', assigned: true, resolved: false },
    { label: 'Ignored', assigned: false, resolved: false },
  ];
  const bytes = rackLabelPayload('Pg', slots);
  assert.deepEqual(bytes, [
    2, ...ascii('Pg'),
    6, ...ascii('Cutoff'),
    10, ...ascii('R??sonance'),            // é is two UTF-8 bytes, each one '?', as in appendString
    5, ...ascii('!Gone'),                  // unresolved is marked, not hidden
    0, 0, 0, 0, 0,                         // unassigned and missing slots carry no label
  ]);
  assert.equal(rackLabelPayload('x'.repeat(300), [])[0], 90, 'a label caps at 90, the most a frame can carry nine of');
});

test('rack state: the nine bytes the knob page reads', () => {
  const bytes = rackStatePayload(2, [{ position: 64 }, { position: 200 }, { position: -4 }]);
  assert.deepEqual(bytes, [2, 64, 127, 0, 0, 0, 0, 0, 0]);
});

test('rack state on a control page: the values as the plug-in writes them, and the page number', () => {
  // The golden in CE/tests/Ctrl49RackDisplayTests.cpp: the C++ builds these same bytes.
  const slots = [{ position: 127, assigned: true, resolved: true, valueText: '2.40 kHz' },
    { position: 0, assigned: true, resolved: false, valueText: '35 %' },
    { position: 64, assigned: false, valueText: 'ignored' }];
  assert.deepEqual(rackStatePayload(1, slots, { number: 2, count: 5 }),
    [1, 127, 0, 64, 0, 0, 0, 0, 0, 0, 0, 4, 2, 5, 8, ...ascii('2.40 kHz'), 4, ...ascii('35 %'), 0, 0, 0, 0, 0, 0]);
  const capped = rackStatePayload(0, [{ assigned: true, valueText: '12345678901234567' }, { assigned: true, valueText: '500 µs' }],
    { number: 1, count: 1 });
  assert.equal(capped[14], 12, 'a value caps at twelve characters');
  assert.deepEqual(capped.slice(27, 35), [7, ...ascii('500 ??s')], 'and any other byte becomes ?');
});

test('performance: ASCII transport title, clip marks, phase as knob', () => {
  assert.equal(performanceTitle({ playing: true, bar: 3, beat: 2, tempo: 121.6 }), '> 3.2 122');
  assert.equal(performanceTitle({ playing: false, bar: 1, beat: 1, tempo: 90, externalClock: true }), '# 1.1 90 EXT');
  assert.equal(performanceTitle({ tempo: 90, externalClock: true, clockLost: true }), '# 1.1 90 NO CLK');

  const clips = [{ name: 'A', active: true }, { name: 'B', pending: true, active: true }, { name: 'C', phase: 0.5 }];
  const labels = performanceLabelPayload({ playing: true, bar: 1, beat: 1, tempo: 120 }, clips);
  assert.deepEqual(labels.slice(labels[0] + 1, labels[0] + 1 + 8), [2, ...ascii('*A'), 2, ...ascii('>B'), 1, ...ascii('C')]);
  assert.deepEqual(performanceStatePayload(1, clips), [1, 0, 0, 63, 0, 0, 0, 0, 0]);
  assert.deepEqual(performanceStatePayload(1, clips, { playing: true, beat: 3, beatsPerBar: 4 }),
    [1, 0, 0, 63, 0, 0, 0, 0, 0, 1, 3, 4], 'the performance page adds its kind, the beat and the bar length');
  assert.deepEqual(performanceStatePayload(0, [], { playing: false, beat: 2, beatsPerBar: 3 }).slice(9),
    [1, 0, 3], 'stopped, no beat is lit');
});

test('browse: the cursor row takes a full knob, long names end in a dot', () => {
  const views = browseSlotViews(
    [{ name: 'Wool Pad' }, { name: 'Glass Cathedral' }, { name: 'Lost Lead', available: false }], 1, 12);
  assert.deepEqual(views.slice(0, 3), [
    { label: 'Wool Pad', assigned: true, resolved: true, position: 0 },
    { label: 'Glass Cathe.', assigned: true, resolved: true, position: 127 },
    { label: 'Lost Lead', assigned: true, resolved: false, position: 0 },
  ]);
  assert.equal(views[3].assigned, false, 'past the end of the list is empty');
});

// The golden in CE/tests/Ctrl49RackDisplayTests.cpp (buildBrowseStatePayload): change one, change
// the other.
test('browse: its set_values says it is the browser, with no numbers, and the strip line', () => {
  const rows = [{ name: 'Wool Pad', detail: 'STAGE KEYS' }, { name: 'Glass Cathedral Extended', detail: 'STAGE KEYS' },
    { name: 'Lost Lead', detail: 'DIVA', available: false }];
  const views = browseSlotViews(rows, 1, 12);
  assert.equal(browseLineForDisplay(rows[0]), 'Wool Pad - STAGE KEYS');
  assert.equal(browseLineForDisplay({ name: 'Juno Brass', detail: 'HW \u00B7 JUNO-106' }), 'Juno Brass - HW - JUNO-106');
  assert.equal(browseLineForDisplay({ name: 'Bare' }), 'Bare');
  const bytes = browseStatePayload(1, views, 'Wool Pad - STAGE KEYS');
  assert.deepEqual(bytes, [1, 0, 127, 0, 0, 0, 0, 0, 0, 7, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    21, ...ascii('Wool Pad - STAGE KEYS')]);
  assert.deepEqual(bytes.slice(0, 9), rackStatePayload(1, views), 'the first nine bytes are the plain payload');
  assert.equal(browseStatePayload(0, views, 'x'.repeat(60))[22], MAX_BROWSE_LINE_CHARACTERS);
});

// The same views and the same bytes as kGoldenSoundcheck and kGoldenLayers in
// CE/tests/Ctrl49StagePagesTests.cpp: change one, change the other.
test('soundcheck: the golden the C++ test pins', () => {
  const bytes = soundcheckPayload({
    songs: [
      { name: 'Glass Harbour', checked: true, problems: 0, measured: true, rmsDb: -18.4, peakDb: -3.2, loadSeconds: 2.3 },
      { name: 'Salt Road', checked: true, problems: 2 },
      { name: 'Night Bus', checked: false, loadSeconds: 0 },
    ],
    selected: 1, current: 0, basis: 'Current rig at check time', preloadOff: true,
    problems: ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing'],
  });
  assert.deepEqual(bytes, [
    3, 0, 3, 1, 1, 1, 1, 1,
    1, 43, 0, 24, 13, ...ascii('Glass Harbour'),
    2, 0, 2, 0, 9, ...ascii('Salt Road'),
    0, 0, 0, 1, 9, ...ascii('Night Bus'),
    25, ...ascii('Current rig at check time'),
    2, 2,
    35, ...ascii('MIDI output unavailable: USB MIDI 2'),
    32, ...ascii('Drifter: plug-in file is missing'),
    0, 0, 0, 2,
  ]);
  assert.equal(soundcheckLevelByte(true, 0), 61);
  assert.equal(soundcheckLevelByte(false, -10), 0, 'not measured is 0, whatever the number');
  const long = soundcheckPayload({ songs: [{ name: 'S', checked: true, problems: 1 }], problems: ['x'.repeat(80)] });
  assert.deepEqual(long.slice(-49, -4).slice(-4), [...ascii('x'), ...ascii('...')], 'a long problem ends in "..."');
});

test('layers: the golden the C++ test pins', () => {
  const bytes = layersPayload({
    parts: [
      { name: 'Sub Bass', keyLow: 36, keyHigh: 54, velocityLow: 1, velocityHigh: 127, transpose: 0 },
      { name: 'Brass', keyLow: 60, keyHigh: 84, velocityLow: 100, velocityHigh: 127, transpose: -12, muted: true, fromKeyboard: false,
        group: 1, source: 0, allocation: 0, layerLow: 80, layerHigh: 127, layerFade: 13 },
    ],
    focused: 1,
    held: [{ note: 48, velocity: 90 }, { note: 72, velocity: 112 }],
  });
  assert.deepEqual(bytes, [
    2, 0, 2, 1, 36,
    36, 54, 1, 127, 64, 5, 0, 0, 0, 127, 0, 8, ...ascii('Sub Bass'),
    60, 84, 100, 127, 52, 3, 1, 0, 80, 127, 13, 5, ...ascii('Brass'),
    2, 48, 90, 72, 112,
  ]);
});

test('changes: the golden the C++ test pins', () => {
  const str = (t) => [t.length, ...ascii(t)];
  const view = {
    state: 2, selected: 1, total: 300, listen: 100, back: 0, saves: 3, putBack: 1,
    sound: 'Glass Pad', against: 'your last save', when: '05 Oct 18:42',
    rows: [{ name: 'Cutoff', savedText: '2.1 kHz', nowText: '4.8 kHz', saved: 40, now: 62 },
           { name: 'Resonance', savedText: '12 %', nowText: '30 %', saved: 12, now: 30 }],
  };
  assert.deepEqual(changesPayload(view), [
    2, 2, 0, 2, 1, 44, 1, 100, 0, 3, 1,
    ...str('Glass Pad'), ...str('your last save'), ...str('05 Oct 18:42'), 0,
    40, 62, ...str('Cutoff'), ...str('2.1 kHz'), ...str('4.8 kHz'),
    12, 30, ...str('Resonance'), ...str('12 %'), ...str('30 %'),
  ]);
  const back = readChangesPayload(changesPayload(view));
  assert.deepEqual([back.state, back.total, back.saves, back.putBack], ['changed', 300, 3, 1]);
  assert.deepEqual(back.rows[1], { index: 1, saved: 12, now: 30, name: 'Resonance', savedText: '12 %', nowText: '30 %' });
  assert.equal(readChangesPayload([]).state, 'problem');
});

test('cue: the golden the C++ test pins', () => {
  const str = (t) => [t.length, ...ascii(t)];
  const view = {
    songs: 6, current: 1, picked: 2, song: 'Night Bus', tempo: 124, songSeconds: 252, setSeconds: 2282,
    plannedSeconds: 300, notes: ['Capo 2. Long intro.', 'Watch the drummer'], section: 'Bridge', sectionBar: 1,
    sectionBars: 4, nextSection: 'Chorus', nextSong: 'Glass Harbour', nextReady: 30, pickedSong: 'Glass Harbour',
  };
  assert.deepEqual(cuePayload(view), [
    6, 2, 3, 0, 252, 0, 234, 8, 44, 1, 216, 4, 1, 4, 30,
    ...str('Night Bus'), ...str('Bridge'), ...str('Chorus'), ...str('Glass Harbour'), ...str('Glass Harbour'),
    2, ...str('Capo 2. Long intro.'), ...str('Watch the drummer'),
  ]);
  const back = readCuePayload(cuePayload(view));
  assert.deepEqual([back.current, back.picked, back.tempo, back.setSeconds, back.nextReady], [1, 2, 124, 2282, 30]);
  assert.deepEqual(back.notes, view.notes);
  assert.equal(cuePayload({}).length, 21, 'no setlist is still a payload');
  assert.equal(readCuePayload(cuePayload({ ...view, picked: 1 })).pickedSong, '', 'picking the song on stage is no pick');
});

test('discover: the golden the C++ test pins', () => {
  const str = (t) => [t.length, ...ascii(t)];
  const view = {
    state: 1,
    sounds: [
      { name: 'Gritty Strings 62', instrument: 'Nebula', at: { x: 62, y: 30 }, percent: 87 },
      { name: 'Hollow Strings 61', instrument: 'Nebula', at: { x: 40, y: 70 }, percent: 85, kept: true },
      { name: 'Bright Strings 12', instrument: 'Brasswork', at: { x: 75, y: 12 }, percent: 71 },
    ],
    neverOpened: 11903, regularsCounted: 14, kind: 'Strings', centre: { x: 55, y: 40 },
    likeName: 'Lush Pad 19', likeLoads: 11, regulars: [{ x: 50, y: 35 }, { x: 60, y: 45 }],
  };
  assert.deepEqual(discoverPayload(view), [
    1, 3, 0, 3, 0, 127, 46, 14, ...str('Strings'), 55, 40,
    62, 30, 87, 0, ...str('Gritty Strings 62'), ...str('Nebula'),
    40, 70, 85, 1, ...str('Hollow Strings 61'), ...str('Nebula'),
    75, 12, 71, 0, ...str('Bright Strings 12'), ...str('Brasswork'),
    ...str('Lush Pad 19'), 11,
    2, 50, 35, 60, 45,
  ]);
  const back = readDiscoverPayload(discoverPayload(view));
  assert.equal(back.state, 'suggestions');
  assert.equal(back.neverOpened, 11903);
  assert.deepEqual(back.sounds[1], { index: 1, at: { x: 40, y: 70 }, percent: 85, kept: true,
    name: 'Hollow Strings 61', instrument: 'Nebula' });
  assert.deepEqual([back.likeName, back.likeLoads, back.regulars.length], ['Lush Pad 19', 11, 2]);
  const paged = discoverPayload({ state: 1, selected: 13, sounds: Array.from({ length: 30 }, (_, i) => ({ name: `S${i}` })) });
  assert.deepEqual(paged.slice(2, 5), [8, 8, 13], 'the list pages by eight');
  assert.equal(discoverPayload({}).length, 14, 'nothing to go on is still a payload');
});

// The screen card labels the encoders beside the screen from the same bytes the page draws, so
// reading them back has to give the view they were built from.
test('stage pages read back as the views they were built from', () => {
  const check = readSoundcheckPayload(soundcheckPayload({
    songs: [
      { name: 'Glass Harbour', checked: true, problems: 0, measured: true, rmsDb: -18.4, peakDb: -3.2 },
      { name: 'Salt Road', checked: true, problems: 2 },
      { name: 'Night Bus', checked: false },
    ],
    selected: 1, current: 0, basis: 'Current rig at check time',
    problems: ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing'],
  }));
  assert.equal(check.count, 3);
  assert.equal(check.selected, 1);
  assert.equal(check.current, 0, 'the song on stage, back to zero-based');
  assert.deepEqual(check.songs.map((s) => [s.name, s.status, s.level, s.problems]),
    [['Glass Harbour', 'ready', 43, 0], ['Salt Road', 'problems', 0, 2], ['Night Bus', 'unchecked', 0, 0]]);
  assert.equal(check.basis, 'Current rig at check time');
  assert.equal(check.problemCount, 2);
  assert.deepEqual(check.problemLines, ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing']);
  assert.equal(readSoundcheckPayload([]).count, 0, 'no bytes read as an empty set, not a throw');

  const layers = readLayersPayload(layersPayload({
    parts: [
      { name: 'Sub Bass', keyLow: 36, keyHigh: 54, velocityLow: 1, velocityHigh: 127, transpose: 0 },
      { name: 'Brass', keyLow: 60, keyHigh: 84, velocityLow: 100, velocityHigh: 127, transpose: -12, muted: true, fromKeyboard: false,
        group: 2, source: 1, allocation: 1, layerLow: 30, layerHigh: 90, layerFade: 6 },
    ],
    focused: 1,
    held: [{ note: 48, velocity: 90 }],
  }));
  assert.equal(layers.focused, 1);
  assert.deepEqual(layers.parts[1], { index: 1, name: 'Brass', keyLow: 60, keyHigh: 84, velocityLow: 100,
    velocityHigh: 127, transpose: -12, enabled: true, muted: true, fromKeyboard: false,
    group: 2, source: 1, allocation: 1, layerLow: 30, layerHigh: 90, layerFade: 6 });
  assert.deepEqual(layers.held, [{ note: 48, velocity: 90 }]);
  assert.deepEqual(readLayersPayload([]).parts, []);
});

test('custom calls: bytes, length-prefixed strings, raw strings, comments', () => {
  assert.deepEqual(parseCalls('-- a comment\n\nset_mode 2\nset_values 1, 0x7f 10\nset_text s"ab" "c"'), [
    { name: 'set_mode', bytes: [2] },
    { name: 'set_values', bytes: [1, 127, 10] },
    { name: 'set_text', bytes: [2, 97, 98, 99] },
  ]);
  assert.throws(() => parseCalls('set_values 300'), /does not fit in a byte/);
  assert.throws(() => parseCalls('set_values nope'), /cannot read/);
});

test('the preview runs the file the app embeds, not a copy of it', () => {
  const view = read('../src/ctrl49Preview/Ctrl49Preview.svelte');
  const cmake = read('../../../tools/ctrl49/embed_assets.cmake');
  for (const file of ['Hostage_MultiKnob.lua', 'knob_strip.png', 'hostage_logo.png']) {
    assert.match(cmake, new RegExp(`tools/ctrl49/${file.replace('.', '\\.')}`), `${file} is embedded`);
    assert.match(view, new RegExp(`'\\.\\./\\.\\./\\.\\./\\.\\./tools/ctrl49/${file.replace('.', '\\.')}\\?`), `and previewed from there`);
  }
  // The ids the broker uploads them under.
  assert.match(view, /0x0200: knobStripUrl, 0x0210: logoUrl/);
  const vite = read('../vite.config.js');
  assert.match(vite, /tools\/ctrl49/, 'the dev server may read that directory');
});

test('the images the keyboard tints are grey palette PNGs, the only kind it tints', () => {
  // An RGBA PNG decodes to a colour buffer on the CTRL49 and draw_image's colour is ignored:
  // the logo and every knob came out white on the hardware. VIP's own tinted images (captured
  // from its uploads) are all 8-bit palette PNGs of greys.
  for (const file of ['knob_strip.png', 'hostage_logo.png']) {
    const png = fs.readFileSync(new URL(`../../../tools/ctrl49/${file}`, import.meta.url));
    assert.equal(png[24], 8, `${file} is 8-bit`);
    assert.equal(png[25], 3, `${file} is a palette PNG`);
    const at = png.indexOf('PLTE');
    const length = png.readUInt32BE(at - 4);
    for (let i = 0; i < length; i += 3) {
      const [r, g, b] = [png[at + 4 + i], png[at + 5 + i], png[at + 6 + i]];
      assert.ok(r === g && g === b, `${file}'s palette is greys only`);
    }
    assert.equal(png.indexOf('tRNS'), -1, `${file} carries coverage in the grey, not in transparency`);
  }
});

test("the page keeps its ids inside the device's 1024-entry object table", () => {
  const lua = read('../../../tools/ctrl49/Hostage_MultiKnob.lua');
  const ids = [...lua.matchAll(/^local \w+_ID\s*=\s*(0x[0-9A-Fa-f]+|\d+)/gm)].map((m) => Number(m[1]));
  assert.ok(ids.length >= 4, 'the page declares its image ids');
  for (const id of ids) assert.ok(id < 1024, `id ${id} is under 1024`);
});

test('every function the broker calls is one the page defines', () => {
  const lua = read('../../../tools/ctrl49/Hostage_MultiKnob.lua');
  const broker = read('../../src/ControlSurface/Ctrl49SurfaceBroker.cpp');
  const called = new Set([...broker.matchAll(/callLua \("([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(called.size >= 2, 'the broker calls into the page');
  // A page beyond the knobs names its call once and sends it through a variable
  // (callLua (stageCall, ...)).
  const stage = [...broker.matchAll(/stageCall = "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(stage.sort(), ['set_changes', 'set_check', 'set_cue', 'set_discover', 'set_layers'],
    'each page beyond the knobs names its call');
  for (const name of [...called, ...stage, 'init', 'set_mode', 'draw'])
    assert.match(lua, new RegExp(`^function ${name}\\(`, 'm'), `${name} is defined`);
});

test('a control page\'s extension reads back: the page and the values as written', () => {
  const slots = [{ position: 10, assigned: true, valueText: '2.40 kHz' }, { position: 0, assigned: false, valueText: 'x' }];
  assert.deepEqual(readRackStateExtension(rackStatePayload(0, slots, { number: 3, count: 4 })),
    { page: 3, pages: 4, texts: ['2.40 kHz', '', '', '', '', '', '', ''] });
  assert.equal(readRackStateExtension(rackStatePayload(0, slots)), null, 'the plain nine bytes have none');
});
