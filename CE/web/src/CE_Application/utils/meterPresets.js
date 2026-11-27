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
 * Label that shows its value, changing (Readout). Phase 2, which needs the engine, plays on the
 * meter's own parts and on its level.
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
import { keyframes, words, value, ONCE_OPEN, gesture, buildComponentPresets } from './componentPresetKit.js';

export const METER_PRESET_GROUPS = Object.freeze([
  { id: 'attention', label: 'Attention', note: 'motion that calls the eye to the meter' },
  { id: 'needle', label: 'Needle', note: 'what the level draws, moved and handed back to the level' },
  { id: 'readout', label: 'Readout', note: 'its reading, a Label showing its value, as the level changes' },
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

export const METER_PRESETS = buildComponentPresets({
  component: 'Meter',
  prefix: 'meter',
  groups: METER_PRESET_GROUPS,
  byGroup: { attention: ATTENTION, needle: NEEDLE, readout: READOUT },
});

export const meterPresetId = (slug) => `ce:meter:${slug}`;
