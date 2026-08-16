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
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { createPartNode } from '../utils/customComponentFactory.js';

/** Reserved key: the names present in the pristine control that this document deleted. */
const REMOVED = '_removed';

/** Returned by shrink() to mean "identical to the default — write nothing". */
const OMIT = Symbol('omit');

/**
 * Types held back from the diff.
 *
 * Empty, and it is worth saying why it used to hold CustomComponent. The argument was that its
 * instances come from instantiateCustomComponentPackageControl() rather than createControl(), so
 * the shell is not their default in any meaningful sense, and diffing against it "would save
 * nothing". The first half stands. The second half was simply wrong, and measurably: a custom
 * component carries the same Background, Effects, Mouse, States, Animations, ExternalAPI and
 * Variants sections every other control does, all at their defaults, and Background alone is
 * 4.8 KB. On a panel of 370 hand-drawn controls that is megabytes of identical boilerplate.
 *
 * What IS authored — Parts, Bindings, ValueChannels, HitZones, Behaviors, Designer — is empty in
 * the shell, so it differs from the shell and is written down in full exactly as before. Nothing
 * authored is being inferred; only the boilerplate stops repeating.
 *
 * The remaining objection was that this makes a custom component's document depend on a shell
 * staying still. True, and it is the same dependence every one of the other forty-eight types
 * already has: this file's whole premise is that "default" means "what createControl produced".
 * Singling out one type bought stability nowhere and cost a great deal of disk.
 */
const NEVER_ELIDE = new Set();

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

/* ------------------------------------------------------------------ custom component parts */

// A custom component's CONTROL is authored data and is written whole (above). Its PARTS are not:
// a part is createPartNode()'s shell plus sections that are `deepClone(SECTION_DEFAULTS[name])` —
// stores/controls.js addSection is literally that line — and a shape whose fill is one colour
// still carried five kilobytes of Background defaults it never touched.
//
// That is where a GAIA panel's forty-five megabytes lived. A knob is 45 parts; an LED column with
// glyphs is more; there are hundreds of them, and each one wrote out the full default tree of
// every section it owned. Eliding the parts is the same diff as everywhere else, against a
// baseline that is defined rather than inferred.
//
// THE ONE ASYMMETRY. A section whose every field is default shrinks to nothing, and "nothing" is
// indistinguishable from "this part has no Background at all" — which is a real, different state.
// So an elided section keeps its `_type` as a marker: one key, and it is what expandPart looks the
// defaults up by. Without it a defaulted Background would vanish on save and never come back.

/**
 * Keys inside a part's sections that are written even when they are at their default.
 *
 * `Corners.linked` is here for one reason: normalizeCorner reads it as `if (corners.linked)`, so a
 * Corners object that has elided it — because `true` IS the default — takes the unlinked branch,
 * finds no per-corner data, and returns a corner of radius 0. Every rounded thing on the panel
 * renders as a square while `radius: 999` sits in the file untouched.
 *
 * cornerNormalization.js is fixed to read it as `!== false`, which is what the other tri-state
 * field beside it already does. This entry is the other half: a build from BEFORE that fix still
 * reads `linked` and still draws round knobs. That is the difference between an old build showing
 * a stale panel and an old build showing a broken one, and it costs about sixteen bytes a part.
 *
 * Measured rather than assumed. Rendering all 370 of the GAIA panel's custom components with and
 * without the part diff, `border-radius` was the only CSS declaration that changed — every other
 * part property survives a partial section, because its renderer reads a leaf with a default
 * beside it. Writing the whole Corners object instead would have cost 2.3 KB a part: 4.6 MB to
 * 21 MB, to protect one boolean.
 */
const ALWAYS_WRITTEN = { Corners: ['linked'] };

/** The part shell as createPartNode makes it, with `name` blanked so a real name always survives. */
function pristinePartShell() {
  const shell = createPartNode('');
  shell.name = '';
  return shell;
}

/** The baseline for one part: its shell, plus SECTION_DEFAULTS for each section it actually owns. */
function pristinePart(part) {
  const shell = pristinePartShell();
  for (const [key, section] of Object.entries(part?._children ?? {})) {
    if (key === 'Layout') continue;
    const defaults = SECTION_DEFAULTS[section?._type];
    if (!defaults) continue;

    const baseline = JSON.parse(JSON.stringify(defaults));
    // Withholding a key from the baseline is what makes shrink() write it and expand() take it
    // back unchanged — the same mechanism an unknown section already goes through.
    for (const [child, keys] of Object.entries(ALWAYS_WRITTEN)) {
      const node = baseline._children?.[child];
      if (node) for (const leaf of keys) delete node[leaf];
    }
    shell._children[key] = baseline;
  }
  return shell;
}

function shrinkPart(part) {
  if (!isPlainObject(part) || !isPlainObject(part._children)) return part;

  const sparse = shrink(part, pristinePart(part));
  const out = sparse === OMIT ? {} : sparse;

  // Identity, always: `name` is how a binding target like `Parts.cap.Layout.y` finds it, and
  // `_type` is what marks this as a part rather than a section.
  out._type = part._type ?? 'Part';
  out.name = part.name;
  out._children = { ...out._children };

  // The section markers described above.
  for (const [key, section] of Object.entries(part._children)) {
    if (key === 'Layout' || !SECTION_DEFAULTS[section?._type]) continue;
    out._children[key] = { ...(out._children[key] ?? {}), _type: section._type };
  }
  return out;
}

function expandPart(sparse) {
  if (!isPlainObject(sparse) || !isPlainObject(sparse._children)) return sparse;
  return expand(sparse, pristinePart(sparse));
}

/**
 * Map a control's AUTHORED parts through `fn`.
 *
 * `typeParts` names the parts the control's own pristine already has — a Knob's track, fill and
 * pointer. Those are covered by the ordinary control diff and must be left alone: pre-shrinking
 * one would leave a sparse part to be diffed against a full one, which is not a diff of anything.
 * Everything else is authored — every part of a custom component, and any part someone added to a
 * native control — and gets the part diff.
 */
function mapAuthoredParts(control, typeParts, fn) {
  const parts = control?._children?.Parts?._children;
  if (!isPlainObject(parts) || Object.keys(parts).length === 0) return control;

  const mapped = Object.fromEntries(Object.entries(parts)
    .map(([key, part]) => [key, typeParts.has(key) ? part : fn(part)]));

  return {
    ...control,
    _children: {
      ...control._children,
      Parts: { ...control._children.Parts, _children: mapped },
    },
  };
}

/** The part names a type ships with, which the control-level diff already covers. */
const typePartNames = (pristine) => new Set(Object.keys(pristine?._children?.Parts?._children ?? {}));

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
  // A type with no pristine — held back, or from a newer build — still gets its parts elided,
  // since a part's baseline is SECTION_DEFAULTS and does not depend on the control's type at all.
  if (!pristine) return mapAuthoredParts(control, new Set(), shrinkPart);

  const kids = childMapOf(control);
  let working = kids && Object.keys(kids).length
    ? withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, shrinkControl(child)])))
    : control;
  working = mapAuthoredParts(working, typePartNames(pristine), shrinkPart);

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
  if (!pristine) return mapAuthoredParts(sparse, new Set(), expandPart);

  // Captured before expand(), which consumes the pristine it is handed.
  const typeParts = typePartNames(pristine);
  const control = mapAuthoredParts(expand(sparse, pristine), typeParts, expandPart);

  const kids = childMapOf(control);
  if (kids && Object.keys(kids).length) {
    return withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, expandControl(child)])));
  }
  return control;
}

/** Exposed so tests can assert the reserved key never collides with a real model key. */
export const REMOVED_KEY = REMOVED;
export const NEVER_ELIDED_TYPES = NEVER_ELIDE;
