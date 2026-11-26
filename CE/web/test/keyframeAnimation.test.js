// keyframeAnimation.test.js — the second kind of animation: frames of its own, played by CSS.
//
// A transition eases between two styles when something changes. A keyframe animation is a shape —
// a pulse, a blink — that plays while its trigger holds or once each time it fires. These pin how a
// node is read, the CSS it becomes, and when the player starts, restarts and stops one. Time and the
// transport position are injected.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYFRAME_TRIGGER_TYPES,
  PULSE_FRAMES,
  defaultIterations,
  keyframePart,
  cleanFrames,
  readKeyframes,
  keyframesRule,
  animationValue,
  animationDeclaration,
  framesHash,
  createKeyframePlayer,
  cleanFrameColour,
  channelFrames,
  colourKeyframesRule,
  colourAnimationValue,
  colourVariables,
  COLOUR_CHANNELS,
  readEmit,
  turnDirection,
} from '../src/CE_Application/utils/keyframeAnimation.js';
import { readTrigger, stepsOfControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { readTextEffect } from '../src/CE_Application/utils/textEffects.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const node = (trigger, extra = {}) => ({
  _type: 'Animation', name: 'pulse', enabled: true, kind: 'keyframes',
  duration: 400, delay: 0, easing: 'linear', trigger, targets: [{ path: 'Parts.lamp' }],
  frames: PULSE_FRAMES.map((frame) => ({ ...frame })), ...extra,
});

// --- Reading -------------------------------------------------------------------------------------

test('the trigger types a keyframe animation answers', () => {
  // `event` joined on 2026-11-24: a gesture (click, long press, flick…), the States tab's Events
  // row, played on request as `script` is (stateMotion.js). `valueStep` on 2026-11-26: once each
  // time a knob's value crosses into another of its steps (the Components showcase's Detent).
  assert.deepEqual(KEYFRAME_TRIGGER_TYPES, ['always', 'stateChange', 'valueChange', 'valueStep', 'beat', 'script', 'event']);
  assert.equal(defaultIterations('always'), 'infinite');
  assert.equal(defaultIterations('stateChange'), 'infinite', 'a state animation loops while the state holds');
  assert.equal(defaultIterations('valueChange'), 1);
  assert.equal(defaultIterations('valueStep'), 1, 'once a step');
  assert.equal(defaultIterations('beat'), 1);
  assert.equal(defaultIterations('event'), 1, 'a gesture plays it once');
});

test('only the part matters in a target, and anything not under Parts is the control', () => {
  assert.equal(keyframePart({ targets: [{ path: 'Parts.lamp.Layout.scale' }] }), 'lamp');
  assert.equal(keyframePart({ targets: [{ path: 'Parts.lamp' }] }), 'lamp');
  assert.equal(keyframePart({ targets: [{ path: 'Transform.scale' }] }), '');
  assert.equal(keyframePart({ targets: [{ path: '' }, { path: 'Parts.b' }] }), 'b', 'an empty target is skipped');
  assert.equal(keyframePart({}), '');
});

test('frames keep known properties, in range, sorted', () => {
  assert.deepEqual(cleanFrames([
    { at: 1, scale: 1 },
    { at: 0.5, scale: 99, opacity: 3, colour: 'red', x: '12' },
    { at: 'x' },
    null,
    { at: -1, rotate: 45 },
  ]), [
    { at: 0, rotate: 45 },
    { at: 0.5, scale: 10, opacity: 1, x: 12 },
    { at: 1, scale: 1 },
  ]);
});

test('a keyframe node reads with its defaults, and anything else reads as nothing', () => {
  const entry = readKeyframes(node({ type: 'always' }));
  assert.equal(entry.name, 'pulse');
  assert.equal(entry.part, 'lamp');
  assert.equal(entry.iterations, 'infinite');
  assert.equal(entry.span, Infinity);
  assert.equal(entry.direction, 'normal');
  assert.equal(readKeyframes(node({ type: 'beat' }), '', { timeScale: 2 }).duration, 800, 'slow motion applies');
  assert.equal(readKeyframes(node({ type: 'beat' })).span, 400, 'a one-shot runs once');
  assert.equal(readKeyframes(node({ type: 'beat' }, { iterations: 3, delay: 50 })).span, 1250);
  assert.equal(readKeyframes(node({ type: 'always' }, { enabled: false })), null);
  assert.equal(readKeyframes(node({ type: 'always' }, { kind: 'transition' })), null);
  assert.equal(readKeyframes(node({ type: 'always' }, { frames: [] })), null, 'no frames, nothing to play');
});

// --- CSS -------------------------------------------------------------------------------------------

test('frames are written with the individual transform properties, so they compose with transform', () => {
  const entry = readKeyframes(node({ type: 'always' }, { frames: [{ at: 0, scale: 1, rotate: -10 }, { at: 1, x: 4, opacity: 0.5 }] }));
  const rule = keyframesRule(entry, 'a');
  assert.match(rule, /^@keyframes ce-kf-[0-9a-z]+-a\{0%\{scale:1;rotate:-10deg\}100%\{translate:4px 0px;opacity:0\.5\}\}$/);
  assert.ok(!/transform/.test(rule), 'never `transform`, which would replace the control\'s own');
});

test('the two phases share frames and differ only in name, which is what restarts a CSS animation', () => {
  const entry = readKeyframes(node({ type: 'beat' }));
  assert.notEqual(keyframesRule(entry, 'a'), keyframesRule(entry, 'b'));
  assert.equal(keyframesRule(entry, 'a').replace('-a{', '-b{'), keyframesRule(entry, 'b'));
  assert.match(animationValue(entry, 'b'), /^ce-kf-[0-9a-z]+-b 400ms linear 0ms 1 normal none$/);
  assert.equal(framesHash(entry.frames), framesHash(cleanFrames(PULSE_FRAMES)), 'equal frames, one name');
});

test('an SVG part is told to turn about its own centre', () => {
  assert.equal(animationDeclaration([]), '');
  assert.equal(animationDeclaration(['x 1ms']), 'animation:x 1ms;');
  assert.match(animationDeclaration(['x 1ms'], { svg: true }), /^transform-box:fill-box;transform-origin:center;animation:x 1ms;$/);
});

// --- The player ------------------------------------------------------------------------------------

function rig(...animations) {
  const clock = { t: 0 };
  const player = createKeyframePlayer({ now: () => clock.t });
  const catalog = { enabled: true, reducedMotion: false, entries: animations.map((a) => readKeyframes(a)) };
  const step = (states = [], signals = {}, options = {}) => player.next({ activeStates: states, signals, keyframes: catalog }, options);
  return { clock, step, catalog };
}

const phaseOf = (out, part = 'lamp') => /-(a|b) /.exec(out.parts.get(part)?.[0] ?? '')?.[1] ?? null;

test('always plays from the first frame and never restarts', () => {
  const { step } = rig(node({ type: 'always' }));
  const first = step();
  assert.equal(phaseOf(first), 'a');
  assert.match(first.rules, /@keyframes ce-kf-/);
  const again = step(['Hover']);
  assert.equal(again.parts, first.parts, 'nothing changed, so the same objects come back');
});

test('a looping state animation plays while its state holds, and restarts on coming back', () => {
  const { step } = rig(node({ type: 'stateChange', to: ['checked'] }));
  assert.equal(phaseOf(step([])), null);
  const on = step(['Checked']);
  assert.equal(phaseOf(on), 'a');
  assert.deepEqual(on.fired, ['pulse']);
  assert.equal(phaseOf(step(['Checked', 'Hover'])), 'a', 'another state arriving does not restart it');
  assert.equal(phaseOf(step(['Hover'])), null, 'it stops when the state goes');
  assert.equal(phaseOf(step(['Hover', 'Checked'])), 'b', 'and starts afresh when it comes back');
});

test('a finite state animation plays once on the way in, and stays put until the next', () => {
  const { step } = rig(node({ type: 'stateChange', to: ['pressed'] }, { iterations: 1 }));
  step([]);
  assert.equal(phaseOf(step(['Pressed'])), 'a');
  assert.equal(phaseOf(step([])), 'a', 'leaving does not replay it');
  assert.equal(phaseOf(step(['Pressed'])), 'b', 'pressing again does');
});

test('a value animation fires once per change, not again mid-run, and never during a drag', () => {
  const { step, clock } = rig(node({ type: 'valueChange', source: 'value.normalized' }));
  step([], { valueNormalized: 0 });
  clock.t = 1000;
  assert.equal(phaseOf(step([], { valueNormalized: 0.2 })), 'a');
  clock.t = 1100;
  const busy = step([], { valueNormalized: 0.4 });
  assert.equal(phaseOf(busy), 'a', 'a run is 400ms; a change 100ms in does not restart it');
  assert.deepEqual(busy.fired, []);
  clock.t = 2000;
  assert.equal(phaseOf(step([], { valueNormalized: 0.6 })), 'b');
  clock.t = 3000;
  assert.equal(phaseOf(step(['Dragging'], { valueNormalized: 0.9, dragging: true })), 'b', 'a drag never fires it');
});

test('a beat animation fires on every Nth beat while the transport runs', () => {
  const { step } = rig(node({ type: 'beat', every: 2 }));
  assert.equal(phaseOf(step([], {}, { beats: 0.1 })), null, 'the first position is where counting starts');
  assert.equal(phaseOf(step([], {}, { beats: 1.5 })), null, 'beat 1 is not a multiple of 2');
  const on = step([], {}, { beats: 2.02 });
  assert.equal(phaseOf(on), 'a');
  assert.deepEqual(on.fired, ['pulse']);
  assert.equal(phaseOf(step([], {}, { beats: 3.9 })), 'a');
  assert.equal(phaseOf(step([], {}, { beats: 4.0 })), 'b');
  assert.equal(phaseOf(step([], {}, { beats: null })), 'b', 'stopping the transport leaves the last run be');
  assert.equal(phaseOf(step([], {}, { beats: 6.1 })), 'b', 'and starting again counts afresh');
  assert.equal(phaseOf(step([], {}, { beats: 8.1 })), 'a');
});

test('a play request starts a one-shot whatever its trigger, and restarts it each time', () => {
  const { step } = rig(node({ type: 'script' }));
  assert.equal(phaseOf(step([], {}, { plays: {} })), null);
  const played = step([], {}, { plays: { pulse: 1 } });
  assert.equal(phaseOf(played), 'a');
  assert.deepEqual(played.fired, ['pulse']);
  assert.equal(phaseOf(step([], {}, { plays: { pulse: 1 } })), 'a', 'the same request is not a new one');
  assert.equal(phaseOf(step([], {}, { plays: { pulse: 2 } })), 'b');
});

test('reduced motion, either switch, plays nothing', () => {
  const { step, catalog } = rig(node({ type: 'always' }));
  assert.equal(step([], {}, { reducedMotion: true }).parts.size, 0);
  catalog.reducedMotion = true;
  assert.equal(step().parts.size, 0);
  catalog.reducedMotion = false;
  catalog.enabled = false;
  assert.equal(step().parts.size, 0, 'and neither does a switched-off section');
});

test('two animations on one part play together, in document order', () => {
  const blink = node({ type: 'always' }, { name: 'blink', frames: [{ at: 0, opacity: 1 }, { at: 1, opacity: 0.2 }] });
  const { step } = rig(node({ type: 'always' }), blink);
  const out = step();
  assert.equal(out.parts.get('lamp').length, 2);
  assert.match(animationDeclaration(out.parts.get('lamp')), /^animation:ce-kf-\w+-a [^,]+, ce-kf-\w+-a /);
});

test('readTrigger keeps the beat interval it is given', () => {
  assert.equal(readTrigger({ trigger: { type: 'beat', every: 4 } }).every, 4);
  assert.equal(readTrigger({ trigger: { type: 'beat', every: 0 } }).every, 1);
});

// --- Colour ---------------------------------------------------------------------------------------
// A control's colour is painted by layers inside the element that moves, so colour frames are
// separate @keyframes, one per channel, handed to those layers as custom properties.

test('a frame colour is the document\'s AARRGGBB, and nothing else gets in', () => {
  assert.equal(cleanFrameColour('ff3a3a3a'), 'FF3A3A3A');
  assert.equal(cleanFrameColour('#80FF0000'), '80FF0000');
  assert.equal(cleanFrameColour('#14b8a6'), 'FF14B8A6', 'six digits are opaque');
  // The colour is written into a <style> element: anything but hex digits is refused, not escaped.
  for (const bad of ['red', 'rgb(1,2,3)', '#FFF', '', null, 'FF0000}body{display:none', '{surface}']) {
    assert.equal(cleanFrameColour(bad), null, String(bad));
  }
});

test('frames keep a fill and a text colour, and drop one that is not a colour', () => {
  assert.deepEqual(cleanFrames([{ at: 0.5, fill: '#ff0000', text: 'nope', scale: 1.1 }, { at: 0, text: 'FFFFFFFF' }]), [
    { at: 0, text: 'FFFFFFFF' },
    { at: 0.5, scale: 1.1, fill: 'FFFF0000' },
  ]);
});

const flash = (extra = {}) => node({ type: 'always' }, {
  name: 'flash',
  frames: [{ at: 0, fill: 'FF202020' }, { at: 0.5, fill: 'FFFF8800', text: 'FF000000' }, { at: 1, fill: 'FF202020' }],
  ...extra,
});

test('each channel is its own @keyframes, painting with the one property that element uses', () => {
  const entry = readKeyframes(flash());
  assert.equal(entry.moves, false, 'colour only: no motion keyframes at all');
  assert.deepEqual(Object.fromEntries(Object.entries(COLOUR_CHANNELS).map(([k, v]) => [k, v.property])),
    { paint: 'background-color', shape: 'fill', stroke: 'stroke', text: 'color' });
  assert.match(colourKeyframesRule(entry, 'paint', 'a'),
    /^@keyframes ce-kf-paint-[0-9a-z]+-a\{0%\{background-color:#202020FF\}50%\{background-color:#FF8800FF\}100%\{background-color:#202020FF\}\}$/);
  assert.match(colourKeyframesRule(entry, 'stroke', 'a'), /^@keyframes ce-kf-stroke-\w+-a\{0%\{stroke:#202020FF\}/);
  // A frame that leaves a colour out is not in that channel's rule: it eases through.
  assert.deepEqual(channelFrames(entry, 'text'), [{ at: 0.5, colour: 'FF000000' }]);
  assert.match(colourKeyframesRule(entry, 'text', 'b'), /^@keyframes ce-kf-text-\w+-b\{50%\{color:#000000FF\}\}$/);
  assert.match(colourAnimationValue(entry, 'text', 'b'), /^ce-kf-text-\w+-b 400ms linear 0ms infinite normal none$/,
    'on the same clock as the motion would be');
});

test('the player hands colour out per part and channel, beside the motion', () => {
  const both = flash({ name: 'both', frames: [{ at: 0, scale: 1, fill: 'FF202020' }, { at: 1, scale: 1.1 }] });
  const { step } = rig(flash(), both);
  const out = step();
  assert.equal(out.parts.get('lamp').length, 1, 'only the animation that moves writes motion');
  const lamp = out.colours.get('lamp');
  assert.equal(lamp.paint.length, 2);
  assert.equal(lamp.text.length, 1, 'only flash sets a text colour');
  assert.match(out.rules, /@keyframes ce-kf-paint-/);
  assert.match(out.rules, /@keyframes ce-kf-shape-/);
  assert.equal(step().colours, out.colours, 'nothing changed, so the same objects come back');
});

test('a restart flips the colour channels with the motion, so they stay in step', () => {
  const blinkColour = flash({ trigger: { type: 'beat', every: 1 }, frames: [{ at: 0, scale: 1, fill: 'FF000000' }, { at: 1, scale: 1.2 }] });
  const { step } = rig(blinkColour);
  step([], {}, { beats: 0.5 });
  const first = step([], {}, { beats: 1.5 });
  const second = step([], {}, { beats: 2.5 });
  const phase = (out) => [/-(a|b) /.exec(out.parts.get('lamp')[0])[1], /-(a|b) /.exec(out.colours.get('lamp').paint[0])[1]];
  assert.deepEqual(phase(first), ['a', 'a']);
  assert.deepEqual(phase(second), ['b', 'b']);
});

test('colour variables are all five, always, so a part never paints with its control\'s pulse', () => {
  // The fifth is a fill gradient's turn and shift (gradientPaint.js), added with the Paint engine.
  assert.equal(colourVariables(null), '--ce-kf-paint:none;--ce-kf-shape:none;--ce-kf-stroke:none;--ce-kf-text:none;--ce-kf-gradient:none;--ce-kf-image:none;');
  assert.equal(colourVariables({ paint: ['p 1ms'], text: ['t 1ms', 'u 1ms'] }),
    '--ce-kf-paint:p 1ms;--ce-kf-shape:none;--ce-kf-stroke:none;--ce-kf-text:t 1ms, u 1ms;--ce-kf-gradient:none;--ce-kf-image:none;');
  // A part whose fill is absorbed onto it plays paint itself, and must not hand it to its layers too.
  assert.match(colourVariables({ paint: ['p 1ms'] }, { skip: ['paint'] }), /^--ce-kf-paint:none;/);
  assert.equal(animationDeclaration(['m 1ms'], { extra: ['p 1ms'] }), 'animation:m 1ms, p 1ms;');
  assert.equal(animationDeclaration(null, { extra: ['p 1ms'], svg: true }), 'animation:p 1ms;',
    'a colour alone needs no transform origin');
});

// --- A step of the value, and words thrown (2026-11-26, the Components showcase's knob) -----------

test('a step animation fires each time the value comes to another step, during a drag too', () => {
  const { step, clock } = rig(node({ type: 'valueStep', steps: 4 }));
  assert.equal(phaseOf(step([], { valueNormalized: 0.5 })), null, 'where the value starts is no step');
  clock.t = 100;
  assert.equal(phaseOf(step([], { valueNormalized: 0.55 })), null, 'within the same step: nothing');
  clock.t = 200;
  const up = step(['Dragging'], { valueNormalized: 0.7, dragging: true });
  assert.equal(phaseOf(up), 'a', 'into the next step, while dragged');
  assert.deepEqual(up.fired, ['pulse']);
  clock.t = 220;
  assert.equal(phaseOf(step(['Dragging'], { valueNormalized: 1, dragging: true })), 'b', 'the next step restarts it at once, as a detent does');
  clock.t = 240;
  assert.equal(phaseOf(step([], { valueNormalized: 0.99 })), 'b', 'rounded: 0.99 is still the top step');
});

test('a step trigger reads its count, kept in range, and a control steps as its own steps say', () => {
  assert.equal(readTrigger({ trigger: { type: 'valueStep', steps: 7.4 } }).steps, 7);
  assert.equal(readTrigger({ trigger: { type: 'valueStep', steps: 9999 } }).steps, 400);
  assert.equal(readTrigger({ trigger: { type: 'valueStep' } }).steps, 0, 'none named: the control\'s own');
  const knob = createControl('Knob');
  Object.assign(knob._children.Behavior, { min: 0, max: 4, step: 1 });
  assert.equal(stepsOfControl(knob), 4, 'a knob of five choices has four steps between them');
  Object.assign(knob._children.Behavior, { min: 0, max: 1, step: 0 });
  assert.equal(stepsOfControl(knob), 20, 'a knob with no step: twenty, one every 5%');
  Object.assign(knob._children.Behavior, { min: 0, max: 127, step: 0.01 });
  assert.equal(stepsOfControl(knob), 20, 'more than 400 is no detent anyone feels');
});

const emitNode = (fields = {}) => ({
  _type: 'Animation', name: 'stream', enabled: true, kind: 'emit', duration: 700, delay: 0, easing: 'outQuad',
  trigger: { type: 'valueStep', steps: 10 }, targets: [], ...fields,
});

test('an emit animation reads what it throws, from where and how far, kept in range', () => {
  const entry = readEmit(emitNode({ shows: 'delta', from: 'centre', direction: 'up', travel: 9999, size: 1 }));
  assert.deepEqual(
    { ...entry.emit, easing: undefined },
    { shows: 'delta', from: 'centre', direction: 'up', travel: 400, size: 6, colour: null, duration: 700, delay: 0, easing: undefined },
  );
  assert.equal(entry.moves, false);
  assert.deepEqual(entry.frames, []);
  const plain = readEmit(emitNode({ shows: 'x', from: 'y', direction: 'z' })).emit;
  assert.deepEqual([plain.shows, plain.from, plain.direction, plain.travel, plain.size], ['value', 'tip', 'pointer', 36, 12]);
  assert.equal(readEmit(emitNode({ enabled: false })), null);
  assert.equal(readEmit({ kind: 'keyframes' }), null);
  assert.equal(readEmit(emitNode(), '', { timeScale: 2 }).emit.duration, 1400, 'slow motion stretches its flight');
});

test('each step throws a word with the value and the one before it; a word lasts its flight', () => {
  const clock = { t: 0 };
  const player = createKeyframePlayer({ now: () => clock.t });
  const catalog = { enabled: true, reducedMotion: false, entries: [readEmit(emitNode())] };
  const step = (v) => player.next({ activeStates: [], signals: { valueNormalized: v }, keyframes: catalog });
  assert.deepEqual(step(0.2).emits, [], 'the value as it opens throws nothing');
  clock.t = 50;
  const one = step(0.3);
  assert.deepEqual(one.emits.map((w) => [w.value, w.from, w.turn]), [[0.3, 0.2, 1]]);
  clock.t = 100;
  const two = step(0.1);
  assert.deepEqual(two.emits.map((w) => [w.value, w.from, w.turn]), [[0.3, 0.2, 1], [0.1, 0.3, -1]], 'down: the turn says so');
  assert.notEqual(two.key, one.key, 'a new word restyles');
  clock.t = 50 + 700 + 201;
  assert.deepEqual(step(0.1).emits.map((w) => w.value), [0.1], 'the first has faded; the second is still in the air');
  clock.t = 100 + 700 + 201;
  assert.deepEqual(step(0.1).emits, []);
  player.reset();
  assert.deepEqual(step(0.9).emits, [], 'reset forgets where the value was');
});

test('a word thrown on another trigger carries the value as it is', () => {
  const clock = { t: 0 };
  const player = createKeyframePlayer({ now: () => clock.t });
  const catalog = { enabled: true, reducedMotion: false, entries: [readEmit(emitNode({ trigger: { type: 'script' } }))] };
  const step = (v, plays = {}) => player.next({ activeStates: [], signals: { valueNormalized: v }, keyframes: catalog }, { plays });
  assert.deepEqual(step(0.4).emits, []);
  assert.deepEqual(step(0.6, { stream: 1 }).emits.map((w) => [w.value, w.from]), [[0.6, 0.4]]);
});

test('a text effect whose direction is the turn goes the way the value went', () => {
  assert.deepEqual(['odometer', 'roll', 'reel'].map((effect) => [turnDirection({ effect }, 1), turnDirection({ effect }, -1)]),
    [['up', 'down'], ['up', 'down'], ['up', 'down']], 'a counter\'s digits');
  assert.deepEqual(['push', 'wipe'].map((effect) => [turnDirection({ effect }, 1), turnDirection({ effect }, -1)]),
    [['left', 'right'], ['left', 'right']], 'a carousel: up, the next word comes in from the right');
  const text = readTextEffect({ kind: 'text', enabled: true, name: 'names', effect: 'push', direction: 'turn',
    trigger: { type: 'valueStep', steps: 4 }, targets: [{ path: 'Parts.labelCurrent' }] });
  assert.equal(text.direction, 'turn');
  const clock = { t: 0 };
  const player = createKeyframePlayer({ now: () => clock.t });
  const entry = { name: 'names', text, moves: false, part: 'labelCurrent', trigger: text.trigger, iterations: 1, frames: [], span: 600 };
  const catalog = { enabled: true, reducedMotion: false, entries: [entry] };
  const step = (v) => player.next({ activeStates: [], signals: { valueNormalized: v }, keyframes: catalog });
  step(0.5);
  clock.t = 10;
  assert.equal(step(0.75).texts.get('labelCurrent')[0].effect.direction, 'left');
  clock.t = 20;
  const down = step(0.25);
  assert.equal(down.texts.get('labelCurrent')[0].effect.direction, 'right');
  assert.match(down.rules, /@keyframes/, 'its rules are the turned effect\'s');
});
