// The designs: what a slider and a button ARE in a set, beyond their colours.
//
// Every one of these is built from properties the editor exposes and nothing else — the Slider
// editor's Track Base / Value Fill / handle style targets (Background: fill layers with a
// gradient, border, corners), its Cap select and Cap Finish strip, its Ticks & Labels section;
// the Background, Effects (shadows, glows, bevel), Text and Content Layout tabs of a button. An
// author can open any control under any of these sets, read the values off the panels and make
// the same thing by hand, and test/controlSetDesigns.test.js holds every path written here to
// the editor's vocabulary so that stays true.
//
// A design is a function of inks, because gradient stops are literals (the gradient editor's
// stops are RRGGBB, not tokens), so a set hands its palette in and gets its families back. The
// inks a design takes are named where it is defined; the catalogue conversion derives them
// from each board's palette, the pilot sets name theirs by hand.
//
// The archetypes, and the boards each came from:
//   sliders  pill (Graphite), fader (Console, Rackmount, Chrome), schematic (Blueprint, Ivory,
//            Atelier), glow (Neon, Backlit, Obsidian), ledder (Phosphor, Eurorack), toy (Pop),
//            soft (Soft), vintage (Walnut, Valve, Tolex, Reel, Saddle, Receiver), billet
//            (Machined, Anodised, Aerospace, Field, Ladder, Laboratory, Ceramic), rubber
//            (Carbon, Ember), frost (Frost)
//   buttons  flat (Graphite, Ivory, Atelier), aluminium (Console, Anodised, Eurorack, Machined,
//            Aerospace, Laboratory), key (Rackmount: the illuminated square), toy (Pop), soft
//            (Soft: neumorphic), outline (Blueprint, Phosphor), glass (Chrome, Neon, Obsidian),
//            rubber (Carbon, Backlit, Ember), bakelite (Tolex, Valve, Walnut, Reel, Saddle,
//            Ceramic, Receiver), chamfer (Ladder, Field), frost (Frost)

import { lampSelectedState } from './controlSetRecipes.js';

const BUTTON_TYPES = ['Button', 'MomentaryButton', 'ToggleButton'];

// ---- colour arithmetic on AARRGGBB / RRGGBB literals -----------------------------------------

function rgbOf(hex) {
  const h = String(hex ?? '').replace(/^#/, '').trim();
  const six = h.length === 8 ? h.slice(2) : h.padStart(6, '0').slice(-6);
  return [0, 2, 4].map((i) => parseInt(six.slice(i, i + 2), 16) || 0);
}
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
/** RRGGBB, as a gradient stop wants it. */
export function hex6(hex) { return rgbOf(hex).map(hex2).join(''); }
/** AARRGGBB, as a colour field wants it. */
export function argb(hex, alpha = 'FF') { return alpha + hex6(hex); }
export function lighten(hex, f) { return rgbOf(hex).map((c) => hex2(c + (255 - c) * f)).join(''); }
export function darken(hex, f) { return rgbOf(hex).map((c) => hex2(c * (1 - f))).join(''); }
export function mix(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return A.map((c, i) => hex2(c + (B[i] - c) * t)).join(''); }

// ---- the gradient shapes the designs use, as the gradient editor stores them ------------------

/** Top to bottom, light to dark: a turned cap, a pressed key. */
function cylinder(hi, mid, lo, angle = 180) {
  return { type: 'linear', angle, edge: 0, stops: [{ color: hex6(hi), position: 0 }, { color: hex6(mid), position: 55 }, { color: hex6(lo), position: 100 }] };
}
/** A highlight off centre: a dome, a bakelite cap, a lens. */
function dome(hi, mid, lo) {
  return { type: 'radial', centerX: 38, centerY: 30, radiusX: 70, radiusY: 70, edge: 0, stops: [{ color: hex6(hi), position: 0 }, { color: hex6(mid), position: 55 }, { color: hex6(lo), position: 100 }] };
}
/** Light, dark, light across: a brass rail, a milled edge. */
function rail(hi, lo, angle = 180) {
  return { type: 'linear', angle, edge: 0, stops: [{ color: hex6(hi), position: 0 }, { color: hex6(lo), position: 50 }, { color: hex6(hi), position: 100 }] };
}
/** Two flat bands with a hard edge between them: the glass highlight on the top half. */
function split(top, bottom, at = 48) {
  return { type: 'linear', angle: 180, edge: 100, stops: [{ color: hex6(top), position: 0 }, { color: hex6(top), position: at }, { color: hex6(bottom), position: at }, { color: hex6(bottom), position: 100 }] };
}

function gradientFill(base, gradient, opacity = 100) {
  return { 'Background.Fill.colour': argb(base), 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradient': gradient, 'Background.Fill.gradientOpacity': opacity };
}
function border(colour, thickness) {
  return { 'Background.Border.colour': colour, 'Background.Border.thickness': thickness };
}
function drop(offsetY, blur, colour, offsetX = 0, spread = 0) {
  return { enabled: true, type: 'drop', offsetX, offsetY, blur, spread, colour };
}
function inner(offsetY, blur, colour, offsetX = 0) {
  return { enabled: true, type: 'inner', offsetX, offsetY, blur, spread: 0, colour };
}
function outerGlow(blur, colour) {
  return { enabled: true, type: 'outer-glow', offsetX: 0, offsetY: 0, blur, spread: 0, colour };
}

/** The labels every board drew: title left and value right above the track, no min/max. */
const BOARD_LABELS = { 'Behavior.showMinMaxLabels': false, 'Behavior.labelTitlePlacement': 'topLeft', 'Behavior.labelReadoutPlacement': 'topRight' };
function ticks({ count = 11, minor = 0, length = 5, kind = 'line', placement = 'outside', stops = null, numerals = null, width = 1.5, colour = null, minorColour = null } = {}) {
  const component = { 'Behavior.showTicks': true, 'Behavior.majorTickCount': count, 'Behavior.minorTickCount': minor, 'Behavior.majorTickLength': length, 'Behavior.tickPlacement': placement };
  if (stops) component['Behavior.tickStops'] = stops;
  if (numerals) component['Behavior.tickNumerals'] = numerals;
  const major = { 'Layout.width': width, 'Layout.height': length };
  if (kind !== 'line') major.kind = kind;
  if (colour) major['Background.Fill.colour'] = colour;
  const minorPart = {};
  if (kind !== 'line' && kind !== 'numeral') minorPart.kind = kind;
  if (minorColour ?? colour) minorPart['Background.Fill.colour'] = minorColour ?? colour;
  return { component, parts: { tickMajor: major, ...(Object.keys(minorPart).length ? { tickMinor: minorPart } : {}) } };
}
const NO_TICKS = { component: { 'Behavior.showTicks': false }, parts: {} };

/** A cap on all three handles: the range slider's ends are the same cap in their own colours. */
function handles(cap, { start = '{control.cap.start}', end = '{control.cap.end}' } = {}) {
  return {
    pointerCurrent: cap,
    pointerStart: { ...cap, 'Background.Fill.colour': start },
    pointerEnd: { ...cap, 'Background.Fill.colour': end },
  };
}
function slider(scale, parts, component = {}) {
  return { Slider: { component: { ...BOARD_LABELS, ...scale.component, ...component }, parts: { ...scale.parts, ...parts } } };
}

// ---- sliders ----------------------------------------------------------------------------------

export const SLIDER_DESIGNS = {
  /** Graphite: the pill track and the round cap, as the default has always been. */
  pill: () => slider(NO_TICKS, {}),

  /**
   * The long-throw desk fader. A square-ended slot cut into the panel with a hairline edge, a
   * tall cap turned from one piece (a top-to-bottom cylinder gradient) with a groove across it,
   * casting a shadow, and a printed scale of eleven marks under the track.
   * Inks: slot, slotEdge, fill, cap, groove, tick.
   */
  fader: ({ slot, slotEdge, fill, cap, groove, tick }) => slider(
    ticks({ count: 11, minor: 1, length: 5, placement: 'outside', width: 1, colour: argb(tick, 'CC'), minorColour: argb(tick, '66') }),
    {
      ...handles({
        kind: 'console', 'Layout.width': 18, 'Layout.height': 40, grooveColour: argb(groove), shadow: true,
        ...gradientFill(cap, cylinder(lighten(cap, 0.4), cap, darken(cap, 0.35))), ...border(argb(darken(cap, 0.5)), 1),
      }),
      bodyTrackBase: { 'Layout.height': 6, 'Background.Corners.radius': 1, slot: true, 'Background.Fill.colour': argb(slot), ...border(argb(slotEdge), 1) },
      bodyTrackFill: { 'Layout.height': 6, 'Background.Corners.radius': 1, 'Background.Fill.colour': argb(fill) },
    },
  ),

  /**
   * The schematic. A hairline track, a hollow ring for a cap, a scale of five numerals in the
   * value's own units. Nothing is filled that a pen would not fill.
   * Inks: ink (the line), paper (inside the ring), fill.
   */
  schematic: ({ ink, paper, fill, weight = 1.5 }) => slider(
    ticks({ count: 5, minor: 1, length: 6, kind: 'numeral', numerals: 'value', placement: 'outside', width: 1, colour: argb(ink, 'CC'), minorColour: argb(ink, '55') }),
    {
      ...handles({ kind: 'ring', 'Layout.width': 16, 'Layout.height': 8, 'Background.Fill.colour': argb(ink), ...border(argb(paper), 0) }),
      bodyTrackBase: { 'Layout.height': 2, 'Background.Corners.radius': 0, 'Background.Fill.colour': argb(ink, '99'), ...border(argb(ink), 0) },
      bodyTrackFill: { 'Layout.height': 2, 'Background.Corners.radius': 0, 'Background.Fill.colour': argb(fill) },
    },
    { 'Behavior.majorTickLength': 6 },
  ),

  /**
   * Dark glass and light. A near-black pill, a fill that glows, and a lens cap lit from within
   * in the accent, throwing a halo on the panel.
   * Inks: slot, fill, cap (the lens body), light.
   */
  glow: ({ slot, fill, cap, light }) => slider(NO_TICKS, {
    ...handles({ kind: 'lens', 'Layout.width': 22, 'Layout.height': 22, grooveColour: argb(light), glow: true, shadow: true, 'Background.Fill.colour': argb(cap), ...border(argb(darken(cap, 0.4)), 0.8) }),
    bodyTrackBase: { 'Layout.height': 6, 'Background.Corners.radius': 999, 'Background.Fill.colour': argb(slot), ...border(argb(lighten(slot, 0.12)), 1) },
    bodyTrackFill: { 'Layout.height': 6, 'Background.Corners.radius': 999, glow: true, 'Background.Fill.colour': argb(fill) },
  }),

  /**
   * A front panel that lights up: a ladder of LEDs beside the track for a scale, a ring cap
   * with nothing inside it, a fill that glows. Phosphor and the Eurorack module.
   * Inks: slot, fill, ring, led.
   */
  ledder: ({ slot, fill, ring, led }) => slider(
    ticks({ count: 11, length: 5, kind: 'dot', placement: 'outside', colour: argb(led, 'EE'), minorColour: argb(led, '55') }),
    {
      ...handles({ kind: 'ring', 'Layout.width': 18, 'Layout.height': 10, glow: true, 'Background.Fill.colour': argb(ring), ...border(argb(ring), 0) }),
      bodyTrackBase: { 'Layout.height': 6, 'Background.Corners.radius': 1, 'Background.Fill.colour': argb(slot), ...border(argb(lighten(slot, 0.15)), 1) },
      bodyTrackFill: { 'Layout.height': 6, 'Background.Corners.radius': 1, glow: true, 'Background.Fill.colour': argb(fill) },
    },
  ),

  /**
   * The toy: a fat track and a big round cap, both in a thick black outline, and nothing else.
   * Inks: track, fill, cap, outline.
   */
  toy: ({ track, fill, cap, outline }) => slider(NO_TICKS, {
    ...handles({ 'Layout.width': 28, 'Layout.height': 28, 'Background.Fill.colour': argb(cap), ...border(argb(outline), 3) }),
    bodyTrackBase: { 'Layout.height': 14, 'Background.Corners.radius': 999, 'Background.Fill.colour': argb(track), ...border(argb(outline), 3) },
    bodyTrackFill: { 'Layout.height': 14, 'Background.Corners.radius': 999, 'Background.Fill.colour': argb(fill) },
  }),

  /**
   * Raised and quiet: a pale groove in a pale panel, a domed cap with a soft highlight and a
   * soft shadow under it.
   * Inks: track, fill, cap.
   */
  soft: ({ track, fill, cap }) => slider(NO_TICKS, {
    ...handles({ 'Layout.width': 24, 'Layout.height': 24, shadow: true, ...gradientFill(cap, dome(lighten(cap, 0.6), cap, darken(cap, 0.12))), ...border(argb(darken(cap, 0.08)), 0) }),
    bodyTrackBase: { 'Layout.height': 10, 'Background.Corners.radius': 999, slot: true, 'Background.Fill.colour': argb(track), ...border(argb(darken(track, 0.06)), 0) },
    bodyTrackFill: { 'Layout.height': 10, 'Background.Corners.radius': 999, 'Background.Fill.colour': argb(fill) },
  }),

  /**
   * Hi-fi from the seventies. A brass rail for a track (light, dark, light across its width),
   * a bakelite cap with a dome highlight and a dark groove, a shadow under it, and a scale of
   * short marks above the rail.
   * Inks: rail, fill, cap, groove, tick.
   */
  vintage: ({ rail: railInk, fill, cap, groove, tick }) => slider(
    ticks({ count: 11, length: 4, placement: 'outside', width: 1, colour: argb(tick, 'AA'), minorColour: argb(tick, '55') }),
    {
      ...handles({ kind: 'bar', 'Layout.width': 14, 'Layout.height': 34, grooveColour: argb(groove), shadow: true, ...gradientFill(cap, dome(lighten(cap, 0.45), cap, darken(cap, 0.4))), ...border(argb(darken(cap, 0.55)), 1) }),
      bodyTrackBase: { 'Layout.height': 5, 'Background.Corners.radius': 2, ...gradientFill(railInk, rail(lighten(railInk, 0.45), darken(railInk, 0.25))), ...border(argb(darken(railInk, 0.5)), 1) },
      bodyTrackFill: { 'Layout.height': 5, 'Background.Corners.radius': 2, 'Background.Fill.colour': argb(fill) },
    },
  ),

  /**
   * Photographed, not drawn. A slot cut into the plate with a light in it, a billet cap: milled
   * (a light-dark-light gradient across the travel) with a top plate and an engraved line,
   * casting a shadow; engraved marks either side.
   * Inks: slot, fill, cap, plate, groove, tick, lit (the fill glows).
   */
  billet: ({ slot, fill, cap, plate, groove, tick, lit = false }) => slider(
    ticks({ count: 11, length: 6, kind: 'engraved', placement: 'outside', width: 1.3, colour: argb(tick, 'CC'), minorColour: argb(tick, '77') }),
    {
      ...handles({
        kind: 'block', 'Layout.width': 22, 'Layout.height': 44, grooveColour: argb(groove), plateColour: argb(plate), sheen: true, shadow: true,
        ...gradientFill(cap, rail(lighten(cap, 0.25), darken(cap, 0.2), 90)), ...border(argb(darken(cap, 0.6)), 1),
      }),
      bodyTrackBase: { 'Layout.height': 10, 'Background.Corners.radius': 2, slot: true, 'Background.Fill.colour': argb(slot), ...border(argb(lighten(slot, 0.35)), 1) },
      bodyTrackFill: { 'Layout.height': 10, 'Background.Corners.radius': 2, inset: 3, glow: lit, 'Background.Fill.colour': argb(fill) },
    },
  ),

  /**
   * Rubber over metal. A matte square-ended track, a fader cap with a top highlight (a
   * top-to-bottom gradient), a groove in the accent and a shadow; a scale of small marks.
   * Inks: track, fill, cap, groove, tick.
   */
  rubber: ({ track, fill, cap, groove, tick }) => slider(
    ticks({ count: 11, length: 4, placement: 'outside', width: 1, colour: argb(tick, '99'), minorColour: argb(tick, '55') }),
    {
      ...handles({ kind: 'bar', 'Layout.width': 12, 'Layout.height': 32, grooveColour: argb(groove), shadow: true, ...gradientFill(cap, cylinder(lighten(cap, 0.3), cap, darken(cap, 0.3))), ...border(argb(darken(cap, 0.6)), 1) }),
      bodyTrackBase: { 'Layout.height': 6, 'Background.Corners.radius': 2, 'Background.Fill.colour': argb(track), ...border(argb(lighten(track, 0.1)), 1) },
      bodyTrackFill: { 'Layout.height': 6, 'Background.Corners.radius': 2, 'Background.Fill.colour': argb(fill) },
    },
  ),

  /**
   * Frosted glass: a translucent white track, a white cap with a coloured ring, a white fill.
   * Inks: ring, fill.
   */
  frost: ({ ring, fill }) => slider(NO_TICKS, {
    ...handles({ 'Layout.width': 20, 'Layout.height': 20, shadow: true, 'Background.Fill.colour': 'E6FFFFFF', ...border(argb(ring), 2) }),
    bodyTrackBase: { 'Layout.height': 8, 'Background.Corners.radius': 999, 'Background.Fill.colour': '55FFFFFF', ...border('88FFFFFF', 1) },
    bodyTrackFill: { 'Layout.height': 8, 'Background.Corners.radius': 999, 'Background.Fill.colour': argb(fill) },
  }),
};

// ---- buttons ----------------------------------------------------------------------------------

function buttons(component, { combo = null, toggle = null, lamp = null } = {}) {
  const out = {};
  for (const type of BUTTON_TYPES) out[type] = { component: { ...component } };
  if (toggle) out.ToggleButton.component = { ...out.ToggleButton.component, ...toggle };
  if (lamp) out.ToggleButton.component = { ...out.ToggleButton.component, ...lamp, 'States.Selected': lampSelectedState() };
  out.Combobox = { component: { ...component, ...(combo ?? {}) } };
  return out;
}
function lamp(kind, size, colour = '{accent.hot}', extra = {}) {
  return { 'ContentLayout.lamp': kind, 'ContentLayout.lampSize': size, 'ContentLayout.lampColour': colour, ...extra };
}
function text(colour, extra = {}) {
  return { 'Text.Fill.colour': colour, ...extra };
}
/** Dark text with a light edge under it, cut into the plate. */
const ENGRAVED = { 'Text.Effects.shadowEnabled': true, 'Text.Effects.shadowStyle': 'soft', 'Text.Effects.shadowOffsetX': 0, 'Text.Effects.shadowOffsetY': 1, 'Text.Effects.shadowBlur': 0, 'Text.Effects.shadowColour': '99FFFFFF' };
/** A legend that is lit from behind. */
function litText(colour) {
  return { 'Text.Effects.glowEnabled': true, 'Text.Effects.glowSize': 4, 'Text.Effects.glowIntensity': 1, 'Text.Effects.glowColour': argb(colour, 'AA') };
}

export const BUTTON_DESIGNS = {
  /** Flat, a hairline, a radius. Inks: text. */
  flat: ({ radius = 8, text: ink = null, lampKind = null } = {}) => buttons(
    { 'Background.Corners.radius': radius, 'Background.Border.thickness': 1, ...(ink ? text(ink) : {}) },
    { lamp: lampKind ? lamp(lampKind, 8) : null },
  ),

  /**
   * A machined aluminium key: turned (top-to-bottom gradient), a bevelled edge, a hairline,
   * sitting proud of the panel on a shadow, its legend engraved. Toggles carry an LED.
   * Inks: face, edge, text.
   */
  aluminium: ({ face, edge, text: ink, lampKind = 'led', lampColour = '{accent.hot}' }) => buttons(
    {
      'Background.Corners.radius': 3, ...gradientFill(face, cylinder(lighten(face, 0.35), face, darken(face, 0.22))), ...border(argb(edge), 1),
      'Effects.Bevel.enabled': true, 'Effects.Bevel.style': 'outer-bevel', 'Effects.Bevel.size': 2, 'Effects.Bevel.softness': 1, 'Effects.Bevel.highlightOpacity': 60, 'Effects.Bevel.shadowOpacity': 55,
      'Effects.Shadows.items': [drop(2, 4, '77000000')],
      ...text(ink, ENGRAVED),
    },
    { lamp: lamp(lampKind, 8, lampColour) },
  ),

  /**
   * The illuminated square key of a rack unit: square corners, a dark bezel round it, the
   * face set into the bezel (an inner bevel), lit through a window when on.
   * Inks: face, bezel, text.
   */
  key: ({ face, bezel, text: ink, lampColour = '{accent.hot}' }) => buttons(
    {
      'Background.Corners.radius': 1, ...gradientFill(face, cylinder(lighten(face, 0.2), face, darken(face, 0.25))), ...border(argb(bezel), 2),
      'Effects.Bevel.enabled': true, 'Effects.Bevel.style': 'inner-bevel', 'Effects.Bevel.size': 2, 'Effects.Bevel.softness': 1,
      'Effects.Shadows.items': [drop(1, 2, '99000000')],
      ...text(ink),
    },
    { lamp: lamp('window', 8, lampColour) },
  ),

  /**
   * The toy: a pill in a thick black outline with a hard shadow off to one side, like a print.
   * Inks: face, outline, text.
   */
  toy: ({ face, outline, text: ink }) => buttons(
    {
      'Background.Corners.radius': 999, 'Background.Fill.colour': argb(face), ...border(argb(outline), 3),
      'Effects.Shadows.items': [drop(3, 0, argb(outline), 3)],
      ...text(ink),
    },
    { combo: { 'Background.Corners.radius': 12 } },
  ),

  /**
   * Neumorphic: the button is the panel, pushed up out of it — no outline, a light shadow to
   * the top-left and a dark one to the bottom-right.
   * Inks: face, text.
   */
  soft: ({ face, text: ink }) => buttons(
    {
      'Background.Corners.radius': 12, 'Background.Fill.colour': argb(face), 'Background.Border.thickness': 0,
      'Effects.Shadows.items': [drop(-3, 6, 'E6FFFFFF', -3), drop(4, 8, '33000000', 4)],
      ...text(ink),
    },
    { lamp: lamp('led', 7) },
  ),

  /**
   * Line work: no fill at all, one hairline, square corners, the legend in the ink.
   * Inks: ink.
   */
  outline: ({ ink, radius = 0 }) => buttons(
    { 'Background.Corners.radius': radius, 'Background.Fill.colour': '00000000', ...border(argb(ink), 1), ...text(argb(ink)) },
    { lamp: lamp('led', 7, argb(ink), { 'ContentLayout.lampOffColour': '00000000' }) },
  ),

  /**
   * Glass: the face with a hard highlight across its top half, a light hairline, a shadow
   * under it and a glow around it in the accent.
   * Inks: face, text, light.
   */
  glass: ({ face, text: ink, light }) => buttons(
    {
      'Background.Corners.radius': 7, ...gradientFill(face, split('FFFFFF', face), 22), ...border(argb(lighten(face, 0.5), 'AA'), 1),
      'Effects.Shadows.items': [drop(2, 4, '66000000'), outerGlow(8, argb(light, '55'))],
      ...text(ink),
    },
    { lamp: lamp('led', 7, argb(light)) },
  ),

  /**
   * A rubber key: dark, rounded, a highlight where the light catches the top edge (an inner
   * shadow in white), a shadow under it; a lit window when it is a toggle, the legend lit.
   * Inks: face, text, light.
   */
  rubber: ({ face, text: ink, light, litLegend = false }) => buttons(
    {
      'Background.Corners.radius': 6, ...gradientFill(face, cylinder(lighten(face, 0.18), face, darken(face, 0.3))), ...border(argb(darken(face, 0.5)), 1),
      'Effects.Shadows.items': [inner(1, 2, '40FFFFFF'), drop(2, 3, '99000000')],
      ...text(ink, litLegend ? litText(light) : {}),
    },
    { lamp: lamp('window', 8, argb(light)) },
  ),

  /**
   * Bakelite: a moulded cap with a dome highlight, a dark hairline, a shadow. Toggles carry a
   * jewel lamp.
   * Inks: face, edge, text.
   */
  bakelite: ({ face, edge, text: ink, lampKind = 'jewel' }) => buttons(
    {
      'Background.Corners.radius': 5, ...gradientFill(face, dome(lighten(face, 0.35), face, darken(face, 0.3))), ...border(argb(edge), 1.5),
      'Effects.Shadows.items': [drop(2, 2, '88000000')],
      ...text(ink),
    },
    { lamp: lamp(lampKind, 12) },
  ),

  /**
   * A chamfered key: the corners cut at 45°, a turned face, a hairline, a shadow. The rocker
   * switch of a synthesiser, the guarded key of a field radio.
   * Inks: face, edge, text.
   */
  chamfer: ({ face, edge, text: ink, lampKind = 'bat', lampColour = '{control.cap}' }) => buttons(
    {
      'Background.Corners.radius': 6, 'Background.Corners.style': 'chamfer', ...gradientFill(face, cylinder(lighten(face, 0.22), face, darken(face, 0.28))), ...border(argb(edge), 1),
      'Effects.Shadows.items': [drop(2, 3, '99000000')],
      ...text(ink, ENGRAVED),
    },
    { lamp: lamp(lampKind, 10, lampColour, lampKind === 'bat' ? { 'ContentLayout.lampOffColour': lampColour } : {}) },
  ),

  /** Frosted glass: translucent white, a bright hairline, a big radius, a soft wide shadow. Inks: text. */
  frost: ({ text: ink }) => buttons(
    {
      'Background.Corners.radius': 14, 'Background.Fill.colour': '38FFFFFF', ...border('AAFFFFFF', 1),
      'Effects.Shadows.items': [drop(4, 12, '33000000')],
      ...text(ink),
    },
    { lamp: lamp('led', 7, 'FFFFFFFF') },
  ),
};

/** The editor's vocabulary: every path a design may write. test/controlSetDesigns.test.js holds the built-ins to it. */
export const EDITOR_PATHS = [
  /^Background\.Fill\.(colour|gradientEnabled|gradient|gradientOpacity)$/,
  /^Background\.Border\.(enabled|colour|thickness)$/,
  /^Background\.Corners\.(radius|style)$/,
  /^Background\.Effects\.Material\.(enabled|kind|strength|shine|grain)$/,
  /^Effects\.Shadows\.items$/,
  /^Effects\.Bevel\.(enabled|style|size|softness|depth|angle|highlightOpacity|shadowOpacity)$/,
  /^Layout\.(x|y|width|height|offsetX|offsetY|xUnit|yUnit|widthUnit|heightUnit|anchorX|anchorY)$/,
  // A part's own visibility and opacity, on the part editor's header.
  /^(visible|opacity)$/,
  /^Behavior\.(showTicks|majorTickCount|minorTickCount|majorTickLength|tickPlacement|tickStops|tickNumerals|showMinMaxLabels|labelTitlePlacement|labelReadoutPlacement)$/,
  /^Text\.Fill\.colour$/,
  /^Text\.Font\.(family|weight|weightValue|letterSpacing)$/,
  /^Text\.Effects\.(shadowEnabled|shadowStyle|shadowOffsetX|shadowOffsetY|shadowBlur|shadowColour|glowEnabled|glowSize|glowIntensity|glowColour)$/,
  /^ContentLayout\.(lamp|lampSize|lampSide|lampGap|lampColour|lampOffColour|lampBezelColour)$/,
  /^States\.Selected$/,
  // The part-level keys the Slider editor's Cap select, Cap Finish strip and tick style write.
  /^(kind|grooveColour|plateColour|sheen|shadow|glow|slot|inset)$/,
  /^Listbox\.(cardRows|rowHeight|selectionStyle|zebra|accentColour)$/,
  /^TabContainer\.(appearance|accentColour|stripColour|tabColour|activeTabColour|labelColour|activeLabelColour)$/,
  /^ScrollArea\.(scrollbarSize|trackColour|thumbColour)$/,
  /^Meter\.(segments|segmentGap|rounded|thickness|showTicks|trackColour|fillColour|peakColour)$/,
  /^Ribbon\.(style|showGlow|indicatorSize|trackColour|fillColour|indicatorColour|glowColour|wheelColour|labelColour)$/,
  /^Core\.(controlForm|formSize|formDepth|formDivisions|formShowValue|formFaceColour|formHousingColour|formInkColour|formLabelColour|formAccentColour)$/,
  /^Crossfader\.(handleStyle|trackSize|handleSize|showGains|trackColour|fillAColour|fillBColour|handleColour|labelColour)$/,
  /^DrumPads\.(padForm|padLayout|padAppearance|padRadius|fieldColour|padColour|accentColour|hitColour|labelColour)$/,
  /^StepSequencer\.(cellForm|cellColour|cellOnColour|labelColour|gridColour|playheadColour)$/,
  /^Numpad\.(gap|keyColour|keyDownColour|keyLabelColour|actionColour|displayColour|displayTextColour|borderColour)$/,
  /^Matrix\.(cellStyle|cellBg|rowHeaderW|gridColour|posColour|negColour|labelColour|activeColour)$/,
  /^Envelope\.(fillUnder|lineWidth|nodeRadius|lineColour|fillColour|nodeColour|gridColour|sustainColour|playheadColour)$/,
  /^Joystick\.(puckRadius|showGrid|gridDiv|padColour|gridColour|crosshairColour|puckColour|cornerColour|labelColour)$/,
];
