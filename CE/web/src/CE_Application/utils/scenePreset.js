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
import { cleanScene, cleanClip, cleanTrigger, cleanClock, newSceneId, VALUE_TARGET } from './sceneFormat.js';
import { controlDrawsValue } from './valueDrawn.js';
import { flatControlsWithPanelRects } from './containment.js';

export const SCENE_PRESET_FORMAT = 'ceditor.scenePreset';
export const SCENE_PRESET_VERSION = 1;
/** How far apart the controls of a repeated preset start, ms, unless told otherwise. */
export const REPEAT_STAGGER = 150;
const LIMITS = { name: 60, slots: 64, clips: 400 };

const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const idOf = (control) => control?._children?.Core?.id ?? '';
const nameOf = (control) => String(control?._children?.Core?.name || idOf(control) || 'Control');
const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');
const partNamesOf = (control) => new Set(Object.keys(control?._children?.Parts?._children ?? {}));
const slotIndex = (value) => (Number.isInteger(value) && value >= 0 && value < LIMITS.slots ? value : -1);

/** What a slot's clips ask of the control that takes it. */
function needsOf(clips) {
  const parts = new Set();
  let words = false;
  let value = false;
  for (const clip of clips) {
    if (clip.target === 'Text') words = true;
    else if (clip.target === VALUE_TARGET) value = true;
    else if (String(clip.target).startsWith('Parts.')) parts.add(String(clip.target).split('.')[1]);
  }
  return { text: words, value, parts: [...parts].sort() };
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

/** A scene preset read as data from anywhere, checked, or null. */
export function cleanScenePreset(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== SCENE_PRESET_FORMAT) return null;
  if (!(Number(raw.version) >= 1)) return null;
  const id = text(raw.id, 64);
  if (!/^[A-Za-z0-9_:-]+$/.test(id)) return null;
  const slots = (Array.isArray(raw.slots) ? raw.slots : []).slice(0, LIMITS.slots).map((slot) => ({
    type: text(slot?.type, 40),
    label: text(slot?.label, LIMITS.name),
    needs: {
      text: slot?.needs?.text === true,
      value: slot?.needs?.value === true,
      parts: (Array.isArray(slot?.needs?.parts) ? slot.needs.parts : []).map((part) => text(part, 64)).filter((part) => /^[A-Za-z0-9_-]+$/.test(part)),
    },
  }));
  if (!slots.length) return null;
  // Each clip read as a scene clip would be, on a stand-in control, then given back its slot.
  const clips = [];
  for (const clip of (Array.isArray(raw.clips) ? raw.clips : []).slice(0, LIMITS.clips)) {
    const slot = slotIndex(clip?.slot);
    if (slot < 0 || slot >= slots.length) continue;
    const read = cleanClip({ ...clip, id: 'c', controlId: 'slot' });
    if (!read) continue;
    clips.push({ slot, target: read.target, start: read.start, length: read.length, effect: read.effect, ...(read.label ? { label: read.label } : {}) });
  }
  if (!clips.length) return null;
  const trigger = cleanTrigger({ ...(raw.trigger ?? {}), controlId: 'slot' });
  const triggerSlot = slotIndex(raw.trigger?.slot);
  if (trigger.controlId !== undefined) {
    delete trigger.controlId;
    if (triggerSlot < 0 || triggerSlot >= slots.length) return null;
    trigger.slot = triggerSlot;
  }
  const clockRead = cleanClock({ ...(raw.clock ?? {}), controlId: 'slot' });
  let clock = null;
  if (clockRead) {
    const clockSlot = slotIndex(raw.clock?.slot);
    if (clockSlot < 0 || clockSlot >= slots.length) return null;
    clock = { ...clockRead, slot: clockSlot };
    delete clock.controlId;
  }
  const span = clips.reduce((end, clip) => Math.max(end, clip.start + clip.length), 0);
  return {
    format: SCENE_PRESET_FORMAT,
    version: SCENE_PRESET_VERSION,
    id,
    name: text(raw.name, LIMITS.name) || 'Scene preset',
    length: Math.max(Math.round(Number(raw.length) || 0), span, 100),
    loop: raw.loop === true,
    trigger,
    ...(clock ? { clock } : {}),
    slots,
    clips,
  };
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

const builtIn = (id, name, slot, clips, trigger = { type: 'panelOpen' }, length = 1200) => cleanScenePreset({
  format: SCENE_PRESET_FORMAT, version: SCENE_PRESET_VERSION, id, name, length, loop: false, trigger, slots: [slot], clips,
});

/**
 * The presets every CEditor has: the record's own example, and its counterpart for words. Both are
 * one slot and start with the panel, so they repeat over every control that fits.
 */
export const BUILT_IN_SCENE_PRESETS = Object.freeze([
  builtIn('builtin:knobsSweepIn', 'Knobs sweep in', { type: 'Knob', label: 'a knob', needs: { value: true } },
    [{ slot: 0, target: VALUE_TARGET, start: 0, length: 1200, label: 'Ring sweep', effect: { kind: 'value', easing: 'inOutCubic', frames: [{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }] } }]),
  builtIn('builtin:labelsTypeIn', 'Labels type in', { type: 'Label', label: 'a label', needs: { text: true } },
    [{ slot: 0, target: 'Text', start: 0, length: 900, label: 'Typewriter in', effect: { kind: 'text', effect: 'typewriter', way: 'in', iterations: 1 } }], { type: 'panelOpen' }, 900),
].filter(Boolean));
