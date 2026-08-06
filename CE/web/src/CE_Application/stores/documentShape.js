// documentShape.js — what a .cepanel writes down, versus what the editor holds in memory.
//
// createControl() materializes every section a component type declares, at its defaults. That is
// the right in-memory model: everything that reads a control — the property editors, the state
// resolver, interactionRuntime's hit-testing, the renderers — reads deep paths off it and none of
// them should have to think about absence.
//
// It is the wrong thing to WRITE DOWN. A Knob was 100 KB of JSON before anyone touched it. Eliding
// its default slider parts took that to 12 KB; the rest is States, Behavior, Animations, Mouse and
// the remaining section tree, all still at defaults, all still written out in full on every save,
// every autosave, and fifty times over in the undo stack.
//
// So the document is a DIFF against the pristine control of the same type, and the editor's model
// is the diff applied back. Two functions, exact inverses:
//
//     shrinkControl(control)   full  -> sparse   (called by serializePanel)
//     expandControl(sparse)    sparse -> full    (called by deserializePanel)
//
// The invariant that matters is not that the file got smaller. It is that
// expandControl(shrinkControl(c)) deep-equals c, for every component type and every edit anyone
// can make to one — which is what documentShape.test.js spends most of its length asserting.
//
// WHY A DIFF AND NOT A SCHEMA. Storing "only non-default fields" needs a definition of default,
// and the only honest one is "what createControl would have produced", because that is what the
// editor actually starts from. Deriving it from SECTION_DEFAULTS alone would miss each type's
// defaultOverrides and drift the moment one changed.
//
// THE PART THAT IS EASY TO GET WRONG. A missing key means two different things — "unchanged, take
// the default" and "the author deleted it" — and a diff that cannot tell them apart resurrects
// deleted states and parts on the next load. Removals are therefore recorded explicitly, in a
// `_removed` list at the level they happened. They are rare (deleting a Button's Hover state,
// deleting a custom component's layer), which is exactly why the bug would have survived a long
// time before anyone noticed.

import { COMPONENT_TYPES, createControl } from '../models/componentTypes.js';

/** Reserved key: the names present in the pristine control that this document deleted. */
const REMOVED = '_removed';

/** Returned by shrink() to mean "identical to the default — write nothing". */
const OMIT = Symbol('omit');

/**
 * Types that are never elided.
 *
 * CustomComponent instances are built by instantiateCustomComponentPackageControl() from a saved
 * package, not by createControl(), so `createControl('CustomComponent')` is not their default in
 * any meaningful sense — it is an empty shell. Diffing against it would be technically correct and
 * save nothing, while making every custom component's document depend on a shell that has no
 * reason to stay stable. Their content is authored data; authored data is written down.
 */
const NEVER_ELIDE = new Set(['CustomComponent']);

/** Pristine control per type, as JSON so each caller gets its own copy to mutate. */
const pristineCache = new Map();

function pristineFor(controlType) {
  if (!controlType || NEVER_ELIDE.has(controlType) || !COMPONENT_TYPES[controlType]) return null;

  if (!pristineCache.has(controlType)) {
    const control = createControl(controlType);
    // createControl mints an id and a name from a counter. Blanking them here means the real ones
    // always differ from the pristine and so are always written down — which they must be, since
    // nothing can reconstruct an id.
    control._children.Core.id = '';
    control._children.Core.name = '';
    pristineCache.set(controlType, JSON.stringify(control));
  }
  return JSON.parse(pristineCache.get(controlType));
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function sameValue(left, right) {
  if (left === right) return true;
  if (!isPlainObject(left) || !isPlainObject(right)) {
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((item, i) => sameValue(item, right[i]));
    }
    return left === right;
  }
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

/**
 * The diff. Arrays are stored WHOLE when they differ at all: a row list, a layer order and a
 * gradient's stops are edited as units, and an element-wise patch of them would be both unreadable
 * in a git diff and wrong the moment something was inserted rather than changed.
 */
function shrink(value, pristine) {
  if (pristine === undefined) return value;
  if (!isPlainObject(value) || !isPlainObject(pristine)) {
    return sameValue(value, pristine) ? OMIT : value;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const result = shrink(child, pristine[key]);
    if (result !== OMIT) out[key] = result;
  }

  const removed = Object.keys(pristine).filter((key) => !Object.hasOwn(value, key));
  if (removed.length) out[REMOVED] = removed;

  return Object.keys(out).length === 0 ? OMIT : out;
}

/** The inverse. `pristine` is consumed — callers pass a fresh copy. */
function expand(sparse, pristine) {
  if (sparse === undefined) return pristine;
  if (pristine === undefined) return sparse;
  if (!isPlainObject(sparse) || !isPlainObject(pristine)) return sparse;

  const out = pristine;
  for (const key of sparse[REMOVED] ?? []) delete out[key];

  for (const [key, child] of Object.entries(sparse)) {
    if (key === REMOVED) continue;
    out[key] = expand(child, out[key]);
  }
  return out;
}

/** Child controls live in a named map under the Children section. */
const childMapOf = (control) => control?._children?.Children?._children ?? null;

function withChildMap(control, mapped) {
  return {
    ...control,
    _children: {
      ...control._children,
      Children: { ...control._children.Children, _children: mapped },
    },
  };
}

/**
 * Full control -> the sparse form a document stores.
 *
 * Child controls are shrunk first, against their OWN type's pristine — a Container's pristine has
 * an empty child map, so without this every nested control would be stored whole and a panel built
 * out of containers would save nothing at all.
 */
export function shrinkControl(control) {
  const controlType = control?._children?.Core?.controlType;
  const pristine = pristineFor(controlType);
  if (!pristine) return control;

  const kids = childMapOf(control);
  const working = kids && Object.keys(kids).length
    ? withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, shrinkControl(child)])))
    : control;

  const sparse = shrink(working, pristine);
  const out = sparse === OMIT ? {} : sparse;

  // Identity is never elided, whatever the diff said: it is what expandControl looks the type up
  // by, and what everything else addresses the control by.
  out._type = control._type ?? 'Control';
  out._children = { ...out._children };
  out._children.Core = {
    ...out._children.Core,
    id: control._children.Core.id,
    controlType,
  };
  return out;
}

/** The sparse form a document stores -> the full control the editor works with. */
export function expandControl(sparse) {
  const controlType = sparse?._children?.Core?.controlType;
  const pristine = pristineFor(controlType);
  if (!pristine) return sparse;

  const control = expand(sparse, pristine);

  const kids = childMapOf(control);
  if (kids && Object.keys(kids).length) {
    return withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, expandControl(child)])));
  }
  return control;
}

/** Exposed so tests can assert the reserved key never collides with a real model key. */
export const REMOVED_KEY = REMOVED;
export const NEVER_ELIDED_TYPES = NEVER_ELIDE;
