/**
 * The Sonicware profiles: generated from the MIDI implementation chart Sonicware publishes for each
 * instrument by tools/profiles/sonicware/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every parameter is the
 * controller its row prints, on its block's channel.
 *
 * The reader is checked on lines made by hand: rows, the two marks, a wider space between blocks,
 * a block's label set beside it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readChart } from '../../../tools/profiles/sonicware/read-sonicware-chart.mjs';
import { groupOf } from '../../../tools/profiles/sonicware/build-sonicware-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/sonicware/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('a chart: its rows, their marks, blocks at the wider space, each block\'s label', () => {
  const rows = readChart([
    line(1, 300, [85, 'Control'], [119, '*1'], [179, '5'], [266, '〇'], [351, '〇'], [440, 'VELOCITY']),
    line(1, 312, [84, 'Change'], [179, '20'], [266, '〇'], [351, '〇'], [440, 'FX'], [455, 'TYPE']),
    line(1, 324, [82, '(PATTERN)'], [179, '21'], [266, '〇'], [351, '×'], [440, 'FX'], [455, 'SPEED']),
    line(1, 343, [179, '27'], [266, '〇'], [351, '〇'], [440, 'SYNTH']),
    line(1, 355, [85, 'Control'], [119, '*2'], [179, '28'], [266, '〇'], [351, '〇'], [440, 'OCTAVE']),
    line(1, 367, [84, 'Change'], [179, '29'], [266, '〇'], [351, '〇'], [440, 'FILTER']),
    line(1, 379, [82, '(TRACK)'], [179, '30'], [266, '〇'], [351, '〇'], [440, 'RESO']),
  ], { transmitted: 286, recognized: 371, remarks: 450 });
  assert.deepEqual(rows.map((r) => [r.cc, r.name, r.recognized, groupOf(r.block)]), [
    [5, 'VELOCITY', '〇', 'Pattern'], [20, 'FX TYPE', '〇', 'Pattern'], [21, 'FX SPEED', '×', 'Pattern'],
    [27, 'SYNTH', '〇', 'Track'], [28, 'OCTAVE', '〇', 'Track'], [29, 'FILTER', '〇', 'Track'], [30, 'RESO', '〇', 'Track'],
  ]);
  assert.equal(groupOf('Control Change (Pattern/ Master) Works in PROJECT CH'), 'Pattern/Master');
  assert.equal(groupOf('Control Change （TRACK）'), 'Track');
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/sonicware/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller on its channel, each once, every row laid out or named`, () => {
    const sent = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!sent.has(r.id), `${r.id} twice`);
      sent.add(r.id);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      for (const v of [0, 127]) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), hex([status, r.controller, v]), `${p.id} = ${v}`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows) {
      const nm = row.name.replace(/\s*※\s*$/, '').replace(/^※\s*/, '');
      assert.ok(profile.parameters.some((p) => p.name === nm && profile.messageRecipes.find((r) => r.id === p.messageRecipe).controller === row.cc) || profile.authoringNotes.some((n) => n.includes(`CC ${row.cc} ${nm}`)), `CC ${row.cc} ${nm}`);
    }
  });

  test(`${profile.id}: the source is Sonicware's chart, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Sonicware');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

test('blocks on their channels: the XFM\'s pattern and tracks, the CyDrums\' project and tracks', () => {
  const xfm = BUILT.find((b) => b.profile.id === 'sonicware-liven-xfm').profile;
  const chan = (p, n) => p.messageRecipes.find((r) => r.id === p.parameters.find((x) => x.name === n).messageRecipe).channel;
  assert.equal(chan(xfm, 'FX TYPE'), '$patternChannel');
  assert.equal(chan(xfm, 'FLTR CUTOFF'), '$channel');
  const cy = BUILT.find((b) => b.profile.id === 'sonicware-cydrums').profile;
  assert.equal(chan(cy, 'MASTER LEVEL'), '$projectChannel');
  assert.equal(chan(cy, 'FILTER FREQ'), '$channel');
  assert.ok(cy.authoringNotes.some((n) => /ALL SOUND OFF/.test(n)));
});
