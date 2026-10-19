// scriptColours.js — what a script may write where the panel reads a colour, and what it may draw
// with. docs/design/script-editor-value-editors.md, "Two readers", is the background.
//
// TWO READERS, AND THEY READ DIFFERENTLY. The panel reads a colour property with
// canvasControlStyles.parseHexColor: 6 hex digits are RRGGBB, 8 are AARRGGBB (JUCE's order, the
// panel's own stored form), one leading "#" is dropped, and anything else paints white. The script
// draw overlay hands its string to SVG, which reads CSS: "#" with 3, 4, 6 or 8 digits (the 8 being
// RRGGBBAA, the same bytes in the other order), rgb(), hsl() and the named colours.
//
// So a script writing "#000" or "red" into a property got white, and a script drawing in
// "FF5B9BD5", the very value get() returns for a colour property, got nothing at all. Each reader
// now refuses what it cannot read, saying what to write instead, and the overlay is handed the
// panel's own forms already turned into CSS. A property also takes the CSS forms that have one
// reading ("#RGB", the names, rgb() and hsl()) and stores them written out in the panel's form, by
// the owner's decision; what has two readings, or none, is still refused (panelColour).
//
// The ce.math colour helpers read a colour exactly as a property would store it (storedColour): the
// panel's forms as written, CSS's short forms written out. They exist in the exported plug-in's Lua,
// JavaScript and Python preludes too, so COLOUR_FORMS, hexHint, unitProblem, realNumber and the
// reading of CSS's forms (cssChannels, panelFormOf, longForm, cssHint) are written out again there,
// word for word, and CSS_NAMED_COLOURS is generated into each by tools/scripts/gen-script-modules.mjs.
// scriptPreludeAgreement.test.js holds them to it. Drawing colours are panel-view only.
//
// The property rule (panelColour, colourFieldAt, mapColourWrites) holds with the plug-in's window
// shut as well, where a set() from any engine reaches the C++ panel model instead of this file.
// CE/src/Scripting/ScriptColours.h is the same rule in C++, in the same words, and reads its tables
// from ScriptColours.generated.h, which tools/scripts/gen-colour-fields.mjs writes from the exports
// below (COLOUR_FORMS, COLOUR_FIELDS, PANEL_COLOUR_FIELDS, EFFECT_TYPES, MADE_CHILDREN,
// CSS_NAMED_COLOURS) and the section templates, so which properties are colours is said once.
// CE/web/test/fixtures/colourPropertyCases.json is read by both sides' tests: a case that answers
// differently in one fails there.
//
// The panel document's own colours (set("panel.bgColour", …)) are read by the same rule, from the
// document a new panel starts as (models/panelDefaults.js), as a control's are from the section
// templates: see PANEL_COLOUR_FIELDS. A gradient's stops, the panel's and every control's, are read
// by it too and stored in a stop's own form, RRGGBB with no alpha: see GRADIENT and stopColour.

import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { panelDefaults } from '../models/panelDefaults.js';
import { isColourKey, isTokenReference, tokenNameOf } from '../models/controlSets.js';

/* ----------------------------------------------------------------------- the panel's forms */

const PANEL_HEX = /^#?(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Does the panel read this as a colour? 6 or 8 hex digits, with or without one leading "#". */
export function isPanelColour(value) {
  return typeof value === 'string' && PANEL_HEX.test(value);
}

/**
 * The forms a colour may be written in, in the words every refusal uses, here and in the preludes:
 * the panel's own, and CSS's short forms, which a property writes out and ce.math reads (longForm).
 */
export const COLOUR_FORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", '
  + 'or "#RGB", a CSS colour name, rgb() or hsl()';

/** A number as a message prints it. The preludes print the numbers a script writes the same way. */
export const shownNumber = (n) => String(n);

const hexDigits = (n, width) => n.toString(16).toUpperCase().padStart(width, '0');

/**
 * The colour a mistaken value most likely meant, as a sentence for the end of a refusal, or ''.
 *
 * Only the two guesses that need no table, so that every prelude's ce.math can make them too: CSS's
 * three- and four-digit shorthand written out in full, and a number written as text. Four digits
 * are RGBA in CSS, so the alpha moves to the front, where the panel keeps it. A number at or under
 * FFFFFF is RRGGBB; above it, the panel's AARRGGBB.
 */
export function hexHint(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) return '';
    const text = value <= 0xFFFFFF ? `#${hexDigits(value, 6)}` : hexDigits(value, 8);
    return ` As text, ${shownNumber(value)} is "${text}".`;
  }
  if (typeof value !== 'string') return '';
  const m = /^(#?)([0-9a-f]{3,4})$/i.exec(value);
  if (!m) return '';
  const d = m[2].toUpperCase();
  const two = (i) => d[i] + d[i];
  return d.length === 3
    ? ` Write "${m[1]}${two(0)}${two(1)}${two(2)}".`
    : ` Write "${two(3)}${two(0)}${two(1)}${two(2)}".`;
}

/* ------------------------------------------------------------------- numbers on 0..1 scales */

const DECIMAL_TEXT = /^\s*[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\s*$/;

/**
 * A finite number, or text that is one written in decimal ("0.5", " 40 "), or undefined.
 * Text is read because the runtimes always took it here (JavaScript's Number, Lua's tonumber); a
 * stricter grammar than either, so "0x10", "" and "inf" are refused alike in every engine.
 */
export function realNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !DECIMAL_TEXT.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** " If you meant 50 out of 100, write 0.5." when dividing by 100 lands inside 0..1, else ''. */
export function percentHint(n) {
  const scaled = n / 100;
  if (!(scaled >= 0 && scaled <= 1)) return '';
  return ` If you meant ${shownNumber(n)} out of 100, write ${shownNumber(Number(scaled.toFixed(4)))}.`;
}

/**
 * Why `value` is not a number on a 0..1 scale, or null when it is. `what` names the scale ("the
 * amount", "the opacity"). A number outside it is not clamped: 50 written for 0.5 used to come out
 * fully solid, and that is the silent failure this replaces.
 */
export function unitProblem(what, value) {
  const n = realNumber(value);
  if (n !== undefined && n >= 0 && n <= 1) return null;
  // A number that is not finite (0 / 0) prints differently in every language, so it is not printed.
  let shown;
  if (value === undefined || value === null) shown = 'none was given';
  else if (typeof value === 'string') shown = `"${value}" is not`;
  else if (typeof value === 'number' && Number.isFinite(value)) shown = `${shownNumber(value)} is not`;
  else shown = 'the value given is not';
  return { why: `${what} is a number from 0 to 1, and ${shown}`, hint: n === undefined ? '' : percentHint(n) };
}

/** " If you meant 50%, write 0.5." for percent text, which only the panel-view verbs read this way. */
export function percentTextHint(value) {
  if (typeof value !== 'string') return '';
  const m = /^\s*([0-9]+\.?[0-9]*|\.[0-9]+)\s*%\s*$/.exec(value);
  if (!m) return '';
  const scaled = Number(m[1]) / 100;
  return scaled >= 0 && scaled <= 1
    ? ` If you meant ${value.trim()}, write ${shownNumber(Number(scaled.toFixed(4)))}.`
    : '';
}

/* -------------------------------------------------------------------------------- CSS's forms */

/** The CSS named colours (CSS Color Module Level 4, all 148), as RRGGBB. */
export const CSS_NAMED_COLOURS = Object.freeze({
  aliceblue: 'F0F8FF', antiquewhite: 'FAEBD7', aqua: '00FFFF', aquamarine: '7FFFD4', azure: 'F0FFFF',
  beige: 'F5F5DC', bisque: 'FFE4C4', black: '000000', blanchedalmond: 'FFEBCD', blue: '0000FF',
  blueviolet: '8A2BE2', brown: 'A52A2A', burlywood: 'DEB887', cadetblue: '5F9EA0', chartreuse: '7FFF00',
  chocolate: 'D2691E', coral: 'FF7F50', cornflowerblue: '6495ED', cornsilk: 'FFF8DC', crimson: 'DC143C',
  cyan: '00FFFF', darkblue: '00008B', darkcyan: '008B8B', darkgoldenrod: 'B8860B', darkgray: 'A9A9A9',
  darkgreen: '006400', darkgrey: 'A9A9A9', darkkhaki: 'BDB76B', darkmagenta: '8B008B',
  darkolivegreen: '556B2F', darkorange: 'FF8C00', darkorchid: '9932CC', darkred: '8B0000',
  darksalmon: 'E9967A', darkseagreen: '8FBC8F', darkslateblue: '483D8B', darkslategray: '2F4F4F',
  darkslategrey: '2F4F4F', darkturquoise: '00CED1', darkviolet: '9400D3', deeppink: 'FF1493',
  deepskyblue: '00BFFF', dimgray: '696969', dimgrey: '696969', dodgerblue: '1E90FF', firebrick: 'B22222',
  floralwhite: 'FFFAF0', forestgreen: '228B22', fuchsia: 'FF00FF', gainsboro: 'DCDCDC',
  ghostwhite: 'F8F8FF', gold: 'FFD700', goldenrod: 'DAA520', gray: '808080', green: '008000',
  greenyellow: 'ADFF2F', grey: '808080', honeydew: 'F0FFF0', hotpink: 'FF69B4', indianred: 'CD5C5C',
  indigo: '4B0082', ivory: 'FFFFF0', khaki: 'F0E68C', lavender: 'E6E6FA', lavenderblush: 'FFF0F5',
  lawngreen: '7CFC00', lemonchiffon: 'FFFACD', lightblue: 'ADD8E6', lightcoral: 'F08080',
  lightcyan: 'E0FFFF', lightgoldenrodyellow: 'FAFAD2', lightgray: 'D3D3D3', lightgreen: '90EE90',
  lightgrey: 'D3D3D3', lightpink: 'FFB6C1', lightsalmon: 'FFA07A', lightseagreen: '20B2AA',
  lightskyblue: '87CEFA', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'B0C4DE',
  lightyellow: 'FFFFE0', lime: '00FF00', limegreen: '32CD32', linen: 'FAF0E6', magenta: 'FF00FF',
  maroon: '800000', mediumaquamarine: '66CDAA', mediumblue: '0000CD', mediumorchid: 'BA55D3',
  mediumpurple: '9370DB', mediumseagreen: '3CB371', mediumslateblue: '7B68EE',
  mediumspringgreen: '00FA9A', mediumturquoise: '48D1CC', mediumvioletred: 'C71585',
  midnightblue: '191970', mintcream: 'F5FFFA', mistyrose: 'FFE4E1', moccasin: 'FFE4B5',
  navajowhite: 'FFDEAD', navy: '000080', oldlace: 'FDF5E6', olive: '808000', olivedrab: '6B8E23',
  orange: 'FFA500', orangered: 'FF4500', orchid: 'DA70D6', palegoldenrod: 'EEE8AA', palegreen: '98FB98',
  paleturquoise: 'AFEEEE', palevioletred: 'DB7093', papayawhip: 'FFEFD5', peachpuff: 'FFDAB9',
  peru: 'CD853F', pink: 'FFC0CB', plum: 'DDA0DD', powderblue: 'B0E0E6', purple: '800080',
  rebeccapurple: '663399', red: 'FF0000', rosybrown: 'BC8F8F', royalblue: '4169E1',
  saddlebrown: '8B4513', salmon: 'FA8072', sandybrown: 'F4A460', seagreen: '2E8B57', seashell: 'FFF5EE',
  sienna: 'A0522D', silver: 'C0C0C0', skyblue: '87CEEB', slateblue: '6A5ACD', slategray: '708090',
  slategrey: '708090', snow: 'FFFAFA', springgreen: '00FF7F', steelblue: '4682B4', tan: 'D2B48C',
  teal: '008080', thistle: 'D8BFD8', tomato: 'FF6347', turquoise: '40E0D0', violet: 'EE82EE',
  wheat: 'F5DEB3', white: 'FFFFFF', whitesmoke: 'F5F5F5', yellow: 'FFFF00', yellowgreen: '9ACD32',
});

const NUM = '[+-]?(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const ALPHA_LEGACY = `(?:,\\s*(${NUM})(%?)\\s*)?`;
const ALPHA_MODERN = `(?:\\/\\s*(${NUM})(%?)\\s*)?`;
const RGB_LEGACY = new RegExp(`^rgba?\\(\\s*(${NUM})(%?)\\s*,\\s*(${NUM})(%?)\\s*,\\s*(${NUM})(%?)\\s*${ALPHA_LEGACY}\\)$`, 'i');
const RGB_MODERN = new RegExp(`^rgba?\\(\\s*(${NUM})(%?)\\s+(${NUM})(%?)\\s+(${NUM})(%?)\\s*${ALPHA_MODERN}\\)$`, 'i');
const HSL_LEGACY = new RegExp(`^hsla?\\(\\s*(${NUM})(deg|grad|rad|turn)?\\s*,\\s*(${NUM})()%\\s*,\\s*(${NUM})()%\\s*${ALPHA_LEGACY}\\)$`, 'i');
const HSL_MODERN = new RegExp(`^hsla?\\(\\s*(${NUM})(deg|grad|rad|turn)?\\s+(${NUM})(%?)\\s+(${NUM})(%?)\\s*${ALPHA_MODERN}\\)$`, 'i');
const TURN = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const alphaOf = (value, percent) => (value === undefined
  ? 1 : clamp(Number(value) / (percent ? 100 : 1), 0, 1));

/**
 * A CSS colour as { r, g, b, a } (0-255, 0-1), or null when CSS would not read it.
 *
 * Each prelude has this by hand (__ccss), so every rounding and clamp here is one they repeat:
 * Math.round takes a half up, toward +infinity, and `%` keeps the sign of what it divides.
 */
function cssChannels(text) {
  const s = String(text).trim();
  const lower = s.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  // An own name only: "constructor" and "__proto__" are on every object's prototype, and reading
  // them as names threw from set() and ce.draw.fill.
  const named = Object.prototype.hasOwnProperty.call(CSS_NAMED_COLOURS, lower) ? CSS_NAMED_COLOURS[lower] : '';
  if (named) return { r: parseInt(named.slice(0, 2), 16), g: parseInt(named.slice(2, 4), 16), b: parseInt(named.slice(4, 6), 16), a: 1 };
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    const d = m[1].length <= 4 ? m[1].replace(/./g, (c) => c + c) : m[1];
    const byte = (i) => parseInt(d.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: d.length === 8 ? byte(6) / 255 : 1 };
  }
  m = RGB_LEGACY.exec(s) ?? RGB_MODERN.exec(s);
  if (m) {
    const channel = (i) => clamp(Math.round(Number(m[i]) * (m[i + 1] ? 2.55 : 1)), 0, 255);
    return { r: channel(1), g: channel(3), b: channel(5), a: alphaOf(m[7], m[8]) };
  }
  m = HSL_LEGACY.exec(s) ?? HSL_MODERN.exec(s);
  if (m) {
    // A hue too large to be a number ("1e400", "1e308turn") has no angle; it was stored as
    // "#NANNANNAN".
    const turned = Number(m[1]) * TURN[(m[2] ?? 'deg').toLowerCase()];
    if (!Number.isFinite(turned)) return null;
    const h = (turned % 360 + 360) % 360;
    const sat = clamp(Number(m[3]), 0, 100) / 100;
    const light = clamp(Number(m[5]), 0, 100) / 100;
    const k = (n) => (n + h / 30) % 12;
    const amp = sat * Math.min(light, 1 - light);
    const f = (n) => Math.round(255 * (light - amp * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return { r: f(0), g: f(8), b: f(4), a: alphaOf(m[7], m[8]) };
  }
  return null;
}

/** The same colour in the panel's form: #RRGGBB when solid, AARRGGBB when it is not. */
function panelFormOf({ r, g, b, a }) {
  const rgb = `${hexDigits(r, 2)}${hexDigits(g, 2)}${hexDigits(b, 2)}`;
  return a >= 1 ? `#${rgb}` : `${hexDigits(Math.round(a * 255), 2)}${rgb}`;
}

/**
 * A colour a script wrote to a property in one of CSS's shorter forms, written out in the panel's:
 * "#RGB" as "#RRGGBB", a name in any case as its "#RRGGBB", and rgb(), rgba(), hsl() and hsla() as
 * "#RRGGBB", or as AARRGGBB when their alpha is below 1. "transparent" is "00000000". '' otherwise.
 *
 * Left out is what has more than one reading, so that storing it would be a guess: "#" with four
 * digits is RGBA to CSS and would be ARGB in the panel's order, and a number could be RRGGBB or
 * AARRGGBB. Three digits with no "#" are not CSS, and as text are as likely a number ("255").
 * currentColor has no colour of its own here, and text with space around it is refused as the panel
 * refuses " 5B9BD5". "#" with six or eight digits never gets here: the panel reads those as written.
 */
function longForm(value) {
  if (typeof value !== 'string' || value !== value.trim()) return '';
  if (value.startsWith('#') && !/^#[0-9a-f]{3}$/i.test(value)) return '';
  const channels = cssChannels(value);
  return channels ? panelFormOf(channels) : '';
}

/**
 * What a colour property would store for `value`: the panel's own form exactly as written, CSS's
 * short form written out (longForm), or '' when it is neither. The ce.math colour readers read
 * through this, so "red" is "#FF0000" there and rgba(255, 0, 0, 0.5) is "80FF0000", read as that
 * AARRGGBB is, with its alpha set aside.
 */
export function storedColour(value) {
  return isPanelColour(value) ? value : longForm(value);
}

/**
 * For a refusal: what a CSS colour with space around it is in the panel's form, or ''. Text that is
 * the panel's own form once the space is gone is that text: "#5B9BD580 " is AARRGGBB here, as it
 * is without the space, and not CSS's RRGGBBAA.
 */
function cssHint(value) {
  if (typeof value !== 'string' || isPanelColour(value)) return '';
  const trimmed = value.trim();
  if (trimmed !== value && isPanelColour(trimmed)) return ` Write "${trimmed}".`;
  const channels = cssChannels(value);
  return channels ? ` Write "${panelFormOf(channels)}".` : '';
}

/**
 * The sentence that ends a colour refusal, after COLOUR_FORMS: the full form of hex shorthand that
 * is refused ("#abcd", "abc") or of a number (hexHint), else what CSS text with space around it
 * means (cssHint), or ''. A property and ce.math end their refusals with it, so the two say the
 * same of one value.
 */
export function colourHint(value) {
  return hexHint(value) || cssHint(value);
}

/* ------------------------------------------------------------------------ drawing colours */

/** What every ce.draw colour refusal says can be written. */
export const DRAW_COLOUR_FORMS = 'A drawing colour is the panel\'s RRGGBB or AARRGGBB, as get() '
  + 'returns it, or a CSS colour such as "#5B9BD5", "rgb(91, 155, 213)" or "steelblue".';

/**
 * A ce.draw colour, as the overlay should paint it: `{ css }` (a string SVG reads, a gradient
 * object, or null for no paint), or `{ why, hint }` when it is not a colour.
 *
 * The panel's own forms are the ones SVG cannot read, so they are turned into CSS here: bare
 * RRGGBB gains its "#", and bare AARRGGBB becomes rgba() with its alpha, since "#" with eight
 * digits means RRGGBBAA to CSS. What CSS reads already is kept exactly as written, including "#"
 * with eight digits, which keeps CSS's meaning in a drawing. Empty and "none" stop painting, as
 * they always did.
 */
export function drawColour(value) {
  if (value === undefined || value === null) return { css: null };
  if (typeof value === 'object') {
    return value.gradient ? { css: value } : { why: 'the value given is neither a colour nor a gradient from ce.draw.gradient()', hint: '' };
  }
  if (typeof value === 'number') return { why: `${shownNumber(value)} is a number, not a colour`, hint: hexHint(value) };
  if (typeof value !== 'string') return { why: 'the value given is not a colour', hint: '' };
  const s = value.trim();
  if (s === '' || s.toLowerCase() === 'none') return { css: null };
  if (/^[0-9a-f]{6}$/i.test(s)) return { css: `#${s}` };
  if (/^[0-9a-f]{8}$/i.test(s)) {
    const byte = (i) => parseInt(s.slice(i, i + 2), 16);
    const alpha = byte(0);
    return { css: alpha === 255 ? `#${s.slice(2)}` : `rgba(${byte(2)}, ${byte(4)}, ${byte(6)}, ${Number((alpha / 255).toFixed(3))})` };
  }
  if (cssChannels(s)) return { css: s };
  return { why: `"${value}" is not a colour`, hint: hexHint(s) };
}

/* ------------------------------------------------------------------- colour properties */

/**
 * What writing `value` to a colour property stores: `{ colour }`, or `{ why, advice }` when the
 * panel cannot read it, for the caller to set in its own sentence: `set("…"): <why>, so nothing was
 * set. <advice>`. set(), ce.panel.patch, ce.panel.create and clone's props, the component verbs and
 * both image tints ask here, so they all agree.
 *
 * What the panel reads is stored exactly as written. CSS's shorter forms are stored written out
 * (longForm), so get() afterwards answers "#FF0000" for "red". Nothing is said when that happens:
 * the owner chose to accept them, each has one reading, and a note on every such write would fill
 * the console of a script that recolours a control on every tick.
 *
 * `field` is what colourFieldAt found: `empty` when the property's own default is "" (no colour of
 * its own, like a Font's underlineColour, which then draws in the text's colour), and `tokens` when
 * the renderer resolves a control-set reference such as "{accent}" in it. `resolvesToken(name)`
 * says whether the panel's control set (or the base set behind it) defines that name.
 *
 * `stop` marks a gradient stop's colour, which is read by the same rule and stored in the stop's
 * own form (stopColour): "red" is "FF0000" there, and a colour with an alpha below FF is refused.
 */
export function panelColour(value, field = {}, resolvesToken = () => false) {
  if (value === '' && field.empty) return { colour: value };
  const reference = typeof value === 'string' && isTokenReference(value);
  if (reference && field.tokens && resolvesToken(tokenNameOf(value))) return { colour: value };
  const colour = isPanelColour(value) ? value : longForm(value);
  if (colour) return field.stop ? stopColour(value, colour) : { colour };

  let why;
  if (value === undefined || value === null) why = 'no colour was given';
  else if (typeof value === 'string') why = `"${value}" is not a colour the panel can read`;
  else if (typeof value === 'number') why = `${shownNumber(value)} is not a colour the panel can read`;
  else why = 'the value given is not a colour';
  let hint = colourHint(value);
  if (reference) {
    hint = field.tokens
      ? ` The panel's control set has no colour called "${tokenNameOf(value)}".`
      : ' A control-set colour is not read in this property.';
  }
  if (field.stop) {
    return { why, advice: `${COLOUR_FORMS}, and a gradient stop takes no alpha.${stopHint(hint)}` };
  }
  return { why, advice: `${COLOUR_FORMS}${field.empty ? ', or "" for none' : ''}.${hint}` };
}

/**
 * A refusal's hint as a gradient stop takes it. The hint for "#0008" is the AARRGGBB it reads as,
 * "88000000", which a stop would refuse in turn for its alpha; a stop is told the colour without
 * it, in the words its own alpha refusal uses. Any other hint is the one every colour gets.
 */
function stopHint(hint) {
  const m = /^ Write "([0-9A-F]{2})([0-9A-F]{6})"\.$/.exec(hint);
  return m && m[1] !== 'FF' ? ` Write "${m[2]}", the colour without its alpha.` : hint;
}

/**
 * `colour`, read by panelColour from what a script wrote (`value`), in a gradient stop's own form:
 * RRGGBB, upper case, with no "#", which is what the gradient editors store (utils/stopColourEdit.js
 * normalizeStopColour) and what most readers of a stop take (outlineBorder's stopsColourAt,
 * partsToSvg, the part bake). A stop has no alpha of its own: the gradient's opacity is its layer's.
 * So eight digits are stored as their colour when the alpha is FF, and refused otherwise, as are
 * rgba() and hsla() with an alpha below 1 and "transparent". `value` is text here: nothing else is
 * a colour.
 */
function stopColour(value, colour) {
  const hex = colour.replace(/^#/, '').toUpperCase();
  if (hex.length === 6 || hex.startsWith('FF')) return { colour: hex.slice(-6) };
  return {
    why: `"${value}" has an alpha, and a gradient stop has none: its opacity is the gradient layer's`,
    advice: `Write "${hex.slice(2)}", the colour without its alpha.`,
  };
}

// WHICH PROPERTIES ARE COLOURS, read from the section templates (models/sectionDefaults.js): a
// field whose default is a colour (6 or 8 hex digits, or a control-set reference) is a colour field.
// The templates are the panel's own description of every section's shape, the one set()'s fresh-key
// warning reads, and they say what a name cannot: Icon.tint and Fill.imageTint are colours, and
// Pixel.imageColour, a true/false switch despite its name, is not.
//
// The one thing a default cannot say is the type of a field whose default is "", which means "no
// colour of its own" (Font.underlineColour draws in the text's colour). For those few the name
// decides, by the renderer's own rule (controlSets.isColourKey), and "" stays writable in them.
//
// Keyed by section type, then by the path below the nearest typed node, with list positions as "*"
// so a Meter's fourth zone is typed by the template's first: "Border" -> "top.colour",
// "Meter" -> "zones.*.colour". Lower case, because paths are matched case-insensitively.

// Fill's optional effect targets materialise from the Effects template under their own names
// (controlTreeUtils.getDefaultChildTemplate), so they share its fields.
export const EFFECT_TYPES = new Set(['SolidEffects', 'GradientEffects', 'ImageEffects', 'OverlayEffects']);

// The children set() makes that no template lists, by the section they are made under and the name
// (lower case) they are written as, with the type each is made as: Background's and Border's
// `effects`, and Fill's optional effect targets, each from the Effects template
// (controlTreeUtils.getDefaultChildTemplate). templateChild reads it; so does the C++ walk.
export const MADE_CHILDREN = Object.freeze({
  Background: Object.freeze({ effects: 'Effects' }),
  Border: Object.freeze({ effects: 'Effects' }),
  Fill: Object.freeze(Object.fromEntries([...EFFECT_TYPES].map((name) => [name.toLowerCase(), name]))),
});

// The items of a list a template starts empty, which no first item is there to type: the Drum Pads'
// per-pad overrides, sparse and index-aligned with the grid, each of which may set a `colour` that
// is "" for the section accent (utils/drumPadLayout.js resolveDrumPads, read by the renderer as 6 or
// 8 hex digits). By section type and list name, with an item's colour fields at their defaults, read
// below as a template's first item is read, so `pads.*.colour` is a colour field for set() and for
// ce.components.drumpads.colour alike. The C++ reads it in the table COLOUR_FIELDS is written into.
export const LIST_ITEMS = Object.freeze({
  DrumPads: Object.freeze({ pads: Object.freeze({ colour: '' }) }),
});

// A GRADIENT, as the gradient editors make one and every reader takes it ({ type, angle, centerX,
// …, stops: [{ color, position }, …] }), reduced to the one colour in it: a stop's. The section
// templates give a control's gradient as null (Fill's, Border's and each side's, Corners' and each
// corner's), so there is no first stop to type the rest by, as there is no first pad in LIST_ITEMS'
// lists; a template key called `gradient` whose default is null is read as this. (Meter's
// `gradient` is a true/false switch, and is not.) The panel's own gradient, bgGradient, is a whole
// one in its template and is read as it stands.
export const GRADIENT = Object.freeze({ stops: Object.freeze([Object.freeze({ color: 'FFFFFF', position: 0 })]) });

// A GRADIENT STOP'S COLOUR is told by where it is: `color` in an item of a list called `stops`. That
// is a gradient's own shape, wherever the gradient is (bgGradient on the panel, a Fill's, a Border
// side's), and no other list in the templates or the panel document is called `stops`, so no list
// of gradients is kept beside the templates to fall out of step with them. It is marked `stop` in
// both tables as they are built, and the C++ reads the mark from the generated rows rather than
// telling it again. panelColour reads a stop by the same rule as any colour and stores it in the
// stop's own form (stopColour). No reader of a stop resolves a control-set reference, so `tokens`
// is false in every one.
const isStopPath = (rel, key) => key === 'color' && rel.length >= 2
  && rel[rel.length - 1] === '*' && String(rel[rel.length - 2]).toLowerCase() === 'stops';

/**
 * Is a template's `key: value`, at `rel` below its section (or the panel), a colour field?
 * `{ empty, stop }` when it is (`empty`: its default is "", no colour of its own; `stop`: a gradient
 * stop's colour), or null. The one rule the section templates and the panel's are read by.
 */
function colourDefault(key, value, rel) {
  if (typeof value !== 'string') return null;
  const stop = isStopPath(rel, key);
  if (isPanelColour(value) || isTokenReference(value)) return { empty: false, stop };
  if (value === '' && !stop && isColourKey(key)) return { empty: true, stop };
  return null;
}

/** A colour field as both tables hold it: `stop` is there only on a stop, so every other reads
 *  { empty, tokens } as it always did. */
const fieldOf = (empty, tokens, stop) => (stop ? { empty, tokens: false, stop: true } : { empty, tokens });

export const COLOUR_FIELDS = (() => {
  const fields = new Map();
  const add = (type, path, key, { empty, stop }) => {
    if (!fields.has(type)) fields.set(type, new Map());
    const id = path.join('.').toLowerCase();
    const was = fields.get(type).get(id);
    fields.get(type).set(id, fieldOf(empty || was?.empty === true, isColourKey(key), stop));
  };
  const visit = (node, type, rel) => {
    if (Array.isArray(node)) { for (const item of node) visit(item, type, [...rel, '*']); return; }
    if (!node || typeof node !== 'object') return;
    const typed = typeof node._type === 'string';
    const t = typed ? node._type : type;
    const r = typed ? [] : rel;
    for (const [key, value] of Object.entries(node)) {
      if (key === '_type') continue;
      if (key === '_children') {
        for (const [name, child] of Object.entries(value ?? {})) visit(child, t, [...r, name]);
      } else if (typeof value === 'string') {
        if (!t) continue;
        const field = colourDefault(key, value, r);
        if (field) add(t, [...r, key], key, field);
      } else if (value && typeof value === 'object') {
        visit(value, t, [...r, key]);
      } else if (value === null && key === 'gradient') {
        visit(GRADIENT, t, [...r, key]);
      }
    }
  };
  visit(SECTION_DEFAULTS, '', []);
  for (const [type, lists] of Object.entries(LIST_ITEMS)) {
    for (const [name, item] of Object.entries(lists)) visit(item, type, [name, '*']);
  }
  for (const type of EFFECT_TYPES) if (fields.has('Effects')) fields.set(type, fields.get('Effects'));
  return fields;
})();

// THE PANEL'S OWN COLOURS, read from the document a new panel starts as (models/panelDefaults.js)
// by the rule above: a key whose default is one of the panel's forms or a control-set reference, or
// "" under a colour's name. Today that is bgColour, bgImageTint, bgTextureTint, gridColour,
// gridSubColour and each of bgGradient's stops' `color`, which is marked `stop` and stored in the
// stop's own form, as a control's gradient's is; a key added to the template with a colour default
// is one without anything written here. The parts createPanel fills in from the user's settings are
// given as nothing, so nothing is read from them: a control set's own token colours are the set's,
// not the panel's.
//
// Keyed by the path below the panel, lower case, a list position as "*": "bggradient.stops.*.color".
// The panel document is flat, with no sections and no `_type`, so the path alone says it.
//
// `tokens` is false for every one of them: no reader of the panel's colours resolves a control-set
// reference against the panel's set. The solid background, both tints and the gradient's stops do
// not resolve one at all, and the grid's colours only through hexToRgba's fallback to the base set,
// so "{brand}" from the panel's own set would paint nothing there. A reference is refused, with the
// words it is refused in for a control's Icon.tint.
export const PANEL_COLOUR_FIELDS = (() => {
  const fields = new Map();
  const visit = (node, rel) => {
    if (Array.isArray(node)) { for (const item of node) visit(item, [...rel, '*']); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const field = colourDefault(key, value, rel);
      if (field) {
        const id = [...rel, key].join('.').toLowerCase();
        fields.set(id, fieldOf(field.empty || fields.get(id)?.empty === true, false, field.stop));
      } else if (value && typeof value === 'object') {
        visit(value, [...rel, key]);
      }
    }
  };
  visit(panelDefaults({ id: 0, panelGuid: '', gridSize: 0, snapToGrid: false, controlSet: {}, controlSets: [] }), []);
  return fields;
})();

/**
 * Is `path`, below the panel document ("bgColour", "bgGradient.stops.0.color"), one of the panel's
 * colours? `{ empty, tokens }` as colourFieldAt answers, or null. Keys are matched without regard to
 * case, as set() matches them, and a list position is "*".
 */
export function panelColourFieldAt(path) {
  const segments = String(path ?? '').split('.').filter((s) => s !== '');
  if (!segments.length) return null;
  const key = segments.map((s) => (/^\d+$/.test(s) ? '*' : s)).join('.').toLowerCase();
  return PANEL_COLOUR_FIELDS.get(key) ?? null;
}

/** An own key of `object`, matched without regard to case, as script paths are. */
function keyed(object, segment) {
  if (!object || typeof object !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(object, segment)) return object[segment];
  const lower = segment.toLowerCase();
  const key = Object.keys(object).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : object[key];
}

/**
 * The template a missing child would be made from: what set() materialises on the way down.
 * Exported for gen-colour-fields.mjs, which checks the template tree it writes for the C++ walk.
 */
export function templateChild(type, segment, atRoot) {
  if (atRoot) return keyed(SECTION_DEFAULTS, segment);
  const section = SECTION_DEFAULTS[type] ?? (EFFECT_TYPES.has(type) ? SECTION_DEFAULTS.Effects : undefined);
  const child = keyed(section?._children, segment);
  if (child !== undefined) return child;
  const made = Object.hasOwn(MADE_CHILDREN, type) ? MADE_CHILDREN[type] : undefined;
  const lower = segment.toLowerCase();
  return made && Object.hasOwn(made, lower) ? { _type: made[lower] } : undefined;
}

/**
 * Is `path` on `root` (a control, or one of its parts) a colour property? Returns
 * `{ empty, tokens }` (see panelColour) or null.
 *
 * It walks the document where the document has the node and the section templates where it does
 * not, the way set() walks, so a section a control has not materialised yet is still typed. A
 * state's patch map keys are paths relative to the control or the part, and go through here too.
 */
export function colourFieldAt(root, path) {
  const segments = String(path ?? '').split('.').filter((s) => s !== '' && s !== '_children');
  if (segments.length < 2) return null;
  let node = root;
  let type = '';
  let rel = [];
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const index = /^\d+$/.test(segment);
    let next;
    if (Array.isArray(node)) next = index ? node[Number(segment)] : undefined;
    else next = keyed(node?._children, segment) ?? keyed(node, segment);
    const template = (typeof next?._type === 'string' || rel.length) ? undefined
      : templateChild(type, segment, i === 0);
    const childType = typeof next?._type === 'string' ? next._type
      : (typeof template?._type === 'string' ? template._type : '');
    if (childType) { type = childType; rel = []; } else rel = [...rel, index ? '*' : segment];
    node = next ?? template;
  }
  const last = segments[segments.length - 1];
  const key = [...rel, /^\d+$/.test(last) ? '*' : last].join('.').toLowerCase();
  return COLOUR_FIELDS.get(type)?.get(key) ?? null;
}

/**
 * `value` as it is to be written at `path` on `root`, with every colour property the write would
 * set passed through `colour(path, value, field)`, which returns what to store there: the path
 * itself, or, when `value` is a whole section or list, each colour field inside it.
 *
 * Only what changes is copied, so a write with nothing to write out hands back the very value it
 * was given, and a script's own table is never changed under it.
 */
export function mapColourWrites(root, path, value, colour, depth = 0) {
  return mapWrites((at) => colourFieldAt(root, at), path, value, colour, depth);
}

/**
 * The same for a write to the panel document: `path` is below the panel ("bgColour", or
 * "bgGradient" written whole with its stops), and its colours are the panel's (panelColourFieldAt).
 */
export function mapPanelColourWrites(path, value, colour) {
  return mapWrites(panelColourFieldAt, path, value, colour, 0);
}

/** mapColourWrites over any table of colour fields: `fieldAt(path)` says what is at a path. */
function mapWrites(fieldAt, path, value, colour, depth) {
  const field = fieldAt(path);
  if (field) return colour(path, value, field);
  // A typed array holds numbers only, and walking one written whole would visit every byte.
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || depth > 12) return value;
  let copy = null;
  for (const [key, child] of Object.entries(value)) {
    if (key === '_type') continue;
    const stored = mapWrites(fieldAt, key === '_children' ? path : `${path}.${key}`, child, colour, depth + 1);
    if (stored === child) continue;
    copy ??= Array.isArray(value) ? [...value] : { ...value };
    copy[key] = stored;
  }
  return copy ?? value;
}
