/**
 * componentPresetKit.js — what a component's built-in animation presets are written with: the
 * shapes of an animation (a transition, keyframes, a text effect, words thrown, a value effect), the
 * triggers as the Animation tab writes them, states and parts, and the catalogue a component's
 * presets are built into. The Knob's (knobPresets.js), the Slider's (sliderPresets.js) and the
 * Button's (buttonPresets.js) are each a list of these (docs/design/component-presets.md).
 *
 * IMPORTS ONLY THE FORMAT, which imports nothing: the export tools and the showcase script read the
 * presets under plain Node.
 */
import { PRESET_FORMAT, PRESET_FORMAT_VERSION, cleanPreset } from './animationPresetFormat.js';

// --- The shapes ----------------------------------------------------------------------------------

export const POINTERS = ['pointerCurrent', 'pointerStart', 'pointerEnd'];

export const transition = (name, trigger, paths, duration, easing, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'transition', trigger,
  targets: paths.map(([path, bucket]) => ({ path, properties: [bucket] })),
  duration, delay: 0, easing, ...extra,
});

export const keyframes = (name, trigger, part, frames, duration, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'keyframes', trigger,
  targets: [{ path: part ? `Parts.${part}` : 'Transform' }],
  frames, duration, delay: 0, easing: 'inOutQuad', iterations: 1, direction: 'normal', ...extra,
});

/** A text effect on one of the knob's own words: its scale's numbers or ticks, or its readout. */
export const words = (name, trigger, part, effect, way, settings, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'text', effect, way,
  delay: 0, easing: 'outQuad', iterations: 1, ...settings, trigger,
  targets: [{ path: `Parts.${part}` }], ...extra,
});

/** Words thrown from the pointer each time it plays (keyframeAnimation.js EMIT): the value, or the change. */
export const emit = (name, trigger, settings, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'emit', trigger, targets: [],
  shows: 'value', from: 'tip', direction: 'pointer', travel: 36, size: 12,
  duration: 700, delay: 0, easing: 'outCubic', iterations: 1, ...settings, ...extra,
});

export const value = (name, trigger, frames, duration, extra = {}) => ({
  _type: 'Animation', name, enabled: true, kind: 'value', trigger,
  targets: [{ path: 'Value' }], frames, duration, delay: 0, easing: 'inOutCubic', iterations: 1, ...extra,
});

// The triggers, as the Animation tab writes them.
export const ONCE_OPEN = { type: 'always' };                  // with one run: as the knob first appears
export const entering = (state) => ({ type: 'stateChange', from: ['*'], to: [state], reverse: true });
export const enteringOnce = (state) => ({ type: 'stateChange', from: ['*'], to: [state] });
export const leaving = (state) => ({ type: 'stateChange', from: [state], to: ['*'], leaving: true });
export const gesture = (event) => ({ type: 'event', event });
export const WHILE_HOVER = { type: 'stateChange', to: ['hover'] };   // with a loop: for as long as it holds
// The light a shimmer runs: warm, so it shows on white ticks and on dark numbers alike.
export const LIGHT = 'FFFFC24D';
export const VALUE_CHANGE = { type: 'valueChange', source: 'value.normalized' };
// Each step of the value, as many as the knob has (a knob with none: one every 5%), while dragged too.
export const EACH_STEP = { type: 'valueStep' };

// What the knob's readout needs to play: the readout shown, and hidden until the preset shows it.
export const READOUT_HIDDEN = Object.freeze({ 'Behavior.showHandleLabels': true, 'Parts.labelCurrent.opacity': 0 });
export const READOUT_SHOWN = Object.freeze({ 'Behavior.showHandleLabels': true });
// The readout in the middle of the dial rather than at the pointer's tip.
export const IN_THE_CAP = Object.freeze({ 'Parts.labelCurrent.anchor': 'centre' });
export const part = (name, patch) => ({ [name]: patch });
export const state = (when, parts = {}, { component = {}, rule = '' } = {}) => ({ when, ...(rule ? { rule } : {}), patches: { component, parts } });


/** The value's own two glides, as a knob's and a slider's ship them: the pointers, and the fill. */
const POINTER_PATHS = POINTERS.flatMap((name) => [[`Parts.${name}.Layout.x`, 'transform'], [`Parts.${name}.Layout.y`, 'transform']]);
const RANGE_PATHS = [['Parts.bodyTrackFill.Layout.width', 'size'], ['Parts.bodySelectedRange.Layout.width', 'size']];

/**
 * The value's own movement: the pointer and the arc or fill together, as the two default glides
 * (pointerSlide and rangeSlide) move them. Applied, each takes the place of the glide that moves the
 * same things on the same change (animationPresetModel.js), rather than tying with it.
 */
export const movement = (duration, easing) => ({
  pointerSlide: transition('pointerSlide', VALUE_CHANGE, POINTER_PATHS, duration, easing),
  rangeSlide: transition('rangeSlide', VALUE_CHANGE, RANGE_PATHS, duration, easing),
});

/** The readout as a stamp: the word, red, larger and heavy. */
export const STAMP = (word) => ({ opacity: 1, 'Text.content': word, 'Text.Fill.colour': 'FFFF4D4D', 'Text.Font.size': 16, 'Text.Font.weightValue': 800 });

/**
 * The name ↔ value swap of the owner's example, on a control's name Label (`Text.shows:
 * 'nameValue'`): the name pushed out to the right as the value pushes in, and the name typed back,
 * pale, as the value fades. A new object each time: a preset is cleaned from it.
 */
export const nameValueSwap = () => ({
  valueIn: words('valueIn', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'push', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 320, direction: 'right' }, { targets: [{ path: 'Text' }] }),
  nameOut: words('nameOut', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'push', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 320, direction: 'right' }, { targets: [{ path: 'Text' }] }),
  valueOut: words('valueOut', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'crossfade', 'out', { split: 'whole', order: 'forward', stagger: 0, duration: 220 }, { targets: [{ path: 'Text' }] }),
  nameIn: words('nameIn', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 45, duration: 300, colour: 'FFFFE3E3' }, { delay: 150, targets: [{ path: 'Text' }] }),
});

/**
 * Decode, on a control's name Label: the value while it is handled; let go, the name decodes back
 * through glyphs, as a reel scrambles real text.
 */
export const decodeSwap = () => ({
  valueIn: words('valueIn', { type: 'textChange', from: ['*'], to: ['value'] }, '', 'crossfade', 'in', { split: 'whole', order: 'forward', stagger: 0, duration: 160 }, { targets: [{ path: 'Text' }] }),
  decode: words('decode', { type: 'textChange', from: ['*'], to: ['name'] }, '', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 70, duration: 800, spins: 7, glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?' }, { targets: [{ path: 'Text' }] }),
});

/** The revision every built-in starts at; raise one's when it changes, so panels offer the update. */
const REVISION = 1;

/**
 * A component's presets as the library and the showcase read them: `{ id, slug, group, groupLabel,
 * name, how, what, on, label, knob, preset }` in the groups' order. `component` names the library's
 * heading and is each preset's category; ids are `ce:<prefix>:<slug>`, one namespace a component,
 * so none can meet one of yours (`ap_…`). `knob` on an entry is what a control needs set for the
 * showcase to show it (it predates the slider, and means the control's own settings).
 */
export function buildComponentPresets({ component, prefix, groups, byGroup }) {
  const idOf = (slug) => `ce:${prefix}:${slug}`;
  const build = (group, entry) => ({
    id: idOf(entry.id),
    slug: entry.id,
    group: group.id,
    groupLabel: group.label,
    name: entry.name,
    how: entry.how,
    what: entry.what,
    // Where it goes: the control itself, or its name Label, and what that Label shows of it.
    on: entry.on ?? 'control',
    label: entry.label ?? null,
    knob: entry.knob ?? {},
    // The kind of control the showcase puts it on, where a component has more than one (a toggle, a
    // momentary button): the showcase's, not the preset's, which fits any control it can move.
    type: entry.type ?? null,
    preset: cleanPreset({
      format: PRESET_FORMAT,
      version: PRESET_FORMAT_VERSION,
      id: idOf(entry.id),
      name: entry.name,
      category: component,
      tags: [group.label, entry.how],
      colours: 'keep',
      revision: entry.revision ?? REVISION,
      animations: entry.animations,
      states: entry.states ?? {},
      fields: entry.fields ?? {},
    }),
  });
  return Object.freeze(groups.flatMap((group) => byGroup[group.id].map((entry) => Object.freeze(build(group, entry)))));
}
