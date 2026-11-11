/**
 * Gamechanger Audio's pedals: generated from the MIDI CC tables of their quick guides and manuals
 * (AUTO Delay, Chorus and Reverb, Motor Pedal) and the Bigsby's CC map by tools/profiles/gamechanger/,
 * and checked here that what is committed is what the generator makes, that the app's validator finds
 * nothing wrong, and that every row of the table is its controller: in 14 bits over CC n and n + 32
 * where its values sweep, its band's first value on CC n where they are named.
 *
 * The reader is checked on lines made by hand, in each document's shape.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readAddressTable, readBandTable } from '../../../tools/profiles/gamechanger/read-pedal-cc.mjs';
import { bandsOf, rangeBandsOf } from '../../../tools/profiles/gamechanger/build-pedal-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/gamechanger/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (y, ...words) => ({ page: 9, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 4, text: t })) });

test('the band form: a row\'s number on its last line (AUTO) or its first (Motor Pedal), a band overrunning its column', () => {
  const auto = readBandTable([
    line(27, [150, 'MSB'], [162, 'and'], [172, 'LSB'], [184, 'value']),
    line(32, [14, 'CC'], [25, 'NAME'], [67, 'MSB'], [79, 'value'], [150, '[n+32]']),
    line(40, [14, '8'], [25, 'LEVEL'], [67, '[0...127]'], [86, '='], [90, '[0...1]'], [150, '[0...16383]'], [175, '='], [179, '[0...1]']),
    line(197, [67, '[0...42]'], [83, '='], [87, 'OFF,'], [99, '[43...84]'], [119, '='], [123, '50%,'], [136, '[85...'], [150, '[0...5461]'], [172, '='], [176, 'OFF,']),
    line(203, [14, '23'], [25, 'Ping'], [37, 'Pong'], [67, '127]'], [78, '='], [82, '100%'], [150, '[10923...16383]'], [186, '='], [190, '100%']),
    line(290, [12, 'TECHNICAL'], [60, 'SPECIFICATION']),
  ], { numberLine: 'last' });
  assert.deepEqual(auto.map((r) => [r.cc, r.name, r.msb]), [[8, 'LEVEL', '[0...127] = [0...1]'], [23, 'Ping Pong', '[0...42] = OFF, [43...84] = 50%, [85... 127] = 100%']]);
  const pedal = readBandTable([
    line(175, [15, 'CC'], [46, 'NAME'], [89, 'MSB'], [99, 'value'], [182, 'MSB'], [193, 'and'], [202, 'LSB']),
    line(181, [15, '1'], [46, 'MOD'], [89, '[0...127]'], [182, '[0...16383]']),
    line(186, [15, '(MODWHEEL)']),
    line(308, [15, '14'], [46, 'EFFECT'], [89, '[0...63]'], [103, '='], [107, 'OFF,'], [182, '[0...8191]'], [202, '='], [205, 'OFF,']),
    line(313, [89, '[64...127]'], [108, '='], [111, 'ON'], [182, '[8192...16383]'], [211, '='], [215, 'ON']),
    line(383, [17, 'PC'], [25, '1']),
  ], { numberLine: 'first' });
  assert.deepEqual(pedal.map((r) => [r.cc, r.name, r.pair]), [[1, 'MOD (MODWHEEL)', '[0...16383]'], [14, 'EFFECT', '[0...8191] = OFF, [8192...16383] = ON']]);
  assert.deepEqual(bandsOf(auto[1].msb), [{ from: 0, to: 42, label: 'OFF' }, { from: 43, to: 84, label: '50%' }, { from: 85, to: 127, label: '100%' }]);
  assert.deepEqual(bandsOf('[0...63] = [-1...0], [64...127] = [0...1]').map((b) => b.label), ['[-1...0]', '[0...1]']);
});

test('the address form: a row a line until the table ends; its ranges', () => {
  const rows = readAddressTable([
    line(10, [20, 'Adjustment'], [140, 'Address'], [190, 'Range']),
    line(20, [20, 'Rate'], [40, 'MSB'], [150, '14'], [190, '0-127']),
    line(30, [20, 'Latch'], [150, '106'], [190, '0-63'], [210, '–'], [216, 'OFF,'], [236, '64-127'], [262, '-'], [268, 'ON']),
    line(40, [20, 'PC'], [34, 'MAP']),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.cc, r.range]), [['Rate MSB', 14, '0-127'], ['Latch', 106, '0-63 – OFF, 64-127 - ON']]);
  assert.deepEqual(rangeBandsOf(rows[1].range), [{ from: 0, to: 63, label: 'OFF' }, { from: 64, to: 127, label: 'ON' }]);
  assert.equal(rangeBandsOf('0-127'), null);
});

const BUILT = (await Promise.all(SYNTHS.map((name) => build(name)))).filter((b) => b.layout.form);
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
// A pair goes out as one message of two control changes: read it three bytes at a time.
const sent = (profile, parameterId, value) => localCompileParameter(profile, { parameterId, value }).transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

test('five pedals are built', () => {
  assert.deepEqual(BUILT.map((b) => b.name).sort(), ['auto-chorus', 'auto-delay', 'auto-reverb', 'bigsby', 'motor-pedal']);
});

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/gamechanger/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its controller, a sweep in 14 bits, a named value its band's first`, () => {
    let laidOut = 0;
    for (const row of data.bands ?? []) {
      const p = profile.parameters.find((x) => x.description.startsWith(`CC ${row.cc} (LSB`));
      assert.ok(p, `CC ${row.cc} ${row.name} is not laid out`);
      laidOut++;
      const pair = bandsOf(row.pair);
      if (p.type === 'choice') {
        const msb = bandsOf(row.msb);
        assert.deepEqual(p.choices.map((c) => c.value), msb.map((b) => b.from), p.id);
        for (const [c, b] of p.choices.map((c, k) => [c, msb[k]])) assert.equal(sent(profile, p.id, c.id), hex([0xb0, row.cc, b.from]), `${p.id} = ${c.id}`);
      } else {
        assert.deepEqual([p.range.min, p.range.max], [pair[0].from, pair.at(-1).to], p.id);
        for (const v of [p.range.min, 8192, p.range.max]) assert.equal(sent(profile, p.id, v), [[row.cc, v >> 7], [row.cc + 32, v & 127]].map(([c, x]) => hex([0xb0, c, x])).join('\n'), `${p.id} = ${v}`);
      }
    }
    for (const row of data.addresses ?? []) {
      const p = profile.parameters.find((x) => new RegExp(`^CC ${row.cc}\\b|and CC ${row.cc} \\(LSB\\)`).test(x.description));
      assert.ok(p, `CC ${row.cc} ${row.name} is not laid out`);
      if (/ LSB$/.test(row.name)) continue;
      laidOut++;
      const top = p.type === 'choice' ? p.choices.at(-1) : null;
      const max = p.type === 'choice' ? top.id : p.range.max;
      const want = / MSB$/.test(row.name) ? [[row.cc, 127], [row.cc + 32, 127]] : [[row.cc, top ? top.value : 127]];
      assert.equal(sent(profile, p.id, max), want.map(([c, x]) => hex([0xb0, c, x])).join('\n'), `${p.id} = ${max}`);
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(sent(profile, t.parameter, t.value), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Gamechanger's own, and nobody has tried it on a pedal`, () => {
    assert.equal(profile.manufacturer, 'Gamechanger Audio');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/gamechangeraudio\.com\/wp-content\/uploads\//);
  });
}

test('the AUTO pedals\' attenuverters rest at their middle; the Motor Pedal\'s shift reads -Oct to +Oct', () => {
  const delay = BUILT.find((b) => b.name === 'auto-delay').profile;
  const cv = delay.parameters.find((p) => p.name === 'Attenuverter for CV in 1');
  assert.deepEqual([cv.default, cv.display.min, cv.display.max], [8192, -1, 1]);
  const shift = BUILT.find((b) => b.name === 'motor-pedal').profile.parameters.find((p) => p.name === 'SHIFT');
  assert.deepEqual(shift.choices.map((c) => `${c.label}=${c.value}`), ['-Oct=0', '-5th=18', '-4th=36', '0=54', '+4th=73', '+5th=91', '+Oct=109']);
});
