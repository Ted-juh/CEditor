// documentDrawings.js — a custom component's drawing written once, however many controls use it.
//
// A hand-drawn control's look is its Parts section: a few dozen parts, each with its layout and the
// sections it draws with. Panels reuse a few drawings many times over. The AN1x has 345 hand-drawn
// controls made from 32 drawings, one knob of 16 parts among them used 215 times; GAIA has 184 from
// 36. Every one of those controls carried its own copy, so in a saved GAIA panel of 3.0 MB more than
// 1 MB was the same drawings again.
//
// So a document writes each drawing that more than one control uses once, in a table beside the
// controls, and the controls refer to it:
//
//     "controls": [ … "Parts": {"_drawing": "8c41f02e"} … ],
//     "drawings": { "8c41f02e": {"_children": {"track": {…}, "cap": {…}, …}} }
//
// It is an encoding of the file and nothing more. Loading puts each drawing back into every control
// that refers to it (readPanelDocument, before anything else sees the document), so the editor, the
// player page and everything downstream still see each control with its own Parts. The plug-in's
// C++ does the same as it rebuilds an export payload's controls (Player/PanelValueModel.h).
//
// What is shared is the section exactly as the document form has it, so two controls share a drawing
// when their Parts are identical byte for byte, and not otherwise: a copy whose author changed one
// colour keeps its own. A drawing used once stays where it is. So does a small one, where the
// reference would save next to nothing and cost a reader the indirection.
//
// A drawing's name is a hash of its content, so it does not change when a control elsewhere in the
// panel is added or removed, and a git diff of an edit elsewhere does not renumber the table.
//
// A reference may carry keys of its own beside `_drawing` (an older CEditor that read the file
// without understanding the table keeps the reference and writes any part added to it next to it).
// They go over the drawing the way a diff goes over its base, as everywhere else in the format.

import { deepClone } from '../utils/deepClone.js';

/** The key a Parts section names its drawing by. Reserved: a section has no such key otherwise. */
export const DRAWING_KEY = '_drawing';

/** Below this many characters a drawing is left in place. A reference costs about 40 of its own. */
const SHARED_FROM = 128;

const REMOVED = '_removed';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** FNV-1a over the drawing's text, as eight hex digits. */
function nameFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** `control` with each of its controls (itself, then its children's, depth first) passed through `edit`. */
function mapControl(control, edit) {
  let out = edit(control);
  const kids = out?._children?.Children?._children;
  if (!isObject(kids)) return out;
  let changed = false;
  const mapped = {};
  for (const [key, child] of Object.entries(kids)) {
    // `_removed` lives in this map too, as a list of names, and is not a control.
    mapped[key] = isObject(child) ? mapControl(child, edit) : child;
    changed ||= mapped[key] !== child;
  }
  if (!changed) return out;
  const children = out._children.Children;
  out = { ...out, _children: { ...out._children, Children: { ...children, _children: mapped } } };
  return out;
}

const withParts = (control, parts) => ({ ...control, _children: { ...control._children, Parts: parts } });

/**
 * Document-form controls with every drawing more than one of them uses written once. Returns
 * `{ controls, drawings }`: new controls where a Parts section became a reference (the input is not
 * changed), and the table in the order the drawings first appear, or null when nothing is shared.
 */
export function shareDrawings(controls) {
  const uses = new Map();
  const count = (control) => {
    const parts = control?._children?.Parts;
    if (isObject(parts) && !Object.hasOwn(parts, DRAWING_KEY)) {
      const text = JSON.stringify(parts);
      if (text.length >= SHARED_FROM) uses.set(text, (uses.get(text) ?? 0) + 1);
    }
    return control;
  };
  for (const control of controls ?? []) mapControl(control, count);

  const drawings = {};
  const names = new Map();
  const nameOf = (text) => {
    if (names.has(text)) return names.get(text);
    const base = nameFor(text);
    let name = base;
    for (let n = 2; Object.hasOwn(drawings, name); n += 1) name = `${base}-${n}`;
    names.set(text, name);
    drawings[name] = JSON.parse(text);
    return name;
  };
  const refer = (control) => {
    const parts = control?._children?.Parts;
    if (!isObject(parts)) return control;
    const text = JSON.stringify(parts);
    return (uses.get(text) ?? 0) > 1 ? withParts(control, { [DRAWING_KEY]: nameOf(text) }) : control;
  };
  const shared = (controls ?? []).map((control) => mapControl(control, refer));
  return { controls: shared, drawings: Object.keys(drawings).length ? drawings : null };
}

/** A reference's own keys over its drawing: the drawing's keys less `_removed`, then the reference's. */
function over(own, base) {
  if (!isObject(own) || !isObject(base)) return own;
  const out = { ...base };
  for (const key of own[REMOVED] ?? []) delete out[key];
  for (const [key, value] of Object.entries(own)) {
    if (key !== REMOVED) out[key] = over(value, base[key]);
  }
  return out;
}

/**
 * A document with every drawing put back into the controls that refer to it, and no table. Returns
 * `{ doc, missing }`: `doc` is the input itself when it has neither a table nor a reference (it is
 * never changed), and `missing` names each drawing a control referred to that the table does not
 * have. Such a control opens without it.
 *
 * `keepTable` leaves the table on the document as well, for one from a newer CEditor: whatever such
 * a table holds that this build did not put back (an entry no control names, or anything a later
 * format keeps there) is written back on save, as everything else a newer document carries is
 * (utils/panelFormat.js). serializePanel writes it under the drawings it shares itself.
 */
export function resolveDrawings(doc, { keepTable = false } = {}) {
  const table = isObject(doc?.drawings) ? doc.drawings : {};
  const missing = new Set();
  let referred = false;
  const resolve = (control) => {
    const parts = control?._children?.Parts;
    if (!isObject(parts) || !Object.hasOwn(parts, DRAWING_KEY)) return control;
    referred = true;
    const { [DRAWING_KEY]: name, ...own } = parts;
    const drawing = Object.hasOwn(table, name) && isObject(table[name]) ? table[name] : null;
    if (!drawing) missing.add(String(name));
    // Each control its own copy. What controls end up sharing is decided as they are expanded
    // (expandControls in documentShape.js), which freezes it; an alias made here would be shared
    // without the freeze, by any path that expands a control on its own.
    return withParts(control, drawing ? over(own, deepClone(drawing)) : own);
  };
  const controls = Array.isArray(doc?.controls) ? doc.controls.map((control) => mapControl(control, resolve)) : doc?.controls;
  if (!referred && !Object.hasOwn(doc ?? {}, 'drawings')) return { doc, missing: [] };

  // The document's own key order, less the table unless it is kept.
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'drawings' && !keepTable) continue;
    out[key] = key === 'controls' ? controls : value;
  }
  return { doc: out, missing: [...missing] };
}
