/**
 * buttonPresets.js — the Button's built-in animation presets: the Components showcase's third part
 * (docs/design/component-presets.md), after the Knob and the Slider, in the library under Button.
 *
 * A button is drawn one of three ways (models/buttonDeviceParts.js, editor/ControlAnatomy.svelte):
 * a flat face (the Graphites, Ceramic), a device key built from parts (housing, key, symbol,
 * indicator, legend; nearly every other set), or a whole illustration (Iris, Satellite). What moves
 * the whole button (its scale, turn, place and opacity) plays on all three, and that is what the
 * first three groups are made of. The second half plays on a key's own parts: its lamp (`indicator`),
 * its legend's words, the key and its housing (editor/ButtonDeviceParts.svelte), and on the caption
 * a key is drawn with. Those go on a button drawn as a key whose set draws the part; anywhere else
 * the library says so (animationPresetModel.js keyPartsNotDrawn).
 *
 * Every preset is an ordinary animation preset, id `ce:button:<name>`, applied linked and carried by
 * the panel as any other. `type` is the kind of button the showcase puts it on.
 *
 * IMPORTS ONLY THE KIT, which imports only the format: the export tools and the showcase script read
 * these under plain Node.
 */
import {
  transition, keyframes, words, ONCE_OPEN, entering, enteringOnce, leaving, gesture, state, part, VALUE_CHANGE, buildComponentPresets,
} from './componentPresetKit.js';

export const BUTTON_PRESET_GROUPS = Object.freeze([
  { id: 'press', label: 'Press', note: 'how it answers the hand' },
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to it' },
  { id: 'gestures', label: 'Gestures', note: 'what a gesture plays' },
  { id: 'light', label: 'Light', note: 'the lamp on the key' },
  { id: 'switch', label: 'Switch', note: 'a toggle going over' },
  { id: 'words', label: 'Words', note: 'the caption and the legend' },
  { id: 'signals', label: 'Signals', note: 'the lamp saying what happened' },
]);

const MOMENTARY = 'MomentaryButton';
const TOGGLE = 'ToggleButton';
const FOREVER = { iterations: 'infinite' };
// While a toggle is on: for as long as the state holds.
const WHILE_ON = { type: 'stateChange', to: ['selected'] };
const WHILE_HELD = { type: 'stateChange', to: ['pressed'] };
// A toggle switched from outside: by the synth, a script, another control. Not by the hand.
const FROM_OUTSIDE = { ...VALUE_CHANGE, origin: 'external' };
const LAMP_PATHS = [['Parts.indicator.Background.Fill.colour', 'colour'], ['Parts.indicator.opacity', 'opacity']];
// The caption a key is drawn with: the control's own text.
const caption = (name, trigger, effect, way, settings) => ({ ...words(name, trigger, 'legend', effect, way, settings), targets: [{ path: 'Text' }] });
const GREEN = 'FF2BB673';
const RED = 'FFE5484D';
const AMBER = 'FFF5A524';

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

// --- The second half: a key's own parts ---------------------------------------------------------

const LIGHT = [
  {
    id: 'lamp-fade', name: 'Lamp fade', how: 'switch on or off', what: 'the lamp fades up and down rather than snapping', type: TOGGLE,
    animations: { lampFade: transition('lampFade', entering('selected'), LAMP_PATHS, 420, 'inOutSine') },
  },
  {
    id: 'afterglow', name: 'Afterglow', how: 'let go', what: 'the lamp dies away slowly after the press', type: MOMENTARY,
    animations: { afterglow: transition('afterglow', leaving('pressed'), LAMP_PATHS, 1600, 'outQuad') },
  },
  {
    id: 'flare', name: 'Flare', how: 'press', what: 'the lamp flares white as it lights', type: MOMENTARY,
    animations: { flare: keyframes('flare', enteringOnce('pressed'), 'indicator', [{ at: 0, scale: 1 }, { at: 0.3, scale: 1.5, fill: 'FFFFF6D8' }, { at: 1, scale: 1 }], 420, { easing: 'outQuad' }) },
  },
  {
    id: 'breathe-while-on', name: 'Breathe while on', how: 'while on', what: 'the lamp breathes for as long as it is on', type: TOGGLE,
    animations: { breathe: keyframes('breathe', WHILE_ON, 'indicator', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.35 }, { at: 1, opacity: 1 }], 1800, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'beat-blink', name: 'Beat blink', how: 'transport beat', what: 'the lamp blinks on each beat while the transport plays', type: MOMENTARY,
    animations: { beatBlink: keyframes('beatBlink', { type: 'beat', every: 1 }, 'indicator', [{ at: 0, scale: 1.25, fill: 'FFFFE08A' }, { at: 1, scale: 1 }], 260, { easing: 'outQuad' }) },
  },
  {
    id: 'from-the-synth', name: 'From the synth', how: 'switched from outside', what: 'the lamp flashes when the synth switches it, not you', type: TOGGLE,
    animations: { fromSynth: keyframes('fromSynth', FROM_OUTSIDE, 'indicator', [{ at: 0, scale: 1.8, fill: 'FFFFFFFF' }, { at: 1, scale: 1 }], 600, { easing: 'outCubic' }) },
  },
];

const SWITCH = [
  {
    id: 'kick', name: 'Kick', how: 'switch', what: 'the key kicks as it goes over', type: TOGGLE,
    animations: { kick: keyframes('kick', VALUE_CHANGE, 'key', [{ at: 0, scale: 1 }, { at: 0.35, scale: 1.12 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) },
  },
  {
    id: 'key-lights', name: 'Key lights', how: 'on', what: 'the key takes the accent colour while on, eased', type: TOGGLE,
    states: { Selected: state({ checked: true }, part('key', { 'Background.Fill.colour': '{accent}' })) },
    animations: { keyLights: transition('keyLights', entering('selected'), [['Parts.key.Background.Fill.colour', 'colour']], 320, 'inOutSine') },
  },
  {
    id: 'housing-flash', name: 'Housing flash', how: 'switch', what: 'the plate it sits in flashes as it goes over', type: TOGGLE,
    animations: { housingFlash: keyframes('housingFlash', VALUE_CHANGE, 'housing', [{ at: 0, fill: 'FF8A6A48' }, { at: 1 }], 520, { easing: 'outQuad' }) },
  },
  {
    id: 'guard-glow', name: 'Guard glow', how: 'hover', what: 'the guard round the key lights as the pointer comes near', type: TOGGLE,
    states: { Hover: state({ hover: true }, part('guard', { 'Background.Fill.colour': '{accent}' })) },
    animations: { guardGlow: transition('guardGlow', entering('hover'), [['Parts.guard.Background.Fill.colour', 'colour']], 220, 'outQuad') },
  },
  {
    id: 'caption-turns', name: 'Caption turns', how: 'switch', what: 'the caption rolls over with the key', type: TOGGLE,
    animations: { captionTurns: caption('captionTurns', VALUE_CHANGE, 'roll', 'in', { duration: 360, direction: 'up' }) },
  },
];

const WORDS = [
  {
    id: 'roll-in', name: 'Roll in', how: 'panel opens', what: 'the caption rolls up into place', type: MOMENTARY,
    animations: { rollIn: caption('rollIn', ONCE_OPEN, 'roll', 'in', { duration: 700, delay: 300, direction: 'up' }) },
  },
  {
    id: 'push-on-press', name: 'Push on press', how: 'press', what: 'the caption is pushed in afresh each press', type: MOMENTARY,
    animations: { push: caption('push', enteringOnce('pressed'), 'push', 'in', { duration: 320, direction: 'right' }) },
  },
  {
    id: 'o-i-roll', name: 'O / I roll', how: 'switch', what: 'the legend\'s O and I roll up as it goes on, down as it goes off', type: TOGGLE,
    animations: {
      rollOn: words('rollOn', enteringOnce('selected'), 'legend', 'roll', 'in', { duration: 300, direction: 'up' }),
      rollOff: words('rollOff', leaving('selected'), 'legend', 'roll', 'in', { duration: 300, direction: 'down' }),
    },
  },
  {
    id: 'hover-fade', name: 'Hover fade', how: 'hover', what: 'the caption fades in again as the pointer arrives', type: MOMENTARY,
    animations: { hoverFade: caption('hoverFade', enteringOnce('hover'), 'crossfade', 'in', { duration: 420 }) },
  },
  {
    id: 'ink-flash', name: 'Ink flash', how: 'click', what: 'the caption flashes the accent colour', type: MOMENTARY,
    animations: { inkFlash: keyframes('inkFlash', gesture('click'), '', [{ at: 0, text: 'FF6EF2E8' }, { at: 1 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'wipe', name: 'Wipe', how: 'double-click', what: 'the caption is wiped on from the left', type: MOMENTARY,
    animations: { wipe: caption('wipe', gesture('doubleClick'), 'wipe', 'in', { duration: 500, direction: 'right' }) },
  },
];

const SIGNALS = [
  {
    id: 'sent', name: 'Sent', how: 'click', what: 'the lamp shows green a moment, and the caption rolls', type: MOMENTARY,
    animations: {
      sentLamp: keyframes('sentLamp', gesture('click'), 'indicator', [{ at: 0, fill: GREEN, scale: 1.2 }, { at: 0.2, fill: GREEN, scale: 1 }, { at: 0.8, fill: GREEN }, { at: 1 }], 1200, { easing: 'linear' }),
      sentWords: caption('sentWords', gesture('click'), 'roll', 'in', { duration: 320, direction: 'up' }),
    },
  },
  {
    id: 'refused', name: 'Refused', how: 'click', what: 'the key shakes its head and the lamp shows red', type: MOMENTARY,
    animations: {
      refusedShake: keyframes('refusedShake', gesture('click'), '', [{ at: 0, x: 0 }, { at: 0.2, x: -6 }, { at: 0.4, x: 5 }, { at: 0.6, x: -3 }, { at: 0.8, x: 2 }, { at: 1, x: 0 }], 380, { easing: 'linear' }),
      refusedLamp: keyframes('refusedLamp', gesture('click'), 'indicator', [{ at: 0, fill: RED }, { at: 0.8, fill: RED }, { at: 1 }], 1000, { easing: 'linear' }),
    },
  },
  {
    id: 'pending', name: 'Pending', how: 'while held', what: 'the lamp blinks amber for as long as you hold it', type: MOMENTARY,
    animations: { pending: keyframes('pending', WHILE_HELD, 'indicator', [{ at: 0, fill: AMBER, opacity: 1 }, { at: 0.5, fill: AMBER, opacity: 0.2 }, { at: 1, fill: AMBER, opacity: 1 }], 600, { easing: 'linear', ...FOREVER }) },
  },
  {
    id: 'done', name: 'Done', how: 'long press', what: 'held long enough, the lamp turns green and the key nods', type: MOMENTARY,
    animations: {
      doneLamp: keyframes('doneLamp', gesture('longPress'), 'indicator', [{ at: 0, fill: GREEN, scale: 1.4 }, { at: 0.15, fill: GREEN, scale: 1 }, { at: 0.85, fill: GREEN }, { at: 1 }], 1500, { easing: 'linear' }),
      doneNod: keyframes('doneNod', gesture('longPress'), 'key', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.08 }, { at: 1, scale: 1 }], 320, { easing: 'outQuad' }),
    },
  },
  {
    id: 'working', name: 'Working', how: 'always', what: 'the lamp pulses amber, a job under way', type: MOMENTARY,
    animations: { working: keyframes('working', ONCE_OPEN, 'indicator', [{ at: 0, fill: AMBER, opacity: 1 }, { at: 0.5, fill: AMBER, opacity: 0.35 }, { at: 1, fill: AMBER, opacity: 1 }], 900, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'alert', name: 'Alert', how: 'a script plays it', what: 'the lamp blinks red three times, as a panel calls for you', type: MOMENTARY,
    animations: { alert: keyframes('alert', { type: 'script', from: ['*'], to: [] }, 'indicator', [{ at: 0, fill: RED, opacity: 1 }, { at: 0.17, fill: RED, opacity: 0.15 }, { at: 0.33, fill: RED, opacity: 1 }, { at: 0.5, fill: RED, opacity: 0.15 }, { at: 0.67, fill: RED, opacity: 1 }, { at: 0.83, fill: RED, opacity: 0.15 }, { at: 1, fill: RED, opacity: 1 }], 1200, { easing: 'linear' }) },
  },
];

export const BUTTON_PRESETS = buildComponentPresets({
  component: 'Button',
  prefix: 'button',
  groups: BUTTON_PRESET_GROUPS,
  byGroup: { press: PRESS, attention: ATTENTION, gestures: GESTURES, light: LIGHT, switch: SWITCH, words: WORDS, signals: SIGNALS },
});

export const buttonPresetId = (slug) => `ce:button:${slug}`;
