import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILMSTRIP_BAKE_MAX_DIMENSION,
  FILMSTRIP_BAKE_MAX_PIXELS,
  estimateFilmstripBake,
  normalizeFilmstripBakeOptions,
} from '../src/CE_Application/utils/customComponentFilmstripBaker.js';

test('normalizeFilmstripBakeOptions uses component dimensions and clamps bake settings', () => {
  const control = {
    _children: {
      Transform: {
        width: 180,
        height: 90,
      },
    },
  };

  const options = normalizeFilmstripBakeOptions(control, {
    name: '  knobStrip  ',
    frameCount: 0,
    frameWidth: 0,
    frameHeight: undefined,
    outputScale: 99,
    orientation: 'sideways',
    valueSource: '',
    interpolation: 'linear',
  });

  assert.equal(options.name, 'knobStrip');
  assert.equal(options.frameCount, 1);
  assert.equal(options.frameWidth, 180);
  assert.equal(options.frameHeight, 90);
  assert.equal(options.outputScale, 4);
  assert.equal(options.outputFrameWidth, 720);
  assert.equal(options.outputFrameHeight, 360);
  assert.equal(options.orientation, 'vertical');
  assert.equal(options.valueSource, 'mainValue');
  assert.equal(options.interpolation, 'linear');
});

test('normalizeFilmstripBakeOptions supports horizontal strips and explicit frame size', () => {
  const options = normalizeFilmstripBakeOptions(null, {
    frameCount: 32,
    frameWidth: 64,
    frameHeight: 48,
    orientation: 'horizontal',
    valueSource: 'ringValue',
  });

  assert.equal(options.frameCount, 32);
  assert.equal(options.frameWidth, 64);
  assert.equal(options.frameHeight, 48);
  assert.equal(options.orientation, 'horizontal');
  assert.equal(options.valueSource, 'ringValue');
});

test('estimateFilmstripBake reports output canvas size and blocks excessive strips', () => {
  const estimate = estimateFilmstripBake(null, {
    frameCount: 2,
    frameWidth: 5_000,
    frameHeight: 10_000,
    outputScale: 1,
  });

  assert.equal(estimate.canvasWidth, 5_000);
  assert.equal(estimate.canvasHeight, 20_000);
  assert.equal(estimate.pixelCount, 100_000_000);
  assert.equal(estimate.pixelCount > FILMSTRIP_BAKE_MAX_PIXELS, true);
  assert.equal(estimate.warning, true);
  assert.equal(estimate.blocked, true);
  assert.equal(estimate.blockReason, 'Too many pixels');
});

test('estimateFilmstripBake blocks strips that exceed safe canvas dimensions', () => {
  const estimate = estimateFilmstripBake(null, {
    frameCount: FILMSTRIP_BAKE_MAX_DIMENSION + 1,
    frameWidth: 1,
    frameHeight: 1,
    orientation: 'horizontal',
    outputScale: 1,
  });

  assert.equal(estimate.canvasWidth, FILMSTRIP_BAKE_MAX_DIMENSION + 1);
  assert.equal(estimate.pixelCount, FILMSTRIP_BAKE_MAX_DIMENSION + 1);
  assert.equal(estimate.warning, true);
  assert.equal(estimate.blocked, true);
  assert.equal(estimate.blockReason, `Max ${FILMSTRIP_BAKE_MAX_DIMENSION}px per side`);
});
