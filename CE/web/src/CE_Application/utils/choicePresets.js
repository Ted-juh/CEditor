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
 * Phase 2 plays on the options themselves, drawn as parts (choiceGroupLayout.js CHOICE_PARTS):
 * `thumb`, the chosen option's mark, travelling to the next choice (Thumb); `chosen`, the option just
 * chosen (The chosen); `option`, every option, one after another (Appear); a state's own options
 * patch for the one under the pointer and the rest (Hover); and every label when the list of options
 * changes (New options). utils/choiceGroupMotion.js and optionStagger.js say how each is drawn.
 *
 * Every preset is an ordinary animation preset, id `ce:choice:<name>`, applied linked and carried by
 * the panel as any other. `type` is the kind of control the showcase puts it on, and `knob` the
 * style it shows it in (a preset plays in every style that draws what it moves).
 *
 * IMPORTS ONLY THE KIT, which imports only the format: the export tools and the showcase script read
 * these under plain Node.
 */
import { transition, keyframes, words, ONCE_OPEN, entering, enteringOnce, VALUE_CHANGE, EACH_STEP, buildComponentPresets } from './componentPresetKit.js';

export const CHOICE_PRESET_GROUPS = Object.freeze([
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to the group' },
  { id: 'choosing', label: 'Choosing', note: 'the group answering a new choice' },
  { id: 'thumb', label: 'Thumb', note: 'the mark of the choice, travelling to the next' },
  { id: 'chosen', label: 'The chosen', note: 'the option just chosen' },
  { id: 'appear', label: 'Appear', note: 'the options arriving, one after another' },
  { id: 'hover', label: 'Hover', note: 'the option under the pointer, and the rest' },
  { id: 'new-options', label: 'New options', note: 'a list of options that changes with another choice' },
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

// --- Phase 2: the options as parts ---------------------------------------------------------------

// The thumb's two edges, as utils/choiceGroupMotion.js eases them: `Layout.x` the one ahead,
// `Layout.width` the one behind. One transition on both slides it whole.
const THUMB_AHEAD = ['Parts.thumb.Layout.x', 'transform'];
const THUMB_BEHIND = ['Parts.thumb.Layout.width', 'size'];
const STYLE = (style) => ({ 'Behavior.visualStyle': style });
const LIGHT_INK = 'FFFFF4D6';
const GOLD = 'FFF2B84B';

const THUMB = [
  {
    id: 'slide', name: 'Slide', how: 'choose', what: 'the thumb glides to the option chosen', type: GROUP, knob: STYLE('segmented'),
    animations: { thumbSlide: transition('thumbSlide', VALUE_CHANGE, [THUMB_AHEAD, THUMB_BEHIND], 260, 'outCubic') },
  },
  {
    id: 'spring', name: 'Spring', how: 'choose', what: 'the colour springs past the key chosen and settles on it', type: GROUP, knob: STYLE('buttons'),
    animations: { thumbSpring: transition('thumbSpring', VALUE_CHANGE, [THUMB_AHEAD, THUMB_BEHIND], 460, 'outBack') },
  },
  {
    // The edge ahead goes first and the one behind follows: the thumb stretches, then draws in.
    id: 'stretch', name: 'Stretch', how: 'choose', what: 'the thumb stretches toward the option chosen, then draws in after it', type: GROUP, knob: STYLE('segmented'),
    animations: {
      thumbAhead: transition('thumbAhead', VALUE_CHANGE, [THUMB_AHEAD], 180, 'outCubic'),
      thumbBehind: transition('thumbBehind', VALUE_CHANGE, [THUMB_BEHIND], 420, 'inOutCubic'),
    },
  },
  {
    id: 'underline-glide', name: 'Underline glide', how: 'choose', what: 'the underline glides along to the tab chosen', type: GROUP, knob: STYLE('tab'),
    animations: { underline: transition('underline', VALUE_CHANGE, [THUMB_AHEAD, THUMB_BEHIND], 300, 'outCubic') },
  },
  {
    id: 'dot-hop', name: 'Dot hop', how: 'choose', what: 'the dot hops out of its ring and into the next', type: GROUP, knob: STYLE('radio'),
    animations: {
      dotSlide: transition('dotSlide', VALUE_CHANGE, [THUMB_AHEAD, THUMB_BEHIND], 340, 'inOutSine'),
      dotHop: keyframes('dotHop', VALUE_CHANGE, 'thumb', [{ at: 0, y: 0, scale: 1 }, { at: 0.5, y: -9, scale: 1.3 }, { at: 1, y: 0, scale: 1 }], 340, { easing: 'inOutSine' }),
    },
  },
  {
    id: 'lamp-run', name: 'Lamp run', how: 'choose', what: 'the light runs along the lamps to the one chosen', type: GROUP, knob: STYLE('led'),
    animations: {
      lampRun: transition('lampRun', VALUE_CHANGE, [THUMB_AHEAD, THUMB_BEHIND], 420, 'inOutSine'),
      lampFlare: keyframes('lampFlare', VALUE_CHANGE, 'thumb', [{ at: 0, scale: 1 }, { at: 0.8, scale: 1 }, { at: 0.9, scale: 1.4 }, { at: 1, scale: 1 }], 520, { easing: 'outQuad' }),
    },
  },
];

const CHOSEN = [
  {
    id: 'pop', name: 'Pop', how: 'choose', what: 'the option chosen pops up and settles', type: GROUP, knob: STYLE('buttons'),
    animations: { pop: keyframes('pop', VALUE_CHANGE, 'chosen', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.14 }, { at: 1, scale: 1 }], 340, { easing: 'outQuad' }) },
  },
  {
    id: 'press-in', name: 'Press in', how: 'choose', what: 'the option chosen is pressed in and comes back', type: GROUP, knob: STYLE('buttons'),
    animations: { pressIn: keyframes('pressIn', VALUE_CHANGE, 'chosen', [{ at: 0, scale: 1, y: 0 }, { at: 0.3, scale: 0.9, y: 1 }, { at: 1, scale: 1, y: 0 }], 280, { easing: 'outQuad' }) },
  },
  {
    // A light flash on its face, which a face that paints a solid colour shows.
    id: 'glow', name: 'Glow', how: 'choose', what: 'the option chosen lights up and fades to its colour', type: GROUP, knob: STYLE('buttons'),
    animations: { glow: keyframes('glow', VALUE_CHANGE, 'chosen', [{ at: 0, scale: 1 }, { at: 0.15, fill: LIGHT_INK }, { at: 1, scale: 1 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'label-roll', name: 'Label roll', how: 'choose', what: 'the chosen option\'s word rolls up into place', type: GROUP, knob: STYLE('segmented'),
    animations: { labelRoll: words('labelRoll', VALUE_CHANGE, 'chosenLabel', 'roll', 'in', { split: 'letter', order: 'forward', stagger: 30, duration: 300, direction: 'up' }) },
  },
  {
    id: 'ink-flash', name: 'Ink flash', how: 'choose', what: 'the chosen tab\'s word flashes gold', type: GROUP, knob: STYLE('tab'),
    animations: { ink: keyframes('ink', VALUE_CHANGE, 'chosenLabel', [{ at: 0, scale: 1 }, { at: 0.2, text: GOLD }, { at: 1, scale: 1 }], 700, { easing: 'outQuad' }) },
  },
];

const APPEAR = [
  {
    id: 'cascade', name: 'Cascade', how: 'panel opens', what: 'the options come in one after another', type: GROUP, knob: STYLE('buttons'),
    animations: { cascade: keyframes('cascade', ONCE_OPEN, 'option', [{ at: 0, opacity: 0, y: 8 }, { at: 1, opacity: 1, y: 0 }], 320, { easing: 'outCubic', optionStagger: 110 }) },
  },
  {
    id: 'fan-out', name: 'Fan out', how: 'panel opens', what: 'the options open out from the one chosen', type: GROUP, knob: STYLE('buttons'),
    animations: { fanOut: keyframes('fanOut', ONCE_OPEN, 'option', [{ at: 0, opacity: 0, scale: 0.5 }, { at: 0.7, opacity: 1, scale: 1.06 }, { at: 1, opacity: 1, scale: 1 }], 380, { easing: 'outQuad', optionStagger: 140, optionOrder: 'fromChosen' }) },
  },
  {
    id: 'typewriter-labels', name: 'Typewriter labels', how: 'panel opens', what: 'each option\'s word is typed in, one option after another', type: GROUP, knob: STYLE('radio'),
    animations: { typed: words('typed', ONCE_OPEN, 'optionLabel', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 160 }, { optionStagger: 260 }) },
  },
  {
    id: 'drop-in', name: 'Drop in', how: 'panel opens', what: 'the options drop into place, the last first', type: GROUP, knob: STYLE('buttons'),
    animations: { dropIn: keyframes('dropIn', ONCE_OPEN, 'option', [{ at: 0, opacity: 0, y: -16 }, { at: 0.7, opacity: 1, y: 2 }, { at: 1, opacity: 1, y: 0 }], 420, { easing: 'outQuad', optionStagger: 90, optionOrder: 'reverse' }) },
  },
];

// An option's own state, about it alone (choiceGroupStyle.js): its motion in the options patch, all
// options alike, eased by a transition on `Parts.option` or `Parts.optionLabel`.
const optionState = (when, shared) => ({ when, patches: { component: {}, parts: {}, segments: { shared } } });

const HOVER = [
  {
    id: 'lift', name: 'Lift', how: 'hover', what: 'the option under the pointer grows toward you', type: GROUP, knob: STYLE('buttons'),
    states: { Hover: optionState({ hover: true }, { whole: { scale: 1.1 } }) },
    animations: { lift: transition('lift', entering('hover'), [['Parts.option.Layout.scale', 'transform']], 160, 'outCubic') },
  },
  {
    id: 'spotlight', name: 'Spotlight', how: 'hover', what: 'the other options dim while the pointer is on one', type: GROUP, knob: STYLE('buttons'),
    states: { Spotlight: optionState({ peerHover: true }, { whole: { opacity: 0.35 } }) },
    animations: { spotlight: transition('spotlight', entering('hover'), [['Parts.option.opacity', 'opacity']], 200, 'outQuad') },
  },
  {
    id: 'grow-label', name: 'Grow label', how: 'hover', what: 'the word under the pointer grows', type: GROUP, knob: STYLE('tab'),
    states: { Hover: optionState({ hover: true }, { label: { scale: 1.22 } }) },
    animations: { growLabel: transition('growLabel', entering('hover'), [['Parts.optionLabel.Layout.scale', 'transform']], 160, 'outCubic') },
  },
];

// When the list of options changes, each new word comes in, one option after another.
const OPTIONS_CHANGE = { type: 'optionsChange' };
const NEW_OPTIONS = [
  {
    id: 'roll-over', name: 'Roll over', how: 'options change', what: 'the new words roll up into place, one option after another', type: GROUP, knob: STYLE('segmented'),
    animations: { rollOver: words('rollOver', OPTIONS_CHANGE, 'optionLabel', 'roll', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 320, direction: 'up' }, { optionStagger: 70 }) },
  },
  {
    id: 'crossfade', name: 'Crossfade', how: 'options change', what: 'the new words fade in where the old ones were', type: GROUP, knob: STYLE('tab'),
    animations: { crossfade: words('crossfade', OPTIONS_CHANGE, 'optionLabel', 'crossfade', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 420 }) },
  },
  {
    id: 'cascade-new', name: 'Cascade the new', how: 'options change', what: 'the new options come in one after another', type: GROUP, knob: STYLE('buttons'),
    animations: { cascadeNew: keyframes('cascadeNew', OPTIONS_CHANGE, 'option', [{ at: 0, opacity: 0, scale: 0.8 }, { at: 1, opacity: 1, scale: 1 }], 300, { easing: 'outCubic', optionStagger: 80 }) },
  },
];

export const CHOICE_PRESETS = buildComponentPresets({
  component: 'Choice group',
  prefix: 'choice',
  groups: CHOICE_PRESET_GROUPS,
  byGroup: { attention: ATTENTION, choosing: CHOOSING, thumb: THUMB, chosen: CHOSEN, appear: APPEAR, hover: HOVER, 'new-options': NEW_OPTIONS },
});

export const choicePresetId = (slug) => `ce:choice:${slug}`;
