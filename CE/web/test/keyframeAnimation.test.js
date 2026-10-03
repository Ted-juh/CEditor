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
} from '../src/CE_Application/utils/keyframeAnimation.js';
import { readTrigger } from '../src/CE_Application/utils/interactionRuntime.js';

const node = (trigger, extra = {}) => ({
  _type: 'Animation', name: 'pulse', enabled: true, kind: 'keyframes',
  duration: 400, delay: 0, easing: 'linear', trigger, targets: [{ path: 'Parts.lamp' }],
  frames: PULSE_FRAMES.map((frame) => ({ ...frame })), ...extra,
});

// --- Reading -------------------------------------------------------------------------------------

test('the trigger types a keyframe animation answers', () => {
  assert.deepEqual(KEYFRAME_TRIGGER_TYPES, ['always', 'stateChange', 'valueChange', 'beat', 'script']);
  assert.equal(defaultIterations('always'), 'infinite');
  assert.equal(defaultIterations('stateChange'), 'infinite', 'a state animation loops while the state holds');
  assert.equal(defaultIterations('valueChange'), 1);
  assert.equal(defaultIterations('beat'), 1);
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
