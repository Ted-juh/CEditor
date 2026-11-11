/**
 * The Expressive E profile: generated from the Osmose's MIDI implementation chart by
 * tools/profiles/expressive/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every parameter is a controller the chart
 * marks recognized.
 *
 * The reader is checked on lines made by hand, in the MMA chart's form.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readControlTable } from '../../../tools/profiles/expressive/read-mma-chart.mjs';
import { PERFORMANCE, rangeOf } from '../../../tools/profiles/expressive/build-expressive-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/expressive/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('the MMA chart\'s control table: a number, the function, the two answers under their headers, the remarks', () => {
  const rows = readControlTable([
    line(2, 66, [28, 'Control'], [56, '#'], [67, 'Function'], [264, 'Transmitted'], [308, '(Y/N)'], [334, 'Recognized'], [375, '(Y/N)'], [400, 'Remarks']),
    line(2, 76, [42, '0'], [67, 'Bank'], [90, 'Select'], [289, 'No'], [358, 'Yes'], [400, 'range:'], [430, '[0-127]']),
    line(2, 86, [40, '12'], [67, 'Macro'], [96, '1'], [289, 'Yes'], [358, 'Yes'], [400, 'Master'], [440, 'Channel']),
    line(2, 96, [40, '19'], [290, 'No'], [359, 'No']),
  ]);
  assert.deepEqual(rows.map((r) => [r.cc, r.name, r.transmitted, r.recognized, r.remarks]), [
    [0, 'Bank Select', 'No', 'Yes', 'range: [0-127]'], [12, 'Macro 1', 'Yes', 'Yes', 'Master Channel'], [19, '', 'No', 'No', ''],
  ]);
  assert.deepEqual(rangeOf('Master Channel (channel 1) range: [0-127]'), { lo: 0, hi: 127 });
  assert.ok(PERFORMANCE.test('Modulation Wheel / Pedal 2') && PERFORMANCE.test('Pedal 1') && !PERFORMANCE.test('Macro 1'));
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/expressive/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is a recognized controller, and every named row is laid out or named`, () => {
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      const row = data.rows.find((x) => x.cc === r.controller);
      assert.equal(row.recognized, 'Yes', p.name);
      assert.equal(row.name, p.name);
      for (const v of [p.range.min, p.range.max]) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), hex([0xb0, r.controller, v]));
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows.filter((r) => r.name && (r.recognized === 'Yes' || !PERFORMANCE.test(r.name)))) {
      assert.ok(profile.parameters.some((p) => p.name === row.name) || profile.authoringNotes.some((n) => n.includes(`CC ${row.cc} ${row.name}`)), `CC ${row.cc} ${row.name}`);
    }
  });

  test(`${profile.id}: the source is Expressive E's chart, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Expressive E');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}
