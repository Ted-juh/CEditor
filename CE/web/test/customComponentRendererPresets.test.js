import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENVELOPE_SHAPE_PRESETS,
  RENDERER_COLOR_PRESETS,
  WAVEFORM_SHAPES,
  envelopePathPresetPatch,
  waveformIconPresetPatch,
} from '../src/CE_Application/utils/customComponentRendererPresets.js';

test('preset catalogs are populated and well-formed', () => {
  assert.ok(RENDERER_COLOR_PRESETS.length >= 4);
  for (const preset of RENDERER_COLOR_PRESETS) {
    assert.match(preset.stroke, /^[0-9A-F]{8}$/i);
    assert.match(preset.fill, /^[0-9A-F]{8}$/i);
  }
  assert.deepEqual(WAVEFORM_SHAPES.map((s) => s.id), ['sine', 'saw', 'square', 'noise']);
  for (const shape of ENVELOPE_SHAPE_PRESETS) {
    for (const key of ['attack', 'decay', 'sustain', 'release']) {
      assert.ok(shape[key] >= 0 && shape[key] <= 1, `${shape.id}.${key} in range`);
    }
  }
});

test('waveform patch writes type and stroke through part meta paths', () => {
  const patch = waveformIconPresetPatch('wave', {
    colorPreset: RENDERER_COLOR_PRESETS[0],
    shape: WAVEFORM_SHAPES[1],
  });
  assert.equal(patch['Parts.wave.meta.waveformIcon.type'], 'saw');
  assert.equal(patch['Parts.wave.meta.waveformIcon.stroke'], RENDERER_COLOR_PRESETS[0].stroke);
});

test('envelope patch writes ADSR + colors and clears explicit points', () => {
  const shape = ENVELOPE_SHAPE_PRESETS.find((s) => s.id === 'pad');
  const patch = envelopePathPresetPatch('env', { colorPreset: RENDERER_COLOR_PRESETS[2], shape });
  assert.equal(patch['Parts.env.meta.envelopePath.attack'], shape.attack);
  assert.equal(patch['Parts.env.meta.envelopePath.sustain'], shape.sustain);
  assert.deepEqual(patch['Parts.env.meta.envelopePath.points'], []);
  assert.equal(patch['Parts.env.meta.envelopePath.stroke'], RENDERER_COLOR_PRESETS[2].stroke);
  assert.equal(patch['Parts.env.meta.envelopePath.fill'], RENDERER_COLOR_PRESETS[2].fill);
});

test('patches are empty without a part name or options', () => {
  assert.deepEqual(waveformIconPresetPatch('', { shape: WAVEFORM_SHAPES[0] }), {});
  assert.deepEqual(envelopePathPresetPatch('env', {}), {});
});
