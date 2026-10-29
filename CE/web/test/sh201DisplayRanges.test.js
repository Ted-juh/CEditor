// sh201DisplayRanges.test.js — the SH-201's knobs read what the synth's display reads.
//
// The profile carried 42 parameters whose wire value is not the number on the instrument: Coarse
// Tune is sent 28..100 and reads -36..+36, a depth is sent 1..127 and reads -63..+63, Keyfollow is
// sent 44..84 and reads -200..+200 in steps of 10. A knob bound to one showed 64 where the synth
// shows 0. They now carry display.min / display.max from the MIDI implementation, the field the
// GAIA profile already uses, and the readout goes through the scale a bound knob uses: adopted
// from the profile by parameterAdoptionRules, mapped by valueDisplayScale.
//
// `range` is the wire value and is not touched; the profile's own byte-level tests pin it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parameterAdoptionPatches } from '../src/CE_Application/utils/parameterAdoptionRules.js';
import { displayScale, toDisplay, fromDisplay, displayPrecision } from '../src/CE_Application/utils/valueDisplayScale.js';

const profile = JSON.parse(readFileSync(new URL('../../profiles/test/roland-sh-201.ceditor-device.json', import.meta.url), 'utf8'));
const parameter = (id) => profile.parameters.find((p) => p.id === id);

/** What a knob bound to `id` shows for wire value `wire`, through the adopted Behavior. */
function readout(id, wire) {
  const patches = parameterAdoptionPatches('Knob', parameter(id));
  const scale = displayScale({ displayMin: patches['Behavior.displayMin'], displayMax: patches['Behavior.displayMax'] },
    patches['Behavior.min'], patches['Behavior.max']);
  return { shown: toDisplay(scale, wire), back: fromDisplay(scale, toDisplay(scale, wire)), patches, scale };
}

test('the bipolar ones read 0 at their centre, and each end at the synth\'s ends', () => {
  const cases = [
    // id, wire min / centre / max, what the synth shows there
    ['upper.osc1.coarseTune', [28, 64, 100], [-36, 0, 36]],
    ['lower.osc2.fineTune', [14, 64, 114], [-50, 0, 50]],
    ['upper.filter.cutoffKeyfollow', [44, 64, 84], [-200, 0, 200]],
    ['upper.filterEnv.depth', [1, 64, 127], [-63, 0, 63]],
    ['patch.toneBalance', [1, 64, 127], [-63, 0, 63]],
    ['upper.octaveShift', [61, 64, 67], [-3, 0, 3]],
    ['arpeggio.octaveRange', [61, 64, 67], [-3, 0, 3]],
    ['system.masterKeyShift', [40, 64, 88], [-24, 0, 24]],
    ['upper.amp.pan', [0, 64, 127], [-64, 0, 63]],
  ];
  for (const [id, wires, shown] of cases) {
    wires.forEach((wire, index) => {
      const { shown: actual, back } = readout(id, wire);
      assert.equal(actual, shown[index], `${id} at wire ${wire}`);
      assert.equal(back, wire, `${id}: typing ${shown[index]} sends ${wire}`);
    });
    assert.equal(readout(id, wires[0]).patches['Behavior.showSign'], true, `${id} shows its sign`);
  }
});

test('the ones that are not centred read what the synth reads too', () => {
  assert.equal(readout('system.patchRxTxChannel', 0).shown, 1, 'channel 1 is sent as 0');
  assert.equal(readout('system.patchRxTxChannel', 15).shown, 16);
  assert.equal(readout('system.transposeValue', 59).shown, -5);
  assert.equal(readout('system.transposeValue', 70).shown, 6);
  assert.equal(readout('delay.feedback', 0).shown, -98, 'feedback moves in steps of 2 %');
  assert.equal(readout('delay.feedback', 49).shown, 0);
  assert.equal(readout('delay.feedback', 98).shown, 98);
  assert.equal(readout('delay.feedback', 0).patches['Behavior.unit'], '%');
});

test('Master Tune reads cents to a tenth', () => {
  const tune = parameter('system.masterTune');
  assert.deepEqual([tune.display.min, tune.display.max, tune.display.unit, tune.display.precision], [-100, 100, 'cent', 1]);
  assert.equal(readout('system.masterTune', 24).shown, -100);
  assert.equal(readout('system.masterTune', 1024).shown, 0);
  // One wire step is a tenth of a cent, so the readout keeps one decimal and the step shows.
  const step = readout('system.masterTune', 1025);
  assert.equal(displayPrecision(step.scale), 1);
  assert.equal(step.shown.toFixed(displayPrecision(step.scale)), '0.1');
});

test('the wire ranges are as they were, and the two the handoff leaves raw are raw', () => {
  assert.deepEqual(parameter('upper.osc1.coarseTune').range, { min: 28, max: 100 });
  assert.deepEqual(parameter('system.masterTune').range, { min: 24, max: 2024 });
  // Pre Delay is a stepped table the implementation does not give, and Arpeggio Velocity's 0 means
  // REAL: neither is a straight line, so neither gets one.
  for (const id of ['reverb.preDelay', 'arpeggio.velocity']) {
    assert.equal(parameter(id).display.min, undefined, `${id} has no display range`);
  }
  assert.equal(profile.parameters.filter((p) => p.display?.min !== undefined).length, 42);
});
