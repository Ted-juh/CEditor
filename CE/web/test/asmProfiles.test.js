/**
 * The ASM profiles: generated from ASM's MIDI NRPN specification by tools/profiles/asm/, and checked
 * here that what is committed is what the generator makes, that the app's validator finds nothing
 * wrong, and that every parameter is the NRPN its row prints, its value VV * 128 + WW.
 *
 * The reader is checked on lines made by hand, in the shapes the spec sets its table: a name and a
 * comment over several lines around their row's numbers, a name carried over a page break, a row
 * printed on both sides of one, rhythm lists captioned underneath.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readNrpnSpec, readRhythmLists } from '../../../tools/profiles/asm/read-asm-nrpn.mjs';
import { lsbRange, readNote } from '../../../tools/profiles/asm/build-asm-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/asm/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });
const header = (page) => [
  line(page, 169, [206, 'CC'], [233, 'CC'], [261, 'NRPN'], [301, 'NRPN']),
  line(page, 174, [97, 'Category'], [149, 'Parameter']),
  line(page, 179, [205, 'Dec'], [231, 'Hex'], [264, 'MSB'], [305, 'LSB'], [346, '='], [353, 'VV']),
  line(page, 189, [365, 'value'], [388, 'range'], [412, 'is'], [420, '[0'], [430, '-'], [435, '2000H].']),
];

test('rows: the NRPN anchors a row; a name, a comment and a category set around it are its', () => {
  const rows = readNrpnSpec([
    ...header(3),
    line(3, 232, [338, 'when'], [359, 'VV=00H'], [391, ',set'], [407, 'OSC1'], [431, 'Mode,']),
    line(3, 242, [338, 'when'], [359, 'VV=01H'], [392, ',set'], [407, 'OSC2'], [431, 'Mode,']),
    line(3, 247, [149, 'OSC'], [169, 'Mode'], [265, '3FH'], [305, '18H']),
    line(3, 252, [338, 'WW'], [355, '='], [362, '[0,1]'], [380, '='], [387, 'Single'], [411, '/'], [416, 'WaveScan']),
    line(3, 257, [106, 'OSC']),
    line(3, 429, [158, 'OSC1']),
    line(3, 433, [265, '3FH'], [305, '54H'], [338, 'VV*128+WW'], [387, '='], [394, '[0,200]']),
    line(3, 439, [153, 'Keytrack']),
    line(3, 462, [149, 'OSC1'], [172, 'WavScan'], [207, '24'], [234, '18'], [265, '41H'], [305, '2AH']),
    // A run of NRPNs, its LSB over two lines.
    line(3, 500, [150, 'Macro1'], [180, 'Btn'], [305, '30H-']),
    line(3, 505, [265, '3DH']),
    line(3, 510, [150, 'value1'], [180, 'to'], [190, 'value8'], [305, '37H']),
  ]);
  assert.deepEqual(rows, [
    { page: 3, category: 'OSC', name: 'OSC Mode', msb: '3FH', lsb: '18H', note: 'when VV=00H ,set OSC1 Mode, when VV=01H ,set OSC2 Mode, WW = [0,1] = Single / WaveScan' },
    { page: 3, name: 'OSC1 Keytrack', msb: '3FH', lsb: '54H', note: 'VV*128+WW = [0,200]' },
    { page: 3, name: 'OSC1 WavScan', cc: 24, msb: '41H', lsb: '2AH' },
    { page: 3, name: 'Macro1 Btn value1 to value8', msb: '3DH', lsb: '30H-37H' },
  ]);
});

test('rows: a name carried over a page break, a row printed on both sides of one', () => {
  const rows = readNrpnSpec([
    ...header(3),
    line(3, 700, [158, 'OSC1']),
    line(3, 710, [150, 'WaveScan'], [265, '3FH'], [305, '65H']),
    // The name's last line at the head of the next page, above that page's first row.
    line(4, 80, [159, 'Wav6']),
    line(4, 110, [158, 'OSC1']),
    line(4, 120, [150, 'WaveScan'], [265, '3FH'], [305, '66H']),
    line(4, 130, [159, 'Wav7']),
    // A row split by the break: its numbers and comment on both pages.
    line(4, 700, [150, 'ENV1'], [175, 'Delay(BPM'], [265, '3FH'], [305, '00H'], [338, 'VV=18H']),
    line(5, 80, [150, 'Sync'], [175, 'on)'], [265, '3FH'], [305, '00H'], [338, 'VV=18H']),
  ]);
  assert.deepEqual(rows.map((r) => [r.page, r.name, r.lsb]), [[3, 'OSC1 WaveScan Wav6', '65H'], [4, 'OSC1 WaveScan Wav7', '66H'], [4, 'ENV1 Delay(BPM Sync on)', '00H']]);
});

test('the rhythm lists: a list, then its caption', () => {
  const lists = readRhythmLists([
    line(26, 639, [263, 'RHYTHM'], [299, 'LISTS']),
    line(26, 657, [95, '1/1'], [108, '1/2'], [122, '1/4T']),
    line(26, 675, [284, 'ARP']),
    line(27, 105, [95, '0'], [102, '1/64T'], [124, '1/1Dot']),
    line(27, 115, [95, '8‘'], [108, '64‘']),
    line(27, 134, [275, 'ENV'], [294, 'LFO']),
    line(28, 106, [90, 'MIDI'], [114, 'CC'], [129, 'mapping'], [170, 'Sorted'], [202, 'by'], [216, 'Module']),
  ]);
  assert.deepEqual(lists, { ARP: ['1/1', '1/2', '1/4T'], 'ENV LFO': ['0', '1/64T', '1/1Dot', '8‘', '64‘'] });
});

test('a comment: the default range, a range, choices, VV choosing the parameter, a signed WW, depth', () => {
  assert.deepEqual(lsbRange('30H-37H'), [0x30, 0x37]);
  assert.deepEqual(readNote(undefined), [{ base: 0, lo: 0, hi: 8192, description: 'The spec gives no range: its default, 0 - 8192.' }]);
  assert.deepEqual(readNote('VV*128+WW = [0,218]'), [{ base: 0, lo: 0, hi: 218 }]);
  assert.deepEqual(readNote('VV*128+WW = [0,3] means HALL / ROOM / PLATE / CLOUD')[0].choices.map((c) => c.label), ['HALL', 'ROOM', 'PLATE', 'CLOUD']);
  const mode = readNote('when VV=00H ,set OSC1 Mode, when VV=01H ,set OSC2 Mode, WW = [0,1] = Single / WaveScan');
  assert.deepEqual(mode.map((m) => [m.suffix, m.base, m.choices.map((c) => c.label).join('/')]), [['OSC1 Mode', 0, 'Single/WaveScan'], ['OSC2 Mode', 128, 'Single/WaveScan']]);
  const semi = readNote('when VV=00H ,set OSC1 Semi, when WW > 64,semi = WW - 128. when WW <= 64,semi = WW .')[0];
  assert.equal(semi.choices.find((c) => c.label === '-12').value, 116, 'two\'s complement in WW');
  assert.equal(semi.choices.find((c) => c.label === '+64').value, 64);
  assert.deepEqual(readNote('VV=02H ,WW = [50,75]'), [{ base: 256, lo: 50, hi: 75 }]);
  assert.equal(readNote('VV = [0,3] means MUTATOR 1-4 WW = [0,2] means OSC1 / OSC2 / OSC3').length, 4);
  assert.deepEqual(readNote('VV*128+WW = 0 means depth = -128 VV*128+WW = 4096 means depth = 0 VV*128+WW = 8192 means depth = 128')[0].display, { min: -128, max: 128 });
  assert.match(readNote('depends on PRE-FX type').leave, /effect type/);
  assert.equal(readNote('[Rhythm List (ARP)]', { ARP: ['1/1', '1/2'] })[0].choices[1].label, '1/2');
  assert.throws(() => readNote('something the builder has never seen'), /comment not read/);
});

/* ------------------------------------------------------------------ every profile */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');
const nrpn = (r, value) => [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, value >> 7], [0x26, value & 127]].map(([cc, v]) => hex([0xb0, cc, v])).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/asm/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its NRPN, VV * 128 + WW on CC 6 and 38, at both ends`, () => {
    const ids = new Set();
    const messages = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of ends) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        assert.equal(lines(compiled), nrpn(r, wire), `${p.id} = ${value}`);
      }
      // No two parameters on one NRPN with the same VV.
      const key = `${r.id}/${(p.type === 'choice' ? p.choices[0].value : p.range.min) >> 7}`;
      assert.ok(!messages.has(key), `${p.id}: ${key} twice`);
      messages.add(key);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is ASM's specification, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'ASM');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ the Hydrasynth */

const hydra = BUILT.find((b) => b.profile.id === 'asm-hydrasynth').profile;
const param = (group, name) => hydra.parameters.find((p) => p.group === group && p.name === name);
const send = (p, value) => lines(localCompileParameter(hydra, { parameterId: p.id, value }));

test('the Hydrasynth: an NRPN shared by three oscillators, each sent with its VV', () => {
  assert.equal(send(param('OSC', 'OSC3 Mode'), 'wavescan'), nrpn({ parameterMsb: 0x3f, parameterLsb: 0x18 }, 2 * 128 + 1));
  assert.equal(param('OSC', 'OSC1 Semi').choices.length, 128);
  assert.equal(param('Mutator', 'Mutator Sources (FM-Lin) 4').choices.at(-1).label, 'Mod in 2');
});

test('the Hydrasynth: values shown as printed, sent as VV * 128 + WW', () => {
  const swing = param('Arp', 'ARP Swing');
  assert.deepEqual([swing.range, swing.display.min, swing.display.max], [{ min: 306, max: 331 }, 50, 75], 'VV=02H, WW 50 - 75');
  assert.deepEqual(param('Arp', 'ARP Division').choices.map((c) => c.label).slice(0, 4), ['1/1', '1/2', '1/4', '1/8'], 'the ARP rhythm list');
  assert.equal(param('LFO 1', 'LFO1 Rate(BPM Sync on)').choices[0].label, '64‘');
  assert.deepEqual([param('Macro 3', 'Macro3 Depth8').display.min, param('Macro 3', 'Macro3 Depth8').display.max], [-128, 128]);
  assert.ok(param('LFO 5', 'LFO5 step64'), 'step9 to step64, NRPN 4AH 00H-37H');
  assert.match(param('Filter 1', 'Filter1 Cutoff').description, /Also CC 74/);
});

test('the Hydrasynth: misprints corrected, a conflict left out, effect-dependent settings left out', () => {
  assert.equal(param('LFO 4', 'LFO4 Smooth').range.min, 6 * 128, 'printed VV=07H, as Steps is');
  assert.equal(param('LFO 5', 'LFO5 Steps').range.min, 7 * 128, 'printed VV=08H');
  assert.equal(param('LFO 1', 'LFO1 Smooth'), undefined);
  assert.equal(param('ENV 5', 'ENV5 Loop'), undefined);
  assert.ok(param('ENV 5', 'ENV5 Reset'), 'ENV5\'s other switches do not collide');
  assert.ok(hydra.authoringNotes.some((n) => /same NRPN and VV \(3FH 04H, VV 06H\): LFO1 Smooth and ENV5 Loop/.test(n)));
  assert.equal(hydra.parameters.some((p) => /Target$|Mod Source|Param[345]$|preset$/.test(p.name)), false);
  assert.ok(param('Macros', 'Macro1 panel value'), 'printed `marco1 panel value`');
  assert.ok(param('LFO 2', 'LFO2 BPM Sync'), 'printed `BMP Sync`');
  assert.equal(hydra.parameters.some((p) => p.group === 'Sound'), false, 'every row has a group from the layout');
});
