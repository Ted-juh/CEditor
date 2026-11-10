/**
 * The Dreadbox profiles: generated from the CC lists of the Nymphes's and Murmux Adept's manuals and
 * the Artemis's own CC list by tools/profiles/dreadbox/, and checked here that what is committed is
 * what the generator makes, that the app's validator finds nothing wrong, and that every parameter is
 * the controller its row prints. The lists are read by the Behringer anchored-row reader, checked in
 * its own suite; what is new here is the reading of a value.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readValue, spread } from '../../../tools/profiles/dreadbox/build-dreadbox-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/dreadbox/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('a value: the controller\'s own (the Nymphes), or spread over 0 - 127 (the Artemis)', () => {
  assert.deepEqual(readValue('0-127', '', { spreads: false }), { lo: 0, hi: 127 });
  assert.deepEqual(readValue('0-5', 'Poly/Uni-A/Uni-B/TRI/DUO/MONO', { spreads: false }), { labels: ['Poly', 'Uni-A', 'Uni-B', 'TRI', 'DUO', 'MONO'], from: 0 });
  assert.deepEqual(readValue('0-3', 'LFO 2, ModWheel, Velocity, Aftertouch', { spreads: false }).labels, ['LFO 2', 'ModWheel', 'Velocity', 'Aftertouch']);
  assert.deepEqual(readValue('0 - 100', '', { spreads: true }), { shown: [0, 100] });
  assert.deepEqual(readValue('[-99 - 99]', '', { spreads: true }), { shown: [-99, 99] });
  assert.deepEqual(readValue('SINE / TRI / SAW', '', { spreads: true }), { labels: ['SINE', 'TRI', 'SAW'], spread: true });
  assert.deepEqual(readValue('[SINE, TRI, SAW, RMP, SQR, RND', '', { spreads: true }).labels, ['SINE', 'TRI', 'SAW', 'RMP', 'SQR', 'RND']);
  assert.deepEqual(spread(2), [32, 96]);
  assert.deepEqual(spread(4), [16, 48, 80, 112]);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/dreadbox/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller at both ends of its range, each controller once, every row laid out or named`, () => {
    const ccs = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!ccs.has(r.controller), `CC ${r.controller} twice`);
      ccs.add(r.controller);
      const values = p.type === 'choice' ? p.choices.map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), hex([0xb0, r.controller, wire]), `${p.id} = ${value}`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows) assert.ok(ccs.has(Number(row.cc)) || profile.authoringNotes.some((n) => n.includes(`CC ${row.cc} ${row.name}`)), `CC ${row.cc} ${row.name}`);
  });

  test(`${profile.id}: the source is Dreadbox's, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Dreadbox');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const byName = (profile, name) => profile.parameters.find((p) => p.name === name);

test('the Nymphes: its settings are the values beside them; the Artemis and Murmux Adept: shown ranges, spread settings', () => {
  const ny = builtProfile('dreadbox-nymphes');
  assert.deepEqual(byName(ny, 'Play Mode').choices.map((c) => [c.label, c.value]), [['Poly', 0], ['Uni-A', 1], ['Uni-B', 2], ['TRI', 3], ['DUO', 4], ['MONO', 5]]);
  assert.equal(byName(ny, 'Mod Source Selector').choices.length, 4);
  const ar = builtProfile('dreadbox-artemis');
  const vol = byName(ar, 'Volume');
  assert.deepEqual([vol.range, vol.display.min, vol.display.max], [{ min: 0, max: 127 }, 0, 100]);
  assert.deepEqual(byName(ar, 'LPF Poles').choices.map((c) => [c.label, c.value]), [['24dB', 32], ['12dB', 96]]);
  assert.equal(byName(ar, 'Distortions Type').choices.length, 15);
  assert.ok(ar.authoringNotes.some((n) => /split in the whole CC range/.test(n)));
  const mu = builtProfile('dreadbox-murmux-adept');
  assert.ok(mu.authoringNotes.some((n) => /does not say how/.test(n)));
  assert.match(byName(mu, 'Filter Cutoff').description, /POLY/);
});
