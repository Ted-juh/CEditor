// Control sets, beyond colour: what a set says about a FAMILY of controls.
//
// A colour token changes a value the control already holds. A family patch changes what the
// control IS — a knob gets a body and a chicken-head pointer, a button gets tighter corners and a
// bead-blast finish — and the question is how that binds to a control the author may have edited.
//
// THE RULE. A family patch names properties and values. Each one is applied only where the control
// still holds its FACTORY default for that property — the value createControl gave it. An author
// who typed a colour, a radius or a size into a field has overridden the set for that property and
// keeps what they typed; everything they left alone follows the set. This is the "document is a
// diff against defaults" idea the .cepanel format already runs on (stores/documentShape.js),
// applied at draw time: the set is, in effect, the defaults the document is a diff against, so a
// set switch redraws every control and keeps every deliberate edit. Nothing is written into the
// document — the resolved tree is what the canvas draws, `documentControl` is what edits go to.
//
// THE SHAPE. `set.families[controlType] = { component, parts, addParts }`:
//   component — `{ 'Background.Corners.radius': 6 }`: dotted paths from the control's sections,
//               exactly as a State's `patches.component` writes them.
//   parts     — `{ bodyCap: { visible: true, 'Layout.width': 72 } }`: per part, dotted paths from
//               the part node, as a State's `patches.parts` writes them.
//   addParts  — `{ jewel: { _type: 'Part', … } }`: whole parts the family adds when the control
//               has no part of that name (a jewel lamp, a guard). Not used by the pilot sets.
// A value may be a colour token reference ('{control.cap}'); the token resolver runs after this.
//
// Copy-on-write, like the token resolver: a control the set has nothing to say about comes back
// as the same object, and one it changes is copied only along the paths that changed.

import { COMPONENT_TYPES, createControl } from './componentTypes.js';
import { SECTION_DEFAULTS } from './sectionDefaults.js';
import { resolveControlTokens, resolveToken, getControlSet } from './controlSets.js';
import { GRAPHITE_SERIES, INSTRUMENT_TYPES, SERIES_ROLES } from './instrumentDesigns.js';
import { typeFamilies } from './controlSetRecipes.js';
import { deepClone } from '../utils/deepClone.js';

const pristineCache = new Map();

/**
 * The control as createControl makes it, one per type, shared and never mutated. Identity fields
 * are blanked so nothing compares equal to them by accident.
 */
export function pristineControlFor(controlType) {
  const type = String(controlType ?? '');
  if (!type || !COMPONENT_TYPES[type]) return null;
  if (!pristineCache.has(type)) {
    const control = createControl(type);
    control._children.Core.id = '';
    control._children.Core.name = '';
    pristineCache.set(type, control);
  }
  return pristineCache.get(type);
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function sameValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => sameValue(item, right[i]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

// A path step resolves through `_children` first, then a plain key — the convention every patch
// map in this codebase uses (interactionRuntime's setTreeValueAtPath, presetPatches).
function stepInto(node, key) {
  if (!node || typeof node !== 'object') return undefined;
  if (node._children && Object.hasOwn(node._children, key)) return node._children[key];
  if (Object.hasOwn(node, key)) return node[key];
  return undefined;
}

export function readControlPath(root, path) {
  let current = root;
  for (const key of String(path).split('.')) {
    current = stepInto(current, key);
    if (current === undefined) return undefined;
  }
  return current;
}

// What a missing intermediate node should be. A section or sub-section that the control lacks is
// created from its defaults so the renderer finds every sibling it expects (a part with no
// Effects gets the whole Effects section, not an Effects with only Material in it).
function defaultNodeFor(parentPath, key) {
  const tail = parentPath.length ? parentPath[parentPath.length - 1] : '';
  if (key === 'Effects' && (tail === 'Background' || tail === 'Border' || /Effects$/.test(key) === false)) {
    return deepClone(SECTION_DEFAULTS.Effects);
  }
  if (SECTION_DEFAULTS[key] && parentPath.length === 0) return deepClone(SECTION_DEFAULTS[key]);
  if (SECTION_DEFAULTS.Effects._children[key] && tail === 'Effects') return deepClone(SECTION_DEFAULTS.Effects._children[key]);
  return {};
}

/**
 * `root` with `value` written at `path`, copying only the nodes along the way. Where a node is
 * missing it is created (see defaultNodeFor); a missing node is placed under `_children` when
 * its parent has a `_children` map, as a plain key otherwise.
 */
export function writeControlPath(root, path, value) {
  const keys = String(path).split('.');
  const walk = (node, index, parentPath) => {
    const key = keys[index];
    const last = index === keys.length - 1;
    const base = isPlainObject(node) ? node : {};
    const inChildren = base._children && Object.hasOwn(base._children, key);
    const inPlain = Object.hasOwn(base, key);
    const existing = inChildren ? base._children[key] : (inPlain ? base[key] : undefined);
    const next = last
      ? deepClone(value)
      : walk(existing === undefined ? defaultNodeFor(parentPath, key) : existing, index + 1, [...parentPath, key]);
    if (!last && next === existing) return node;
    // A new key goes under `_children` when the parent keeps its children there and what is
    // being written is a node (a section, a part) rather than a value.
    const isNode = isPlainObject(next) && (next._type !== undefined || next._children !== undefined);
    if (inChildren || (!inPlain && base._children && (!last || isNode))) {
      return { ...base, _children: { ...base._children, [key]: next } };
    }
    return { ...base, [key]: next };
  };
  return walk(root, 0, []);
}

function applyPatchWhereDefault(target, pristine, patch, prefix, out) {
  for (const [path, value] of Object.entries(patch ?? {})) {
    const current = readControlPath(target, path);
    const factory = readControlPath(pristine, path);
    // The author changed this one: it is theirs. (A property neither has counts as unchanged.)
    if (!sameValue(current, factory)) continue;
    if (sameValue(current, value)) continue;
    out = writeControlPath(out, prefix ? `${prefix}.${path}` : path, value);
  }
  return out;
}

/**
 * The family patch a set holds for a control type, or null: the set's `type` block (its fonts,
 * as families — controlSetRecipes.typeFamilies) with the set's own families over it. Computed
 * once per set object; this runs for every control on every draw.
 */
const familiesWithType = new WeakMap();
function effectiveFamilies(set) {
  if (!set || typeof set !== 'object') return null;
  if (familiesWithType.has(set)) return familiesWithType.get(set);
  const fromType = typeFamilies(set.type);
  const own = set.families && typeof set.families === 'object' ? set.families : {};
  let out;
  if (!Object.keys(fromType).length) {
    out = own;
  } else {
    out = { ...fromType };
    for (const [type, patch] of Object.entries(own)) {
      const base = fromType[type];
      if (!base || !patch || typeof patch !== 'object') { out[type] = patch; continue; }
      const parts = { ...(base.parts ?? {}) };
      for (const [part, paths] of Object.entries(patch.parts ?? {})) parts[part] = { ...(parts[part] ?? {}), ...paths };
      out[type] = { ...base, ...patch, component: { ...(base.component ?? {}), ...(patch.component ?? {}) }, parts };
      if (!Object.keys(out[type].component).length) delete out[type].component;
      if (!Object.keys(out[type].parts).length) delete out[type].parts;
    }
  }
  familiesWithType.set(set, out);
  return out;
}

export function familyPatchFor(set, controlType) {
  const patch = effectiveFamilies(set)?.[String(controlType ?? '')];
  return patch && typeof patch === 'object' ? patch : null;
}

/**
 * A control with its set's family patch applied under the rule above. Not a token resolution —
 * the values written may still be references; run resolveControlTokens after (or use
 * resolveControlForSet, which does both).
 */
export function resolveControlFamily(control, set) {
  set = controlSetForControl(control, set);
  return withSetVoices(patchFamily(control, set), set);
}

function patchFamily(control, set) {
  const type = control?._children?.Core?.controlType;
  const family = familyPatchFor(set, type);
  if (!family) return control;
  const pristine = pristineControlFor(type);
  if (!pristine) return control;

  let out = applyPatchWhereDefault(control, pristine, family.component, '', control);

  const parts = control._children?.Parts?._children ?? {};
  const pristineParts = pristine._children?.Parts?._children ?? {};
  for (const [partName, patch] of Object.entries(family.parts ?? {})) {
    const part = parts[partName];
    const factory = pristineParts[partName];
    if (!part || !factory) continue;
    out = applyPatchWhereDefault(part, factory, patch, `Parts.${partName}`, out);
  }

  if (family.addParts && control._children?.Parts) {
    for (const [partName, node] of Object.entries(family.addParts)) {
      if (parts[partName] || !isPlainObject(node)) continue;
      out = writeControlPath(out, `Parts.${partName}`, { ...deepClone(node), name: partName });
    }
  }
  return out;
}

// The instruments, and the step sequencer's tracks. Not the Meter: its green, amber and red zones
// are levels (safe, hot, clipping), not voices, and read the same on every set.
const VOICED_TYPES = new Set([...INSTRUMENT_TYPES, 'StepSequencer']);
const sixDigit = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(text) ? `FF${text}` : /^FF[0-9A-F]{6}$/.test(text) ? text : '';
};

/**
 * An instrument's lanes, slots, scenes and tracks carry a colour each, and the factory gives them
 * the palette's: the Macro's first assignment is Graphite's green because green IS the first
 * voice. One that still wears one of the six palette colours speaks that voice, and takes the
 * set's colour for it. A colour the author chose that is not one of the six is theirs and stays.
 * Graphite's series is the palette, so under Graphite nothing moves; and since this runs at draw
 * time, like the family patch, nothing is written into the document.
 */
function withSetVoices(control, set) {
  const type = control?._children?.Core?.controlType;
  const section = control?._children?.[type];
  if (!VOICED_TYPES.has(type) || !isPlainObject(section)) return control;
  const voices = new Map();
  GRAPHITE_SERIES.forEach((colour, i) => {
    const own = sixDigit(resolveToken(SERIES_ROLES[i], set));
    if (own && own !== colour) voices.set(colour, own);
  });
  if (!voices.size) return control;
  let changed = null;
  for (const [key, value] of Object.entries(section)) {
    if (!Array.isArray(value)) continue;
    let touched = false;
    const next = value.map((item) => {
      const own = isPlainObject(item) ? voices.get(sixDigit(item.colour)) : undefined;
      if (!own) return item;
      touched = true;
      return { ...item, colour: own };
    });
    if (touched) (changed ??= {})[key] = next;
  }
  if (!changed) return control;
  return { ...control, _children: { ...control._children, [type]: { ...section, ...changed } } };
}

/**
 * Everything a set does to a control, in the order it has to happen: the family patch first (it
 * may write token references), then the colour tokens. This is what the canvas draws, what the
 * build bakes, and what a script reads.
 */
export function resolveControlForSet(control, set) {
  set = controlSetForControl(control, set);
  return resolveControlTokens(resolveControlFamily(control, set), set);
}

/** A built-in design pinned to an individual control survives copying into another panel. */
export function controlSetForControl(control, panelSet) {
  return getControlSet(control?._children?.Core?.controlSetId) ?? panelSet;
}
