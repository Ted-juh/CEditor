// midiLearnChips.test.js — turning "something moved" into "this parameter, drag it".
//
// MIDI learn reached exactly one control before this: RouterEditor armed a session and the reducer
// returned whichever controller moved the most. That heuristic exists because a raw CC does not say
// what it is. Nothing else in the app could learn anything, and the drag-to-bind path that would
// have let it — the drop handler in CanvasControl, the compatibility preview, the surface
// highlight, the deviceParameterDrag store — had no drag source anywhere. Chips are the source.
//
// What is pinned here is the part that makes a chip worth dragging:
//
//   SYSEX, which the learn reducer skips on purpose ("a dump, not performance data"). Right for a
//   keyboard, wrong for the GAIA: three of its knobs send CC and every other control — the whole
//   envelope, filter and LFO — sends a DT1. A strip without sysex would be blank for the instrument
//   this app is built around. It also needs no heuristic: the address names the parameter exactly.
//
//   THE NAME. A chip carries a profile parameter when the profile can name it. One that cannot is
//   still draggable — it binds as the message instead (see midiControlBindings.js), which now covers
//   every kind the learn reducer produces.
//
//   THE ORDER. Newest first, not most-moved. The one-shot session ranks by span because it must
//   pick a winner from a window; a strip is read by wiggling the thing you want and taking the chip
//   that just appeared.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  CHIP_LIMIT,
  EMPTY_CHIP_STATE,
  applyChipHex,
  chipDragPayload,
  chipList,
} from '../src/CE_Application/utils/midiLearnChips.js';
import { buildInboundIndex } from '../src/CE_Application/utils/inboundParameterIndex.js';
import { getBindingCompatibility } from '../src/CE_Application/models/componentPorts.js';
import { readText } from './support/readText.mjs';

const GAIA = JSON.parse(readText(fileURLToPath(
  new URL('../../profiles/test/roland-gaia-sh01.ceditor-device.json', import.meta.url))));
const index = buildInboundIndex(GAIA);
const parameterById = Object.fromEntries(GAIA.parameters.map((p) => [p.id, p]));
const opts = { index, parameterById };

const fold = (hexes, state = EMPTY_CHIP_STATE) => hexes.reduce((s, hex) => applyChipHex(s, hex, index), state);

/**
 * A DT1 for distortion.parameter1 (four nibbles at 10 00 04 01) carrying `value`.
 *
 * The checksum is COMPUTED rather than pinned. It used to be the literal 3E, which was correct for
 * the single value the helper was written with and wrong for every other — invisible while nothing
 * verified it, and a trap the moment the parameter's range moved and the values had to change.
 */
const distortion = (value) => {
  const address = [0x10, 0x00, 0x04, 0x01];
  const data = [12, 8, 4, 0].map((shift) => (value >> shift) & 0x0f);
  const sum = [...address, ...data].reduce((total, byte) => total + byte, 0);
  const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  return `F0 41 10 00 00 41 12 ${[...address, ...data, (128 - (sum % 128)) % 128].map(hex).join(' ')} F7`;
};

// Values INSIDE the parameter's declared range. Roland's MFX container is offset by 32768 — the
// address map's 12768..52768 is exactly 32768 ± 20000 — so DIST Drive's 0..127 is stored
// 32768..32895. A probe of 4095 sits below the field's own minimum and compiles to nothing at all.
const DRIVE_MIN = 32768;   // Drive 0
const DRIVE_MID = 32831;   // Drive 63
const DRIVE_MAX = 32895;   // Drive 127

test('a sysex edit becomes a chip that knows its parameter', () => {
  // The case the learn reducer cannot reach at all. No span threshold either: one DT1 is enough,
  // because the address is not a guess.
  const chips = chipList(fold([distortion(DRIVE_MAX)]), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].parameterId, 'distortion.parameter1');
  assert.equal(chips[0].parameter?.id, 'distortion.parameter1');
  assert.equal(chips[0].last, DRIVE_MAX, 'the value is decoded with the parameter\'s own encoder');
  assert.equal(chips[0].origin, 'sysex');
});

test('a CC the profile declares is named, not left as a number', () => {
  // CC 102 is the GAIA's tone 1 cutoff knob. It resolves only because the profile carries an
  // inbound declaration for it — the same one the Player depends on.
  const chips = chipList(fold(['B0 66 10', 'B0 66 40', 'B0 66 5A']), opts);
  assert.equal(chips[0].parameterId, 'tone1.filter.cutoff');
  assert.equal(chips[0].label, GAIA.parameters.find((p) => p.id === 'tone1.filter.cutoff').name);
  assert.equal(chips[0].last, 90);
});

test('a controller the profile has no parameter for still binds, as a raw CC', () => {
  // This chip used to be inert, and that was the gap the raw binding kind closes: a generic fader
  // box, or any CC a profile author never mapped, could be seen moving and had nowhere to go.
  const chips = chipList(fold(['B0 4A 10', 'B0 4A 60']), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].parameter, null, 'the profile still cannot name it');
  assert.equal(chips[0].controller, 74);
  assert.match(chips[0].reason, /binds as a raw CC/);

  const payload = chipDragPayload(chips[0], 'Fader box');
  assert.equal(payload.kind, 'ceditor.midiControl');
  assert.equal(payload.controller, 74);
  assert.equal(payload.parameter.type, 'integer', 'so the drop target can judge compatibility');
});

test('a keyboard\'s pressure and dynamics bind too', () => {
  // These were the chips left inert when only CC had a binding kind: a candidate the strip could
  // see and nothing could accept. Every kind the learn reducer produces now has somewhere to go.
  for (const [hexes, message, origin] of [
    [['D0 20', 'D0 70'], 'aftertouch', 'aftertouch'],
    [['90 3C 20', '90 3C 70'], 'velocity', 'velocity'],
    [['A0 3C 20', 'A0 3C 70'], 'polyAftertouch', 'polyAftertouch'],
  ]) {
    const chip = chipList(fold(hexes), opts)[0];
    assert.equal(chip.origin, origin);
    assert.equal(chip.parameter, null, 'no profile parameter arrives on these');
    const payload = chipDragPayload(chip, 'Keyboard');
    assert.equal(payload?.kind, 'ceditor.midiControl', `${origin} did not offer a binding`);
    assert.equal(payload.message, message);
    assert.equal(payload.parameter.type, 'integer', 'so a knob will accept it');
  }
});

test('one NRPN knob is one chip, not four junk controllers', () => {
  // Turning an NRPN knob sends CC 99, 98, 6 and 38. Without reassembly the strip would offer four
  // meaningless controllers and no way to bind the thing that actually moved.
  const chips = chipList(fold(['B0 63 01 B0 62 20 B0 06 02 B0 26 40']), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].origin, 'nrpn');
  assert.equal(chips[0].label, 'NRPN 1:32');
  assert.equal(chips[0].last, 320, 'the 14-bit reading, as the more informative of the two');

  const payload = chipDragPayload(chips[0], 'Fader box');
  assert.equal(payload.kind, 'ceditor.midiControl');
  assert.equal(payload.message, 'nrpn');
  assert.equal(payload.parameterMsb, 1);
  assert.equal(payload.parameterLsb, 32);
  assert.equal(payload.valueResolution, 14, 'a learned NRPN reads wide — a 7-bit device just never moves the low byte');
  assert.equal(payload.parameter.range.max, 16383, 'so the control it lands on is sized for it');
});

test('an RPN is its own chip, named where the spec names it', () => {
  // Same reassembly, different selector pair, and a different identity: an RPN 0:0 and an NRPN 0:0
  // are different parameters on the same instrument, so they must not share a chip.
  const chips = chipList(fold(['B0 65 00 B0 64 00 B0 06 02 B0 26 32', 'B0 63 00 B0 62 00 B0 06 40']), opts);
  assert.equal(chips.length, 2, 'RPN 0:0 and NRPN 0:0 collapsed into one chip');
  const rpnChip = chips.find((c) => c.origin === 'rpn');
  assert.equal(rpnChip.label, 'RPN 0:0 · Pitch bend range');
  const payload = chipDragPayload(rpnChip, 'Keyboard');
  assert.equal(payload.message, 'rpn');
  assert.deepEqual([payload.parameterMsb, payload.parameterLsb], [0, 0]);
});

test('a Data Entry with no NRPN selected is still an ordinary controller', () => {
  // The reassembler must not swallow CC 6 on the chance it might be NRPN plumbing: some gear uses it
  // on its own, and a real controller vanishing from the strip is worse than an extra chip.
  const chips = chipList(fold(['B0 06 20', 'B0 06 60']), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].origin, 'cc');
  assert.equal(chips[0].controller, 6);
});

test('the newest chip comes first', () => {
  // The whole interaction: wiggle the one you want, take the chip that just appeared. Ranking by
  // span — what the one-shot session does — would bury it under whatever moved furthest earlier.
  const state = fold([distortion(DRIVE_MAX), distortion(DRIVE_MIN), 'B0 4A 7F', 'B0 4A 00', 'B0 66 05']);
  const chips = chipList(state, opts);
  assert.equal(chips[0].parameterId, 'tone1.filter.cutoff', 'the last thing touched is first');
  assert.equal(chips.length, 3);
  assert.ok(chips.some((c) => c.parameterId === 'distortion.parameter1'), 'earlier chips are kept');
});

test('one message does not reorder the chips it did not touch', () => {
  // The stamp is per candidate, not per state. Restamping everything on every message would make
  // the strip shuffle on any incoming traffic, which is exactly when someone is trying to grab one.
  const before = chipList(fold([distortion(DRIVE_MID), 'B0 4A 40', 'B0 66 20']), opts).map((c) => c.key);
  const after = chipList(fold(['B0 66 21'], fold([distortion(DRIVE_MID), 'B0 4A 40', 'B0 66 20'])), opts).map((c) => c.key);
  assert.deepEqual(after, before, 'moving the front chip further reordered the rest');
});

test('repeated moves accumulate rather than duplicating', () => {
  const chips = chipList(fold([distortion(DRIVE_MIN), distortion(DRIVE_MAX), distortion(DRIVE_MID)]), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].count, 3);
  // 127, because the parameter's declared range IS 0..127 now — the span of DIST Drive from
  // bottom to top. It read 4045 while every effect slot was declared over the MFX container's
  // full 40000, which is the number this narrowing exists to get rid of.
  assert.equal(chips[0].span, DRIVE_MAX - DRIVE_MIN, 'span is the range seen, not the last step');
  assert.equal(chips[0].span, 127, 'and that range is the manual\'s, not the container\'s');
});

test('a parameter that is not a number does not show one', () => {
  // The GAIA's patch name is 12 ASCII bytes, and it decodes to TEXT. Neither `last` nor `span` may
  // be printed from it: `last` would be a string where the chip shows values, and `span` is
  // `max - min` over two strings, which is NaN — and "NaN" beside a perfectly correct patch name is
  // worse than nothing at all.
  const name = GAIA.parameters.find((p) => p.id === 'common.patchName');
  assert.ok(name && !name.range, 'guard: the patch name is the non-numeric case');
  assert.equal(name.encoding.length, 12, 'guard: the message below must carry the whole field');
  const chips = chipList(fold([`F0 41 10 00 00 41 12 ${name.address} 49 4E 49 54 20 50 41 54 43 48 20 20 27 F7`]), opts);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].parameterId, 'common.patchName');
  assert.equal(chips[0].last, null);
  assert.equal(chips[0].span, null);
  assert.ok(chips[0].parameter, 'still bindable — a text control takes it');
});

test('an unrecognised sysex is not a candidate', () => {
  // An identity reply, a dump, or another manufacturer entirely. A chip saying "some sysex
  // happened" is not something anyone can bind, so there is nothing to show.
  assert.deepEqual(chipList(fold(['F0 7E 7F 06 02 41 F7']), opts), []);
  assert.deepEqual(chipList(fold(['F0 43 10 00 00 41 12 10 00 04 01 00 00 00 07 3E F7']), opts), []);
});

test('without a profile the CC side still works, it just cannot name anything', () => {
  // The source arrives asynchronously over the bridge, so "no index yet" is an ordinary state.
  const state = applyChipHex(applyChipHex(EMPTY_CHIP_STATE, 'B0 66 10', null), 'B0 66 5A', null);
  const chips = chipList(state, {});
  assert.equal(chips.length, 1);
  assert.equal(chips[0].parameterId, null);
  assert.equal(chips[0].last, 90);
  assert.deepEqual(chipList(applyChipHex(EMPTY_CHIP_STATE, distortion(DRIVE_MAX), null), {}), [],
    'and a sysex edit cannot be read at all without one');
});

test('the strip is capped', () => {
  const hexes = [];
  for (let cc = 20; cc < 20 + CHIP_LIMIT + 6; cc++) hexes.push(`B0 ${cc.toString(16).padStart(2, '0')} 40`);
  assert.equal(chipList(fold(hexes), opts).length, CHIP_LIMIT);
});

test('the parameter a chip carries is one the drop target will actually accept', () => {
  // The integration that matters, and the one a shape check would miss: CanvasControl refuses a
  // drop whose compatibility is 'incompatible' or has no port, so a chip carrying a parameter the
  // binding model rejects would be draggable and inert. Checked against the real profile, across
  // the types the GAIA actually declares, because 'integer' passing says nothing about 'choice'.
  const byType = {};
  for (const parameter of GAIA.parameters) byType[String(parameter.type)] ??= parameter;

  // Every type the profile declares must be bindable to SOMETHING — a knob for the numeric ones, a
  // combobox for the choices, a text control for the patch name. Which control is the user's
  // business; that no control at all will take it would make the chip draggable and inert.
  const TARGETS = ['Knob', 'Slider', 'Combobox', 'RadioButtonGroup', 'ToggleButton', 'TextInput', 'LcdDisplay'];
  const refused = [];
  for (const [type, parameter] of Object.entries(byType)) {
    const accepted = TARGETS.some((target) => {
      const compatibility = getBindingCompatibility(target, parameter);
      return compatibility.status !== 'incompatible' && !!compatibility.port;
    });
    if (!accepted) refused.push(`${type} (${parameter.id})`);
  }
  assert.deepEqual(refused, [], 'a chip could carry a parameter no control can bind');
  assert.ok(Object.keys(byType).length >= 4, 'guard: the profile should span several parameter types');

  const cutoff = parameterById['tone1.filter.cutoff'];
  assert.equal(getBindingCompatibility('Knob', cutoff).status, 'compatible');
  assert.equal(getBindingCompatibility('Knob', cutoff).port.id, 'value');
});

test('the drag payload is the shape the drop handler already parses', () => {
  // Not a shape chosen here: parseDeviceParameterDrag checks `kind` and `parameter.id`, and
  // getBindingCompatibility reads the parameter's own type. This is the first thing in the app to
  // produce it — the drop path has never had a source.
  const chip = chipList(fold([distortion(DRIVE_MAX)]), opts)[0];
  const payload = chipDragPayload(chip, 'Roland GAIA SH-01');
  assert.equal(payload.kind, 'ceditor.deviceParameter');
  assert.equal(payload.parameter.id, 'distortion.parameter1');
  // 'integer', not 'bipolar'. Drive is 0..127 with a display offset, and only a parameter whose
  // displayed range goes NEGATIVE is bipolar. Every effect slot read bipolar while they were all
  // declared over the container's -20000..+20000.
  assert.equal(payload.parameter.type, 'integer', 'the whole parameter travels, not just its id');
  assert.equal(payload.deviceRole, 'Roland GAIA SH-01');
});
