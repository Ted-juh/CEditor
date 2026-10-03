// easing.test.js — every easing curve, as numbers and as CSS.
//
// Three consumers have to agree to the pixel: the component runtime (CSS), ce.anim (numbers, in
// four runtimes) and the slider value glide (numbers, because an SVG attribute cannot be
// transitioned). These pin the reader that turns an Animation node into a curve, the CSS it
// writes, and the reverse trip the glide depends on.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EASING_BEZIERS,
  EASING_NAMES,
  OVERSHOOTING_EASINGS,
  SPRING_DEFAULTS,
  CUSTOM_DEFAULT,
  cubicBezierEase,
  springEase,
  cleanBezier,
  readEasing,
  easeAt,
  easingToCss,
  easingDescriptionToCss,
  springToCssLinear,
  cssLinearSupported,
  resetCssLinearSupportForTesting,
  easeFromCss,
  parseTiming,
} from '../src/CE_Application/utils/easing.js';
import { cubicBezierEase as scriptSolver } from '../src/CE_Application/scripting/panelRuntime.js';
import { animationTiming } from '../src/CE_Application/utils/interactionRuntime.js';

test('ce.anim and the panel evaluate a curve with one function, not two that agree', () => {
  assert.equal(scriptSolver, cubicBezierEase);
});

test('the table is linear plus nine named beziers', () => {
  assert.deepEqual(EASING_NAMES, ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inBack', 'outBack', 'inOutBack']);
  for (const name of OVERSHOOTING_EASINGS) assert.ok(EASING_BEZIERS[name], name);
});

// --- Reading an Animation node ----------------------------------------------------------------

test('a named easing reads as its bezier, and linear as linear', () => {
  assert.deepEqual(readEasing({ easing: 'outCubic' }), { name: 'outCubic', kind: 'bezier', points: EASING_BEZIERS.outCubic, known: true });
  assert.deepEqual(readEasing({ easing: 'linear' }), { name: 'linear', kind: 'linear', known: true });
  assert.equal(readEasing({}).name, 'outQuad', 'no easing is the default the editor shows');
});

test('an unknown name is reported, and drawn as what plays: CSS ease', () => {
  const unknown = readEasing({ easing: 'wobbly' });
  assert.equal(unknown.known, false);
  assert.equal(unknown.kind, 'ease');
  assert.equal(easingToCss({ easing: 'wobbly' }), 'ease', 'exactly what the runtime has always written for it');
});

test('custom reads its own points, and a bad set falls back visibly', () => {
  assert.deepEqual(readEasing({ easing: 'custom', bezier: [0.1, 0.2, 0.3, 1.4] }).points, [0.1, 0.2, 0.3, 1.4]);
  const bad = readEasing({ easing: 'custom', bezier: [2, 0, 0, 1] });
  assert.equal(bad.known, false);
  assert.deepEqual(bad.points, [...CUSTOM_DEFAULT]);
});

test('a spring reads its feel, and nonsense becomes the default feel', () => {
  assert.deepEqual(readEasing({ easing: 'spring', spring: { damping: 9, frequency: 20 } }), { name: 'spring', kind: 'spring', damping: 9, frequency: 20, known: true });
  const fallback = readEasing({ easing: 'spring', spring: { damping: -1, frequency: 'x' } });
  assert.equal(fallback.damping, SPRING_DEFAULTS.damping);
  assert.equal(fallback.frequency, SPRING_DEFAULTS.frequency);
});

test('cleanBezier refuses rather than clamps: time cannot run backwards, y may overshoot', () => {
  assert.deepEqual(cleanBezier([0, -0.5, 1, 1.5]), [0, -0.5, 1, 1.5]);
  assert.deepEqual(cleanBezier(['0.2', '0', '0.8', '1']), [0.2, 0, 0.8, 1], 'numeric strings are numbers');
  assert.equal(cleanBezier([-0.1, 0, 1, 1]), null, 'x1 below 0');
  assert.equal(cleanBezier([0, 0, 1.1, 1]), null, 'x2 above 1');
  assert.equal(cleanBezier([0, 0, 1, 9]), null, 'a y that wild is a typo');
  assert.equal(cleanBezier([0, 0, 1]), null);
  assert.equal(cleanBezier([0, NaN, 1, 1]), null);
  assert.equal(cleanBezier('0,0,1,1'), null);
});

// --- Evaluating -------------------------------------------------------------------------------

test('easeAt agrees with the solver for a bezier and with the spring formula for a spring', () => {
  for (const t of [0, 0.2, 0.5, 0.9, 1]) {
    const b = EASING_BEZIERS.inOutBack;
    assert.equal(easeAt(readEasing({ easing: 'inOutBack' }), t), cubicBezierEase(t, ...b));
    assert.equal(easeAt(readEasing({ easing: 'spring' }), t), springEase(t));
  }
  assert.equal(easeAt(readEasing({ easing: 'linear' }), 0.37), 0.37);
  assert.equal(easeAt(null, 0.5), 0.5, 'nothing is linear');
});

test('a spring overshoots and lands exactly on 1', () => {
  const values = Array.from({ length: 101 }, (_, i) => springEase(i / 100));
  assert.ok(Math.max(...values) > 1);
  assert.equal(springEase(1), 1);
  assert.equal(springEase(0), 0);
});

// --- Writing CSS ------------------------------------------------------------------------------

test('named and custom curves are cubic-bezier, the identity is linear', () => {
  assert.equal(easingToCss({ easing: 'outBack' }), 'cubic-bezier(0.175, 0.885, 0.32, 1.275)');
  assert.equal(easingToCss({ easing: 'custom', bezier: [0.3, 0, 0.7, 1] }), 'cubic-bezier(0.3, 0, 0.7, 1)');
  assert.equal(easingToCss({ easing: 'linear' }), 'linear');
});

test('a spring is CSS linear() where the browser has it, and the nearest overshoot where it does not', () => {
  // An unsupported timing function makes the whole `transition` declaration invalid, which would
  // switch the animation OFF on an old WebKitGTK. Falling back to outBack keeps it moving.
  try {
    resetCssLinearSupportForTesting(true);
    const css = easingToCss({ easing: 'spring' });
    assert.match(css, /^linear\(0, /);
    assert.match(css, /, 1\)$/, 'and it lands');
    resetCssLinearSupportForTesting(false);
    const b = EASING_BEZIERS.outBack;
    assert.equal(easingToCss({ easing: 'spring' }), `cubic-bezier(${b.join(', ')})`);
  } finally {
    resetCssLinearSupportForTesting(null);
  }
});

test('with no CSS object at all (Node, tests) linear() counts as supported', () => {
  resetCssLinearSupportForTesting(null);
  assert.equal(cssLinearSupported(), true);
  resetCssLinearSupportForTesting(null);
});

test('springToCssLinear samples the same curve ce.anim.spring lands on', () => {
  const css = springToCssLinear(6, 12, 4);
  const stops = css.slice('linear('.length, -1).split(', ').map(Number);
  assert.equal(stops.length, 5);
  stops.forEach((stop, i) => assert.ok(Math.abs(stop - springEase(i / 4, 6, 12)) < 1e-4, `stop ${i}`));
});

test('an unknown description writes ease, like the runtime always has', () => {
  assert.equal(easingDescriptionToCss({ kind: 'mystery' }), 'ease');
  assert.equal(easingDescriptionToCss(null), 'ease');
});

// --- Reading CSS back, for the value glide ------------------------------------------------------

test('easeFromCss turns each timing function this file writes back into the same curve', () => {
  const back = easeFromCss(easingToCss({ easing: 'outCubic' }));
  for (const t of [0.1, 0.5, 0.8]) assert.equal(back(t), cubicBezierEase(t, ...EASING_BEZIERS.outCubic));
  assert.equal(easeFromCss('linear')(0.3), 0.3);
  try {
    resetCssLinearSupportForTesting(true);
    const spring = easeFromCss(easingToCss({ easing: 'spring' }));
    // Sampled at 40 points and joined with straight lines, so it is exact AT the stops.
    for (const i of [0, 10, 20, 40]) assert.ok(Math.abs(spring(i / 40) - springEase(i / 40)) < 1e-4, `stop ${i}`);
  } finally {
    resetCssLinearSupportForTesting(null);
  }
  const ease = easeFromCss('steps(4)');
  assert.equal(ease(0.5), cubicBezierEase(0.5, 0.25, 0.1, 0.25, 1), 'anything else is CSS ease');
});

test('parseTiming reads what animationTiming writes, and nothing else', () => {
  const timing = animationTiming({ duration: 140, delay: 20, easing: 'inOutCubic' });
  const parsed = parseTiming(timing);
  assert.equal(parsed.duration, 140);
  assert.equal(parsed.delay, 20);
  assert.equal(parsed.ease(0.5), cubicBezierEase(0.5, ...EASING_BEZIERS.inOutCubic));
  assert.equal(parseTiming('fast'), null);
  assert.equal(parseTiming(null), null);
  assert.equal(parseTiming('140ms ease'), null, 'no delay is not this file\'s shape');
});

test('animationTiming stretches both times for slow motion, never below zero', () => {
  assert.match(animationTiming({ duration: 100, delay: 10, easing: 'linear' }, 4), /^400ms linear 40ms$/);
  assert.match(animationTiming({ duration: -5, delay: -1, easing: 'linear' }), /^0ms linear 0ms$/);
  assert.match(animationTiming({ duration: 100, easing: 'linear' }, 0), /^100ms /, 'a nonsense scale is no scale');
});
