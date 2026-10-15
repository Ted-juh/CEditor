// canvasControlTextEffects.test.js — the values CanvasControl draws a label's effect layers from,
// resolved from the Text section's Effects and Fill in one call (canvasControlTextEffects.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveTextEffects } from '../src/CE_Application/editor/canvasControlTextEffects.js';

test('no effects: one fill layer, nothing else switched on', () => {
  const fx = resolveTextEffects(undefined, { colour: 'FF102030' });
  assert.deepEqual(fx.visualLayers, [{ key: 'fill', order: 50, priority: 80 }]);
  assert.equal(fx.hasEffects, false);
  assert.equal(fx.mainFillColour, fx.fillColourResolved);
  assert.deepEqual([fx.longShadowCopies, fx.motionCopies, fx.glowLayers], [[], [], []]);
  assert.equal(resolveTextEffects(undefined, undefined).visualLayers.length, 1, 'a control with no Text section at all');
});

test('knockout: the outline is on, the fill is cut out, and the outline takes the fill colour', () => {
  const fx = resolveTextEffects({ knockout: true }, { colour: 'FFFF0000' });
  assert.equal(fx.knockout, true);
  assert.equal(fx.outlineEnabled, true);
  assert.equal(fx.mainFillColour, 'rgba(0,0,0,0)');
  assert.equal(fx.outlineColour, resolveTextEffects({ outlineColour: 'FFFF0000' }).outlineColour);
  assert.equal(fx.hasEffects, true);
});

test('a dashed or inner outline is stroked, with its dash pattern', () => {
  assert.equal(resolveTextEffects({ outlineEnabled: true }).outlineUseStroke, false);
  const dashed = resolveTextEffects({ outlineEnabled: true, outlineDashEnabled: true, outlineDashLength: 5, outlineDashGap: 2 });
  assert.equal(dashed.outlineUseStroke, true);
  assert.equal(dashed.outlineDashArray, '5 2');
  assert.equal(resolveTextEffects({ outlinePlacement: 'inner' }).outlineUseStroke, true);
});

test('a long shadow is a run of copies along its direction; an extruded one stays opaque', () => {
  const fx = resolveTextEffects({ shadowEnabled: true, shadowStyle: 'long', shadowSteps: 4, shadowDistance: 8, shadowOffsetX: 1, shadowOffsetY: 0 });
  assert.equal(fx.longShadowEnabled, true);
  assert.equal(fx.softShadowEnabled, false);
  assert.deepEqual(fx.longShadowCopies.map((copy) => copy.dx), [2, 4, 6, 8]);
  assert.ok(fx.longShadowCopies.every((copy) => copy.dy === 0));
  assert.ok(fx.longShadowCopies[0].opacity > fx.longShadowCopies[3].opacity, 'a long shadow fades');
  const extruded = resolveTextEffects({ shadowEnabled: true, shadowStyle: 'extrude', shadowSteps: 3 });
  assert.ok(extruded.longShadowCopies.every((copy) => copy.opacity === 0.88));
});

test('a reflection saved as the earlier "copy" reads the same', () => {
  const fx = resolveTextEffects({ copyEnabled: true, copyOffsetX: 0, copyOffsetY: 10, copyColour: '80FFFFFF' });
  assert.equal(fx.reflectionEnabled, true);
  assert.equal(fx.reflectionAngle, 90);
  assert.equal(fx.reflectionDistance, 10);
  assert.ok(Math.abs(fx.reflectionIntensity - 128 / 255) < 1e-9);
  assert.equal(resolveTextEffects({ copyEnabled: true, reflectionEnabled: false }).reflectionEnabled, false,
    'an explicit reflectionEnabled wins over the copy');
});

test('motion with no distance draws nothing', () => {
  assert.equal(resolveTextEffects({ motionEnabled: true, motionDistance: 0 }).motionEnabled, false);
  const fx = resolveTextEffects({ motionEnabled: true, motionDistance: 6, motionSteps: 3, motionAngle: 0 });
  assert.deepEqual(fx.motionCopies.map((copy) => copy.dx), [2, 4, 6]);
});

test('the layers paint in their order, the built-in priority breaking ties', () => {
  const fx = resolveTextEffects({
    outlineEnabled: true, outlineOrder: 90,
    shadowEnabled: true, shadowStyle: 'long',
    bevelEnabled: true, bevelDepth: 2, bevelStyle: 'outer', bevelOrder: 10,
  });
  assert.deepEqual(fx.visualLayers.map((layer) => layer.key), ['longShadow', 'bevelOuter', 'fill', 'outline']);
  assert.equal(fx.bevelIsOuter, true);
  assert.equal(fx.bevelNeedsMask, false);
  assert.equal(resolveTextEffects({ bevelEnabled: true, bevelDepth: 2, bevelStyle: 'inner' }).bevelHighlightOpacity, 0.65);
});

test('CanvasControl reads them from the one derived, not one derived each', () => {
  const source = readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8');
  assert.match(source, /let textFx = \$derived\(resolveTextEffects\(textEffects, textFill\)\);/);
  for (const name of ['textOutlineColour', 'textBevelIsOuter', 'textVisualLayers', 'hasTextEffects', 'textReflectionAngle']) {
    assert.ok(!new RegExp(`let ${name} = \\$derived`).test(source), `${name} is a field of textFx now`);
  }
});
