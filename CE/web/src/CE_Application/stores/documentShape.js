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

function pristineJson(controlType) {
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
  return pristineCache.get(controlType);
}

function pristineFor(controlType) {
  const json = pristineJson(controlType);
  return json === null ? null : JSON.parse(json);
}

/* ------------------------------------------------------------------ shared defaults */

// WHAT THE EDITOR HOLDS. The full control, as above — but the parts of it still at their defaults
// are the defaults themselves, one copy per type shared by every control built from it, not a copy
// each. A loaded GAIA held 25 MB, and 11 MB of it was the Corners section alone: 4,159 of them, in
// 13 distinct forms. Shared, the panel holds 2.5 MB.
//
// It is safe because nothing writes into a document object it did not just copy: the document is
// already shared structurally between one undo step and the next (setNestedValueShared copies only
// the path a write passes through), and an in-place write would have corrupted the history. Sharing
// between controls asks the same of every writer that sharing between versions already did.
//
// And it is enforced rather than hoped for: the shared defaults are frozen. A writer that forgot to
// copy throws (modules are strict) instead of repainting every control of that type, and the
// defaults every later control is built from with it. deepClone copies a control without keeping
// two references to one default as one object, so a draft made from it is free to write anywhere.

/** Freezes `value` and everything in it; returns it. */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const sharedPristines = new Map();

/** The pristine control of a type, shared and frozen: for building on, never for writing into. */
function sharedPristineFor(controlType) {
  const json = pristineJson(controlType);
  if (json === null) return null;
  if (!sharedPristines.has(controlType)) sharedPristines.set(controlType, deepFreeze(JSON.parse(json)));
  return sharedPristines.get(controlType);
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

/**
 * The inverse. `pristine` is shared and left as it is: what the diff does not touch is the
 * pristine's own object, and only the objects on the way to a difference are new. Keys come out in
 * the order writing into a copy of the pristine would give them — its own, then any the document
 * adds — because that order is what the next save writes.
 *
 * With `sharing` (expandControls), each new object is also offered to it, and an equal one an
 * earlier control already has is used instead — except along `spine`, the objects a control owns
 * outright (CONTROL_SPINE, below), and what hangs below a spine map without a default of its own.
 */
function expand(sparse, pristine, sharing = null, spine = undefined) {
  if (sparse === undefined) return pristine;
  const share = sharing !== null && spine === undefined;
  if (pristine === undefined || !isPlainObject(sparse) || !isPlainObject(pristine)) {
    return share ? sharing.plain(sparse) : sparse;
  }

  const removed = sparse[REMOVED];
  const changed = Object.keys(sparse);
  if (removed !== undefined) changed.splice(changed.indexOf(REMOVED), 1);
  // What goes in first, so that an object an earlier control already has is found before a copy of
  // the pristine is made for nothing.
  const values = changed.map((key) => (spine === SPINE_MAP && pristine[key] === undefined
    ? sparse[key]
    : expand(sparse[key], pristine[key], sharing, spine === SPINE_MAP ? undefined : spine?.[key])));
  if (share) {
    const found = sharing.find(pristine, removed, changed, values);
    if (found !== undefined) return found;
  }

  let added = false;
  for (const key of changed) if (!Object.hasOwn(pristine, key)) { added = true; break; }

  let out;
  if (!added && !removed?.length) {
    out = { ...pristine };
  } else {
    const keys = Object.keys(pristine).filter((key) => !removed?.includes(key));
    for (const key of changed) if (!keys.includes(key)) keys.push(key);
    out = { ...shapeOf(keys) };
    for (const key of keys) if (Object.hasOwn(pristine, key)) out[key] = pristine[key];
  }
  for (let i = 0; i < changed.length; i++) out[changed[i]] = values[i];
  return share ? sharing.keep(out, pristine, changed) : out;
}

/*  Why expand copies instead of building: V8 keeps an object's properties in a compact, fixed layout
    only while code does not ADD many of them one at a time through a computed key; past a dozen it
    switches the object to a hash table, about three times the size. A copy made by spread starts
    with all its keys, and writing a key it already has adds nothing. So an object gains its keys from
    a copy — of the pristine, or, when the document adds or removes keys, of an empty object with
    exactly the keys it ends up with, made once per key list. Building them one by one doubled the
    memory a loaded GAIA held, and its Corners were already a hash table each before this file
    shared anything: the part baseline withholds `linked`, which every part then added. */
const shapes = new Map();

function shapeOf(keys) {
  const signature = keys.join('\u0000');
  let shape = shapes.get(signature);
  if (!shape) {
    // JSON.parse lays an object out with all its keys at once.
    shape = Object.freeze(JSON.parse(JSON.stringify(Object.fromEntries(keys.map((key) => [key, 0])))));
    shapes.set(signature, shape);
  }
  return shape;
}

/* ------------------------------------------------------------------ one copy of each equal section */

// SHARING WHAT A DOCUMENT CHANGED. With the defaults shared, what a loaded panel holds is what its
// document changed — and a panel changes the same things over and over. GAIA's 818 controls are
// mostly a few dozen designs, each repeated with its own id, name, position and binding; every one
// of them still held its own copy of the same coloured fill, the same rounded corners, the same
// forty-five-part drawing. Two sections expanded from the same default with the same changes are now
// one object, as two sections at their defaults already were: GAIA 8.6 MB loaded to 1.6 MB, the
// AN1x 11.2 MB to 1.4 MB, and neither takes measurably longer to load for it (below).
//
// The rules are the defaults' rules, for the same reasons. An object two controls hold is frozen,
// so a writer that forgot to copy throws instead of changing both; one only a single control holds
// is left as it was. A CONTROL is never shared — the player's script host (setValueAtPath) and the
// editor's own reducers write into the control object they are given — nor is anything on the way
// from it to its parts and its children (CONTROL_SPINE), which belong to that control alone.
//
// What makes it cheap is that expand() already knows what an object was made from. An object it
// builds is fixed by the default it copied and the document's changes to it, so that is what the
// object is looked up by: the default's identity, then each changed key and the (already shared)
// value it got — two or three entries, not the forty keys of a Core section. Only data with no
// default under it (a row list, a binding, an added key) is looked up by all of its keys. Hashing
// every key of every object instead cost more than the load itself. And the lookup comes before the
// copy of the pristine (expand), so an object found is a copy never made: most of them, on GAIA.

/** The objects a control owns: itself, the way to its parts and to its children, and both maps. */
const SPINE_MAP = Symbol('spine map');
const CONTROL_SPINE = { _children: { Parts: { _children: SPINE_MAP }, Children: { _children: SPINE_MAP } } };

/** One load's table of the objects seen so far, by what they were made from. */
function createSharing() {
  const ids = new Map();
  const table = new Map();
  let nextId = 8;
  // A small number per value: Map compares strings and numbers by value and objects by identity,
  // which is exactly the equality wanted, children being shared before their parents are looked up.
  const idOf = (value) => {
    if (value === null) return 1;
    if (value === true) return 2;
    if (value === false) return 3;
    if (value === undefined) return 4;
    let id = ids.get(value);
    if (id === undefined) { id = nextId++; ids.set(value, id); }
    return id;
  };
  const mix = (hash, id) => Math.imul(hash ^ id, 0x01000193);

  /** The equal object already in the table, frozen once two places hold it; or undefined. */
  const lookUp = (hash, matches) => {
    const found = table.get(hash);
    if (found === undefined) return undefined;
    for (const entry of Array.isArray(found) ? found : [found]) {
      if (!matches(entry)) continue;
      if (++entry.count === 2) deepFreeze(entry.object);
      return entry.object;
    }
    return undefined;
  };
  const enter = (hash, entry) => {
    const found = table.get(hash);
    if (found === undefined) table.set(hash, entry);
    else if (Array.isArray(found)) found.push(entry);
    else table.set(hash, [found, entry]);
    return entry.object;
  };
  /** `object`, or the equal one already in the table. */
  const settle = (hash, object, matches, entryFor) => lookUp(hash, matches) ?? enter(hash, entryFor());

  // An object expand() builds is fixed by the pristine it copies, the keys the document changes in
  // it (in their order, which decides where an added key goes), the values they get, and the keys
  // it removes. find() is asked before the object is made, keep() after, about the same object:
  // nothing is expanded in between, so the hash find() worked out is still the one to keep it by.
  let pendingHash = 0;
  let pendingRemoved = '';
  const find = (pristine, removedKeys, changed, values) => {
    let hash = mix(0x2545f491, idOf(pristine));
    for (let i = 0; i < changed.length; i++) hash = mix(mix(hash, idOf(changed[i])), idOf(values[i]));
    const removed = removedKeys === undefined ? '' : JSON.stringify(removedKeys);
    if (removed) hash = mix(hash, idOf(removed));
    pendingHash = hash;
    pendingRemoved = removed;
    return lookUp(hash, (entry) => {
      if (entry.pristine !== pristine || entry.removed !== removed || entry.keys.length !== changed.length) return false;
      for (let i = 0; i < changed.length; i++) {
        if (entry.keys[i] !== changed[i] || entry.object[changed[i]] !== values[i]) return false;
      }
      return true;
    });
  };
  const keep = (object, pristine, changed) => enter(pendingHash, { object, count: 1, pristine, removed: pendingRemoved, keys: changed });

  /** Data with no default under it, by every key and value; what is in it first. */
  const plain = (value) => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
      let hash = mix(0x9e3779b9, value.length);
      for (let i = 0; i < value.length; i++) {
        const item = plain(value[i]);
        if (item !== value[i]) value[i] = item;
        hash = mix(hash, idOf(item));
      }
      return settle(hash, value, ({ object }) => Array.isArray(object) && object.length === value.length
        && object.every((item, i) => item === value[i]), () => ({ object: value, count: 1, pristine: undefined, removed: '', keys: null }));
    }
    let hash = 0x85ebca6b;
    for (const key in value) {
      const child = plain(value[key]);
      if (child !== value[key]) value[key] = child;
      hash = mix(mix(hash, idOf(key)), idOf(child));
    }
    return settle(hash, value, (entry) => {
      if (entry.pristine !== undefined || Array.isArray(entry.object)) return false;
      const keys = entry.keys ??= Object.keys(entry.object);
      let i = 0;
      for (const key in value) if (keys[i++] !== key || entry.object[key] !== value[key]) return false;
      return i === keys.length;
    }, () => ({ object: value, count: 1, pristine: undefined, removed: '', keys: null }));
  };

  // Emptied when the load is done rather than left to the collector: they hold every object the
  // load made, and whether anything still reaches them afterwards is up to the engine. Something
  // did once, measured: GAIA held 2.7 MB loaded instead of 1.7, and an earlier version held more
  // than it had without sharing at all.
  const clear = () => { ids.clear(); table.clear(); };
  return { find, keep, plain, clear };
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

/** What one section of a part is a diff against: SECTION_DEFAULTS for its type, less ALWAYS_WRITTEN. */
function partSectionBaseline(sectionType) {
  const baseline = JSON.parse(JSON.stringify(SECTION_DEFAULTS[sectionType]));
  // Withholding a key from the baseline is what makes shrink() write it and expand() take it
  // back unchanged — the same mechanism an unknown section already goes through.
  for (const [child, keys] of Object.entries(ALWAYS_WRITTEN)) {
    const node = baseline._children?.[child];
    if (node) for (const leaf of keys) delete node[leaf];
  }
  return baseline;
}

/** The baseline for one part: its shell, plus SECTION_DEFAULTS for each section it actually owns. */
function pristinePart(part) {
  const shell = pristinePartShell();
  for (const [key, section] of Object.entries(part?._children ?? {})) {
    if (key === 'Layout' || !SECTION_DEFAULTS[section?._type]) continue;
    shell._children[key] = partSectionBaseline(section._type);
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

/**
 * pristinePart, built from shared, frozen pieces: the shell and one baseline per section type. One
 * per list of sections, so two parts with the same sections have the same default — which is what
 * lets expandControls see that two parts are equal.
 */
let sharedShell = null;
const sharedSectionBaselines = new Map();
const sharedPartPristines = new Map();

function sharedPristinePart(part) {
  sharedShell ??= deepFreeze(pristinePartShell());
  const sections = Object.entries(part?._children ?? {})
    .filter(([key, section]) => key !== 'Layout' && SECTION_DEFAULTS[section?._type]);
  const signature = sections.map(([key, section]) => `${key}\u0000${section._type}`).join('\u0001');
  let pristine = sharedPartPristines.get(signature);
  if (!pristine) {
    const children = { ...sharedShell._children };
    for (const [key, section] of sections) {
      if (!sharedSectionBaselines.has(section._type)) {
        sharedSectionBaselines.set(section._type, deepFreeze(partSectionBaseline(section._type)));
      }
      children[key] = sharedSectionBaselines.get(section._type);
    }
    pristine = Object.freeze({ ...sharedShell, _children: Object.freeze(children) });
    sharedPartPristines.set(signature, pristine);
  }
  return pristine;
}

function expandPart(sparse, sharing = null) {
  if (!isPlainObject(sparse) || !isPlainObject(sparse._children)) return sparse;
  return expand(sparse, sharedPristinePart(sparse), sharing);
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
  return expandControlWith(sparse, null);
}

/**
 * A document's controls, expanded, with one copy of each equal section between them (the comment
 * above createSharing says what that saves and what it asks of writers). What a load calls.
 */
export function expandControls(sparseControls) {
  const sharing = createSharing();
  try {
    return sparseControls.map((sparse) => expandControlWith(sparse, sharing));
  } finally {
    sharing.clear();
  }
}

function expandControlWith(sparse, sharing) {
  const controlType = sparse?._children?.Core?.controlType;
  const pristine = sharedPristineFor(controlType);
  const partOf = (part) => expandPart(part, sharing);
  if (!pristine) return mapAuthoredParts(sparse, new Set(), partOf);

  const typeParts = typePartNames(pristine);
  const control = mapAuthoredParts(expand(sparse, pristine, sharing, CONTROL_SPINE), typeParts, partOf);

  const kids = childMapOf(control);
  if (kids && Object.keys(kids).length) {
    return withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, expandControlWith(child, sharing)])));
  }
  return control;
}

/**
 * A complete control with its authored parts in the form a saved document gives them — the shape
 * of the export payload.
 *
 * The payload is complete because the plug-in's C++ (Player/PanelValueModel.h) reads controls off
 * it raw and cannot rebuild a default it never saw. But nothing in that C++ reads a part. The one
 * thing that draws parts is the player page, and it loads the payload through deserializePanel,
 * whose expandControl gives every authored part its defaults back with expandPart, exactly as the
 * editor does on opening a file. So parts can travel sparse and arrive whole, and only controls
 * need writing out.
 *
 * It is most of the file. A part's section defaults were 26 MB of the AN1x's 35 MB payload and
 * 18.5 of GAIA's 29, and the plug-in parses that file three times while it starts and keeps one
 * juce::var copy for its lifetime: 101 MB for the AN1x, against 42 MB with sparse parts.
 *
 * What it gives up, said rather than found later: a window-closed script that addresses a part by
 * path now reads the saved form, so a property still at its default reads as nothing, and a write
 * into a sub-object that was elided is refused. No panel in the tree has such a script, and the
 * C++ already does not follow a published property into its part, which is the route the API
 * offers for reaching inside a component.
 */
export function shrinkAuthoredParts(control) {
  const pristine = pristineFor(control?._children?.Core?.controlType);
  const kids = childMapOf(control);
  const working = kids && Object.keys(kids).length
    ? withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, shrinkAuthoredParts(child)])))
    : control;
  return mapAuthoredParts(working, typePartNames(pristine), shrinkPart);
}

/** The inverse of shrinkAuthoredParts: a control of the export payload's complete form, made whole. */
export function expandAuthoredParts(control) {
  const pristine = sharedPristineFor(control?._children?.Core?.controlType);
  const kids = childMapOf(control);
  const working = kids && Object.keys(kids).length
    ? withChildMap(control, Object.fromEntries(Object.entries(kids).map(([key, child]) => [key, expandAuthoredParts(child)])))
    : control;
  return mapAuthoredParts(working, typePartNames(pristine), expandPart);
}

/**
 * Everything the sparse `controls` are a diff against, written down for a reader that cannot run
 * createControl: the plug-in's C++ (Player/PanelValueModel.h), which rebuilds an export payload's
 * controls from it the way expandControl does here.
 *
 *   types         each control type the panel uses (children included): its pristine control.
 *   part          the shell every authored part is a diff against.
 *   partSections  each section type an authored part owns: what that section is a diff against.
 *
 * Built by the same functions expandControl uses, so the two cannot disagree about a default.
 */
export function exportDefaultsFor(controls) {
  const types = {};
  const partSections = {};
  const visit = (control) => {
    const controlType = control?._children?.Core?.controlType;
    const pristine = pristineFor(controlType);
    if (pristine && !types[controlType]) types[controlType] = pristine;
    const typeParts = typePartNames(pristine);
    for (const [key, part] of Object.entries(control?._children?.Parts?._children ?? {})) {
      if (typeParts.has(key)) continue;
      for (const [sectionKey, section] of Object.entries(part?._children ?? {})) {
        const sectionType = section?._type;
        if (sectionKey === 'Layout' || !SECTION_DEFAULTS[sectionType] || partSections[sectionType]) continue;
        partSections[sectionType] = partSectionBaseline(sectionType);
      }
    }
    // As expandControl does: a control's children are expanded only when its own type is known.
    if (pristine) for (const child of Object.values(childMapOf(control) ?? {})) visit(child);
  };
  (controls ?? []).forEach(visit);
  return { types, part: pristinePartShell(), partSections };
}

/** Exposed so tests can assert the reserved key never collides with a real model key. */
export const REMOVED_KEY = REMOVED;
export const NEVER_ELIDED_TYPES = NEVER_ELIDE;
