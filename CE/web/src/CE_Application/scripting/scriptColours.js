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
// The ce.math colour helpers read the panel's forms as well, and they exist in the exported
// plug-in's Lua, JavaScript and Python preludes too. COLOUR_FORMS, hexHint, unitProblem and
// realNumber are written out again there, word for word: scriptPreludeAgreement.test.js holds them
// to it. The rest of this file (the CSS forms, the property schema) is panel-view only.

import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { isColourKey, isTokenReference, tokenNameOf } from '../models/controlSets.js';

/* ----------------------------------------------------------------------- the panel's forms */

const PANEL_HEX = /^#?(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Does the panel read this as a colour? 6 or 8 hex digits, with or without one leading "#". */
export function isPanelColour(value) {
  return typeof value === 'string' && PANEL_HEX.test(value);
}

/** The forms the panel reads, in the words every refusal uses, here and in the preludes. */
export const COLOUR_FORMS = 'A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#"';

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

/** A CSS colour as { r, g, b, a } (0-255, 0-1), or null when CSS would not read it. */
function cssChannels(text) {
  const s = String(text).trim();
  const lower = s.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = CSS_NAMED_COLOURS[lower];
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
    const h = ((Number(m[1]) * TURN[(m[2] ?? 'deg').toLowerCase()]) % 360 + 360) % 360;
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

/** For a property refusal: what a CSS colour with space around it is in the panel's form, or ''. */
function cssHint(value) {
  if (typeof value !== 'string' || isPanelColour(value)) return '';
  const channels = cssChannels(value);
  return channels ? ` Write "${panelFormOf(channels)}".` : '';
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
 * set. <advice>`. set(), ce.panel.patch and both image tints ask here, so all four agree.
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
 */
export function panelColour(value, field = {}, resolvesToken = () => false) {
  if (isPanelColour(value)) return { colour: value };
  if (value === '' && field.empty) return { colour: value };
  const reference = typeof value === 'string' && isTokenReference(value);
  if (reference && field.tokens && resolvesToken(tokenNameOf(value))) return { colour: value };
  const long = longForm(value);
  if (long) return { colour: long };

  let why;
  if (value === undefined || value === null) why = 'no colour was given';
  else if (typeof value === 'string') why = `"${value}" is not a colour the panel can read`;
  else if (typeof value === 'number') why = `${shownNumber(value)} is not a colour the panel can read`;
  else why = 'the value given is not a colour';
  let hint = hexHint(value) || cssHint(value);
  if (reference) {
    hint = field.tokens
      ? ` The panel's control set has no colour called "${tokenNameOf(value)}".`
      : ' A control-set colour is not read in this property.';
  }
  return { why, advice: `${COLOUR_FORMS}${field.empty ? ', or "" for none' : ''}.${hint}` };
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
const EFFECT_TYPES = new Set(['SolidEffects', 'GradientEffects', 'ImageEffects', 'OverlayEffects']);

const COLOUR_FIELDS = (() => {
  const fields = new Map();
  const add = (type, path, key, empty) => {
    if (!fields.has(type)) fields.set(type, new Map());
    const id = path.join('.').toLowerCase();
    const was = fields.get(type).get(id);
    fields.get(type).set(id, { empty: empty || was?.empty === true, tokens: isColourKey(key) });
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
        if (isPanelColour(value) || isTokenReference(value)) add(t, [...r, key], key, false);
        else if (value === '' && isColourKey(key)) add(t, [...r, key], key, true);
      } else if (value && typeof value === 'object') {
        visit(value, t, [...r, key]);
      }
    }
  };
  visit(SECTION_DEFAULTS, '', []);
  for (const type of EFFECT_TYPES) if (fields.has('Effects')) fields.set(type, fields.get('Effects'));
  return fields;
})();

/** An own key of `object`, matched without regard to case, as script paths are. */
function keyed(object, segment) {
  if (!object || typeof object !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(object, segment)) return object[segment];
  const lower = segment.toLowerCase();
  const key = Object.keys(object).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : object[key];
}

/** The template a missing child would be made from: what set() materialises on the way down. */
function templateChild(type, segment, atRoot) {
  if (atRoot) return keyed(SECTION_DEFAULTS, segment);
  const section = SECTION_DEFAULTS[type] ?? (EFFECT_TYPES.has(type) ? SECTION_DEFAULTS.Effects : undefined);
  const child = keyed(section?._children, segment);
  if (child !== undefined) return child;
  const lower = segment.toLowerCase();
  if ((type === 'Background' || type === 'Border') && lower === 'effects') return { _type: 'Effects' };
  if (type === 'Fill') {
    const effect = [...EFFECT_TYPES].find((name) => name.toLowerCase() === lower);
    if (effect) return { _type: effect };
  }
  return undefined;
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
  const field = colourFieldAt(root, path);
  if (field) return colour(path, value, field);
  // A typed array holds numbers only, and walking one written whole would visit every byte.
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || depth > 12) return value;
  let copy = null;
  for (const [key, child] of Object.entries(value)) {
    if (key === '_type') continue;
    const stored = mapColourWrites(root, key === '_children' ? path : `${path}.${key}`, child, colour,
      depth + 1);
    if (stored === child) continue;
    copy ??= Array.isArray(value) ? [...value] : { ...value };
    copy[key] = stored;
  }
  return copy ?? value;
}
