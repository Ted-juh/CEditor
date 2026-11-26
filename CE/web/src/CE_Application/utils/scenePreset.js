/**
 * scenePreset.js — a whole scene kept to use again (the Animation Designer; docs/design/animation-
 * designer.md, "Presets": the third size, a scene over several controls — "a ring sweep over any
 * knobs, 0.15 s apart").
 *
 * A scene names its controls by id, and a preset is for any panel, so a preset names SLOTS instead:
 * one per control the scene used, in the order they first play, each with what the control was
 * (its type and name, for choosing) and what its clips need of whichever control takes the slot —
 * words for a text effect, a value for a value effect, the parts a clip plays on. The trigger's and
 * the clock's control are slots too.
 *
 * It goes back on a panel two ways:
 *   - mapped: each slot to a control that fits (`defaultMapping` offers one, same type first);
 *   - repeated: a preset of one slot, on every control that fits, each a little after the last —
 *     the sweep over every knob. Only a preset no control starts or drives can be repeated: a hover
 *     on which knob would start them all?
 *
 * Pure: the library is stores/scenePresetLibrary.js, the buttons the Designer's.
 */
import { cleanScene, cleanClip, newSceneId, patternPlace, VALUE_TARGET } from './sceneFormat.js';
import { SCENE_PRESET_FORMAT, SCENE_PRESET_VERSION, cleanScenePreset } from './scenePresetFormat.js';

// The format (reading, checking, writing a preset and its file) imports nothing beyond the scene
// format, so a panel can read the presets it carries where only plain Node runs (panelModel.js).
export { SCENE_PRESET_FORMAT, SCENE_PRESET_VERSION, cleanScenePreset, scenePresetFileText, readScenePresetFile } from './scenePresetFormat.js';
import { controlDrawsValue } from './valueDrawn.js';
import { flatControlsWithPanelRects } from './containment.js';

/** How far apart the controls of a repeated preset start, ms, unless told otherwise. */
export const REPEAT_STAGGER = 150;

const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const idOf = (control) => control?._children?.Core?.id ?? '';
const nameOf = (control) => String(control?._children?.Core?.name || idOf(control) || 'Control');
const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');
const partNamesOf = (control) => new Set(Object.keys(control?._children?.Parts?._children ?? {}));

/** What a slot's clips ask of the control that takes it. */
function needsOf(clips) {
  const parts = new Set();
  const patterns = new Set();
  let words = false;
  let value = false;
  for (const clip of clips) {
    if (clip.target === 'Text') words = true;
    else if (clip.target === VALUE_TARGET) value = true;
    else if (patternPlace(clip.target)) {
      // A pattern by its name; a part's as `part.name`, and the part with it.
      const { part, name } = patternPlace(clip.target);
      if (part) parts.add(part);
      patterns.add(part ? `${part}.${name}` : name);
    } else if (String(clip.target).startsWith('Parts.')) parts.add(String(clip.target).split('.')[1]);
  }
  return { text: words, value, parts: [...parts].sort(), patterns: [...patterns].sort() };
}

/**
 * A scene as a preset: `{ format, version, id, name, length, loop, trigger, clock?, slots, clips }`.
 * `controls` is the panel's, to say what each slot was. Null when the scene has no clips.
 */
export function buildScenePreset(scene, controls, { id = newSceneId('sp'), name = '' } = {}) {
  const clips = [...(scene?.clips ?? [])].sort((a, b) => a.start - b.start);
  if (!clips.length) return null;
  const byId = new Map((controls ?? []).length ? flatControlsWithPanelRects(controls).map((control) => [idOf(control), control]) : []);
  const order = [];
  const slotFor = (controlId) => {
    if (!controlId) return -1;
    if (!order.includes(controlId)) order.push(controlId);
    return order.indexOf(controlId);
  };
  const presetClips = clips.map((clip) => ({
    slot: slotFor(clip.controlId),
    target: clip.target,
    start: clip.start,
    length: clip.length,
    effect: deepCopy(clip.effect),
    ...(clip.label ? { label: clip.label } : {}),
  }));
  const trigger = { ...scene.trigger };
  if (trigger.controlId) { trigger.slot = slotFor(trigger.controlId); delete trigger.controlId; }
  let clock = null;
  if (scene.clock) { clock = { ...scene.clock, slot: slotFor(scene.clock.controlId) }; delete clock.controlId; }
  const slots = order.map((controlId, index) => {
    const control = byId.get(controlId);
    return {
      type: control ? typeOf(control) : '',
      label: control ? nameOf(control) : controlId,
      needs: needsOf(presetClips.filter((clip) => clip.slot === index)),
    };
  });
  return cleanScenePreset({
    format: SCENE_PRESET_FORMAT, version: SCENE_PRESET_VERSION, id, name: name || scene.name,
    length: scene.length, loop: scene.loop === true, trigger, ...(clock ? { clock } : {}), slots, clips: presetClips,
  });
}


/** Why a control cannot take a slot, or '' when it can. Its type need not match: what it has must. */
export function slotDoesNotFit(slot, control) {
  if (!control?._children?.Core) return 'Choose a control.';
  const name = nameOf(control);
  if (slot.needs?.value && !controlDrawsValue(control)) return `${name} draws no value for its value effect.`;
  if (slot.needs?.text && !control._children.Text) return `${name} has no words of its own for its text effect.`;
  const parts = partNamesOf(control);
  const missing = (slot.needs?.parts ?? []).filter((part) => !parts.has(part));
  if (missing.length) return `${name} has no ${missing.length > 1 ? 'parts' : 'part'} ${missing.join(', ')}.`;
  // Its own patterns by name, and its parts' as `part.name`, as needsOf writes them.
  const patternsOf = (node) => Object.keys(node?._children?.Background?._children?.Patterns?._children ?? {});
  const patterns = new Set([
    ...patternsOf(control),
    ...Object.entries(control?._children?.Parts?._children ?? {}).flatMap(([part, node]) => patternsOf(node).map((pattern) => `${part}.${pattern}`)),
  ]);
  const noPattern = (slot.needs?.patterns ?? []).filter((pattern) => !patterns.has(pattern));
  if (noPattern.length) return `${name} has no pattern ${noPattern.map((pattern) => pattern.replace('.', ' › ')).join(', ')} for its pattern clip.`;
  return '';
}

/** The panel's controls in reading order — top to bottom, then left to right — with where they are. */
function readingOrder(controls) {
  return flatControlsWithPanelRects(controls ?? [])
    .map((control, index) => ({ control, index, x: Number(control._children.Transform.x) || 0, y: Number(control._children.Transform.y) || 0 }))
    .sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x) || a.index - b.index)
    .map((entry) => entry.control);
}

/** The controls that can take a slot, those of its own type first, each in reading order. */
export function candidatesFor(slot, controls) {
  const fitting = readingOrder(controls).filter((control) => !slotDoesNotFit(slot, control));
  return [...fitting.filter((control) => typeOf(control) === slot.type), ...fitting.filter((control) => typeOf(control) !== slot.type)];
}

/** A control for each slot, as an id ('' where none fits): its own type first, no control twice. */
export function defaultMapping(preset, controls) {
  const used = new Set();
  return (preset?.slots ?? []).map((slot) => {
    const pick = candidatesFor(slot, controls).find((control) => !used.has(idOf(control)));
    if (!pick) return '';
    used.add(idOf(pick));
    return idOf(pick);
  });
}

/** Whether a preset can be repeated over every control that fits: one slot, and nothing on a control starts or drives it. */
export function canRepeat(preset) {
  return preset?.slots?.length === 1 && preset.trigger?.slot === undefined && !preset.clock;
}

/** The scene's trigger and clock, with their slots made controls. */
function placed(preset, mapping) {
  const trigger = { ...preset.trigger };
  if (trigger.slot !== undefined) { trigger.controlId = mapping[trigger.slot]; delete trigger.slot; }
  let clock = null;
  if (preset.clock) { clock = { ...preset.clock, controlId: mapping[preset.clock.slot] }; delete clock.slot; }
  return { trigger, clock };
}

/**
 * A new scene from a preset, each slot on the control `mapping` names (by index). `{ scene }`, or
 * `{ reason }` when a slot has no control or one that does not fit.
 */
export function sceneFromPreset(preset, mapping, controls, { id = newSceneId('sc'), name = '' } = {}) {
  if (!preset) return { reason: 'No preset.' };
  const byId = new Map(flatControlsWithPanelRects(controls ?? []).map((control) => [idOf(control), control]));
  for (const [index, slot] of preset.slots.entries()) {
    const control = byId.get(mapping?.[index]);
    if (!control) return { reason: `Choose a control for ${slot.label || `part ${index + 1}`}.` };
    const reason = slotDoesNotFit(slot, control);
    if (reason) return { reason };
  }
  const { trigger, clock } = placed(preset, mapping);
  const scene = cleanScene({
    id, name: name || preset.name, trigger, length: preset.length, loop: preset.loop, ...(clock ? { clock } : {}),
    clips: preset.clips.map((clip) => ({ ...deepCopy(clip), id: newSceneId('cl'), controlId: mapping[clip.slot] })),
  });
  return scene ? { scene } : { reason: 'That preset made no scene here.' };
}

/**
 * A preset of one slot on every control that fits, in reading order, each `stagger` ms after the
 * last: `{ scene, controls }` (how many), or `{ reason }`.
 */
export function repeatedScene(preset, controls, { stagger = REPEAT_STAGGER, id = newSceneId('sc'), name = '' } = {}) {
  if (!canRepeat(preset)) return { reason: 'Only a preset of one control, which nothing on a control starts, repeats over many.' };
  const slot = preset.slots[0];
  const takers = candidatesFor(slot, controls);
  if (!takers.length) return { reason: `Nothing on this panel can take it: ${slot.needs.value ? 'it wants a knob, a slider, a Macro or a meter' : slot.needs.text ? 'it wants a control with words of its own' : 'no control fits'}.` };
  const gap = Math.max(0, Math.round(Number(stagger) || 0));
  const clips = takers.flatMap((control, index) => preset.clips.map((clip) => ({
    ...deepCopy(clip), id: newSceneId('cl'), controlId: idOf(control), start: clip.start + index * gap,
  })));
  const scene = cleanScene({
    id, name: name || preset.name, trigger: { ...preset.trigger }, loop: preset.loop,
    length: preset.length + (takers.length - 1) * gap, clips,
  });
  return scene ? { scene, controls: takers.length } : { reason: 'That preset made no scene here.' };
}

const builtIn = (id, name, slot, clips, trigger = { type: 'panelOpen' }, length = 1200, loop = false) => cleanScenePreset({
  format: SCENE_PRESET_FORMAT, version: SCENE_PRESET_VERSION, id, name, length, loop, trigger, slots: [slot], clips,
});

/**
 * The presets every CEditor has: the record's own example, its counterpart for words, and a wiggle
 * that runs along a row of knobs over and over (the Components showcase's Together panel). Each is
 * one slot and starts with the panel, so it repeats over every control that fits.
 */
export const BUILT_IN_SCENE_PRESETS = Object.freeze([
  builtIn('builtin:knobsSweepIn', 'Knobs sweep in', { type: 'Knob', label: 'a knob', needs: { value: true } },
    [{ slot: 0, target: VALUE_TARGET, start: 0, length: 1200, label: 'Ring sweep', effect: { kind: 'value', easing: 'inOutCubic', frames: [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }] } }]),
  builtIn('builtin:labelsTypeIn', 'Labels type in', { type: 'Label', label: 'a label', needs: { text: true } },
    [{ slot: 0, target: 'Text', start: 0, length: 900, label: 'Typewriter in', effect: { kind: 'text', effect: 'typewriter', way: 'in', iterations: 1 } }], { type: 'panelOpen' }, 900),
  builtIn('builtin:knobsWave', 'Knobs wave', { type: 'Knob', label: 'a knob', needs: { value: true } },
    [{ slot: 0, target: VALUE_TARGET, start: 400, length: 700, label: 'Wiggle', effect: { kind: 'value', easing: 'inOutSine', iterations: 1, frames: [{ at: 0 }, { at: 0.15, by: 0.08 }, { at: 0.35, by: -0.08 }, { at: 0.55, by: 0.05 }, { at: 0.75, by: -0.02 }, { at: 1 }] } }],
    { type: 'panelOpen' }, 2600, true),
].filter(Boolean));
