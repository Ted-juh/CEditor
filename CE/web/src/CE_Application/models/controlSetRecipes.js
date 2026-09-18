// The recurring shapes a catalogue set is made of, so thirty sets can say what they mean in a
// line each and models/controlSetFamilies.js gets the same well-formed patch every time.
//
// A knob is a cap (or none), a pointer and a track; a button is corners, a hairline and a finish.
// Every helper returns the `families` fragment a set holds — see controlSetFamilies.js for how a
// fragment binds to a control. Colours are token references so a variant of a set that changes
// only its palette changes these too.

const BUTTON_TYPES = ['Button', 'MomentaryButton', 'ToggleButton'];

function material(kind, strength = 100, shine = 100, grain = 100) {
  return kind
    ? {
      'Background.Effects.Material.enabled': true,
      'Background.Effects.Material.kind': kind,
      'Background.Effects.Material.strength': strength,
      'Background.Effects.Material.shine': shine,
      'Background.Effects.Material.grain': grain,
    }
    : {};
}

/**
 * A knob family.
 *   cap      — diameter as a % of the track's diameter (0 = no cap: the arc-and-dot knob)
 *   capFill / capEdge / capEdgeWidth — the disc (defaults: the set's cap tokens, 1 px)
 *   pointer  — 'dot' (rides the arc) | 'line' | 'chicken'; pointerWidth px; pointerLength % of the
 *              cap's radius; pointerFill (default: the marker token)
 *   track    — thickness px of the arc and its fill; trackOpacity hides an arc a set does not want
 *   capMaterial — [kind, strength, shine, grain]
 */
export function knobFamily({
  cap = 0, capFill = '{control.cap}', capEdge = '{control.cap.edge}', capEdgeWidth = 1, capMaterial = null,
  pointer = 'dot', pointerWidth = 2, pointerLength = 88, pointerFill = '{control.marker}', dotSize = 0,
  track = 0, trackOpacity = 1, readoutFill = null,
} = {}) {
  const parts = {};
  // The value readout sits in the middle of the knob, which with a cap on is the middle of the
  // cap: a cream cap under a cream label is a label nobody reads. `readoutFill` names the ink
  // that reads on the cap — usually the pointer's, which contrasts with the cap by construction.
  if (cap > 0 && readoutFill) parts.labelValue = { 'Text.Fill.colour': readoutFill };
  if (cap > 0) {
    parts.bodyCap = {
      visible: true,
      'Layout.width': cap,
      'Layout.height': cap,
      'Background.Fill.colour': capFill,
      'Background.Border.enabled': true,
      'Background.Border.colour': capEdge,
      'Background.Border.thickness': capEdgeWidth,
      ...material(...(capMaterial ?? [null])),
    };
  }
  if (pointer === 'line' || pointer === 'chicken') {
    parts.pointerCurrent = {
      kind: pointer,
      'Layout.width': pointerWidth,
      'Layout.height': pointerLength,
      'Background.Fill.colour': pointerFill,
      'Background.Border.enabled': false,
    };
  } else if (dotSize > 0) {
    parts.pointerCurrent = { 'Layout.width': dotSize, 'Layout.height': dotSize };
  }
  if (track > 0 || trackOpacity !== 1) {
    const patch = {};
    if (track > 0) patch['Layout.height'] = track;
    if (trackOpacity !== 1) patch.opacity = trackOpacity;
    parts.bodyTrackBase = { ...patch };
    parts.bodyTrackFill = { ...patch };
  }
  return { Knob: { parts } };
}

/**
 * The button-like families (Button, momentary, toggle, Combobox): corner radius, hairline
 * thickness, an optional finish, and an optional legend colour for a set whose buttons are a
 * different tone from its panel (a cream key on black tolex takes `{text.inverse}`).
 */
export function buttonFamily({ radius = 8, border = 1, buttonMaterial = null, comboMaterial = null, text = null, fieldText = null, comboText = null } = {}) {
  const component = {
    'Background.Corners.radius': radius,
    'Background.Border.thickness': border,
  };
  const out = {};
  for (const type of BUTTON_TYPES) {
    out[type] = { component: { ...component, ...(text ? { 'Text.Fill.colour': text } : {}), ...material(...(buttonMaterial ?? [null])) } };
  }
  // A combobox body is `control.select`, not `surface`, so it may need its own ink.
  const comboInk = comboText ?? text;
  out.Combobox = { component: { ...component, ...(comboInk ? { 'Text.Fill.colour': comboInk } : {}), ...material(...(comboMaterial ?? buttonMaterial ?? [null])) } };
  // The value fields (Number, Range) are a different surface from the buttons beside them — a
  // paper window in a dark stepper, or the reverse — so they take their own ink.
  if (fieldText || text) {
    const field = { 'Text.Fill.colour': fieldText ?? text };
    const stepper = { 'Text.Fill.colour': text ?? fieldText };
    out.Number = { parts: { valueField: field, decrement: stepper, increment: stepper } };
    out.Range = { parts: { lowField: field, highField: field, decrement: stepper, increment: stepper } };
  }
  return out;
}

/**
 * A linear slider family: the cap that rides the track and the track itself.
 *   cap        — 'dot' (the original circle) | 'bar' | 'console' (a bar with a groove) | 'ring' | 'line'
 *   capAlong / capAcross — the cap's size in px along the travel and across the track
 *   capMaterial — [kind, strength, shine, grain]
 *   track / trackRadius — the track's thickness and corner radius (999 is a pill)
 */
export function sliderFamily({
  cap = 'dot', capAlong = 20, capAcross = 20, capFill = '{control.cap}', capEdge = '{control.cap.edge}', capEdgeWidth = 1, capMaterial = null,
  track = 0, trackRadius = null,
} = {}) {
  const parts = {};
  const pointer = {
    'Layout.width': capAlong,
    'Layout.height': capAcross,
    'Background.Fill.colour': capFill,
    'Background.Border.colour': capEdge,
    'Background.Border.thickness': capEdgeWidth,
    ...material(...(capMaterial ?? [null])),
  };
  if (cap !== 'dot') pointer.kind = cap;
  parts.pointerCurrent = pointer;
  if (track > 0 || trackRadius != null) {
    const patch = {};
    if (track > 0) patch['Layout.height'] = track;
    if (trackRadius != null) patch['Background.Corners.radius'] = trackRadius;
    parts.bodyTrackBase = { ...patch };
    parts.bodyTrackFill = { ...patch };
  }
  return { Slider: { parts } };
}

/**
 * A lamp on the toggle (sectionDefaults ContentLayout): 'led', 'jewel' or 'window', its size and
 * side, and its lit and unlit colours. Radio groups draw their own selection and are left alone.
 */
export function lampFamily({ lamp = 'led', size = 9, side = 'left', gap = 8, colour = '{accent.hot}', offColour = '{control.track}', bezel = '{border.surface}', keepBody = true } = {}) {
  const component = {
    'ContentLayout.lamp': lamp,
    'ContentLayout.lampSize': size,
    'ContentLayout.lampSide': side,
    'ContentLayout.lampGap': gap,
    'ContentLayout.lampColour': colour,
    'ContentLayout.lampOffColour': offColour,
    'ContentLayout.lampBezelColour': bezel,
  };
  // With a lamp, the lamp is the indicator: the body keeps its colour and legend when checked
  // and only the hairline lights. Without this the checked body would swamp the lamp.
  if (keepBody) component['States.Selected'] = lampSelectedState();
  return { ToggleButton: { component } };
}

/**
 * A toggle's Selected state for a toggle that has a lamp: the body and the legend stay as they
 * are, the hairline takes the hot accent, the lamp does the talking. The same shape
 * componentTypes' createButtonStates makes, so the runtime treats it as any other state.
 */
export function lampSelectedState() {
  return {
    _type: 'State',
    name: 'Selected',
    group: 'interaction',
    description: '',
    enabled: true,
    when: { checked: true },
    patches: { component: { 'Background.Border.colour': '{accent.hot}' }, parts: {} },
  };
}

/** A panel: its colour while the author has not chosen one, and its material. */
export function panelSpec(colour, materialKind = null, strength = 100, shine = 40, grain = 100) {
  const out = { colour };
  if (materialKind) out.material = { enabled: true, kind: materialKind, strength, shine, grain, lampFollowsSet: true };
  return out;
}

export function mergeFamilies(...fragments) {
  const out = {};
  for (const fragment of fragments) {
    for (const [type, patch] of Object.entries(fragment ?? {})) {
      const current = out[type] ?? {};
      out[type] = {
        component: { ...(current.component ?? {}), ...(patch.component ?? {}) },
        parts: { ...(current.parts ?? {}), ...(patch.parts ?? {}) },
      };
      if (!Object.keys(out[type].component).length) delete out[type].component;
      if (!Object.keys(out[type].parts).length) delete out[type].parts;
    }
  }
  return out;
}
