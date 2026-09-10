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
import { EASING_BEZIERS, EASING_NAMES } from './interactionRuntime.js';

export { EASING_BEZIERS, EASING_NAMES };

/** The only animation kind the runtime does anything with. The editor lets you type any word. */
export const ANIMATION_KINDS = ['transition'];

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
};

/** The same for a target on the control itself rather than one of its parts. */
export const ROOT_PATHS = {
  'Transform.scale': 'transform',
  'Transform.rotation': 'transform',
  'Transform.opacity': 'opacity',
};

/**
 * The "properties" hint on a target. A target with one of these works even if its path is not in
 * the tables above — which is how a colour target could be made to work, if the runtime grew a
 * colour bucket. It has not.
 */
export const PROPERTY_HINTS = ['transform', 'opacity', 'size'];

/** Root targets have no size bucket, so a size hint at the root does nothing. */
export const ROOT_PROPERTY_HINTS = ['transform', 'opacity'];

/**
 * What this tab offers in its "Change" dropdown, and whether each one works.
 *
 * The first seven are the properties panel's own list, copied from `AnimationsEditor.svelte`. Two
 * of those seven are dead. They are kept here rather than quietly dropped, because the panel still
 * offers them and a control saved from the panel can already carry one — the tab has to be able to
 * name the problem, not pretend it cannot happen.
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
export function targetStatus(target, partNames = []) {
  const path = String(target?.path ?? '').trim();
  if (!path) {
    return { works: false, reason: 'no path', detail: 'This target has no path, so the runtime skips it.' };
  }
  const hints = Array.isArray(target?.properties) ? target.properties : [];

  if (path.startsWith('Parts.')) {
    const [, partName, ...rest] = path.split('.');
    const tail = rest.join('.');
    if (!partName) {
      return { works: false, reason: 'no part', detail: 'The path says Parts. but does not name one.' };
    }
    const byPath = PART_PATHS[tail];
    const byHint = hints.find((hint) => PROPERTY_HINTS.includes(hint));
    if (!byPath && !byHint) {
      return {
        works: false,
        reason: 'dead path',
        detail: `The runtime does not animate "${tail}". It only animates ${Object.keys(PART_PATHS).join(', ')}.`,
      };
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
  const byHint = hints.find((hint) => ROOT_PROPERTY_HINTS.includes(hint));
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
  return (row?.targets ?? []).map((target, index) => ({
    index,
    target,
    path: String(target?.path ?? ''),
    properties: Array.isArray(target?.properties) ? target.properties : [],
    status: targetStatus(target, partNames),
  }));
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
    path: partName ? `Parts.${partName}.${offered.path}` : offered.path,
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
function cubicBezierY([x1, y1, x2, y2], x) {
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

/**
 * Every label this tab can edit.
 *
 * The properties panel builds its search box from the rows it draws. When these rows eventually
 * leave the panel, the search has to be fed from here instead.
 */
export function allAnimationFieldLabels() {
  return ['Kind', 'Duration', 'Delay', 'Easing', 'Trigger', 'From', 'To', 'Source', 'Targets'];
}
