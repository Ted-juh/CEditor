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
import { OVERSHOOTING_EASINGS, CUSTOM_EASING, SPRING_EASING, SPRING_DEFAULTS, CUSTOM_DEFAULT, readEasing, easeAt, cleanBezier } from './easing.js';
import {
  KEYFRAME_TRIGGER_TYPES,
  FRAME_PROPERTIES,
  FRAME_DEFAULTS,
  PULSE_FRAMES,
  cleanFrames,
  keyframePart,
  defaultIterations,
} from './keyframeAnimation.js';

export { EASING_BEZIERS, EASING_NAMES, OVERSHOOTING_EASINGS, CUSTOM_EASING, SPRING_EASING, SPRING_DEFAULTS, CUSTOM_DEFAULT };
export { KEYFRAME_TRIGGER_TYPES, FRAME_PROPERTIES, FRAME_DEFAULTS };

/** The four easings the properties panel's dropdown offers. AnimationsEditor.svelte is pinned to it. */
export const PANEL_EASING_OPTIONS = ['linear', 'outQuad', 'inOutQuad', 'outCubic'];

/**
 * The animation kinds the runtime plays. A transition eases a property from one style to the next
 * when something changes. A keyframe animation runs a shape of its own — a pulse, a blink — while
 * its trigger holds, or once each time it fires (utils/keyframeAnimation.js).
 */
export const ANIMATION_KINDS = ['transition', 'keyframes'];

export const TRIGGER_TYPES = ['stateChange', 'valueChange'];

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
  { path: 'visible', properties: ['visibility'], label: 'Show / hide (fade)' },
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
 * What a working colour target cannot do. CSS fades one solid colour into another and nothing
 * else: a gradient, an image or a material swaps at the end of the duration instead. True of every
 * browser, so it is said on the row rather than discovered.
 */
export const COLOUR_NOTE = 'A solid colour fades. A gradient, an image or a material switches at the end instead — CSS cannot blend between them.';

/** The status of a target that works, with what it should know about the bucket it fills. */
function working(buckets, part) {
  const status = { works: true, animates: buckets[0], buckets, part };
  if (buckets.includes('colour')) status.note = COLOUR_NOTE;
  return status;
}

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
    return working(landing.buckets, partName);
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
  return working(landing.buckets, '');
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
  const trigger = readTrigger(animation);
  const kind = String(animation?.kind ?? 'transition');
  return {
    name: String(name ?? ''),
    enabled: animation?.enabled !== false,
    kind: String(animation?.kind ?? 'transition'),
    duration: Number.isFinite(Number(animation?.duration)) ? Number(animation.duration) : 120,
    delay: Number.isFinite(Number(animation?.delay)) ? Number(animation.delay) : 0,
    easing: String(animation?.easing ?? 'outQuad'),
    // The curve as the runtime reads it — a custom bezier's points, a spring's feel.
    curve: readEasing(animation ?? {}),
    triggerType: String(animation?.trigger?.type ?? 'stateChange'),
    // As written, so the tab shows a misspelt state as it was typed; `trigger` is the runtime's
    // reading of the same thing (lower-cased, defaults filled in) and is what the checks use.
    from: Array.isArray(animation?.trigger?.from) ? animation.trigger.from.map(String) : [],
    to: Array.isArray(animation?.trigger?.to) ? animation.trigger.to.map(String) : [],
    source: String(animation?.trigger?.source ?? 'value.normalized'),
    reverse: trigger.reverse,
    origin: trigger.origin,
    trigger,
    targets: Array.isArray(animation?.targets) ? animation.targets : [],
    // Keyframe animations only: where they play, how often, which way, and their frames.
    part: keyframePart(animation),
    iterations: animation?.iterations === 'infinite' || animation?.iterations === Infinity
      ? 'infinite'
      : (Number(animation?.iterations) >= 1 ? Math.round(Number(animation.iterations)) : defaultIterations(trigger.type)),
    direction: animation?.direction === 'alternate' ? 'alternate' : 'normal',
    frames: kind === 'keyframes' ? cleanFrames(animation?.frames) : [],
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

/**
 * A keyframe animation's target only says WHERE it plays — the frames say what moves — so the one
 * thing that can be wrong with it is a part that is not there.
 */
function keyframeTargetStatus(target, partNames) {
  const part = keyframePart({ targets: [target] });
  if (part && partNames.length && !partNames.includes(part)) {
    return { works: false, reason: 'missing part', part, detail: `This control has no part called "${part}", so the animation plays on nothing.` };
  }
  return { works: true, animates: 'keyframes', buckets: [], part };
}

/** Each target with its status attached, ready to list. */
export function describeTargets(row, partNames = []) {
  const keyframes = row?.kind === 'keyframes';
  return (row?.targets ?? []).map((target, index) => ({
    index,
    target,
    path: String(target?.path ?? ''),
    properties: Array.isArray(target?.properties) ? target.properties : [],
    status: keyframes ? keyframeTargetStatus(target, partNames) : targetStatus(target, partNames),
  }));
}

/** How many of an animation's targets do nothing. */
export function deadTargetCount(row, partNames = []) {
  return describeTargets(row, partNames).filter((entry) => !entry.status.works).length;
}

// --- Triggers ---------------------------------------------------------------
// A stateChange trigger names states by the keys of the control's States section, lower-cased
// ("Pressed" is "pressed"). "*" is any state and "default" is none at all. The runtime compares
// names and nothing else, so a typo is not an error anywhere — it is an animation that never
// plays. These are the tab's way of saying so.

export const ANY_STATE = '*';
export const DEFAULT_STATE = 'default';

/** The state names this control can be in, as triggers spell them. */
export function controlStateNames(control) {
  const states = control?._children?.States?._children ?? {};
  return [...new Set(Object.keys(states).map((key) => String(key).trim().toLowerCase()).filter(Boolean))];
}

/** What the From and To chips offer: any, none, then every state the control has. */
export function triggerStateChoices(stateNames = []) {
  return [ANY_STATE, DEFAULT_STATE, ...stateNames.filter((name) => name !== ANY_STATE && name !== DEFAULT_STATE)];
}

/**
 * The state names in a trigger that this control does not have, as they were written.
 * Only a state trigger names states; a value trigger has nothing to check.
 */
export function unknownTriggerStates(row, stateNames = []) {
  if ((row?.triggerType ?? row?.trigger?.type) !== 'stateChange') return [];
  const known = new Set([ANY_STATE, DEFAULT_STATE, ...stateNames]);
  const seen = new Set();
  const out = [];
  for (const written of [...(row?.from ?? []), ...(row?.to ?? [])]) {
    const name = String(written ?? '').trim();
    const key = name.toLowerCase();
    if (!key || known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Toggle one chip in a From or To list, keeping the list meaningful: "*" means any, so choosing it
 * clears the named states, and choosing a named state clears "*". An empty list reads as "*" too,
 * which is why removing the last chip leaves "*" rather than nothing.
 */
export function toggleTriggerState(list, name) {
  const current = (Array.isArray(list) ? list : []).map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return current.length ? current : [ANY_STATE];
  if (key === ANY_STATE) return [ANY_STATE];
  const named = current.filter((value) => value !== ANY_STATE);
  const next = named.includes(key) ? named.filter((value) => value !== key) : [...named, key];
  return next.length ? next : [ANY_STATE];
}

// --- Clashes ----------------------------------------------------------------
// When two animations claim one property of one part for the same change, the runtime gives it to
// the one later in the list (utils/transitionSelection.js, rule 6) and the earlier one never plays
// there. That is a rule, not a bug, and it is invisible: nothing on screen says the earlier
// animation lost. So the tab says it.
//
// Only a TIE is a clash. "From * to pressed" and "from * to any state" both answer a press, but the
// named one outranks the "*" one by rule 1, whatever the order — that is a fallback someone built
// on purpose, not two animations fighting. Likewise a state trigger and a value trigger answer
// different changes and rank differently when one frame is both.

const isAnyList = (list) => !list.length || list.includes(ANY_STATE);

/**
 * Whether two From lists can both match one frame. Named states can be active together — hover
 * and focused, say — so two lists of different named states can. Only "default", which is no state
 * at all, rules the others out.
 */
function fromListsMeet(a, b) {
  if (isAnyList(a) || isAnyList(b)) return true;
  if (a.some((state) => b.includes(state))) return true;
  const named = (list) => list.some((state) => state !== DEFAULT_STATE);
  return named(a) && named(b);
}

/** Why two triggers tie for the same change, or '' when they never do. Both are readTrigger() shapes. */
export function triggersTie(a, b) {
  if (!a || !b || a.type !== b.type) return '';
  if (a.type === 'valueChange') {
    if (a.source !== b.source) return '';
    if (a.origin !== 'any' && b.origin !== 'any' && a.origin !== b.origin) return '';
    return `both answer a change of ${a.source}`;
  }
  if (a.type !== 'stateChange') return '';
  const aAny = isAnyList(a.to);
  if (aAny !== isAnyList(b.to)) return '';
  if (!fromListsMeet(a.from, b.from)) return '';
  if (aAny) return 'both answer any state change';
  const shared = a.to.filter((state) => b.to.includes(state));
  return shared.length ? `both answer ${shared.join(', ')}` : '';
}

/** Where an animation's working targets land, as "part|bucket" keys ('' is the control itself). */
function landings(row, partNames) {
  const out = new Map();
  for (const target of row?.targets ?? []) {
    const status = targetStatus(target, partNames);
    if (!status.works) continue;
    for (const bucket of status.buckets ?? [status.animates]) {
      out.set(`${status.part}|${bucket}`, { part: status.part, bucket });
    }
  }
  return out;
}

/**
 * Every pair of enabled transitions that tie for the same property of the same part.
 *
 * Returns `[{ winner, loser, places: [{ part, bucket }], why }]`, `winner` being the later of the
 * two — the one that plays. Keyframe animations do not take part: they do not use transitions.
 */
export function findClashes(rows, partNames = []) {
  const live = (rows ?? []).filter((row) => row?.enabled !== false && (row?.kind ?? 'transition') !== 'keyframes');
  const placed = live.map((row) => ({ row, at: landings(row, partNames), trigger: row.trigger ?? readTrigger(row.animation) }));
  const clashes = [];
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const why = triggersTie(placed[i].trigger, placed[j].trigger);
      if (!why) continue;
      const places = [...placed[i].at.keys()].filter((key) => placed[j].at.has(key)).map((key) => placed[i].at.get(key));
      if (!places.length) continue;
      clashes.push({ winner: placed[j].row.name, loser: placed[i].row.name, places, why });
    }
  }
  return clashes;
}

/** "the control" or the part's name, and the bucket — how a clash names where it happens. */
export function describePlace({ part, bucket }) {
  return `${part || 'the control'} ${bucket}`;
}

/** One animation's clashes, each said from its own side. */
export function clashesFor(name, clashes) {
  return (clashes ?? []).flatMap((clash) => {
    if (clash.loser === name) {
      return [{ role: 'loses', other: clash.winner, places: clash.places, why: clash.why,
        text: `Never plays on ${clash.places.map(describePlace).join(', ')}: ${clash.winner} is later in the list and ${clash.why}.` }];
    }
    if (clash.winner === name) {
      return [{ role: 'wins', other: clash.loser, places: clash.places, why: clash.why,
        text: `Overrides ${clash.loser} on ${clash.places.map(describePlace).join(', ')}: ${clash.why}.` }];
    }
    return [];
  });
}

// --- Keyframe animations -----------------------------------------------------
// The second kind. These are the edits the tab makes to one; utils/keyframeAnimation.js is how it
// plays.

/** What a keyframe animation's trigger can be, as the tab labels it. */
export const KEYFRAME_TRIGGER_LABELS = {
  always: 'All the time',
  stateChange: 'In a state',
  valueChange: 'When the value changes',
  beat: 'On the beat',
  script: 'When a script plays it',
};

/** Where a keyframe animation plays, as a targets list: a part, or the control itself. */
export function keyframeTargets(partName) {
  return [{ path: partName ? `Parts.${partName}` : 'Transform' }];
}

/**
 * What switching an animation's kind writes, as one patch.
 *
 * To keyframes: the frames it had (switching back and forth loses nothing) or a gentle pulse; a
 * trigger a keyframe animation answers (a state or value trigger carries over, anything else becomes
 * "all the time"); and, if its duration is a quick transition's, a pulse's 600ms instead — a 120ms
 * loop is a flicker, not a pulse. To a transition: a trigger a transition answers, the frames kept.
 */
export function kindPatch(row, kind) {
  const animation = row?.animation ?? {};
  const trigger = animation.trigger ?? {};
  if (kind === 'keyframes') {
    const frames = cleanFrames(animation.frames);
    const type = KEYFRAME_TRIGGER_TYPES.includes(trigger.type) ? trigger.type : 'always';
    const patch = {
      kind: 'keyframes',
      frames: frames.length ? frames : PULSE_FRAMES.map((frame) => ({ ...frame })),
      trigger: { ...trigger, type },
    };
    if (!(Number(animation.duration) >= 200)) patch.duration = 600;
    return patch;
  }
  const type = TRIGGER_TYPES.includes(trigger.type) ? trigger.type : 'stateChange';
  return {
    kind: 'transition',
    trigger: type === trigger.type ? { ...trigger } : { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
  };
}

/** A new frame, placed where there is room: halfway into the widest gap. */
export function addFrame(frames) {
  const list = cleanFrames(frames);
  if (!list.length) return [{ at: 0, ...FRAME_DEFAULTS }];
  const stops = [0, ...list.map((frame) => frame.at), 1];
  let best = { gap: -1, at: 1 };
  for (let i = 1; i < stops.length; i += 1) {
    const gap = stops[i] - stops[i - 1];
    if (gap > best.gap) best = { gap, at: (stops[i] + stops[i - 1]) / 2 };
  }
  const at = Math.round(best.at * 1000) / 1000;
  // The new frame starts as the frame before it, so adding one never jumps anything.
  const before = [...list].reverse().find((frame) => frame.at <= at) ?? list[0];
  return cleanFrames([...list, { ...before, at }]);
}

export function removeFrame(frames, index) {
  const list = cleanFrames(frames);
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

/**
 * One value in one frame. `at` is a percentage in the tab and a fraction here; an empty value
 * removes the property from the frame, which lets it ease through from the frames either side.
 */
export function setFrameValue(frames, index, key, value) {
  const list = cleanFrames(frames);
  if (!list[index]) return list;
  const next = { ...list[index] };
  if (key === 'at') next.at = Number(value) / 100;
  else if (value === '' || value === null || value === undefined) delete next[key];
  else next[key] = Number(value);
  list[index] = next;
  return cleanFrames(list);
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
 * `easing` is a name ("outBack") or an Animation node, which is how a custom bezier or a spring
 * draws its own shape rather than a named one's. The numbers come from utils/easing.js — the
 * curves the runtime hands to CSS and the value glide evaluates — so the picture is the real
 * thing rather than an impression of it. A name the runtime does not know draws CSS `ease`,
 * because that is what plays.
 */
export function easingPoints(easing, steps = 24) {
  const count = Math.max(2, Math.round(steps));
  const description = readEasing(easing && typeof easing === 'object' ? easing : { easing: String(easing ?? '') });
  const out = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push({ x: t, y: easeAt(description, t) });
  }
  return out;
}

/**
 * Every easing the tab offers: the named curves, then one you draw and one that bounces.
 * The last two are the panel runtime's own — CSS draws them — and ce.anim does not know them, so a
 * script asking for curve = "spring" is told so rather than silently going linear.
 */
export const EASING_CHOICES = [...EASING_NAMES, CUSTOM_EASING, SPRING_EASING];

/** The limits the spring editor keeps to: below them it never settles, above them it buzzes. */
export const SPRING_LIMITS = Object.freeze({ damping: [1, 30], frequency: [2, 40] });

/** A spring's feel, clamped to what the editor offers. */
export function cleanSpring(spring) {
  const pick = (key) => {
    const [lo, hi] = SPRING_LIMITS[key];
    const value = Number(spring?.[key]);
    return Number.isFinite(value) ? Math.min(hi, Math.max(lo, Math.round(value * 10) / 10)) : SPRING_DEFAULTS[key];
  };
  return { damping: pick('damping'), frequency: pick('frequency') };
}

/**
 * What choosing an easing writes, as one patch for the animation node.
 *
 * Choosing "custom" starts from the curve the animation already had — outCubic, say — so the
 * handles begin where the motion was rather than somewhere arbitrary. Choosing "spring" keeps a
 * feel already set. The extra fields of the other two kinds are left in place, so switching back
 * and forth loses nothing.
 */
export function easingPatch(row, choice) {
  const name = String(choice ?? '');
  if (name === CUSTOM_EASING) {
    const own = cleanBezier(row?.animation?.bezier);
    const current = readEasing(row?.animation ?? { easing: row?.easing });
    const from = current.kind === 'bezier' ? current.points : current.kind === 'linear' ? [0, 0, 1, 1] : CUSTOM_DEFAULT;
    return { easing: CUSTOM_EASING, bezier: [...(own ?? from)] };
  }
  if (name === SPRING_EASING) {
    return { easing: SPRING_EASING, spring: cleanSpring(row?.animation?.spring ?? SPRING_DEFAULTS) };
  }
  return { easing: name };
}

/** The y range the bezier editor draws and lets a handle reach — room to overshoot both ways. */
export const BEZIER_VIEW = Object.freeze({ yMin: -0.5, yMax: 1.5 });

/**
 * A control point moved to (x, y): the new four numbers, with x kept in [0, 1] (CSS refuses
 * anything else) and y inside the editor's view, rounded to three places so the stored numbers
 * read like the named curves' rather than like a mouse position.
 */
export function moveBezierHandle(points, handle, x, y) {
  const base = cleanBezier(points) ?? [...CUSTOM_DEFAULT];
  const round = (value) => Math.round(value * 1000) / 1000;
  const nx = round(Math.min(1, Math.max(0, Number(x) || 0)));
  const ny = round(Math.min(BEZIER_VIEW.yMax, Math.max(BEZIER_VIEW.yMin, Number(y) || 0)));
  const next = [...base];
  if (handle === 2) { next[2] = nx; next[3] = ny; } else { next[0] = nx; next[1] = ny; }
  return next;
}

/** The easing names the runtime knows but the properties panel never offers. */
export function unofferedEasings(offered = PANEL_EASING_OPTIONS) {
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
    // `reverse` is what every control did before triggers were read — a hover lift settles back
    // when the pointer leaves — so a new animation says so out loud rather than by omission.
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
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
 * The properties panel builds its search box from the rows it draws, and its Animations rows are
 * gone (phase 5): the search finds these instead, through utils/dockFieldIndex.js, and a match
 * offers to open this tab. A field added to the tab and not here is a field the search cannot find.
 */
export function allAnimationFieldLabels() {
  return [
    'Animation', 'Kind', 'Duration', 'Delay', 'Easing', 'Custom curve', 'Spring', 'Damping', 'Bounce',
    'Trigger', 'From', 'To', 'Leaving', 'Origin', 'Source', 'Targets', 'Change',
    'Frames', 'Repeat', 'Times', 'Direction', 'Plays on', 'Every',
    'Presets', 'Stage', 'Play', 'Slow motion',
  ];
}
