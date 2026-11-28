/**
 * sliderPresets.js — the built-in animation presets of a linear slider (a fader), by what they move:
 * the Components showcase's second component (docs/design/component-presets.md).
 *
 * The Knob's groups, read for a control that travels along a line instead of round a dial: its cap
 * is the pointer (`pointerCurrent`), its fill the arc (`bodyTrackFill`), its readout rides beside
 * the cap, and its ticks and the numbers printed with them stand along the track. Most of the Knob's
 * presets have a slider counterpart that differs only in what it is called and what it says; a few
 * are the slider's own: Unfold (the ticks slide out of one end, as a rule unfolds), Throw (the cap
 * overshoots along the track), Halo.
 *
 * Each is an ordinary animation preset: the library lists them under Slider, Apply puts one on any
 * slider (and most on a knob too, which has the same parts), linked, and a panel that uses one
 * carries it. Written with componentPresetKit.js. IMPORTS ONLY THE KIT, which imports only the
 * format: the export tools and the showcase script read this under plain Node.
 */
import {
  keyframes, transition, words, emit, value, movement, state, part, STAMP, LIGHT,
  ONCE_OPEN, entering, enteringOnce, leaving, gesture, WHILE_HOVER, VALUE_CHANGE, EACH_STEP,
  READOUT_HIDDEN, READOUT_SHOWN, buildComponentPresets, nameValueSwap, decodeSwap,
} from './componentPresetKit.js';

/** The groups, in the order the library and the showcase show them, and what each is about. */
export const SLIDER_PRESET_GROUPS = Object.freeze([
  { id: 'numbers', label: 'Numbers', note: 'the value and the name as text in motion' },
  { id: 'ticks', label: 'Ticks', note: 'the marks along the track, big and small, arriving in order' },
  { id: 'touch', label: 'Touch', note: 'how the cap answers the hand' },
  { id: 'moving', label: 'Moving', note: 'how the value travels' },
  { id: 'attention', label: 'Attention', note: 'only the drawing moves, never the value' },
  { id: 'gestures', label: 'Gestures', note: 'what a gesture plays' },
  { id: 'words', label: 'Words', note: 'text effects on the numbers along the scale and on the readout' },
]);

// `how` is what plays it, as the showcase captions it; `what` is one line of what you see. `knob`
// is what the slider needs set for the showcase to show it (the name is the kit's: a control's own
// settings); a preset's own `fields` are what applying it sets.

const NUMBERS = [
  {
    id: 'fly-out', name: 'Fly-out', how: 'let go', what: 'the value floats up off the cap and fades',
    fields: READOUT_HIDDEN,
    animations: {
      flyOut: keyframes('flyOut', leaving('dragging'), 'labelCurrent', [
        { at: 0, opacity: 1, y: 0, scale: 1 },
        { at: 0.2, opacity: 1, y: -5, scale: 1.2 },
        { at: 1, opacity: 0, y: -34, scale: 1.45 },
      ], 900, { easing: 'outQuad' }),
    },
  },
  {
    id: 'name-value', name: 'Name ↔ value', how: 'while moving', what: 'its name pushes over to the value, and types itself back',
    on: 'label', label: { shows: 'nameValue' },
    fields: { 'Text.shows': 'nameValue' },
    animations: nameValueSwap(),
  },
  {
    id: 'decode', name: 'Decode', how: 'let go', what: 'the value while moving; let go, the name decodes back through glyphs',
    on: 'label', label: { shows: 'nameValue' },
    fields: { 'Text.shows': 'nameValue' },
    animations: decodeSwap(),
  },
  {
    id: 'cap-label', name: 'Cap label', how: 'while moving', what: 'the value rides beside the cap',
    fields: READOUT_HIDDEN,
    states: { Dragging: state({ dragging: true }, part('labelCurrent', { opacity: 1 })) },
    animations: {
      capLabel: transition('capLabel', entering('dragging'), [['Parts.labelCurrent.opacity', 'opacity']], 160, 'outCubic'),
    },
  },
  {
    id: 'max-stamp', name: 'MAX stamp', how: 'at an end', what: 'MAX or MIN stamps on in red',
    fields: READOUT_HIDDEN,
    states: {
      AtMax: state({}, part('labelCurrent', STAMP('MAX')), { rule: 'valueNormalized >= 0.999' }),
      AtMin: state({}, part('labelCurrent', STAMP('MIN')), { rule: 'valueNormalized <= 0.001' }),
    },
    animations: {
      stampMax: keyframes('stampMax', enteringOnce('atmax'), 'labelCurrent', [{ at: 0, scale: 2.4, opacity: 0 }, { at: 0.6, scale: 0.92, opacity: 1 }, { at: 1, scale: 1, opacity: 1 }], 320, { easing: 'outQuad' }),
      stampMin: keyframes('stampMin', enteringOnce('atmin'), 'labelCurrent', [{ at: 0, scale: 2.4, opacity: 0 }, { at: 0.6, scale: 0.92, opacity: 1 }, { at: 1, scale: 1, opacity: 1 }], 320, { easing: 'outQuad' }),
    },
  },
  {
    id: 'from-the-synth', name: 'From the synth', how: 'MIDI in', what: 'a value the synth sends flashes the fill; your own moves do not',
    animations: {
      fromSynth: keyframes('fromSynth', { ...VALUE_CHANGE, origin: 'external' }, 'bodyTrackFill', [
        { at: 0, fill: 'FFFFD23F', opacity: 1 },
        { at: 0.35, fill: 'FFFFD23F', opacity: 1 },
        { at: 1, opacity: 1 },
      ], 700, { easing: 'outQuad' }),
    },
  },
  {
    // Out from the cap, away from the track: on a vertical fader to the side, on a horizontal one up.
    id: 'number-stream', name: 'Number stream', how: 'each step', what: 'every step throws its value out from the cap',
    knob: { min: 0, max: 10, precision: 1 },
    animations: { stream: emit('stream', EACH_STEP, { shows: 'value', from: 'tip', direction: 'pointer', travel: 24, size: 12, duration: 650 }) },
  },
  {
    id: 'odometer', name: 'Odometer', how: 'each step', what: 'only the digits that changed roll, the way you moved',
    knob: { min: 0, max: 100, step: 1, precision: 0 },
    fields: READOUT_SHOWN,
    animations: { odometer: words('odometer', EACH_STEP, 'labelCurrent', 'odometer', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 240, direction: 'turn' }) },
  },
  {
    // The change since the last word it threw, which is the last time it was let go.
    id: 'delta', name: 'Delta', how: 'let go', what: 'how far you moved it rises off the cap, "+2.4", and fades',
    knob: { min: 0, max: 10, precision: 1 },
    animations: { delta: emit('delta', leaving('dragging'), { shows: 'delta', from: 'tip', direction: 'up', travel: 30, size: 16, duration: 1200 }) },
  },
  {
    // The slider's own unit, shown only while the pointer is over it: at rest a state takes it away.
    id: 'units', name: 'Units', how: 'hover', what: 'the unit rolls in after the value',
    knob: { min: 0, max: 100, step: 1, precision: 0, unit: 'ms' },
    fields: READOUT_SHOWN,
    states: { Resting: state({ hover: false }, {}, { component: { 'Behavior.unit': '' } }) },
    animations: { unitIn: words('unitIn', enteringOnce('hover'), 'labelCurrent', 'odometer', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 300, direction: 'up' }) },
  },
  {
    id: 'big-number', name: 'Big number', how: 'press', what: 'the value, large, beside the cap while you hold it',
    knob: { min: 0, max: 100, step: 1, precision: 0 },
    fields: READOUT_HIDDEN,
    states: { Pressed: state({ pressed: true }, part('labelCurrent', { opacity: 1, 'Text.Font.size': 30, 'Text.Font.weightValue': 700 })) },
    animations: {
      bigNumber: transition('bigNumber', entering('pressed'), [['Parts.labelCurrent.opacity', 'opacity']], 160, 'outQuad'),
      bigPop: keyframes('bigPop', enteringOnce('pressed'), 'labelCurrent', [{ at: 0, scale: 0.55 }, { at: 1, scale: 1 }], 240, { easing: 'outBack' }),
    },
  },
  {
    // Rolled, not pushed: on a fader the choices go up and down, and so does the name.
    id: 'choice-names', name: 'Choice names', how: 'each step', what: 'a stepped fader: the next name rolls in the way you moved',
    knob: { min: 0, max: 4, step: 1, displayTable: ['Saw', 'Square', 'Pulse', 'Triangle', 'Sine'] },
    fields: READOUT_SHOWN,
    animations: { choice: words('choice', EACH_STEP, 'labelCurrent', 'roll', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 260, direction: 'turn' }) },
  },
];

const TICKS = [
  {
    id: 'big-then-small', name: 'Big, then small', how: 'panel opens', what: 'the big ticks in order, then the small ones',
    animations: {
      bigTicks: words('bigTicks', ONCE_OPEN, 'tickMajor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 80, duration: 260, colour: 'FFFFFFFF' }, { delay: 300 }),
      smallTicks: words('smallTicks', ONCE_OPEN, 'tickMinor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 22, duration: 220, colour: 'FFFFFFFF' }, { delay: 1250 }),
    },
  },
  {
    id: 'grow', name: 'Grow', how: 'panel opens', what: 'each tick grows in, in order, the big ones first',
    animations: {
      growBig: words('growBig', ONCE_OPEN, 'tickMajor', 'explode', 'in', { split: 'letter', order: 'forward', stagger: 70, duration: 380, scatter: 0, scale: 0.05 }, { delay: 300 }),
      growSmall: words('growSmall', ONCE_OPEN, 'tickMinor', 'explode', 'in', { split: 'letter', order: 'forward', stagger: 20, duration: 300, scatter: 0, scale: 0.05 }, { delay: 1100 }),
    },
  },
  {
    id: 'middle-out', name: 'Middle out', how: 'panel opens', what: 'from the middle of the track outward both ways, the big ones first',
    animations: {
      middleBig: words('middleBig', ONCE_OPEN, 'tickMajor', 'crossfade', 'in', { split: 'letter', order: 'centre', stagger: 110, duration: 300 }, { delay: 300 }),
      middleSmall: words('middleSmall', ONCE_OPEN, 'tickMinor', 'crossfade', 'in', { split: 'letter', order: 'centre', stagger: 35, duration: 260 }, { delay: 1000 }),
    },
  },
  {
    id: 'countdown', name: 'Countdown', how: 'double-click', what: 'the ticks go out from the top down as it resets, and come back',
    animations: {
      countOut: words('countOut', gesture('doubleClick'), 'tickMajor', 'crossfade', 'out', { split: 'letter', order: 'reverse', stagger: 45, duration: 160 }),
      countOutSmall: words('countOutSmall', gesture('doubleClick'), 'tickMinor', 'crossfade', 'out', { split: 'letter', order: 'reverse', stagger: 15, duration: 140 }),
      countIn: words('countIn', gesture('doubleClick'), 'tickMajor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 220, colour: 'FFFFFFFF' }, { delay: 700 }),
      countInSmall: words('countInSmall', gesture('doubleClick'), 'tickMinor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 15, duration: 200, colour: 'FFFFFFFF' }, { delay: 700 }),
    },
  },
  {
    id: 'ripple', name: 'Ripple', how: 'hover', what: 'a wave of light runs up the ticks',
    animations: {
      ripple: words('ripple', WHILE_HOVER, 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 500, colour: LIGHT }, { iterations: 'infinite' }),
      rippleSmall: words('rippleSmall', WHILE_HOVER, 'tickMinor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 20, duration: 500, colour: LIGHT }, { iterations: 'infinite' }),
    },
  },
  {
    id: 'burst', name: 'Burst', how: 'panel opens', what: 'each tick flies out of the track into place, the big ones first',
    animations: {
      burstBig: words('burstBig', ONCE_OPEN, 'tickMajor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 560 }, { delay: 300 }),
      burstSmall: words('burstSmall', ONCE_OPEN, 'tickMinor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 12, duration: 500 }, { delay: 850 }),
    },
  },
  {
    id: 'fly-away', name: 'Fly away', how: 'double-click', what: 'the ticks fly off the track as it resets, and fly back',
    animations: {
      awayBig: words('awayBig', gesture('doubleClick'), 'tickMajor', 'fly', 'out', { split: 'letter', order: 'forward', stagger: 0, duration: 360 }, { easing: 'inQuad' }),
      awaySmall: words('awaySmall', gesture('doubleClick'), 'tickMinor', 'fly', 'out', { split: 'letter', order: 'forward', stagger: 0, duration: 320 }, { easing: 'inQuad' }),
      backBig: words('backBig', gesture('doubleClick'), 'tickMajor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 30, duration: 420 }, { delay: 650 }),
      backSmall: words('backSmall', gesture('doubleClick'), 'tickMinor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 8, duration: 380 }, { delay: 800 }),
    },
  },
  {
    // A fan on a line: every tick starts at the first one and slides up the track into place.
    id: 'unfold', name: 'Unfold', how: 'panel opens', what: 'the ticks slide up out of the bottom one, as a folding rule opens',
    animations: {
      unfoldBig: words('unfoldBig', ONCE_OPEN, 'tickMajor', 'fan', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 1000 }, { delay: 300, easing: 'inOutCubic' }),
      unfoldSmall: words('unfoldSmall', ONCE_OPEN, 'tickMinor', 'fan', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 1000 }, { delay: 450, easing: 'inOutCubic' }),
    },
  },
];

const TOUCH = [
  {
    id: 'lift', name: 'Lift', how: 'hover', what: 'the cap grows toward you',
    // Layout.lift, not Layout.scale: a slider's own states patch its cap's scale, and never drew it.
    // At rest 1, which the preset sets: a cap with a lift is the one the renderer lifts.
    fields: { 'Parts.pointerCurrent.Layout.lift': 1 },
    states: { Hover: state({ hover: true }, part('pointerCurrent', { 'Layout.lift': 1.12 })) },
    animations: { lift: transition('lift', entering('hover'), [['Parts.pointerCurrent.Layout.lift', 'transform']], 160, 'outCubic') },
  },
  {
    id: 'grip', name: 'Grip', how: 'press', what: 'the cap squeezes under the finger',
    fields: { 'Parts.pointerCurrent.Layout.lift': 1 },
    states: { Pressed: state({ pressed: true }, part('pointerCurrent', { 'Layout.lift': 0.9 })) },
    animations: { grip: transition('grip', entering('pressed'), [['Parts.pointerCurrent.Layout.lift', 'transform']], 90, 'outBack') },
  },
  {
    // A slider already lights its fill while dragged (its own Dragging state), as a knob its arc.
    id: 'glow', name: 'Glow', how: 'while moving', what: 'the fill breathes while the cap is held',
    animations: {
      glow: keyframes('glow', { type: 'stateChange', to: ['dragging'] }, 'bodyTrackFill', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.5 }, { at: 1, opacity: 1 }], 720, { iterations: 'infinite' }),
    },
  },
  {
    id: 'readout', name: 'Readout', how: 'while moving', what: 'the value shows, and lingers a moment after',
    fields: READOUT_HIDDEN,
    states: { Dragging: state({ dragging: true }, part('labelCurrent', { opacity: 1 })) },
    animations: {
      readoutIn: transition('readoutIn', { ...entering('dragging'), reverse: false }, [['Parts.labelCurrent.opacity', 'opacity']], 120, 'outQuad'),
      readoutOut: transition('readoutOut', leaving('dragging'), [['Parts.labelCurrent.opacity', 'opacity']], 400, 'inOutQuad', { delay: 600 }),
    },
  },
  {
    id: 'focus-ring', name: 'Focus ring', how: 'keyboard focus', what: 'its fill breathes while it has the keys',
    animations: {
      breathe: keyframes('breathe', { type: 'stateChange', to: ['focused'] }, 'bodyTrackFill', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.3 }, { at: 1, opacity: 1 }], 1400, { iterations: 'infinite' }),
    },
  },
  {
    id: 'nod', name: 'Nod', how: 'hover', what: 'the cap nods once when the pointer arrives',
    animations: {
      nod: keyframes('nod', enteringOnce('hover'), 'pointerCurrent', [{ at: 0, scale: 1 }, { at: 0.35, scale: 1.18 }, { at: 0.7, scale: 0.96 }, { at: 1, scale: 1 }], 420, { easing: 'outQuad' }),
    },
  },
];

const MOVING = [
  { id: 'glide', name: 'Glide', how: 'move', what: 'eases into each new value', animations: movement(320, 'outCubic') },
  { id: 'snap', name: 'Snap', how: 'move', what: 'no easing: lands at once', animations: movement(0, 'linear') },
  { id: 'spring', name: 'Spring', how: 'move', what: 'overshoots, then settles', animations: movement(420, 'outBack') },
  {
    id: 'overload', name: 'Overload', how: 'above 90%', what: 'the fill turns red: a state with a rule',
    states: { Overload: state({}, part('bodyTrackFill', { 'Background.Fill.colour': 'FFFF3B30' }), { rule: 'valueNormalized > 0.9' }) },
    animations: { overload: transition('overload', entering('overload'), [['Parts.bodyTrackFill.Background.Fill.colour', 'colour']], 220, 'outQuad') },
  },
  {
    id: 'modulated', name: 'Modulated', how: 'always', what: 'the drawing wobbles round the value, as if an LFO were on it',
    animations: {
      modulated: value('modulated', { type: 'always' }, [{ at: 0, by: 0 }, { at: 0.25, by: 0.06 }, { at: 0.75, by: -0.06 }, { at: 1, by: 0 }], 1800, { easing: 'inOutSine', iterations: 'infinite' }),
    },
  },
  {
    id: 'detent', name: 'Detent', how: 'each step', what: 'the cap pulses once a step, as a notch is felt',
    knob: { min: 0, max: 12, step: 1, precision: 0 },
    animations: { detent: keyframes('detent', EACH_STEP, 'pointerCurrent', [{ at: 0, scale: 1 }, { at: 0.3, scale: 1.25 }, { at: 1, scale: 1 }], 160, { easing: 'outQuad' }) },
  },
];

const ATTENTION = [
  { id: 'fill-sweep', name: 'Fill sweep', how: 'panel opens', what: 'the fill sweeps to full and back to the value', animations: { fillSweep: value('fillSweep', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }], 1500, { delay: 400 }) } },
  { id: 'rise-to-value', name: 'Rise to value', how: 'panel opens', what: 'from nothing up to the value', animations: { rise: value('rise', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 1 }], 1000, { delay: 400, easing: 'outCubic' }) } },
  { id: 'fall-to-value', name: 'Fall to value', how: 'panel opens', what: 'from full down to the value', animations: { fall: value('fall', ONCE_OPEN, [{ at: 0, value: 1 }, { at: 1 }], 1000, { delay: 400, easing: 'outCubic' }) } },
  // Played by a script or a scene: a click on a slider also sets its value, which the sweep would fight.
  { id: 'reach-full', name: 'Reach full', how: 'a script plays it', what: 'to full and back: "look here"', animations: { reachFull: value('reachFull', { type: 'script', from: ['*'], to: [] }, [{ at: 0 }, { at: 0.45, value: 1 }, { at: 1 }], 1100) } },
  { id: 'wiggle', name: 'Wiggle', how: 'hover', what: 'a small shake of the cap: "move me"', animations: { wiggle: value('wiggle', enteringOnce('hover'), [{ at: 0 }, { at: 0.15, by: 0.07 }, { at: 0.35, by: -0.07 }, { at: 0.55, by: 0.045 }, { at: 0.75, by: -0.02 }, { at: 1 }], 700, { easing: 'inOutSine' }) } },
  { id: 'beat-pulse', name: 'Beat pulse', how: 'transport beat', what: 'pulses on each beat while the transport plays', animations: { beatPulse: keyframes('beatPulse', { type: 'beat', every: 1 }, '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.05 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) } },
];

const GESTURES = [
  {
    id: 'reset-flash', name: 'Reset flash', how: 'double-click', what: 'the cap flashes as it goes home',
    animations: { resetFlash: keyframes('resetFlash', gesture('doubleClick'), 'pointerCurrent', [{ at: 0, fill: 'FFFFFFFF', scale: 1.25 }, { at: 0.45, fill: 'FFFFFFFF', scale: 1.1 }, { at: 1, scale: 1 }], 560, { easing: 'outQuad' }) },
  },
  {
    // A value effect, so only the drawing overshoots: the value is where the flick left it.
    id: 'throw', name: 'Throw', how: 'flick', what: 'the cap overshoots along the track and settles back',
    animations: { throw: value('throw', gesture('flick'), [{ at: 0 }, { at: 0.3, by: 0.12 }, { at: 0.6, by: -0.04 }, { at: 0.8, by: 0.015 }, { at: 1 }], 800, { easing: 'outQuad' }) },
  },
  {
    id: 'notch', name: 'Notch', how: 'wheel', what: 'a light runs along the ticks the way you scrolled',
    animations: {
      notchUp: words('notchUp', gesture('wheelUp'), 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 30, duration: 300, colour: LIGHT }),
      notchDown: words('notchDown', gesture('wheelDown'), 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'reverse', stagger: 30, duration: 300, colour: LIGHT }),
    },
  },
  {
    id: 'pop', name: 'Pop', how: 'long press', what: 'the slider pops when the press is held',
    animations: { pop: keyframes('pop', gesture('longPress'), '', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.08 }, { at: 1, scale: 1 }], 320, { easing: 'outBack' }) },
  },
  {
    id: 'nudge', name: 'Nudge', how: 'click', what: 'a small shake on each click',
    animations: { nudge: keyframes('nudge', gesture('click'), '', [{ at: 0, x: 0 }, { at: 0.25, x: -4 }, { at: 0.5, x: 3 }, { at: 0.75, x: -2 }, { at: 1, x: 0 }], 340) },
  },
  {
    id: 'default-stamp', name: 'Default stamp', how: 'double-click', what: 'the default value stamps on as it resets',
    fields: READOUT_HIDDEN,
    animations: {
      defaultStamp: keyframes('defaultStamp', gesture('doubleClick'), 'labelCurrent', [
        { at: 0, opacity: 0, scale: 2.4 }, { at: 0.15, opacity: 1, scale: 0.95 }, { at: 0.22, opacity: 1, scale: 1 },
        { at: 0.8, opacity: 1, scale: 1 }, { at: 1, opacity: 0, scale: 1 },
      ], 1400, { easing: 'linear' }),
    },
  },
];

// The numbers a slider prints along its scale are its big ticks' (Behavior.tickNumerals 'value').
const NUMBERED = Object.freeze({ showTicks: true, tickNumerals: 'value' });

const WORDS = [
  {
    id: 'scale-types-in', name: 'Scale types in', how: 'panel opens', what: 'the numbers typed up the scale',
    knob: NUMBERED,
    animations: { typeIn: words('typeIn', ONCE_OPEN, 'tickMajor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 140, duration: 300, colour: 'FFFFD23F' }, { delay: 400 }) },
  },
  {
    id: 'numbers-roll', name: 'Numbers roll', how: 'panel opens', what: 'each number rolls up into its place',
    knob: NUMBERED,
    animations: { rollIn: words('rollIn', ONCE_OPEN, 'tickMajor', 'roll', 'in', { split: 'whole', order: 'forward', stagger: 110, duration: 360, direction: 'up' }, { delay: 400 }) },
  },
  {
    id: 'scale-counts-up', name: 'Scale counts up', how: 'panel opens', what: 'the numbers arrive low to high, each with a pop',
    knob: NUMBERED,
    animations: { countUp: words('countUp', ONCE_OPEN, 'tickMajor', 'explode', 'in', { split: 'letter', order: 'forward', stagger: 160, duration: 420, scatter: 0, scale: 2.4 }, { delay: 400 }) },
  },
  {
    id: 'readout-doors', name: 'Readout doors', how: 'wheel or keys', what: 'each new value closes in like doors',
    fields: READOUT_SHOWN,
    animations: { doors: words('doors', VALUE_CHANGE, 'labelCurrent', 'part', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 420 }) },
  },
  {
    id: 'shimmer', name: 'Shimmer', how: 'hover', what: 'a light runs up the numbers',
    knob: NUMBERED,
    animations: { shimmer: words('shimmer', WHILE_HOVER, 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 600, colour: LIGHT }, { iterations: 'infinite' }) },
  },
];

const BY_GROUP = { numbers: NUMBERS, ticks: TICKS, touch: TOUCH, moving: MOVING, attention: ATTENTION, gestures: GESTURES, words: WORDS };

/** A built-in slider preset's id. */
export const sliderPresetId = (id) => `ce:slider:${id}`;

/** Every slider preset: `{ id, slug, group, groupLabel, name, how, what, on, label, knob, preset }`, in order. */
export const SLIDER_PRESETS = buildComponentPresets({ component: 'Slider', prefix: 'slider', groups: SLIDER_PRESET_GROUPS, byGroup: BY_GROUP });
