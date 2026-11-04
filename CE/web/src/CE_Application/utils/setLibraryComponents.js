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
import { instantiateCustomComponentPackageControl } from './customComponentPackage.js';
import { deepClone } from './deepClone.js';
import { numberOr } from './primitives.js';

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
  if (String(children.Meter?.valueSourceId ?? '').trim()) return 'it shows another control\'s value';
  if (children.Meter && String(children.Meter.scale ?? 'linear') === 'db') return 'it reads in decibels';
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
    // A control pinned to another set keeps it unless the window lets pinned controls in; one pinned
    // to the set being applied is drawn with it already, so it takes the set's component too.
    const pin = String(sections(control).Core?.controlSetId ?? '').trim();
    if (pin && pin !== String(newSet?.id ?? '') && !includePinned) return;
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

// ---------------------------------------------------------------------------------------------------
// Placing a copy, and putting the control back

const INSTANCE_CORE_KEYS = ['name', 'layer', 'zIndex', 'visible', 'enabled', 'locked', 'alwaysOnTop', 'tooltip', 'screenReaderText'];
const INSTANCE_TRANSFORM_KEYS = ['x', 'y', 'width', 'height', 'anchor', 'affectsFit', 'rotation', 'scale', 'opacity'];

function copyKeys(from, to, keys) {
  if (!from || !to) return;
  for (const key of keys) if (key in from) to[key] = deepClone(from[key]);
}

const round2 = (value) => Math.round(value * 100) / 100;

function definedOnly(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
}

/** What a control's value is, in the terms of a channel: range, start and how it prints. */
export function controlValueSpec(control, kind) {
  const children = sections(control);
  if (kind === 'display') {
    const meter = children.Meter ?? {};
    return {
      min: numberOr(meter.valueMin, 0), max: numberOr(meter.valueMax, 1), defaultValue: numberOr(meter.value, 0),
      format: definedOnly({ precision: meter.valuePrecision, prefix: meter.valuePrefix, suffix: meter.valueSuffix }),
    };
  }
  const behavior = children.Behavior ?? {};
  if (kind === 'value') {
    return {
      min: numberOr(behavior.min, 0), max: numberOr(behavior.max, 1), step: numberOr(behavior.step, 0.01),
      defaultValue: numberOr(behavior.defaultCurrentValue ?? behavior.defaultValue, 0),
      format: definedOnly({ precision: behavior.precision, prefix: behavior.prefix, suffix: behavior.suffix, unit: behavior.unit }),
    };
  }
  return { defaultValue: kind === 'toggle' ? (behavior.defaultValue === true || Number(behavior.defaultCurrentValue) === 1) : false };
}

/** The text a control shows as its caption: a knob's title, a button's label, a meter's label. */
export function controlCaption(control, kind) {
  const children = sections(control);
  if (kind === 'value') return String(children.Parts?._children?.labelTitle?._children?.Text?.content ?? '').trim();
  if (kind === 'display') return String(children.Meter?.label ?? '').trim();
  return String(children.Text?.content ?? '').trim();
}

/** Write `value` at a dotted path whose `_children` levels are transparent. False when it leads nowhere. */
function writePath(control, path, value) {
  const segments = String(path ?? '').split('.').filter(Boolean);
  let node = control?._children;
  for (let i = 0; i < segments.length; i += 1) {
    const key = segments[i];
    const holder = node?._children && node._children[key] !== undefined ? node._children : node;
    if (!holder || typeof holder !== 'object') return false;
    if (i === segments.length - 1) { holder[key] = value; return true; }
    node = holder[key];
  }
  return false;
}

/**
 * A linked copy of `entry` standing where `control` was. It keeps what the control was called and
 * where it sat; its value takes the control's range, start and format; its device bindings drive the
 * value; the plug-in parameter keeps the id the control exported under, so a DAW's automation still
 * finds it; its caption goes to the component's text. `Designer.setPlacement` records the control,
 * which `restoredControl` puts back.
 */
export function placedCopy(control, entry, fit, { setId = '', type = typeOf(control) } = {}) {
  const kind = SET_COMPONENT_KINDS[type];
  const children = sections(control);
  const name = nameOf(control);
  const transform = {};
  copyKeys(children.Transform, transform, INSTANCE_TRANSFORM_KEYS);
  const copy = instantiateCustomComponentPackageControl(entry.envelope ?? entry, { id: idOf(control), name, Transform: transform });
  if (!copy) return null;
  const out = copy._children;
  // The copy takes the control's place at the component's proportions: the largest box of the
  // component's design shape inside the control's, centred in it, its layers scaled to that
  // (customComponentScale.js). A component designed at 110 by 130 standing in for an 84 by 84 knob
  // is drawn whole and round, about 71 by 84, not squashed into the square or cut off by it.
  const box = {
    x: numberOr(children.Transform?.x, 0), y: numberOr(children.Transform?.y, 0),
    width: numberOr(children.Transform?.width, 0), height: numberOr(children.Transform?.height, 0),
  };
  const designWidth = numberOr(out.Designer?.designWidth, 0);
  const designHeight = numberOr(out.Designer?.designHeight, 0);
  if (designWidth > 0 && designHeight > 0 && box.width > 0 && box.height > 0) {
    const scale = Math.min(box.width / designWidth, box.height / designHeight);
    const width = round2(designWidth * scale);
    const height = round2(designHeight * scale);
    Object.assign(out.Transform, { x: round2(box.x + (box.width - width) / 2), y: round2(box.y + (box.height - height) / 2), width, height });
  }
  out.Transform.contentScaleMode = 'scaleInternals';
  const fitted = { x: out.Transform.x, y: out.Transform.y, width: out.Transform.width, height: out.Transform.height };
  copyKeys(children.Core, out.Core, INSTANCE_CORE_KEYS);
  out.Core.id = idOf(control);
  out.Core.controlType = 'CustomComponent';
  out.ExternalAPI = { ...(out.ExternalAPI ?? { _type: 'ExternalAPI' }), addressableName: name };

  const channel = out.ValueChannels?._children?.[fit.channel];
  const spec = controlValueSpec(control, kind);
  if (channel) {
    if (kind === 'value' || kind === 'display') {
      channel.min = spec.min;
      channel.max = spec.max;
      if (spec.step !== undefined) channel.step = spec.step;
      channel.format = { ...(channel.format ?? {}), ...spec.format };
    }
    channel.defaultValue = spec.defaultValue;
    channel.currentValue = spec.defaultValue;
    channel.label = name;
  }
  for (const [entryName, published] of Object.entries(out.PublishedProperties?.inputs ?? {})) {
    if (!published || String(published.channel || entryName) !== fit.channel) continue;
    if (kind === 'value' || kind === 'display') {
      published.min = spec.min;
      published.max = spec.max;
      if (spec.step !== undefined && 'step' in published) published.step = spec.step;
    }
    published.defaultValue = spec.defaultValue;
    published.label = name;
  }

  const deviceBindings = children.DeviceBindings;
  if (deviceBindings) {
    out.DeviceBindings = {
      ...deepClone(deviceBindings),
      bindings: (deviceBindings.bindings ?? []).map((binding) => ({ ...deepClone(binding), port: fit.channel })),
    };
  }
  // Exactly what exportParameters.paramFromBehavior gave the control.
  out.Core.hostParameters = { [fit.channel]: { id: `${name}.value`, label: name } };

  const caption = controlCaption(control, kind);
  const captionPath = fit.caption && caption && writePath(copy, fit.caption, caption) ? fit.caption : '';
  out.Designer.setPlacement = { setId: String(setId ?? ''), type, channel: fit.channel, caption: captionPath, box, fitted, replaced: deepClone(control) };
  return copy;
}

/**
 * The control a copy was placed for, back where the copy is now: its name, position and size, its
 * value's range and start, and its device bindings as the copy holds them, on the control's own
 * value. Null for a copy no set placed.
 */
export function restoredControl(copy) {
  const placement = setPlacementOf(copy);
  if (!placement?.replaced?._children) return null;
  const control = deepClone(placement.replaced);
  const mine = sections(copy);
  const out = control._children;
  const kind = SET_COMPONENT_KINDS[String(placement.type)];
  copyKeys(mine.Core, out.Core, INSTANCE_CORE_KEYS);
  out.Core.id = String(mine.Core?.id ?? out.Core.id);
  copyKeys(mine.Transform, out.Transform, INSTANCE_TRANSFORM_KEYS);
  // The copy was fitted inside the control's box: undo that fit on where the copy is now, so the
  // control comes back at its own size, moved or resized as the copy was since.
  const box = placement.box;
  const fitted = placement.fitted;
  if (box && fitted && fitted.width > 0 && fitted.height > 0 && mine.Transform) {
    const t = mine.Transform;
    const sx = numberOr(t.width, fitted.width) / fitted.width;
    const sy = numberOr(t.height, fitted.height) / fitted.height;
    out.Transform.width = round2(box.width * sx);
    out.Transform.height = round2(box.height * sy);
    out.Transform.x = round2(numberOr(t.x, fitted.x) - (fitted.x - box.x) * sx);
    out.Transform.y = round2(numberOr(t.y, fitted.y) - (fitted.y - box.y) * sy);
  }

  const channel = mine.ValueChannels?._children?.[placement.channel];
  if (channel && kind === 'value' && out.Behavior) {
    out.Behavior.min = numberOr(channel.min, out.Behavior.min);
    out.Behavior.max = numberOr(channel.max, out.Behavior.max);
    out.Behavior.step = numberOr(channel.step, out.Behavior.step);
    out.Behavior.defaultCurrentValue = numberOr(channel.defaultValue, out.Behavior.defaultCurrentValue);
  } else if (channel && kind === 'display' && out.Meter) {
    out.Meter.valueMin = numberOr(channel.min, out.Meter.valueMin);
    out.Meter.valueMax = numberOr(channel.max, out.Meter.valueMax);
  }
  if (placement.caption) {
    const shown = readPath(copy, placement.caption);
    if (typeof shown === 'string') {
      if (kind === 'value' && out.Parts?._children?.labelTitle?._children?.Text) out.Parts._children.labelTitle._children.Text.content = shown;
      else if (kind === 'display' && out.Meter) out.Meter.label = shown;
      else if (out.Text) out.Text.content = shown;
    }
  }
  if (mine.DeviceBindings) {
    const before = placement.replaced._children.DeviceBindings?.bindings ?? [];
    out.DeviceBindings = {
      ...deepClone(mine.DeviceBindings),
      bindings: (mine.DeviceBindings.bindings ?? []).map((binding, index) => {
        const { port, ...rest } = deepClone(binding);
        if (port !== placement.channel) return { ...rest, port };
        const original = before[index]?.port;
        return original ? { ...rest, port: original } : rest;
      }),
    };
  }
  return control;
}

function readPath(control, path) {
  let node = control?._children;
  for (const key of String(path ?? '').split('.').filter(Boolean)) {
    const holder = node?._children && node._children[key] !== undefined ? node._children : node;
    if (!holder || typeof holder !== 'object') return undefined;
    node = holder[key];
  }
  return node;
}

function mapTree(controls, fn) {
  return (Array.isArray(controls) ? controls : []).map((control) => {
    let next = fn(control);
    const map = next?._children?.Children?._children;
    if (map && typeof map === 'object') {
      const mapped = Object.fromEntries(Object.entries(map).map(([key, child]) => [key, mapTree([child], fn)[0]]));
      next = { ...next, _children: { ...next._children, Children: { ...next._children.Children, _children: mapped } } };
    }
    return next;
  });
}

/**
 * The panel's controls with a plan carried out (`planSetComponents`), skipping the rows the Apply
 * window unticked (`skip`: 'place:Knob', 'restore:Knob'). A copy going to another component goes
 * back first, so it is placed from what it was.
 *
 * Returns `{ controls, changed }`, `changed` listing each control that changed as `{ id, name, type,
 * from, to }`: `from` and `to` the channel its value was and is in ('' for the control's own value).
 */
export function applySetComponentPlan(controls, plan, { skip = new Set(), setId = '' } = {}) {
  const actions = new Map();
  for (const row of plan?.restore ?? []) {
    if (skip.has(`restore:${row.type}`)) continue;
    for (const control of row.controls) actions.set(control.id, { restore: true });
  }
  for (const row of plan?.place ?? []) {
    if (skip.has(`place:${row.type}`) || !row.fit?.ok) continue;
    for (const control of row.controls) actions.set(control.id, { ...(actions.get(control.id) ?? {}), place: row });
  }
  const changed = [];
  const next = mapTree(controls, (control) => {
    const action = actions.get(idOf(control));
    if (!action) return control;
    const placement = setPlacementOf(control);
    let source = control;
    if (placement && (action.restore || action.place)) source = restoredControl(control) ?? control;
    const result = action.place ? placedCopy(source, action.place.entry, action.place.fit, { setId, type: action.place.type }) ?? source : source;
    const type = action.place?.type ?? String(placement?.type ?? typeOf(control));
    changed.push({ id: idOf(control), name: nameOf(result), type, from: placement?.channel ?? '', to: action.place ? action.place.fit.channel : '' });
    return result;
  });
  return { controls: next, changed };
}

/**
 * `control` as a set that names a library component for its family draws it: a linked copy of the
 * component where the control would be, or the control itself when the set names none, the library
 * does not hold it, it does not fit or the control would stay. What Settings › Control Sets' cards
 * draw, so a set's card shows what applying it gives.
 */
export function drawnWithSetComponent(control, set, entries = []) {
  const type = typeOf(control);
  const ref = setComponentFor(set, type);
  if (!ref) return control;
  const resolved = resolveSetComponent(ref, entries);
  if (!resolved) return control;
  const fit = componentFit(type, resolved.entry.component);
  if (!fit.ok || controlStaysReason(control, fit, resolved.entry.component)) return control;
  return placedCopy(control, resolved.entry, fit, { setId: String(set?.id ?? ''), type }) ?? control;
}

/**
 * A panel's controls as `set` draws them with its library components placed, as applying it would:
 * the live preview of Settings › Control Sets. The controls themselves when the set names none.
 */
export function controlsWithSetComponents(panel, set, entries = []) {
  if (!Object.keys(set?.libraryComponents ?? {}).length) return panel?.controls ?? [];
  const plan = planSetComponents(panel, set, entries);
  if (!plan.place.length) return panel?.controls ?? [];
  return applySetComponentPlan(panel?.controls ?? [], plan, { setId: String(set?.id ?? '') }).controls;
}

/**
 * The panel's explicit export list, pointed at where each changed control's value now is. The id
 * stays (it is what the DAW knows). Null when nothing in it changes.
 */
export function repointSetComponentExports(list, changed) {
  if (!Array.isArray(list) || !list.length || !changed.length) return null;
  const byName = new Map(changed.map((entry) => [entry.name, entry]));
  let touched = false;
  const next = list.map((entry) => {
    const change = byName.get(String(entry?.controlName ?? ''));
    if (!change) return entry;
    const from = `${change.name}.${change.from || 'value'}`;
    if (String(entry.path ?? '') !== from) return entry;
    touched = true;
    return { ...entry, path: `${change.name}.${change.to || 'value'}` };
  });
  return touched ? next : null;
}
