// scriptValueKinds.js — what a value in a script means, kind by kind, for the Values sidebar
// (scriptValues.js). docs/design/script-editor-value-editors.md, "The model: a value kind".
//
// Each reader here is the runtime's own, imported, not a second opinion: a colour is read by
// scriptColours (panelColour for a property, drawColour for a drawing, storedColour for ce.math), a
// note by musicTheory, a division by timeTables, a curve by easingTables, an envelope's points by
// animEnvelope, a SysEx template by deviceDefinitions, a stroke's dash by drawDash. What a reader
// refuses is said in the words the runtime says it in, where it has words; scriptValues.test.js
// calls the runtime and compares.
//
// Pure functions. Nothing here reads a store; whatever is known about the panel arrives as plain
// data in `context` (see scriptValues.readStatement).

import {
  panelColour, drawColour, storedColour, CSS_NAMED_COLOURS, COLOUR_FORMS, DRAW_COLOUR_FORMS,
  colourHint, unitProblem, realNumber, percentHint, percentTextHint, orderedColour, ORDERED_FORMS,
} from './scriptColours.js';
import {
  SCALES, CHORDS, SCALE_NAMES, CHORD_NAMES, NOTE_FLAT, NOTE_SHARP, FLAT_KEY_PCS, MINOR_SCALE_NAMES,
  noteNumberOf, noteNameOf,
} from './musicTheory.js';
import { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, divisionIdOf } from './timeTables.js';
import { ANIM_CURVE_NAMES, EASING_BEZIERS, bezierOf } from './easingTables.js';
import { listWord } from '../utils/wordLists.js';
import { envelopePointParts, envelopeRefusal } from './animEnvelope.js';
import { checksumAlgorithm, checksumNames, computeChecksum } from '../utils/checksums.js';
import { defineParameter, encodeParameter } from './deviceDefinitions.js';
import { ALL_EVENTS, EVENT_BY_ID } from './panelApi.js';
import { dashPattern, strokeEnd, STROKE_ENDS } from './drawDash.js';
import { timeNumber } from './timeWords.js';
import { LAYOUT_WORDS, layoutWord } from './layoutWords.js';
import { noteList, voiceLeadMode, arpOrderPattern, octaveCount } from './noteLists.js';
import {
  DRAW_SHAPES, drawNumber, shapeOutline, outsideWords, pointList, pointRadius, curveTension, pixelScale, pixelGapWords, clipWords,
} from './drawShapes.js';
import {
  COMPONENT_VERBS, componentIndexRange, componentRefusalLine, componentRefusalReason, componentClampWarning, familyVerbNamed, indexRefusal, itemCurrent, listNoun,
  familyVerbNames, familyVerbRefusal, verbNameArgs, readIndexRefusal, LIST_KINDS,
} from './componentVerbs.js';
import {
  HAND_WRITTEN, READ_FIELDS, handWrittenRefusal, handWrittenWords, phraseGrid, sectionFieldRefusal, sectionFields, sectionRefusalLine,
} from './handWrittenVerbs.js';
import { MAX_SLOTS } from '../utils/noteRecorderLayout.js';
import { scriptZoneIndex } from '../utils/splitZoneLayout.js';
import { setlistScenes } from '../utils/setlistLayout.js';
import { SCALES as CHORD_PAD_SCALES } from '../utils/chordPadLayout.js';
import { elementSites } from '../utils/pixelElements.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { closest } from './closestWord.js';
import {
  deviceWriteUnknownWords, deviceWriteNoProfileWords, deviceBindUnknownWords, deviceSetNoProfileWords, dumpKindUnknownWords,
} from './deviceWords.js';
import { countRolesInControls } from '../utils/deviceRoles.js';
import { lcdLine, lcdLineWords } from './lcdLines.js';
import { lcdPosition, lcdPositionWords, lcdReadAt, lcdRows, lcdWriteAt, lcdClearAt, isPositionTable, lcdLayoutIndex, lcdLayoutCount } from './lcdPositions.js';
import { findFont, findAxis, axisWords, axisClampWords, axisRefusalWords } from './textStyle.js';

/* ----------------------------------------------------------------------------- did you mean */

// The reader is closestWord.js's, so the editor's checks can use it without this module.
export { closest };

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
 *   { reader: 'property' | 'stop' | 'drawing' | 'math' | 'argb' | 'rgba', field, resolvesToken, resolve,
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
  } else if (reader === 'argb' || reader === 'rgba') {
    // ce.math.fromARGB and fromRGBA: the alpha where the call says it is.
    const stored = orderedColour(value, reader);
    if (!stored) {
      // panelRuntime's colourFromOrder, word for word.
      let why;
      if (value === undefined || value === null) why = 'no colour was given';
      else if (typeof value === 'string') why = `"${value}" is not a colour written ${reader === 'argb' ? 'AARRGGBB' : 'RRGGBBAA'}`;
      else if (typeof value === 'number' && Number.isFinite(value)) why = `${value} is a number, not text`;
      else why = 'the colour given is not text';
      out.problem = { severity: 'error', message: site.refusal(why, ORDERED_FORMS[reader], '') };
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
          + `A drawing would read it as ${d.slice(0, 6)} at alpha ${d.slice(6)}; for that colour here, write "${d.slice(6)}${d.slice(0, 6)}". `
          + 'ce.math.fromARGB() and ce.math.fromRGBA() say which order is meant.',
      };
    }
  }
  if (reader === 'math' && meaning.form === 'hash8') {
    const d = value.slice(1).toUpperCase();
    out.problem = {
      severity: 'warning',
      message: `ce.math reads "${value}" as AARRGGBB, as a property does: the colour ${d.slice(2)}, its alpha ${d.slice(0, 2)} set aside. `
        + `As CSS writes it, it would be ${d.slice(0, 6)}. ce.math.fromARGB() and ce.math.fromRGBA() say which order is meant.`,
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
  // Rejected in the runtime's words: it was a warning here and silence there.
  if (n < 2) say(`ce.draw.gradient: stops has ${n === 0 ? 'no colours' : 'one colour'}, and a gradient needs at least two, so there is no gradient.`);
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

/** ce.anim.to's `curve`: a name, or four numbers. A problem is said in the runtime's words
 *  (startAnimationImpl), which says it once per command; here it is on the row. */
export function readCurve(value) {
  const meaning = { name: null, bezier: null, choices: [...ANIM_CURVE_NAMES] };
  if (value !== undefined && value !== null && typeof value !== 'string' && typeof value !== 'object') {
    return {
      meaning,
      problem: {
        severity: 'warning',
        message: `ce.anim.to: ${String(value)} is not a curve: a name, or four numbers, x1, y1, x2, y2 — animating linear.`,
      },
    };
  }
  if (typeof value === 'string') {
    const name = listWord(ANIM_CURVE_NAMES, value);   // in any case, as the runtime reads it
    if (name) {
      meaning.name = name;
      meaning.bezier = EASING_BEZIERS[name] ? [...EASING_BEZIERS[name]] : null;
      return { meaning, problem: null };
    }
    return {
      meaning,
      problem: {
        severity: 'warning',
        message: `ce.anim.to: "${value}" is not a curve this build knows — animating linear. `
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
        message: 'ce.anim.to: a drawn curve is four numbers, x1, y1, x2, y2 (a list, or named), with x1 and x2 between 0 and 1 — animating linear.',
      },
    };
  }
  meaning.bezier = bezier;
  meaning.name = CURVE_NUMBERS.find(([, b]) => b.every((x, i) => Math.abs(x - bezier[i]) < 1e-9))?.[0] ?? null;
  return { meaning, problem: null };
}

/* ------------------------------------------------------------------------------- envelopes */

/**
 * ce.anim.envelope's points, read by the runtime's own reader (animEnvelope.js): each point's x and
 * y in the order they are written, null where one cannot be read, and what the runtime refuses, in
 * its words. `complete` when the runtime would start the move: only then is there a shape to draw
 * and to edit. `sorted` is false when the points are not written in order of x, which the runtime
 * sorts them by; `low` and `high` are the lowest and highest levels, which may pass 0 and 1.
 */
export function readEnvelope(value) {
  const list = Array.isArray(value) ? value : [];
  const points = list.map((p, index) => {
    const parts = envelopePointParts(p);
    return { index, x: realNumber(parts?.x) ?? null, y: realNumber(parts?.y) ?? null, pair: parts?.pair ?? null };
  });
  const refusal = envelopeRefusal(value);
  const levels = points.map((p) => p.y).filter((y) => y !== null);
  const meaning = {
    points,
    count: points.length,
    complete: !refusal,
    sorted: points.every((p, i) => i === 0 || p.x === null || points[i - 1].x === null || p.x >= points[i - 1].x),
    low: levels.length ? Math.min(...levels) : null,
    high: levels.length ? Math.max(...levels) : null,
  };
  // Too few points is a note in the console, and a refusal all the same: nothing starts.
  return { meaning, problem: refusal ? { severity: 'error', message: refusal.message } : null };
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
          message: `${verb}: "${value}" is not a note name, so ${outcome}. A name is a letter from A to G, then # or b if it `
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
  const word = listWord(names, value);   // in any case, as the runtimes read it: "Dorian" is dorian
  if (!word) {
    const list = names.join(', ');
    const message = musicWords
      ? `${verb}: "${value}" is not a ${kind}, so there is no answer. The ${kind}s are ${list}.`
      : `"${value}" is not a ${kind}. The ${kind}s are ${list}.`;
    return { meaning, problem: { severity: 'error', message: `${message}${didYouMean(value, names)}` } };
  }
  meaning.label = word;
  if (Number.isFinite(root)) {
    const numbers = table[word].map((x) => root + x);
    meaning.numbers = numbers;
    meaning.notes = spellNotes(numbers, ((root % 12) + 12) % 12, kind === 'chord' ? 'major' : word);
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
 * panelRuntime's timeRefused, word for word: ce.time.after's delay, startTimer's interval, and the
 * beats syncTimer and afterBeats are given as a number. `spec` is { call, unit, what, positive,
 * outcome } as the runtime passes them. Text is refused even when it is a number: these read none.
 */
export function timeRefusal(value, { call, unit, what, positive, outcome }) {
  let why = null;
  if (value === undefined || value === null) why = `no ${what} was given`;
  else if (typeof value === 'string') why = `"${value}" is not a number of ${unit}`;
  else if (typeof value !== 'number') why = `the ${what} is not a number of ${unit}`;
  else if (!Number.isFinite(value)) why = `the ${what} is not a finite number of ${unit}`;
  else if (positive && value <= 0) why = `${value} is not more than 0 ${unit}`;
  else if (!positive && value < 0) why = `${value} is less than 0 ${unit}`;
  return why === null ? null : `${call}: ${why}, so ${outcome}.`;
}

/**
 * A number with a unit or a range. `param` is the contract's descriptor; `tempo` the BPM the
 * milliseconds are counted in. The two opacity scales (record example 12) warn in the words the
 * runtime warns in, given `site.scaleWarning`.
 */
export function readNumber(value, param, { tempo: contextTempo = 120, site = {} } = {}) {
  const tempo = site.tempo ?? contextTempo;
  const unit = param.unit ?? null;
  const range = rangeOfUnit(unit);
  // `min: null` in the contract: a unit with no floor (ce.ui.notify's 0 or less keeps a message up).
  const min = param.min === null ? null : Number.isFinite(param.min) ? param.min : range.min;
  const max = Number.isFinite(param.max) ? param.max : range.max;
  const meaning = { unit, min, max, hint: param.hint ?? null,
    integer: /^\d+ to (?:16|127|255|16383)$/.test(String(unit ?? '')) || param.integer === true };
  if (site.time) {
    const refused = timeRefusal(value, site.time);
    if (refused) return { meaning, problem: { severity: 'error', message: refused } };
  }
  const n = typeof value === 'number' ? value : realNumber(value);
  // ce.time's helpers (timeWords.js): what the helper does with a number it cannot use as written,
  // in its words, and nothing of a range besides, since the helper reads its own.
  // A count read as the nearest whole one in range, said once (expandOctaves' octaves).
  if (site.numberSaid && value !== undefined && value !== null) {
    const said = site.numberSaid(value);
    if (said) return { meaning, problem: { severity: 'warning', message: said } };
  }
  if (site.timeNumber && value !== undefined && value !== null) {
    const { said } = timeNumber(site.timeNumber.memberId, site.timeNumber.name, value);
    if (said) return { meaning, problem: { severity: 'warning', message: said } };
  }
  // sendNote's length (panelRuntime's noteLength): text that is a number is read, and it must be
  // above 0, or the note is not sent at all.
  if (site.noteLength && value !== undefined && value !== null && (n === undefined || !(n > 0))) {
    return { meaning, problem: { severity: 'error', message: `${site.noteLength}: ${shownValue(value)} is not a length in milliseconds, so nothing was sent. `
      + 'Give a number above 0, or leave it out to send the note off yourself.' } };
  }
  // ce.anim's timing (panelRuntime's animTiming and animBeats, word for word, said once there).
  if (site.animTiming && value !== undefined && value !== null) {
    const { name, fallback } = site.animTiming;
    const said = (text) => ({ meaning, problem: { severity: 'warning', message: `${site.path}: ${text}` } });
    if (name === 'beats') {
      if (n === undefined) return said(`${shownValue(value)} is not a number of beats, so the move's length is its duration.`);
      if (n <= 0) return said(`${shownValue(n)} beats is not more than 0, so the move's length is its duration.`);
    } else if (name === 'stagger' || name === 'damping' || name === 'frequency') {
      // panelRuntime's animOption: only what is not a number; a number below 0 is used as it is.
      if (n === undefined) {
        return said(`${shownValue(value)} is ${name === 'stagger'
          ? 'not a number of milliseconds, so the moves start together, as they do when no stagger is given.'
          : `not a number, so the spring's ${name} is ${fallback}, as it is when none is given.`}`);
      }
    } else {
      const duration = name === 'duration';
      if (n === undefined) {
        const beatsLike = duration && typeof value === 'string' && value.includes('/');
        return said(`${shownValue(value)} is not a number of milliseconds, so the move `
          + (duration ? `takes ${Math.round(fallback)} ms, as it does when no duration is given.` : 'starts at once, as it does when no delay is given.')
          + (beatsLike ? ' For a length in beats, give beats, a number.' : ''));
      }
      if (n < 0) return said(`a ${name} of ${shownValue(n)} is less than 0, so the move ${duration ? 'takes 1 ms: it jumps.' : 'starts at once.'}`);
    }
  }
  if (n === undefined || !Number.isFinite(n)) {
    // panelRuntime's midiArg refuses anything it cannot read as a number, a name included: "C4"
    // written where the channel goes (sendNote's channel comes first) sends nothing.
    if (site.midi && MIDI_ARGS[site.midi] && value !== undefined && value !== null) {
      const [, aNoun, , , , hint] = MIDI_ARGS[site.midi];
      return { meaning, problem: { severity: 'error', message: `${site.path}: ${shownValue(value)} is not ${aNoun}, so nothing was sent. ${hint}` } };
    }
    return { meaning, problem: null };
  }
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
  // ce.anim's timing has said above all the runtime says of it: a stagger below 0 is used as it is.
  // So have ce.time's helpers.
  if (site.animTiming || site.timeNumber || site.numberSaid) return { meaning, problem: null };
  // A component verb's number past its range is used as the nearest end, in the verb's words.
  if (site.componentClamp) {
    const { verb, target, args } = site.componentClamp;
    if ((min !== null && n < min) || (max !== null && n > max)) {
      const said = args.every((a) => a !== undefined) ? componentClampWarning(verb, target, args) : null;
      return { meaning, problem: { severity: 'warning', message: said ?? `the ${param.name} ${shownValue(n)} is outside ${min} to ${max}, so ${n < min ? min : max} was used.` } };
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

/**
 * A value from a closed list. `refusal(value, list, name)` gives the runtime's own sentence where it
 * has one. Every call reads its words in any case (utils/wordLists.js), so "Multiply" is "multiply".
 * `anyCase: false` is for a value written straight into a property, which the renderer reads only
 * as it is spelled: a word in another case is said to be refused there.
 */
export function readEnum(value, values, { path, name, refusal, anyCase = true } = {}) {
  const meaning = { choices: values.map(String) };
  if (value === undefined || value === null) return { meaning, problem: null };
  if (values.some((v) => v === value)) return { meaning, problem: null };
  const exactish = typeof value === 'string' ? values.find((v) => typeof v === 'string' && v.toLowerCase() === value.trim().toLowerCase()) : undefined;
  // A call that reads its words in any case takes "LEFT" as "left".
  if (exactish !== undefined && anyCase) return { meaning, problem: null };
  if (exactish !== undefined && !refusal) {
    return { meaning, problem: { severity: 'warning', message: `${path ? `${path}: ` : ''}"${value}" is written "${exactish}" in the list of ${name}'s values; a call that reads only that spelling refuses it.` } };
  }
  const said = refusal
    ? refusal(value, values, name)
    : `${path ? `${path}: ` : ''}${typeof value === 'string' ? `"${value}"` : String(value)} is not one of the values ${name} takes. They are ${words(quoted(values))}.`;
  // A refusal may say how bad it is ({ severity, message }): a word used as the default warns.
  const { severity, message } = typeof said === 'object' && said ? said : { severity: 'error', message: said };
  // A refusal with nothing to say takes the value: ce.draw.stroke's `false` is no cap.
  if (!message) return { meaning, problem: null };
  return { meaning, problem: { severity, message: `${message}${typeof value === 'string' ? didYouMean(value, values.map(String)) : ''}` } };
}

/** The runtime's own sentences for a value not in a list, where a member has one. */
export const ENUM_REFUSALS = {
  drawBlend: (value, list) => `ce.draw.blend("${value}"): not a blend mode. One of: ${list.join(', ')}.`,
  // Its two lists are cap's and join's; drawDash.js says both, as the runtime draws them.
  // The problem as drawDash says it, severity included: a warning, since the default is drawn.
  drawStroke: (value, _list, name) => (STROKE_ENDS[name] ? strokeEnd(name, value).problem ?? null : null),
  // ce.panel's arrangement verbs, each in its own sentence (layoutWords.js).
  ...Object.fromEntries(Object.keys(LAYOUT_WORDS).map((id) => [id, (value) => layoutWord(id, value).refused])),
  // ce.music's two words are not refused: one there is none of is the default, said once.
  voiceLead: (value) => ({ severity: 'warning', message: voiceLeadMode(value).said }),
  arpOrder: (value) => ({ severity: 'warning', message: arpOrderPattern(value).said }),
  // The list is the canonical names; the runtime takes their other spellings too ("roland" for
  // "roland-7bit", the one its own snippet writes), and refuses the rest in its own words
  // (panelRuntime.js, checksumOf).
  checksum: (value) => (typeof value === 'string' && checksumAlgorithm(value) ? null
    : `ce.midi.checksum(${typeof value === 'string' ? `"${value}"` : String(value)}): no such algorithm. One of: ${checksumNames().join(', ')}.`),
};

/**
 * A list of notes as ce.music's helpers read it (noteLists.js): the notes by name, and the call's
 * refusal of a list with anything in it that is not a note, in the runtime's words.
 */
export function readNoteList(value, { memberId, name }) {
  const { notes, refused } = noteList(memberId, name, value);
  const meaning = { notes, names: notes.map((n) => noteNameOf(n)) };
  return { meaning, problem: refused ? { severity: 'error', message: refused } : null };
}

/** An event's name: an id ("valueChanged") or a handler name ("onValueChanged"). */
export function readEvent(value, { anyTarget, names = null }) {
  const handlers = ALL_EVENTS.map((e) => e.fn);
  const meaning = { name: value, handler: null, id: null, found: false, choices: handlers };
  if (typeof value !== 'string') return { meaning, problem: null };
  const event = EVENT_BY_ID[value] ?? ALL_EVENTS.find((e) => e.fn === value);
  if (event) {
    Object.assign(meaning, { handler: event.fn, id: event.id, found: true, summary: event.summary });
    return { meaning, problem: null };
  }
  if (anyTarget) {
    meaning.custom = true;
    // A custom event is emit()'s, and only a script emits it (scriptNames.js).
    meaning.choices = [...new Set([...(names?.emits ?? []).map((e) => e.name), ...handlers])];
    const emitters = (names?.emits ?? []).filter((e) => e.name === value);
    if (emitters.length) meaning.emittedBy = [...new Set(emitters.map((e) => names.scripts?.[e.scriptId]?.name ?? e.scriptId))];
    if (!names || emitters.length || (names.computed ?? []).includes('emits')) return { meaning, problem: null };
    const emitted = [...new Set((names.emits ?? []).map((e) => e.name))];
    return { meaning, problem: { severity: 'warning', message: `no script emits "${value}", so this is never called.${didYouMean(value, emitted)}` } };
  }
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
    // Its value as the panel holds it now, for the row (the record's "its type and current value").
    const value = controlValue(control);
    if (value !== undefined && (typeof value !== 'object' || value === null)) meaning.value = value;
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
 * set() and get() resolve one. `self` is the control a self.set path is relative to. `meaning.id` is
 * the id of the control it names, when the panel has it.
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
  // The control's id, which its row selects on the panel by: the path names the control even when
  // the rest of it leads nowhere.
  meaning.id = control._children.Core.id ?? null;
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

/**
 * What can come next in a property path after the segments `before` (completion over a path, one
 * segment at a time: scripting/valueCompletions.js), as readPath resolves one: `[{ name, detail }]`,
 * in the order a list shows them, or [] where the path leads nowhere.
 *
 * At the start, the panel's controls and "panel" (relative to `self`, a self.set path starts at the
 * control). After a control, its value's three forms, the shorthands, then its own sections. After
 * a section, its sections and then its settings, each with its value now; a section the control has
 * not made yet lists its template's. The panel lists its own settings.
 */
export function pathSegmentChoices(before, { panel, controls, self }) {
  const segments = (Array.isArray(before) ? before : []).map(String);
  const list = Array.isArray(controls) ? controls : [];
  if (!self && segments.length === 0) {
    const names = list.map((c) => ({ name: c?._children?.Core?.name, detail: c?._children?.Core?.controlType ?? 'control' })).filter((c) => c.name);
    return panel ? [...names, { name: 'panel', detail: 'the panel' }] : names;
  }
  const [head, ...rest] = self ? [null, ...segments] : segments;
  if (!self && String(head).toLowerCase() === 'panel') return panel ? keysOf(walk(panel, rest)) : [];
  const control = self ?? controlNamed(list, head);
  if (!control) return [];
  if (rest.length === 0) {
    const sections = Object.keys(control._children ?? {});
    // A section the control has not made is a path too, as readPath reads one (the templates have
    // it): listed after its own, so a knob's "Background" is there to pick.
    const made = new Set(sections.map((k) => k.toLowerCase()));
    const unmade = Object.keys(SECTION_DEFAULTS).filter((k) => !made.has(k.toLowerCase()));
    return [
      ...ACCESSORS.map((name) => ({ name, detail: name === 'value' ? 'its value' : `its value, as ${name}` })),
      ...Object.entries(SHORTHANDS).filter(([name]) => !ACCESSORS.includes(name)).map(([name, path]) => ({ name, detail: path })),
      ...sections.map((name) => ({ name, detail: 'section' })),
      ...unmade.map((name) => ({ name, detail: 'section, not made yet' })),
    ];
  }
  const node = walk(control, rest) ?? walk({ _children: SECTION_DEFAULTS }, rest);
  return keysOf(node);
}

/** A node's sections, then its settings, each with what it holds now. */
function keysOf(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const sections = Object.keys(node._children ?? {}).map((name) => ({ name, detail: 'section' }));
  const settings = Object.keys(node).filter((k) => k !== '_children' && k !== '_type').map((name) => {
    const v = node[name];
    const detail = v === null || v === undefined ? '' : typeof v === 'object' ? (Array.isArray(v) ? 'list' : 'table') : shownValue(v);
    return { name, detail };
  });
  return [...sections, ...settings];
}

/** A control's keyframe animation, checked as ce.anim.play checks it. */
export function readAnimation(value, { panel, controls, controlName }) {
  const meaning = { name: value, control: controlName ?? null, found: null };
  if (typeof value !== 'string' || !panel || typeof controlName !== 'string') return { meaning, problem: null };
  const control = controlNamed(controls, controlName);
  if (!control) return { meaning, problem: null };
  // The control's id and the animation's own key, for the row's Open (the Animation tab, on it).
  meaning.controlId = control._children?.Core?.id ?? null;
  const all = control._children?.Animations?._children ?? {};
  const playable = Object.entries(all).filter(([, a]) => String(a?.kind ?? '') === 'keyframes').map(([k]) => k);
  meaning.choices = playable;
  const key = Object.keys(all).find((k) => k.toLowerCase() === value.toLowerCase());
  const node = key === undefined ? null : all[key];
  meaning.key = key ?? null;
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

/* ------------------------------------------------------------------------ device parameters */

// What a call does with an id the profile does not have, said as the call does it: write and bind
// in their runtime's words (deviceWords.js), read and parameter, which are questions, by what they
// answer.
const DEVICE_UNKNOWN = {
  deviceWrite: (id, role) => ({ severity: 'error', message: deviceWriteUnknownWords(id, role) }),
  deviceBind: (id, role, control) => ({ severity: 'warning', message: deviceBindUnknownWords(control, id) }),
  deviceRead: (id, role) => ({ severity: 'warning', message: `"${id}" is not a parameter of the ${role} profile, so ce.device.read answers nothing.` }),
  deviceParameter: (id, role) => ({ severity: 'warning', message: `"${id}" is not a parameter of the ${role} profile, so ce.device.parameter answers nothing.` }),
};

/**
 * A device parameter's id, read against the profile behind its role. `devices` is the context's
 * (editor/BehaviorDesigner.svelte): `roles` gives each mapped role's profile and its whole table of
 * parameters (stores/deviceParameterTable.js), null while it loads; `declared` the ids the panel's
 * scripts declare with ce.device.defineParameter, which no profile needs to have. A role nothing is
 * mapped to reads the main synth's profile, as the runtime's roleMapping does, except in a write or
 * a binding, which is sent to its own role's profile or not at all.
 *
 * Nothing is said of an id before the whole table is in: part of a table cannot say what is not in
 * it. With no profile chosen, write and bind say what they do, and a read or parameter() of one
 * answers nothing, which is not wrong of a script that drives a synth with no profile at all.
 */
export function readDeviceParameter(value, { devices, role, memberId, control }) {
  const wanted = typeof role === 'string' && role ? role : 'mainSynth';
  // A write, and a binding's every move, is sent to its role's own profile and no other, as the
  // runtime sends it.
  const sends = memberId === 'deviceWrite' || memberId === 'deviceBind';
  const device = devices?.roles?.[wanted] ?? (sends ? null : devices?.roles?.mainSynth) ?? null;
  const meaning = { id: value, role: wanted, profile: device?.profileName ?? null, parameter: null, found: null, loading: false, declared: false };
  if (typeof value !== 'string') return { meaning, problem: null };
  // Declared for this role, as the runtime keeps a declaration (or for any, when its role is built).
  const declared = Array.isArray(devices?.declared)
    && devices.declared.some((d) => d?.id === value && (d.role == null || d.role === wanted));
  if (!device?.profileId) {
    meaning.noProfile = true;
    // bind says so with no profile too: nothing then knows the id but a declaration. write refuses,
    // as the runtime and the plug-in do: nothing is there to encode it.
    if (!declared && devices && memberId === 'deviceBind') return { meaning, problem: DEVICE_UNKNOWN.deviceBind(value, wanted, control ?? '') };
    if (!declared && devices && memberId === 'deviceWrite') return { meaning, problem: { severity: 'error', message: deviceWriteNoProfileWords(value, wanted) } };
    return { meaning, problem: null };
  }
  const table = Array.isArray(device.parameters) ? device.parameters : null;
  if (table) {
    const ids = table.map((p) => String(p?.id ?? '')).filter(Boolean);
    meaning.choices = ids;
    meaning.choiceNames = Object.fromEntries(table.filter((p) => p?.id && p?.name && p.name !== p.id).map((p) => [p.id, String(p.name)]));
  } else {
    meaning.loading = true;
  }
  if (declared) { meaning.declared = true; meaning.found = true; return { meaning, problem: null }; }
  if (!table) return { meaning, problem: null };
  const parameter = table.find((p) => String(p?.id ?? '') === value) ?? null;
  meaning.found = Boolean(parameter);
  if (parameter) {
    meaning.parameter = parameterSummary(parameter);
    return { meaning, problem: null };
  }
  const said = (DEVICE_UNKNOWN[memberId] ?? DEVICE_UNKNOWN.deviceParameter)(value, wanted, control ?? '');
  return { meaning, problem: { ...said, message: `${said.message}${didYouMean(value, meaning.choices)}` } };
}

/** What a row says of a parameter: its name, group and range, as the profile gives them. */
function parameterSummary(p) {
  const range = p?.range && typeof p.range === 'object' ? p.range : null;
  const min = Number(range?.min ?? p?.min);
  const max = Number(range?.max ?? p?.max);
  const choices = Array.isArray(p?.choices) ? p.choices.length : 0;
  return {
    name: String(p?.name ?? ''),
    group: String(p?.group ?? ''),
    type: String(p?.type ?? ''),
    range: Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null,
    choices,
  };
}

/* ------------------------------------------------------------------------ drawing */

/**
 * The shape a ce.draw call draws, on the control it is drawn on: its outline as SVG path data in the
 * control's coordinates, its box, the control's { w, h } when the script is a control's, and the
 * runtime's sentence for a shape that lies wholly outside it. Null when a coordinate is not written
 * out, since then where it lands is not known until it runs.
 */
export function readDrawShape(memberId, args, self) {
  const spec = DRAW_SHAPES[memberId];
  if (!spec) return null;
  const arg = (name) => args.find((a) => a.param?.name === name);
  const nums = {};
  for (const name of spec.nums) {
    const a = arg(name);
    if (a && !a.literal) return null;
    nums[name] = drawNumber(memberId, name, a?.value).n;
  }
  let points = [];
  // What a row says of its own argument, in the runtime's words: an item of a point list that is
  // not a point, a radius, tension or scale not used as given, the characters with no glyph.
  const said = {};
  const opts = arg('opts');
  const o = opts?.literal && opts.value && typeof opts.value === 'object' ? opts.value : {};
  if (memberId === 'drawPath') {
    const a = arg('points');
    if (!a?.literal || !Array.isArray(a.value)) return null;
    for (let i = 0; i + 1 < a.value.length; i += 2) {
      const x = Number(a.value[i]);
      const y = Number(a.value[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
    nums.closed = arg('closed')?.value === true;
  }
  let extra = {};
  if (memberId === 'drawPoints' || memberId === 'drawCurve') {
    const a = arg('points');
    if (!a?.literal) return null;
    const read = pointList(memberId, a.value);
    points = read.points;
    said.points = read.said;
    if (memberId === 'drawPoints') {
      const r = arg('radius');
      if (r && !r.literal) return null;
      const radius = pointRadius(r?.value);
      said.radius = radius.said;
      extra = { radius: radius.r };
    } else {
      // A curve's tension is in its options: not known until they are.
      if (opts && !opts.literal) return null;
      const tension = curveTension(o.tension);
      said.tension = tension.said;
      extra = { tension: tension.t, closed: o.closed === true };
    }
  }
  if (memberId === 'drawPixelText') {
    const text = arg('text');
    const sc = arg('scale');
    if (!text?.literal || typeof text.value !== 'string' || (sc && !sc.literal)) return null;
    const scale = pixelScale(sc?.value);
    said.scale = scale.said;
    said.text = pixelGapWords(text.value);
    extra = { text: text.value, scale: scale.scale };
  }
  // A clip given no x clears the clip; its width and height are at least 0, as the runtime holds them.
  if (memberId === 'drawClip') {
    if (!arg('x')) return null;
    nums.w = Math.max(0, nums.w);
    nums.h = Math.max(0, nums.h);
  }
  const outline = shapeOutline(memberId, nums, {
    points, sides: arg('sides')?.literal ? arg('sides').value : 3, rotation: o.rotation ?? 0, ...extra,
  });
  if (!outline) return memberId === 'drawPoints' || memberId === 'drawCurve' ? { said } : null;
  const t = self?._children?.Transform;
  const box = t && Number(t.width) > 0 && Number(t.height) > 0 ? { w: Number(t.width), h: Number(t.height) } : null;
  // Half the stroke the drawing starts with, 1 wide, counts as inside: what the script set before
  // this call is not read here. A clip says what it leaves of the control, in its own words.
  const outside = memberId === 'drawClip' ? clipWords({ x: nums.x, y: nums.y, w: nums.w, h: nums.h }, box)
    : outsideWords(memberId, outline.bounds, box, 1);
  return { ...outline, box, outside, said };
}

/* ------------------------------------------------------------------------ roles and dumps */

// What a call does with a role no profile is chosen for, as the runtime does it: the parameter
// lookups take the main synth's profile, in both runtimes (DeviceProfileService::engineForRole);
// the profile's own readers answer from the role's own mapping, and so give nothing; and the two
// overrides refuse it (deviceWords.js).
const ROLE_USE = {
  deviceParameter: 'mainSynth', deviceParameters: 'mainSynth',
  deviceProfile: 'nothing', deviceVariables: 'nothing', deviceTiming: 'nothing', deviceCoverage: 'nothing', deviceRead: 'nothing',
  deviceRecipes: 'an empty list', deviceRequests: 'an empty list', deviceConnected: 'false',
  deviceSetVariable: 'setVariable', deviceSetTiming: 'setTiming',
  deviceDefineParameter: 'declares', deviceDefineDump: 'declares',
};

/**
 * A device role: the roles there are (the main synth, each one a profile is chosen for, and each one
 * the panel's controls are bound to), the profile behind this one, and what the call does with one
 * no profile is chosen for: the overrides' refusal in the runtime's words, and for a role nothing
 * on the panel knows of, which is likelier a slip than a device, what the call gives back instead.
 */
export function readDeviceRole(value, { devices, memberId, controls }) {
  const roles = devices?.roles ?? {};
  const used = [...countRolesInControls(controls ?? []).keys()];
  const choices = [...new Set(['mainSynth', ...Object.keys(roles), ...used])];
  const meaning = { role: value, profile: null, choices };
  if (typeof value !== 'string' || !value || !devices) return { meaning, problem: null };
  const device = roles[value];
  if (device) {
    meaning.profile = device.profileName;
    meaning.hint = memberId in ROLE_USE && ROLE_USE[memberId] === 'declares' ? `declared for ${value}, whose profile is ${device.profileName}` : device.profileName;
    return { meaning, problem: null };
  }
  const use = ROLE_USE[memberId];
  if (use === 'setVariable' || use === 'setTiming') {
    return { meaning, problem: { severity: 'error', message: deviceSetNoProfileWords(use, value) } };
  }
  const main = roles.mainSynth;
  meaning.hint = use === 'mainSynth' ? `no profile is chosen for ${value}, so this reads mainSynth's${main ? `, ${main.profileName}` : ', and none is chosen for that either'}`
    : use === 'declares' ? `declared for ${value}, which no profile is chosen for yet`
    : use ? `no profile is chosen for ${value}, so this gives ${use}` : `no profile is chosen for ${value}`;
  if (use === 'declares' || value === 'mainSynth' || used.includes(value)) return { meaning, problem: null };
  return {
    meaning,
    problem: { severity: 'warning', message: `"${value}" is not a device of this panel: no profile is chosen for it, and no control is bound to it.${didYouMean(value, choices)}` },
  };
}

/**
 * The kind of dump requestDump, sendDump and buildDump take: a dump the main synth's profile
 * defines, by its id, or one the scripts declare with defineDump; for requestDump a request's own id
 * as well, whose answer arrives under the dump it answers with. The runtime's refusal of a kind it
 * has none of (deviceWords.js), once the profile's document is there to say so.
 */
export function readDumpKind(value, { devices, memberId }) {
  const main = devices?.roles?.mainSynth ?? null;
  const declared = (devices?.declaredDumps ?? []).filter((d) => d.role == null || d.role === 'mainSynth').map((d) => d.id);
  const dumps = main?.dumps ?? null;
  const meaning = { kind: value, choices: [...new Set([...(dumps ?? []).map((d) => d.id), ...declared])] };
  meaning.choiceNames = Object.fromEntries((dumps ?? []).filter((d) => d.name && d.name !== d.id).map((d) => [d.id, d.name]));
  if (typeof value !== 'string' || !value) return { meaning, problem: null };
  if (declared.includes(value)) { meaning.hint = "declared by this panel's scripts"; return { meaning, problem: null }; }
  if (!dumps) return { meaning, problem: null };
  const dump = dumps.find((d) => d.id === value);
  if (dump) { meaning.hint = dump.name && dump.name !== dump.id ? dump.name : `a dump of ${main.profileName}`; return { meaning, problem: null }; }
  const request = memberId === 'requestDump' ? (main.requests ?? []).find((r) => r.id === value) : null;
  if (request) {
    meaning.hint = request.dump ? `the request for the "${request.dump}" dump` : 'a request of the profile';
    return { meaning, problem: null };
  }
  const verb = memberId === 'buildDump' ? 'buildDump' : memberId === 'sendDump' ? 'sendDump' : 'requestDump';
  const message = dumpKindUnknownWords(verb, value, 'mainSynth', dumps.map((d) => d.id), verb === 'buildDump' ? 'nothing was built' : undefined);
  return { meaning, problem: { severity: 'error', message } };
}

/* ------------------------------------------------------------------------ names across scripts */

// For each call that names something another script names too: which of scriptNames' lists holds
// the other side, what this call does with a name nobody answers, and the sentence for it.
const SHARED_NAMES = {
  startTimer: { other: 'stops', role: 'start' }, syncTimer: { other: 'stops', role: 'start' },
  stopTimer: { other: 'starts', role: 'stop', none: (n) => `no script starts a timer called "${n}", so this stops nothing.` },
  saveSetting: { other: 'loads', role: 'save' },
  loadSetting: { other: 'saves', role: 'read', none: (n, scope) => `no script saves "${n}"${scope === 'panel' ? '' : ` in the ${scope} scope`}, and the panel holds no setting by it, so this gives its fallback.` },
  forgetSetting: { other: 'saves', role: 'read', none: (n, scope) => `no script saves "${n}"${scope === 'panel' ? '' : ` in the ${scope} scope`}, and the panel holds no setting by it, so this forgets nothing.` },
  emit: { other: 'hears', role: 'emit', none: (n) => `no script listens for "${n}", so this reaches nothing.` },
  defineAction: { other: 'runs', role: 'define' },
  run: { other: 'defines', role: 'run' },
};
const SCRIPT_KEY_PREFIX = '\u0001script:';   // panelRuntime's storageKeyFor

/**
 * A name a call shares with the panel's other scripts (scriptNames.js): the names there are on the
 * other side, which script answers this one, and, when none does and no call builds one from parts,
 * what the call does instead. A setting the panel already holds answers a read; a function by the
 * action's name answers run(), as the runtime's runAction finds one, and run of neither is refused in
 * the runtime's words.
 */
export function readSharedName(value, { names, memberId, scriptId, scope = 'panel', settings }) {
  const spec = SHARED_NAMES[memberId];
  const meaning = { name: value, choices: [] };
  if (!spec || !names) return { meaning, problem: null };
  const scriptName = (id) => `'${names.scripts?.[id]?.name ?? id}'`;
  const sameScope = (e) => (e.scope ?? 'panel') === scope && (scope !== 'script' || e.scriptId === scriptId);
  let others = names[spec.other] ?? [];
  if (spec.role === 'emit') others = [...others, ...(names.runsOn ?? [])];
  if (spec.role === 'read' || spec.role === 'save') others = others.filter(sameScope);
  if (spec.role === 'run') others = [...others, ...(names.functions ?? [])];
  meaning.choices = [...new Set(others.map((e) => e.name))].sort();
  if (typeof value !== 'string' || !value) return { meaning, problem: null };

  if (spec.role === 'run') {
    const dot = value.lastIndexOf('.');
    const owner = dot > 0 ? value.slice(0, dot).toLowerCase() : '';
    const action = dot > 0 ? value.slice(dot + 1) : value;
    const defined = owner ? [] : (names.defines ?? []).filter((e) => e.name.toLowerCase() === action.toLowerCase());
    const fns = (names.functions ?? []).filter((e) => e.name === action && (!owner || names.scripts?.[e.scriptId]?.target.toLowerCase() === owner));
    const by = defined[0] ?? fns[0];
    if (by) { meaning.hint = `${defined.length ? 'defined' : 'a function'} in ${scriptName(by.scriptId)}`; return { meaning, problem: null }; }
    if ((names.computed ?? []).includes('defines')) return { meaning, problem: null };
    const registered = [...new Set((names.defines ?? []).map((e) => e.name))];
    return {
      meaning,
      problem: { severity: 'error', message: `run("${value}") found no loaded script defining ${action}()${registered.length ? `. Registered actions: ${registered.join(', ')}` : ''}` },
    };
  }

  const answering = others.filter((e) => e.name === value);
  // A read of a setting the panel already holds is answered by it, whoever saved it.
  const storedKey = scope === 'script' ? `${SCRIPT_KEY_PREFIX}${scriptId ?? ''}:${value}` : value;
  const held = spec.role === 'read' && scope !== 'local' && settings && typeof settings === 'object' && Object.hasOwn(settings, storedKey);
  if (answering.length) {
    const where = [...new Set(answering.map((e) => scriptName(e.scriptId)))].join(', ');
    const verb = { start: 'stopped', stop: 'started', save: 'read', read: 'saved', emit: 'heard', define: 'run' }[spec.role];
    meaning.hint = `${verb} in ${where}`;
    return { meaning, problem: null };
  }
  if (held) { meaning.hint = `the panel holds ${shownValue(settings[storedKey])}`; return { meaning, problem: null }; }
  meaning.hint = { start: 'no script stops it', save: 'no script reads it', define: 'no script runs it' }[spec.role] ?? null;
  if (!spec.none || (names.computed ?? []).includes(spec.other) || scope === null) return { meaning, problem: null };
  return { meaning, problem: { severity: 'warning', message: `${spec.none(value, scope)}${didYouMean(value, meaning.choices)}` } };
}

/* ------------------------------------------------------------------------ component indexes */

const VERB_BY_ID = new Map(COMPONENT_VERBS.map((verb) => [verb.id, verb]));

/**
 * The index a component verb addresses an element by (a pad, a lane, a grid cell, a named element;
 * a zone, a phrase cell, a recorder slot), read against the control the call names as the verb reads
 * it: what it addresses there now, how many there are, and the verb's own refusal when it addresses
 * nothing, in the console's words (componentVerbs.componentRefusalLine, handWrittenVerbs.js).
 *
 * `args` are the call's arguments after the control, as written (undefined where one is not written
 * out), and `at` which of them this is. The refusal is the whole line when every one is written out,
 * as the console writes it; else only why.
 */
export function readComponentIndex(value, { memberId, at, args, target, control }) {
  const meaning = { hint: null, min: null, max: null, integer: true };
  const literal = args.every((a) => a !== undefined);
  const verb = VERB_BY_ID.get(memberId);
  if (verb && verbNameArgs(verb).length && at === 0) return readFamilyVerbName(value, verb, control);
  if (verb?.k === 'read') return readFamilyIndex(value, verb, args, control);
  if (verb) {
    const cfg = control?._children?.[verb.section] ?? null;
    if (!cfg) return { meaning, problem: null };
    const range = componentIndexRange(verb, cfg);
    const noun = verb.grid ? (at === 0 ? 'row' : 'column') : listNoun(verb);
    const say = (reason) => ({ meaning, problem: reason ? { severity: 'error', message: literal ? componentRefusalLine(verb, target, args, cfg) : reason } : null });
    // The LCD's text and clear take a position (lcdPositions.js): a row of the layout showing, or a
    // table of layout, row and col. Judged by what the position says alone, as the text after it
    // has a row of its own.
    // A layout, by its number or its name, as layout() takes it.
    if (verb.k === 'layout') {
      const layouts = Array.isArray(cfg.layouts) ? cfg.layouts : [];
      meaning.choices = layouts.map((l) => String(l?.name ?? '')).filter(Boolean);
      Object.assign(meaning, { min: 1, max: lcdLayoutCount(cfg) });
      const named = lcdLayoutIndex(cfg, value, verb.flat);
      if (named.refusal) return say(named.refusal);
      const name = layouts[named.index]?.name;
      meaning.hint = `layout ${named.index + 1} of ${lcdLayoutCount(cfg)}${layouts.length ? (name ? ` · ${name}` : '') : ` · ${verb.flat}`}`;
      return { meaning, problem: null };
    }
    if (verb.k === 'line' && verb.section === 'Display') {
      const pos = lcdPosition(cfg, value);
      const refused = pos.refusal ?? (verb.clear ? lcdClearAt(cfg, value) : lcdWriteAt(cfg, value, '')).refusal;
      if (refused) return say(refused);
      if (!isPositionTable(value)) Object.assign(meaning, { min: 1, max: lcdRows(cfg) });
      else meaning.integer = false;
      const now = pos.rows && pos.rows[0] === pos.rows[1] ? lcdReadAt(cfg, value).value : undefined;
      meaning.hint = value === undefined || value === null ? null
        : `${isPositionTable(value) ? lcdPositionWords(cfg, value) : `row ${pos.rows[0] + 1} of ${lcdRows(cfg)}`}${typeof now === 'string' ? ` · now ${shownValue(now)}` : ''}`;
      return { meaning, problem: pos.clamped ? { severity: 'warning', message: pos.clamped } : null };
    }
    if (verb.k === 'elem') {
      meaning.choices = range?.names ?? [];
      meaning.hint = elementSites(cfg, value, verb.list ?? 'elements').length ? `${verb.list === 'zones' ? 'a zone' : 'an element'} of ${target}` : null;
      return say(typeof value === 'string' ? componentRefusalReason(verb, cfg, [value, args[1]]) : null);
    }
    if (verb.k === 'indexset') {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= 1) {
        const on = (Array.isArray(cfg[verb.f]) ? cfg[verb.f] : []).map(Number).includes(n - 1);
        meaning.hint = `${noun} ${n}${on ? ' · muted now' : ''}`;
      }
      meaning.min = 1;
      return say(componentRefusalReason(verb, cfg, [value]));
    }
    const count = verb.grid ? (at === 0 ? range.rows : range.cols) : range?.count ?? 0;
    Object.assign(meaning, { min: count ? 1 : null, max: count || null });
    const reason = indexRefusal(value, count, noun);
    if (reason) return say(reason);
    const n = Math.round(Number(value));
    let now = '';
    if (verb.k === 'item') {
      const current = itemCurrent(verb, cfg, n - 1);
      if (current !== undefined) now = ` · ${verb.item} now ${shownValue(current)}`;
    } else if (verb.k === 'line') {
      const line = cfg[verb.f]?.[n - 1];
      if (typeof line === 'string') now = ` · now ${shownValue(line)}`;
    } else if (!verb.grid) {
      const cell = cfg[verb.f]?.[n - 1];
      if (typeof cell === 'number') now = ` · now ${shownValue(cell)}`;
    }
    meaning.hint = `${noun} ${n} of ${count}${now}`;
    return { meaning, problem: null };
  }
  if (READ_FIELDS[memberId]) return readSectionField(value, READ_FIELDS[memberId], control);
  const spec = HAND_WRITTEN[memberId];
  if (!spec) return { meaning, problem: null };
  const cfg = control?._children?.[spec.section] ?? null;
  const words = spec.kinds[at] === 'word' ? handWrittenWords(memberId) : null;
  if (words) meaning.choices = words;
  if (!cfg) return { meaning, problem: null };
  const built = spec.args(...args);
  const refused = handWrittenRefusal(spec.family, spec.action, cfg, built);
  // Only what this argument is: a phrase cell's row says nothing of its step.
  const problem = refused && refused.at === at
    ? { severity: 'error', message: literal ? sectionRefusalLine(spec.family, target, spec.action, built, refused.reason) : refused.reason } : null;
  if (spec.kinds[at] === 'word') {
    if (spec.action === 'key' && !problem && Number.isFinite(Number(value))) {
      const pc = ((Math.round(Number(value)) % 12) + 12) % 12;
      meaning.hint = `${PITCH_NAMES[pc]}${pc !== Number(value) ? `: ${shownValue(value)} wraps round to ${pc}` : ''}`;
    }
    return { meaning, problem };
  }
  if (spec.family === 'split') {
    const zones = Array.isArray(cfg.zones) ? cfg.zones : [];
    const names = zones.map((z, i) => String(z?.label ?? `Zone ${i + 1}`));
    meaning.choices = names;
    Object.assign(meaning, { min: zones.length ? 1 : null, max: zones.length || null });
    const i = scriptZoneIndex(zones, value);
    if (i >= 0) meaning.hint = typeof value === 'number' ? `zone ${value} is "${names[i]}"` : `zone ${i + 1} of ${zones.length}`;
    return { meaning, problem };
  }
  if (spec.family === 'phrase') {
    const { steps, rows } = phraseGrid(cfg);
    const count = at === 0 ? steps : rows;
    Object.assign(meaning, { min: 1, max: count });
    const n = Math.round(Number(value));
    if (!problem && Number.isFinite(n)) meaning.hint = `${at === 0 ? 'step' : 'row'} ${n} of ${count}`;
    return { meaning, problem };
  }
  if (spec.family === 'setlist') {
    const scenes = setlistScenes({ _children: { Setlist: cfg } });
    meaning.choices = scenes.map((sc) => sc.name);
    Object.assign(meaning, { min: scenes.length ? 1 : null, max: scenes.length || null });
    const n = typeof value === 'number' ? Math.round(value) - 1 : scenes.findIndex((sc) => sc.name === value || sc.id === value);
    if (!problem && n >= 0 && n < scenes.length) {
      meaning.hint = typeof value === 'number' ? `scene ${value} is "${scenes[n].name}"` : `scene ${n + 1} of ${scenes.length}`;
    }
    return { meaning, problem };
  }
  if (spec.family === 'harmoniser') {
    const degrees = (CHORD_PAD_SCALES[String(cfg.scale ?? 'major')] ?? CHORD_PAD_SCALES.major).length;
    Object.assign(meaning, { min: 1, max: degrees });
    if (!problem && Number.isFinite(Number(value))) meaning.hint = `degree ${Math.round(Number(value))} of ${degrees}`;
    return { meaning, problem };
  }
  const held = Math.min(Array.isArray(cfg.slots) ? cfg.slots.length : 0, MAX_SLOTS);
  Object.assign(meaning, { min: 1, max: spec.action === 'store' ? MAX_SLOTS : (held || null) });
  const n = Math.round(Number(value));
  if (!problem && Number.isFinite(n)) {
    const take = cfg.slots?.[n - 1];
    meaning.hint = `slot ${n} of ${MAX_SLOTS}${take ? ` · holds ${shownValue(String(take.name ?? `Take ${n}`))}` : ' · empty'}`;
  }
  return { meaning, problem };
}

/**
 * The verb name read, size, fill, insert and remove take: one of the family's verbs (any of them for
 * read, a list for the rest), what it names on the control the call names, and the runtime's own
 * refusal of one the family has not.
 */
function readFamilyVerbName(value, verb, control) {
  const meaning = { hint: null, choices: familyVerbNames(verb.family, verb.k === 'read' ? 'read' : 'list') };
  const refused = typeof value === 'string' || typeof value === 'number' ? familyVerbRefusal(verb.family, verb.k, value) : null;
  if (refused) return { meaning, problem: { severity: 'error', message: refused } };
  const named = familyVerbNamed(verb.family, value);
  const cfg = control?._children?.[verb.section] ?? null;
  if (named && cfg) {
    const range = componentIndexRange(named, cfg);
    const noun = listNoun(named);
    if (range?.rows !== undefined) meaning.hint = `${range.rows} rows of ${range.cols} columns`;
    else if (range?.names) meaning.hint = range.names.length ? `the elements ${range.names.map((n) => `"${n}"`).join(', ')}` : 'no elements yet';
    else if (Number.isFinite(range?.count)) meaning.hint = `${range.count} ${noun}${range.count === 1 ? '' : 's'}`;
  }
  return { meaning, problem: null };
}

/** read's index into the list the verb it names writes: which element, and what it is now. */
function readFamilyIndex(value, verb, args, control) {
  const meaning = { hint: null, min: null, max: null, integer: true };
  const named = COMPONENT_VERBS.find((v) => v.family === verb.family && v.v === String(args[0]));
  const cfg = control?._children?.[verb.section] ?? null;
  if (!named || !cfg || !LIST_KINDS.includes(named.k)) return { meaning, problem: null };
  const refused = readIndexRefusal(named, cfg, value, args[2]);
  if (refused) return { meaning, problem: { severity: 'error', message: refused } };
  const range = componentIndexRange(named, cfg);
  const count = named.grid ? range.rows : range.count;
  Object.assign(meaning, { min: count ? 1 : null, max: count || null });
  const n = Math.round(Number(value));
  if (Number.isFinite(n)) meaning.hint = `${named.grid ? 'row' : listNoun(named)} ${n} of ${count}`;
  return { meaning, problem: null };
}

/** The field a hand-written family's read takes: one of its section's, in any case, and what it is now. */
function readSectionField(value, { section, label }, control) {
  const cfg = control?._children?.[section] ?? null;
  const meaning = { hint: null, choices: cfg ? sectionFields(cfg) : null };
  if (!cfg || value === undefined || value === null || value === '') return { meaning, problem: null };
  const refused = sectionFieldRefusal(label, cfg, value);
  if (refused) return { meaning, problem: { severity: 'error', message: refused } };
  const key = Object.keys(cfg).find((k) => k.toLowerCase() === String(value).toLowerCase());
  const now = cfg[key];
  meaning.hint = `${key !== value ? `${key}, ` : ''}now ${Array.isArray(now) ? `a list of ${now.length}` : shownValue(now)}`;
  return { meaning, problem: null };
}

const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

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
  // wantsData: ce.draw.image takes the picture itself, so a name is no value there to choose.
  const meaning = { name: value, dataUrl: typeof value === 'string' && /^data:/i.test(value), found: null, wantsData: Boolean(wantsData) };
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

/* --------------------------------------------------------------------------- font axes */

/**
 * ce.text.axis's tag (`at` 'tag') or value (`at` 'value'), read against the font of the control it
 * names (`family`, from `faces`, valuesContext's catalogue of each family's axes): the axes the font
 * has, and the runtime's words for a tag it has none of, a value that is not a number, and a value
 * the axis does not reach, which it keeps within it.
 */
export function readFontAxis(value, { name = '', family, faces, at, tag } = {}) {
  const meaning = {};
  if (!family || !Array.isArray(faces)) return { meaning, problem: null };
  const face = findFont(faces, family);
  if (at === 'tag') {
    const axes = face?.axes ?? [];
    meaning.choices = axes.map((a) => a.tag);
    meaning.choiceNames = Object.fromEntries(axes.map((a) => [a.tag, axisWords(a)]));
    if (typeof value !== 'string') return { meaning, problem: null };
    const axis = findAxis(face, value);
    if (axis) { meaning.hint = axisWords(axis); return { meaning, problem: null }; }
    const reason = face ? `"${face.family}" has no ${value} axis` : 'no font descriptor to check the axis against';
    return { meaning, problem: { severity: 'error', message: axisRefusalWords(name, family, value, reason) } };
  }
  const axis = typeof tag === 'string' ? findAxis(face, tag) : null;
  if (!axis) return { meaning, problem: null };
  Object.assign(meaning, { min: axis.min, max: axis.max, hint: axisWords(axis) });
  const n = Number(value);
  if (!Number.isFinite(n)) return { meaning, problem: { severity: 'error', message: axisRefusalWords(name, family, tag, `"${value}" is not a number`) } };
  const used = Math.min(axis.max, Math.max(axis.min, n));
  return { meaning, problem: used === n ? null : { severity: 'warning', message: axisClampWords(name, face.family, axis, n, used) } };
}

/* ------------------------------------------------------------------------ component types */

/**
 * ce.panel.create's type: the types there are, which ce.panel.types() lists, the size one is made
 * at, and the runtime's refusal for one there is none of, with the nearest when it is a slip. The
 * type is matched exactly, so "knob" is refused and "Knob" is one.
 */
export function readComponentType(value, { types = {} } = {}) {
  const names = Object.keys(types);
  const meaning = { choices: names };
  if (typeof value !== 'string') return { meaning, problem: null };
  const spec = types[value];
  if (!spec) {
    const near = closest(value, names);
    if (near !== null) meaning.hint = `did you mean "${near}"?`;
    return { meaning, problem: { severity: 'error', message: `ce.panel.create("${value}"): no such component type. ce.panel.types() lists them.` } };
  }
  const t = spec.defaultOverrides?.Transform;
  if (Number(t?.width) > 0 && Number(t?.height) > 0) meaning.hint = `made ${t.width} × ${t.height} unless props say otherwise`;
  return { meaning, problem: null };
}

/* ------------------------------------------------------------------------------ LCD lines */

/**
 * A line ce.components.lcd.text writes, read against the display it is written to: the cells the
 * display shows of it, and what the runtime says of what it cannot show (lcdLines.js). `args` are
 * the call's after the target, as the runtime shows them in its line.
 */
export function readLcdLine(value, { control, target, args = [] } = {}) {
  const display = control?._children?.Display;
  if (!display || typeof display !== 'object' || typeof value !== 'string') return { meaning: {}, problem: null };
  const call = `lcd ${target}: text(${args.map((x) => JSON.stringify(x) ?? 'nil').join(', ')})`;
  const said = lcdLineWords(display, call, value);
  return {
    meaning: { lcd: lcdLine(display, value) },
    problem: said.length ? { severity: 'warning', message: said.map((s) => s.message).join(' ') } : null,
  };
}

/* ---------------------------------------------------------------------------------- dashes */

/**
 * ce.draw.stroke's `opts.dash`, read by the runtime's own reader (drawDash.js), with the line's `cap`
 * when the same options give one. `dasharray` is what the drawing is handed, which the row's line
 * is drawn with; `lengths` the lengths drawn, one the runtime makes 0 already 0; `odd` says an odd
 * list is drawn twice over to make it even; `drawn` and `skipped` are what one round of it draws and
 * skips, in pixels. Nothing skipped is a solid line, and so is nothing at all (SVG's rule); nothing
 * drawn shows only as the caps, a dot for each dash, which the default cap does not draw.
 */
export function readDash(value, { cap } = {}) {
  const read = dashPattern(value);
  const lengths = read.lengths ?? [];
  const odd = lengths.length % 2 === 1;
  const round = odd ? [...lengths, ...lengths] : lengths;
  const sum = (from) => round.reduce((total, n, i) => (i % 2 === from ? total + n : total), 0);
  return {
    meaning: {
      dasharray: read.dasharray,
      lengths: read.lengths,
      odd,
      drawn: sum(0),
      skipped: sum(1),
      // The runtime takes a cap it knows and draws the default for any other.
      cap: strokeEnd('cap', cap).value ?? STROKE_ENDS.cap.otherwise,
    },
    problem: read.problem,
  };
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

/**
 * ce.device.defineParameter's spec as the runtime defines it (deviceDefinitions.defineParameter):
 * its refusal, or null. The definition checks every field in its own words and stops at the first
 * it cannot use, so the row of that field says it, and no other row says another sentence.
 */
export function parameterSpecRefusal(spec, id) {
  if (!spec || typeof spec !== 'object') return null;
  const defined = defineParameter(TEMPLATE_ROLE, typeof id === 'string' && id ? id : 'parameter', spec);
  return defined.ok ? null : defined.error;
}

/* ------------------------------------------------------------------------------- sections */

/** The section names a control can carry: what create's and clone's `<section>` takes. */
export const SECTION_NAMES = new Set(Object.keys(SECTION_DEFAULTS));
