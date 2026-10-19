// scriptValueKinds.js — what a value in a script means, kind by kind, for the Values sidebar
// (scriptValues.js). docs/design/script-editor-value-editors.md, "The model: a value kind".
//
// Each reader here is the runtime's own, imported, not a second opinion: a colour is read by
// scriptColours (panelColour for a property, drawColour for a drawing, storedColour for ce.math), a
// note by musicTheory, a division by timeTables, a curve by easingTables, a SysEx template by
// deviceDefinitions. What a reader refuses is said in the words the runtime says it in, where it
// has words; scriptValues.test.js calls the runtime and compares.
//
// Pure functions. Nothing here reads a store; whatever is known about the panel arrives as plain
// data in `context` (see scriptValues.readStatement).

import {
  panelColour, drawColour, storedColour, CSS_NAMED_COLOURS, COLOUR_FORMS, DRAW_COLOUR_FORMS,
  colourHint, unitProblem, realNumber, percentHint, percentTextHint,
} from './scriptColours.js';
import {
  SCALES, CHORDS, SCALE_NAMES, CHORD_NAMES, NOTE_FLAT, NOTE_SHARP, FLAT_KEY_PCS, MINOR_SCALE_NAMES,
  noteNumberOf, noteNameOf,
} from './musicTheory.js';
import { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, divisionIdOf } from './timeTables.js';
import { ANIM_CURVE_NAMES, EASING_BEZIERS, bezierOf } from './easingTables.js';
import { checksumAlgorithm, computeChecksum } from '../utils/checksums.js';
import { defineParameter, encodeParameter } from './deviceDefinitions.js';
import { ALL_EVENTS, EVENT_BY_ID } from './panelApi.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';

/* ----------------------------------------------------------------------------- did you mean */

/** Edit distance with a swap of two neighbours counted as one edit ("Pluse" is one from "Pulse"). */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** How many characters two words share at their start. */
const sharedStart = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

/**
 * The candidate closest to `word`, when it is close enough to be the one meant, else null: a word a
 * few edits away (a third of its length, three at most), or one sharing most of its start with it
 * ("rotation" for "rotate"). A word that differs only in capitals is its own correct spelling.
 */
export function closest(word, candidates) {
  const w = String(word ?? '').toLowerCase();
  if (!w) return null;
  let best = null;
  let bestD = Infinity;
  const limit = Math.min(3, Math.max(1, Math.floor(w.length / 3)));
  for (const c of candidates) {
    const lc = String(c).toLowerCase();
    const shared = sharedStart(w, lc);
    let d = distance(w, lc);
    if (d > limit && shared >= Math.max(4, Math.ceil(0.6 * Math.min(w.length, lc.length)))) d = limit;
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best === null) return null;
  if (bestD === 0) return best !== word ? best : null;
  return bestD <= limit ? best : null;
}

/** " Did you mean "x"?" or ''. */
export function didYouMean(word, candidates) {
  const near = closest(word, candidates);
  return near === null ? '' : ` Did you mean "${near}"?`;
}

const quoted = (list) => list.map((x) => `"${x}"`);
const words = (list) => (list.length < 2 ? list.join('')
  : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`);

/* -------------------------------------------------------------------------------- colours */

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** A colour's parts from the panel's own form: "#RRGGBB", "RRGGBB", "AARRGGBB" or "#AARRGGBB". */
export function panelParts(stored) {
  const hex = String(stored ?? '').replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return { rgb: hex.toUpperCase(), alpha: 1, alphaByte: 255 };
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    const a = parseInt(hex.slice(0, 2), 16);
    return { rgb: hex.slice(2).toUpperCase(), alpha: a / 255, alphaByte: a };
  }
  return null;
}

/** A CSS colour's parts, read as CSS reads it ("#" with eight digits is RRGGBBAA here). */
export function cssParts(css) {
  const s = String(css ?? '').trim();
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    const d = m[1].length <= 4 ? m[1].replace(/./g, (c) => c + c) : m[1];
    const a = d.length === 8 ? parseInt(d.slice(6, 8), 16) : 255;
    return { rgb: d.slice(0, 6).toUpperCase(), alpha: a / 255, alphaByte: a };
  }
  if (/^[0-9a-f]{8}$/i.test(s)) return panelParts(s);
  const stored = storedColour(s);
  return stored ? panelParts(stored) : null;
}

/** Parts as a CSS colour to paint a swatch with. */
export function cssOf(parts) {
  if (!parts) return null;
  if (parts.alphaByte >= 255) return `#${parts.rgb}`;
  const ch = (i) => parseInt(parts.rgb.slice(i, i + 2), 16);
  return `rgba(${ch(0)}, ${ch(2)}, ${ch(4)}, ${Number((parts.alphaByte / 255).toFixed(3))})`;
}

/** How a colour is written, which a write keeps where it can carry the new colour. */
export function colourForm(text) {
  const s = String(text ?? '');
  if (/^#[0-9a-f]{6}$/i.test(s)) return 'hash6';
  if (/^[0-9a-f]{6}$/i.test(s)) return 'bare6';
  if (/^[0-9a-f]{8}$/i.test(s)) return 'bare8';
  if (/^#[0-9a-f]{8}$/i.test(s)) return 'hash8';
  if (/^#[0-9a-f]{3}$/i.test(s)) return 'hash3';
  if (/^#[0-9a-f]{4}$/i.test(s)) return 'hash4';
  if (/^\{[^}]+\}$/.test(s.trim())) return 'token';
  if (Object.hasOwn(CSS_NAMED_COLOURS, s.toLowerCase()) || s.toLowerCase() === 'transparent') return 'name';
  if (/^rgba?\(/i.test(s)) return s.includes(',') ? 'rgb-legacy' : 'rgb-modern';
  if (/^hsla?\(/i.test(s)) return s.includes(',') ? 'hsl-legacy' : 'hsl-modern';
  return 'other';
}

/**
 * Where a colour is read, and what the runtime says when it cannot be:
 *   { reader: 'property' | 'stop' | 'drawing' | 'math', field, resolvesToken, resolve,
 *     refusal(why, advice, hint) -> the sentence, claimedBy }
 * `field` is what colourFieldAt found for a property; `resolve(name)` the colour a control-set
 * reference stands for, when the context can say.
 */
export function readColour(value, site) {
  const reader = site.reader;
  const out = { kind: 'colour', meaning: null, problem: null };
  const claimedBy = site.claimedBy ?? 'schema';
  // takesAlpha: whether an alpha can be written here. A stored gradient's stop is RRGGBB (its
  // opacity is a field of its own), and a "#RRGGBB" claimed by its form alone has no reader to say
  // which way round an alpha would be read, so neither is offered one.
  const meaning = { reader, css: null, stored: null, alpha: null, swatch: null, claimedBy,
    takesAlpha: reader !== 'stop' && claimedBy !== 'form',
    form: typeof value === 'string' ? colourForm(value) : 'other' };
  out.meaning = meaning;
  let parts = null;
  if (reader === 'drawing') {
    const read = drawColour(value);
    if ('css' in read) {
      if (read.css === null) { meaning.none = true; meaning.alpha = 0; return out; }
      meaning.stored = typeof read.css === 'string' ? read.css : null;
      parts = cssParts(meaning.stored);
    } else {
      out.problem = { severity: 'error', message: site.refusal(read.why, DRAW_COLOUR_FORMS, read.hint) };
      return out;
    }
  } else if (reader === 'math') {
    const stored = storedColour(value);
    if (!stored) {
      // panelRuntime's colourChannels, word for word.
      let why;
      if (value === undefined || value === null) why = 'no colour was given';
      else if (typeof value === 'string') why = `"${value}" is not a colour`;
      else if (typeof value === 'number' && Number.isFinite(value)) why = `${value} is not a colour`;
      else why = 'the colour given is not text';
      out.problem = { severity: 'error', message: site.refusal(why, `${COLOUR_FORMS}.`, colourHint(value)) };
      return out;
    }
    meaning.stored = stored;
    parts = panelParts(stored);
  } else {
    const field = reader === 'stop' ? { ...(site.field ?? {}), stop: true } : (site.field ?? {});
    const read = panelColour(value, field, site.resolvesToken ?? (() => false));
    if (read.why) {
      out.problem = { severity: 'error', message: site.refusal(read.why, read.advice, '') };
      return out;
    }
    meaning.stored = read.colour;
    if (read.colour === '' && field.empty) { meaning.none = true; return out; }
    if (meaning.form === 'token') {
      const resolved = site.resolve?.(value);
      meaning.token = value.trim().slice(1, -1);
      parts = resolved ? panelParts(resolved) ?? cssParts(resolved) : null;
    } else {
      parts = panelParts(read.colour);
    }
    // The eight-digit trap: "#" with eight digits is AARRGGBB to the panel and RRGGBBAA to CSS.
    if (meaning.form === 'hash8' && reader === 'property') {
      const d = value.slice(1).toUpperCase();
      out.problem = {
        severity: 'warning',
        message: `The panel reads "${value}" as AARRGGBB: the colour ${d.slice(2)} at alpha ${d.slice(0, 2)}. `
          + `A drawing would read it as ${d.slice(0, 6)} at alpha ${d.slice(6)}; for that colour here, write "${d.slice(6)}${d.slice(0, 6)}".`,
      };
    }
  }
  if (reader === 'math' && meaning.form === 'hash8') {
    const d = value.slice(1).toUpperCase();
    out.problem = {
      severity: 'warning',
      message: `ce.math reads "${value}" as AARRGGBB, as a property does: the colour ${d.slice(2)}, its alpha ${d.slice(0, 2)} set aside. `
        + `As CSS writes it, it would be ${d.slice(0, 6)}.`,
    };
  }
  if (parts) {
    meaning.alpha = parts.alpha;
    meaning.css = cssOf(parts);
    meaning.swatch = { rgb: parts.rgb, alpha: parts.alpha };
  }
  return out;
}

/** The refusal sentence of a colour site, built from the runtime's pieces. */
export const colourRefusals = {
  /** set(): `set("<path>"): <why>, so nothing was set. <advice>` */
  set: (path) => (why, advice) => `set("${path}"): ${why}, so nothing was set. ${advice}`,
  /** ce.panel.patch(): `ce.panel.patch("c", "s"): at "<key>", <why>, so nothing was patched. <advice>` */
  patch: (control, state, key) => (why, advice) => `ce.panel.patch("${control}", "${state}"): at "${key}", ${why}, so nothing was patched. ${advice}`,
  /** create/clone's props: `<call>: at "<Section.path>", <why>, so <outcome>. <advice>` */
  props: (call, outcome, path) => (why, advice) => `${call}: at "${path}", ${why}, so ${outcome}. ${advice}`,
  /** an image tint */
  tint: (call) => (why, advice) => `${call}: tint refused — ${why}. ${String(advice).replace(/\.$/, '')}.`,
  /** ce.math's readers */
  math: (path) => (why, forms, hint) => `${path}: ${why}, so there is no answer. ${forms}${hint}`,
  /** ce.draw.fill / stroke */
  draw: (path, what) => (why, forms, hint) => `${path}: ${why}, so ${what} stays as it was. ${forms}${hint}`,
  /** a stop of ce.draw.gradient */
  gradientStop: (which) => (why, forms, hint) => `ce.draw.gradient: in ${which}, ${why}, so there is no gradient. ${forms}${hint}`,
  /** where nothing runs it (the panel file, a value with no call around it) */
  plain: () => (why, advice, hint = '') => `${why[0].toUpperCase()}${why.slice(1)}. ${advice}${hint}`,
};

/* ------------------------------------------------------------------------------- gradients */

/**
 * ce.draw.gradient's stops, read as drawGradientImpl reads them: a colour, or { at, colour, opacity },
 * with unpositioned stops spread by their place among all of them. `stops` is [{ node, value,
 * literal, range }] for each written stop; `angle` the angle as written (a number), or undefined.
 */
export function readDrawGradient(stops, angle) {
  const n = stops.length;
  const out = [];
  let problem = null;
  const say = (message, severity = 'error') => { if (!problem) problem = { severity, message }; };
  stops.forEach((stop, i) => {
    const which = `stop ${i + 1} of ${n}`;
    const entry = { at: null, colour: null, css: null, alpha: null, opacity: undefined, computed: !stop.literal };
    if (stop.literal) {
      const v = stop.value;
      const object = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
      const given = object ? (object.colour ?? object.color) : v;
      entry.colourKey = object ? (object.colour !== undefined ? 'colour' : 'color') : null;
      if (given === undefined || given === null || given === '') {
        say(`ce.draw.gradient: ${which} has no colour, so there is no gradient. A stop is a colour, or { at, colour, opacity }.`);
      } else {
        const read = typeof given === 'object' ? { why: 'the colour given is not a colour', hint: '' } : drawColour(given);
        if (typeof read.css !== 'string') {
          say(`ce.draw.gradient: in ${which}, ${read.why ?? `"${given}" is not a colour`}, so there is no gradient. ${DRAW_COLOUR_FORMS}${read.hint ?? ''}`);
        } else {
          const parts = cssParts(read.css);
          entry.colour = given;
          entry.css = cssOf(parts);
          entry.alpha = parts?.alpha ?? null;
        }
      }
      if (object?.at !== undefined && object?.at !== null) {
        const p = unitProblem(`the position (at) of ${which}`, object.at);
        if (p) say(`ce.draw.gradient: ${p.why}, so there is no gradient.${p.hint}${percentTextHint(object.at)}`);
        else entry.at = realNumber(object.at);
        entry.atWritten = true;
      }
      if (object?.opacity !== undefined && object?.opacity !== null) {
        const p = unitProblem(`the opacity of ${which}`, object.opacity);
        if (p) say(`ce.draw.gradient: ${p.why}, so there is no gradient.${p.hint}${percentTextHint(object.opacity)}`);
        else entry.opacity = realNumber(object.opacity);
      }
    }
    out.push(entry);
  });
  out.forEach((st, i) => { if (st.at == null) st.at = n === 1 ? 0 : i / (n - 1); });
  if (n < 2) say('ce.draw.gradient: there are fewer than two colours, so there is no gradient.', 'warning');
  const complete = n >= 2 && out.every((s) => !s.computed && s.css !== null);
  return { meaning: { stops: out, angle: typeof angle === 'number' ? angle : null, defaultAngle: 180, stopsTakeOpacity: true, complete }, problem };
}

/** A stored gradient ({ type, angle, stops: [{ color, position }] }), as the panel's gradient editors read it. */
export function readStoredGradient(value) {
  const stops = Array.isArray(value?.stops) ? value.stops : [];
  const out = stops.map((s) => {
    const read = panelColour(s?.color, { stop: true });
    const parts = read.why ? null : panelParts(read.colour);
    return { at: Number.isFinite(Number(s?.position)) ? Number(s.position) / 100 : null, colour: s?.color ?? null,
      css: cssOf(parts), alpha: parts?.alpha ?? null };
  });
  return {
    meaning: {
      stops: out, angle: Number.isFinite(Number(value?.angle)) ? Number(value.angle) : null, defaultAngle: 90,
      type: value?.type ?? 'linear', stored: true, stopsTakeOpacity: false, complete: out.length >= 2 && out.every((s) => s.css !== null),
    },
    problem: null,
  };
}

/* ---------------------------------------------------------------------------------- curves */

const CURVE_NUMBERS = Object.entries(EASING_BEZIERS);

/** ce.anim's `curve`: a name, or four numbers. */
export function readCurve(value) {
  const meaning = { name: null, bezier: null, choices: [...ANIM_CURVE_NAMES] };
  if (typeof value === 'string') {
    if (ANIM_CURVE_NAMES.includes(value)) {
      meaning.name = value;
      meaning.bezier = EASING_BEZIERS[value] ? [...EASING_BEZIERS[value]] : null;
      return { meaning, problem: null };
    }
    return {
      meaning,
      problem: {
        severity: 'warning',
        message: `ce.anim: "${value}" is not a curve this build knows — animating linear. `
          + `Try one of: ${ANIM_CURVE_NAMES.join(', ')}, or draw one as four numbers, x1, y1, x2, y2.${didYouMean(value, ANIM_CURVE_NAMES)}`,
      },
    };
  }
  const named = value && typeof value === 'object' && !Array.isArray(value) && 'x1' in value;
  const list = named ? [value.x1, value.y1, value.x2, value.y2] : (Array.isArray(value) ? value : null);
  const bezier = list ? bezierOf(list) : null;
  if (!bezier) {
    return {
      meaning,
      problem: {
        severity: 'warning',
        message: 'ce.anim: a drawn curve is four numbers, x1, y1, x2, y2 (a list, or named), with x1 and x2 between 0 and 1 — animating linear.',
      },
    };
  }
  meaning.bezier = bezier;
  meaning.name = CURVE_NUMBERS.find(([, b]) => b.every((x, i) => Math.abs(x - bezier[i]) < 1e-9))?.[0] ?? null;
  return { meaning, problem: null };
}

/* ------------------------------------------------------------------------- music and time */

/** The pitch-class names a key spells a run of notes with, as the Chord Pad spells them. */
function spellNotes(numbers, rootPc, scale) {
  const minorish = MINOR_SCALE_NAMES.includes(scale);
  const flats = FLAT_KEY_PCS.includes(minorish ? (rootPc + 3) % 12 : rootPc);
  return numbers.map((n) => (flats ? NOTE_FLAT : NOTE_SHARP)[((n % 12) + 12) % 12]);
}

/** A note: a MIDI number, or a name ("C4"). `outcome` is what a refusal says did not happen. */
export function readNote(value, { verb, outcome, midi }) {
  const meaning = { number: null, name: null };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { meaning, problem: null };
    const n = Math.floor(value + (midi ? 0.5 : 0));
    meaning.number = n;
    meaning.name = noteNameOf(n);
    if (n === 60) meaning.hint = 'middle C';
    if (midi && (n < 0 || n > 127)) {
      return { meaning, problem: { severity: 'error', message: `${verb}: ${value} is outside the MIDI notes, so ${outcome}. MIDI notes run from 0 to 127, which is C-1 to G9.` } };
    }
    return { meaning, problem: null };
  }
  if (typeof value === 'string') {
    const n = noteNumberOf(value);
    if (n === undefined) {
      return {
        meaning,
        problem: {
          severity: 'error',
          message: `${verb}: "${value}" is not a note name, so ${outcome}. A name is a capital letter, then # or b if it `
            + 'has one, then the octave: "C4", "Eb3", "F#-1".',
        },
      };
    }
    meaning.number = n;
    meaning.name = noteNameOf(n);
    if (n === 60) meaning.hint = 'middle C';
    if (midi && (n < 0 || n > 127)) {
      return { meaning, problem: { severity: 'error', message: `${verb}: "${value}" is outside the MIDI notes, so ${outcome}. MIDI notes run from 0 to 127, which is C-1 to G9.` } };
    }
    return { meaning, problem: null };
  }
  return { meaning, problem: null };
}

/** A scale or a chord name, with its notes from `root` when the call gives a literal one. */
export function readScaleOrChord(value, kind, { verb, root, musicWords }) {
  const names = kind === 'chord' ? CHORD_NAMES : SCALE_NAMES;
  const table = kind === 'chord' ? CHORDS : SCALES;
  const meaning = { label: null, choices: [...names] };
  if (typeof value !== 'string') return { meaning, problem: null };
  if (!Object.hasOwn(table, value)) {
    const list = names.join(', ');
    const message = musicWords
      ? `${verb}: "${value}" is not a ${kind}, so there is no answer. The ${kind}s are ${list}.`
      : `"${value}" is not a ${kind}. The ${kind}s are ${list}.`;
    return { meaning, problem: { severity: 'error', message: `${message}${didYouMean(value, names)}` } };
  }
  meaning.label = value;
  if (Number.isFinite(root)) {
    const numbers = table[value].map((x) => root + x);
    meaning.numbers = numbers;
    meaning.notes = spellNotes(numbers, ((root % 12) + 12) % 12, kind === 'chord' ? 'major' : value);
  }
  return { meaning, problem: null };
}

/** A note division, in any case. */
export function readDivision(value, { verb, words: wordsOf = 'division' }) {
  const meaning = { id: null, label: null, beats: null, choices: [...DIVISION_NAMES] };
  if (typeof value !== 'string') return { meaning, problem: null };
  const id = divisionIdOf(value);
  if (id === undefined) {
    const message = wordsOf === 'beats'
      ? `${verb}: "${value}" is neither a number of beats nor a division, so ${verbOutcome(verb)}. The divisions are ${DIVISION_NAMES.join(', ')}.`
      : `${verb}: "${value}" is not a division, so there is no answer. The divisions are ${DIVISION_NAMES.join(', ')}.`;
    // No "did you mean": the names are a digit apart, so the nearest is as likely wrong as right.
    return { meaning, problem: { severity: 'error', message } };
  }
  meaning.id = id;
  meaning.label = DIVISION_LABELS[id];
  meaning.beats = DIVISIONS[id];
  return { meaning, problem: null };
}

const verbOutcome = (verb) => (/syncTimer/.test(verb) ? 'no timer was started' : 'nothing was scheduled');

/* ---------------------------------------------------------------------------------- numbers */

/** A unit's range when it says one ("0 to 1", "1 to 16"), else what the unit itself implies. */
export function rangeOfUnit(unit) {
  const m = /^(-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)$/.exec(String(unit ?? ''));
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  if (unit === 'milliseconds' || unit === 'beats') return { min: 0, max: null };
  return { min: null, max: null };
}

/** "half a beat", "1 beat", "2 beats", "0.33 beats". */
export function beatsText(beats) {
  const close = (x) => Math.abs(beats - x) < 1e-9;
  if (close(1)) return '1 beat';
  if (close(0.5)) return 'half a beat';
  if (close(0.25)) return 'a quarter of a beat';
  if (close(0.75)) return 'three quarters of a beat';
  if (close(Math.round(beats))) return `${Math.round(beats)} beats`;
  return `${Number(beats.toFixed(2))} beats`;
}

/**
 * A number with a unit or a range. `param` is the contract's descriptor; `tempo` the BPM the
 * milliseconds are counted in. The two opacity scales (record example 12) warn in the words the
 * runtime warns in, given `site.scaleWarning`.
 */
export function readNumber(value, param, { tempo = 120, site = {} } = {}) {
  const unit = param.unit ?? null;
  const range = rangeOfUnit(unit);
  const min = Number.isFinite(param.min) ? param.min : range.min;
  const max = Number.isFinite(param.max) ? param.max : range.max;
  const meaning = { unit, min, max, hint: param.hint ?? null,
    integer: /^\d+ to (?:16|127|255|16383)$/.test(String(unit ?? '')) || param.integer === true };
  const n = typeof value === 'number' ? value : realNumber(value);
  if (n === undefined || !Number.isFinite(n)) return { meaning, problem: null };
  if (unit === 'milliseconds') meaning.hint = `${n} ms is ${beatsText((n * tempo) / 60000)} at ${tempo} BPM`;
  if (unit === 'beats') meaning.hint = `${beatsText(n)}, ${Number(((n * 60000) / tempo).toFixed(1))} ms at ${tempo} BPM`;
  if (site.scaleWarning) {
    const w = site.scaleWarning(n);
    if (w) return { meaning, problem: { severity: 'warning', message: w } };
  }
  if (site.midi && MIDI_ARGS[site.midi]) {
    // panelRuntime's midiArg: an address outside its range is refused, a value past its end is sent
    // as the end, with a warning (the console says that once per command; a row says it always).
    const [noun, aNoun, lo, hi, address, hint] = MIDI_ARGS[site.midi];
    const r = Math.floor(n + 0.5);
    if (address && (r < lo || r > hi)) {
      return { meaning, problem: { severity: 'error', message: `${site.path}: ${shownValue(value)} is not ${aNoun}, so nothing was sent. ${hint}` } };
    }
    if (r < lo || r > hi) {
      return { meaning, problem: { severity: 'warning', message: `${site.path}: the ${noun} ${shownValue(value)} is outside ${lo} to ${hi}, so ${r < lo ? lo : hi} was sent.` } };
    }
    return { meaning, problem: null };
  }
  if ((min !== null && n < min) || (max !== null && n > max)) {
    if (unit === '0 to 1' && site.unitWhat) {
      const p = unitProblem(site.unitWhat, value);
      return { meaning, problem: { severity: 'error', message: `${site.path}: ${p.why}, so ${site.unitOutcome ?? 'there is no answer'}.${p.hint}` } };
    }
    if (site.clamps) {
      const to = n < min ? min : max;
      return { meaning, problem: { severity: 'warning', message: `${site.path}: the ${param.name} ${n} is outside ${min} to ${max}, so ${to} is sent.` } };
    }
    const span = max === null ? `at least ${min}` : min === null ? `at most ${max}` : `from ${min} to ${max}`;
    return { meaning, problem: { severity: 'error', message: `${site.path ?? ''}${site.path ? ': ' : ''}the ${param.name} is ${span}, and ${n} is not.` } };
  }
  return { meaning, problem: null };
}

/** What each MIDI argument is, as panelRuntime's MIDI_ARGS says it: [noun, a noun, lo, hi, is an
 *  address (refused outside its range, where a value is sent as its end), the sentence that says
 *  what one is]. scriptValues.test.js holds the words to the runtime's. */
export const MIDI_ARGS = {
  channel: ['channel', 'a channel', 1, 16, true, 'A channel is a whole number from 1 to 16.'],
  controller: ['controller number', 'a controller number', 0, 127, true, 'A controller number is a whole number from 0 to 127.'],
  program: ['program', 'a program', 0, 127, true, 'A program is a whole number from 0 to 127.'],
  bank: ['bank number', 'a bank number', 0, 127, true, 'A bank number is a whole number from 0 to 127.'],
  msb: ['MSB', 'an MSB', 0, 127, true, 'An MSB is a whole number from 0 to 127.'],
  lsb: ['LSB', 'an LSB', 0, 127, true, 'An LSB is a whole number from 0 to 127.'],
  value: ['value', 'a value', 0, 127, false, 'A value is a number from 0 to 127.'],
  velocity: ['velocity', 'a velocity', 0, 127, false, 'A velocity is a number from 0 to 127.'],
  pressure: ['pressure', 'a pressure', 0, 127, false, 'A pressure is a number from 0 to 127.'],
  value14: ['value', 'a value', 0, 16383, false, 'A value is a number from 0 to 16383.'],
  bend: ['bend', 'a bend', 0, 16383, false, 'A bend is a number from 0 to 16383, and 8192 is the centre.'],
};

/** Which MIDI argument a ce.midi param is, by the member and the param's name. */
export function midiArgOf(memberId, name) {
  if (name === 'channel') return 'channel';
  if (name === 'cc') return 'controller';
  if (name === 'program') return 'program';
  if (name === 'bankMsb' || name === 'bankLsb') return 'bank';
  if (name === 'msb' || name === 'lsb') return name;
  if (name === 'velocity') return 'velocity';
  if (name === 'pressure') return 'pressure';
  if (name === 'value') {
    if (memberId === 'sendPitchBend') return 'bend';
    if (memberId === 'sendNRPN' || memberId === 'sendRPN') return 'value14';
    return 'value';
  }
  return null;
}

/** The two image opacity scales, in the runtime's words (imageLayers.planImage, panelRuntime's imageIcon). */
export const OPACITY_SCALE_WARNINGS = {
  imageSet: (target) => (n) => (n > 0 && n <= 1
    ? `ce.image.set("${target}"): opacity runs from 0 to 100 here, so ${n} is almost invisible. `
      + `If you meant ${n} out of 1, write ${Number((n * 100).toFixed(4))}.`
    : null),
  imageIcon: (target) => (n) => (n > 1
    ? `ce.image.icon("${target}"): opacity runs from 0 to 1 here, so ${n} is fully solid.${percentHint(n)}`
    : null),
};

/* --------------------------------------------------------------------- lists of names */

/** A value from a closed list. `refusal(value, list)` gives the runtime's own sentence where it has one. */
export function readEnum(value, values, { path, name, refusal } = {}) {
  const meaning = { choices: values.map(String) };
  if (value === undefined || value === null) return { meaning, problem: null };
  if (values.some((v) => v === value)) return { meaning, problem: null };
  const exactish = typeof value === 'string' ? values.find((v) => typeof v === 'string' && v.toLowerCase() === value.toLowerCase()) : undefined;
  if (exactish !== undefined) {
    return { meaning, problem: { severity: 'warning', message: `${path ? `${path}: ` : ''}"${value}" is written "${exactish}" in the list of ${name}'s values; a call that reads only that spelling refuses it.` } };
  }
  const message = refusal
    ? refusal(value, values)
    : `${path ? `${path}: ` : ''}${typeof value === 'string' ? `"${value}"` : String(value)} is not one of the values ${name} takes. They are ${words(quoted(values))}.`;
  return { meaning, problem: { severity: 'error', message: `${message}${typeof value === 'string' ? didYouMean(value, values.map(String)) : ''}` } };
}

/** The runtime's own sentences for a value not in a list, where a member has one. */
export const ENUM_REFUSALS = {
  drawBlend: (value, list) => `ce.draw.blend("${value}"): not a blend mode. One of: ${list.join(', ')}.`,
};

/** An event's name: an id ("valueChanged") or a handler name ("onValueChanged"). */
export function readEvent(value, { anyTarget }) {
  const handlers = ALL_EVENTS.map((e) => e.fn);
  const meaning = { name: value, handler: null, id: null, found: false, choices: handlers };
  if (typeof value !== 'string') return { meaning, problem: null };
  const event = EVENT_BY_ID[value] ?? ALL_EVENTS.find((e) => e.fn === value);
  if (event) {
    Object.assign(meaning, { handler: event.fn, id: event.id, found: true, summary: event.summary });
    return { meaning, problem: null };
  }
  if (anyTarget) { meaning.custom = true; return { meaning, problem: null }; }
  return { meaning, problem: { severity: 'warning', message: `"${value}" is not an event the panel raises, so nothing will call this.${didYouMean(value, handlers)}` } };
}

/* -------------------------------------------------------------------- controls and paths */

/** Every control of a panel, depth first, containers' children included. */
export function panelControls(panel) {
  const out = [];
  const visit = (list) => {
    for (const control of list ?? []) {
      if (!control?._children?.Core) continue;
      out.push(control);
      const kids = control._children?.Children?._children;
      if (kids && typeof kids === 'object') visit(Object.values(kids));
    }
  };
  visit(panel?.controls);
  return out;
}

/** The control a script names, as the runtime finds it: by name, else id, in any case. */
export function controlNamed(controls, name) {
  const want = String(name ?? '').toLowerCase();
  return controls.find((c) => String(c._children.Core.name ?? '').toLowerCase() === want)
    ?? controls.find((c) => String(c._children.Core.id ?? '').toLowerCase() === want) ?? null;
}

/** A control's name in a script, `found` against the panel when there is one. */
export function readControl(value, { panel, controls }) {
  const meaning = { name: value, type: null, found: null };
  if (typeof value !== 'string') return { meaning, problem: null };
  if (value === '*') { meaning.any = true; return { meaning, problem: null }; }
  if (value.toLowerCase() === 'panel') { Object.assign(meaning, { type: 'panel', found: true, panel: true }); return { meaning, problem: null }; }
  if (!panel) return { meaning, problem: null };
  const names = controls.map((c) => c._children.Core.name).filter(Boolean);
  meaning.choices = names;
  const control = controlNamed(controls, value);
  if (control) {
    meaning.found = true;
    meaning.type = control._children.Core.controlType ?? null;
    meaning.id = control._children.Core.id ?? null;
    return { meaning, problem: null };
  }
  meaning.found = false;
  return { meaning, problem: { severity: 'warning', message: `No control named "${value}" on this panel.${didYouMean(value, names)}` } };
}

const SHORTHANDS = {
  visible: 'Core.visible', enabled: 'Core.enabled', locked: 'Core.locked', name: 'Core.name', zindex: 'Core.zIndex',
  x: 'Transform.x', y: 'Transform.y', width: 'Transform.width', height: 'Transform.height',
  opacity: 'Transform.opacity', rotation: 'Transform.rotation', scale: 'Transform.scale',
  value: 'Value.value',
};
const ACCESSORS = ['value', 'normalizedValue', 'midiValue'];

/** Walk `segments` from `node` in any case, through `_children` as set() walks: the value, or undefined. */
function walk(node, segments) {
  let at = node;
  for (const seg of segments) {
    if (at === undefined || at === null) return undefined;
    const low = String(seg).toLowerCase();
    let key;
    if (at._children && typeof at._children === 'object') key = Object.keys(at._children).find((k) => k.toLowerCase() === low);
    if (key !== undefined) { at = at._children[key]; continue; }
    if (typeof at === 'object') key = Object.keys(at).filter((k) => k !== '_children' && k !== '_type').find((k) => k.toLowerCase() === low);
    if (key === undefined) return undefined;
    at = at[key];
  }
  return at;
}

/** A control's value, where its value lives: Value.value, or its main value channel's. */
function controlValue(control) {
  const v = control?._children?.Value?.value;
  if (v !== undefined) return v;
  const channels = control?._children?.ValueChannels?._children;
  const main = channels && (channels.value ?? channels.mainValue);
  return main?.currentValue ?? main?.defaultValue;
}

/**
 * A property path ("Cutoff.Background.Fill.colour", "panel.bgColour"), resolved on the panel the way
 * set() and get() resolve one. `self` is the control a self.set path is relative to.
 */
export function readPath(value, { panel, controls, self }) {
  const meaning = { control: null, type: null, segments: [], value: undefined, found: null };
  if (typeof value !== 'string') return { meaning, problem: null };
  let parts = value.split('.').filter((s) => s !== '');
  let accessor = null;
  if (parts.length > 1 && ACCESSORS.includes(parts[parts.length - 1]) && parts[parts.length - 1] !== 'value') {
    accessor = parts[parts.length - 1];
    parts = parts.slice(0, -1);
  }
  let name;
  let segments;
  if (self) { name = self._children?.Core?.name ?? null; segments = parts; } else { [name, ...segments] = parts; }
  Object.assign(meaning, { control: name ?? null, segments, form: accessor ?? 'value' });
  if (!panel && !self) return { meaning, problem: null };
  if (name && String(name).toLowerCase() === 'panel' && !self) {
    meaning.type = 'panel';
    const v = walk(panel, segments);
    meaning.found = segments.length === 0 || v !== undefined;
    if (meaning.found && (typeof v !== 'object' || v === null)) meaning.value = v;
    return { meaning, problem: meaning.found ? null : { severity: 'warning', message: `The panel has no setting "${segments.join('.')}".` } };
  }
  const control = self ?? controlNamed(controls, name);
  if (!control) {
    meaning.found = false;
    const names = controls.map((c) => c._children.Core.name).filter(Boolean);
    return { meaning, problem: { severity: 'warning', message: `No control named "${name}" on this panel.${didYouMean(name, names)}` } };
  }
  meaning.type = control._children.Core.controlType ?? null;
  if (!segments.length || (segments.length === 1 && segments[0].toLowerCase() === 'value')) {
    meaning.found = true;
    meaning.value = controlValue(control);
    meaning.endsInValue = true;
    return { meaning, problem: null };
  }
  let v;
  const first = segments[0].toLowerCase();
  if (segments.length === 1 && SHORTHANDS[first]) v = walk(control, SHORTHANDS[first].split('.'));
  else if (Object.keys(control._children ?? {}).some((k) => k.toLowerCase() === first)) v = walk(control, segments);
  else {
    for (const section of Object.keys(control._children ?? {})) {
      v = walk(control._children[section], segments);
      if (v !== undefined) break;
    }
  }
  // A section the control has not made yet is still a path, when the templates have it.
  const known = v !== undefined || walk(SECTION_DEFAULTS, segments) !== undefined
    || walk({ _children: SECTION_DEFAULTS }, segments) !== undefined;
  meaning.found = known;
  if (v !== undefined && (typeof v !== 'object' || v === null)) meaning.value = v;
  if (known) return { meaning, problem: null };
  // Which segment leads nowhere, and what it might have been.
  let at = control;
  let bad = segments[0];
  let candidates = [];
  for (const seg of segments) {
    const next = walk(at, [seg]);
    if (next === undefined) {
      bad = seg;
      candidates = at && typeof at === 'object' ? [...Object.keys(at._children ?? {}), ...Object.keys(at).filter((k) => k !== '_children' && k !== '_type')] : [];
      // At the top, any section a control can be given, made or not.
      if (at === control) candidates.push(...Object.keys(SECTION_DEFAULTS));
      break;
    }
    at = next;
  }
  return {
    meaning,
    problem: { severity: 'warning', message: `"${segments.join('.')}" leads nowhere on ${name} (${meaning.type}): it has no "${bad}".${didYouMean(bad, candidates)}` },
  };
}

/** A control's keyframe animation, checked as ce.anim.play checks it. */
export function readAnimation(value, { panel, controls, controlName }) {
  const meaning = { name: value, control: controlName ?? null, found: null };
  if (typeof value !== 'string' || !panel || typeof controlName !== 'string') return { meaning, problem: null };
  const control = controlNamed(controls, controlName);
  if (!control) return { meaning, problem: null };
  const all = control._children?.Animations?._children ?? {};
  const playable = Object.entries(all).filter(([, a]) => String(a?.kind ?? '') === 'keyframes').map(([k]) => k);
  meaning.choices = playable;
  const key = Object.keys(all).find((k) => k.toLowerCase() === value.toLowerCase());
  const node = key === undefined ? null : all[key];
  if (node && String(node.kind ?? '') === 'keyframes') { meaning.found = true; return { meaning, problem: null }; }
  meaning.found = false;
  const why = node ? `"${key}" is a transition, which plays when its trigger does` : `"${controlName}" has no animation called "${value}"`;
  return {
    meaning,
    problem: {
      severity: 'error',
      message: `ce.anim.play: ${why}. ${playable.length ? `Its keyframe animations: ${playable.join(', ')}.` : 'It has no keyframe animations — make one in the Animation tab.'}${node ? '' : didYouMean(value, playable)}`,
    },
  };
}

/* ------------------------------------------------------------------------ fonts and images */

const familyName = (f) => (typeof f === 'string' ? f : f?.family ?? f?.name ?? '');

/** A font family, `found` when the context lists the fonts there are. */
export function readFont(value, { fonts, path }) {
  const meaning = { family: value, found: null };
  if (typeof value !== 'string' || !Array.isArray(fonts)) return { meaning, problem: null };
  const names = fonts.map(familyName).filter(Boolean);
  meaning.choices = names;
  meaning.found = names.some((n) => n.toLowerCase() === value.toLowerCase());
  if (meaning.found) return { meaning, problem: null };
  const refuses = path === 'ce.text.style';
  return {
    meaning,
    problem: { severity: 'warning', message: `"${value}" is not an available font.${refuses ? ' ce.text.style will refuse it.' : ' It is drawn in the fallback face.'}${didYouMean(value, names)}` },
  };
}

const imageName = (i) => (typeof i === 'string' ? i : i?.name ?? '');
const imageId = (i) => (typeof i === 'string' ? i : i?.id ?? '');

/** An image: a library or panel image's id or name, or the image data itself. */
export function readImage(value, { images, wantsData, path }) {
  const meaning = { name: value, dataUrl: typeof value === 'string' && /^data:/i.test(value), found: null };
  if (typeof value !== 'string') return { meaning, problem: null };
  const list = Array.isArray(images) ? images : null;
  const has = list && list.some((i) => imageId(i) === value || imageName(i).toLowerCase() === value.toLowerCase());
  if (list) { meaning.found = meaning.dataUrl || Boolean(has); meaning.choices = list.map(imageName).filter(Boolean); }
  if (wantsData && !meaning.dataUrl) {
    const shown = value.length > 60 ? `${value.slice(0, 57)}…` : value;
    return {
      meaning,
      problem: {
        severity: 'error',
        message: has
          ? `ce.draw.image: "${shown}" is an icon's name, not its image, so nothing was drawn. Pass ce.image.asset("${shown}").dataUrl.`
          : `ce.draw.image: "${shown}" is not image data, so nothing was drawn. Pass a data URL, or ce.image.asset(name).dataUrl for a library icon.`,
      },
    };
  }
  if (list && !meaning.found && !meaning.dataUrl) {
    return { meaning, problem: { severity: 'warning', message: `No image called "${value}" in the library or the panel.${didYouMean(value, meaning.choices)}` } };
  }
  return { meaning, problem: null };
}

/* ---------------------------------------------------------------------------------- bytes */

const HEX_BYTE = /^(0x)?[0-9a-f]{1,2}$/i;
const hexTokens = (text) => text.split(/[ \t\r\n\f\v,]+/).filter(Boolean);
const shownValue = (v) => (v === undefined || v === null ? 'nothing' : typeof v === 'string' ? `"${v}"`
  : typeof v === 'number' || typeof v === 'boolean' ? String(v) : 'a list');

/** Bytes as a send reads them (panelRuntime's scriptBytes): hex text or a list. `verb` names the call. */
export function readBytes(value, { verb, outcome = 'nothing was sent', sysex = false } = {}) {
  const meaning = { count: null, hex: null };
  let bytes = null;
  if (typeof value === 'string') {
    const bad = hexTokens(value).find((t) => !HEX_BYTE.test(t));
    if (bad !== undefined) {
      const spaced = /^[0-9a-f]+$/i.test(bad) && bad.length % 2 === 0 ? bad.match(/../g).join(' ') : '';
      return {
        meaning,
        problem: {
          severity: 'error',
          message: `${verb}: "${bad}" is not one byte, so ${outcome}. `
            + (spaced ? `Put a space between the bytes: "${spaced}".` : 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".'),
        },
      };
    }
    bytes = hexTokens(value).map((t) => parseInt(t.replace(/^0x/i, ''), 16));
  } else if (Array.isArray(value)) {
    bytes = [];
    for (let i = 0; i < value.length; i += 1) {
      const v = value[i];
      const b = typeof v === 'number' ? (Number.isInteger(v) && v >= 0 && v <= 255 ? v : undefined)
        : typeof v === 'string' && HEX_BYTE.test(v) ? parseInt(v.replace(/^0x/i, ''), 16) : undefined;
      if (b === undefined) {
        return {
          meaning,
          problem: {
            severity: 'error',
            message: `${verb}: ${shownValue(v)} at position ${i} is not a byte, so ${outcome}. A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".`,
          },
        };
      }
      bytes.push(b);
    }
  } else {
    return { meaning, problem: null };
  }
  meaning.bytes = bytes;
  meaning.count = bytes.length;
  meaning.hex = bytes.map((b) => hex2(b)).join(' ');
  if (sysex && bytes.length) {
    const sent = [...(bytes[0] === 0xf0 ? [] : [0xf0]), ...bytes, ...(bytes[bytes.length - 1] === 0xf7 ? [] : [0xf7])];
    meaning.sent = sent.map((b) => hex2(b)).join(' ');
    meaning.sentCount = sent.length;
  }
  if (!bytes.length) return { meaning, problem: { severity: 'error', message: `${verb}: no bytes given` } };
  return { meaning, problem: null };
}

/** ce.midi.checksum's answer for literal bytes and a literal type, when it is one. */
export function checksumOf(type, bytes) {
  const algorithm = typeof type === 'string' ? checksumAlgorithm(type) : null;
  if (!algorithm || !Array.isArray(bytes)) return null;
  const value = computeChecksum(type, bytes);
  return Number.isFinite(value) ? { type: algorithm.id, value, hex: value.toString(16).toUpperCase().padStart(2, '0') } : null;
}

// A role of its own, so a template read here never touches what a running script defined.
const TEMPLATE_ROLE = '\u0000values-sidebar';

/**
 * A SysEx template in ce.device.defineParameter's spec, read by the same encoder the runtime sends
 * with (deviceDefinitions.encodeParameter): the message at the bottom, middle and top of the range,
 * and the definition's own refusal or warning (the Roland checksum one, record example 15).
 */
export function readSysexTemplate(spec, id) {
  const meaning = { count: Array.isArray(spec?.sysex) ? spec.sysex.length : (typeof spec?.sysex === 'string' ? hexTokens(spec.sysex).length : null),
    hex: null, template: true, messages: [], checksum: typeof spec?.checksum === 'string' ? spec.checksum : (spec?.sysex ? 'roland' : null) };
  if (!spec || typeof spec !== 'object') return { meaning, problem: null };
  const key = typeof id === 'string' && id ? id : 'parameter';
  const defined = defineParameter(TEMPLATE_ROLE, key, spec);
  if (!defined.ok) return { meaning, problem: { severity: 'error', message: defined.error } };
  const min = Number.isFinite(defined.parameter?.min) ? defined.parameter.min : 0;
  const max = Number.isFinite(defined.parameter?.max) ? defined.parameter.max : 127;
  const mid = Math.round((min + max) / 2);
  for (const at of [...new Set([min, mid, max])]) {
    const sent = encodeParameter(TEMPLATE_ROLE, key, at);
    if (sent.ok) meaning.messages.push({ value: at, hex: sent.bytes.map((b) => hex2(b)).join(' ') });
  }
  const list = Array.isArray(spec.sysex) ? spec.sysex : hexTokens(String(spec.sysex ?? ''));
  meaning.hex = list.map((t) => (typeof t === 'number' ? hex2(t) : String(t))).join(' ');
  return { meaning, problem: defined.warning ? { severity: 'warning', message: defined.warning } : null };
}

/* ------------------------------------------------------------------------------- sections */

/** The section names a control can carry: what create's and clone's `<section>` takes. */
export const SECTION_NAMES = new Set(Object.keys(SECTION_DEFAULTS));
