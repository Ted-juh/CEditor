/**
 * animationModel.js — the working parts of the Animation tab, with no Svelte in them.
 *
 * This file answers the questions the editor never asked:
 *
 *   - Will this target actually do anything? (`targetStatus`)
 *   - Do two animations fight over the same property for the same change? (`findClashes`)
 *   - Are the trigger's states ones this control has? (`unknownTriggerStates`)
 *   - What does animating this cost the browser? (`targetCost`)
 *
 * The rule for the first is the runtime's own table (`PART_PATH_BUCKETS` and friends in
 * utils/interactionRuntime.js), read rather than copied. It used to be a copy, and the copy said
 * Fill colour and Text colour animate nothing, which was true: the runtime had no colour bucket.
 * It has one now, and the two choices the properties panel has always offered work.
 * `animationModel.test.js` still runs the real runtime over every offered property and checks the
 * answer, so the tab cannot drift from what plays.
 */
import {
  EASING_BEZIERS,
  EASING_NAMES,
  PART_PATH_BUCKETS,
  ROOT_PATH_BUCKETS,
  BUCKET_HINTS,
  ROOT_BUCKETS,
  targetBuckets,
  readTrigger,
} from './interactionRuntime.js';
import { OVERSHOOTING_EASINGS, CUSTOM_EASING, SPRING_EASING, SPRING_DEFAULTS, CUSTOM_DEFAULT, readEasing, easeAt } from './easing.js';

export { EASING_BEZIERS, EASING_NAMES, OVERSHOOTING_EASINGS, CUSTOM_EASING, SPRING_EASING, SPRING_DEFAULTS, CUSTOM_DEFAULT };

/**
 * The animation kinds the runtime plays. A transition moves a property when something changes; a
 * keyframe animation runs a shape of its own — a pulse, a blink — while its trigger holds, or once
 * each time it fires.
 */
export const ANIMATION_KINDS = ['transition', 'keyframes'];

export const TRIGGER_TYPES = ['stateChange', 'valueChange'];

/** What can start a keyframe animation. A transition only ever answers a state or value change. */
export const KEYFRAME_TRIGGER_TYPES = ['always', 'stateChange', 'valueChange', 'beat', 'script'];

/** Which value changes a value trigger answers: any, only the person's own, or only from outside. */
export const VALUE_ORIGINS = ['any', 'user', 'external'];

/** The paths the runtime animates on a part, and the bucket each fills. The runtime's own table. */
export const PART_PATHS = PART_PATH_BUCKETS;

/** The same for a target on the control itself rather than one of its parts. */
export const ROOT_PATHS = ROOT_PATH_BUCKETS;

/** The `properties` hints a target can carry, by the bucket they name. */
export const PROPERTY_HINTS = Object.keys(BUCKET_HINTS);

/** Root targets have no size bucket, so a size hint at the root does nothing. */
export const ROOT_PROPERTY_HINTS = Object.keys(BUCKET_HINTS).filter((hint) => ROOT_BUCKETS.includes(BUCKET_HINTS[hint]));

/**
 * What this tab offers in its "Change" dropdown.
 *
 * The first seven are the properties panel's own list, as it has written them since before the
 * runtime had a colour bucket — Fill colour and Text colour carry the CSS names `background-color`
 * and `color`, which now name it. Width, Height and Border colour are this tab's additions.
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
  { path: 'Background.Border.colour', properties: ['colour'], label: 'Border colour' },
];

/** The same for a target on the control itself — no position or size, which the panel owns. */
export const OFFERED_ROOT_PROPERTIES = [
  { path: 'Transform.scale', properties: ['transform'], label: 'Scale' },
  { path: 'Transform.rotation', properties: ['transform'], label: 'Rotation' },
  { path: 'Transform.opacity', properties: ['opacity'], label: 'Opacity' },
  { path: 'Background.Fill.colour', properties: ['colour'], label: 'Fill colour' },
  { path: 'Text.Fill.colour', properties: ['colour'], label: 'Text colour' },
  { path: 'Background.Border.colour', properties: ['colour'], label: 'Border colour' },
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
  const landing = targetBuckets(target);
  if (path.startsWith('Parts.')) {
    const [, partName, ...rest] = path.split('.');
    const tail = rest.join('.');
    if (!partName || !landing) {
      return { works: false, reason: 'no part', detail: 'The path says Parts. but does not name one.' };
    }
    if (!landing.buckets.length) {
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
        animates: landing.buckets[0],
        part: partName,
        detail: `This control has no part called "${partName}", so the animation is built for something that is not there.`,
      };
    }
    return { works: true, animates: landing.buckets[0], buckets: landing.buckets, part: partName };
  }

  if (!landing?.buckets.length) {
    const sizeHint = (target?.properties ?? []).includes('size');
    return {
      works: false,
      reason: sizeHint ? 'no size at root' : 'dead path',
      detail: sizeHint
        ? 'Size is only animated on a part, not on the control itself.'
        : `The runtime does not animate "${path}" on the control itself. It only animates ${Object.keys(ROOT_PATHS).join(', ')}.`,
    };
  }
  return { works: true, animates: landing.buckets[0], buckets: landing.buckets, part: '' };
}

/**
 * What animating a target costs, cheapest first.
 *
 * Transform and opacity are composited: the browser moves pixels it already painted. Colour has
 * to repaint the element every frame. Width and height re-run layout for the element and
 * everything that depends on it, every frame — on a panel of two hundred controls that is the
 * difference between smooth and not.
 */
export function targetCost(target) {
  const buckets = targetBuckets(target)?.buckets ?? [];
  if (buckets.includes('size')) {
    return { level: 'layout', label: 'layout', detail: 'Width and height re-run layout every frame. Scale looks similar and costs far less.' };
  }
  if (buckets.includes('colour')) {
    return { level: 'paint', label: 'paint', detail: 'A colour change repaints the element every frame. Cheap for one control, noticeable for many at once.' };
  }
  if (buckets.length) {
    return { level: 'composite', label: 'cheap', detail: 'Moved by the compositor without repainting.' };
  }
  return { level: 'none', label: '', detail: '' };
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
  return ['Kind', 'Duration', 'Delay', 'Easing', 'Trigger', 'From', 'To', 'Source', 'Targets', 'Animation'];
}
