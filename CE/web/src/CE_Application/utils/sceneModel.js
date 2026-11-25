/**
 * sceneModel.js — what a scene is to the Animation Designer, and how it plays (step 5;
 * docs/design/animation-designer.md). The data and its checking are sceneFormat.js.
 *
 * TWO KINDS OF SCENE, ONE TIMELINE. A panel scene (`panel.scenes`) is clips on any controls on one
 * time axis. A control's own keyframe animations and text effects are listed as scenes too — the
 * owner's "separate AND as a scene": one animation, two views, never a copy. Retiming one of those
 * in the timeline writes the animation itself (its delay and its duration).
 *
 * HOW A SCENE PLAYS. Each clip is turned into an animation node (`clipAnimation`) that the keyframe
 * and text players already read, with the clip's start as its delay, and `sceneControlOutput` gives
 * one control what those players give it — the animations for each part, the colour channels, the
 * text effects and their @keyframes — which CanvasControl adds to its own. Played, every clip starts
 * at the scene's start and waits its delay; posed (`at`, the playhead), each is paused at that
 * moment. A clip holds its first frame before it starts and its last after (fill `both`), so a
 * control that fades in at 1.2 s is not seen before it.
 */
import { newSceneId, cleanClip, cleanScene, SCENE_MAX_LENGTH, VALUE_TARGET } from './sceneFormat.js';
import {
  readKeyframes, animationValue, keyframesRule, channelFrames, colourAnimationValue, colourKeyframesRule,
  COLOUR_CHANNELS, GRADIENT_CHANNEL,
} from './keyframeAnimation.js';
import { readTextEffect, textEffectRules, TEXT_EFFECTS, TEXT_EFFECT_NAMES } from './textEffects.js';
import { flatControls } from './containment.js';
import { partPlace } from './targetPaths.js';

const CHANNELS = [...Object.keys(COLOUR_CHANNELS), GRADIENT_CHANNEL];
const deepCopy = (value) => JSON.parse(JSON.stringify(value));

// --- The library's effects ------------------------------------------------------------------------

const keyframesEffect = (frames, extra = {}) => ({ kind: 'keyframes', easing: 'outCubic', iterations: 1, direction: 'normal', frames, ...extra });
// What a knob's or slider's value draws (step 6, valueDrawn.js). Each ends on the live value: the
// effect hands back to it.
const valueEffect = (frames, easing = 'inOutCubic') => ({ kind: 'value', easing, frames });

/**
 * What the library offers to drop on a track: each text effect in and out, and moves and paint as
 * keyframes. `category` is the library's filter; `target` where it goes when dropped on a control.
 */
export const SCENE_EFFECTS = Object.freeze([
  ...TEXT_EFFECT_NAMES.flatMap((name) => ['in', 'out'].map((way) => ({
    id: `text:${name}:${way}`,
    label: `${TEXT_EFFECTS[name].label} ${way}`,
    category: ['push', 'roll', 'wipe', 'crossfade'].includes(name) ? 'Swap' : 'Text',
    target: 'Text',
    length: 900,
    effect: { kind: 'text', effect: name, way, iterations: 1 },
  }))),
  { id: 'move:fadeIn', label: 'Fade in', category: 'Move', target: 'Transform', length: 500, effect: keyframesEffect([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }]) },
  { id: 'move:fadeOut', label: 'Fade out', category: 'Move', target: 'Transform', length: 500, effect: keyframesEffect([{ at: 0, opacity: 1 }, { at: 1, opacity: 0 }]) },
  { id: 'move:rise', label: 'Rise in', category: 'Move', target: 'Transform', length: 600, effect: keyframesEffect([{ at: 0, y: 16, opacity: 0 }, { at: 1, y: 0, opacity: 1 }]) },
  { id: 'move:pop', label: 'Pop', category: 'Move', target: 'Transform', length: 400, effect: keyframesEffect([{ at: 0, scale: 0.6, opacity: 0 }, { at: 0.7, scale: 1.08, opacity: 1 }, { at: 1, scale: 1 }], { easing: 'outQuad' }) },
  { id: 'move:pulse', label: 'Pulse', category: 'Move', target: 'Transform', length: 500, effect: keyframesEffect([{ at: 0, scale: 1 }, { at: 0.5, scale: 1.08 }, { at: 1, scale: 1 }], { easing: 'inOutQuad' }) },
  { id: 'move:spin', label: 'Spin', category: 'Move', target: 'Transform', length: 800, effect: keyframesEffect([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }], { easing: 'inOutQuad' }) },
  { id: 'paint:sheen', label: 'Gradient sheen', category: 'Paint', target: 'Transform', length: 1600, effect: keyframesEffect([{ at: 0, shift: -100 }, { at: 1, shift: 100 }], { easing: 'linear' }) },
  { id: 'paint:turn', label: 'Gradient turn', category: 'Paint', target: 'Transform', length: 2000, effect: keyframesEffect([{ at: 0, turn: 0 }, { at: 1, turn: 360 }], { easing: 'linear' }) },
  { id: 'paint:flash', label: 'Colour flash', category: 'Paint', target: 'Transform', length: 400, effect: keyframesEffect([{ at: 0, fill: 'FFFFFFFF' }, { at: 1 }], { easing: 'outQuad' }) },
  { id: 'value:sweep', label: 'Ring sweep', category: 'Value', target: VALUE_TARGET, length: 1200, effect: valueEffect([{ at: 0, value: 0 }, { at: 0.55, value: 1 }, { at: 1 }]) },
  { id: 'value:rise', label: 'Rise to value', category: 'Value', target: VALUE_TARGET, length: 800, effect: valueEffect([{ at: 0, value: 0 }, { at: 1 }], 'outCubic') },
  { id: 'value:fall', label: 'Fall to value', category: 'Value', target: VALUE_TARGET, length: 800, effect: valueEffect([{ at: 0, value: 1 }, { at: 1 }], 'outCubic') },
  { id: 'value:reach', label: 'Reach full and back', category: 'Value', target: VALUE_TARGET, length: 900, effect: valueEffect([{ at: 0 }, { at: 0.45, value: 1 }, { at: 1 }]) },
  { id: 'value:wiggle', label: 'Wiggle', category: 'Value', target: VALUE_TARGET, length: 700, effect: valueEffect([{ at: 0 }, { at: 0.2, by: 0.06 }, { at: 0.4, by: -0.05 }, { at: 0.6, by: 0.03 }, { at: 0.8, by: -0.015 }, { at: 1 }], 'inOutQuad') },
]);
export const SCENE_EFFECT_CATEGORIES = Object.freeze(['All', 'Text', 'Swap', 'Move', 'Paint', 'Value', 'Mine']);
const EFFECT_BY_ID = new Map(SCENE_EFFECTS.map((entry) => [entry.id, entry]));

/** A library effect by id. */
export const sceneEffect = (id) => EFFECT_BY_ID.get(id) ?? null;

/**
 * A clip effect from one of your animation presets (animationPresetModel.js): its first keyframe or
 * text animation, without the trigger, targets and timing a clip gives it. Null for anything else.
 */
export function effectFromPreset(preset) {
  const node = Object.values(preset?.animations ?? {}).find((entry) => ['keyframes', 'text'].includes(String(entry?.kind)));
  if (!node) return null;
  const { _type, name, trigger, targets, delay, enabled, preset: _link, ...effect } = deepCopy(node);
  return { effect, length: Math.max(100, Number(node.duration) || 600), target: String(targets?.[0]?.path ?? (effect.kind === 'text' ? 'Text' : 'Transform')) };
}

// --- Scenes and clips -----------------------------------------------------------------------------

/** A new panel scene. */
export function newScene(name = 'Scene', trigger = { type: 'panelOpen' }, { id = newSceneId('sc') } = {}) {
  return cleanScene({ id, name, trigger, length: 2400, loop: false, clips: [] });
}

/** A new clip on a control's place, from a library effect or an effect of your own. */
export function newClip({ controlId, target, start = 0, length = 600, effect, label = '' }, { id = newSceneId('cl') } = {}) {
  return cleanClip({ id, controlId, target, start, length, effect, label });
}

/** The scene with `fn` applied to one clip; `fn` returns the new clip, or null to remove it. */
function withClip(scene, clipId, fn) {
  const clips = scene.clips.map((clip) => (clip.id === clipId ? fn(clip) : clip)).filter(Boolean);
  return cleanScene({ ...scene, clips });
}

/** A time snapped to the grid, kept to the scene. */
export function snapTime(time, snap = 10) {
  const step = Math.max(1, Number(snap) || 1);
  return Math.min(SCENE_MAX_LENGTH, Math.max(0, Math.round(Number(time) / step) * step));
}

export const addClip = (scene, clip) => cleanScene({ ...scene, clips: [...scene.clips, clip] });
export const removeClip = (scene, clipId) => withClip(scene, clipId, () => null);
export const moveClip = (scene, clipId, start, snap = 10) => withClip(scene, clipId, (clip) => ({ ...clip, start: snapTime(start, snap) }));
export const resizeClip = (scene, clipId, length, snap = 10) => withClip(scene, clipId, (clip) => ({ ...clip, length: Math.max(10, snapTime(length, snap)) }));
export const setClipEffect = (scene, clipId, patch) => withClip(scene, clipId, (clip) => ({ ...clip, effect: { ...clip.effect, ...patch } }));
export const setClipTarget = (scene, clipId, target) => withClip(scene, clipId, (clip) => ({ ...clip, target }));

/** A copy of a clip, a moment later, with an id of its own: Alt+drag. */
export function duplicateClip(scene, clipId, start, snap = 10) {
  const clip = scene.clips.find((entry) => entry.id === clipId);
  if (!clip) return scene;
  return addClip(scene, { ...deepCopy(clip), id: newSceneId('cl'), start: snapTime(start, snap) });
}

/** Where on a control, as the timeline names it. */
export function targetLabel(target) {
  if (target === 'Transform') return 'Whole control';
  if (target === VALUE_TARGET) return 'What the value draws';
  if (target === 'Text') return 'Text';
  const part = String(target).split('.')[1] ?? '';
  const place = partPlace(part);
  return place.group ? `${place.group} › ${place.label}` : place.label;
}

const nameOf = (control) => String(control?._children?.Core?.name || control?._children?.Core?.id || 'Control');
const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');

/**
 * A scene's tracks: its clips grouped by control and place, in the panel's order of controls.
 * `[{ key, controlId, control, controlType, target, label, clips }]`. A clip whose control is gone
 * is kept on a track that says so, rather than dropped behind the author's back.
 */
export function tracksOf(scene, controls) {
  const order = new Map(flatControls(controls ?? []).map((control, index) => [control?._children?.Core?.id, { index, control }]));
  const tracks = new Map();
  for (const clip of scene?.clips ?? []) {
    const key = `${clip.controlId}|${clip.target}`;
    if (!tracks.has(key)) {
      const found = order.get(clip.controlId);
      tracks.set(key, {
        key,
        controlId: clip.controlId,
        control: found ? nameOf(found.control) : `${clip.controlId} (not on this panel)`,
        controlType: found ? typeOf(found.control) : '',
        missing: !found,
        target: clip.target,
        label: targetLabel(clip.target),
        order: found ? found.index : Infinity,
        clips: [],
      });
    }
    tracks.get(key).clips.push(clip);
  }
  return [...tracks.values()].sort((a, b) => a.order - b.order || a.target.localeCompare(b.target))
    .map((track) => ({ ...track, clips: [...track.clips].sort((a, b) => a.start - b.start) }));
}

/**
 * The controls' own animations, as scenes: each keyframe animation and text effect, one clip at its
 * delay for its duration. `{ id: 'own:<control>:<name>', own: true, controlId, animation, … }`.
 */
export function controlScenes(controls) {
  const out = [];
  for (const control of flatControls(controls ?? [])) {
    const controlId = control?._children?.Core?.id;
    const section = control?._children?.Animations;
    if (!controlId || !section) continue;
    for (const [name, node] of Object.entries(section._children ?? {})) {
      const kind = String(node?.kind ?? 'transition');
      if (kind !== 'keyframes' && kind !== 'text') continue;
      const target = String(node.targets?.[0]?.path ?? (kind === 'text' ? 'Text' : 'Transform'));
      const start = Math.max(0, Number(node.delay) || 0);
      const length = Math.max(10, Number(node.duration) || 600);
      const { _type, name: _name, trigger, targets, delay, duration, preset, ...effect } = deepCopy(node);
      out.push({
        id: `own:${controlId}:${name}`,
        own: true,
        controlId,
        animation: name,
        name: `${nameOf(control)} · ${name}`,
        trigger: node.trigger ?? { type: 'script' },
        length: Math.max(start + length, 1000),
        loop: node.iterations === 'infinite',
        clips: [{ id: `own:${name}`, controlId, target: target.startsWith('Parts.') ? `Parts.${target.split('.')[1]}` : (target === 'Text' ? 'Text' : 'Transform'), start, length, effect: { ...effect, ...(kind === 'text' ? { duration } : {}) } }],
      });
    }
  }
  return out;
}

/** The patch a control's own animation takes when its clip is retimed: its delay and duration. */
export function ownClipPatch(scene, clip) {
  const patch = { [`Animations.${scene.animation}.delay`]: clip.start };
  if (clip.effect?.kind !== 'text') patch[`Animations.${scene.animation}.duration`] = clip.length;
  return patch;
}

// --- Playing --------------------------------------------------------------------------------------

/** A clip as the animation node the keyframe and text players read, its start as its delay. */
export function clipAnimation(clip) {
  const node = {
    ...deepCopy(clip.effect),
    _type: 'Animation',
    name: clip.id,
    enabled: true,
    trigger: { type: 'script' },
    targets: [{ path: clip.target }],
    delay: clip.start,
    iterations: clip.effect?.iterations ?? 1,
  };
  if (clip.effect?.kind !== 'text') node.duration = clip.length;
  return node;
}

const partOf = (target) => (String(target).startsWith('Parts.') ? String(target).split('.')[1] : '');

/**
 * What one control draws of a scene: `{ parts, colours, texts, rules }` as the keyframe player gives
 * it, or null when the scene has nothing on it. `at` (ms) poses every clip at that moment, paused;
 * without it the clips play from the moment this is applied. `phase` restarts a played scene.
 */
export function sceneControlOutput(scene, controlId, { at = null, phase = 'a' } = {}) {
  const clips = (scene?.clips ?? []).filter((clip) => clip.controlId === controlId);
  if (!clips.length) return null;
  const parts = new Map();
  const colours = new Map();
  const texts = new Map();
  const rules = [];
  const options = { at: Number.isFinite(at) ? at : null, fill: 'both' };
  for (const clip of clips) {
    // What the value draws is not CSS: valueDrawn.js works it out a frame at a time.
    if (clip.effect.kind === 'value') continue;
    const node = clipAnimation(clip);
    const part = partOf(clip.target);
    if (clip.effect.kind === 'text') {
      const effect = readTextEffect(node, clip.id);
      if (!effect) continue;
      const list = texts.get(part) ?? [];
      list.push({ name: clip.id, effect, phase, trigger: node.trigger, at: options.at });
      texts.set(part, list);
      rules.push(textEffectRules(effect, { phase }));
      continue;
    }
    const entry = readKeyframes(node, clip.id);
    if (!entry) continue;
    if (entry.moves) {
      const list = parts.get(part) ?? [];
      list.push(animationValue(entry, phase, options));
      parts.set(part, list);
      rules.push(keyframesRule(entry, phase));
    }
    for (const channel of CHANNELS) {
      if (!channelFrames(entry, channel).length) continue;
      const lists = colours.get(part) ?? { paint: [], shape: [], stroke: [], text: [], gradient: [] };
      lists[channel].push(colourAnimationValue(entry, channel, phase, options));
      colours.set(part, lists);
      rules.push(colourKeyframesRule(entry, channel, phase));
    }
  }
  return { parts, colours, texts, rules: [...new Set(rules)].join('\n') };
}

/**
 * The keyframe player's output and a scene's for one control, together: CanvasControl draws both.
 * Either may be null; neither is changed.
 */
export function mergeKeyframeOutputs(own, scene) {
  if (!scene) return own;
  if (!own) return { fired: [], key: '', ...scene };
  const mergeLists = (a, b) => {
    const out = new Map(a ?? []);
    for (const [part, list] of b ?? []) out.set(part, [...(out.get(part) ?? []), ...list]);
    return out;
  };
  const colours = new Map(own.colours ?? []);
  for (const [part, lists] of scene.colours ?? []) {
    const current = colours.get(part) ?? { paint: [], shape: [], stroke: [], text: [], gradient: [] };
    colours.set(part, Object.fromEntries(CHANNELS.map((channel) => [channel, [...(current[channel] ?? []), ...(lists[channel] ?? [])]])));
  }
  return {
    ...own,
    parts: mergeLists(own.parts, scene.parts),
    colours,
    texts: mergeLists(own.texts, scene.texts),
    rules: [own.rules, scene.rules].filter(Boolean).join('\n'),
  };
}
