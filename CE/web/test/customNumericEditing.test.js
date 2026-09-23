import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { customNumericFields, customNumericPatch } from '../src/CE_Application/utils/customNumericEditing.js';
import { seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { classifyParts } from '../src/CE_Application/utils/staticPartBaking.js';
import { gaiaKnob } from '../../../tools/scripts/gaia-panel/components.mjs';
const controls = flatControls(buildGaiaPanel().controls);
// Looked up by the parameter id, which is what these tests think in. A control is named after its
// parameter with the dots made underscores (utils/controlNames.js), so the id is converted here.
const named = name => controls.find(c => c._children.Core.name === name.replace(/\./g, '_'));
test('numeric inputs fit inside their controls so focusing never scrolls the knob away', () => {
  for (const size of [42, 54]) {
    const control = gaiaKnob({ size, numeric: true });
    const frame = control._children.Parts._children.numericValue._children.Layout;
    assert.ok(frame.x >= 0 && frame.x + frame.width <= control._children.Transform.width);
    assert.ok(frame.y >= 0 && frame.y + frame.height <= control._children.Transform.height);
    const grab = control._children.HitZones._children.grab.bounds;
    assert.ok(frame.x >= grab.width || frame.y >= grab.height, 'input stays outside the knob grab region');
  }
});
test('numeric fields clamp, reject invalid input, and map displayed octaves back to wire values', () => {
  const end = gaiaKnob({ size: 42, numeric: true });
  Object.assign(end._children.ValueChannels._children.value, { type: 'int', min: 1, max: 32, step: 1 });
  assert.ok(classifyParts(end).live.includes('numericValue'), 'editable field must not be baked into an image');
  for (const [input, expected] of [['16', 16], ['100', 32], ['-3', 1]]) {
    assert.equal(customNumericPatch(end, {}, 'customValueField', input).customValues.value, expected);
  }
  for (const invalid of ['', ' ', 'abc', 'Infinity']) assert.equal(customNumericPatch(end, {}, 'customValueField', invalid), null);
  const octave = structuredClone(named('arp.octaveRange'));
  octave._children.Parts._children.numericValue = end._children.Parts._children.numericValue;
  assert.equal(customNumericFields(octave, { value: 64 }).customValueField.value, '0');
  assert.equal(customNumericPatch(octave, {}, 'customValueField', '-2').customValues.value, 62);
  const velocity = structuredClone(named('arp.velocity'));
  velocity._children.Parts._children.numericValue = gaiaKnob({ numeric: true, zeroLabel: 'REAL' })._children.Parts._children.numericValue;
  assert.equal(customNumericFields(velocity, { value: 0 }).customValueField.value, 'REAL');
  assert.equal(customNumericPatch(velocity, {}, 'customValueField', 'real').customValues.value, 0);
});
test('GAIA uses only rotaries for parameters and the ruler for end step, with no duplicate numeric boxes', () => {
  assert.equal(named('arp.endStep'), undefined);
  for (const name of ['common.patchTempo', 'arp.velocity', 'arp.accentRate', 'arp.octaveRange']) {
    assert.equal(named(name)._children.Parts._children.numericValue, undefined);
  }
});
test('note numeric edits preserve other notes, selection and loop end; no selection is read-only', () => {
  const grid = named('arp_pattern_grid');
  const values = seedCustomValues(grid);
  assert.equal(customNumericFields(grid, values).arpLengthField.disabled, true);
  const arp = structuredClone(grid._children.Designer.arpeggiator);
  arp.selectedBlock = arp.blocks[6].id;
  const live = { ...values, arpEndStep: 16, __arpeggiator: arp };
  const length = customNumericPatch(grid, live, 'arpLengthField', '100', arp.selectedBlock);
  assert.equal(length.customValues.arpPattern[6].length, arp.stepCount - arp.blocks[6].step);
  assert.equal(length.customValues.arpEndStep, 16);
  assert.deepEqual(length.customValues.arpPattern.slice(0, 6), arp.blocks.slice(0, 6));
  const velocity = customNumericPatch(grid, live, 'arpVelocityField', '0', arp.selectedBlock);
  assert.equal(velocity.customValues.arpPattern[6].velocity, 1);
  assert.equal(customNumericPatch(grid, live, 'arpLengthField', '4', 'old-selection'), null);
});
