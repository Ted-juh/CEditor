// responseCurve.test.js — the curve math, and the one input nobody was guarding.
//
// `responseCurveValue` and `applyResponseCurve7` both begin by checking their scalar argument with
// Number.isFinite. The nine custom POINTS had no such check: `source?.[index] ?? identity`
// substitutes for null and undefined, NaN is neither, and the module's clamp was a bare
// Math.min/Math.max pair that carries NaN straight through. One bad point therefore reached
// applyResponseCurve7, whose seven-bit result is a velocity or a CC byte.
//
// Found by probing the module rather than by reading it, which is why the asymmetry — two guarded
// inputs and one unguarded — is worth a test rather than a comment.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESPONSE_CURVES, RESPONSE_CURVE_POINT_COUNT,
  normalizeResponseCurvePoints, responseCurveValue, responseCurveDisplayPoints, applyResponseCurve7,
} from '../src/CE_Application/utils/responseCurve.js';

const IDENTITY = [0, 16, 32, 48, 64, 79, 95, 111, 127];
const WITH_NAN = [0, 16, 32, 48, NaN, 80, 96, 112, 127];

test('null and absent points preserve the identity fallback while explicit zero stays zero', () => {
  for (const missing of [null, undefined]) {
    assert.deepEqual(normalizeResponseCurvePoints(new Array(9).fill(missing)), IDENTITY);
  }
  const points = [...IDENTITY];points[4] = 0;
  assert.equal(normalizeResponseCurvePoints(points)[4], 0);
});

test('every curve answers a finite 0..1 for any input a caller can hand it', () => {
  for (const curve of RESPONSE_CURVES) {
    for (const input of [0, 1, 0.5, -1, 2, NaN, Infinity, -Infinity, undefined, null, '0.5']) {
      const value = responseCurveValue(input, curve, []);
      assert.ok(Number.isFinite(value), `${curve} @ ${String(input)} -> ${value}`);
      assert.ok(value >= 0 && value <= 1, `${curve} @ ${String(input)} out of range: ${value}`);
    }
  }
});

test('a point that is not a finite number reads as the identity, not as zero', () => {
  // Dropping to the floor would be a silent notch in the curve. Falling back to the identity is
  // what a MISSING point already does, and a NaN point is the same thing said differently.
  const points = normalizeResponseCurvePoints(WITH_NAN);
  assert.equal(points.length, RESPONSE_CURVE_POINT_COUNT);
  assert.ok(points.every(Number.isFinite), `non-finite survived: ${points}`);
  assert.equal(points[4], IDENTITY[4]);
  assert.deepEqual(points.filter((_, i) => i !== 4), WITH_NAN.filter((_, i) => i !== 4),
    'the other eight points are untouched');
});

test('a NaN point does not reach the seven-bit output', () => {
  // The regression this file exists for: applyResponseCurve7 returned NaN, and its result is a
  // velocity or CC byte.
  for (const noteVelocity of [false, true]) {
    for (const value of [0, 64, 127]) {
      const out = applyResponseCurve7(value, { curve: 'custom', points: WITH_NAN, noteVelocity });
      assert.ok(Number.isInteger(out), `velocity=${noteVelocity} value=${value} -> ${out}`);
      assert.ok(out >= (noteVelocity ? 1 : 0) && out <= 127, `out of range: ${out}`);
    }
  }
});

test('the drawn curve has no gap where the bad point was', () => {
  const shown = responseCurveDisplayPoints('custom', WITH_NAN);
  assert.ok(shown.every(Number.isFinite), `designer would draw a gap: ${shown}`);
});

test('degenerate point arrays fall back to the identity rather than throwing', () => {
  for (const points of [[], [0], [0, 1], new Array(50).fill(0.5), new Array(9).fill(null),
                        new Array(9).fill('0.5'), null, undefined]) {
    const normalized = normalizeResponseCurvePoints(points);
    assert.equal(normalized.length, RESPONSE_CURVE_POINT_COUNT);
    assert.ok(normalized.every(Number.isFinite), `${JSON.stringify(points)} -> ${normalized}`);
  }
});

test('applyResponseCurve7 survives a non-finite range as well as a non-finite point', () => {
  // The same clamp carries inputMin/inputMax/outputMin/outputMax, so the fix is load-bearing for
  // more than the points array.
  for (const key of ['inputMin', 'inputMax', 'outputMin', 'outputMax']) {
    const out = applyResponseCurve7(64, { curve: 'linear', [key]: NaN });
    assert.ok(Number.isInteger(out) && out >= 0 && out <= 127, `${key}=NaN -> ${out}`);
  }
});
