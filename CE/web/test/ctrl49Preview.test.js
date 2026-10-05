// The HoSTage CTRL49 screen preview: its payloads have to be the bytes the C++ sends, or the
// preview is a picture of something the keyboard never shows. The expected bytes below are the
// ones Ctrl49RackDisplayTests and the performance builders pin on the C++ side.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rackLabelPayload, rackStatePayload, performanceTitle, performanceLabelPayload,
  performanceStatePayload, browseSlotViews, soundcheckPayload, soundcheckLevelByte, layersPayload,
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

// The same views and the same bytes as kGoldenSoundcheck and kGoldenLayers in
// CE/tests/Ctrl49StagePagesTests.cpp: change one, change the other.
test('soundcheck: the golden the C++ test pins', () => {
  const bytes = soundcheckPayload({
    songs: [
      { name: 'Glass Harbour', checked: true, problems: 0, measured: true, rmsDb: -18.4, peakDb: -3.2 },
      { name: 'Salt Road', checked: true, problems: 2 },
      { name: 'Night Bus', checked: false },
    ],
    selected: 1, current: 0, basis: 'Current rig at check time',
    problems: ['MIDI output unavailable: USB MIDI 2', 'Drifter: plug-in file is missing'],
  });
  assert.deepEqual(bytes, [
    3, 0, 3, 1, 1, 1, 1, 1,
    1, 43, 0, 13, ...ascii('Glass Harbour'),
    2, 0, 2, 9, ...ascii('Salt Road'),
    0, 0, 0, 9, ...ascii('Night Bus'),
    25, ...ascii('Current rig at check time'),
    2, 2,
    35, ...ascii('MIDI output unavailable: USB MIDI 2'),
    32, ...ascii('Drifter: plug-in file is missing'),
    0, 0, 0,
  ]);
  assert.equal(soundcheckLevelByte(true, 0), 61);
  assert.equal(soundcheckLevelByte(false, -10), 0, 'not measured is 0, whatever the number');
  const long = soundcheckPayload({ songs: [{ name: 'S', checked: true, problems: 1 }], problems: ['x'.repeat(80)] });
  assert.deepEqual(long.slice(-48, -3).slice(-4), [...ascii('x'), ...ascii('...')], 'a long problem ends in "..."');
});

test('layers: the golden the C++ test pins', () => {
  const bytes = layersPayload({
    parts: [
      { name: 'Sub Bass', keyLow: 36, keyHigh: 54, velocityLow: 1, velocityHigh: 127, transpose: 0 },
      { name: 'Brass', keyLow: 60, keyHigh: 84, velocityLow: 100, velocityHigh: 127, transpose: -12, muted: true, fromKeyboard: false },
    ],
    focused: 1,
    held: [{ note: 48, velocity: 90 }, { note: 72, velocity: 112 }],
  });
  assert.deepEqual(bytes, [
    2, 0, 2, 1, 36,
    36, 54, 1, 127, 64, 5, 8, ...ascii('Sub Bass'),
    60, 84, 100, 127, 52, 3, 5, ...ascii('Brass'),
    2, 48, 90, 72, 112,
  ]);
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
  for (const name of [...called, 'init', 'set_mode', 'draw'])
    assert.match(lua, new RegExp(`^function ${name}\\(`, 'm'), `${name} is defined`);
});
