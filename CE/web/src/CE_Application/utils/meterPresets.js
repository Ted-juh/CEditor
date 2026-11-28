/**
 * meterPresets.js — the Meter's built-in animation presets: the Components showcase's fifth part
 * (docs/design/component-presets.md, The Meter), after the Knob, the Slider, the Button and the
 * Choice group, in the library under Meter.
 *
 * A meter shows a level that arrives from somewhere else (a binding, a route, a script, another
 * control: Meter.valueSourceId), and each control set draws it its own way (a needle, a row of
 * lamps, a ruler, a bar: models/meterDeviceParts.js). Phase 1 is what plays on a meter today, in
 * every set: the whole meter moving (Attention), what its level draws moved and handed back
 * (Needle, value effects: the reading and what it sends stay as they are), and its reading, a
 * Label that shows its value, changing (Readout). Phase 2 plays on the meter's own parts (Parts),
 * on its level as it clips or crosses a line (Level), on how its needle moves (Ballistics: settings,
 * not animations) and on every lamp of a row (Segments).
 *
 * A meter has no States, so nothing here waits for the pointer to be over it: what a hand plays, a
 * click or a double-click plays (utils/gestureEvents.js).
 *
 * Every preset is an ordinary animation preset, id `ce:meter:<name>`, applied linked and carried by
 * the panel as any other. `on: 'label'` puts it on the meter's reading, a Label showing its value.
 *
 * IMPORTS ONLY THE KIT, which imports only the format: the export tools and the showcase script read
 * these under plain Node.
 */
import { keyframes, words, value, emit, ONCE_OPEN, gesture, buildComponentPresets, LIGHT } from './componentPresetKit.js';

export const METER_PRESET_GROUPS = Object.freeze([
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to the meter' },
  { id: 'needle', label: 'Needle', note: 'what the level draws, moved and handed back to the level' },
  { id: 'readout', label: 'Readout', note: 'its reading, a Label showing its value, as the level changes' },
  { id: 'parts', label: 'Parts', note: 'its own parts: clip lamp, face, needle, glass and scale' },
  { id: 'level', label: 'Level', note: 'as the level clips or crosses a line: heard, never sent' },
  { id: 'ballistics', label: 'Ballistics', note: 'how the needle gets to each new level; the reading does not wait' },
  { id: 'segments', label: 'Segments', note: 'every lamp of a row, one after another' },
]);

const METER = 'Meter';
const FOREVER = { iterations: 'infinite' };
const SCRIPT = { type: 'script', from: ['*'], to: [] };
const BEAT = { type: 'beat', every: 1 };
// A reading that changes: every new value the Label shows.
const NEW_READING = { type: 'textChange', from: ['*'], to: ['*'] };
const ON_THE_READING = { targets: [{ path: 'Text' }] };
const READING = { on: 'label', label: { shows: 'value' }, fields: { 'Text.shows': 'value' } };

const ATTENTION = [
  {
    id: 'pulse', name: 'Pulse', how: 'always', what: 'swells and settles, again and again', type: METER,
    animations: { pulse: keyframes('pulse', ONCE_OPEN, '', [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.04 }, { at: 1, scale: 1 }], 1600, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'breathe', name: 'Breathe', how: 'always', what: 'fades a little and back, slowly', type: METER,
    animations: { breathe: keyframes('breathe', ONCE_OPEN, '', [{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.55 }, { at: 1, opacity: 1 }], 2400, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'knock', name: 'Knock', how: 'click', what: 'a knock on the glass: it rocks and settles', type: METER,
    animations: { knock: keyframes('knock', gesture('click'), '', [{ at: 0, rotate: 0 }, { at: 0.18, rotate: -2.5 }, { at: 0.42, rotate: 2 }, { at: 0.66, rotate: -1 }, { at: 1, rotate: 0 }], 520, { easing: 'inOutSine' }) },
  },
  {
    id: 'beat-pulse', name: 'Beat pulse', how: 'transport beat', what: 'pulses on each beat while the transport plays', type: METER,
    animations: { beatPulse: keyframes('beatPulse', BEAT, '', [{ at: 0, scale: 1 }, { at: 0.2, scale: 1.05 }, { at: 1, scale: 1 }], 280, { easing: 'outQuad' }) },
  },
  {
    id: 'look-here', name: 'Look here', how: 'a script plays it', what: 'jumps, as a panel says "watch this"', type: METER,
    animations: { lookHere: keyframes('lookHere', SCRIPT, '', [{ at: 0, y: 0 }, { at: 0.3, y: -10 }, { at: 0.55, y: 0 }, { at: 0.75, y: -3 }, { at: 1, y: 0 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'pop-in', name: 'Pop in', how: 'panel opens', what: 'grows in from nothing as the panel opens', type: METER,
    animations: { popIn: keyframes('popIn', ONCE_OPEN, '', [{ at: 0, scale: 0.2, opacity: 0 }, { at: 0.6, scale: 1.06, opacity: 1 }, { at: 1, scale: 1, opacity: 1 }], 560, { easing: 'outQuad' }) },
  },
];

// What the level draws, moved and handed back: frames are the level itself (`value`), so far from
// it (`by`), or the level (no key). The reading and what the meter reports stay the level.
const NEEDLE = [
  {
    id: 'self-test', name: 'Self-test', how: 'panel opens', what: 'sweeps to full scale and back, as a meter does at power-on', type: METER,
    animations: { selfTest: value('selfTest', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 0.5, value: 1 }, { at: 1 }], 1600, { delay: 300, easing: 'inOutCubic' }) },
  },
  {
    id: 'wake-up', name: 'Wake up', how: 'panel opens', what: 'rises from nothing to the level', type: METER,
    animations: { wakeUp: value('wakeUp', ONCE_OPEN, [{ at: 0, value: 0 }, { at: 1 }], 1200, { delay: 300, easing: 'outCubic' }) },
  },
  {
    id: 'beat-kick', name: 'Beat kick', how: 'transport beat', what: 'kicks up on each beat and falls back to the level', type: METER,
    animations: { beatKick: value('beatKick', BEAT, [{ at: 0 }, { at: 0.12, by: 0.22 }, { at: 1 }], 460, { easing: 'outQuad' }) },
  },
  {
    id: 'tap-sweep', name: 'Tap sweep', how: 'click', what: 'a click sweeps it to full and back', type: METER,
    animations: { tapSweep: value('tapSweep', gesture('click'), [{ at: 0 }, { at: 0.45, value: 1 }, { at: 1 }], 900, { easing: 'inOutSine' }) },
  },
  {
    id: 'shiver', name: 'Shiver', how: 'always', what: 'trembles about the level, as a live needle does', type: METER,
    animations: { shiver: value('shiver', ONCE_OPEN, [{ at: 0 }, { at: 0.2, by: 0.03 }, { at: 0.4, by: -0.02 }, { at: 0.6, by: 0.025 }, { at: 0.8, by: -0.03 }, { at: 1 }], 900, { easing: 'inOutSine', ...FOREVER }) },
  },
  {
    id: 'drop-out', name: 'Drop out', how: 'double-click', what: 'falls to nothing and climbs back to the level', type: METER,
    animations: { dropOut: value('dropOut', gesture('doubleClick'), [{ at: 0 }, { at: 0.3, value: 0 }, { at: 1 }], 1100, { easing: 'inOutCubic' }) },
  },
];

// On the meter's reading: a Label showing its value, which changes as the level does.
const READOUT = [
  {
    id: 'odometer', name: 'Odometer', how: 'new reading', what: 'only the digits that changed roll', ...READING,
    animations: { odometer: words('odometer', NEW_READING, '', 'odometer', 'in', { split: 'letter', order: 'forward', stagger: 0, duration: 260, direction: 'up' }, ON_THE_READING) },
  },
  {
    id: 'reel', name: 'Reel', how: 'new reading', what: 'each new reading spins in through other digits', ...READING,
    animations: { reel: words('reel', NEW_READING, '', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 40, duration: 420, glyphs: '0123456789' }, ON_THE_READING) },
  },
  {
    id: 'roll', name: 'Roll', how: 'new reading', what: 'the new reading rolls up into place, whole', ...READING,
    animations: { roll: words('roll', NEW_READING, '', 'roll', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 300, direction: 'up' }, ON_THE_READING) },
  },
  {
    id: 'push', name: 'Push', how: 'new reading', what: 'the new reading pushes the last one out', ...READING,
    animations: {
      pushIn: words('pushIn', NEW_READING, '', 'push', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 280, direction: 'left' }, ON_THE_READING),
      pushOut: words('pushOut', NEW_READING, '', 'push', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 280, direction: 'left' }, ON_THE_READING),
    },
  },
  {
    id: 'crossfade', name: 'Crossfade', how: 'new reading', what: 'the new reading fades in over the last', ...READING,
    animations: {
      fadeIn: words('fadeIn', NEW_READING, '', 'crossfade', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 360 }, ON_THE_READING),
      fadeOut: words('fadeOut', NEW_READING, '', 'crossfade', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 360 }, ON_THE_READING),
    },
  },
];

// --- Phase 2: what plays on a meter's own parts and on its level ---------------------------------

// As the level reaches where the meter clips (its clip lamp's level, its top zone, or full scale), and
// as it crosses a line of its own. The level is heard, never sent (utils/keyframeAnimation.js).
const CLIP = { type: 'clip' };
const crossing = (at, way = 'up') => ({ type: 'level', at, way });
const HOT = 'FFFF3B30';
const WHITE_HOT = 'FFFFF4DC';
const RED_HOT = 'FFFF1F1F';

// On its own parts (models/meterDeviceParts.js), as a set draws them: a VU's face, scale, needle and
// glass, and the clip lamp no set draws, which Lamp flash turns on.
const PARTS = [
  {
    id: 'lamp-flash', name: 'Lamp flash', how: 'as it clips', what: 'its clip lamp, turned on, flares as the level clips', type: METER,
    fields: { 'Parts.lamp.visible': true },
    animations: { lampFlash: keyframes('lampFlash', CLIP, 'lamp', [{ at: 0, scale: 1 }, { at: 0.15, scale: 1.6, fill: WHITE_HOT }, { at: 0.45, scale: 1.15, fill: HOT }, { at: 1, scale: 1 }], 650, { easing: 'outQuad' }) },
  },
  {
    id: 'face-glow', name: 'Face glow', how: 'level past 70%', what: 'the dial face warms as the level climbs past 70%', type: METER,
    animations: { faceGlow: keyframes('faceGlow', crossing(0.7), 'face', [{ at: 0.3, fill: 'FFFFE2A0' }], 1400, { easing: 'inOutSine' }) },
  },
  {
    // Red-hot rather than white-hot: a white needle all but vanishes on a light face (Anodised's).
    id: 'needle-glow', name: 'Needle glow', how: 'level past 85%', what: 'the needle burns red-hot as the level goes past 85%', type: METER,
    animations: { needleGlow: keyframes('needleGlow', crossing(0.85), 'indicator', [{ at: 0.2, fill: RED_HOT }], 900, { easing: 'outQuad' }) },
  },
  {
    id: 'cover-glint', name: 'Cover glint', how: 'click', what: 'a tap, and its cover (a needle\'s hub, a glass) catches the light', type: METER,
    animations: { coverGlint: keyframes('coverGlint', gesture('click'), 'cover', [{ at: 0, opacity: 1 }, { at: 0.3, fill: 'FFFFFFFF', opacity: 0.85 }, { at: 1, opacity: 1 }], 700, { easing: 'outQuad' }) },
  },
  {
    id: 'scale-light-up', name: 'Scale light-up', how: 'panel opens', what: 'its marks and numbers light up as the panel opens, then settle', type: METER,
    animations: { scaleLightUp: keyframes('scaleLightUp', ONCE_OPEN, 'scale', [{ at: 0.3, fill: LIGHT }], 1600, { delay: 300, easing: 'inOutSine', iterations: 1 }) },
  },
];

// On its level: as it clips, or crosses a line. The meter as a whole, its lamps, its case.
const LEVEL = [
  {
    id: 'clip-flash', name: 'Clip flash', how: 'as it clips', what: 'its lamps flash white-hot as the level clips', type: METER,
    animations: { clipFlash: keyframes('clipFlash', CLIP, 'indicator', [{ at: 0.12, fill: WHITE_HOT }], 500, { easing: 'outQuad' }) },
  },
  {
    id: 'clip-shake', name: 'Clip shake', how: 'as it clips', what: 'the meter shudders as the level clips', type: METER,
    animations: { clipShake: keyframes('clipShake', CLIP, '', [{ at: 0, x: 0 }, { at: 0.15, x: -4 }, { at: 0.35, x: 4 }, { at: 0.55, x: -3 }, { at: 0.75, x: 2 }, { at: 1, x: 0 }], 420, { easing: 'linear' }) },
  },
  {
    id: 'red-wash', name: 'Red wash', how: 'as it clips', what: 'its case washes red and fades back', type: METER,
    animations: { redWash: keyframes('redWash', CLIP, 'housing', [{ at: 0.15, fill: 'FFB3261E' }], 1000, { easing: 'outQuad' }) },
  },
  {
    id: 'peak-flare', name: 'Peak flare', how: 'level past 80%', what: 'the meter swells as the level goes past 80%', type: METER,
    animations: { peakFlare: keyframes('peakFlare', crossing(0.8), '', [{ at: 0, scale: 1 }, { at: 0.25, scale: 1.06 }, { at: 1, scale: 1 }], 520, { easing: 'outQuad' }) },
  },
  {
    id: 'over-thrown', name: '"OVER" thrown', how: 'as it clips', what: '"OVER" rises from the meter as the level clips', type: METER,
    animations: { over: emit('over', CLIP, { shows: 'words', words: 'OVER', from: 'centre', direction: 'up', travel: 34, size: 14, colour: 'FFFF6A5E', duration: 900 }) },
  },
];

// How the needle gets to each new level (utils/meterMotion.js): settings, not animations. The reading,
// what a Label shows and what its animations hear stay the level as it arrives.
const ballistics = (rise, fall, overshoot) => ({ 'Meter.riseTime': rise, 'Meter.fallTime': fall, 'Meter.overshoot': overshoot });
const BALLISTICS = [
  {
    id: 'vu', name: 'VU', how: 'its needle', what: 'reaches each level in 300 ms and swings a little past it first, as a VU meter does', type: METER,
    fields: ballistics(300, 300, 0.015), animations: {},
  },
  {
    id: 'ppm', name: 'PPM', how: 'its needle', what: 'leaps up at once and sinks back slowly, as a peak programme meter does', type: METER,
    fields: ballistics(10, 1700, 0), animations: {},
  },
  {
    id: 'bouncy', name: 'Bouncy', how: 'its needle', what: 'springs past each new level and bounces back to it', type: METER,
    fields: ballistics(180, 260, 0.25), animations: {},
  },
  {
    id: 'lazy', name: 'Lazy', how: 'its needle', what: 'takes its time, as a heavy needle would', type: METER,
    fields: ballistics(900, 1400, 0), animations: {},
  },
  {
    id: 'sticky-peak', name: 'Sticky peak', how: 'its needle', what: 'catches each peak at once and lets go of it over four seconds', type: METER,
    fields: ballistics(15, 4000, 0), animations: {},
  },
];

// On every lamp of a row (models/meterDeviceParts.js METER_CELL_PART), one after another
// (utils/optionStagger.js), and on the peak lamp.
const SEGMENTS = [
  {
    id: 'cascade', name: 'Cascade', how: 'panel opens', what: 'its lamps come on one after another as the panel opens', type: METER,
    animations: { cascade: keyframes('cascade', ONCE_OPEN, 'cell', [{ at: 0, opacity: 0, scale: 0.4 }, { at: 1, opacity: 1, scale: 1 }], 280, { delay: 300, easing: 'outQuad', iterations: 1, optionStagger: 80, optionOrder: 'forward' }) },
  },
  {
    id: 'ripple', name: 'Ripple', how: 'as it clips', what: 'a ripple runs out from the level along the row as it clips', type: METER,
    animations: { ripple: keyframes('ripple', CLIP, 'cell', [{ at: 0, scale: 1 }, { at: 0.4, scale: 1.45, opacity: 0.6 }, { at: 1, scale: 1, opacity: 1 }], 380, { easing: 'outQuad', optionStagger: 45, optionOrder: 'fromChosen' }) },
  },
  {
    id: 'sparkle', name: 'Sparkle', how: 'always', what: 'its lamps twinkle, now one, now another', type: METER,
    animations: { sparkle: keyframes('sparkle', ONCE_OPEN, 'cell', [{ at: 0, opacity: 1 }, { at: 0.08, opacity: 0.2 }, { at: 0.16, opacity: 1 }, { at: 1, opacity: 1 }], 1800, { easing: 'linear', ...FOREVER, optionStagger: 210, optionOrder: 'scattered' }) },
  },
  {
    // No set's marker shows the held peak: this makes it the peak lamp, as Lamp flash turns its lamp on.
    id: 'peak-drop', name: 'Peak drop', how: 'level falls back', what: 'its marker holds the peak, and drops away as the level falls back under 80%', type: METER,
    fields: { 'Parts.marker.source': 'peak' },
    animations: { peakDrop: keyframes('peakDrop', crossing(0.8, 'down'), 'marker', [{ at: 0, y: 0, opacity: 1 }, { at: 0.55, y: 8, opacity: 0.15 }, { at: 1, y: 0, opacity: 1 }], 750, { easing: 'inOutQuad' }) },
  },
];

export const METER_PRESETS = buildComponentPresets({
  component: 'Meter',
  prefix: 'meter',
  groups: METER_PRESET_GROUPS,
  byGroup: { attention: ATTENTION, needle: NEEDLE, readout: READOUT, parts: PARTS, level: LEVEL, ballistics: BALLISTICS, segments: SEGMENTS },
});

export const meterPresetId = (slug) => `ce:meter:${slug}`;
