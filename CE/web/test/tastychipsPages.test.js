/**
 * The Tasty Chips ST-4 and Arduino Piggyback profiles: generated from the MIDI tables of their web
 * manuals by tools/profiles/tastychips/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every `cc` row is its
 * controller at both ends, on each channel the ST-4's channel column gives it, or is named.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { valueOf } from '../../../tools/profiles/tastychips/build-page-profile.mjs';
import { build } from '../../../tools/profiles/tastychips/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const sent = (profile, parameterId, value) => localCompileParameter(profile, { parameterId, value }).transaction.messages.map((m) => hex(m.bytes)).join('\n');

test('values printed as a range, a mapping, or two ends with a unit', () => {
  assert.deepEqual(valueOf('0..127 → -64..+63'), { min: 0, max: 127, shown: { min: -64, max: 63 } });
  assert.deepEqual(valueOf('0=0.0s .. 127=4.0s'), { min: 0, max: 127, shown: { min: 0, max: 4 }, unit: 's' });
  assert.deepEqual(valueOf('0..3'), { min: 0, max: 3 });
  assert.equal(valueOf('0: no modulation, 100: full modulation, >100: over modulation'), null);
});

for (const name of ['st-4', 'arduino-piggyback']) {
  const { profile, text, out, data, layout } = await build(name);

  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/tastychips/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every cc row is its controller at both ends, on each channel it is given, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    const scopeAt = data.columns.findIndex((c) => /channel\/global/i.test(c));
    let laidOut = 0;
    for (const row of data.rows) {
      // The ST-4's table: kind, description, number, value, channel; the Piggyback's: name, number, value.
      const [nameAt, ccAt] = scopeAt >= 0 ? [1, 2] : [0, 1];
      const cc = /(?:^|,\s*)(\d+)$/.exec(row[ccAt])?.[1];
      const label = (row[nameAt] || row[0]).replace(/\*$/, '');
      const ps = profile.parameters.filter((p) => p.description.startsWith(`CC ${cc}:`) || p.description.startsWith(`CC ${cc},`));
      if (!cc || (scopeAt >= 0 && row[0] !== 'cc') || layout.actions?.test(label)) { assert.ok(notes.includes(label), `${label} is neither laid out nor named`); continue; }
      const channels = scopeAt < 0 ? [profile.variables.channel] : [...(/chan/.test(row[scopeAt]) ? [1, 2, 3, 4] : []), ...(/glob/.test(row[scopeAt]) ? [5] : [])];
      const mine = ps.filter((p) => p.description.includes(`: ${label};`));
      assert.equal(mine.length, channels.length, `${label}: a parameter for each channel`);
      for (const [k, p] of mine.entries()) {
        laidOut++;
        for (const v of [p.range.min, p.range.max]) assert.equal(sent(profile, p.id, v), hex([0xb0 + channels[k] - 1, Number(cc), v]), `${p.id} = ${v}`);
      }
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests) assert.equal(sent(profile, t.parameter, t.value), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Tasty Chips' own page, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Tasty Chips');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/www\.tastychips\.nl\//);
  });
}

test('the ST-4: CC 11 printed twice, the action left out and the pair named', async () => {
  const { profile } = await build('st-4');
  assert.ok(profile.authoringNotes.some((n) => /CC 11 \(vca sustain, record sample\)/.test(n)));
  assert.equal(profile.parameters.filter((p) => /^CC 11[:,]/.test(p.description)).length, 5);
});
