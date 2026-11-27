/**
 * buttonPresets.js — the Button's built-in animation presets: the Components showcase's third part
 * (docs/design/component-presets.md), after the Knob and the Slider, in the library under Button.
 *
 * A button is drawn one of three ways (models/buttonDeviceParts.js, editor/ControlAnatomy.svelte):
 * a flat face (the Graphites, Ceramic), a device key built from parts (housing, key, symbol,
 * indicator, legend; nearly every other set), or a whole illustration (Iris, Satellite). What moves
 * the whole button (its scale, turn, place and opacity) plays on all three, and that is what these
 * groups are made of. The lamp, the legend's words and the key's own parts are the second half.
 *
 * Every preset is an ordinary animation preset, id `ce:button:<name>`, applied linked and carried by
 * the panel as any other. `type` is the kind of button the showcase puts it on.
 *
 * IMPORTS ONLY THE KIT, which imports only the format: the export tools and the showcase script read
 * these under plain Node.
 */
import {
  transition, keyframes, ONCE_OPEN, entering, enteringOnce, leaving, gesture, state, buildComponentPresets,
} from './componentPresetKit.js';

export const BUTTON_PRESET_GROUPS = Object.freeze([
  { id: 'press', label: 'Press', note: 'how it answers the hand' },
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to it' },
  { id: 'gestures', label: 'Gestures', note: 'what a gesture plays' },
]);

const MOMENTARY = 'MomentaryButton';
const FOREVER = { iterations: 'infinite' };

const PRESS = [
  {
    // A button's own Pressed state shrinks it to 0.985, a sliver; this deepens it and eases it.
    id: 'sink', name: 'Sink', how: 'press', what: 'sinks under the finger and rises as it is let go', type: MOMENTARY,
    states: { Pressed: state({ pressed: true }, {}, { component: { 'Transform.scale': 0.9 } }) },
    animations: { sink: transition('sink', entering('pressed'), [['Transform.scale', 'transform']], 110, 'outQuad') },
  },
  {
    id: 'lift', name: 'Lift', how: 'hover', what: 'rises toward you while the pointer is over it', type: MOMENTARY,
    states: { Hover: state({ hover: true }, {}, { component: { 'Transform.scale': 1.06 } }) },
    animations: { lift: transition('lift', entering('hover'), [['Transform.scale', 'transform']], 160, 'outCubic') },
  },
  {
    id: 'bounce-back', name: 'Bounce back', how: 'let go', what: 'springs past its size and settles as it is let go', type: MOMENTARY,
    animations: { bounce: keyframes('bounce', leaving('pressed'), '', [{ at: 0, scale: 0.94 }, { at: 0.4, scale: 1.08 }, { at: 0.7, scale: 0.98 }, { at: 1, scale: 1 }], 420, { easing: 'outQuad' }) },
  },
  {
    id: 'jelly', name: 'Jelly', how: 'press', what: 'wobbles like jelly when it is pressed', type: MOMENTARY,
    animations: { jelly: keyframes('jelly', enteringOnce('pressed'), '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 0.88 }, { at: 0.45, scale: 1.06 }, { at: 0.65, scale: 0.96 }, { at: 0.85, scale: 1.02 }, { at: 1, scale: 1 }], 560, { easing: 'outQuad' }) },
  },
  {
    id: 'tilt', name: 'Tilt', how: 'press', what: 'rocks back under the finger, as a rocker does', type: MOMENTARY,
    states: { Pressed: state({ pressed: true }, {}, { component: { 'Transform.rotation': -6 } }) },
    animations: { tilt: transition('tilt', entering('pressed'), [['Transform.rotation', 'transform']], 120, 'outBack') },
  },
  {
    id: 'focus-nod', name: 'Focus nod', how: 'keyboard focus', what: 'nods once as the keys reach it', type: MOMENTARY,
    animations: { nod: keyframes('nod', enteringOnce('focused'), '', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.08 }, { at: 1, scale: 1 }], 360, { easing: 'outQuad' }) },
  },
];

const ATTENTION = [
  {
    id: 'pulse', name: 'Pulse', how: 'always', what: 'swells and settles, again and again: "press me"', type: MOMENTARY,
    animations: { pulse: keyframes('pulse', ONCE_OPEN, '', [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.05 }, { at: 1, scale: 1 }], 1600, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'breathe', name: 'Breathe', how: 'always', what: 'fades a little and back, slowly', type: MOMENTARY,
    animations: { breathe: keyframes('breathe', ONCE_OPEN, '', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.55 }, { at: 1, opacity: 1 }], 2400, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'wiggle', name: 'Wiggle', how: 'hover', what: 'a small wiggle as the pointer arrives', type: MOMENTARY,
    animations: { wiggle: keyframes('wiggle', enteringOnce('hover'), '', [{ at: 0, rotate: 0 }, { at: 0.2, rotate: -6 }, { at: 0.45, rotate: 5 }, { at: 0.7, rotate: -3 }, { at: 1, rotate: 0 }], 460, { easing: 'inOutSine' }) },
  },
  {
    id: 'beat-pulse', name: 'Beat pulse', how: 'transport beat', what: 'pulses on each beat while the transport plays', type: MOMENTARY,
    animations: { beatPulse: keyframes('beatPulse', { type: 'beat', every: 1 }, '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.07 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) },
  },
  {
    id: 'look-here', name: 'Look here', how: 'a script plays it', what: 'jumps, as a panel says "look here"', type: MOMENTARY,
    animations: { lookHere: keyframes('lookHere', { type: 'script', from: ['*'], to: [] }, '', [{ at: 0, y: 0 }, { at: 0.3, y: -12 }, { at: 0.55, y: 0 }, { at: 0.75, y: -4 }, { at: 1, y: 0 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'alarm', name: 'Alarm', how: 'always', what: 'shakes every two seconds, an alarm\'s call', type: MOMENTARY,
    animations: { alarm: keyframes('alarm', ONCE_OPEN, '', [{ at: 0, x: 0 }, { at: 0.04, x: -5 }, { at: 0.08, x: 5 }, { at: 0.12, x: -4 }, { at: 0.16, x: 3 }, { at: 0.2, x: 0 }, { at: 1, x: 0 }], 2000, { easing: 'linear', ...FOREVER }) },
  },
  {
    id: 'pop-in', name: 'Pop in', how: 'panel opens', what: 'grows in from nothing as the panel opens', type: MOMENTARY,
    animations: { popIn: keyframes('popIn', ONCE_OPEN, '', [{ at: 0, scale: 0.2, opacity: 0 }, { at: 0.6, scale: 1.1, opacity: 1 }, { at: 1, scale: 1, opacity: 1 }], 560, { easing: 'outQuad' }) },
  },
];

const GESTURES = [
  {
    id: 'double-flash', name: 'Double flash', how: 'double-click', what: 'blinks twice', type: MOMENTARY,
    animations: { flash: keyframes('flash', gesture('doubleClick'), '', [{ at: 0, opacity: 1 }, { at: 0.25, opacity: 0.2 }, { at: 0.5, opacity: 1 }, { at: 0.75, opacity: 0.2 }, { at: 1, opacity: 1 }], 480, { easing: 'linear' }) },
  },
  {
    id: 'pop', name: 'Pop', how: 'long press', what: 'pops when the press is held', type: MOMENTARY,
    animations: { pop: keyframes('pop', gesture('longPress'), '', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.14 }, { at: 1, scale: 1 }], 360, { easing: 'outBack' }) },
  },
  {
    id: 'nudge', name: 'Nudge', how: 'click', what: 'a small shake on each click', type: MOMENTARY,
    animations: { nudge: keyframes('nudge', gesture('click'), '', [{ at: 0, x: 0 }, { at: 0.25, x: -4 }, { at: 0.5, x: 3 }, { at: 0.75, x: -2 }, { at: 1, x: 0 }], 340) },
  },
  {
    id: 'spin', name: 'Spin', how: 'flick', what: 'a flick spins it round once', type: MOMENTARY,
    animations: { spin: keyframes('spin', gesture('flick'), '', [{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }], 700, { easing: 'outCubic' }) },
  },
  {
    id: 'wheel-bump', name: 'Wheel bump', how: 'wheel', what: 'bumps up or down the way the wheel turns', type: MOMENTARY,
    animations: {
      bumpUp: keyframes('bumpUp', gesture('wheelUp'), '', [{ at: 0, y: 0 }, { at: 0.4, y: -5 }, { at: 1, y: 0 }], 220, { easing: 'outQuad' }),
      bumpDown: keyframes('bumpDown', gesture('wheelDown'), '', [{ at: 0, y: 0 }, { at: 0.4, y: 5 }, { at: 1, y: 0 }], 220, { easing: 'outQuad' }),
    },
  },
];

export const BUTTON_PRESETS = buildComponentPresets({
  component: 'Button',
  prefix: 'button',
  groups: BUTTON_PRESET_GROUPS,
  byGroup: { press: PRESS, attention: ATTENTION, gestures: GESTURES },
});

export const buttonPresetId = (slug) => `ce:button:${slug}`;
