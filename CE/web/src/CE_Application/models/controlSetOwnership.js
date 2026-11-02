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
import { isColourKey, isTokenReference } from './controlSets.js';
import { deepClone } from '../utils/deepClone.js';

const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');
const pinsOf = (control) => (Array.isArray(control?._children?.Core?.setOverrides) ? control._children.Core.setOverrides : []);

function familyPaths(family) {
  return [
    ...Object.keys(family?.component ?? {}),
    ...Object.entries(family?.parts ?? {}).flatMap(([part, patch]) => Object.keys(patch ?? {}).map((path) => `Parts.${part}.${path}`)),
  ];
}

/** Every colour in a control tree that holds a role, as dotted paths the patch maps use. */
export function colourRolePaths(node, prefix = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  const visit = (key, value) => {
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
 * Which properties of `control` its set decides and which are its own: `{ set, fromSet, own }`,
 * `fromSet` and `own` being Sets of dotted paths, `set` the set the control is drawn with.
 */
export function setOwnership(control, panelSet, sources = {}) {
  const set = controlSetForControl(control, panelSet, sources);
  const fromSet = new Set();
  const own = new Set();
  const pristine = pristineControlFor(typeOf(control));
  if (!control || !pristine) return { set, fromSet, own };
  const pins = new Set(pinsOf(control));
  for (const path of familyPaths(familyPatchFor(set, typeOf(control)))) {
    const mine = readControlPath(control, path);
    if (pins.has(path) || !sameControlValue(mine, readControlPath(pristine, path))) own.add(path);
    else fromSet.add(path);
  }
  // A colour that came as a role and was given a colour of its own; and every role the control
  // holds, which follows the set wherever it was written.
  for (const path of colourRolePaths(pristine)) {
    if (fromSet.has(path) || own.has(path)) continue;
    const value = readControlPath(control, path);
    if (value !== undefined && !isTokenReference(value)) own.add(path);
  }
  for (const path of colourRolePaths(control)) {
    if (pins.has(path)) continue;
    own.delete(path);
    fromSet.add(path);
  }
  return { set, fromSet, own };
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
  return patch;
}
