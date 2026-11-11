/**
 * The Erica Synths profiles: generated from the MIDI charts of the PĒRKONS HD-01's and LXR-02's
 * manuals by tools/profiles/erica/, and checked here that what is committed is what the generator
 * makes, that the app's validator finds nothing wrong, and that every parameter is the controller or
 * NRPN its chart prints.
 *
 * The readers are checked on lines made by hand: the voice matrix, and function lists side by side
 * with a page's footer where a list's numbers stand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readFunctionLists, readVoiceMatrix } from '../../../tools/profiles/erica/read-erica-charts.mjs';
import { rowsOf } from '../../../tools/profiles/erica/build-erica-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/erica/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('the voice matrix: a row a parameter, a cell under each voice', () => {
  const rows = readVoiceMatrix([
    line(1, 96, [197, 'VOICE'], [225, '1'], [311, 'VOICE'], [340, '2'], [658, 'All'], [668, '8'], [675, 'potentiometers']),
    line(1, 129, [78, 'TUNE'], [208, '70'], [324, '81'], [658, 'In'], [667, 'SINGLE']),
    line(1, 150, [78, 'ALGO'], [104, 'SWITCH'], [208, '78'], [324, '89']),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.voice, r.cc]), [['TUNE', 1, 70], ['TUNE', 2, 81], ['ALGO SWITCH', 1, 78], ['ALGO SWITCH', 2, 89]]);
});

test('the function lists: CC and NRPN lists side by side, a row\'s voice under its header, a footer passed over', () => {
  const rows = readFunctionLists([
    line(1, 32, [28, 'CC'], [61, 'Function'], [150, 'Voice'], [390, 'NRPN'], [408, 'Nr.'], [422, 'Function'], [522, 'Voice']),
    line(1, 44, [29, '112'], [62, 'Decimation'], [150, '4'], [390, '22'], [423, 'Velocity'], [450, 'mod.'], [463, 'destination'], [527, '2']),
    line(1, 54, [29, '98'], [62, 'NRPN'], [85, 'fine'], [390, '116'], [423, '-'], [523, '-']),
    line(1, 700, [29, '36'], [300, 'L'], [306, 'XR'], [320, 'OWNERS'], [360, 'MANUAL']),
  ]);
  assert.deepEqual(rows.map((r) => [r.kind, r.number, r.name, r.voice]), [
    ['cc', 98, 'NRPN fine', ''], ['cc', 112, 'Decimation', '4'], ['nrpn', 22, 'Velocity mod. destination', '2'], ['nrpn', 116, '-', '-'],
  ]);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/erica/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller or NRPN, each once, every row laid out or named`, () => {
    const sent = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!sent.has(r.id), `${r.id} twice`);
      sent.add(r.id);
      for (const v of [0, 127]) {
        const want = r.kind === 'cc' ? hex([0xb0, r.controller, v]) : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, v]].map(([c, x]) => hex([0xb0, c, x])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), want, `${p.id} = ${v}`);
      }
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of rowsOf(data)) {
      const label = `${row.kind === 'cc' ? 'CC' : 'NRPN'} ${row.number}`;
      const laid = profile.parameters.some((p) => p.name === row.name && p.description.startsWith(`${label},`));
      assert.ok(laid || profile.authoringNotes.some((n) => new RegExp(`\\b${label}\\b`).test(n)), `${label} ${row.name}`);
    }
  });

  test(`${profile.id}: the source is Erica Synths' manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Erica Synths');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

test('the PĒRKONS\'s four voices and the LXR-02\'s NRPNs', () => {
  const perkons = BUILT.find((b) => b.profile.id === 'erica-perkons-hd-01').profile;
  assert.deepEqual([...new Set(perkons.parameters.map((p) => p.group))], ['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4']);
  assert.ok(perkons.parameters.find((p) => p.group === 'Voice 3' && p.name === 'FILTER SWITCH').description.includes('highpass'));
  const lxr = BUILT.find((b) => b.profile.id === 'erica-lxr-02').profile;
  const fx = lxr.parameters.find((p) => p.name === 'FX Delay Type');
  assert.equal(fx.group, 'FX');
  assert.equal(lines(localCompileParameter(lxr, { parameterId: fx.id, value: 3 })), 'B0 63 00\nB0 62 75\nB0 06 03');
  assert.equal(lxr.parameters.find((p) => p.name === 'Decimation' && p.group === 'All voices').messageRecipe, 'cc115');
});
