// Instrument designs: what a control set does to the twenty controls it used to leave alone.
//
// The Macro, the Turing modulator, the Arpeggiator, the Transport, the Keyboard and their kin each
// drew one design, in one palette, under every set: a near-black slab, green and yellow voices, a
// blue accent. Their colours were already properties (Turing.barColour, Arp.headColour, ...) with
// editor fields, but no set wrote them, so on Tolex or Neon they looked exactly as on Graphite.
//
// They are screens: each draws a live display of something. So a set dresses them in its own
// display. `display.screen` is already every set's window colour (an amber-brown VFD on Tolex, a
// navy plot on Blueprint, a dark green LCD on Ivory) and `display.lit` its glowing ink. The
// instrument face is that window; the series of voices is drawn from colours the set already chose
// for its other controls (its lit ink, its range handles, its accent) and nudged until each reads
// on the face and differs from the others. A set that names its own series keeps it.
//
// Two things they drew were not properties at all, and follow the set as well. Their lanes, slots,
// scenes and tracks carry the palette's colours as data, and each one still wearing one takes the
// set's colour for that voice (controlSetFamilies.js, withSetVoices). And the chrome around a
// readout, a header plate, its edge, an idle lamp, was a run of fixed greys that is now laid
// between the set's face and lettering instead (chromeTone, below).
//
// Graphite has no instrument design: its series IS today's palette, and its instruments are what
// they always were.

import { argb, darken, lighten, mix } from './controlSetDesigns.js';

export const INSTRUMENT_TYPES = ['Macro', 'Orbit', 'Looper', 'Router', 'Timbre', 'Turing', 'Kinetic', 'Constellation', 'Constraint',
  'Keyboard', 'ChordPad', 'Arp', 'NoteRibbon', 'Phrase', 'Recorder', 'Harmoniser', 'SplitZone', 'Setlist', 'Transport', 'Panic'];

/** Today's palette, by name. Graphite's series, and every set's fallback. */
export const GRAPHITE_SERIES = ['FF39D98A', 'FFF2C94C', 'FF5B9BD5', 'FF9B8AFF', 'FFF2994A', 'FFEB5757'];
// Named, not numbered: a token reference is `{name}` with every dotted part starting with a letter
// (controlSets.js TOKEN_REFERENCE_PATTERN), and `{series.1}` would not be one: it
// would be kept as text, and drawn as text.
export const SERIES_ROLES = ['series.one', 'series.two', 'series.three', 'series.four', 'series.five', 'series.alert'];

function literal(set, name) {
  let value = set.tokens?.[name];
  for (let i = 0; i < 8 && /^\{.+\}$/.test(String(value ?? '')); i += 1) value = set.tokens?.[String(value).slice(1, -1)];
  return /^[0-9A-F]{6}([0-9A-F]{2})?$/i.test(String(value ?? '')) ? argb(String(value).slice(-6)) : null;
}
function luminance(hex) {
  const six = String(hex).slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(six.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function distance(a, b) {
  const ch = (hex, i) => parseInt(String(hex).slice(-6).slice(i, i + 2), 16);
  return Math.hypot(...[0, 2, 4].map((i) => ch(a, i) - ch(b, i)));
}
/** `colour`, lightened or darkened in steps until it reads at `ratio` on `face`. */
function readableOn(colour, face, ratio = 3) {
  const lighter = luminance(face) < 0.18;
  let c = argb(String(colour).slice(-6));
  for (let step = 1; step <= 10 && contrast(c, face) < ratio; step += 1) {
    c = argb(lighter ? lighten(String(colour).slice(-6), step * 0.08) : darken(String(colour).slice(-6), step * 0.08));
  }
  return c;
}

// Hue rotation, for the voices a set's own colours run out before: siblings of its display ink
// rather than Graphite's green, so a fifth lane on Tolex is still an amp colour.
function hsl(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(String(hex).slice(-6).slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return 'FF' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function siblings(hex) {
  const [h, sat, l] = hsl(hex);
  const s = Math.max(0.5, Math.min(sat, 0.85)), light = Math.max(0.55, Math.min(l, 0.7));
  return [35, -35, 150, 200, 90, -90].map((turn) => fromHsl((h + turn + 360) % 360, s, light));
}

/** The face every instrument wears: the set's display window, kept dark. */
export function instrumentFaceFor(set) {
  const screen = literal(set, 'display.screen');
  if (screen && luminance(screen) < 0.06) return screen;
  const panel = literal(set, 'panel.surface') ?? 'FF15151A';
  return argb(mix(panel.slice(-6), '0C0D10', 0.82));
}

/**
 * Five voices and an alert, from colours the set already chose, in order of how much they say
 * about the set: its lit display ink, its range handles, its range band, its hot accent, its fill,
 * its lettering. Each is made to read on the face; one too close to a voice already taken is
 * passed over. The sixth is always a red, for record and panic.
 */
export function seriesFor(set) {
  if (set?.id === 'graphite') return GRAPHITE_SERIES.slice();
  const face = instrumentFaceFor(set);
  const picked = [];
  const text = literal(set, 'text.primary');
  const lettering = text && luminance(text) > 0.5 ? text : null;
  const lit = literal(set, 'display.lit') ?? literal(set, 'accent') ?? GRAPHITE_SERIES[0];
  const candidates = ['display.lit', 'control.cap.start', 'control.cap.end', 'control.range', 'accent.hot', 'control.fill', 'accent']
    .map((name) => literal(set, name)).filter(Boolean)
    // Light lettering is a voice (Tolex's cream); dark lettering lightened is only a grey.
    .concat(lettering ? [lettering] : [])
    .concat(siblings(lit), GRAPHITE_SERIES.slice(0, 5));
  for (const candidate of candidates) {
    if (picked.length === 5) break;
    // A grey is not a voice: a black accent or a grey band, lightened to read, is only a grey.
    // The set's own light lettering is the one exception (Tolex's cream).
    if (candidate !== lettering && hsl(candidate)[1] < 0.2) continue;
    const c = readableOn(candidate, face);
    if (picked.every((p) => distance(p, c) >= 70)) picked.push(c);
  }
  return [...picked, readableOn('FFE5534B', face)];
}

/** The series, face and inks as tokens, for a set that does not name them. */
export function withInstrumentTokens(set) {
  if (!set?.tokens || SERIES_ROLES.every((name) => set.tokens[name] !== undefined)) return set;
  const graphite = set.id === 'graphite';
  const face = graphite ? 'FF101017' : instrumentFaceFor(set);
  const series = seriesFor(set);
  const lettering = literal(set, 'text.primary') ?? 'FFE8E8E8';
  const light = luminance(lettering) > 0.4 ? lettering : 'FFE8E8EE';
  const tokens = {
    'instrument.face': graphite ? 'FF101017' : face,
    'instrument.ink': graphite ? 'FFB9B9B9' : readableOn(argb(mix(light.slice(-6), face.slice(-6), 0.3)), face, 4.5),
    'instrument.text': graphite ? 'FFE8E8EE' : readableOn(light, face, 7),
  };
  SERIES_ROLES.forEach((name, i) => { tokens[name] = series[i]; });
  return { ...set, tokens: { ...tokens, ...set.tokens } };
}

// Graphite's instrument face and lettering: the two ends the renderers' fixed chrome greys were
// picked between.
const GRAPHITE_FACE = 'FF101017';
const GRAPHITE_TEXT = 'FFE8E8EE';
const CSS_COLOUR = /^(?:rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)|#([0-9a-f]{6}))$/i;

/**
 * The chrome an instrument draws around its readout (a header plate and its edge, an idle lamp, a
 * caption, a piano strip's keys) was a run of fixed greys, picked between Graphite's face and its
 * lettering, and drawn unchanged on every set: a navy plate on Tolex's brown. Each grey keeps its
 * place on that run, measured from the face to the lettering, and is drawn at the same place
 * between the set's own face and lettering. Its alpha stays. Under Graphite every grey is itself.
 *
 * Returns a function from a CSS colour to a CSS colour, for a renderer to wrap its literals in.
 */
export function chromeTone(face, text) {
  const hex = (value) => (/^[0-9A-F]{6}([0-9A-F]{2})?$/i.test(String(value ?? '')) ? argb(String(value).slice(-6)) : null);
  const from = hex(face), to = hex(text);
  if (!from || !to || (from === GRAPHITE_FACE && to === GRAPHITE_TEXT)) return (colour) => colour;
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(-6).slice(i, i + 2), 16));
  const mean = (c) => (c[0] + c[1] + c[2]) / 3;
  const [f0, t0, f1, t1] = [GRAPHITE_FACE, GRAPHITE_TEXT, from, to].map(rgb);
  const memo = new Map();
  return (colour) => {
    if (memo.has(colour)) return memo.get(colour);
    const m = CSS_COLOUR.exec(String(colour).trim());
    let out = colour;
    if (m) {
      const c = m[5] ? rgb(m[5]) : [m[1], m[2], m[3]].map(Number);
      const alpha = m[4] ?? '1';
      const at = (mean(c) - mean(f0)) / (mean(t0) - mean(f0));
      const [r, g, b] = f1.map((v, i) => Math.round(Math.max(0, Math.min(255, v + (t1[i] - v) * at))));
      out = `rgba(${r},${g},${b},${alpha})`;
    }
    memo.set(colour, out);
    return out;
  };
}

/** The families that dress each instrument in the set's display. */
export function instrumentFamilies(set) {
  if (!set || set.id === 'graphite') return null;
  const face = literal(set, 'instrument.face') ?? instrumentFaceFor(set);
  const s = (n) => literal(set, SERIES_ROLES[n - 1]) ?? GRAPHITE_SERIES[n - 1];
  const ink = literal(set, 'instrument.ink') ?? 'FFB9B9B9';
  const raise = (f) => argb(lighten(face.slice(-6), f));
  const veil = (colour, alpha) => argb(String(colour).slice(-6), alpha);
  const panel = (literal(set, 'panel.surface') ?? 'FF333333').slice(-6);
  // Keys: ivory faintly tinted by the panel; their sharps darkened by it.
  const white = argb(mix('F3F1EC', panel, 0.08));
  const black = argb(mix('141414', panel, 0.25));
  const held = [literal(set, 'accent'), literal(set, 'control.fill'), s(1), s(3)].filter(Boolean)
    .reduce((best, c) => (contrast(c, white) > contrast(best, white) ? c : best));
  const keys = { whiteColour: white, blackColour: black };
  const radius = Number(set.families?.Group?.component?.['Background.Corners.radius'] ?? 8);
  const shell = {
    'Background.Fill.colour': '{instrument.face}',
    'Background.Border.colour': argb(darken(face.slice(-6), 0.6)),
    'Background.Corners.radius': Math.max(2, Math.min(Number.isFinite(radius) ? radius : 8, 14)),
  };
  const own = {
    // The set's own knob, not a recoloured disc; knobColour and arcColour dress the Macro's own knob
    // for an author who switches back to it.
    Macro: { knobDesign: 'set', knobColour: raise(0.12), arcColour: '{series.one}', trackColour: raise(0.05), labelColour: '{instrument.ink}' },
    Orbit: { fieldColour: '{instrument.face}', ringColour: veil(s(3), '33'), centreColour: raise(0.18), labelColour: '{instrument.ink}' },
    Looper: { laneColour: raise(0.03), gridColour: veil(ink, '22'), playheadColour: '{series.two}', labelColour: '{instrument.ink}' },
    Router: { curveColour: '{series.one}', inputColour: '{series.two}', fieldColour: '{instrument.face}', gridColour: veil(ink, '18'), labelColour: '{instrument.ink}' },
    Timbre: { fieldColour: '{instrument.face}', puckColour: '{series.two}', labelColour: '{instrument.ink}' },
    Turing: { barColour: '{series.one}', headColour: '{series.two}', fieldColour: '{instrument.face}', labelColour: '{instrument.ink}' },
    Kinetic: { fieldColour: '{instrument.face}', ballColour: '{series.one}', wallColour: veil(s(3), '33'), labelColour: '{instrument.ink}' },
    Constellation: { fieldColour: '{instrument.face}', probeColour: '{series.two}', linkColour: veil(s(3), '33'), labelColour: '{instrument.ink}' },
    Constraint: { fieldColour: '{instrument.face}', trackColour: veil(ink, '18'), linkColour: veil(s(2), '55'), labelColour: '{instrument.ink}' },
    Keyboard: { ...keys, heldColour: held, outOfKeyColour: argb(mix(white.slice(-6), black.slice(-6), 0.45)), labelColour: argb(darken(white.slice(-6), 0.62)) },
    ChordPad: { echoColour: '{series.one}', fieldColour: '{instrument.face}', padColour: raise(0.06), inKeyColour: '{series.three}', tonicColour: '{series.two}', minorColour: '{series.four}', labelColour: '{instrument.ink}' },
    Arp: { fieldColour: '{instrument.face}', stepColour: '{series.three}', headColour: '{series.two}', restColour: raise(0.10), labelColour: '{instrument.ink}' },
    NoteRibbon: { echoColour: '{series.one}', fieldColour: '{instrument.face}', zoneColour: raise(0.06), inKeyColour: '{series.three}', rootColour: '{series.two}', touchColour: '{series.two}', labelColour: '{instrument.ink}' },
    Phrase: { faceColour: '{instrument.face}', cellColour: raise(0.08), noteColour: '{series.one}', playColour: '{series.two}', labelColour: '{instrument.ink}' },
    Recorder: { faceColour: '{instrument.face}', noteColour: '{series.three}', recordColour: '{series.alert}', playheadColour: '{series.two}', labelColour: '{instrument.ink}' },
    Harmoniser: { faceColour: '{instrument.face}', ...keys, playedColour: '{series.two}', addedColour: '{series.four}', labelColour: '{instrument.ink}' },
    SplitZone: { faceColour: '{instrument.face}', ...keys, litColour: '{series.two}', gapColour: raise(0.18), labelColour: '{instrument.ink}' },
    Setlist: { faceColour: '{instrument.face}', rowColour: raise(0.08), currentColour: '{series.three}', textColour: '{instrument.text}', labelColour: '{instrument.ink}' },
    Transport: { faceColour: '{instrument.face}', accentColour: '{series.one}', beatColour: '{series.two}', labelColour: '{instrument.ink}' },
    Panic: { faceColour: argb(mix(face.slice(-6), s(6).slice(-6), 0.2)), borderColour: '{series.alert}', labelColour: '{instrument.text}', flashColour: '{series.alert}' },
  };
  const families = {};
  for (const [type, colours] of Object.entries(own)) {
    const component = { ...shell };
    for (const [key, value] of Object.entries(colours)) component[`${type}.${key}`] = value;
    families[type] = { component };
  }
  return families;
}

/** The set with its instruments dressed. Merged under any family the set already gives them. */
export function withInstrumentDesign(set) {
  const designed = instrumentFamilies(set);
  if (!designed) return set;
  const families = { ...set.families };
  for (const [type, family] of Object.entries(designed)) {
    families[type] = { ...family, ...families[type], component: { ...family.component, ...(families[type]?.component ?? {}) } };
  }
  return { ...set, families };
}
