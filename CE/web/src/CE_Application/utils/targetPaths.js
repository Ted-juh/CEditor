/**
 * targetPaths.js — an animation's target as a path a person reads and picks: the control, then a
 * section or a part, then a property. `Knob01 › Text › Colour`, `Knob01 › Body › Cap › Scale`.
 *
 * NOTHING HERE CHANGES WHAT IS STORED. Animations keep the paths they always had
 * (animationModel.js): `Parts.<part>.<property>` on a part, `Text.Fill.colour` or `Transform.scale`
 * on the control itself, `ValueChannels.<name>` and a filmstrip part's frame for a sequence, and for
 * keyframes only the place (`Parts.<part>` or `Transform`). This file names those paths and lists
 * the choices, built from the same offered lists the Animation tab already uses
 * (offeredTargetsFor), so the picker can never offer a path the tab would not.
 *
 * THE PLACES. A control's own properties sit under "Whole control", "Background" and "Text"; a
 * knob's or slider's parts, named by role (`bodyCap`, `pointerCurrent`, `tickMajor`, `labelTitle`),
 * are grouped by that role into Body, Pointer, Ticks and Labels, with the names the slider editor
 * already uses where it has one. Any other part (a custom component's) is listed under its own name.
 *
 * SHORT PATHS. A dotted path may leave out steps that can only be one thing: `Text.colour` is
 * `Text.Fill.colour`, and a part's path may leave out its leading `Parts`. The written steps must
 * appear in order, the first matching the first step and the last the last, case ignored. When
 * more than one path fits it is refused with every candidate named rather than guessed —
 * `Background.colour` could be the fill or the border. An exact path always wins. Decided by the
 * owner on 2026-11-24 (docs/design/animation-designer.md).
 */
import {
  CONTROL_ITSELF,
  OFFERED_PROPERTIES,
  OFFERED_ROOT_PROPERTIES,
  SEQUENCE_KIND,
  buildTarget,
  offeredTargetsFor,
  resolvedPartsOf,
} from './animationModel.js';
import { patternLabel } from './patternLayers.js';
import { choicePartNames } from './choiceGroupLayout.js';

/** The role groups a slider-family part's name starts with, in the order they are listed. */
export const PART_GROUPS = Object.freeze([
  { prefix: 'body', label: 'Body' },
  { prefix: 'pointer', label: 'Pointer' },
  { prefix: 'tick', label: 'Ticks' },
  { prefix: 'label', label: 'Labels' },
]);

/** Names people already see for these parts (sections/SliderEditor.svelte), where camel case would read worse. */
const KNOWN_PART_LABELS = Object.freeze({
  bodyTrackFill: 'Value fill',
  bodySelectedRange: 'Range fill',
  bodyCenterMarker: 'Centre marker',
  tickNumber: 'Numbers',
  // A choice group's, drawn from its rows (choiceGroupLayout.js CHOICE_PARTS).
  thumb: 'Thumb',
  chosen: 'Chosen option',
  option: 'Every option',
  chosenLabel: 'Chosen label',
  optionLabel: 'Every label',
});

/** Where a property of the control itself is listed, and what it is called there. */
const ROOT_PLACES = Object.freeze({
  'Transform.scale': { place: CONTROL_ITSELF, label: 'Scale' },
  'Transform.rotation': { place: CONTROL_ITSELF, label: 'Rotation' },
  'Transform.opacity': { place: CONTROL_ITSELF, label: 'Opacity' },
  'Background.Fill.colour': { place: 'Background', label: 'Fill colour' },
  'Background.Border.colour': { place: 'Background', label: 'Border colour' },
  'Background.Fill.gradient': { place: 'Background', label: 'Gradient' },
  'Text.Fill.colour': { place: 'Text', label: 'Colour' },
});

const PLACE_LABELS = Object.freeze({
  [CONTROL_ITSELF]: 'Whole control',
  Background: 'Background',
  Text: 'Text',
  Channels: 'Channels',
});

/** A pattern's tint (utils/patternLayers.js): listed under Background, by the pattern's name. */
const PATTERN_TINT = /^Background\.Patterns\.([^.]+)\.tint$/;

/** A filmstrip part's frame, which only a sequence animates (animationModel.js). */
const FRAME_TAIL = 'Image.frameIndex';

/** The path bar's separator, and what a person may type for it. */
export const CRUMB_SEPARATOR = ' › ';
// \u203A is the path bar's ›: written escaped, as a regex keeps it, so the chunk stays one byte a
// character (vite.config.js, oneByteChunks).
const TYPED_SEPARATORS = /\s*(?:\u203A|>|\/)\s*|\s+/;

function words(camel) {
  const spaced = String(camel ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1).toLowerCase() : '';
}

/**
 * A part's place in the picker: its role group (Body, Pointer, Ticks, Labels) and its own name
 * there, or no group and its own name for a part that is not named by role.
 */
export function partPlace(partName) {
  const name = String(partName ?? '');
  for (const group of PART_GROUPS) {
    const rest = name.slice(group.prefix.length);
    if (name.startsWith(group.prefix) && /^[A-Z]/.test(rest)) {
      return { group: group.label, label: KNOWN_PART_LABELS[name] ?? words(rest) };
    }
  }
  return { group: '', label: KNOWN_PART_LABELS[name] ?? name };
}

function partOfferedLabel(propertyPath) {
  return OFFERED_PROPERTIES.find((entry) => entry.path === propertyPath)?.label ?? propertyPath;
}

/** The control's name as the path bar starts with it. */
export function controlLabel(control) {
  const core = control?._children?.Core ?? {};
  return String(core.name || core.controlType || 'Control');
}

/**
 * The path bar's steps for one stored target, after the control's own name:
 * `Parts.bodyCap.Layout.scale` → Body, Cap, Scale; `Text.Fill.colour` → Text, Colour;
 * `Transform` (a keyframe animation on the control) → Whole control.
 */
export function targetSteps(target) {
  const path = String(target?.path ?? '').trim();
  if (!path) return [];
  if (path === 'Transform') return [PLACE_LABELS[CONTROL_ITSELF]];
  if (path.startsWith('ValueChannels.')) return [PLACE_LABELS.Channels, path.slice('ValueChannels.'.length)];
  if (path.startsWith('Parts.')) {
    const [, partName, ...rest] = path.split('.');
    const place = partPlace(partName);
    const steps = place.group ? [place.group, place.label] : [place.label];
    const tail = rest.join('.');
    if (!tail) return steps;
    if (tail === FRAME_TAIL) return [...steps, 'Frame'];
    return [...steps, partOfferedLabel(tail)];
  }
  const root = ROOT_PLACES[path];
  if (root) return root.place === CONTROL_ITSELF ? [PLACE_LABELS[CONTROL_ITSELF], root.label] : [PLACE_LABELS[root.place], root.label];
  const pattern = PATTERN_TINT.exec(path);
  if (pattern) return [PLACE_LABELS.Background, `${patternLabel(pattern[1])} tint`];
  return path.split('.');
}

/** The whole path bar as text: `Knob01 › Body › Cap › Scale`. */
export function describeTargetPath(control, target) {
  return [controlLabel(control), ...targetSteps(target)].join(CRUMB_SEPARATOR);
}

/**
 * Everything one control offers an animation of this kind, as the picker's columns: places, then
 * (for a role group) the parts in it, then the properties. Every property carries the `target`
 * exactly as the tab stores it, so choosing one is the same write as choosing it in the tab.
 *
 * A keyframe animation plays on a place, not a property: its entries are the places themselves.
 */
export function targetTree(control, kind = 'transition') {
  const parts = [...Object.keys(resolvedPartsOf(control)), ...choicePartNames(control)];
  if (kind === 'keyframes') return keyframeTree(parts);

  const rootOffered = offeredTargetsFor(control, kind, { onControl: true });
  const partOffered = offeredTargetsFor(control, kind, { onControl: false });
  const places = new Map();
  const placeFor = (id) => {
    if (!places.has(id)) places.set(id, { id, label: PLACE_LABELS[id] ?? id, properties: [], parts: [] });
    return places.get(id);
  };

  placeFor(CONTROL_ITSELF);
  for (const offered of rootOffered) {
    if (offered.scope === 'root' && offered.pattern) {
      placeFor('Background').properties.push(entry(buildTarget(CONTROL_ITSELF, offered), offered.label));
    } else if (offered.scope === 'root') {
      const root = ROOT_PLACES[offered.path];
      // A Knob has no Background or Text section of its own (its words are its Labels parts), so
      // "Knob01 › Text › Colour" would name nothing. The flat list this replaced offered it anyway.
      if (root?.place && root.place !== CONTROL_ITSELF && !control?._children?.[root.place]) continue;
      const place = placeFor(root?.place ?? CONTROL_ITSELF);
      place.properties.push(entry(buildTarget(CONTROL_ITSELF, offered), root?.label ?? offered.label));
    } else if (offered.channel) {
      // "Channel: Knob Value" in the old Change list; under Channels, its label alone.
      const label = String(offered.label ?? offered.channel).replace(/^Channel:\s*/, '');
      placeFor('Channels').properties.push(entry(buildTarget(CONTROL_ITSELF, offered), label, [PLACE_LABELS.Channels, label]));
    }
  }

  const framesByPart = new Map(rootOffered.filter((offered) => offered.part).map((offered) => [offered.part, offered]));
  const groups = new Map();
  const ungrouped = [];
  for (const partName of parts) {
    const where = partPlace(partName);
    const properties = partOffered
      .filter((offered) => offered.scope === 'part')
      .map((offered) => entry(buildTarget(partName, offered), offered.label));
    const frame = framesByPart.get(partName);
    if (frame) properties.push(entry(buildTarget(CONTROL_ITSELF, frame), 'Frame'));
    if (!where.group) {
      ungrouped.push({ id: `part:${partName}`, label: where.label, properties, parts: [], part: partName });
      continue;
    }
    if (!groups.has(where.group)) groups.set(where.group, []);
    groups.get(where.group).push({ id: partName, label: where.label, properties });
  }
  for (const group of PART_GROUPS) {
    const members = groups.get(group.label);
    if (members?.length) placeFor(`group:${group.label}`).parts = members;
    if (members?.length) places.get(`group:${group.label}`).label = group.label;
  }
  return [...places.values(), ...ungrouped].filter((place) => place.properties.length || place.parts.length);
}

function entry(target, label, steps = targetSteps(target)) {
  return { target, label, steps };
}

function keyframeTree(parts) {
  const places = [{ id: CONTROL_ITSELF, label: PLACE_LABELS[CONTROL_ITSELF], properties: [], parts: [], target: { path: 'Transform' } }];
  const groups = new Map();
  for (const partName of parts) {
    const where = partPlace(partName);
    const target = { path: `Parts.${partName}` };
    if (!where.group) {
      places.push({ id: `part:${partName}`, label: where.label, properties: [], parts: [], target, part: partName });
      continue;
    }
    if (!groups.has(where.group)) groups.set(where.group, []);
    groups.get(where.group).push({ id: partName, label: where.label, properties: [], target });
  }
  for (const group of PART_GROUPS) {
    const members = groups.get(group.label);
    if (members?.length) places.push({ id: `group:${group.label}`, label: group.label, properties: [], parts: members });
  }
  return places;
}

/** Every choice in a tree, flat: `{ target, steps }`, steps after the control's name. */
export function flattenTargets(tree) {
  const out = [];
  for (const place of tree ?? []) {
    if (place.target) out.push({ target: place.target, steps: targetSteps(place.target) });
    for (const property of place.properties ?? []) out.push({ target: property.target, steps: property.steps });
    for (const part of place.parts ?? []) {
      if (part.target) out.push({ target: part.target, steps: targetSteps(part.target) });
      for (const property of part.properties ?? []) out.push({ target: property.target, steps: property.steps });
    }
  }
  return out;
}

function splitDotted(path) {
  return String(path ?? '').split('.').map((step) => step.trim()).filter(Boolean);
}

/** Do the written steps fit these full steps: in order, the first on the first and the last on the last? */
function fits(written, full) {
  if (!written.length || written.length > full.length) return false;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!same(written[0], full[0]) || !same(written[written.length - 1], full[full.length - 1])) return false;
  let at = 1;
  for (let i = 1; i < written.length - 1; i += 1) {
    while (at < full.length - 1 && !same(written[i], full[at])) at += 1;
    if (at >= full.length - 1) return false;
    at += 1;
  }
  return true;
}

/**
 * A dotted path, short or whole, to the one stored path it names, among `paths`.
 *
 * Returns `{ path }`, or `{ error, candidates }` when nothing fits or more than one does. A part's
 * path may also leave out its leading `Parts`.
 */
export function resolveShortPath(paths, written) {
  const steps = splitDotted(written);
  if (!steps.length) return { error: 'No path was given.', candidates: [] };
  const all = [...new Set((paths ?? []).map(String))];
  const exact = all.find((path) => path.toLowerCase() === steps.join('.').toLowerCase());
  if (exact) return { path: exact };
  const matches = all.filter((path) => {
    const full = splitDotted(path);
    return fits(steps, full) || (full[0] === 'Parts' && fits(steps, full.slice(1)));
  });
  if (matches.length === 1) return { path: matches[0] };
  if (!matches.length) return { error: `Nothing is called "${steps.join('.')}".`, candidates: [] };
  return {
    error: `"${steps.join('.')}" could be ${matches.length} things: ${matches.join(', ')}. Write more of the path.`,
    candidates: matches,
  };
}

/**
 * The choices a typed search names, best first. What is typed is matched against the path bar's
 * own words — "text col" finds Text › Colour, "cap scale" Body › Cap › Scale — each word the start
 * of a word in a step at or after the last one matched. The control's name may lead
 * ("knob01 text col"). A dotted entry ("Text.colour") is read as a short path instead.
 */
export function searchTargets(entries, query, { controlName = '' } = {}) {
  const text = String(query ?? '').trim();
  if (!text) return [];
  const list = entries ?? [];
  if (text.includes('.') && !/\s/.test(text)) {
    const withoutName = controlName && text.toLowerCase().startsWith(`${controlName.toLowerCase()}.`)
      ? text.slice(controlName.length + 1)
      : text;
    const found = resolveShortPath(list.map((item) => item.target.path), withoutName);
    if (found.path) return list.filter((item) => item.target.path === found.path);
    return list.filter((item) => found.candidates.includes(item.target.path));
  }
  let tokens = text.toLowerCase().split(TYPED_SEPARATORS).filter(Boolean);
  if (controlName && tokens.length > 1 && controlName.toLowerCase().startsWith(tokens[0])) tokens = tokens.slice(1);
  const scored = [];
  for (const item of list) {
    const stepWords = item.steps.map((step) => String(step).toLowerCase().split(/\s+/));
    let at = 0;
    let skipped = 0;
    let ok = true;
    for (const token of tokens) {
      let found = -1;
      for (let s = at; s < stepWords.length; s += 1) {
        if (stepWords[s].some((word) => word.startsWith(token))) { found = s; break; }
      }
      if (found < 0) { ok = false; break; }
      skipped += found - at;
      at = found;
    }
    if (ok) scored.push({ item, score: skipped * 10 + item.steps.length });
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.item);
}

export { CONTROL_ITSELF, SEQUENCE_KIND };
