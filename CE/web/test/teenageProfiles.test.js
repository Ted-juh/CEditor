/**
 * The teenage engineering profiles: generated from the MIDI tables of its guides (web pages, saved)
 * by tools/profiles/teenage/, and checked here that what is committed is what the generator makes,
 * that the app's validator finds nothing wrong, and that every parameter is the controller its row
 * prints.
 *
 * The reader is checked on a page made by hand: cells in `txt` divs, a header, rows, a run of
 * controllers, a cell over two lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { pageCells, readTables } from '../../../tools/profiles/teenage/read-te-guide.mjs';
import { controllersOf, readRange } from '../../../tools/profiles/teenage/build-te-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/teenage/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const cell = (t) => `<div class="box c3"><div class="txt _txt_1"><span>${t}</span></div></div>`;

test('a guide page: its cells in order, a table from its header, rows while the controller column holds one', () => {
  const html = ['incoming midi control change messages.', 'cc', 'channel', 'function', 'value', '7', '1 - 4 *', 'mixer volume', '0 - 127', '46', 'any', 'synth: parameter 1<br/>drum: active key pitch', '0 - 127', '54 - 57', 'any', 'patch fx parameters 1 - 4', '0 - 127', 'newsletter', 'retailers'].map(cell).join('') + '<script>window.__reactRouterContext = {}</script>';
  const cells = pageCells(html);
  assert.equal(cells[11], 'synth: parameter 1 / drum: active key pitch');
  const [table] = readTables(cells);
  assert.equal(table.caption, 'incoming midi control change messages.');
  assert.deepEqual(table.columns, ['cc', 'channel', 'name', 'range']);
  assert.deepEqual(table.rows.map((r) => r.cc), ['7', '46', '54 - 57']);
});

test('a run of controllers, a name each; ranges, switches, actions', () => {
  assert.deepEqual(controllersOf('54 - 57', 'patch fx parameters 1 - 4').map((c) => `${c.cc} ${c.name}`), ['54 patch fx parameter 1', '55 patch fx parameter 2', '56 patch fx parameter 3', '57 patch fx parameter 4']);
  assert.deepEqual(readRange('0 - 127'), { lo: 0, hi: 127 });
  assert.deepEqual(readRange('≥ 64 = muted').choices, [{ value: 0, label: 'off' }, { value: 127, label: 'muted' }]);
  assert.deepEqual(readRange('< 64 = synth, ≥ 64 = drum').choices, [{ value: 0, label: 'synth' }, { value: 127, label: 'drum' }]);
  assert.deepEqual(readRange('≥ 64'), { action: true });
  assert.deepEqual(readRange('on / off').choices, [{ value: 0, label: 'off' }, { value: 127, label: 'on' }]);
  assert.ok(readRange('0–5 → 40–50 BPM, 6–120 → 52–166 BPM').text);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/teenage/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller at both ends of its range, each message once, every row laid out or named`, () => {
    const sent = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!sent.has(r.id), `${r.id} twice`);
      sent.add(r.id);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      const values = p.type === 'choice' ? p.choices.map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), hex([status, r.controller, wire]), `${p.id} = ${value}`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows) for (const c of controllersOf(row.cc, row.name)) assert.ok(profile.parameters.some((p) => p.name === c.name.replace(/\s*\/\s*/g, ' / ')) || profile.authoringNotes.some((n) => n.includes(c.name)), `CC ${c.cc} ${c.name}`);
  });

  test(`${profile.id}: the source is teenage engineering's guide, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'teenage engineering');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`) && s.notes.includes(source.url)));
  });
}

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const byName = (profile, n) => profile.parameters.find((p) => p.name === n);

test('the OP-Z per track, the TX-6\'s master on its own channel, the OP-1 field\'s switches and actions', () => {
  const opz = builtProfile('te-op-z');
  assert.equal(opz.parameters.filter((p) => p.group === 'Track').length, 18);
  assert.equal(lines(localCompileParameter(opz, { parameterId: byName(opz, 'filter cutoff').id, value: 64 })), 'B0 03 40');
  const tx6 = builtProfile('te-tx-6');
  assert.equal(lines(localCompileParameter(tx6, { parameterId: byName(tx6, 'main volume').id, value: 100 })), 'B6 07 64');
  assert.equal(lines(localCompileParameter(tx6, { parameterId: byName(tx6, 'track volume').id, value: 100 })), 'B0 07 64');
  const op1 = builtProfile('te-op-1-field');
  assert.deepEqual(byName(op1, 'mode select').choices.map((c) => [c.label, c.value]), [['synth', 0], ['drum', 127]]);
  assert.deepEqual(byName(op1, 'randomize active patch').choices, [{ id: 'trigger', label: 'trigger', value: 127 }]);
  const ep40 = builtProfile('te-ep-40');
  assert.deepEqual(byName(ep40, 'vibrato').range, { min: 1, max: 127 });
  assert.ok(ep40.authoringNotes.some((n) => /1-27 as 1-127/.test(n)));
});
