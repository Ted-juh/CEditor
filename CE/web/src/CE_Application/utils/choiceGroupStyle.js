// choiceGroupStyle.js — how one option of a choice group (RadioButtonGroup) looks, in its style and
// its own states. One ordered pass over one structure, an option tree of a Background and a Text:
//
//   1. the style's own look (below), from the control's Background and Text and the set's colours;
//   2. the row's legacy `visualOverrides`, read and never written;
//   3. `Value.segmentStyle`: the shared layer, then the row's;
//   4. every option state the option is in (a state whose condition reads hover, pressed, focused
//      or checked), in the order the control's own states are laid down: its component patch where
//      the style paints options (segmented, buttons), then its `segments` patch, shared, then row;
//   5. two guarantees, because the sets' colours alone do not make a chosen option read: a chosen
//      option whose fill no state changed takes the thumb (in a strip or a row of keys), and a
//      label that reads at under 3:1 on what it sits on (its option's fill, or the strip's frame;
//      a gradient by its stops' average) takes black or white, unless its colour was chosen by
//      hand in the Segments tab (docs/design/choice-group.md measured why).
//
// The saved shape is kept: the parts are `whole` (the option's body and spacing), `indicatorOuter`
// (a ring, a lamp at rest), `indicatorInner` (a dot, a lit lamp, a tab's underline) and `label`.
import { deepClone } from './deepClone.js';
import { numberOr } from './primitives.js';
import { choiceStyleDrawsFrame, choiceStyleOnPanel, isOptionState } from './choiceGroupLayout.js';
import { applyStatePatchMap, stateMatches, statesInPrecedence } from './interactionRuntime.js';
import { materialActive, materialRecipe } from './materialFilter.js';

const CLEAR = '00000000';
const FILL_ORDER = Object.freeze(['solid', 'gradient', 'image', 'overlay']);

/** The parts the Segments tab edits, named for what they are in each style. */
export function choicePartOptions(style) {
  const outer = { radio: 'Ring', led: 'Lamp' }[style] ?? 'Indicator';
  const inner = { radio: 'Dot', led: 'Lamp, lit', tab: 'Underline' }[style] ?? 'Mark';
  return [
    { id: 'whole', label: 'Option' },
    { id: 'indicatorOuter', label: outer },
    { id: 'indicatorInner', label: inner },
    { id: 'label', label: 'Label' },
  ];
}

export const CHOICE_INDICATOR_SHAPES = Object.freeze([
  { value: 'circle', label: 'Circle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'bar', label: 'Bar' },
]);

export function emptyChoiceStyle() {
  return { shared: {}, rows: {} };
}

/** A corner radius as CSS for an indicator's shape. */
export function indicatorRadius(shape, radius) {
  if (shape === 'circle') return '50%';
  if (shape === 'square' || shape === 'bar') return '0px';
  return `${Math.max(0, numberOr(radius, 2))}px`;
}

// --- Colour arithmetic ---------------------------------------------------------------------------

/** An `AARRGGBB` (or `RRGGBB`) colour as { r, g, b, a }, or null for anything else. */
function argb(value) {
  const hex = String(value ?? '').replace(/^#/, '').trim();
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const at = hex.length === 8 ? 2 : 0;
  return {
    a: hex.length === 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1,
    r: parseInt(hex.slice(at, at + 2), 16),
    g: parseInt(hex.slice(at + 2, at + 4), 16),
    b: parseInt(hex.slice(at + 4, at + 6), 16),
  };
}

const linear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast of two colours, the alpha ignored. */
export function colourContrast(left, right) {
  const a = argb(left);
  const b = argb(right);
  if (!a || !b) return 21;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on `colour`. */
export function inkOn(colour) {
  return colourContrast('FFFFFFFF', colour) >= colourContrast('FF141414', colour) ? 'FFFFFFFF' : 'FF141414';
}

// --- The option tree -----------------------------------------------------------------------------

function clearBackground(radius) {
  return {
    _type: 'Background',
    mode: 'solid',
    _children: {
      Fill: { _type: 'Fill', mode: 'solid', layerOrder: [...FILL_ORDER], colour: CLEAR, solidEnabled: true, gradientEnabled: false, imageEnabled: false, overlayEnabled: false },
      Border: { _type: 'Border', enabled: false, linked: true, style: 'solid', thickness: 1, colour: CLEAR },
      Corners: { _type: 'Corners', linked: true, style: 'rounded', direction: 'outward', radius },
    },
  };
}

const fillOf = (tree) => tree._children.Background._children.Fill;
const borderOf = (tree) => tree._children.Background._children.Border;
const cornersOf = (tree) => tree._children.Background._children.Corners;
const textFillOf = (tree) => tree._children.Text._children.Fill;
const fontOf = (tree) => tree._children.Text._children.Font;

function ensureText(text) {
  const out = deepClone(text ?? {});
  out._children ??= {};
  out._children.Fill ??= {};
  out._children.Font ??= {};
  return out;
}

/** The radius a segmented thumb keeps inside its frame: the frame's, less the inset. */
function thumbRadius(background, inset) {
  const radius = numberOr(background?._children?.Corners?.radius, 8);
  return Math.max(0, radius - Math.max(0, inset));
}

/**
 * The style's own look, before any patch: an option tree, its indicators and spacing. Options on
 * the panel (radio, LED, tab) take the panel's text colour, since a set chooses the control's text
 * colour to read on the control's face, which those styles do not draw.
 */
function baseLook({ style, background, text, contentLayout, palette, flags, inset }) {
  const tree = {
    _children: {
      Background: style === 'buttons' ? deepClone(background ?? clearBackground(8)) : clearBackground(thumbRadius(background, inset)),
      Text: ensureText(text),
    },
  };
  if (!tree._children.Background._children) tree._children.Background._children = clearBackground(8)._children;
  const label = textFillOf(tree);
  if (choiceStyleOnPanel(style)) {
    const quiet = style === 'tab' && !flags.selected && !flags.hover;
    label.colour = (quiet ? palette.mutedText : palette.panelText) ?? label.colour;
  }
  const labelColour = label.colour ?? 'FFFFFFFF';
  const accent = palette.accent ?? 'FF5B9BD5';
  const hidden = { visible: false, selectedOnly: false, shape: 'circle', width: 0, height: 0, radius: 0, borderWidth: 0, fillColour: CLEAR, borderColour: CLEAR };
  let indicatorOuter = { ...hidden };
  let indicatorInner = { ...hidden };
  if (style === 'radio') {
    const lit = flags.selected || flags.hover;
    indicatorOuter = { ...hidden, visible: true, width: 13, height: 13, borderWidth: 1.5, borderColour: flags.selected ? accent : withAlpha(labelColour, lit ? 1 : 0.6) };
    indicatorInner = { ...hidden, visible: true, selectedOnly: true, width: 7, height: 7, fillColour: accent };
  } else if (style === 'led') {
    const kind = String(contentLayout?.lamp ?? '').toLowerCase();
    const size = Math.max(5, Math.min(14, numberOr(contentLayout?.lampSize, 9)));
    const lamp = kind === 'window'
      ? { shape: 'rounded', width: size * 1.8, height: size * 0.9, radius: 2 }
      : { shape: 'circle', width: size, height: size, radius: 0 };
    indicatorOuter = { ...hidden, ...lamp, visible: true, borderWidth: 1, fillColour: contentLayout?.lampOffColour ?? 'FF2C2C2C', borderColour: contentLayout?.lampBezelColour ?? '66FFFFFF', jewel: kind === 'jewel' };
    indicatorInner = { ...hidden, ...lamp, visible: true, selectedOnly: true, fillColour: contentLayout?.lampColour ?? accent, glow: true, jewel: kind === 'jewel' };
  } else if (style === 'tab') {
    indicatorInner = { ...hidden, visible: true, selectedOnly: true, shape: 'bar', width: 0, height: 2, fillColour: accent };
  }
  return {
    tree,
    indicatorOuter,
    indicatorInner,
    whole: { paddingY: 0, indicatorGap: style === 'led' ? 7 : 6, paddingX: null },
  };
}

function withAlpha(colour, alpha) {
  const parsed = argb(colour);
  if (!parsed) return colour;
  const a = Math.round(Math.max(0, Math.min(1, parsed.a * alpha)) * 255).toString(16).padStart(2, '0');
  return `${a}${String(colour).replace(/^#/, '').slice(-6)}`.toUpperCase();
}

// --- Patches -------------------------------------------------------------------------------------

/** A `whole` patch onto the option tree, legacy scalar border fields included. */
function applyWhole(look, patch) {
  if (!patch || typeof patch !== 'object') return;
  const fill = fillOf(look.tree);
  const border = borderOf(look.tree);
  const corners = cornersOf(look.tree);
  // An option's fill in the Segments tab is a flat colour: it covers a face's gradient or picture.
  if (patch.fillColour != null) Object.assign(fill, { colour: patch.fillColour, solidEnabled: true, gradientEnabled: false, imageEnabled: false });
  if (patch.border && typeof patch.border === 'object') Object.assign(border, deepClone(patch.border));
  if (patch.corners && typeof patch.corners === 'object') Object.assign(corners, deepClone(patch.corners));
  if (patch.borderColour != null) Object.assign(border, { colour: patch.borderColour, enabled: true });
  if (patch.borderWidth != null) {
    const thickness = Math.max(0, numberOr(patch.borderWidth, 0));
    Object.assign(border, { thickness, enabled: thickness > 0 });
  }
  if (patch.shape != null || patch.radius != null) {
    const shape = String(patch.shape ?? '').toLowerCase();
    corners.radius = shape === 'pill' ? 999 : shape === 'square' ? 0 : Math.max(0, numberOr(patch.radius, corners.radius ?? 0));
    corners.style = shape === 'square' ? 'straight' : 'rounded';
  }
  for (const key of ['paddingX', 'paddingY', 'indicatorGap']) {
    if (patch[key] != null) look.whole[key] = Math.max(0, numberOr(patch[key], 0));
  }
  // The option's own motion, as a state sets it (an option that grows under the pointer, the others
  // dimmed): drawn as a scale and an opacity, which a transition on `Parts.option` eases.
  if (patch.scale != null) look.motion.scale = Math.min(3, Math.max(0.2, numberOr(patch.scale, 1)));
  if (patch.opacity != null) look.motion.opacity = Math.min(1, Math.max(0, numberOr(patch.opacity, 1)));
}

function applyLabel(look, patch) {
  if (!patch || typeof patch !== 'object') return;
  const font = fontOf(look.tree);
  if (patch.colour != null) {
    textFillOf(look.tree).colour = patch.colour;
    // Chosen by hand (the Segments tab, or an old row colour): the guarantee leaves it alone.
    look.labelChosen = true;
  }
  if (patch.fontSize != null) font.size = Math.max(1, numberOr(patch.fontSize, font.size ?? 11));
  if (patch.fontWeight != null) font.weightValue = patch.fontWeight;
  if (patch.letterSpacing != null) font.letterSpacing = numberOr(patch.letterSpacing, 0);
  if (patch.fontFamily != null) font.family = patch.fontFamily;
  // Its words grown or shrunk about their middle, without moving the options: `Parts.optionLabel`'s
  // transition eases it.
  if (patch.scale != null) look.motion.labelScale = Math.min(3, Math.max(0.2, numberOr(patch.scale, 1)));
}

function applyParts(look, patch) {
  if (!patch || typeof patch !== 'object') return;
  applyWhole(look, patch.whole);
  applyLabel(look, patch.label);
  for (const part of ['indicatorOuter', 'indicatorInner']) {
    if (patch[part] && typeof patch[part] === 'object') {
      for (const [key, value] of Object.entries(patch[part])) {
        if (value != null) look[part][key] = deepClone(value);
      }
    }
  }
}

function applyStyleLayer(look, layer, rowId) {
  applyParts(look, layer?.shared);
  if (rowId) applyParts(look, layer?.rows?.[rowId]);
}

/** Legacy per-row colours (`Value.rows[].visualOverrides`): no editor writes them any more. */
function applyLegacyRow(look, row, selected) {
  const overrides = row?.visualOverrides ?? {};
  const pick = (base, chosen) => (selected && overrides[chosen] != null ? overrides[chosen] : overrides[base]);
  applyParts(look, {
    whole: { fillColour: pick('backgroundColour', 'selectedBackgroundColour'), borderColour: pick('borderColour', 'selectedBorderColour') },
    label: { colour: pick('textColour', 'selectedTextColour') },
  });
}

/** Only a state's look on the body and the text: an option has no transform, parts or effects. */
function optionPatchMap(component = {}) {
  return Object.fromEntries(Object.entries(component ?? {}).filter(([path]) => /^(Background|Text)\./.test(path)));
}

// --- The guarantees ------------------------------------------------------------------------------

/** What a fill paints, to tell whether a state changed it. */
function fillSignature(fill) {
  return JSON.stringify([fill.colour, fill.solidEnabled !== false, fill.gradientEnabled === true, fill.gradient ?? null, fill.imageEnabled === true]);
}

/**
 * The first of `candidates` that stands out from `face` by `minimum` (WCAG contrast), else the one
 * that stands out most: a set's own colour for the thumb, chosen per set, since in a fifth of the
 * built-in sets the "on" body is the face's own colour.
 */
export function standsOutFrom(face, candidates = [], minimum = 1.4) {
  const usable = candidates.filter((colour) => argb(colour));
  if (!usable.length) return null;
  if (!argb(face)) return usable[0];
  return usable.find((colour) => colourContrast(colour, face) >= minimum)
    ?? usable.reduce((best, colour) => (colourContrast(colour, face) > colourContrast(best, face) ? colour : best));
}

function bodyShows(tree) {
  const fill = fillOf(tree);
  const border = borderOf(tree);
  const solid = fill.solidEnabled !== false && (argb(fill.colour)?.a ?? 0) > 0.02;
  return solid || fill.gradientEnabled === true || fill.imageEnabled === true
    || (border.enabled === true && numberOr(border.thickness, 0) > 0);
}

/**
 * The tone a fill shows, as one colour, or null where it cannot be known (a picture): its solid
 * colour laid over `backdrop`, then its gradient's stops, averaged, laid over that at the
 * gradient's opacity. A set chooses its lettering against a face's solid colour, and a face drawn
 * as a gradient can be far lighter or darker than that, or barely tinted by a faint gloss.
 */
export function fillTone(fill, backdrop = null) {
  if (!fill || fill.imageEnabled === true) return null;
  const mix = (top, bottom, amount) => ({
    r: top.r * amount + bottom.r * (1 - amount),
    g: top.g * amount + bottom.g * (1 - amount),
    b: top.b * amount + bottom.b * (1 - amount),
    a: 1,
  });
  const under = argb(backdrop);
  let tone = null;
  const solid = fill.solidEnabled !== false ? argb(fill.colour) : null;
  if (solid) tone = under ? mix(solid, under, solid.a) : (solid.a >= 0.6 ? solid : null);
  const stops = fill.gradientEnabled === true && Array.isArray(fill.gradient?.stops)
    ? fill.gradient.stops.map((stop) => argb(stop?.color ?? stop?.colour)).filter(Boolean)
    : [];
  if (stops.length) {
    const mean = (channel) => stops.reduce((sum, stop) => sum + stop[channel], 0) / stops.length;
    const gradient = { r: mean('r'), g: mean('g'), b: mean('b'), a: 1 };
    const opacity = Math.max(0, Math.min(1, numberOr(fill.gradientOpacity, 100) / 100));
    const below = tone ?? under;
    tone = below ? mix(gradient, below, opacity) : (opacity >= 0.6 ? gradient : null);
  }
  if (!tone) return null;
  const hex = (value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
  return `FF${hex(tone.r)}${hex(tone.g)}${hex(tone.b)}`.toUpperCase();
}

/**
 * A background's tone with its lit material (utils/materialFilter.js) counted: the lamp's specular
 * light lifts a surface toward white, about 0.4 of the way per unit of specular constant, capped,
 * measured against the glass faces of four sets (a dark fill drawn near #9EA2A6). An estimate:
 * enough to tell dark lettering from light, not a colour to paint with.
 */
export function backgroundTone(background, backdrop = null) {
  const tone = fillTone(background?._children?.Fill, backdrop);
  const material = background?._children?.Effects?._children?.Material;
  if (!tone || !materialActive(material)) return tone;
  const shine = Math.max(0, numberOr(material.shine, 100)) / 100;
  const lift = Math.min(0.7, 0.4 * materialRecipe(material.kind).spec * shine);
  const base = argb(tone);
  const hex = (value) => Math.round(value + (255 - value) * lift).toString(16).padStart(2, '0');
  return `FF${hex(base.r)}${hex(base.g)}${hex(base.b)}`.toUpperCase();
}

// --- Resolution ----------------------------------------------------------------------------------

/**
 * How one option is drawn. `flags` are the option's own: chosen, the pointer over it, pressed on
 * it, focused from the keyboard. `palette` holds the set's colours resolved (panelText, mutedText,
 * accent, thumb). `signals` are the control's, for states that also read something else (a value,
 * a channel); `previewState` forces one state on this option (the Segments tab showing it).
 *
 * Returns `{ body, label, indicatorOuter, indicatorInner, whole }`: `body` a Background to draw, or
 * null where the option draws no body; `label` its lettering; the indicators as drawn. `fill`,
 * `border` and `corners` are the body's as resolved even where it draws none, for the Segments tab.
 */
export function resolveChoiceOption({
  style = 'segmented',
  row = null,
  flags = {},
  background = null,
  text = null,
  contentLayout = null,
  valueSection = null,
  statesSection = null,
  signals = {},
  palette = {},
  previewState = '',
  inset = 2,
  includeRowBase = true,
  includeStateRows = true,
} = {}) {
  const rowId = String(row?.id ?? '');
  const selected = flags.selected === true;
  const look = baseLook({ style, background, text, contentLayout, palette, flags, inset });
  look.motion = { scale: 1, opacity: 1, labelScale: 1 };

  // The Segments tab leaves layers out to find what a field inherits (SegmentsEditor.svelte).
  if (includeRowBase) applyLegacyRow(look, row, selected);
  applyStyleLayer(look, valueSection?.segmentStyle, includeRowBase ? rowId : '');
  const restingFill = fillSignature(fillOf(look.tree));

  const optionSignals = {
    ...signals,
    hover: flags.hover === true,
    pressed: flags.pressed === true,
    focused: flags.focused === true,
    checked: selected,
    selectionActive: selected,
    // Another option is under the pointer: a state about it dims the rest (the Spotlight preset).
    peerHover: flags.peerHover === true,
  };
  // An option state paints the option (where the style paints options) with its component patch;
  // any other state that holds is the control's, and paints it, except in the buttons style, where
  // the Background is each key. Either one's `segments` patch reaches every option.
  const paintsOptions = choiceStyleDrawsFrame(style) || style === 'buttons';
  for (const [name, state] of statesInPrecedence(statesSection)) {
    const ofOption = isOptionState(state);
    const forced = previewState && name === previewState && state?.enabled !== false;
    if (!forced && !stateMatches(state, ofOption ? optionSignals : signals)) continue;
    if (ofOption ? paintsOptions : style === 'buttons') {
      const patch = optionPatchMap(state?.patches?.component);
      applyStatePatchMap(look.tree, patch);
      if (patch['Text.Fill.colour'] != null) look.labelChosen = false;
    }
    applyStyleLayer(look, state?.patches?.segments, includeStateRows ? rowId : '');
  }

  // A chosen option whose fill no state changed (78 of the built-in sets give the radio group a
  // Selected state that colours only the border and the text) takes the thumb: in a strip it would
  // be invisible, and a key would differ by its outline alone.
  if (selected && paintsOptions && fillSignature(fillOf(look.tree)) === restingFill) {
    Object.assign(fillOf(look.tree), { colour: palette.thumb ?? 'FF2D6F9C', solidEnabled: true, gradientEnabled: false, imageEnabled: false });
  }
  // What the label sits on: its own body, else (an option with none, in a strip) the frame.
  const body = bodyShows(look.tree);
  const frameTone = choiceStyleDrawsFrame(style) ? backgroundTone(background, palette.panel) : null;
  const underLabel = body ? backgroundTone(look.tree._children.Background, frameTone ?? palette.panel) : frameTone;
  const labelFill = textFillOf(look.tree);
  if (underLabel && !look.labelChosen && colourContrast(labelFill.colour ?? 'FFFFFFFF', underLabel) < 3) {
    labelFill.colour = inkOn(underLabel);
  }

  const font = fontOf(look.tree);
  return {
    body: body ? look.tree._children.Background : null,
    fill: fillOf(look.tree),
    border: borderOf(look.tree),
    corners: cornersOf(look.tree),
    label: {
      colour: labelFill.colour ?? 'FFFFFFFF',
      fontSize: Math.max(1, numberOr(font.size, 11)),
      fontWeight: font.weightValue ?? (String(font.weight ?? '').trim() || 600),
      fontFamily: font.family ?? '',
      fontStyle: String(font.style ?? 'Normal'),
      letterSpacing: numberOr(font.letterSpacing, 0),
      textTransform: { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize' }[String(font.caseMode ?? '').toLowerCase()] ?? 'none',
    },
    indicatorOuter: look.indicatorOuter,
    indicatorInner: { ...look.indicatorInner, shown: look.indicatorInner.visible !== false && (look.indicatorInner.selectedOnly !== true || selected) },
    whole: look.whole,
    motion: look.motion,
  };
}
