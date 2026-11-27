/**
 * choicePresets.js — the Choice group's built-in animation presets: the Components showcase's fourth
 * part (docs/design/component-presets.md, The Choice group), after the Knob, the Slider and the
 * Button, in the library under Choice group.
 *
 * A choice group (RadioButtonGroup) draws its options one of five ways, the control's own style
 * (segmented, buttons, radio, LED, tabs: docs/design/choice-group.md). What moves the whole group
 * plays in every style, and that is phase 1: Attention, and Choosing, which answers a new choice. The
 * runtime gives the chosen option's place along the options as the value, so On change fires on a
 * new choice and Each step knows whether it went on or back; Lean follows that way
 * (keyframeAnimation.js `followTurn`). Phase 2, what plays on one option or travels between them,
 * needs the engine to treat the options as parts.
 *
 * Every preset is an ordinary animation preset, id `ce:choice:<name>`, applied linked and carried by
 * the panel as any other. `type` is the kind of control the showcase puts it on.
 *
 * IMPORTS ONLY THE KIT, which imports only the format: the export tools and the showcase script read
 * these under plain Node.
 */
import { keyframes, ONCE_OPEN, enteringOnce, VALUE_CHANGE, EACH_STEP, buildComponentPresets } from './componentPresetKit.js';

export const CHOICE_PRESET_GROUPS = Object.freeze([
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to the group' },
  { id: 'choosing', label: 'Choosing', note: 'the group answering a new choice' },
]);

const GROUP = 'RadioButtonGroup';
const FOREVER = { iterations: 'infinite' };

const ATTENTION = [
  {
    id: 'pulse', name: 'Pulse', how: 'always', what: 'swells and settles, again and again: "choose"', type: GROUP,
    animations: { pulse: keyframes('pulse', ONCE_OPEN, '', [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.04 }, { at: 1, scale: 1 }], 1600, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'breathe', name: 'Breathe', how: 'always', what: 'fades a little and back, slowly', type: GROUP,
    animations: { breathe: keyframes('breathe', ONCE_OPEN, '', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.55 }, { at: 1, opacity: 1 }], 2400, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'wiggle', name: 'Wiggle', how: 'hover', what: 'a small wiggle as the pointer arrives', type: GROUP,
    animations: { wiggle: keyframes('wiggle', enteringOnce('hover'), '', [{ at: 0, rotate: 0 }, { at: 0.2, rotate: -3 }, { at: 0.45, rotate: 2.5 }, { at: 0.7, rotate: -1.5 }, { at: 1, rotate: 0 }], 460, { easing: 'inOutSine' }) },
  },
  {
    id: 'beat-pulse', name: 'Beat pulse', how: 'transport beat', what: 'pulses on each beat while the transport plays', type: GROUP,
    animations: { beatPulse: keyframes('beatPulse', { type: 'beat', every: 1 }, '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.05 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) },
  },
  {
    id: 'look-here', name: 'Look here', how: 'a script plays it', what: 'jumps, as a panel says "choose one here"', type: GROUP,
    animations: { lookHere: keyframes('lookHere', { type: 'script', from: ['*'], to: [] }, '', [{ at: 0, y: 0 }, { at: 0.3, y: -10 }, { at: 0.55, y: 0 }, { at: 0.75, y: -3 }, { at: 1, y: 0 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'pop-in', name: 'Pop in', how: 'panel opens', what: 'grows in from nothing as the panel opens', type: GROUP,
    animations: { popIn: keyframes('popIn', ONCE_OPEN, '', [{ at: 0, scale: 0.2, opacity: 0 }, { at: 0.6, scale: 1.06, opacity: 1 }, { at: 1, scale: 1, opacity: 1 }], 560, { easing: 'outQuad' }) },
  },
];

const CHOOSING = [
  {
    // Each step, with the step's way: on to a later option it leans right, back to an earlier one left.
    id: 'lean', name: 'Lean', how: 'choose', what: 'leans toward the side of the option chosen, and back', type: GROUP,
    animations: { lean: keyframes('lean', EACH_STEP, '', [{ at: 0, x: 0, rotate: 0 }, { at: 0.35, x: 5, rotate: 1.5 }, { at: 0.7, x: -1, rotate: -0.4 }, { at: 1, x: 0, rotate: 0 }], 420, { easing: 'outQuad', followTurn: true }) },
  },
  {
    id: 'blink', name: 'Blink', how: 'choose', what: 'blinks once at every new choice, from the hand or from outside', type: GROUP,
    animations: { blink: keyframes('blink', VALUE_CHANGE, '', [{ at: 0, opacity: 1 }, { at: 0.35, opacity: 0.35 }, { at: 1, opacity: 1 }], 300, { easing: 'outQuad' }) },
  },
  {
    // One knock a choice, however far it went: a jump from the first option to the last is one step.
    id: 'tick', name: 'Tick', how: 'choose', what: 'a small knock at each new choice, as a detent clicks', type: GROUP,
    animations: { tick: keyframes('tick', EACH_STEP, '', [{ at: 0, y: 0, scale: 1 }, { at: 0.3, y: 2, scale: 0.985 }, { at: 1, y: 0, scale: 1 }], 160, { easing: 'outQuad' }) },
  },
];

export const CHOICE_PRESETS = buildComponentPresets({
  component: 'Choice group',
  prefix: 'choice',
  groups: CHOICE_PRESET_GROUPS,
  byGroup: { attention: ATTENTION, choosing: CHOOSING },
});

export const choicePresetId = (slug) => `ce:choice:${slug}`;
