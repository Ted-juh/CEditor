import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
// exportParameters.js — the host-automatable parameter list a panel exposes (Milestone 2).
//
// The exported plugin needs a FIXED, deterministic set of parameters so a DAW can automate them and
// save/restore their values with the window closed. This module turns a panel into that list:
//   - if the panel author defined `panel.exportParameters` explicitly, those win;
//   - otherwise we derive one parameter per value-bearing control — its standard `Value.value`, or
//     each public `ValueChannel` (the synth-facing controls). The same derivation runs in the editor
//     (preview/automation UI) and is read by the C++ processor at export to build its APVTS.
//
// A parameter entry:
//   { id, label, controlName, path, min, max, defaultValue, unit, midiCC }
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
    // Device wire — which synth parameter this drives (so the C++ processor can send MIDI for
    // automation window-closed). Empty when the control isn't bound to a device parameter.
    deviceRole: String(entry?.deviceRole ?? '').trim(),
    deviceParameterId: String(entry?.deviceParameterId ?? '').trim(),
    // Named-choice export: when 'value', the persisted/automated value is the choice's stable
    // name (choiceValues[i]) rather than its index, so it round-trips even if the visible rows
    // change (cascading lists). 'index' (default) keeps the plain numeric index.
    ...choiceExportFields(entry),
  };
}

// Carry the named-choice metadata through unchanged when present.
function choiceExportFields(entry) {
  if (String(entry?.choiceMode ?? 'index') !== 'value') return {};
  const values = Array.isArray(entry?.choiceValues) ? entry.choiceValues.map((v) => String(v ?? '')) : [];
  if (!values.length) return {};
  return {
    choiceMode: 'value',
    choiceValues: values,
    choiceLabels: Array.isArray(entry?.choiceLabels) ? entry.choiceLabels.map((v) => String(v ?? '')) : values,
    defaultChoice: String(entry?.defaultChoice ?? values[0] ?? ''),
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

// The synth parameter a control is bound to (its first deviceParameter binding), for window-closed MIDI.
function deviceWireFor(control) {
  const db = control?._children?.DeviceBindings;
  if (db?.enabled === false) return { deviceRole: '', deviceParameterId: '' };
  const b = (Array.isArray(db?.bindings) ? db.bindings : [])
    .find((x) => x?.kind === 'deviceParameter' && x?.parameterId);
  return b
    ? { deviceRole: String(b.deviceRole || DEFAULT_DEVICE_ROLE), deviceParameterId: String(b.parameterId) }
    : { deviceRole: '', deviceParameterId: '' };
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

  if (family === 'range') {
    min = num(behavior?.min, 0);
    max = num(behavior?.max, 127);
    defaultValue = num(behavior?.defaultCurrentValue ?? behavior?.defaultValue, min);
  } else if (valueType === 'bool') {
    min = 0; max = 1; defaultValue = behavior?.defaultValue === true ? 1 : 0;
  } else if (valueType === 'enum' || family === 'select') {
    const choices = selectorChoices(valueSection);
    const count = choices.length || (Array.isArray(behavior?.enumValues) ? behavior.enumValues.length : 0);
    const defaultIndex = Math.max(0, choices.findIndex((c) => c.isDefault));
    min = 0; max = Math.max(1, count - 1); defaultValue = defaultIndex;
    // Store-by-name: keep the numeric index for the APVTS contract, but attach the
    // stable choice names so the persist/restore layer can round-trip by value.
    if (valueSection?.storeByValue === true && choices.length) {
      choiceFields = {
        choiceMode: 'value',
        choiceValues: choices.map((c) => c.value),
        choiceLabels: choices.map((c) => c.label),
        defaultChoice: choices[defaultIndex]?.value ?? choices[0]?.value ?? '',
      };
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
    }
  }
  return out;
}

/** The panel's host-automatable parameters: explicit author list if present, else derived. */
export function collectExportParameters(panel) {
  const explicit = Array.isArray(panel?.exportParameters) ? panel.exportParameters : [];
  if (explicit.length) return explicit.map(normalizeExportParameter).filter(Boolean);
  return deriveExportParameters(panel);
}
