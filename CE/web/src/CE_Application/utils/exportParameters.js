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
  };
}

// The synth parameter a control is bound to (its first deviceParameter binding), for window-closed MIDI.
function deviceWireFor(control) {
  const db = control?._children?.DeviceBindings;
  if (db?.enabled === false) return { deviceRole: '', deviceParameterId: '' };
  const b = (Array.isArray(db?.bindings) ? db.bindings : [])
    .find((x) => x?.kind === 'deviceParameter' && x?.parameterId);
  return b
    ? { deviceRole: String(b.deviceRole || 'mainSynth'), deviceParameterId: String(b.parameterId) }
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
function paramFromBehavior(name, behavior) {
  const family = String(behavior?.family ?? '');
  const valueType = String(behavior?.valueType ?? '');
  let min;
  let max;
  let defaultValue;

  if (family === 'range') {
    min = num(behavior?.min, 0);
    max = num(behavior?.max, 127);
    defaultValue = num(behavior?.defaultCurrentValue ?? behavior?.defaultValue, min);
  } else if (valueType === 'bool') {
    min = 0; max = 1; defaultValue = behavior?.defaultValue === true ? 1 : 0;
  } else if (valueType === 'enum' || family === 'select') {
    const count = Array.isArray(behavior?.enumValues) ? behavior.enumValues.length : 0;
    min = 0; max = Math.max(1, count - 1); defaultValue = 0;
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
      const param = paramFromBehavior(name, kids.Behavior);
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
