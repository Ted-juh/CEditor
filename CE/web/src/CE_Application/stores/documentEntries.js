// documentEntries.js — the entries of a control's lists, written as what they change.
//
// A saved control is a diff against the pristine control of its type (documentShape.js). That diff
// stops at the entries of a list: a binding, a grab area, a value channel, a choice in a list. The
// pristine has no entry of that name, so there is nothing under it to be a diff against, and every
// entry was written whole, defaults and all:
//
//     {"id":"pitch-up","displayText":"Pitch Up","internalValue":"pitch-up","sendValue":2,
//      "receiveValue":2,"selectedByDefault":false,"enabled":true,"visualOverrides":{}}
//
// Measured over the panels in the tree (2026-10-17), the fields at their defaults in six lists were
// 15% of the saved GAIA panel, 27% of the AN1x and 7% of the QA sheets — more than any one section.
//
// So an entry of these six lists is written as a diff against a BASELINE, by the same rules as the
// rest of the format: an object is diffed key by key, an array is written whole when it differs, and
// a key the baseline has and the entry does not is listed in `_removed`, so a field nobody wrote is
// not read back as the baseline's.
//
//     Bindings._children.<name>      a Binding        HitZones._children.<name>    a HitZone
//     ValueChannels._children.<name> a ValueChannel   Behaviors._children.<name>   a BehaviorModule
//     DeviceBindings.bindings[]      a device binding Value.rows[]                 a choice
//
// It is an encoding of the saved file and nothing more, like the drawings table (documentDrawings.js):
// readPanelDocument puts every default back before migrations or anything else see the document, so
// the editor, the player page and every exporter see each entry as it was. The complete form the
// exporters are handed is not written this way.
//
// THE PLUG-IN'S PAYLOAD is (exportFormDocument in panelModel.js), and carries the baselines it was
// written against in `controlDefaults.entries`, beside the pristine controls its controls are a diff
// against. Its two readers put them back from what it carries, not from their own: the player page
// through readPanelDocument, as here, and the plug-in's C++ as it rebuilds the controls (Player/
// PanelValueModel.h). A payload written before it carried them has its entries whole, and is read as
// it is. GAIA's payload was 1.72 MB and is 1.49; AN1x's 1.93 and 1.44.
//
// WHICH ENTRIES. A map entry is written this way only when it is whole, which is when the type's own
// pristine has no entry of that name: one it does have is a diff against that entry already, and is
// left as it is. A whole entry carries its `_type`, and the written one keeps it whatever the
// baseline says, so a reader knows which entries to put the defaults back into without knowing the
// pristine of every type (a part's elided sections keep theirs for the same reason). An entry that
// has no `_type`, or another one, is written whole as before. A list is written whole whenever it
// differs from its type's, so every one of its entries is written this way.
//
// THE BASELINES ARE PART OF THE FORMAT. They are written out below rather than taken from the
// functions that make a new entry, for two reasons. Those functions take arguments, and several
// defaults follow from them — a channel's label is its name, a grab area's cursor depends on its
// action — so "what the factory makes" is not one object. And a factory is free to change what a
// new entry starts as; a baseline is not, because every file written since reads through it.
// Changing one is a new format version, with a migration that writes the old baseline's values into
// the documents of the old version.
//
// VERSIONS. Format 4 writes this. Only a saved document of format 4 or later has its defaults put
// back: an entry in an older one is whole, and one missing a field there means whatever its reader
// makes of the field's absence, which is not always the baseline's value.

import { deepClone } from '../utils/deepClone.js';

/** Reserved key: the baseline keys an entry does not have (documentShape.js uses the same one). */
const REMOVED = '_removed';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The first format whose saved documents write entries this way. */
export const ENTRY_DIFF_FORMAT = 4;

// One baseline per kind of entry. Each is a new entry with nothing chosen for it: the map entries
// as createBindingNode, createHitZone, createValueChannel and createBehaviorModule make one with an
// empty name and no options, a device binding as dropping a parameter onto a control makes one, a
// choice as the value editor's row has it.
const BINDING = {
  _type: 'Binding',
  name: '',
  enabled: true,
  source: 'value.normalized',
  mapMode: 'range',
  target: '',
  outputUnit: 'percent',
  inputMin: 0,
  inputMax: 1,
  outputMin: 0,
  outputMax: 100,
  falseValue: 0,
  trueValue: 100,
  enumMap: {},
  clamp: true,
  round: false,
  invert: false,
};

const HIT_ZONE = {
  _type: 'HitZone',
  name: '',
  shape: 'rectangle',
  enabled: true,
  visibleInEditor: true,
  priority: 0,
  cursor: 'pointer',
  targetBehavior: 'mainSlider',
  targetValueChannel: 'mainValue',
  targetValueChannelX: '',
  targetValueChannelY: '',
  action: 'dragValue',
  bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' },
  source: 'independent',
  inflate: { x: 0, y: 0, unit: 'px' },
  minTouch: 0,
  condition: '',
  meta: {},
};

const VALUE_CHANNEL = {
  _type: 'ValueChannel',
  name: '',
  label: '',
  type: 'float',
  min: 0,
  max: 1,
  step: 0.01,
  defaultValue: 0,
  currentValue: 0,
  publicInput: true,
  publicOutput: true,
  deviceBindable: true,
  format: { precision: 2, prefix: '', suffix: '', unit: '' },
  snap: { enabled: true, mode: 'step' },
  curve: { mode: 'linear', deadZone: 0, hysteresis: 0 },
  constraints: { enabled: true, normalizedMin: 0, normalizedMax: 1 },
};

const BEHAVIOR_MODULE = {
  _type: 'BehaviorModule',
  name: '',
  type: 'slider',
  role: 'custom',
  enabled: true,
  valueChannel: 'mainValue',
  valueChannels: ['mainValue'],
  geometry: 'linear',
  dragMode: 'auto',
  reverseMouseDirection: false,
  interaction: { pointer: true, keyboard: true, wheel: false, snap: true },
};

const DEVICE_BINDING = {
  kind: 'deviceParameter',
  port: 'value',
  deviceRole: 'mainSynth',
  parameterId: '',
  parameterType: '',
  adoptMetadata: true,
  dryRun: false,
  feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
};

const VALUE_ROW = {
  id: '',
  displayText: '',
  internalValue: '',
  sendValue: '',
  receiveValue: '',
  selectedByDefault: false,
  enabled: true,
  visualOverrides: {},
};

/**
 * The baselines by the section that holds the list. Exposed, frozen, so a test can pin them: changing
 * one changes what every format-4 file says. The plug-in's payload carries the ones it uses.
 */
export const ENTRY_BASELINES = deepFreeze({
  Bindings: BINDING, HitZones: HIT_ZONE, ValueChannels: VALUE_CHANNEL, Behaviors: BEHAVIOR_MODULE,
  DeviceBindings: DEVICE_BINDING, Value: VALUE_ROW,
});

/** The lists, by section: a map of entries of one `_type` (its `_children`), or an array under one key. */
const MAP_SECTIONS = new Set(['Bindings', 'HitZones', 'ValueChannels', 'Behaviors']);
const ARRAY_KEYS = { DeviceBindings: 'bindings', Value: 'rows' };

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// A key JSON would leave out is not there. An entry holding `cursor: undefined` saved whole came
// back without a cursor; diffed, the undefined would leave the key out of the file all the same and
// the baseline's cursor would come back in its place.
const present = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined && typeof object[key] !== 'function';

const sameAsJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * `value` as a diff against `base`, or undefined when it is the same. Its keys go in the order
 * applyDiff gives them back — the baseline's, then the entry's own — so a document read and saved
 * again is the same text, not the same entries with their keys in another order.
 */
function diffFrom(value, base) {
  if (!isPlainObject(value) || !isPlainObject(base)) return sameAsJson(value, base) ? undefined : value;
  const out = {};
  const keys = [...Object.keys(base).filter((key) => Object.hasOwn(value, key)), ...Object.keys(value).filter((key) => !Object.hasOwn(base, key))];
  for (const key of keys) {
    if (!present(value, key)) continue;
    const child = Object.hasOwn(base, key) ? diffFrom(value[key], base[key]) : value[key];
    if (child !== undefined) out[key] = child;
  }
  const removed = Object.keys(base).filter((key) => !present(value, key));
  if (removed.length) out[REMOVED] = removed;
  return Object.keys(out).length ? out : undefined;
}

/** The inverse of diffFrom: the baseline's keys in its order, less the removed, then the entry's own. */
function applyDiff(sparse, base) {
  if (!isPlainObject(sparse) || !isPlainObject(base)) return sparse;
  const removed = Array.isArray(sparse[REMOVED]) ? sparse[REMOVED] : [];
  const out = {};
  for (const key of Object.keys(base)) {
    if (removed.includes(key)) continue;
    out[key] = Object.hasOwn(sparse, key) ? applyDiff(sparse[key], base[key]) : deepClone(base[key]);
  }
  for (const key of Object.keys(sparse)) {
    if (key !== REMOVED && !Object.hasOwn(base, key)) out[key] = sparse[key];
  }
  return out;
}

/** A whole map entry, written: the diff, with its `_type` always (see WHICH ENTRIES). */
function writeMapEntry(entry, base) {
  return { _type: base._type, ...diffFrom(entry, base) };
}

/**
 * `control` with each listed section that `baselines` has a baseline for passed through
 * `edit(sectionName, section, baseline)`, children too.
 */
function mapSections(control, baselines, edit) {
  if (!isPlainObject(control) || !isPlainObject(control._children)) return control;
  let children = null;
  for (const [name, section] of Object.entries(control._children)) {
    let next = section;
    if (name === 'Children' && isPlainObject(section?._children)) {
      let kids = null;
      for (const [key, child] of Object.entries(section._children)) {
        // `_removed` lives in this map too, as a list of names, and is not a control.
        const mapped = isPlainObject(child) ? mapSections(child, baselines, edit) : child;
        if (mapped !== child) (kids ??= { ...section._children })[key] = mapped;
      }
      if (kids) next = { ...section, _children: kids };
    } else if (isPlainObject(section) && (MAP_SECTIONS.has(name) || Object.hasOwn(ARRAY_KEYS, name))
      && isPlainObject(baselines[name])) {
      next = edit(name, section, baselines[name]);
    }
    if (next !== section) (children ??= { ...control._children })[name] = next;
  }
  return children ? { ...control, _children: children } : control;
}

/** One listed section with every entry it holds whole passed through `entryFn(entry, base)`. */
function mapEntries(name, section, base, entryFn) {
  if (MAP_SECTIONS.has(name)) {
    const entries = section._children;
    if (!isPlainObject(entries)) return section;
    let out = null;
    for (const [key, entry] of Object.entries(entries)) {
      if (key === REMOVED || !wholeMapEntry(entry, base)) continue;
      (out ??= { ...entries })[key] = entryFn(entry, base);
    }
    return out ? { ...section, _children: out } : section;
  }
  const key = ARRAY_KEYS[name];
  const list = section[key];
  if (!Array.isArray(list)) return section;
  return { ...section, [key]: list.map((entry) => (isPlainObject(entry) ? entryFn(entry, base) : entry)) };
}

// A baseline without a `_type` would take every entry that has none for whole, and those are the
// diffs against an entry of the type's own pristine (WHICH ENTRIES).
const wholeMapEntry = (entry, base) => isPlainObject(entry) && typeof base._type === 'string' && entry._type === base._type;

/**
 * A document-form control (shrinkControl's) with the entries of its lists written as diffs against
 * their baselines. Its children are done too, against the same baselines. The section of each
 * baseline an entry was written against goes into `used`, when there is one.
 */
export function shrinkEntries(control, used = null) {
  return mapSections(control, ENTRY_BASELINES, (name, section, base) => mapEntries(name, section, base, (entry) => {
    used?.add(name);
    return MAP_SECTIONS.has(name) ? writeMapEntry(entry, base) : (diffFrom(entry, base) ?? {});
  }));
}

/**
 * The inverse of shrinkEntries: every entry with its baseline's defaults put back. `baselines` are
 * the ones the entries were written against: this format's, or what a payload carries. A list with
 * no baseline there is left as it is.
 */
export function restoreEntries(control, baselines = ENTRY_BASELINES) {
  return mapSections(control, baselines, (name, section, base) => mapEntries(name, section, base, applyDiff));
}

/**
 * A document with the defaults put back into the entries of its lists, when it is one that leaves
 * them out: a saved document of format 4 or later (VERSIONS, above), against this format's
 * baselines, or a plug-in payload that carries the baselines it was written against
 * (`controlDefaults.entries`), against those. Anything else is returned as it is: an older document,
 * the complete form, and a payload from before payloads carried them, whose entries are whole.
 */
export function restoreDocumentEntries(doc, formatVersion) {
  if (!Array.isArray(doc?.controls)) return doc;
  let baselines = null;
  if (doc.documentForm === undefined && formatVersion >= ENTRY_DIFF_FORMAT) baselines = ENTRY_BASELINES;
  else if (doc.documentForm === 'export' && isPlainObject(doc.controlDefaults?.entries)) baselines = doc.controlDefaults.entries;
  if (!baselines) return doc;
  let changed = false;
  const controls = doc.controls.map((control) => {
    const restored = restoreEntries(control, baselines);
    changed ||= restored !== control;
    return restored;
  });
  return changed ? { ...doc, controls } : doc;
}
