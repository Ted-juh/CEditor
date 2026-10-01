/**
 * animationModel.js — the working parts of the Animation tab, with no Svelte in them.
 *
 * This file answers one question the editor has never asked: will this animation target actually
 * do anything?
 *
 * The runtime (`buildTransitionCatalog` in `utils/interactionRuntime.js`) only accepts a short,
 * fixed list of property paths. The Animations editor offers a "Property" dropdown with seven
 * choices, and two of them — Fill Colour and Text Colour — are not on that list. Pick one, click
 * Append target, and you get an animation that never runs. Nothing tells you.
 *
 * Measured, by running the real runtime over each of the seven:
 *
 *   Scale, Rotation, X Position, Y Position  →  animates
 *   Opacity                                  →  animates
 *   Fill Colour                              →  nothing
 *   Text Colour                              →  nothing
 *
 * `targetStatus()` below is the same rule the runtime uses, written out so the editor can show it.
 * If the runtime ever accepts more paths, `animationModel.test.js` fails, because it runs both.
 */
import { EASING_BEZIERS, EASING_NAMES, SPRING_DEFAULTS, springEase, treeValueAtPath, resolveInteractiveControl } from './interactionRuntime.js';

export { EASING_BEZIERS, EASING_NAMES, SPRING_DEFAULTS, springEase };

/**
 * The three animation kinds the runtime does something with. `transition` eases between states on
 * a named curve; `spring` overshoots and settles on the same damped oscillation `ce.anim.spring`
 * draws, declared on the control instead of written in a script; `keyframes` is a sequence along a
 * time axis, one track per target, played by anime.js (`utils/keyframeModel.js`). All 2026-10-01.
 */
export const ANIMATION_KINDS = ['transition', 'spring', 'keyframes'];

export const TRIGGER_TYPES = ['stateChange', 'valueChange'];

/**
 * The paths the runtime accepts on a part, and what each one animates.
 *
 * Copied from `buildTransitionCatalog`. Nothing else works.
 */
export const PART_PATHS = {
  'Layout.x': 'transform',
  'Layout.y': 'transform',
  'Layout.offsetX': 'transform',
  'Layout.offsetY': 'transform',
  'Layout.rotation': 'transform',
  'Layout.scale': 'transform',
  opacity: 'opacity',
  'Layout.width': 'size',
  'Layout.height': 'size',
  // The colour bucket (2026-10-01): a part's flat fill, its text and its border colour.
  'Background.Fill.colour': 'colour',
  'Text.Fill.colour': 'colour',
  'Background.Border.colour': 'colour',
  // A filmstrip part's frame. Keyframes only: there is no CSS for it, and the generator that
  // made the part writes it from the value on every resolve, which the overlay then overrides.
  'Image.frameIndex': 'frame',
};

/** The buckets only a keyframes animation can drive. The transition catalog has nothing for them. */
export const KEYFRAMES_ONLY_BUCKETS = ['channel', 'frame'];
const CHANNEL_PATH = /^ValueChannels\.([^.]+)$/;

/** The same for a target on the control itself rather than one of its parts. */
export const ROOT_PATHS = {
  'Transform.scale': 'transform',
  'Transform.rotation': 'transform',
  'Transform.opacity': 'opacity',
  'Background.Fill.colour': 'colour',
  'Text.Fill.colour': 'colour',
};

/**
 * The "properties" hint on a target, and the bucket each one fills. A target with one of these
 * works even if its path is not in the tables above. The colour hints are the CSS property names
 * the properties panel has always written, so a control saved from it before the colour bucket
 * existed animates now without being touched.
 */
export const HINT_BUCKETS = {
  transform: 'transform',
  opacity: 'opacity',
  size: 'size',
  colour: 'colour',
  'background-color': 'colour',
  color: 'colour',
  channel: 'channel',
  frame: 'frame',
};
export const PROPERTY_HINTS = Object.keys(HINT_BUCKETS);

/** Root targets have no size bucket, so a size hint at the root does nothing. */
export const ROOT_PROPERTY_HINTS = PROPERTY_HINTS.filter((hint) => hint !== 'size');

/**
 * What this tab offers in its "Change" dropdown, and whether each one works.
 *
 * The first seven are the properties panel's own list, copied from `AnimationsEditor.svelte`. Two
 * of those seven — the colours — were dead until the runtime grew a colour bucket (2026-10-01);
 * their hints are the panel's CSS property names and are kept as written, so what the panel saved
 * and what this tab saves stay one shape.
 *
 * Width and Height are added. The runtime animates both and the panel has never offered them.
 * `animationModel.test.js` pins the panel's list at seven, so if it grows this comment fails with
 * it.
 */
export const OFFERED_PROPERTIES = [
  { path: 'Layout.scale', properties: ['transform'], label: 'Scale' },
  { path: 'Layout.rotation', properties: ['transform'], label: 'Rotation' },
  { path: 'Layout.x', properties: ['transform'], label: 'X position' },
  { path: 'Layout.y', properties: ['transform'], label: 'Y position' },
  { path: 'Layout.width', properties: ['size'], label: 'Width' },
  { path: 'Layout.height', properties: ['size'], label: 'Height' },
  { path: 'opacity', properties: ['opacity'], label: 'Opacity' },
  { path: 'Background.Fill.colour', properties: ['background-color'], label: 'Fill colour' },
  { path: 'Text.Fill.colour', properties: ['color'], label: 'Text colour' },
];

/**
 * Does this target animate anything, and if not, why not?
 *
 * `partNames` is the list of parts the control has. A target on a part that does not exist is not
 * an error to the runtime — it happily builds a transition for a part nobody will ever draw — so
 * that is reported separately from a path the runtime does not accept.
 */
export function targetStatus(target, partNames = [], { kind = 'transition', triggerType = 'stateChange' } = {}) {
  const path = String(target?.path ?? '').trim();
  if (!path) {
    return { works: false, reason: 'no path', detail: 'This target has no path, so the runtime skips it.' };
  }
  const hints = Array.isArray(target?.properties) ? target.properties : [];

  // A value channel: a keyframe track on the value itself, which bindings and generators follow.
  const channel = CHANNEL_PATH.exec(path);
  if (channel) {
    if (kind !== 'keyframes') {
      return { works: false, reason: 'keyframes only', animates: 'channel', detail: `A value channel is driven by keyframes, not by a ${kind}: there is no CSS for a value.` };
    }
    if (triggerType === 'valueChange' && channel[1] === 'mainValue') {
      return { works: false, reason: 'feedback', animates: 'channel', detail: 'A sequence that follows the value cannot also drive it; it would chase itself.' };
    }
    return { works: true, animates: 'channel', part: '', channel: channel[1] };
  }

  if (path.startsWith('Parts.')) {
    const [, partName, ...rest] = path.split('.');
    const tail = rest.join('.');
    if (!partName) {
      return { works: false, reason: 'no part', detail: 'The path says Parts. but does not name one.' };
    }
    const byPath = PART_PATHS[tail];
    const byHint = HINT_BUCKETS[hints.find((hint) => PROPERTY_HINTS.includes(hint))];
    if (!byPath && !byHint) {
      return {
        works: false,
        reason: 'dead path',
        detail: `The runtime does not animate "${tail}". It only animates ${Object.keys(PART_PATHS).join(', ')}.`,
      };
    }
    if (KEYFRAMES_ONLY_BUCKETS.includes(byPath ?? byHint) && kind !== 'keyframes') {
      return { works: false, reason: 'keyframes only', animates: byPath ?? byHint, part: partName, detail: `A filmstrip frame is driven by keyframes, not by a ${kind}: there is no CSS for a frame.` };
    }
    if (partNames.length && !partNames.includes(partName)) {
      return {
        works: false,
        reason: 'missing part',
        animates: byPath ?? byHint,
        part: partName,
        detail: `This control has no part called "${partName}", so the animation is built for something that is not there.`,
      };
    }
    return { works: true, animates: byPath ?? byHint, part: partName };
  }

  const byPath = ROOT_PATHS[path];
  const byHint = HINT_BUCKETS[hints.find((hint) => ROOT_PROPERTY_HINTS.includes(hint))];
  if (!byPath && !byHint) {
    const sizeHint = hints.includes('size');
    return {
      works: false,
      reason: sizeHint ? 'no size at root' : 'dead path',
      detail: sizeHint
        ? 'Size is only animated on a part, not on the control itself.'
        : `The runtime does not animate "${path}" on the control itself. It only animates ${Object.keys(ROOT_PATHS).join(', ')}.`,
    };
  }
  return { works: true, animates: byPath ?? byHint, part: '' };
}

/** One animation, read into the shape the tab draws. */
export function describeAnimation(name, animation) {
  return {
    name: String(name ?? ''),
    enabled: animation?.enabled !== false,
    kind: String(animation?.kind ?? 'transition'),
    duration: Number.isFinite(Number(animation?.duration)) ? Number(animation.duration) : 120,
    delay: Number.isFinite(Number(animation?.delay)) ? Number(animation.delay) : 0,
    easing: String(animation?.easing ?? 'outQuad'),
    damping: Number.isFinite(Number(animation?.damping)) ? Number(animation.damping) : SPRING_DEFAULTS.damping,
    frequency: Number.isFinite(Number(animation?.frequency)) ? Number(animation.frequency) : SPRING_DEFAULTS.frequency,
    loop: animation?.loop === true,
    hold: animation?.hold !== false,
    triggerType: String(animation?.trigger?.type ?? 'stateChange'),
    from: Array.isArray(animation?.trigger?.from) ? animation.trigger.from.map(String) : [],
    to: Array.isArray(animation?.trigger?.to) ? animation.trigger.to.map(String) : [],
    source: String(animation?.trigger?.source ?? 'value.normalized'),
    targets: Array.isArray(animation?.targets) ? animation.targets : [],
    animation,
  };
}

export function readAnimations(control) {
  const section = control?._children?.Animations;
  return Object.entries(section?._children ?? {})
    .filter(([, animation]) => animation && typeof animation === 'object')
    .map(([name, animation]) => describeAnimation(name, animation));
}

/** The section's own on/off switch, which turns every animation off at once. */
export function animationsEnabled(control) {
  return control?._children?.Animations?.enabled !== false;
}

/** Each target with its status attached, ready to list. */
export function describeTargets(row, partNames = []) {
  const context = { kind: String(row?.kind ?? 'transition'), triggerType: String(row?.triggerType ?? row?.trigger?.type ?? 'stateChange') };
  return (row?.targets ?? []).map((target, index) => ({
    index,
    target,
    path: String(target?.path ?? ''),
    properties: Array.isArray(target?.properties) ? target.properties : [],
    status: targetStatus(target, partNames, context),
  }));
}

/**
 * Everything the "Change" dropdown can offer for THIS control: the fixed part properties, one
 * entry per value channel, and one per filmstrip part. The channels come from the document; the
 * filmstrip parts come from resolving the control, because a generator makes them and the
 * document never holds them. Each extra entry carries its whole path (`scope: 'control'`), so the
 * Part picker does not apply to it.
 */
export function offeredTargetsFor(control) {
  const out = OFFERED_PROPERTIES.map((entry) => ({ ...entry, scope: 'part' }));
  const channels = control?._children?.ValueChannels?._children ?? {};
  for (const [name, channel] of Object.entries(channels)) {
    const type = String(channel?.type ?? 'float').toLowerCase();
    if (['enum', 'text', 'note', 'array'].includes(type)) continue;
    out.push({ path: `ValueChannels.${name}`, properties: ['channel'], label: `Channel: ${channel?.label || name}`, scope: 'control', channel: name });
  }
  for (const [name, part] of Object.entries(resolvedPartsOf(control))) {
    if (String(part?._children?.Image?.mode ?? '') === 'filmstrip') {
      out.push({ path: `Parts.${name}.Image.frameIndex`, properties: ['frame'], label: `Frame: ${name}`, scope: 'control', part: name });
    }
  }
  return out;
}

/** The parts a resolved control has, generator-made ones included. Empty when it cannot resolve. */
export function resolvedPartsOf(control) {
  if (!control?._children?.Parts) return {};
  try {
    return resolveInteractiveControl(control, {})?.control?._children?.Parts?._children ?? {};
  } catch {
    return control._children.Parts._children ?? {};
  }
}

/** How many of an animation's targets do nothing. */
export function deadTargetCount(row, partNames = []) {
  return describeTargets(row, partNames).filter((entry) => !entry.status.works).length;
}

// --- Editing the target list ------------------------------------------------
// All three return a new array. The editor writes the whole list back in one go, which is what the
// properties panel does too.

export function addTarget(targets, target) {
  return [...(Array.isArray(targets) ? targets : []), target];
}

export function removeTarget(targets, index) {
  const list = Array.isArray(targets) ? [...targets] : [];
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

export function moveTarget(targets, from, to) {
  const list = Array.isArray(targets) ? [...targets] : [];
  if (!list.length) return list;
  const a = Math.max(0, Math.min(list.length - 1, Math.round(from)));
  const b = Math.max(0, Math.min(list.length - 1, Math.round(to)));
  if (a === b) return list;
  const [moved] = list.splice(a, 1);
  list.splice(b, 0, moved);
  return list;
}

/** A target built the way the properties panel builds one, so both write the same shape. */
export function buildTarget(partName, offered) {
  if (!offered) return null;
  return {
    path: partName && offered.scope !== 'control' ? `Parts.${partName}.${offered.path}` : offered.path,
    properties: [...offered.properties],
  };
}

// --- Drawing the easing curve -----------------------------------------------

/**
 * Points along an easing curve, for drawing it.
 *
 * The editor offers four easing names and shows no picture of any of them. These are the same
 * curves the runtime hands to CSS, so the picture is the real thing rather than an impression of
 * it.
 */
export function easingPoints(name, steps = 24) {
  const count = Math.max(2, Math.round(steps));
  const bezier = EASING_BEZIERS[String(name ?? '')];
  const out = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push({ x: t, y: bezier ? cubicBezierY(bezier, t) : t });
  }
  return out;
}

/**
 * The y of a CSS cubic-bezier at time x.
 *
 * CSS timing functions are a bezier in which x is time, so finding y means finding the curve
 * parameter that gives that x first. Twenty rounds of bisection is far more than a 90px picture
 * needs and costs nothing.
 */
export function cubicBezierY([x1, y1, x2, y2], x) {
  const curveX = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const curveY = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    if (curveX(mid) < x) low = mid; else high = mid;
  }
  return curveY((low + high) / 2);
}

/** The easing names the runtime knows but the properties panel never offers. */
export function unofferedEasings(offered = ['linear', 'outQuad', 'inOutQuad', 'outCubic']) {
  return EASING_NAMES.filter((name) => !offered.includes(name));
}

// --- Making and unmaking an animation ---------------------------------------
// Until now this tab edited the animations a control already had, and creating one stayed in the
// properties panel. That is a gap the moment the panel's rows come out, so the shape lives here —
// one definition of what a new animation is, rather than the panel's and the tab's drifting apart.

/** What the properties panel's "Add" makes, so both surfaces make the same thing. */
export function newAnimationShape(name) {
  return {
    _type: 'Animation',
    name: String(name ?? ''),
    enabled: true,
    kind: 'transition',
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
    targets: [],
    duration: 120,
    delay: 0,
    easing: 'outQuad',
  };
}

/** Animation names are object keys, so they have to be usable as a path segment. */
export function cleanAnimationName(wanted) {
  return String(wanted ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '');
}

const RESERVED_ANIMATION_NAMES = new Set(['enabled']);

/**
 * A name not already taken, or '' when there is nothing usable in what was typed.
 *
 * The panel's Add silently does nothing on a duplicate — `if (… || animations?._children?.[name])
 * return;` — which looks like a broken button. This suffixes instead.
 */
export function uniqueAnimationName(existingNames, wanted) {
  const base = cleanAnimationName(wanted);
  if (!base) return '';
  const taken = new Set((existingNames ?? []).map(String));
  if (!taken.has(base) && !RESERVED_ANIMATION_NAMES.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate) && !RESERVED_ANIMATION_NAMES.has(candidate)) return candidate;
  }
}

/** Why a rename cannot go through, or '' when it can. */
export function renameBlockedBecause(existingNames, from, to) {
  const clean = cleanAnimationName(to);
  if (!clean) return 'A name needs letters, digits or underscores.';
  if (clean === from) return '';
  if (RESERVED_ANIMATION_NAMES.has(clean)) return `${clean} is reserved by the Animations section.`;
  if ((existingNames ?? []).map(String).includes(clean)) return `There is already an animation called ${clean}.`;
  return '';
}

/**
 * Every label this tab can edit.
 *
 * The properties panel builds its search box from the rows it draws. When these rows eventually
 * leave the panel, the search has to be fed from here instead.
 */
export function allAnimationFieldLabels() {
  return ['Kind', 'Duration', 'Delay', 'Easing', 'Damping', 'Frequency', 'Loop', 'Hold', 'Trigger', 'From', 'To', 'Source', 'Targets', 'Animation'];
}

/**
 * Points along the spring, for drawing it. Unlike an easing these go above 1 — the overshoot is
 * the point — so the picture scales to hold them. Same formula as the runtime and the script API.
 */
export function springPoints(damping = SPRING_DEFAULTS.damping, frequency = SPRING_DEFAULTS.frequency, steps = 48) {
  const count = Math.max(2, Math.round(steps));
  const out = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push({ x: t, y: springEase(t, damping, frequency) });
  }
  return out;
}

/** The value a path has on the control as authored — where a seeded keyframe track starts. */
export function baseValueAt(control, path) {
  const text = String(path ?? '');
  const channel = CHANNEL_PATH.exec(text);
  if (channel) {
    const node = control?._children?.ValueChannels?._children?.[channel[1]];
    const value = Number(node?.currentValue ?? node?.defaultValue ?? node?.min ?? 0);
    return Number.isFinite(value) ? value : 0;
  }
  let value = treeValueAtPath(control, text);
  if (value === undefined && text.startsWith('Parts.')) {
    // A generator-made part (a filmstrip's frame) exists only once the control is resolved.
    const [, partName, ...rest] = text.split('.');
    value = treeValueAtPath(resolvedPartsOf(control)?.[partName], rest.join('.'));
  }
  return value === undefined || value === null || typeof value === 'object' ? undefined : value;
}

/**
 * What switching an animation's kind writes, in one store write.
 *
 * To `spring`: the spring's two numbers if it has none yet, and a settle time long enough to see
 * the overshoot. To `keyframes`: a length for the axis, `hold` on, and for every target that has
 * no track yet, one keyframe at 0 holding the value the control has as authored, so switching
 * kind changes nothing on screen until a second keyframe is added. Switching away leaves all of
 * it in place, so a switch back finds the tracks again.
 */
export function animationWithKind(animation, kind, control = null) {
  const next = { ...(animation ?? {}), kind: ANIMATION_KINDS.includes(kind) ? kind : 'transition' };
  if (next.kind === 'spring') {
    if (!Number.isFinite(Number(next.damping))) next.damping = SPRING_DEFAULTS.damping;
    if (!Number.isFinite(Number(next.frequency))) next.frequency = SPRING_DEFAULTS.frequency;
    if (!Number.isFinite(Number(next.duration)) || Number(next.duration) < 200) next.duration = SPRING_DEFAULTS.duration;
  }
  if (next.kind === 'keyframes') {
    if (!Number.isFinite(Number(next.duration)) || Number(next.duration) < 100) next.duration = 1000;
    if (typeof next.hold !== 'boolean') next.hold = true;
    if (typeof next.loop !== 'boolean') next.loop = false;
    next.targets = (Array.isArray(next.targets) ? next.targets : []).map((target) => {
      if (Array.isArray(target?.keyframes) && target.keyframes.length) return target;
      const base = control ? baseValueAt(control, target?.path) : undefined;
      return { ...target, keyframes: base === undefined ? [] : [{ time: 0, value: base, easing: 'outQuad' }] };
    });
  }
  return next;
}
