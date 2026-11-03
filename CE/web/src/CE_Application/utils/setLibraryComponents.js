// setLibraryComponents.js — a set whose family names a library component (piece D4 of
// docs/design/changeable-control-sets.md): "this set's knobs are Studio Knob 1.2".
//
// A set says how its knobs look by patching the built-in Knob (models/controlSetFamilies.js). A
// library component is not a patch: it is a control of another kind, with value channels where a
// knob has a Behavior. So a family that names one is not drawn over the knob; applying the set
// places a linked copy of the component where each knob was, and the copy carries what the knob
// was (what it is called, where it sits, its value and range, its device bindings, its plug-in
// parameter) and remembers the knob, so a set that does not name the component puts it back.
//
// This file decides, without touching a store:
//   - which library components can stand for a family (`componentFit`): one value of the right
//     kind, and a look that reads it as travel, so each copy can take its own knob's range;
//   - what applying a set would place, put back or leave as it is (`planSetComponents`), which the
//     Apply window lists before anything changes.
//
// The set holds `libraryComponents[type] = { id, name, version, fingerprint }`: the package, as the
// library knows it. The channel and caption are read from the component when it is applied, so a
// new version that renames its value is followed rather than stale.

import { panelValueEntries } from './componentPanelValues.js';
import { compareVersions, packageFamily } from './customComponentSourceLink.js';
import { controlFamily } from './controlSetApply.js';

/** The families a library component can stand for, and the kind of value each needs. */
export const SET_COMPONENT_KINDS = {
  Knob: 'value',
  Slider: 'value',
  Button: 'press',
  MomentaryButton: 'press',
  ToggleButton: 'toggle',
  Meter: 'display',
  ProgressBar: 'display',
};

const KIND_NEEDS = {
  value: 'one value a drag moves',
  press: 'an on/off value a press holds',
  toggle: 'an on/off value a click flips',
  display: 'one value it shows and nothing that moves it',
};

const BOOL_TYPES = new Set(['bool', 'boolean', 'toggle']);
const NUMBER_TYPES = new Set(['float', 'int', 'integer', 'number', 'normalized', 'bipolar']);
// What a channel's look may read and still be right whatever the copy's range: its travel, its
// bipolar travel and its printed value. `.raw` and `.value` are the number itself, which a binding
// maps through a fixed input range (utils/interactionRuntime.js), so a knob of another range would
// turn the pointer past its end.
const RANGE_FREE_READS = new Set(['normalized', 'bipolar', 'display', 'text', 'label']);

const sections = (control) => control?._children ?? {};
const typeOf = (control) => String(sections(control).Core?.controlType ?? '');
const idOf = (control) => String(sections(control).Core?.id ?? '');
const nameOf = (control) => String(sections(control).Core?.name ?? idOf(control));

/** Whether this type's family can name a library component. */
export function isSetComponentType(type) {
  return Object.prototype.hasOwnProperty.call(SET_COMPONENT_KINDS, String(type ?? ''));
}

function behaviorsMoving(component, channel) {
  return Object.values(sections(component).Behaviors?._children ?? {})
    .filter((behavior) => behavior && behavior.enabled !== false)
    .filter((behavior) => behavior.valueChannel === channel || (Array.isArray(behavior.valueChannels) && behavior.valueChannels.includes(channel)));
}

function isToggleBehavior(behavior) {
  return String(behavior?.type ?? '').toLowerCase() === 'toggle';
}

function isPressBehavior(behavior) {
  return ['button', 'momentary'].includes(String(behavior?.type ?? '').toLowerCase());
}

function hitZoneActions(component, channel) {
  return Object.values(sections(component).HitZones?._children ?? {})
    .filter((zone) => zone && zone.enabled !== false && zone.targetValueChannel === channel)
    .map((zone) => String(zone.action ?? zone.clickAction ?? ''));
}

/** How the component's bindings read `channel`: the set of suffixes after `channel.<name>.`. */
export function channelReads(component, channel) {
  const reads = new Set();
  const pattern = new RegExp(`channel\\.${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.([A-Za-z]+)`, 'g');
  const scan = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(pattern)) reads.add(match[1]);
    } else if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) scan(inner);
    }
  };
  const children = sections(component);
  for (const section of ['Bindings', 'States', 'Animations', 'Parts']) scan(children[section]);
  return reads;
}

/**
 * The text a copy can carry the control's caption in: the first published text property that no
 * binding writes (a readout is a text a binding fills with the value; it is not a caption).
 */
function captionPath(component) {
  const editable = sections(component).PublishedProperties?.editableProperties ?? {};
  const written = new Set(Object.values(sections(component).Bindings?._children ?? {})
    .filter((binding) => binding && binding.enabled !== false)
    .map((binding) => String(binding.target ?? '')));
  for (const entry of Object.values(editable)) {
    if (!entry || entry.enabled === false) continue;
    const path = String(entry.path ?? '').trim();
    if (/(^|\.)Text\.content$/.test(path) && !written.has(path)) return path;
  }
  return '';
}

/**
 * Whether a library component can stand for `type`'s family, and through which value.
 * `{ ok, channel, caption, reason }`: `channel`, the value the control's goes to; `caption`, the
 * published text its caption goes to ('' when the component has none, and the caption is then not
 * shown); `reason`, in words, when it cannot.
 */
export function componentFit(type, component) {
  const kind = SET_COMPONENT_KINDS[String(type ?? '')];
  if (!kind) return { ok: false, channel: '', caption: '', reason: 'this family cannot name a library component' };
  if (!component?._children) return { ok: false, channel: '', caption: '', reason: 'the library entry holds no component' };
  const channels = sections(component).ValueChannels?._children ?? {};
  const inputs = panelValueEntries(component, 'input')
    .map(([name, entry]) => String(entry?.channel || name))
    .filter((name, index, all) => channels[name] && all.indexOf(name) === index);
  const candidates = inputs.length ? inputs : Object.keys(channels);
  let rangeBound = '';
  for (const name of candidates) {
    const channel = channels[name];
    const valueType = String(channel?.type ?? 'float').trim().toLowerCase();
    const moving = behaviorsMoving(component, name);
    if (kind === 'value' || kind === 'display') {
      if (!NUMBER_TYPES.has(valueType)) continue;
      if (kind === 'value' && !moving.some((behavior) => !isToggleBehavior(behavior) && !isPressBehavior(behavior))) continue;
      // A meter shows its value; a component the pointer moves would let a meter be dragged.
      if (kind === 'display' && moving.length) continue;
      const fixed = [...channelReads(component, name)].filter((read) => !RANGE_FREE_READS.has(read));
      if (fixed.length) { rangeBound ||= name; continue; }
      return { ok: true, channel: name, caption: captionPath(component), reason: '' };
    }
    if (!BOOL_TYPES.has(valueType)) continue;
    const actions = hitZoneActions(component, name);
    const toggles = moving.some(isToggleBehavior) || actions.includes('toggleValue');
    const presses = moving.some(isPressBehavior) || actions.includes('momentaryValue');
    if ((kind === 'toggle' && toggles) || (kind === 'press' && presses)) {
      return { ok: true, channel: name, caption: captionPath(component), reason: '' };
    }
  }
  if (rangeBound) {
    const channel = channels[rangeBound];
    return {
      ok: false, channel: '', caption: '',
      reason: `its look reads ${rangeBound} as a number from ${channel?.min ?? 0} to ${channel?.max ?? 1}, so a control with another range would draw wrongly`,
    };
  }
  return { ok: false, channel: '', caption: '', reason: `it needs ${KIND_NEEDS[kind]}` };
}

/** The library components that can stand for `type`, each with its fit, best first. */
export function fittingLibraryComponents(type, entries = []) {
  const byFamily = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const family = packageFamily(entry?.id);
    if (!family) continue;
    const kept = byFamily.get(family);
    if (!kept || compareVersions(entry.version, kept.version) > 0) byFamily.set(family, entry);
  }
  return [...byFamily.values()]
    .map((entry) => ({ entry, fit: componentFit(type, entry.component) }))
    .sort((a, b) => Number(b.fit.ok) - Number(a.fit.ok) || String(a.entry.name).localeCompare(String(b.entry.name)));
}

/** What a set holds for a library component it names. */
export function setComponentRef(entry) {
  if (!entry) return null;
  return { id: String(entry.id ?? ''), name: String(entry.name ?? ''), version: String(entry.version ?? ''), fingerprint: String(entry.fingerprint ?? '') };
}

/**
 * The library entry a set's reference names: the exact version if the library has it, else the
 * newest of its family (`{ entry, exact }`), or null when the library has none of it.
 */
export function resolveSetComponent(ref, entries = []) {
  const id = String(ref?.id ?? '').trim();
  if (!id) return null;
  const list = Array.isArray(entries) ? entries : [];
  const exact = list.find((entry) => entry?.id === id && entry?.component?._children);
  if (exact) return { entry: exact, exact: true };
  const family = packageFamily(id);
  const newest = list
    .filter((entry) => packageFamily(entry?.id) === family && entry?.component?._children)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  return newest ? { entry: newest, exact: false } : null;
}

/** The component a set names for `type`, or null. */
export function setComponentFor(set, type) {
  const ref = set?.libraryComponents?.[String(type ?? '')];
  return ref?.id ? ref : null;
}

/** Where a copy a set placed came from: `{ setId, type, channel, replaced }`, or null. */
export function setPlacementOf(control) {
  const placement = sections(control).Designer?.setPlacement;
  return placement && typeof placement === 'object' && placement.type ? placement : null;
}

/**
 * Why a control stays itself rather than becoming a copy, or ''. A copy carries a control's value,
 * range, bindings and plug-in parameter; these it cannot, and the Apply window names each.
 */
export function controlStaysReason(control, fit, component) {
  const children = sections(control);
  const behavior = children.Behavior ?? {};
  const type = typeOf(control);
  if (String(behavior.valueMode ?? 'single') !== 'single') return 'it has more than one handle';
  if ((children.Scripts?.scripts ?? []).length) return 'it has a script of its own';
  if (Object.keys(children.Bindings?._children ?? {}).length) return 'it drives other controls through bindings';
  if (type === 'Button' && String(behavior.buttonType ?? 'momentary') === 'toggle' && fit?.channel) {
    const moving = behaviorsMoving(component, fit.channel);
    if (!moving.some(isToggleBehavior) && !hitZoneActions(component, fit.channel).includes('toggleValue')) return 'it is a toggle, and the component only holds while pressed';
  }
  return '';
}

function eachControl(controls, visit) {
  for (const control of Array.isArray(controls) ? controls : []) {
    visit(control);
    eachControl(Object.values(control?._children?.Children?._children ?? {}), visit);
  }
}

/**
 * What applying `newSet` would do with library components, as the Apply window lists it:
 *
 *   place    [{ type, family, ref, entry, fit, controls: [{ id, name }], stays: [{ id, name, reason }] }]
 *            controls of a family the new set names a component for, becoming linked copies;
 *   restore  [{ type, family, from, controls }]  copies an earlier set placed, going back to what
 *            they were, because the new set names no component (or another one) for their family;
 *   missing  [{ type, family, ref }]  a family whose component the library does not have.
 *
 * choices, as the Apply window's: { families (labels; null for all), selected (ids; null for any),
 * includePinned }. A copy made its own (no setPlacement) is never touched; a control pinned to a set
 * moves only with includePinned, as the look does.
 */
export function planSetComponents(panel, newSet, entries = [], choices = {}) {
  const { families = null, selected = null, includePinned = false } = choices;
  const wanted = (control, type) => {
    if (families && !families.has(controlFamily(type))) return false;
    if (selected && !selected.has(idOf(control))) return false;
    return true;
  };
  const place = new Map();
  const restore = new Map();
  const missing = new Map();
  eachControl(panel?.controls, (control) => {
    const type = typeOf(control);
    const placement = typeOf(control) === 'CustomComponent' ? setPlacementOf(control) : null;
    const familyType = placement ? String(placement.type) : type;
    if (!isSetComponentType(familyType)) return;
    const pin = String(sections(control).Core?.controlSetId ?? '').trim();
    if (pin && !(includePinned && pin !== String(newSet?.id ?? ''))) return;
    if (!wanted(control, familyType)) return;
    const ref = setComponentFor(newSet, familyType);
    if (placement) {
      const placedFrom = packageFamily(sections(control).Designer?.sourcePackage?.id ?? sections(control).Designer?.packageId);
      if (ref && packageFamily(ref.id) === placedFrom) return;
      const key = familyType;
      if (!restore.has(key)) restore.set(key, { type: familyType, family: controlFamily(familyType), from: String(sections(control).Designer?.packageName ?? ''), controls: [] });
      restore.get(key).controls.push({ id: idOf(control), name: nameOf(control) });
      if (!ref) return;
    } else if (!ref) {
      return;
    }
    const resolved = resolveSetComponent(ref, entries);
    if (!resolved) {
      if (!missing.has(familyType)) missing.set(familyType, { type: familyType, family: controlFamily(familyType), ref });
      return;
    }
    if (!place.has(familyType)) {
      const fit = componentFit(familyType, resolved.entry.component);
      place.set(familyType, { type: familyType, family: controlFamily(familyType), ref, entry: resolved.entry, exact: resolved.exact, fit, controls: [], stays: [] });
    }
    const row = place.get(familyType);
    if (!row.fit.ok) { row.stays.push({ id: idOf(control), name: nameOf(control), reason: row.fit.reason }); return; }
    // A copy going back and coming in again as another component: what it was decides.
    const source = placement?.replaced ?? control;
    const reason = controlStaysReason(source, row.fit, resolved.entry.component);
    if (reason) row.stays.push({ id: idOf(control), name: nameOf(control), reason });
    else row.controls.push({ id: idOf(control), name: nameOf(control) });
  });
  return { place: [...place.values()], restore: [...restore.values()], missing: [...missing.values()] };
}
