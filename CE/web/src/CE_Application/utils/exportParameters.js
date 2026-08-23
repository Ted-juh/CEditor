import { COMPONENT_TYPES } from '../models/componentTypes.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
import { canSendMidiControl, isMidiControlBinding, midiControlResolution } from './midiControlBindings.js';
// exportParameters.js — the host-automatable parameter list a panel exposes (Milestone 2).
//
// The exported plugin needs a FIXED, deterministic set of parameters so a DAW can automate them and
// save/restore their values with the window closed. This module turns a panel into that list:
//   - if the panel author defined `panel.exportParameters` explicitly, those win;
//   - otherwise we derive one parameter per value-bearing control — its standard `Value.value`, or
//     each public `ValueChannel` (the synth-facing controls), or what its type declares in
//     `exportValues`. The same derivation runs in the editor (preview/automation UI) and is read by
//     the C++ processor at export to build its APVTS.
//
// THE THIRD DOOR, and why it exists. For a long time there were only two: ValueChannels, and a
// control's `Behavior`. Thirty-five of the fifty component types carry no Behavior section, so this
// function never looked at them and they exported nothing — Crossfader, Ribbon, VectorJoystick,
// Macro and Numpad among them, all things a user would expect to automate, and all bindable to a
// synth parameter in the editor while giving a host no way to move them.
//
// The obvious fix — give those types a Behavior — is wrong: PropertiesPanel mounts a Behavior tab
// off the section's presence, so a crossfader would grow a tab full of button fields. So the type
// declares what it exports instead, in `exportValues`, next to its own section. A type that should
// export NOTHING declares an empty list rather than staying silent, which is the difference between
// a decision and an oversight — and QA-08 reports the two differently.
//
// A parameter entry:
//   { id, label, controlName, path, min, max, defaultValue, unit, midiCC, valueKind }
// `valueKind` is 'float' | 'bool' | 'choice' and is what the C++ side branches on to pick an
// AudioParameterFloat / Bool / Choice. It has to be explicit: a bool and a 0..1 knob are both
// min 0 max 1, so the range cannot tell them apart, and for a long time everything exported as a
// float — which is why a combobox read in the host as an anonymous number.
// `path` is a script address (control name + leaf), so set()/get() and the bridge resolve it the
// same way everywhere. `midiCC` is optional (window-closed CC send); null when unknown.

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize an author-defined parameter entry, dropping anything without an id + path. */
export function normalizeExportParameter(entry) {
  const id = String(entry?.id ?? '').trim();
  const path = String(entry?.path ?? '').trim();
  if (!id || !path) return null;
  const min = num(entry?.min, 0);
  const max = num(entry?.max, min + 1);
  return {
    id,
    label: String(entry?.label ?? id),
    controlName: String(entry?.controlName ?? id.split('.')[0] ?? ''),
    path,
    min,
    max: max === min ? min + 1 : max,
    defaultValue: num(entry?.defaultValue, min),
    unit: String(entry?.unit ?? '').trim(),
    midiCC: entry?.midiCC == null ? null : num(entry.midiCC, 0),
    valueKind: normalizeValueKind(entry),
    // Device wire — which synth parameter this drives (so the C++ processor can send MIDI for
    // automation window-closed). Empty when the control isn't bound to a device parameter.
    deviceRole: String(entry?.deviceRole ?? '').trim(),
    deviceParameterId: String(entry?.deviceParameterId ?? '').trim(),
    // Raw MIDI wire, when the control sends a message rather than driving a profile parameter.
    // Absent (rather than an empty object) when there is none, so the C++ side's "is there one"
    // check is the presence of the field.
    ...(entry?.midiControl ? { midiControl: midiControlDescriptor(entry.midiControl) } : {}),
    // Named-choice export: when 'value', the persisted/automated value is the choice's stable
    // name (choiceValues[i]) rather than its index, so it round-trips even if the visible rows
    // change (cascading lists). 'index' (default) keeps the plain numeric index.
    ...choiceExportFields(entry),
  };
}

/**
 * What kind of host parameter this is: 'float' | 'bool' | 'choice'.
 *
 * Explicit rather than inferred, because the range cannot carry it — a toggle and a 0..1 knob are
 * both min 0 max 1. An author list that predates this field is read as a float, which is what those
 * panels already got.
 */
const VALUE_KINDS = new Set(['float', 'bool', 'choice']);
function normalizeValueKind(entry) {
  const declared = String(entry?.valueKind ?? '').trim();
  if (VALUE_KINDS.has(declared)) return declared;
  // A list written before valueKind existed can still be recognised by what it carries.
  if (Array.isArray(entry?.choiceLabels) && entry.choiceLabels.length > 1) return 'choice';
  return 'float';
}

// Carry the choice metadata through. `choiceLabels` rides on EVERY selector, not just the
// store-by-name ones: the labels are what the host shows in its parameter menu, and a selector
// automated by index needs them just as much as one automated by name.
function choiceExportFields(entry) {
  const labels = Array.isArray(entry?.choiceLabels) ? entry.choiceLabels.map((v) => String(v ?? '')) : [];
  const values = Array.isArray(entry?.choiceValues) ? entry.choiceValues.map((v) => String(v ?? '')) : [];
  const byName = String(entry?.choiceMode ?? 'index') === 'value' && values.length > 0;
  if (!labels.length && !byName) return {};
  return {
    ...(labels.length ? { choiceLabels: labels } : { choiceLabels: values }),
    ...(byName ? {
      choiceMode: 'value',
      choiceValues: values,
      defaultChoice: String(entry?.defaultChoice ?? values[0] ?? ''),
    } : {}),
  };
}

// The fixed choice list of a store-by-name parameter (null for index params).
function paramChoiceValues(param) {
  return String(param?.choiceMode ?? 'index') === 'value' && Array.isArray(param?.choiceValues)
    ? param.choiceValues.map((v) => String(v ?? ''))
    : null;
}

// A store-by-name selector's live value (its choice name) → the FIXED host index
// (position in the full authored list, so it's stable even when the visible rows
// change). null when the param isn't a named choice or the value isn't in the list.
export function choiceIndexOf(param, value) {
  const values = paramChoiceValues(param);
  if (!values) return null;
  const i = values.indexOf(String(value ?? ''));
  return i >= 0 ? i : null;
}

// The reverse: a host index → the choice name to write back to the control.
export function choiceValueAt(param, index) {
  const values = paramChoiceValues(param);
  if (!values || !values.length) return null;
  const i = Math.max(0, Math.min(values.length - 1, Math.round(Number(index) || 0)));
  return values[i];
}

// The pickable choices of a selector, drawn from its Value rows (skipping headers).
function selectorChoices(valueSection) {
  const rows = Array.isArray(valueSection?.rows) ? valueSection.rows : [];
  return rows
    .filter((row) => row?.isHeader !== true)
    .map((row) => ({
      value: String(row?.internalValue ?? row?.id ?? ''),
      label: String(row?.displayText ?? row?.internalValue ?? row?.id ?? ''),
      isDefault: row?.selectedByDefault === true,
    }));
}

// The synth parameter a control is bound to (its first deviceParameter binding), for window-closed
// MIDI — or, failing that, the RAW MIDI message it sends.
//
// WHY BOTH. The exported plugin's automation loop used to skip any parameter with an empty
// deviceParameterId, which is every control bound to a raw CC, aftertouch, NRPN, RPN or program
// change. Those controls automated fine in the DAW — the value moved, the session saved it — and
// sent nothing to the synth with the window closed. Silent, and indistinguishable from a MIDI cable
// problem.
//
// A profile-backed binding still wins when a control has both: it carries the parameter's own
// range, encoding and send policy, where a raw binding carries three bytes.
function deviceWireFor(control) {
  const db = control?._children?.DeviceBindings;
  if (db?.enabled === false) return { deviceRole: '', deviceParameterId: '' };
  const bindings = Array.isArray(db?.bindings) ? db.bindings : [];

  const parameter = bindings.find((x) => x?.kind === 'deviceParameter' && x?.parameterId);
  if (parameter) {
    return {
      deviceRole: String(parameter.deviceRole || DEFAULT_DEVICE_ROLE),
      deviceParameterId: String(parameter.parameterId),
    };
  }

  // `canSendMidiControl` rather than `isMidiControlBinding`: velocity, poly pressure and pitch bend
  // are inbound-only sources. Automating one would have nowhere to send it, and claiming otherwise
  // would put a parameter in the plugin that silently does nothing — the bug this is fixing.
  const raw = bindings.find((x) => isMidiControlBinding(x) && canSendMidiControl(x));
  if (raw) {
    return {
      deviceRole: String(raw.deviceRole || DEFAULT_DEVICE_ROLE),
      deviceParameterId: '',
      midiControl: midiControlDescriptor(raw),
    };
  }

  return { deviceRole: '', deviceParameterId: '' };
}

/**
 * The raw binding, flattened to what the C++ send path needs.
 *
 * Deliberately the binding's own fields rather than a pre-built byte string: the value is not known
 * until the DAW moves the parameter, so the bytes have to be built at send time. PanelParameters.h
 * reads exactly these names.
 */
function midiControlDescriptor(binding) {
  const kind = String(binding?.message ?? binding?.messageId ?? 'cc');
  return {
    kind,
    channel: clampNum(binding?.channel, 0, 16),
    controller: clampNum(binding?.controller, 0, 127),
    parameterMsb: clampNum(binding?.parameterMsb, 0, 127),
    parameterLsb: clampNum(binding?.parameterLsb, 0, 127),
    valueResolution: midiControlResolution(binding),
    nullAfterSend: binding?.nullAfterSend === true,
  };
}

function paramFromChannel(controlName, channelName, channel, single) {
  const min = num(channel?.min, 0);
  const max = num(channel?.max, 1);
  return {
    id: `${controlName}.${channelName}`,
    label: single ? controlName : `${controlName} ${channel?.label ?? channelName}`,
    controlName,
    path: `${controlName}.${channelName}`,
    min,
    max: max === min ? min + 1 : max,
    defaultValue: num(channel?.defaultValue ?? channel?.currentValue, min),
    unit: String(channel?.format?.suffix ?? channel?.format?.unit ?? '').trim(),
    midiCC: null,
    // A value channel is a scalar by construction — there is no enum shape on this path.
    valueKind: 'float',
  };
}

function clampNum(v, lo, hi) {
  const n = num(v, lo);
  return n < lo ? lo : n > hi ? hi : n;
}

// A standard control's value model lives in its Behavior. Returns a parameter for value-bearing
// controls (knobs/sliders, toggles, selectors); null for triggers/decorative controls.
function paramFromBehavior(name, behavior, valueSection = null) {
  const family = String(behavior?.family ?? '');
  const valueType = String(behavior?.valueType ?? '');
  let min;
  let max;
  let defaultValue;
  let choiceFields = {};
  let valueKind = 'float';

  if (family === 'range') {
    min = num(behavior?.min, 0);
    max = num(behavior?.max, 127);
    defaultValue = num(behavior?.defaultCurrentValue ?? behavior?.defaultValue, min);
  } else if (valueType === 'bool') {
    min = 0; max = 1; defaultValue = behavior?.defaultValue === true ? 1 : 0;
    valueKind = 'bool';
  } else if (valueType === 'enum' || family === 'select') {
    const choices = selectorChoices(valueSection);
    const count = choices.length || (Array.isArray(behavior?.enumValues) ? behavior.enumValues.length : 0);
    const defaultIndex = Math.max(0, choices.findIndex((c) => c.isDefault));
    min = 0; max = Math.max(1, count - 1); defaultValue = defaultIndex;
    // Two choices is the floor for a host menu; below that there is nothing to pick between and a
    // plain float is the honest export.
    if (choices.length > 1) valueKind = 'choice';
    // The visible labels always ride along — they are what the host shows in its parameter menu.
    if (choices.length) choiceFields.choiceLabels = choices.map((c) => c.label);
    // Store-by-name additionally keeps the stable choice names, so the persist/restore layer can
    // round-trip by value even when the visible rows change (cascading lists).
    if (valueSection?.storeByValue === true && choices.length) {
      choiceFields.choiceMode = 'value';
      choiceFields.choiceValues = choices.map((c) => c.value);
      choiceFields.defaultChoice = choices[defaultIndex]?.value ?? choices[0]?.value ?? '';
    }
  } else {
    return null; // trigger / none / decorative — not an automatable parameter
  }

  if (max <= min) max = min + 1;
  return {
    id: `${name}.value`,
    label: name,
    controlName: name,
    path: `${name}.value`,
    min,
    max,
    defaultValue: clampNum(defaultValue, min, max),
    unit: String(behavior?.unit ?? '').trim(),
    midiCC: null,
    valueKind,
    ...choiceFields,
  };
}

/** Derive a sensible parameter set from the panel's value-bearing controls. */
export function deriveExportParameters(panel) {
  const out = [];
  for (const control of panel?.controls ?? []) {
    const core = control?._children?.Core;
    const name = core?.name ?? core?.id;
    if (!name) continue;
    const kids = control._children;
    const wire = deviceWireFor(control); // which synth parameter this control drives

    // Custom-component value channels — one parameter per PUBLIC channel.
    const channels = kids.ValueChannels?._children;
    if (channels && typeof channels === 'object') {
      const publicEntries = Object.entries(channels).filter(
        ([, ch]) => !(ch?.publicInput === false && ch?.publicOutput === false),
      );
      const single = publicEntries.length === 1;
      for (const [channelName, channel] of publicEntries) {
        out.push({ ...paramFromChannel(name, channelName, channel, single), ...wire });
      }
      continue;
    }

    // Standard control — derive from its Behavior value model.
    if (kids.Behavior) {
      const param = paramFromBehavior(name, kids.Behavior, kids.Value);
      if (param) out.push({ ...param, ...wire });
      continue;
    }

    // No Behavior: the type's own declaration, if it has one. An empty list is a type that has
    // ruled it exports nothing, and is as final as a parameter.
    for (const spec of COMPONENT_TYPES[core.controlType]?.exportValues ?? []) {
      const param = paramFromTypeSpec(name, spec, kids);
      if (param) out.push({ ...param, ...wire });
    }
  }
  return out;
}

/**
 * A parameter from a component type's own `exportValues` declaration.
 *
 * The range comes from the component where the component names its own bounds (`Numpad.min`/`max`)
 * and is 0..1 otherwise, which is what these components store. That is the whole vocabulary —
 * anything more expressive belongs in a Behavior section, and a type that wants one should have one.
 */
function paramFromTypeSpec(name, spec, sections) {
  const section = sections?.[spec.section];
  if (!section) return null;

  // The stored domain, not the displayed one. These components keep a normalized 0..1 position and
  // a `bipolar` flag that only changes the readout (RibbonRenderer does `value * 2 - 1` for it), so
  // exporting -1..1 would hand the host a range the control does not actually hold.
  const min = spec.minField ? num(section[spec.minField], 0) : 0;
  const max = spec.maxField ? num(section[spec.maxField], 1) : 1;
  const suffix = spec.suffix ?? 'value';

  return {
    id: `${name}.${suffix}`,
    label: spec.label ? `${name} ${spec.label}` : name,
    controlName: name,
    path: `${name}.${suffix}`,
    min,
    max: max === min ? min + 1 : max,
    defaultValue: clampNum(num(section[spec.field], min), min, max === min ? min + 1 : max),
    unit: String(spec.unit ?? '').trim(),
    midiCC: null,
    valueKind: spec.kind === 'bool' || spec.kind === 'choice' ? spec.kind : 'float',
  };
}

/** The panel's host-automatable parameters: explicit author list if present, else derived. */
export function collectExportParameters(panel) {
  const explicit = Array.isArray(panel?.exportParameters) ? panel.exportParameters : [];
  if (explicit.length) return explicit.map(normalizeExportParameter).filter(Boolean);
  return deriveExportParameters(panel);
}
