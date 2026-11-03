// controlSetOwnership.js — which of a control's looks its set decides, and moving a look between the
// set and the control.
//
// The owner: a set is a quick start, but every look it gives a control must stay the author's to
// change. A set decides a property in one of two ways (models/controlSetFamilies.js):
//   - its family patch names the property, and the control still holds the factory value there and
//     has not pinned it (Core.setOverrides);
//   - the property is a colour holding a role ('{accent}', '{control.cap}'), which the set's colours
//     resolve.
// Everything else is the author's own. The inspector marks the two, and two actions move a look
// across (docs/design/changeable-control-sets.md, piece A):
//   - Make this look my own: the control becomes what the set draws, and every property a set could
//     patch is pinned, so no set switch changes its look again. With `keepColourRoles` its colours
//     stay roles and go on following the set's colours; without, they become the colours drawn now.
//   - Reset to the set: a property, or every one, goes back to its factory value and is unpinned, so
//     the set decides it again.
// Pure: the store (stores/controls.js) writes the result, one undo step.

import {
  familyPatchFor, pristineControlFor, readControlPath, resolveControlFamily, resolveControlForSet,
  controlSetForControl, sameControlValue, setPatchablePaths,
} from './controlSetFamilies.js';
import { isColourKey, isTokenReference, resolveColourValue } from './controlSets.js';
import { EDITOR_PATHS } from './controlSetDesigns.js';
import { deepClone } from '../utils/deepClone.js';

const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');
const pinsOf = (control) => (Array.isArray(control?._children?.Core?.setOverrides) ? control._children.Core.setOverrides : []);

function familyPaths(family) {
  return [
    ...Object.keys(family?.component ?? {}),
    ...Object.entries(family?.parts ?? {}).flatMap(([part, patch]) => Object.keys(patch ?? {}).map((path) => `Parts.${part}.${path}`)),
  ];
}

/** Whether `path` names a look a set may decide: EDITOR_PATHS, a part's own keys by their tail. */
export function isLookPath(path) {
  const match = /^Parts\.[^.]+\.(.+)$/.exec(String(path));
  const tail = match ? match[1] : String(path);
  return EDITOR_PATHS.some((pattern) => pattern.test(tail));
}

/**
 * Every look a control holds, as dotted paths: the leaves under its sections and parts that a set
 * may decide (isLookPath). A whole value the vocabulary names (a gradient, a shadow list) is one
 * leaf; State patch maps and other dotted keys are not looks.
 */
export function lookPaths(control) {
  const out = [];
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '_children' || key === '_type' || String(key).includes('.')) continue;
      const path = `${prefix}.${key}`;
      if (isLookPath(path)) out.push(path);
      else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, path);
    }
    for (const [key, child] of Object.entries(node._children ?? {})) {
      if (String(key).includes('.')) continue;
      const path = `${prefix}.${key}`;
      if (isLookPath(path)) out.push(path);
      else walk(child, path);
    }
  };
  for (const [section, node] of Object.entries(control?._children ?? {})) {
    if (section === 'States' || section === 'Animations' || section === 'Scripts') continue;
    walk(node, section);
  }
  return out;
}

/** Every colour in a control tree that holds a role, as dotted paths the patch maps use. */
export function colourRolePaths(node, prefix = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  const visit = (key, value) => {
    // A State's patch map names a property by a dotted key ('Background.Fill.colour'), which a
    // dotted path cannot address; it is not a field of the inspector either.
    if (String(key).includes('.')) return;
    const path = prefix ? `${prefix}.${key}` : String(key);
    if (typeof value === 'string') {
      if (isColourKey(String(key)) && isTokenReference(value)) out.push(path);
    } else if (value && typeof value === 'object') {
      colourRolePaths(value, path, out);
    }
  };
  if (Array.isArray(node)) {
    node.forEach((value, index) => visit(index, value));
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '_children' || key === '_type') continue;
    visit(key, value);
  }
  for (const [key, value] of Object.entries(node._children ?? {})) visit(key, value);
  return out;
}

/**
 * Which properties of `control` its set decides and which are its own:
 *   set       the set the control is drawn with
 *   fromSet   paths it inherits from the set
 *   own       paths it overrides (the inspector's overrides)
 *   setValues path → the value the set would give an overridden one, colours resolved
 *   roles     path → the colour role ('{control.cap}') a colour is drawn from, after the family
 *   detached  the id of the set it was detached from, or ''
 * A detached control has no overrides: its whole look is stored on it (ownLookControl).
 */
export function setOwnership(control, panelSet, sources = {}) {
  const set = controlSetForControl(control, panelSet, sources);
  const fromSet = new Set();
  const own = new Set();
  const setValues = new Map();
  const roles = new Map();
  const detached = String(control?._children?.Core?.detachedFromSet ?? '');
  const pristine = pristineControlFor(typeOf(control));
  const result = { set, fromSet, own, setValues, roles, detached };
  if (!control || !pristine) return result;
  const drawn = resolveControlFamily(control, set);
  for (const path of colourRolePaths(drawn)) roles.set(path, readControlPath(drawn, path));
  if (detached) {
    for (const path of roles.keys()) fromSet.add(path);
    return result;
  }
  const family = familyPatchFor(set, typeOf(control));
  const pins = new Set(pinsOf(control));
  const asShown = (value) => (typeof value === 'string' && isTokenReference(value) ? resolveColourValue(value, set) : value);
  for (const path of familyPaths(family)) {
    const mine = readControlPath(control, path);
    if (pins.has(path) || !sameControlValue(mine, readControlPath(pristine, path))) {
      own.add(path);
      setValues.set(path, asShown(familyValueAt(family, path)));
    } else {
      fromSet.add(path);
    }
  }
  // A colour that came as a role and was given a colour of its own; and every role the control
  // holds, which follows the set wherever it was written.
  for (const path of colourRolePaths(pristine)) {
    if (fromSet.has(path) || own.has(path)) continue;
    const value = readControlPath(control, path);
    if (value !== undefined && !isTokenReference(value)) {
      own.add(path);
      setValues.set(path, asShown(readControlPath(pristine, path)));
    }
  }
  // A look the family does not name, changed from the factory's: the set gives the factory value
  // there, so the control's is its own (and Apply to Set can give it to the family).
  for (const path of lookPaths(control)) {
    if (fromSet.has(path) || own.has(path)) continue;
    const mine = readControlPath(control, path);
    if (mine === undefined || sameControlValue(mine, readControlPath(pristine, path))) continue;
    own.add(path);
    setValues.set(path, asShown(readControlPath(pristine, path)));
  }
  // A role the control holds follows the set's colours: it is the set's, unless it is another role
  // than the one the set gives there (a cap moved from Knob cap to Accent), which is the author's.
  for (const path of colourRolePaths(control)) {
    if (pins.has(path)) continue;
    // Still the factory's role, or the family's: the set decides it. Another role: the author's.
    const mine = readControlPath(control, path);
    const factory = readControlPath(pristine, path);
    const given = familyValueAt(family, path);
    if (!sameControlValue(mine, factory) && (given === undefined || !sameControlValue(mine, given))) {
      own.add(path);
      setValues.set(path, given ?? factory);
      fromSet.delete(path);
      continue;
    }
    own.delete(path);
    setValues.delete(path);
    fromSet.add(path);
  }
  return result;
}

function familyValueAt(family, path) {
  if (Object.hasOwn(family?.component ?? {}, path)) return family.component[path];
  const match = /^Parts\.([^.]+)\.(.+)$/.exec(path);
  return match ? family?.parts?.[match[1]]?.[match[2]] : undefined;
}

/** A colour role's name as the inspector shows it: '{control.cap}' → 'Control Cap'. */
export function colourRoleName(token) {
  return String(token ?? '').replace(/[{}]/g, '').split(/[.\s_-]+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The control with the look its set draws made its own (see the top of the file). `extraSets`: other
 * sets whose families should not reach it either (the library's), beyond the built-ins and its own.
 */
export function ownLookControl(control, panelSet, sources = {}, { keepColourRoles = false, extraSets = [] } = {}) {
  if (!control?._children?.Core) return control;
  const set = controlSetForControl(control, panelSet, sources);
  const drawn = deepClone(keepColourRoles ? resolveControlFamily(control, set) : resolveControlForSet(control, set));
  const patchable = setPatchablePaths(typeOf(control), [set, ...extraSets].filter(Boolean));
  drawn._children.Core.setOverrides = [...new Set([...pinsOf(control), ...patchable])];
  // What the inspector says of it: detached, from which set, and whether its colours stay linked.
  drawn._children.Core.detachedFromSet = String(set?.id ?? '');
  drawn._children.Core.detachedColourRoles = keepColourRoles === true;
  return drawn;
}

/**
 * The patch that hands `paths` back to the set: each to its factory value, unpinned. With no paths,
 * every property a set could decide for this control, and every colour that came as a role.
 */
export function resetToSetPatch(control, paths = null, { extraSets = [] } = {}) {
  const pristine = pristineControlFor(typeOf(control));
  if (!control || !pristine) return {};
  const pins = pinsOf(control);
  const targets = paths
    ? paths.map((path) => String(path).replace(/\._children\./g, '.'))
    : [...new Set([...setPatchablePaths(typeOf(control), extraSets), ...colourRolePaths(pristine), ...pins])];
  const patch = {};
  for (const path of targets) {
    // A property a new control does not have (a pointer's kind) is cleared: `undefined` is the
    // factory value the rule compares with, and a saved document leaves it out.
    const factory = readControlPath(pristine, path);
    if (!sameControlValue(readControlPath(control, path), factory)) patch[path] = factory === undefined ? undefined : deepClone(factory);
  }
  const remaining = pins.filter((path) => !targets.includes(path));
  if (remaining.length !== pins.length) patch['Core.setOverrides'] = remaining;
  // Reattached: inherits from the set again.
  if (!paths && control._children.Core.detachedFromSet !== undefined) {
    patch['Core.detachedFromSet'] = undefined;
    patch['Core.detachedColourRoles'] = undefined;
  }
  return patch;
}
