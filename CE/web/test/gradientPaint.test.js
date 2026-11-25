// gradientPaint.test.js — a gradient written to ease draws what it drew before, and eases.
//
// The Paint engine (Animation Designer, step 3) writes a fill's gradient with its numbers and colours
// in registered custom properties, so a state that turns it or moves a stop glides instead of
// swapping the picture. These pin the two things that has to keep true: with its properties put back
// it is exactly gradientToCSS's gradient, for every type that has a list of stops; and two states of
// one gradient are written with the same declaration, so only the properties change between them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gradientToCSS, gradientStopCSS } from '../src/CE_Application/utils/gradientCSS.js';
import {
  gradientStopList,
  gradientPaint,
  gradientBackgroundCSS,
  registerGradientProperties,
  resetGradientRegistrationForTesting,
  GRADIENT_PROPERTY_DEFINITIONS,
  GRADIENT_EASED_PROPERTIES,
  GRADIENT_STOP_SLOTS,
} from '../src/CE_Application/utils/gradientPaint.js';
import {
  readKeyframes,
  cleanFrames,
  createKeyframePlayer,
  colourVariables,
} from '../src/CE_Application/utils/keyframeAnimation.js';
import { BUCKET_PROPERTIES } from '../src/CE_Application/utils/transitionCss.js';

const stops3 = [
  { color: 'FF0000', position: 0 },
  { color: '00FF00', position: 40 },
  { color: '0000FF', position: 100 },
];
const gradient = (type, extra = {}) => ({ type, angle: 135, centerX: 30, centerY: 70, radiusX: 40, radiusY: 60, edge: 0, stops: stops3, ...extra });

const TYPES = ['linear', 'radial', 'conical', 'radialRamp', 'linearRamp', 'duotone', 'tricolor', 'banding', 'reflected'];

/** gradientToCSS's own spelling of a stop list, to compare the list with what it writes. */
function cssFromList(list) {
  const stops = list.stops.map((stop) => `${gradientStopCSS(stop.color)} ${stop.position}%`).join(', ');
  const { angle, centreX, centreY, radiusX, radiusY } = list.geometry;
  switch (list.fn) {
    case 'linear-gradient': return `linear-gradient(${angle}deg, ${stops})`;
    case 'radial-gradient': return `radial-gradient(ellipse ${radiusX}% ${radiusY}% at ${centreX}% ${centreY}%, ${stops})`;
    case 'conic-gradient': return `conic-gradient(from ${angle}deg at ${centreX}% ${centreY}%, ${stops})`;
    case 'repeating-radial-gradient': return `repeating-radial-gradient(ellipse at ${centreX}% ${centreY}%, ${stops})`;
    case 'repeating-linear-gradient': return `repeating-linear-gradient(${angle}deg, ${stops})`;
    default: return '';
  }
}

/** The eased form with its properties put back, as a browser computes it before anything moves. */
function resolved(paint) {
  const values = new Map([...paint.vars.matchAll(/(--ce-g[a-z0-9-]*):([^;]+);/g)].map(([, name, value]) => [name, value]));
  return paint.image
    .replace(/var\((--ce-g[a-z0-9-]*)(?:,\s*([^()]*))?\)/g, (all, name, fallback) => values.get(name) ?? fallback ?? all)
    .replace(/calc\((-?[\d.]+)(deg|%) \+ 0\2\)/g, '$1$2')
    .replace(/(, (#[0-9A-Fa-f]+ -?[\d.]+%))(?:, \2)+(?=\))/g, '$1');
}

/** Numbers as numbers: 33.3333333 and 33.333 are the same stop to a browser. */
const numbers = (text) => text.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n) * 1000) / 1000));

test('every type with a list of stops is taken apart exactly as gradientToCSS writes it', () => {
  for (const type of TYPES) {
    for (const edge of [0, 50, 100]) {
      const g = gradient(type, { edge });
      assert.equal(cssFromList(gradientStopList(g)), gradientToCSS(g), `${type}, edge ${edge}`);
    }
  }
  // A round shape forces the radial's second radius to its first, as gradientToCSS does.
  assert.equal(cssFromList(gradientStopList(gradient('radial'), 'circle')), gradientToCSS(gradient('radial'), 'circle'));
});

test('the eased form, with its properties put back, is the gradient gradientToCSS draws', () => {
  for (const type of TYPES) {
    for (const edge of [0, 70]) {
      const g = gradient(type, { edge });
      const paint = gradientPaint(g);
      assert.ok(paint, type);
      assert.equal(numbers(resolved(paint)), numbers(gradientToCSS(g)), `${type}, edge ${edge}`);
    }
  }
});

test('two states of one gradient share their declaration, so only the properties between them move', () => {
  const resting = gradientPaint(gradient('linear'));
  const hovered = gradientPaint(gradient('linear', {
    angle: 300,
    stops: [...stops3, { color: 'FFFFFF', position: 70 }],     // a stop more, still within four
  }));
  assert.equal(resting.slots, 4);
  assert.equal(hovered.slots, 4);
  assert.equal(resting.image, hovered.image, 'the declaration is the same; a browser eases from one to the other');
  assert.notEqual(resting.vars, hovered.vars);
  assert.match(hovered.vars, /--ce-ga:300deg;/);
  // Padding is the last stop again, which draws nothing new.
  assert.match(resting.vars, /--ce-gc3:#0000FF;.*--ce-gp3:100%;/);
});

test('padding goes to four, eight or twelve; beyond twelve it is drawn as before, and jumps', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ color: i % 2 ? '000000' : 'FFFFFF', position: (i / (n - 1)) * 100 }));
  assert.equal(gradientPaint(gradient('linear', { stops: many(5) })).slots, 8);
  assert.equal(gradientPaint(gradient('linear', { stops: many(12) })).slots, 12);
  assert.equal(gradientPaint(gradient('linear', { stops: many(13) })), null);
  // Edge hardness triples the stops between ends: five stops at 50% hardness are thirteen.
  assert.equal(gradientPaint(gradient('linear', { stops: many(5), edge: 50 })), null);
  assert.equal(GRADIENT_STOP_SLOTS, 12);
  assert.equal(gradientBackgroundCSS(gradient('linear', { stops: many(13) })), `background: ${gradientToCSS(gradient('linear', { stops: many(13) }))};`);
});

test('what is not a list of stops, or not safe to write, is drawn as gradientToCSS draws it', () => {
  for (const type of ['mesh', 'volumeMesh', 'squareRamp', 'somethingNew']) {
    assert.equal(gradientPaint(gradient(type)), null, type);
  }
  assert.equal(gradientPaint({ type: 'linear', stops: [{ color: 'FF0000', position: 0 }] }), null, 'one stop');
  assert.equal(gradientPaint(null), null);
  // A colour that is not hex never reaches a style attribute: the old path draws it, as it always did.
  const odd = gradient('linear', { stops: [{ color: 'red;background:url(x)', position: 0 }, { color: '000000', position: 100 }] });
  assert.equal(gradientPaint(odd), null);
  assert.equal(gradientBackgroundCSS(odd), `background: ${gradientToCSS(odd)};`);
  // AARRGGBB, the panel's own form, is written as CSS's #RRGGBBAA.
  const seeThrough = gradientPaint(gradient('linear', { stops: [{ color: '80FF0000', position: 0 }, { color: 'FF0000FF', position: 100 }] }));
  assert.match(seeThrough.vars, /--ce-gc0:#FF000080;/);
  assert.match(seeThrough.vars, /--ce-gc1:#0000FF;/);
});

test('a loop turns and shifts it through two properties that start at nothing', () => {
  const paint = gradientPaint(gradient('linear'));
  assert.match(paint.image, /^linear-gradient\(calc\(var\(--ce-ga\) \+ var\(--ce-g-turn, 0deg\)\), var\(--ce-gc0\) calc\(var\(--ce-gp0\) \+ var\(--ce-g-shift, 0%\)\)/);
  assert.match(gradientPaint(gradient('conical')).image, /^conic-gradient\(from calc\(var\(--ce-ga\) \+ var\(--ce-g-turn, 0deg\)\) at var\(--ce-gcx\) var\(--ce-gcy\)/);
  // A radial has no angle to turn; it shifts.
  assert.ok(!/--ce-g-turn/.test(gradientPaint(gradient('radial')).image));
});

test('registration: typed, not inherited, once a page, and quiet about what is there already', () => {
  resetGradientRegistrationForTesting();
  const seen = [];
  const css = { registerProperty(definition) { if (definition.name === '--ce-gc3') throw new Error('already'); seen.push(definition); } };
  assert.equal(registerGradientProperties(css), GRADIENT_PROPERTY_DEFINITIONS.length - 1);
  assert.ok(seen.every((definition) => definition.inherits === false), 'a part inside a control never borrows its gradient');
  assert.deepEqual(seen.find((d) => d.name === '--ce-ga'), { name: '--ce-ga', syntax: '<angle>', initialValue: '0deg', inherits: false });
  assert.equal(seen.find((d) => d.name === '--ce-gc0').syntax, '<color>');
  assert.equal(registerGradientProperties(css), 0, 'the second call registers nothing');
  assert.equal(registerGradientProperties(null), 0);
  resetGradientRegistrationForTesting();
});

test('a colour timing eases every slot of a gradient, on the box and the layers that paint it', () => {
  for (const name of GRADIENT_EASED_PROPERTIES) assert.ok(BUCKET_PROPERTIES.part.colour.includes(name), name);
  assert.equal(GRADIENT_EASED_PROPERTIES.length, 5 + 2 * GRADIENT_STOP_SLOTS);
  assert.ok(!GRADIENT_EASED_PROPERTIES.includes('--ce-g-turn'), 'turn and shift are a loop\'s, not a state\'s');
});

// --- The keyframe channel ---------------------------------------------------------------------

const sheen = {
  name: 'sheen',
  kind: 'keyframes',
  enabled: true,
  duration: 2000,
  easing: 'linear',
  trigger: { type: 'always' },
  targets: [{ path: 'Transform' }],
  frames: [{ at: 0, shift: -100 }, { at: 1, shift: 100, turn: 45 }],
};

test('turn and shift are frame values, kept to their limits, and do not move the control', () => {
  const frames = cleanFrames([{ at: 0, turn: 99999, shift: -500 }, { at: 1, turn: 'x' }]);
  assert.deepEqual(frames, [{ at: 0, turn: 3600, shift: -200 }, { at: 1 }]);
  const entry = readKeyframes(sheen, 'sheen');
  assert.equal(entry.moves, false, 'a sheen sweeps the fill; the control stays where it is');
});

test('a sheen plays on the gradient channel, carried to the layer that paints the gradient', () => {
  const entry = readKeyframes(sheen, 'sheen');
  const player = createKeyframePlayer({ now: () => 0 });
  const out = player.next({ keyframes: { enabled: true, entries: [entry] }, activeStates: [], signals: {} });
  const channels = out.colours.get('');
  assert.equal(channels.gradient.length, 1);
  assert.equal(channels.paint.length, 0);
  assert.equal(out.parts.size, 0, 'no motion keyframes');
  assert.match(out.rules, /@keyframes ce-kf-gradient-[a-z0-9]+-a\{0%\{--ce-g-shift:-100%\}100%\{--ce-g-turn:45deg;--ce-g-shift:100%\}\}/);
  assert.match(colourVariables(channels), /--ce-kf-gradient:ce-kf-gradient-[a-z0-9]+-a 2000ms linear 0ms infinite normal none;--ce-kf-image:none;$/);
});
