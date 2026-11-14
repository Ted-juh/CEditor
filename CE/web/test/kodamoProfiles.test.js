/**
 * The Kodamo MASK1 profile: generated from its manual's MIDI implementation by tools/profiles/kodamo/,
 * and checked here that what is committed is what the generator makes, that the app's validator
 * finds nothing wrong, and that every controller the manual lists is laid out at both ends, or named.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readControllers } from '../../../tools/profiles/kodamo/read-kodamo-manual.mjs';
import { pageOf } from '../../../tools/profiles/kodamo/build-kodamo-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/kodamo/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('the implementation: a controller a line, a remark going on below, the list ending at Other CCs', () => {
  const rows = readControllers([
    'CC 10 Pan                              Not accessible through the interface, panning will remain',
    '                                       unless you reset it with CC 121',
    'CC 14 Osc1 tuning                      Mapped to Osc1 > TUNE (middle is 64)',
    '                                                                                  41',
    '\fCC 115 Osc1 envelope release                      Mapped to Osc1 (Env) > R',
    'Other CCs                                         Ignored',
    'CC 1 Not a row                          after the list',
  ].join('\n'), 41);
  // Each row with its PDF page: the text's first (41), and the next after a form feed.
  assert.deepEqual(rows, [
    { cc: 10, name: 'Pan', remark: 'Not accessible through the interface, panning will remain unless you reset it with CC 121', page: 41 },
    { cc: 14, name: 'Osc1 tuning', remark: 'Mapped to Osc1 > TUNE (middle is 64)', page: 41 },
    { cc: 115, name: 'Osc1 envelope release', remark: 'Mapped to Osc1 (Env) > R', page: 42 },
  ]);
  assert.deepEqual([pageOf('Mapped to OSC1 > START'), pageOf('Mapped to Filter (Env) > A'), pageOf('Received and transmitted')], ['Osc1', 'Filter (Env)', null]);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/kodamo/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every controller is laid out at both ends, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    let laidOut = 0;
    for (const row of data.rows) {
      const p = profile.parameters.find((x) => x.description.startsWith(`CC ${row.cc}:`));
      if (!p) { assert.ok(notes.includes(`${row.name} (CC ${row.cc})`), `CC ${row.cc} ${row.name} is neither laid out nor named`); continue; }
      laidOut++;
      for (const v of [0, 127]) assert.equal(hex(localCompileParameter(profile, { parameterId: p.id, value: v }).transaction.messages[0].bytes), hex([0xb0, row.cc, v]), `${p.id} = ${v}`);
      assert.equal(p.default, /middle is 64/.test(row.remark) ? 64 : 0, p.id);
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(hex(localCompileParameter(profile, { parameterId: t.parameter, value: t.value }).transaction.messages[0].bytes), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Kodamo's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Kodamo');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/kodamo\.org\/downloads\//);
  });
}
