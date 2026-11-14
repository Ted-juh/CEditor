/**
 * The Arturia profiles: generated from the MIDI CC chart of each manual by tools/profiles/arturia/,
 * and checked here that what is committed is what the generator makes, that the app's validator
 * finds nothing wrong, and that every parameter is the controller its row prints.
 *
 * The reader is checked on lines made by hand, in the shapes the manuals set their charts: a section
 * column set once for the rows under it, blocks stacked with a resolution column, blocks side by side
 * with `MIDI` and `CC` over two lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { headerBlocks, readCcChart } from '../../../tools/profiles/arturia/read-arturia-cc.mjs';
import { SYNTHS, build } from '../../../tools/profiles/arturia/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('a header: its blocks, their titles and CC columns; headings and sentences are not headers', () => {
  const side = headerBlocks(line(1, 50, [52, 'VCO'], [72, '1'], [80, 'Parameter'], [136, 'MIDI'], [153, 'CC'], [180, 'MIDI'], [205, 'Parameter'], [260, 'MIDI'], [283, 'EXPRESSION'], [351, 'MIDI']).words);
  assert.deepEqual(side.map((b) => [b.title, b.cc]), [['VCO 1', 136], ['MIDI', 260], ['EXPRESSION', 351]], '`MIDI` before `Parameter` is a title; `MIDI` alone a CC column');
  const stacked = headerBlocks(line(1, 50, [52, 'ENV'], [72, '2'], [80, '(VCF)'], [110, 'Parameters'], [200, 'MIDI'], [222, 'CC'], [260, 'Resolution']).words);
  assert.deepEqual(stacked.map((b) => [b.title, b.cc, b.extra]), [['ENV 2 (VCF)', 200, 260]]);
  const sections = headerBlocks(line(1, 50, [52, 'Section'], [174, 'Parameter'], [328, 'CC']).words);
  assert.deepEqual(sections.map((b) => [b.section, b.name, b.cc]), [[52, 174, 328]]);
  assert.deepEqual(headerBlocks(line(1, 50, [52, 'Parameter'], [300, 'CC'], [313, 'number']).words).map((b) => b.cc), [300]);
  assert.deepEqual(headerBlocks(line(1, 20, [74, '16.2.5.'], [115, 'MIDI'], [141, 'Control'], [183, 'Change'], [219, 'Messages']).words), []);
  assert.deepEqual(headerBlocks(line(1, 20, [45, 'Here'], [64, 'is'], [72, 'the'], [86, 'MIDI'], [106, 'implementation'], [165, 'chart:']).words), []);
});

test('rows: a section set once, blocks side by side read one after the other, a header\'s second line, the footer', () => {
  const mini = readCcChart([
    line(1, 100, [52, 'Section'], [174, 'Parameter'], [328, 'CC']),
    line(1, 115, [52, 'OSC'], [70, '1'], [174, 'Tune'], [328, '70']),
    line(1, 130, [174, 'Wave'], [328, '14']),
    line(1, 145, [52, 'Analog'], [90, 'Filter'], [174, 'Cutoff'], [328, '74']),
    line(1, 578, [34, 'Arturia'], [80, '-'], [90, 'User'], [115, 'Manual'], [150, 'MiniFreak'], [377, '116']),
  ]);
  assert.deepEqual(mini.map((r) => [r.title, r.name, r.cc]), [['OSC 1', 'Tune', 70], ['OSC 1', 'Wave', 14], ['Analog Filter', 'Cutoff', 74]]);
  const poly = readCcChart([
    line(1, 273, [52, 'LADDER'], [90, 'FILTER'], [133, 'MIDI'], [150, 'CC'], [171, 'STEINER'], [210, 'FILTER'], [254, 'MIDI']),
    line(1, 282, [52, 'Parameter'], [171, 'Parameter'], [254, 'CC']),
    line(1, 297, [52, 'Cutoff'], [133, '25'], [171, 'Cutoff'], [254, '23']),
    line(1, 312, [52, 'Level'], [133, '8'], [171, 'Level'], [254, '7']),
    // The PolyBrute 12's footer: its `12` sits under a CC column.
    line(1, 578, [200, 'Arturia'], [240, '-'], [250, 'User'], [270, 'Manual'], [300, 'PolyBrute'], [254, '12']),
  ]);
  assert.deepEqual(poly.map((r) => [r.title, r.name, r.cc]), [['LADDER FILTER', 'Cutoff', 25], ['LADDER FILTER', 'Level', 8], ['STEINER FILTER', 'Cutoff', 23], ['STEINER FILTER', 'Level', 7]]);
  const matrix = readCcChart([
    line(1, 100, [52, 'VCO'], [72, '1'], [80, 'Parameters'], [200, 'MIDI'], [222, 'CC'], [260, 'Resolution']),
    line(1, 115, [52, 'Fine'], [200, '65'], [260, '7-bit']),
    line(1, 130, [52, 'Sub'], [200, '9'], [260, '7-bit/14-bit']),
  ]);
  assert.deepEqual(matrix.map((r) => [r.title, r.name, r.cc, r.extra]), [['VCO 1', 'Fine', 65, '7-bit'], ['VCO 1', 'Sub', 9, '7-bit/14-bit']]);
});

/* ------------------------------------------------------------------ every profile */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/arturia/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller, at both ends of its range, each controller once`, () => {
    const ids = new Set();
    const ccs = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!ccs.has(r.controller), `CC ${r.controller} twice`);
      ccs.add(r.controller);
      for (const value of [0, 127]) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), hex([0xb0, r.controller, value]), `${p.id} = ${value}`);
    }
    assert.ok(profile.tests.length > 0);
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    // Every row of the chart is a parameter or named in the notes as left out.
    for (const row of data.rows) assert.ok(ccs.has(row.cc) || profile.authoringNotes.some((n) => n.includes(`CC ${row.cc} ${row.name}`)), `CC ${row.cc} ${row.name}`);
  });

  test(`${profile.id}: the source is Arturia's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Arturia');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const cc = (profile, p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe).controller;

test('the MiniFreak: sections, Glide out of Pedals, the pedals and wheel left out, the envelope\'s Sustain kept', () => {
  const mf = builtProfile('arturia-minifreak');
  assert.equal(cc(mf, param(mf, 'Analog Filter', 'Cutoff')), 74);
  assert.equal(cc(mf, param(mf, 'Glide', 'Glide')), 5);
  assert.equal(cc(mf, param(mf, 'Envelope', 'Sustain')), 82);
  assert.equal(mf.parameters.some((p) => p.group === 'Pedals' || p.name === 'Mod Wheel'), false);
});

test('the MatrixBrute: two filters\' controls apart, the macro knobs on the pedals\' controllers, 7 bits', () => {
  const mb = builtProfile('arturia-matrixbrute');
  assert.equal(cc(mb, param(mb, 'STEINER', 'Cutoff')), 23);
  assert.equal(cc(mb, param(mb, 'LADDER', 'Cutoff')), 25);
  assert.equal(cc(mb, param(mb, 'MACRO KNOBS', 'M3')), 4);
  assert.equal(cc(mb, param(mb, 'ENV 1', 'Sustain')), 28);
  assert.match(param(mb, 'STEINER', 'Cutoff').description, /7 or 14 bits; sent here as 7/);
  assert.ok(mb.authoringNotes.some((n) => n.includes('CC 4 (Expr. Pedal 1; MACRO KNOBS M3)')));
});

test('the PolyBrute and PolyBrute 12: one chart, three blocks a row, the ribbon and expression pedals left out', () => {
  const pb = builtProfile('arturia-polybrute');
  const pb12 = builtProfile('arturia-polybrute-12');
  assert.deepEqual(pb12.parameters.map((p) => [p.id, p.messageRecipe]), pb.parameters.map((p) => [p.id, p.messageRecipe]));
  assert.equal(cc(pb, param(pb, 'MOD ENV', 'Delay')), 108);
  assert.equal(cc(pb, param(pb, 'EXPRESSION', 'Morphée Z')), 89);
  assert.equal(cc(pb, param(pb, 'FILTERS COMMON', 'Master Cutoff')), 27);
  assert.equal(pb.parameters.some((p) => /^(Ribbon|Exp \d|Mod Wheel)$/.test(p.name)), false);
});

test('the MicroFreak: no sections, so groups from the names; Keyboard Hold on CC 64 kept', () => {
  const mf = builtProfile('arturia-microfreak');
  assert.equal(cc(mf, param(mf, 'Oscillator', 'Oscillator Type')), 9);
  assert.equal(cc(mf, param(mf, 'Cycling Env', 'Cycling env rise')), 102);
  assert.equal(cc(mf, param(mf, 'Arp/Seq', 'ARP/SEQ rate (sync)')), 92);
  assert.equal(cc(mf, param(mf, 'Keyboard', 'Keyboard Hold (toggle)')), 64);
});
