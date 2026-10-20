// valueLearn.test.js — the Values tab's Learn and Send: what a row learns from the instrument, read
// as the MIDI tab's learn chips read the input, the one edit it writes, and the bytes a row hands
// the Ports tab to send from there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readStatement, writeValue } from '../src/CE_Application/scripting/scriptValues.js';
import { statementRows } from '../src/CE_Application/editor/valueRows.js';
import { learnFor, learnTakes, learnedEdit, learnWords, sendableHex } from '../src/CE_Application/editor/valueLearn.js';
import { learnNext } from '../src/CE_Application/stores/midiLearnTap.js';
import { latestMidiInputMessage, latestSysexInputMessage, profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { chipDragPayload } from '../src/CE_Application/utils/midiLearnChips.js';
import { deviceValueContext } from '../src/CE_Application/editor/valuesContext.js';

const GAIA = JSON.parse(readFileSync(fileURLToPath(new URL('../../profiles/test/roland-gaia-sh01.ceditor-device.json', import.meta.url)), 'utf8'));
const DT1_WAVE = 'F0 41 10 00 00 41 12 10 00 01 00 05 6A F7';   // tone1.osc.wave = 5

/** The row named `name` in the statement `src` is, with the call it is in. */
function rowOf(src, name, context = {}) {
  const statement = readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls: [] }, ...context });
  return statementRows(statement).find((r) => r.type === 'arg' && r.arg.name === name);
}
const text = (src) => (arg, value) => writeValue(src, 'lua', arg, value).text;
const apply = (src, edit) => `${src.slice(0, edit.start)}${edit.text}${src.slice(edit.end)}`;

/** Fold `messages` into a learn that wants what `spec` wants, as the MIDI input delivers them. */
function learnFrom(spec, messages, profileId = '') {
  latestMidiInputMessage.set(null);
  latestSysexInputMessage.set(null);
  let got = null;
  const stop = learnNext((chip) => learnTakes(spec, chip), (chip) => { got = chip; }, { profileId });
  for (const hex of messages) (/^F0/i.test(hex) ? latestSysexInputMessage : latestMidiInputMessage).set({ hex, deviceRole: 'mainSynth' });
  stop();
  return got;
}

test.after(() => { latestMidiInputMessage.set(null); latestSysexInputMessage.set(null); profileSources.set({}); });

test('a CC row learns the controller and channel that moved, in one edit, the text between kept', () => {
  const src = 'ce.midi.sendCC(1,  74, 64)';
  const row = rowOf(src, 'cc');
  const spec = learnFor(row.call, row.arg);
  assert.deepEqual([spec.want, spec.args.map((a) => a.name)], ['cc', ['channel', 'cc']]);
  // A note brushed on the way is not a controller: the first CC is taken.
  const chip = learnFrom(spec, ['92 3C 64', 'B2 15 40']);
  assert.deepEqual([chip.controller, chip.channel], [21, 3]);
  assert.equal(apply(src, learnedEdit(src, spec, chip, text(src))), 'ce.midi.sendCC(3,  21, 64)');
  assert.equal(learnWords(spec, chip), 'Learned CC 21 on channel 3.');
  // The channel's row learns the same; a channel written from parts cannot be written over.
  assert.equal(learnFor(rowOf(src, 'channel').call, rowOf(src, 'channel').arg).want, 'cc');
  assert.equal(learnFor(rowOf('ce.midi.sendCC(ch, 74, 64)', 'cc').call, rowOf('ce.midi.sendCC(ch, 74, 64)', 'cc').arg), null);
  assert.equal(learnFor(rowOf(src, 'value').call, rowOf(src, 'value').arg), null, 'a value is not learned');
});

test('an NRPN row learns its numbers and channel from the four CCs that make one', () => {
  const src = 'ce.midi.sendNRPN(1, 0, 0, 8192)';
  const row = rowOf(src, 'msb');
  const spec = learnFor(row.call, row.arg);
  const chip = learnFrom(spec, ['B4 63 01', 'B4 62 02', 'B4 06 40', 'B4 26 00']);
  assert.ok(chip, 'the NRPN was reassembled');
  assert.equal(apply(src, learnedEdit(src, spec, chip, text(src))), 'ce.midi.sendNRPN(5, 1, 2, 8192)');
  assert.match(learnWords(spec, chip), /^Learned NRPN .* on channel 5\.$/);
  // An RPN row does not take an NRPN.
  const rpn = learnFor(rowOf('ce.midi.sendRPN(1, 0, 0, 2)', 'lsb').call, rowOf('ce.midi.sendRPN(1, 0, 0, 2)', 'lsb').arg);
  assert.equal(learnTakes(rpn, chip), false);
});

test('a device parameter\'s row learns the parameter the profile names for what moved', () => {
  profileSources.set({ [GAIA.id]: { profileId: GAIA.id, source: JSON.stringify(GAIA) } });
  const devices = deviceValueContext({ mappings: { mainSynth: { profileId: GAIA.id } }, profiles: [{ id: GAIA.id, name: 'GAIA' }],
    sources: { [GAIA.id]: { source: JSON.stringify(GAIA) } } });
  const src = 'ce.device.write("filter.cutoff", 64)';
  const row = rowOf(src, 'id', { devices });
  const spec = learnFor(row.call, row.arg);
  assert.equal(spec.want, 'parameter');
  // CC 3 is one the GAIA's profile does not name, so it is passed over; the DT1 names its parameter.
  const chip = learnFrom(spec, ['B0 03 40', DT1_WAVE], GAIA.id);
  assert.equal(chip.parameterId, 'tone1.osc.wave', 'a CC the profile cannot name is passed over');
  // …and a CC it does name is a parameter like any other: the GAIA sends CC 7 for its master volume.
  assert.equal(learnFrom(spec, ['B0 07 40'], GAIA.id).parameterId, 'master.volume');
  assert.equal(apply(src, learnedEdit(src, spec, chip, text(src))), 'ce.device.write("tone1.osc.wave", 64)');
  // A chip dragged from the MIDI tab is taken as the chip it was.
  const payload = chipDragPayload(chip, 'mainSynth');
  assert.equal(apply(src, learnedEdit(src, spec, payload, text(src))), 'ce.device.write("tone1.osc.wave", 64)');
  assert.equal(learnWords(spec, payload), 'Learned "tone1.osc.wave".');
});

test('a dragged CC chip carries the channel it moved on, which a sendCC row writes', () => {
  const src = 'ce.midi.sendCC(1, 74, 64)';
  const row = rowOf(src, 'cc');
  const spec = learnFor(row.call, row.arg);
  const payload = chipDragPayload(learnFrom(spec, ['B6 07 64']), 'mainSynth');
  assert.equal(payload.channel, 7);
  assert.equal(apply(src, learnedEdit(src, spec, payload, text(src))), 'ce.midi.sendCC(7, 7, 64)');
  // A payload of the wrong kind writes nothing.
  assert.equal(learnedEdit(src, spec, { kind: 'ceditor.deviceParameter', parameter: { id: 'x' } }, text(src)), null);
});

test('a learn stops at the first chip it takes, and a message already on the input is not one that moved', () => {
  latestMidiInputMessage.set({ hex: 'B0 4A 10', deviceRole: 'mainSynth' });
  const seen = [];
  const stop = learnNext(() => true, (chip) => seen.push(chip.controller));
  latestMidiInputMessage.set({ hex: 'B0 4B 10', deviceRole: 'mainSynth' });
  latestMidiInputMessage.set({ hex: 'B0 4C 10', deviceRole: 'mainSynth' });
  stop();
  assert.deepEqual(seen, [75]);
});

test('a sendSysex or sendMidi row hands over the bytes the runtime sends, and nothing that is refused', () => {
  const sysex = rowOf('ce.midi.sendSysex("41 10 00 00 41 12 10 00 01 00 05 6A")', 'bytes');
  assert.equal(sendableHex(sysex.call, sysex.arg), 'F0 41 10 00 00 41 12 10 00 01 00 05 6A F7', 'wrapped in F0 … F7, as it is sent');
  const raw = rowOf('ce.midi.sendMidi({ 0xB0, 74, 64 })', 'bytes');
  assert.equal(sendableHex(raw.call, raw.arg), 'B0 4A 40');
  const bad = rowOf('ce.midi.sendSysex("41 1G")', 'bytes');
  assert.equal(sendableHex(bad.call, bad.arg), null);
  const other = rowOf('ce.midi.checksum("roland", "41 10")', 'bytes');
  assert.equal(sendableHex(other.call, other.arg), null, 'only what is sent');
});
