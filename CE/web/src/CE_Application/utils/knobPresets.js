/**
 * knobPresets.js — the built-in animation presets of a knob, by what they move: the Components
 * showcase's first component (docs/design/component-presets.md).
 *
 * Each is an ordinary animation preset (animationPresetFormat.js): the library lists them under
 * Knob, Apply puts one on any knob as it puts one of yours, linked, and a panel that uses one
 * carries it. The showcase panels (CE/panels/Components/Knob/, scripts/componentPanels.js) are these
 * same presets on knobs in eight control sets, one panel a group.
 *
 * A preset never names a control or a colour of a set by value where a set has one: colours that
 * belong to the set are its tokens (`{control.fill.hot}`), which each set resolves its own way.
 * Colours that are the effect's own (a red overload, an amber flash) are written out.
 *
 * The first 39 played on what a knob already had; the rest needed the engine to learn something
 * first (the design record's phase 2): a step of the value as a trigger and the way it turned, words
 * thrown from the pointer, an odometer, a readout in the cap, and marks that fly along their own
 * line or fan in about the dial.
 *
 * IMPORTS ONLY THE FORMAT, which imports nothing: the export tools and the showcase script read this
 * under plain Node.
 */
import { PRESET_FORMAT, PRESET_FORMAT_VERSION, cleanPreset } from './animationPresetFormat.js';

/** The groups, in the order the library and the showcase show them, and what each is about. */
export const KNOB_PRESET_GROUPS = Object.freeze([
  { id: 'numbers', label: 'Numbers', note: 'the value and the name as text in motion' },
  { id: 'ticks', label: 'Ticks', note: 'the scale\'s marks, big and small, arriving in order' },
  { id: 'touch', label: 'Touch', note: 'how it answers the hand' },
  { id: 'turning', label: 'Turning', note: 'how the value moves' },
  { id: 'attention', label: 'Attention', note: 'only the drawing moves, never the value' },
  { id: 'gestures', label: 'Gestures', note: 'what a gesture plays' },
  { id: 'words', label: 'Words', note: 'text effects on its scale and readout' },
]);

// --- The shapes ----------------------------------------------------------------------------------

const POINTERS = ['pointerCurrent', 'pointerStart', 'pointerEnd'];

const transition = (name, trigger, paths, duration, easing, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'transition', trigger,
  targets: paths.map(([path, bucket]) => ({ path, properties: [bucket] })),
  duration, delay: 0, easing, ...extra,
});

const keyframes = (name, trigger, part, frames, duration, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'keyframes', trigger,
  targets: [{ path: part ? `Parts.${part}` : 'Transform' }],
  frames, duration, delay: 0, easing: 'inOutQuad', iterations: 1, direction: 'normal', ...extra,
});

/** A text effect on one of the knob's own words: its scale's numbers or ticks, or its readout. */
const words = (name, trigger, part, effect, way, settings, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'text', effect, way,
  delay: 0, easing: 'outQuad', iterations: 1, ...settings, trigger,
  targets: [{ path: `Parts.${part}` }], ...extra,
});

/** Words thrown from the pointer each time it plays (keyframeAnimation.js EMIT): the value, or the change. */
const emit = (name, trigger, settings, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'emit', trigger, targets: [],
  shows: 'value', from: 'tip', direction: 'pointer', travel: 36, size: 12,
  duration: 700, delay: 0, easing: 'outCubic', iterations: 1, ...settings, ...extra,
});

const value = (name, trigger, frames, duration, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'value', trigger,
  targets: [{ path: 'Value' }], frames, duration, delay: 0, easing: 'inOutCubic', iterations: 1, ...extra,
});

// The triggers, as the Animation tab writes them.
const ONCE_OPEN = { type: 'always' };                  // with one run: as the knob first appears
const entering = (state) => ({ type: 'stateChange', from: ['*'], to: [state], reverse: true });
const enteringOnce = (state) => ({ type: 'stateChange', from: ['*'], to: [state] });
const leaving = (state) => ({ type: 'stateChange', from: [state], to: ['*'], leaving: true });
const gesture = (event) => ({ type: 'event', event });
const WHILE_HOVER = { type: 'stateChange', to: ['hover'] };   // with a loop: for as long as it holds
// The light a shimmer runs: warm, so it shows on white ticks and on dark numbers alike.
const LIGHT = 'FFFFC24D';
const VALUE_CHANGE = { type: 'valueChange', source: 'value.normalized' };
// Each step of the value, as many as the knob has (a knob with none: one every 5%), while dragged too.
const EACH_STEP = { type: 'valueStep' };

// What the knob's readout needs to play: the readout shown, and hidden until the preset shows it.
const READOUT_HIDDEN = Object.freeze({ 'Behavior.showHandleLabels': true, 'Parts.labelCurrent.opacity': 0 });
const READOUT_SHOWN = Object.freeze({ 'Behavior.showHandleLabels': true });
// The readout in the middle of the dial rather than at the pointer's tip.
const IN_THE_CAP = Object.freeze({ 'Parts.labelCurrent.anchor': 'centre' });
const part = (name, patch) => ({ [name]: patch });
const state = (when, parts = {}, { component = {}, rule = '' } = {}) => ({ when, ...(rule ? { rule } : {}), patches: { component, parts } });

// --- The presets ---------------------------------------------------------------------------------
//
// `how` is what plays it, as the showcase captions it; `what` is one line of what you see.
// `knob` is what a knob needs set for the showcase to show it (scale numbers, a unit); a preset's
// own `fields` are what applying it sets.

/** The readout as a stamp: the word, red, larger and heavy. */
const STAMP = (word) => ({ opacity: 1, 'Text.content': word, 'Text.Fill.colour': 'FFFF4D4D', 'Text.Font.size': 16, 'Text.Font.weightValue': 800 });

const NUMBERS = [
  {
    id: 'fly-out', name: 'Fly-out', how: 'let go', what: 'the value floats up off the pointer and fades',
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
    id: 'name-value', name: 'Name ↔ value', how: 'while turning', what: 'its name pushes over to the value, and types itself back',
    on: 'label', label: { shows: 'nameValue' },
    fields: { 'Text.shows': 'nameValue' },
    animations: {
      valueIn: words('valueIn', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'push', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 320, direction: 'right' }, { targets: [{ path: 'Text' }] }),
      nameOut: words('nameOut', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'push', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 320, direction: 'right' }, { targets: [{ path: 'Text' }] }),
      valueOut: words('valueOut', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'crossfade', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 220 }, { targets: [{ path: 'Text' }] }),
      nameIn: words('nameIn', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 300, colour: 'FFFFE3E3' }, { delay: 150, targets: [{ path: 'Text' }] }),
    },
  },
  {
    // On the name Label: a reel scrambles real text, letter by letter through other glyphs. The
    // knob's own numbers are SVG, where a reel can only roll each number up into place; and a Label
    // has no hover of its own, so it decodes when the words come back to the name.
    id: 'decode', name: 'Decode', how: 'let go', what: 'the value while turning; let go, the name decodes back through glyphs',
    on: 'label', label: { shows: 'nameValue' },
    fields: { 'Text.shows': 'nameValue' },
    animations: {
      valueIn: words('valueIn', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'crossfade', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 160 }, { targets: [{ path: 'Text' }] }),
      decode: words('decode', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 70, duration: 800, spins: 7, glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?' }, { targets: [{ path: 'Text' }] }),
    },
  },
  {
    id: 'tip-label', name: 'Tip label', how: 'while turning', what: 'the value rides at the pointer\'s tip',
    fields: READOUT_HIDDEN,
    states: { Dragging: state({ dragging: true }, part('labelCurrent', { opacity: 1 })) },
    animations: {
      tipLabel: transition('tipLabel', entering('dragging'), [['Parts.labelCurrent.opacity', 'opacity']], 160, 'outCubic'),
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
    id: 'from-the-synth', name: 'From the synth', how: 'MIDI in', what: 'a value the synth sends flashes the arc; your own turns do not',
    animations: {
      fromSynth: keyframes('fromSynth', { ...VALUE_CHANGE, origin: 'external' }, 'bodyTrackFill', [
        { at: 0, fill: 'FFFFD23F', opacity: 1 },
        { at: 0.35, fill: 'FFFFD23F', opacity: 1 },
        { at: 1, opacity: 1 },
      ], 700, { easing: 'outQuad' }),
    },
  },
  {
    id: 'number-stream', name: 'Number stream', how: 'each step', what: 'every step throws its value out along the pointer',
    knob: { min: 0, max: 10, precision: 1 },
    // The words fly within the knob's own box, as its readout does: a knob wearing it wants room
    // round its dial (the showcase gives it 46 px).
    animations: { stream: emit('stream', EACH_STEP, { shows: 'value', from: 'tip', direction: 'pointer', travel: 24, size: 12, duration: 650 }) },
  },
  {
    id: 'odometer', name: 'Odometer', how: 'each step', what: 'only the digits that changed roll, the way you turned',
    knob: { min: 0, max: 100, step: 1, precision: 0 },
    fields: { ...READOUT_SHOWN, ...IN_THE_CAP },
    animations: { odometer: words('odometer', EACH_STEP, 'labelCurrent', 'odometer', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 240, direction: 'turn' }) },
  },
  {
    // The change since the last word it threw, which is the last time it was let go: how far you
    // turned it, not the size of a step.
    id: 'delta', name: 'Delta', how: 'let go', what: 'how far you turned it rises out of the dial, "+2.4", and fades',
    knob: { min: 0, max: 10, precision: 1 },
    animations: { delta: emit('delta', leaving('dragging'), { shows: 'delta', from: 'centre', direction: 'up', travel: 34, size: 18, duration: 1200 }) },
  },
  {
    // The knob's own unit, shown only while the pointer is over it: at rest a state takes it away.
    id: 'units', name: 'Units', how: 'hover', what: 'the unit rolls in after the value',
    knob: { min: 0, max: 100, step: 1, precision: 0, unit: 'ms' },
    fields: { ...READOUT_SHOWN, ...IN_THE_CAP },
    states: { Resting: state({ hover: false }, {}, { component: { 'Behavior.unit': '' } }) },
    animations: { unitIn: words('unitIn', enteringOnce('hover'), 'labelCurrent', 'odometer', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 300, direction: 'up' }) },
  },
  {
    id: 'big-number', name: 'Big number', how: 'press', what: 'the value fills the dial while you hold it',
    knob: { min: 0, max: 100, step: 1, precision: 0 },
    fields: { ...READOUT_HIDDEN, ...IN_THE_CAP },
    // The pointer steps aside while the number has the dial: the arc still shows where it is.
    states: { Pressed: state({ pressed: true }, { ...part('labelCurrent', { opacity: 1, 'Text.Font.size': 34, 'Text.Font.weightValue': 700 }), ...part('pointerCurrent', { opacity: 0 }) }) },
    animations: {
      bigNumber: transition('bigNumber', entering('pressed'), [['Parts.labelCurrent.opacity', 'opacity'], ['Parts.pointerCurrent.opacity', 'opacity']], 160, 'outQuad'),
      bigPop: keyframes('bigPop', enteringOnce('pressed'), 'labelCurrent', [{ at: 0, scale: 0.55 }, { at: 1, scale: 1 }], 240, { easing: 'outBack' }),
    },
  },
  {
    id: 'choice-names', name: 'Choice names', how: 'each step', what: 'a stepped knob: the next name pushes in the way you turned',
    knob: { min: 0, max: 4, step: 1, displayTable: ['Saw', 'Square', 'Pulse', 'Triangle', 'Sine'] },
    fields: { ...READOUT_SHOWN, ...IN_THE_CAP },
    animations: { choice: words('choice', EACH_STEP, 'labelCurrent', 'push', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 280, direction: 'turn' }) },
  },
];

const TICKS = [
  {
    id: 'big-then-small', name: 'Big, then small', how: 'panel opens', what: 'the big ticks in order, then the small ones, then the numbers',
    knob: { scaleNumberCount: 6 },
    animations: {
      bigTicks: words('bigTicks', ONCE_OPEN, 'tickMajor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 80, duration: 260, colour: 'FFFFFFFF' }, { delay: 300 }),
      smallTicks: words('smallTicks', ONCE_OPEN, 'tickMinor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 22, duration: 220, colour: 'FFFFFFFF' }, { delay: 1250 }),
      numbers: words('numbers', ONCE_OPEN, 'tickNumber', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 300, colour: 'FFFFFFFF' }, { delay: 2050 }),
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
    id: 'centre-out', name: 'Centre out', how: 'panel opens', what: 'from the top outward both ways, the big ones first',
    animations: {
      centreBig: words('centreBig', ONCE_OPEN, 'tickMajor', 'crossfade', 'in', { split: 'letter', order: 'centre', stagger: 110, duration: 300 }, { delay: 300 }),
      centreSmall: words('centreSmall', ONCE_OPEN, 'tickMinor', 'crossfade', 'in', { split: 'letter', order: 'centre', stagger: 35, duration: 260 }, { delay: 1000 }),
    },
  },
  {
    id: 'countdown', name: 'Countdown', how: 'double-click', what: 'the ticks go out from the top end down as it resets, and come back',
    animations: {
      countOut: words('countOut', gesture('doubleClick'), 'tickMajor', 'crossfade', 'out', { split: 'letter', order: 'reverse', stagger: 45, duration: 160 }),
      countOutSmall: words('countOutSmall', gesture('doubleClick'), 'tickMinor', 'crossfade', 'out', { split: 'letter', order: 'reverse', stagger: 15, duration: 140 }),
      countIn: words('countIn', gesture('doubleClick'), 'tickMajor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 220, colour: 'FFFFFFFF' }, { delay: 700 }),
      countInSmall: words('countInSmall', gesture('doubleClick'), 'tickMinor', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 15, duration: 200, colour: 'FFFFFFFF' }, { delay: 700 }),
    },
  },
  {
    id: 'ripple', name: 'Ripple', how: 'hover', what: 'a wave of light runs round the ticks',
    animations: {
      ripple: words('ripple', WHILE_HOVER, 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 500, colour: LIGHT }, { iterations: 'infinite' }),
      rippleSmall: words('rippleSmall', WHILE_HOVER, 'tickMinor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 20, duration: 500, colour: LIGHT }, { iterations: 'infinite' }),
    },
  },
  {
    id: 'burst', name: 'Burst', how: 'panel opens', what: 'each tick flies out from the centre along its own line, the big ones first',
    animations: {
      burstBig: words('burstBig', ONCE_OPEN, 'tickMajor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 560 }, { delay: 300 }),
      burstSmall: words('burstSmall', ONCE_OPEN, 'tickMinor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 12, duration: 500 }, { delay: 850 }),
    },
  },
  {
    id: 'fly-away', name: 'Fly away', how: 'double-click', what: 'the ticks fly off along their lines as it resets, and fly back',
    animations: {
      awayBig: words('awayBig', gesture('doubleClick'), 'tickMajor', 'fly', 'out', { split: 'letter', order: 'forward', stagger: 0, duration: 360 }, { easing: 'inQuad' }),
      awaySmall: words('awaySmall', gesture('doubleClick'), 'tickMinor', 'fly', 'out', { split: 'letter', order: 'forward', stagger: 0, duration: 320 }, { easing: 'inQuad' }),
      backBig: words('backBig', gesture('doubleClick'), 'tickMajor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 30, duration: 420 }, { delay: 650 }),
      backSmall: words('backSmall', gesture('doubleClick'), 'tickMinor', 'fly', 'in', { split: 'letter', order: 'forward', stagger: 8, duration: 380 }, { delay: 800 }),
    },
  },
  {
    id: 'fan-in', name: 'Fan in', how: 'panel opens', what: 'the ticks turn into place round the dial, as a fan opens',
    animations: {
      fanBig: words('fanBig', ONCE_OPEN, 'tickMajor', 'fan', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 1100 }, { delay: 300, easing: 'inOutCubic' }),
      fanSmall: words('fanSmall', ONCE_OPEN, 'tickMinor', 'fan', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 1100 }, { delay: 450, easing: 'inOutCubic' }),
    },
  },
];

const TOUCH = [
  {
    id: 'lift', name: 'Lift', how: 'hover', what: 'the cap rises toward you',
    states: { Hover: state({ hover: true }, part('bodyCap', { 'Layout.scale': 1.07 })) },
    animations: { lift: transition('lift', entering('hover'), [['Parts.bodyCap.Layout.scale', 'transform']], 160, 'outCubic') },
  },
  {
    id: 'grip', name: 'Grip', how: 'press', what: 'the cap squeezes under the finger',
    states: { Pressed: state({ pressed: true }, part('bodyCap', { 'Layout.scale': 0.93 })) },
    animations: { grip: transition('grip', entering('pressed'), [['Parts.bodyCap.Layout.scale', 'transform']], 90, 'outBack') },
  },
  {
    // Every knob already lights its arc while dragged (its own Dragging state), so the glow is what
    // that does not: the cap's rim lit in the set's hot accent, and the arc breathing with the turn.
    id: 'glow', name: 'Glow', how: 'while turning', what: 'the cap\'s rim lights and the arc breathes',
    states: { Dragging: state({ dragging: true }, part('bodyCap', { 'Background.Border.enabled': true, 'Background.Border.thickness': 2.5, 'Background.Border.colour': '{accent.hot}' })) },
    animations: {
      glow: keyframes('glow', { type: 'stateChange', to: ['dragging'] }, 'bodyTrackFill', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.5 }, { at: 1, opacity: 1 }], 720, { iterations: 'infinite' }),
    },
  },
  {
    id: 'readout', name: 'Readout', how: 'while turning', what: 'the value shows, and lingers a moment after',
    fields: READOUT_HIDDEN,
    states: { Dragging: state({ dragging: true }, part('labelCurrent', { opacity: 1 })) },
    animations: {
      readoutIn: transition('readoutIn', { ...entering('dragging'), reverse: false }, [['Parts.labelCurrent.opacity', 'opacity']], 120, 'outQuad'),
      readoutOut: transition('readoutOut', leaving('dragging'), [['Parts.labelCurrent.opacity', 'opacity']], 400, 'inOutQuad', { delay: 600 }),
    },
  },
  {
    id: 'focus-ring', name: 'Focus ring', how: 'keyboard focus', what: 'its value arc breathes while it has the keys',
    animations: {
      breathe: keyframes('breathe', { type: 'stateChange', to: ['focused'] }, 'bodyTrackFill', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.3 }, { at: 1, opacity: 1 }], 1400, { iterations: 'infinite' }),
    },
  },
  {
    id: 'sheen', name: 'Sheen', how: 'hover', what: 'a glint crosses the cap',
    animations: {
      sheen: keyframes('sheen', enteringOnce('hover'), 'bodyCap', [{ at: 0, shift: -100 }, { at: 1, shift: 100 }], 900, { easing: 'inOutQuad' }),
    },
  },
];

const POINTER_PATHS = POINTERS.flatMap((name) => [[`Parts.${name}.Layout.x`, 'transform'], [`Parts.${name}.Layout.y`, 'transform']]);
const RANGE_PATHS = [['Parts.bodyTrackFill.Layout.width', 'size'], ['Parts.bodySelectedRange.Layout.width', 'size']];

/**
 * The value's own movement: the pointer and the arc together, as a knob's two default glides
 * (pointerSlide and rangeSlide) move them. Applied, each takes the place of the glide that moves the
 * same things on the same change (animationPresetModel.js), rather than tying with it.
 */
const movement = (duration, easing) => ({
  pointerSlide: transition('pointerSlide', VALUE_CHANGE, POINTER_PATHS, duration, easing),
  rangeSlide: transition('rangeSlide', VALUE_CHANGE, RANGE_PATHS, duration, easing),
});

const TURNING = [
  { id: 'glide', name: 'Glide', how: 'turn', what: 'eases into each new value', animations: movement(320, 'outCubic') },
  { id: 'snap', name: 'Snap', how: 'turn', what: 'no easing: lands at once', animations: movement(0, 'linear') },
  { id: 'spring', name: 'Spring', how: 'turn', what: 'overshoots, then settles', animations: movement(420, 'outBack') },
  {
    id: 'overload', name: 'Overload', how: 'above 90%', what: 'the arc turns red: a state with a rule',
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
    id: 'detent', name: 'Detent', how: 'each step', what: 'the pointer pulses once a step, as a notch is felt',
    knob: { min: 0, max: 12, step: 1, precision: 0 },
    animations: { detent: keyframes('detent', EACH_STEP, 'pointerCurrent', [{ at: 0, scale: 1 }, { at: 0.3, scale: 1.45, fill: 'FFFFFFFF' }, { at: 1, scale: 1 }], 160, { easing: 'outQuad' }) },
  },
];

const ATTENTION = [
  { id: 'ring-sweep', name: 'Ring sweep', how: 'panel opens', what: 'the arc sweeps to full and back to the value', animations: { ringSweep: value('ringSweep', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }], 1500, { delay: 400 }) } },
  { id: 'rise-to-value', name: 'Rise to value', how: 'panel opens', what: 'from nothing up to the value', animations: { rise: value('rise', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 1 }], 1000, { delay: 400, easing: 'outCubic' }) } },
  { id: 'fall-to-value', name: 'Fall to value', how: 'panel opens', what: 'from full down to the value', animations: { fall: value('fall', ONCE_OPEN, [{ at: 0, value: 1 }, { at: 1 }], 1000, { delay: 400, easing: 'outCubic' }) } },
  // Played by a script or a scene: a click on a knob also sets its value, which the sweep would fight.
  { id: 'reach-full', name: 'Reach full', how: 'a script plays it', what: 'to full and back: "look here"', animations: { reachFull: value('reachFull', { type: 'script', from: ['*'], to: [] }, [{ at: 0 }, { at: 0.45, value: 1 }, { at: 1 }], 1100) } },
  { id: 'wiggle', name: 'Wiggle', how: 'hover', what: 'a small shake: "turn me"', animations: { wiggle: value('wiggle', enteringOnce('hover'), [{ at: 0 }, { at: 0.15, by: 0.07 }, { at: 0.35, by: -0.07 }, { at: 0.55, by: 0.045 }, { at: 0.75, by: -0.02 }, { at: 1 }], 700, { easing: 'inOutSine' }) } },
  { id: 'beat-pulse', name: 'Beat pulse', how: 'transport beat', what: 'pulses on each beat while the transport plays', animations: { beatPulse: keyframes('beatPulse', { type: 'beat', every: 1 }, '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.07 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) } },
];

const GESTURES = [
  {
    id: 'reset-flash', name: 'Reset flash', how: 'double-click', what: 'the pointer flashes as it goes home',
    animations: { resetFlash: keyframes('resetFlash', gesture('doubleClick'), 'pointerCurrent', [{ at: 0, fill: 'FFFFFFFF', scale: 1.25 }, { at: 0.45, fill: 'FFFFFFFF', scale: 1.1 }, { at: 1, scale: 1 }], 560, { easing: 'outQuad' }) },
  },
  {
    id: 'spin', name: 'Spin', how: 'flick', what: 'the cap spins once and settles',
    animations: { spin: keyframes('spin', gesture('flick'), 'bodyCap', [{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }], 700, { easing: 'outCubic' }) },
  },
  {
    id: 'notch', name: 'Notch', how: 'wheel', what: 'a light runs round the ticks the way you turned',
    animations: {
      notchUp: words('notchUp', gesture('wheelUp'), 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 30, duration: 300, colour: LIGHT }),
      notchDown: words('notchDown', gesture('wheelDown'), 'tickMajor', 'shimmer', 'in', { split: 'letter', order: 'reverse', stagger: 30, duration: 300, colour: LIGHT }),
    },
  },
  {
    id: 'pop', name: 'Pop', how: 'long press', what: 'the knob pops when the press is held',
    animations: { pop: keyframes('pop', gesture('longPress'), '', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.12 }, { at: 1, scale: 1 }], 320, { easing: 'outBack' }) },
  },
  {
    id: 'nudge', name: 'Nudge', how: 'click', what: 'a small wiggle on each click',
    animations: { nudge: keyframes('nudge', gesture('click'), '', [{ at: 0, rotate: 0 }, { at: 0.25, rotate: -7 }, { at: 0.5, rotate: 6 }, { at: 0.75, rotate: -3 }, { at: 1, rotate: 0 }], 380) },
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

const WORDS = [
  {
    id: 'scale-types-in', name: 'Scale types in', how: 'panel opens', what: 'the numbers typed round the dial',
    knob: { scaleNumberCount: 6 },
    animations: { typeIn: words('typeIn', ONCE_OPEN, 'tickNumber', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 140, duration: 300, colour: 'FFFFD23F' }, { delay: 400 }) },
  },
  {
    id: 'numbers-roll', name: 'Numbers roll', how: 'panel opens', what: 'each number rolls up into its place',
    knob: { scaleNumberCount: 6 },
    animations: { rollIn: words('rollIn', ONCE_OPEN, 'tickNumber', 'roll', 'in', { split: 'whole', order: 'forward', stagger: 110, duration: 360, direction: 'up' }, { delay: 400 }) },
  },
  {
    id: 'scale-counts-up', name: 'Scale counts up', how: 'panel opens', what: 'the numbers arrive low to high, each with a pop',
    knob: { scaleNumberCount: 6 },
    animations: { countUp: words('countUp', ONCE_OPEN, 'tickNumber', 'explode', 'in', { split: 'letter', order: 'forward', stagger: 160, duration: 420, scatter: 0, scale: 2.4 }, { delay: 400 }) },
  },
  {
    id: 'readout-doors', name: 'Readout doors', how: 'wheel or keys', what: 'each new value closes in like doors',
    fields: READOUT_SHOWN,
    animations: { doors: words('doors', VALUE_CHANGE, 'labelCurrent', 'part', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 420 }) },
  },
  {
    id: 'shimmer', name: 'Shimmer', how: 'hover', what: 'a light runs along the numbers',
    knob: { scaleNumberCount: 6 },
    animations: { shimmer: words('shimmer', WHILE_HOVER, 'tickNumber', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 600, colour: LIGHT }, { iterations: 'infinite' }) },
  },
];

const BY_GROUP = { numbers: NUMBERS, ticks: TICKS, touch: TOUCH, turning: TURNING, attention: ATTENTION, gestures: GESTURES, words: WORDS };

/** A built-in preset's id: one namespace a component, so none can meet one of yours (`ap_…`). */
export const knobPresetId = (id) => `ce:knob:${id}`;

/** The revision every built-in starts at; raise one's when it changes, so panels offer the update. */
const REVISION = 1;

function build(group, entry) {
  return {
    id: knobPresetId(entry.id),
    slug: entry.id,
    group: group.id,
    groupLabel: group.label,
    name: entry.name,
    how: entry.how,
    what: entry.what,
    // Where it goes on a knob: the knob itself, or its name Label (a knob has no words of its own),
    // and what that Label shows of the knob.
    on: entry.on ?? 'knob',
    label: entry.label ?? null,
    knob: entry.knob ?? {},
    preset: cleanPreset({
      format: PRESET_FORMAT,
      version: PRESET_FORMAT_VERSION,
      id: knobPresetId(entry.id),
      name: entry.name,
      category: 'Knob',
      tags: [group.label, entry.how],
      colours: 'keep',
      revision: entry.revision ?? REVISION,
      animations: entry.animations,
      states: entry.states ?? {},
      fields: entry.fields ?? {},
    }),
  };
}

/** Every knob preset: `{ id, slug, group, groupLabel, name, how, what, on, label, knob, preset }`, in order. */
export const KNOB_PRESETS = Object.freeze(KNOB_PRESET_GROUPS.flatMap((group) => BY_GROUP[group.id].map((entry) => Object.freeze(build(group, entry)))));
