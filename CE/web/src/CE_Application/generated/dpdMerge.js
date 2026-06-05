// Merge-on-drop seam (architecture doc §"Integration", lines 425/433/437/439).
//
// When a profile parameter is dragged onto a component, "the relevant slice of the profile is
// copied into the value tree as a section that configures that component: its hex address or CC,
// value range, enum entries with their wire values, and any bit-slice/packing detail" — and the
// section is "stamped with the profile id and version it came from (e.g. source: 'roland.jd800@1.2.0')".
// After the drop "the component carries its own MIDI configuration as ordinary value-tree data" —
// self-contained, no profile needed at runtime.
//
// This module is the pure data translation: a resolved DPD parameter (resolve.mjs output) ->
//   (a) a legacy parameter DESCRIPTOR, so the EXISTING fit/adopt logic (componentPorts.js,
//       ParameterBrowserTab.adoptParameterMetadata) keeps working unchanged — the doc's
//       "provided the translation carries the value-type information across", and
//   (b) a self-contained value-tree BINDING SECTION carrying address/CC + enum wire values +
//       packing + the source stamp.
// Browser-safe (no Node deps) so the app imports it directly.

// DPD value-type -> the descriptor `type` the existing red/orange/green check consumes.
export function valueTypeToDescriptorType(valueType) {
  switch (String(valueType ?? '').trim().toLowerCase()) {
    case 'enum': return 'enum';
    case 'toggle':
    case 'boolean':
    case 'bool': return 'boolean';
    case 'signed':
    case 'bipolar': return 'bipolar';
    case 'action':
    case 'trigger': return 'action';
    case 'momentary': return 'momentary';
    case 'continuous':
    case 'integer':
    case 'int':
    default: return 'integer';
  }
}

// resolve.mjs param -> legacy descriptor (the shape getBindingCompatibility + adoptParameterMetadata use).
// enum entries carry their WIRE value as the choice `value` (doc: "enum entries with their wire values").
export function dpdParamToDescriptor(resolved) {
  const type = valueTypeToDescriptorType(resolved?.valueType);
  const choices = Array.isArray(resolved?.enum)
    ? resolved.enum.map((e, i) => ({ id: e.id ?? `choice_${i + 1}`, label: e.label ?? e.id ?? String(e.wire ?? i), value: e.wire ?? i }))
    : [];
  return {
    id: resolved?.resolvedId ?? resolved?.paramId ?? '',
    name: resolved?.name ?? resolved?.paramId ?? resolved?.resolvedId ?? '',
    group: resolved?.group ?? '',
    type,
    valueType: resolved?.valueType ?? 'continuous',
    range: resolved?.range ?? (type === 'integer' || type === 'bipolar' ? { min: 0, max: 127 } : null),
    choices: choices.length ? choices : undefined,
    default: choices.length ? choices[0].id : resolved?.range?.min ?? 0,
    access: {
      canWrite: resolved?.access?.write !== false,
      canRead: resolved?.access?.read !== false,
      // a parameter whose live receive is a single CC/DT1 is realtime-safe; multi-message dumps are not.
      realtimeSafe: (resolved?.size ?? 1) <= 1,
    },
    ui: resolved?.ui ?? null,
  };
}

// resolve.mjs param -> the SELF-CONTAINED value-tree binding section that merge-on-drop copies in.
// Carries everything the component needs to speak to the device without the profile present:
// the directional wires (address or CC), enum wire values, encoding/packing, and the source stamp.
export function dpdParamToBindingSection(resolved, { profileId, version, port = 'value', deviceRole = 'mainSynth' } = {}) {
  const enumWires = Array.isArray(resolved?.enum)
    ? resolved.enum.map((e, i) => ({ id: e.id ?? `choice_${i + 1}`, label: e.label ?? e.id ?? '', wire: e.wire ?? i }))
    : undefined;

  return {
    kind: 'deviceParameter',
    // doc line 437 — the one piece that must not be discarded; enables opt-in re-sync later at zero cost.
    source: profileId ? `${profileId}@${version ?? '0.0.0'}` : undefined,
    parameterId: resolved?.resolvedId ?? resolved?.paramId ?? '',
    deviceRole,
    port,
    valueType: resolved?.valueType ?? 'continuous',
    range: resolved?.range ?? null,
    enum: enumWires,                                   // enum entries WITH wire values (doc 425)
    encoding: resolved?.encoding ?? { type: 'u7' },    // bit-slice / packing detail (doc 439)
    size: resolved?.size ?? 1,
    // the address/CC for each direction — write (DT1), read (RQ1), rxLive (the knob's CC or DT1).
    // A bound panel is frozen against these; it does not consult the profile at runtime.
    wires: {
      write: resolved?.wires?.write ?? null,
      read: resolved?.wires?.read ?? null,
      rxLive: resolved?.wires?.rxLive ?? null,
    },
    feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
  };
}

// The doc's drag-time vocabulary. The existing getBindingCompatibility returns
// compatible/warning/incompatible; the doc speaks green/orange/red. One mapping, no new fit logic.
export function fitStatusToColor(status) {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'compatible': return 'green';
    case 'warning': return 'orange';
    case 'incompatible':
    default: return 'red';
  }
}

// Convenience: produce BOTH halves the binder needs in one call (descriptor for the fit/adopt,
// section for the value tree). The caller still runs the existing getBindingCompatibility on the
// descriptor and writes the section under the chosen port.
export function buildMergeOnDrop(resolved, opts = {}) {
  const descriptor = dpdParamToDescriptor(resolved);
  return {
    descriptor,
    section: dpdParamToBindingSection(resolved, { ...opts, port: opts.port ?? 'value' }),
  };
}
