import test from 'node:test';
import assert from 'node:assert/strict';
import { layerWeight, layerEnvelopePoints, layerDisplayValue, layerValueLabel,
  editLayerBoundary } from '../src/CE_Application/utils/layerRangeGeometry.js';

test('crossfades extend equally inside and outside native layer boundaries', () => {
  const layer = { minimum: .3, maximum: .7, crossfade: .1 };
  for (const [x, expected] of [[.2, 0], [.3, .5], [.4, 1], [.6, 1], [.7, .5], [.8, 0]])
    assert.ok(Math.abs(layerWeight(layer, x) - expected) < 1e-8);
});
test('source endpoints stay full strength, and overlapping fades never imply a plateau', () => {
  const full = { minimum: 0, maximum: 1, crossfade: .5 };
  assert.equal(layerWeight(full, 0), 1);
  assert.equal(layerWeight(full, 1), 1);
  const narrow = { minimum: .4, maximum: .6, crossfade: .3 };
  assert.ok(Math.abs(layerWeight(narrow, .5) - 2 / 3) < 1e-8);
  assert.match(layerEnvelopePoints(narrow), /50,16/);
});
test('zero-width and hard-edge ranges are preserved rather than expanded by the editor', () => {
  const member = { minimum: .5, maximum: .5, crossfade: 0 };
  assert.equal(layerWeight(member, .5), 1);
  assert.equal(layerWeight(member, .49), 0);
  assert.equal(layerEnvelopePoints(member), '50,40 50,4 50,4 50,40');
  assert.deepEqual(editLayerBoundary(member, 'minimum', 1), { minimum: .5 });
  assert.deepEqual(editLayerBoundary(member, 'maximum', 0), { maximum: .5 });
  assert.deepEqual(editLayerBoundary(member, 'crossfade', 1), { crossfade: .5 });
});
test('source values use MIDI units, shared note naming, or macro percentages', () => {
  assert.equal(layerDisplayValue(64 / 127, 'velocity'), 64);
  assert.equal(layerDisplayValue(.64, 'macro'), 64);
  assert.match(layerValueLabel(60 / 127, 'key'), /^C/);
  assert.equal(layerValueLabel(.5, 'macro'), '50%');
  assert.equal(layerDisplayValue(1, 'cc'), 127);
});
