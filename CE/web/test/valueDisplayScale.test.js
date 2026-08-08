// valueDisplayScale.test.js — the number on the wire is not the number a person reads.
//
// THE BUG THIS CLOSES, concretely. The GAIA stores Octave Shift as 61..67 and its front panel reads
// -3..+3. Arpeggio Octave Range is the same. Every MFX parameter is stored 12768..52768 and reads
// -20000..+20000. The device profile has carried `display.min` / `display.max` since it was
// written; nothing between the profile and the screen ever read them, so a knob at the instrument's
// zero showed 64.
//
// Most of what is asserted here is the INVERSE. A readout is half a feature: if -3 on screen does
// not parse back to 61 on the wire, the first person to type into the box moves the parameter
// somewhere nobody asked for — and only on the parameters this exists for, which is the worst
// possible place for the two directions to disagree.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  displayPrecision, displayScale, formatChannelValue, fromDisplay, toDisplay,
} from '../src/CE_Application/utils/valueDisplayScale.js';
import {
  formatSliderNumericValue, parseSliderInputValue,
} from '../src/CE_Application/utils/sliderBehavior.js';
import { parameterAdoptionPatches } from '../src/CE_Application/utils/parameterAdoptionRules.js';

const octaveShift = { displayMin: -3, displayMax: 3 };

/* ------------------------------------------------------------------ the map */

test('a bipolar wire range maps onto the printed one', () => {
  const scale = displayScale(octaveShift, 61, 67);
  assert.equal(toDisplay(scale, 64), 0, 'the centre of 61..67 is the instrument\'s zero');
  assert.equal(toDisplay(scale, 61), -3);
  assert.equal(toDisplay(scale, 67), 3);
});

test('the inverse is exact, at both ends and in the middle', () => {
  const scale = displayScale(octaveShift, 61, 67);
  for (const wire of [61, 62, 63, 64, 65, 66, 67]) {
    assert.equal(fromDisplay(scale, toDisplay(scale, wire)), wire, `round trip failed at ${wire}`);
  }
});

test('a non-integer ratio round-trips too', () => {
  // 0..127 printed 0..100 — 0.787 display units per wire step, which is where a naive
  // implementation loses values to rounding.
  const scale = displayScale({ displayMin: 0, displayMax: 100 }, 0, 127);
  for (const wire of [0, 1, 63, 64, 126, 127]) {
    assert.ok(Math.abs(fromDisplay(scale, toDisplay(scale, wire)) - wire) < 1e-9);
  }
});

/* ------------------------------------------------------------------ when there is no map */

test('no scale is the answer in every ambiguous case', () => {
  // This is what makes the feature safe to ship: a panel that never opted in cannot change.
  assert.equal(displayScale(null, 0, 127), null);
  assert.equal(displayScale({}, 0, 127), null, 'no bounds means no scale');
  assert.equal(displayScale({ displayMin: 0 }, 0, 127), null, 'half a range is not a range');
  assert.equal(displayScale({ displayMin: 'x', displayMax: 3 }, 0, 127), null);
  assert.equal(displayScale({ displayMin: 0, displayMax: 127 }, 0, 127), null,
    'an identity map is not worth carrying');
  assert.equal(displayScale({ displayMin: -3, displayMax: 3 }, 64, 64), null,
    'a zero-width wire range has nothing to map from');
});

test('with no scale the value passes straight through', () => {
  assert.equal(toDisplay(null, 42), 42);
  assert.equal(fromDisplay(null, 42), 42);
});

test('a value outside the wire range keeps extrapolating rather than clamping', () => {
  // Clamping here would hide an out-of-range value instead of showing that it is one. Clamping is
  // the caller's job and the slider already does it, in wire space, before formatting.
  const scale = displayScale(octaveShift, 61, 67);
  assert.equal(toDisplay(scale, 70), 6);
});

/* ------------------------------------------------------------------ precision */

test('precision grows only when a whole number would hide a step', () => {
  // 0..127 shown as 0..100 moves 0.79 per step; rounding to a whole number makes two adjacent wire
  // values read the same, which looks exactly like a control that has stopped responding.
  assert.equal(displayPrecision(displayScale(octaveShift, 61, 67), 0), 0, 'one-for-one needs none');
  assert.equal(displayPrecision(displayScale({ displayMin: 0, displayMax: 100 }, 0, 127), 0), 1);
  assert.equal(displayPrecision(displayScale({ displayMin: 0, displayMax: 1 }, 0, 127), 0), 2);
  assert.equal(displayPrecision(null, 2), 2, 'no scale keeps whatever the caller asked for');
});

/* ------------------------------------------------------------------ the slider readout */

const slider = (extra = {}) => ({
  family: 'range', role: 'slider', valueType: 'int', min: 61, max: 67, step: 1,
  snapToStep: true, defaultCurrentValue: 64, ...extra,
});

test('the readout shows what the instrument shows', () => {
  assert.equal(formatSliderNumericValue(slider({ displayMin: -3, displayMax: 3 }), 64), '0');
  assert.equal(formatSliderNumericValue(slider({ displayMin: -3, displayMax: 3 }), 61), '-3');
});

test('typing the printed value sets the wire value', () => {
  const behavior = slider({ displayMin: -3, displayMax: 3 });
  assert.equal(parseSliderInputValue(behavior, '-3'), 61);
  assert.equal(parseSliderInputValue(behavior, '0'), 64);
  assert.equal(parseSliderInputValue(behavior, '3'), 67);
});

test('the readout and the parser are inverses across the whole range', () => {
  const behavior = slider({ displayMin: -3, displayMax: 3 });
  for (let wire = 61; wire <= 67; wire += 1) {
    assert.equal(parseSliderInputValue(behavior, formatSliderNumericValue(behavior, wire)), wire);
  }
});

test('snapping happens in wire space, not display space', () => {
  // The other order snaps to display steps, which for a 0..127 parameter shown as 0..100 lands on
  // numbers the wire cannot hold.
  const behavior = { ...slider(), min: 0, max: 127, displayMin: 0, displayMax: 100 };
  assert.equal(parseSliderInputValue(behavior, '50'), 64, '50% of 0..127 is 63.5, snapped to 64');
});

test('a slider with no display range formats exactly as before', () => {
  assert.equal(formatSliderNumericValue(slider(), 64), '64');
  assert.equal(parseSliderInputValue(slider(), '64'), 64);
});

test('a value ending in zero keeps its zeros', () => {
  // Found by this file, live and pre-existing: the readout ran the formatted number through
  // `.replace(/\.?0+$/, precision === 0 ? '' : '$&')`, which at precision 0 ate trailing zeros off
  // INTEGERS — 0 rendered as "", 10 as "1", 100 as "1" — and at any other precision replaced the
  // match with itself and did nothing at all. The only reachable behaviour was the wrong one.
  const wide = { ...slider(), min: 0, max: 200 };
  assert.equal(formatSliderNumericValue(wide, 0), '0');
  assert.equal(formatSliderNumericValue(wide, 10), '10');
  assert.equal(formatSliderNumericValue(wide, 100), '100');
});

test('prefix, suffix and unit still apply on top of the map', () => {
  const behavior = slider({ displayMin: -3, displayMax: 3, unit: 'oct', showSign: true });
  assert.equal(formatSliderNumericValue(behavior, 67), '+3 oct');
});

/* ------------------------------------------------------------------ value channels */

const channel = (extra = {}) => ({ _type: 'ValueChannel', type: 'int', min: 61, max: 67, format: {}, ...extra });

test('a custom component channel reads the printed value too', () => {
  // This is the one that matters for the GAIA: its knobs are custom components, and the raw value
  // was going to the screen as String(raw) with the channel\'s own formatting ignored as well.
  assert.equal(formatChannelValue(channel({ format: { displayMin: -3, displayMax: 3 } }), 64), '0');
  assert.equal(formatChannelValue(channel({ format: { displayMin: -3, displayMax: 3 } }), 61), '-3');
});

test('formatting is locale-independent, in both directions', () => {
  // Found by running this suite on a Dutch Windows machine, where the readout said "64,0" and this
  // file expected "64.0". The formatter used toLocaleString and the parser stripped commas as
  // THOUSANDS separators, so on any comma-decimal locale the pair was not an inverse — it was data
  // corruption. A GAIA MFX parameter at 12768 displayed as "12.768" and typed back as 12.768, out by
  // a factor of a thousand. Grouping is the same hazard in reverse: "1,234" is 1234 in one locale
  // and 1.234 in another.
  //
  // So: a fixed decimal point, no grouping, and a comma read as a decimal separator on the way in.
  const wide = { ...slider(), min: 0, max: 60000, step: 1, valueType: 'int' };
  assert.equal(formatSliderNumericValue(wide, 12768), '12768', 'no grouping separator, ever');
  assert.equal(parseSliderInputValue(wide, '12768'), 12768);

  const fine = { ...slider(), min: 0, max: 10, step: 0.1, valueType: 'float', precision: 1 };
  assert.equal(formatSliderNumericValue(fine, 6.5), '6.5', 'a full stop, whatever the locale');
  assert.equal(parseSliderInputValue(fine, '6.5'), 6.5);
  assert.equal(parseSliderInputValue(fine, '6,5'), 6.5,
    'someone typing their own decimal comma means 6.5, not 65');

  assert.equal(formatChannelValue(channel({ type: 'float', min: 0, max: 60000, format: { precision: 1 } }), 12768),
    '12768.0');
});

test('a channel with no display range still gets its own formatting', () => {
  assert.equal(formatChannelValue(channel({ format: { unit: 'ms', precision: 1 } }), 64), '64.0 ms');
});

test('non-numeric channels are left alone', () => {
  // Formatting an array as a number produced "NaN" on every arpeggiator, which is worse than the
  // raw text it replaced.
  assert.equal(formatChannelValue(channel({ type: 'array' }), [1, 2]), '1,2');
  assert.equal(formatChannelValue(channel({ type: 'enum' }), 'saw'), 'saw');
  assert.equal(formatChannelValue(channel(), null), '');
});

/* ------------------------------------------------------------------ adoption */

test('adopting a bipolar parameter carries its printed range onto the control', () => {
  const patches = parameterAdoptionPatches('Slider', {
    type: 'bipolar',
    range: { min: 61, max: 67 },
    default: 64,
    display: { mode: 'number', min: -3, max: 3, shortLabel: 'Octave' },
  });
  assert.equal(patches['Behavior.min'], 61);
  assert.equal(patches['Behavior.displayMin'], -3);
  assert.equal(patches['Behavior.displayMax'], 3);
  assert.equal(patches['Behavior.showSign'], true, 'a range that goes negative wants its plus sign');
});

test('adopting an ordinary parameter clears the display range rather than leaving a stale one', () => {
  // Re-binding a control from a bipolar parameter to a plain one must not leave the old map behind
  // — the readout would keep showing the previous parameter's numbers.
  const patches = parameterAdoptionPatches('Slider', {
    type: 'integer', range: { min: 0, max: 127 }, default: 0, display: { mode: 'number' },
  });
  assert.equal(patches['Behavior.displayMin'], null);
  assert.equal(patches['Behavior.displayMax'], null);
});

test('a CLEARED bound is no scale — the two halves of the feature agree about what null means', () => {
  // The defect this exists for, and it was live on 591 controls of the committed QA-06 sheet.
  //
  // Both writers spell "no remapping" as literal null: the test above pins parameterAdoptionRules
  // doing it on every ordinary parameter, and SliderEditor's "Remap readout" toggle does it when
  // switched off. displayScale validated with Number(), and Number(null) is a finite 0 — so a
  // cleared control got displayMin=0/displayMax=0, a scale mapping EVERY wire value to 0. Patch
  // Tempo read "0.00" at every position and typing 150 into it set the wire minimum, 5.
  //
  // Silent in the worst way: the editor's own displayScaleOff uses `== null` and so read the same
  // control as "Off" while the runtime was applying the degenerate map.
  assert.equal(displayScale({ displayMin: null, displayMax: null }, 5, 300), null);
  assert.equal(displayScale({ displayMin: null, displayMax: 3 }, 61, 67), null,
    'half a range is not a range');
  assert.equal(formatChannelValue(
    channel({ type: 'int', min: 5, max: 300, format: { displayMin: null, displayMax: null } }), 150), '150');

  const cleared = { ...slider(), min: 5, max: 300, displayMin: null, displayMax: null };
  assert.equal(formatSliderNumericValue(cleared, 150), '150', 'a cleared slider reads its wire value');
  assert.equal(parseSliderInputValue(cleared, '150'), 150, 'and typing it back is the identity');
});

test('every other coercion that yields zero is refused too', () => {
  // null was the one that shipped, but Number() turns '', '  ', false and [] into a finite 0 just
  // as happily, and an emptied NumberInput is a genuinely reachable ''. A bound is a number — or a
  // string holding one, because that is what survives a hand-edited .cepanel.
  for (const empty of [undefined, null, '', '   ', false, true, [], {}, [5], NaN, Infinity]) {
    assert.equal(displayScale({ displayMin: empty, displayMax: empty }, 61, 67), null,
      `${JSON.stringify(empty) ?? String(empty)} is not a display bound`);
  }
  assert.deepEqual(displayScale({ displayMin: '-3', displayMax: '3' }, 61, 67),
    { min: 61, max: 67, displayMin: -3, displayMax: 3 }, 'a numeric string still counts');
});

test('adoption is a REBIND: every field it owns is written, not just the ones the parameter has', () => {
  // displayMin/displayMax were already cleared on re-bind; unit and showSign were not, so they were
  // whatever the PREVIOUS parameter left behind. Bind a knob to the GAIA's patchTempo and then to
  // patchLevel and the readout still said "64 BPM"; bind to one of its 142 bipolar parameters and
  // then to a plain 0..127 one and it still said "+64" on a range that never goes negative.
  const bipolarWithUnit = parameterAdoptionPatches('Knob', {
    type: 'integer', range: { min: 61, max: 67 }, default: 64,
    display: { mode: 'number', min: -3, max: 3, unit: 'BPM' },
  });
  assert.equal(bipolarWithUnit['Behavior.unit'], 'BPM');
  assert.equal(bipolarWithUnit['Behavior.showSign'], true);

  const plain = parameterAdoptionPatches('Knob', {
    type: 'integer', range: { min: 0, max: 127 }, default: 0, display: { mode: 'number' },
  });
  assert.equal(plain['Behavior.unit'], '', 'a parameter with no unit must CLEAR the old one');
  assert.equal(plain['Behavior.showSign'], false, 'and a unipolar range must clear the plus sign');
  assert.equal(plain['Behavior.displayMin'], null);
});
