// A control bound to a device parameter reads as the synth writes it, and what you type back in that
// form sets the right wire value. The profile's display.format / table / middleC reach the control
// through adoption (parameterAdoptionRules.js), and the readout formats with formatCore.js's
// formatDescribed, the same code ce.format.parameter runs in every script runtime.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parameterAdoptionPatches } from '../src/CE_Application/utils/parameterAdoptionRules.js';
import { formatSliderNumericValue, parseSliderInputValue } from '../src/CE_Application/utils/sliderBehavior.js';
import { formatBehaviorDisplay, describedFromBehavior } from '../src/CE_Application/utils/parameterDisplay.js';

/** The Behavior a Knob has after adopting `parameter` — the patches, as the store would apply them. */
function adopted(parameter) {
  const behavior = { valueType: 'int', step: 1 };
  for (const [path, value] of Object.entries(parameterAdoptionPatches('Knob', parameter))) {
    const [section, key] = path.split('.');
    if (section === 'Behavior') behavior[key] = value;
  }
  return behavior;
}

const CUTOFF = { id: 'cutoff', type: 'integer', range: { min: 0, max: 127 }, default: 64, display: { format: 'hz', min: 20, max: 20000 } };
const PAN = { id: 'pan', type: 'integer', range: { min: 0, max: 127 }, default: 64, display: { format: 'pan' } };
const RATE = { id: 'rate', type: 'integer', range: { min: 0, max: 3 }, default: 0, display: { table: ['Slow', 'Mid', 'Fast', 'Sync'] } };
const SPLIT = { id: 'split', type: 'integer', range: { min: 0, max: 127 }, default: 60, display: { format: 'note', middleC: 3 } };
const DEPTH = { id: 'depth', type: 'integer', range: { min: 0, max: 127 }, default: 0, display: { format: 'percent' } };
const OCTAVE = { id: 'oct', type: 'bipolar', range: { min: 61, max: 67 }, default: 64, display: { min: -3, max: 3 } };
const SYNC = { id: 'sync', type: 'integer', range: { min: 0, max: 127 }, default: 0, display: { table: [{ upTo: 63, text: 'Free' }, { upTo: 127, text: 'Sync' }] } };

test('adoption copies the profile\'s display format, table and middle C onto the control', () => {
  assert.equal(adopted(CUTOFF).displayFormat, 'hz');
  assert.deepEqual(adopted(RATE).displayTable, ['Slow', 'Mid', 'Fast', 'Sync']);
  assert.equal(adopted(SPLIT).displayMiddleC, 3);
  // A rebind writes them all, so nothing of the old parameter's display survives it.
  const plain = adopted(OCTAVE);
  assert.equal(plain.displayFormat, null);
  assert.equal(plain.displayTable, null);
  assert.equal(plain.displayMiddleC, null);
  // And the table is a copy: changing the control's must not change the profile's.
  adopted(RATE).displayTable.push('x');
  assert.equal(RATE.display.table.length, 4);
});

test('the readout writes the value as the synth does', () => {
  assert.equal(formatSliderNumericValue(adopted(CUTOFF), 0), '20 Hz');
  assert.equal(formatSliderNumericValue(adopted(CUTOFF), 127), '20 kHz');
  assert.equal(formatSliderNumericValue(adopted(PAN), 0), 'L64');
  assert.equal(formatSliderNumericValue(adopted(PAN), 64), 'C');
  assert.equal(formatSliderNumericValue(adopted(RATE), 2), 'Fast');
  assert.equal(formatSliderNumericValue(adopted(SPLIT), 60), 'C3');
  assert.equal(formatSliderNumericValue(adopted(DEPTH), 127), '100%');
  assert.equal(formatSliderNumericValue(adopted(SYNC), 100), 'Sync');
  // The author's prefix and suffix are kept around it.
  assert.equal(formatSliderNumericValue({ ...adopted(CUTOFF), prefix: '~' }, 0), '~20 Hz');
});

test('a parameter that asks for nothing special reads exactly as before', () => {
  const octave = adopted(OCTAVE);
  assert.equal(describedFromBehavior(octave, 61, 67), null);
  assert.equal(formatSliderNumericValue(octave, 61), '-3');
  assert.equal(formatSliderNumericValue({ min: 0, max: 127, valueType: 'int', step: 1 }, 64), '64');
  assert.equal(formatBehaviorDisplay({ displayFormat: 'number' }, 0, 127, 5), null);
});

test('typing the value back as the readout writes it sets the right wire value', () => {
  const cutoff = adopted(CUTOFF);
  assert.equal(parseSliderInputValue(cutoff, '20 kHz'), 127);
  assert.equal(parseSliderInputValue(cutoff, formatSliderNumericValue(cutoff, 64)), 64);
  assert.equal(parseSliderInputValue(adopted(PAN), 'L64'), 0);
  assert.equal(parseSliderInputValue(adopted(PAN), 'C'), 64);
  assert.equal(parseSliderInputValue(adopted(PAN), 'R63'), 127);
  assert.equal(parseSliderInputValue(adopted(RATE), 'fast'), 2);
  assert.equal(parseSliderInputValue(adopted(SPLIT), 'C3'), 60);
  assert.equal(parseSliderInputValue(adopted(DEPTH), '100%'), 127);
  assert.equal(parseSliderInputValue(adopted(SYNC), 'Sync'), 64);
  // Every value round-trips: what the readout writes, typed back, is the value again.
  for (const parameter of [CUTOFF, PAN, RATE, SPLIT, DEPTH]) {
    const behavior = adopted(parameter);
    for (let v = parameter.range.min; v <= parameter.range.max; v += 1) {
      const text = formatSliderNumericValue(behavior, v);
      const back = parseSliderInputValue(behavior, text);
      if (parameter === CUTOFF || parameter === DEPTH) {
        // Three significant digits (and whole percent) can name two neighbours alike; the value
        // typed back must at least write the same text.
        assert.equal(formatSliderNumericValue(behavior, back), text, `${parameter.id} ${v} -> "${text}" -> ${back}`);
      } else {
        assert.equal(back, v, `${parameter.id} ${v} -> "${text}" -> ${back}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ the profile's side */

import { validateProfile } from '../src/CE_Application/generated/dpd/validate.mjs';
import { buildLegacyProfile } from '../src/CE_Application/generated/dpd/emit-legacy-core.mjs';

const DPD = {
  schemaVersion: 1, id: 'probe.display', version: '1.0.0', kind: 'model', manufacturerId: '7D', deviceId: '10',
  display: { middleC: 3 },
  scopes: { patch: { kind: 'patch', parameters: [
    { id: 'cutoff', valueType: 'continuous', address: '20', range: { min: 0, max: 127 }, display: { format: 'hz', min: 20, max: 20000 } },
    { id: 'rate', valueType: 'continuous', address: '21', range: { min: 0, max: 3 }, display: { table: ['Slow', 'Mid', 'Fast', 'Sync'] } },
  ] } },
};

test('a DPD\'s display fields are checked, and a good one passes', () => {
  assert.deepEqual(validateProfile(DPD).errors, []);
  const bad = structuredClone(DPD);
  bad.display.middleC = 12;
  bad.scopes.patch.parameters[0].display = { format: 'kHz', precision: 9, min: 'low' };
  bad.scopes.patch.parameters[1].display = { table: [{ text: 'no upTo' }] };
  const errors = validateProfile(bad).errors.join('\n');
  assert.match(errors, /profile: display.middleC must be a whole number from -2 to 9/);
  assert.match(errors, /patch.cutoff: bad display.format kHz/);
  assert.match(errors, /patch.cutoff: display.precision must be a whole number from 0 to 6/);
  assert.match(errors, /patch.cutoff: display.min must be a number/);
  assert.match(errors, /patch.rate: display.table\[0\] must be a text or \{ upTo, text \}/);
});

test('the emitted profile carries the display fields the engine and the readouts read', () => {
  const legacy = buildLegacyProfile(DPD);
  assert.deepEqual(legacy.display, { middleC: 3 });
  const cutoff = legacy.parameters.find((p) => p.id.endsWith('cutoff'));
  assert.equal(cutoff.display.format, 'hz');
  assert.equal(cutoff.display.min, 20);
  assert.equal(cutoff.display.mode, 'number', 'the emitter\'s own fields stay');
  const rate = legacy.parameters.find((p) => p.id.endsWith('rate'));
  assert.deepEqual(rate.display.table, ['Slow', 'Mid', 'Fast', 'Sync']);
});
