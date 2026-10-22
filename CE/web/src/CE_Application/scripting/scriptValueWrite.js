// scriptValueWrite.js — a new value written back into a script in the form the old one had, for the
// Values sidebar (scriptValues.js re-exports writeValue). docs/design/script-editor-value-editors.md,
// "Rules every edit session follows", rule 1: keep the form. The text changes, and only the text:
// the caller applies the replacement through the editor's own edit path, as one undo step.

import { tokenize, matchBrackets, literalOf, isLiteral, valueOf, familyOf } from './scriptValueScan.js';
import { colourForm, panelParts, cssParts } from './scriptValueKinds.js';
import { CSS_NAMED_COLOURS, storedColour, realNumber } from './scriptColours.js';
import { envelopePointParts } from './animEnvelope.js';
import { builtNumbers, buildsColour } from './builtColours.js';
import { formatJson } from '../utils/jsonText.js';

const LANGUAGE_ALIASES = { ts: 'typescript', 'c++': 'cpp', cs: 'csharp', js: 'javascript' };
const languageOf = (id) => LANGUAGE_ALIASES[id] ?? id;

/* ================================================================================ writeValue */

const DEFAULT_QUOTE = '"';
const LUA_WORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const JS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The replacement for `arg.range` that writes `newValue` in the original's form and the script's
 * syntax (record rule 1, "Keep the form").
 *
 *  - colour: `newValue` is the colour chooser's AARRGGBB (8 hex digits, alpha first), "RRGGBB" or
 *    "#RRGGBB" (opaque), any form storedColour reads, or { rgb, alpha }. It is written in the form the
 *    old one was, where that form can carry it; an alpha it cannot carry switches to the reader's
 *    alpha form (a property's AARRGGBB, a drawing's "#RRGGBBAA"); a CSS name becomes "#RRGGBB" unless
 *    the new colour is that name's; rgb() and hsl() keep their function and syntax; a gradient stop in
 *    a stored gradient is written RRGGBB, upper case. Where the Arg's meaning says `takesAlpha:
 *    false` (a stored stop, a "#RRGGBB" claimed by its form alone) a colour that is not opaque is
 *    refused: null. A colour built from numbers (ce.math.rgbToHex, hslToHex: the Arg's meaning has
 *    `built`) is written as the call's three numbers, each in the form it had, and the call around
 *    them as it was; it takes no alpha.
 *  - gradient: `newValue` is { stops: [{ at (0..1) | position (0..100), colour | color, opacity? }],
 *    angle? }, the Gradient tab's object as it is. The stops are rebuilt in the script's own syntax:
 *    bare colours while they are evenly spaced and carry no opacity, else { at, colour }; a stop keeps
 *    an opacity it had. The angle argument is written, or added when it is not the default 180, so
 *    the replacement may run past arg.range to the end of the angle.
 *  - number: integer stays integer, decimals keep their count where the new value fits it, hex stays
 *    hex for a whole number.
 *  - envelope (ce.anim.envelope's points): `newValue` is the points in the order they are to be
 *    written, each { x, y, from }, where `from` is the index of the written point it is: only that
 *    point's x and y are written, as numbers in the form they had, and everything else about it (its
 *    braces or brackets, its keys, a curve it carries, the comments and the lines around it) stays.
 *    A point with no `from` is new, written as a copy of the point after it (the last one's of the
 *    point before), so it takes the curve of the segment it splits, as the Envelope component's
 *    added nodes do; a point left out is taken out with its separator. Plain points ({ x, y } or a
 *    pair) are taken too, by place when there are as many as were written.
 *  - anything else: strings keep their quotes; lists and tables are written in the language's syntax
 *    (Lua { }, JavaScript [ ] and { k: v }, Python [ ] and { "k": v }), their entries edited in place
 *    when only values change, so the layout and comments around them stay.
 * Writing the value the argument already holds gives back its text exactly.
 *
 * @param {string} source
 * @param {string} languageId  As readStatement takes it, or 'json' for readJsonValues' rows.
 * @param {Arg} arg  An Arg from readStatement or readJsonValues on this source.
 * @param {*} newValue
 * @returns {{ start: number, end: number, text: string }|null}  null when newValue cannot be written
 *   as this kind (an unreadable colour, say).
 */
export function writeValue(source, languageId, arg, newValue) {
  const src = String(source ?? '');
  const language = languageOf(languageId);
  const fam = familyOf(language);
  if (!arg?.range) return null;
  const { start, end } = arg.range;
  const old = src.slice(start, end);
  const toks = tokenize(old, language);
  const match = matchBrackets(toks);
  const node = literalOf(toks, 0, toks.length, fam, match);
  const w = { fam, old, toks, match, node };
  if (arg.kind === 'gradient') return arg.meaning?.stored ? writeStoredGradient(src, arg, newValue, w) : writeDrawGradient(src, arg, newValue, w);
  if (arg.kind === 'colour' && arg.meaning?.built) return writeBuiltColour(src, arg, newValue, fam);
  let text;
  if (arg.kind === 'colour') text = writeColour(arg, newValue, w);
  else if (arg.kind === 'envelope') text = writeEnvelope(newValue, w);
  else text = writeLiteral(newValue, w);
  return text === null ? null : { start, end, text };
}

/* --------------------------------------------------------------------------- write: colours */

/** A colour to write, from what the colour chooser (or a caller) gives: { rgb, alphaByte } or null. */
export function colourToWrite(value) {
  if (value && typeof value === 'object') {
    const rgb = String(value.rgb ?? value.colour ?? value.color ?? '').replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(rgb)) return null;
    const alpha = Number.isFinite(Number(value.alpha)) ? Math.min(1, Math.max(0, Number(value.alpha))) : 1;
    return { rgb: rgb.toUpperCase(), alphaByte: Math.round(alpha * 255) };
  }
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return { rgb: hex.toUpperCase(), alphaByte: 255 };
  if (/^[0-9a-f]{8}$/i.test(hex)) return { rgb: hex.slice(2).toUpperCase(), alphaByte: parseInt(hex.slice(0, 2), 16) };
  const parts = panelParts(storedColour(value));
  return parts ? { rgb: parts.rgb, alphaByte: parts.alphaByte } : null;
}

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const doubled = (hex) => /^(?:([0-9A-F])\1)+$/i.test(hex);
const shortOf = (hex) => hex.replace(/(.)\1/g, '$1');

/** The colour's text in the form `old` is written in, as `reader` reads it. */
export function colourText(old, reader, colour) {
  const lower = typeof old === 'string' && /[a-f]/.test(old) && !/[A-F]/.test(old) && !/^(?:rgb|hsl)/i.test(old);
  const H = (s) => (lower ? s.toLowerCase() : s.toUpperCase());
  const { rgb } = colour;
  const aa = hex2(colour.alphaByte);
  const opaque = colour.alphaByte >= 255;
  if (reader === 'stop') return rgb.toUpperCase();
  // ce.math.fromARGB / fromRGBA: the alpha where the call names it, as many digits as were written
  // (4 when they double, else 8; 6 or 3 while solid), with the "#" or without it, as it was.
  if (reader === 'argb' || reader === 'rgba') {
    const hash = typeof old === 'string' && old.startsWith('#') ? '#' : '';
    const digits = typeof old === 'string' ? old.replace(/^#/, '').length : 8;
    const eight = reader === 'argb' ? aa + rgb : rgb + aa;
    if (opaque && digits === 3 && doubled(rgb)) return `${hash}${H(shortOf(rgb))}`;
    if (opaque && (digits === 3 || digits === 6)) return `${hash}${H(rgb)}`;
    if (digits <= 4 && doubled(eight)) return `${hash}${H(shortOf(eight))}`;
    return `${hash}${H(eight)}`;
  }
  const alphaForm = reader === 'drawing' ? `#${H(rgb + aa)}` : H(aa + rgb);
  const form = typeof old === 'string' ? colourForm(old) : 'other';
  switch (form) {
    case 'hash6': return opaque ? `#${H(rgb)}` : alphaForm;
    case 'bare6': return opaque ? H(rgb) : H(aa + rgb);
    case 'bare8': return H(aa + rgb);
    // "#" with eight digits is AARRGGBB to the panel and RRGGBBAA to CSS (record example 1): a
    // property's is written AARRGGBB, the form that cannot be read two ways.
    case 'hash8': return reader === 'drawing' ? `#${H(rgb + aa)}` : H(aa + rgb);
    case 'hash3': return opaque ? (doubled(rgb) ? `#${H(shortOf(rgb))}` : `#${H(rgb)}`) : alphaForm;
    case 'hash4': return doubled(rgb + aa) ? `#${H(shortOf(rgb + aa))}` : `#${H(rgb + aa)}`;
    case 'name': {
      const named = old.toLowerCase() === 'transparent' ? null : CSS_NAMED_COLOURS[old.toLowerCase()];
      if (opaque && named === rgb) return old;
      return opaque ? `#${rgb}` : alphaForm;
    }
    case 'rgb-legacy': case 'rgb-modern': return rgbText(old, colour);
    case 'hsl-legacy': case 'hsl-modern': return hslText(old, colour);
    default: return opaque ? `#${rgb}` : alphaForm;
  }
}

const channelsOf = (rgb) => [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
const trimNumber = (n, places) => String(Number(n.toFixed(places)));

/** rgb()/rgba() with new numbers, in the old's syntax: commas or spaces, percent channels, the alpha. */
function rgbText(old, colour) {
  const m = /^(rgba?)\(\s*([^)]*)\)$/i.exec(old.trim()) ?? [old, 'rgb', ''];
  const name = m[1];
  const inner = m[2];
  const legacy = inner.includes(',');
  const parts = legacy ? inner.split(',') : inner.split('/')[0].trim().split(/\s+/);
  const percent = parts.slice(0, 3).map((p) => /%\s*$/.test(p));
  const space = legacy ? (/,\s/.test(inner) ? ', ' : ',') : ' ';
  const hadAlpha = legacy ? parts.length > 3 : inner.includes('/');
  const alphaText = legacy ? parts[3] : inner.split('/')[1];
  const alphaPercent = /%\s*$/.test(alphaText ?? '');
  const ch = channelsOf(colour.rgb).map((v, i) => (percent[i] ? `${trimNumber(v / 2.55, 1)}%` : String(v)));
  const alpha = colour.alphaByte / 255;
  const needAlpha = hadAlpha || colour.alphaByte < 255;
  const a = alphaPercent ? `${trimNumber(alpha * 100, 1)}%` : trimNumber(alpha, 3);
  if (legacy) {
    const fn = needAlpha && name.toLowerCase() === 'rgb' ? (name === 'RGB' ? 'RGBA' : 'rgba') : name;
    return `${fn}(${ch.join(space)}${needAlpha ? `${space}${a}` : ''})`;
  }
  return `${name}(${ch.join(' ')}${needAlpha ? ` / ${a}` : ''})`;
}

function hslOf(rgb) {
  const [r, g, b] = channelsOf(rgb).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/** hsl()/hsla() with new numbers, as few decimals as still read back as the same colour. */
function hslText(old, colour) {
  const m = /^(hsla?)\(\s*([^)]*)\)$/i.exec(old.trim()) ?? [old, 'hsl', ''];
  const name = m[1];
  const inner = m[2];
  const legacy = inner.includes(',');
  const parts = legacy ? inner.split(',') : inner.split('/')[0].trim().split(/\s+/);
  const unit = /(deg|grad|rad|turn)\s*$/i.exec(parts[0] ?? '')?.[1] ?? '';
  const space = legacy ? (/,\s/.test(inner) ? ', ' : ',') : ' ';
  const hadAlpha = legacy ? parts.length > 3 : inner.includes('/');
  const needAlpha = hadAlpha || colour.alphaByte < 255;
  const a = trimNumber(colour.alphaByte / 255, 3);
  const [h, s, l] = hslOf(colour.rgb);
  const hue = (deg) => (unit.toLowerCase() === 'turn' ? deg / 360 : unit.toLowerCase() === 'rad' ? (deg * Math.PI) / 180 : unit.toLowerCase() === 'grad' ? deg / 0.9 : deg);
  for (const places of [0, 1, 2, 3]) {
    const H = `${trimNumber(hue(h), unit && unit.toLowerCase() !== 'deg' ? places + 3 : places)}${unit}`;
    const text = legacy
      ? `${needAlpha && name.toLowerCase() === 'hsl' ? 'hsla' : name}(${H}${space}${trimNumber(s, places)}%${space}${trimNumber(l, places)}%${needAlpha ? `${space}${a}` : ''})`
      : `${name}(${H} ${trimNumber(s, places)}% ${trimNumber(l, places)}%${needAlpha ? ` / ${a}` : ''})`;
    const back = panelParts(storedColour(text));
    if (back && back.rgb === colour.rgb) return text;
    if (places === 3) return text;
  }
  return old;
}

function writeColour(arg, newValue, w) {
  const colour = colourToWrite(newValue);
  if (!colour) return null;
  const reader = arg.meaning?.reader ?? 'property';
  if (arg.meaning?.takesAlpha === false && colour.alphaByte < 255) return null;
  const swatch = arg.meaning?.swatch;
  if (swatch && w.node.type === 'string' && swatch.rgb === colour.rgb && Math.round(swatch.alpha * 255) === colour.alphaByte) {
    return w.old;
  }
  const oldText = w.node.type === 'string' ? w.node.value : null;
  const inner = colourText(oldText, reader, colour);
  return quoteLike(inner, w.node.type === 'string' ? w.toks[w.node.tok] : null, w.fam);
}

/**
 * A colour written as the numbers a ce.math.rgbToHex or hslToHex call builds it from: the call's
 * text with each number replaced in the form it was written (numberText), in source order, and
 * what is between and around them kept. Numbers that already build the colour stay as they are.
 */
function writeBuiltColour(src, arg, newValue, fam) {
  const colour = colourToWrite(newValue);
  if (!colour || colour.alphaByte < 255) return null;
  const { start, end } = arg.range;
  const { from, parts } = arg.meaning.built;
  if (buildsColour(from, parts.map((p) => p.value), colour.rgb)) return { start, end, text: src.slice(start, end) };
  const numbers = builtNumbers(from, colour.rgb, parts.map((p) => p.value));
  const written = parts.map((p, i) => ({ ...p, number: numbers[i] })).sort((a, b) => a.range.start - b.range.start);
  let text = '';
  let at = start;
  for (const p of written) {
    text += src.slice(at, p.range.start) + numberText(p.number, p.text, fam);
    at = p.range.end;
  }
  return { start, end, text: text + src.slice(at, end) };
}

/* --------------------------------------------------------------------------- write: literals */

/** `value` as a string literal in the quotes `tok` was written in, or the language's own. */
function quoteLike(value, tok, fam) {
  const text = String(value);
  if (!tok) return quote(text, DEFAULT_QUOTE, '', fam);
  return quote(text, tok.q, tok.prefix ?? '', fam);
}

function quote(text, q, prefix, fam) {
  if (q.startsWith('[')) {
    let level = (q.match(/=/g) ?? []).length;
    while (text.includes(`]${'='.repeat(level)}]`)) level += 1;
    const eq = '='.repeat(level);
    return `[${eq}[${text}]${eq}]`;
  }
  if (q.startsWith('R"')) {
    const delim = q.slice(2, -1);
    return `${prefix}"${delim}(${text})${delim}"`;
  }
  if (q === '"""' || q === "'''") return `${prefix}${q}${text.replace(new RegExp(q, 'g'), q[0].repeat(2) + '\\' + q[0])}${q}`;
  if (fam === 'csharp' && prefix.includes('@')) return `${prefix}"${text.replace(/"/g, '""')}"`;
  const raw = fam === 'python' && /[rR]/.test(prefix);
  if (raw && !text.includes(q) && !text.endsWith('\\')) return `${prefix}${q}${text}${q}`;
  const p = raw ? prefix.replace(/[rR]/, '') : prefix;
  let body = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  body = body.split(q).join(`\\${q}`);
  if (q === '`') body = body.replace(/\$\{/g, '\\${');
  return `${p}${q}${body}${q}`;
}

/** A number written as `raw` was: hex stays hex for a whole number, decimals keep their count. */
export function numberText(n, raw = '', fam = 'javascript') {
  if (!Number.isFinite(n)) return String(n);
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  const r = String(raw ?? '');
  const suffix = /^0[xX]/.test(r) ? (/[uUlL]+$/.exec(r)?.[0] ?? '') : (/[fFdDmMlL]$/.exec(r)?.[0] ?? '');
  if (/^0[xX]/.test(r) && Number.isInteger(v)) {
    const digits = r.replace(/[uUlL]+$/, '').slice(2);
    const lower = /[a-f]/.test(digits) && !/[A-F]/.test(digits);
    const hex = v.toString(16).padStart(digits.length, '0');
    return `${sign}${r.slice(0, 2)}${lower ? hex : hex.toUpperCase()}${suffix}`;
  }
  const decimals = /\.(\d*)/.exec(r.replace(/[fFdDmMlL]$/, ''))?.[1]?.length ?? 0;
  let text;
  if (Number.isInteger(v) && decimals === 0) text = String(v);
  else {
    let k = decimals;
    while (k < 12 && Number(v.toFixed(k)) !== v) k += 1;
    text = v.toFixed(k);
  }
  if (/^[fF]$/.test(suffix) && !text.includes('.') && fam === 'cpp') text += '.0';
  return `${sign}${text}${suffix}`;
}

const WORDS_FOR = {
  true: { lua: 'true', python: 'True', default: 'true' },
  false: { lua: 'false', python: 'False', default: 'false' },
  null: { lua: 'nil', python: 'None', cpp: 'nullptr', default: 'null' },
};
const wordFor = (which, fam) => WORDS_FOR[which][fam] ?? WORDS_FOR[which].default;

function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
}

/** The text for `value`, written in the form the old literal `w.node` (over `w.toks` of `w.old`) has. */
function writeLiteral(value, w) {
  const { node, fam, toks, old } = w;
  if (isLiteral(node) && sameValue(valueOf(node), value)) return old;
  if (typeof value === 'string') return quoteLike(value, node.type === 'string' ? toks[node.tok] : null, fam);
  if (typeof value === 'number') {
    if (node.type === 'number') return numberText(value, node.raw, fam);
    return numberText(value, '', fam);
  }
  if (typeof value === 'boolean') return wordFor(value ? 'true' : 'false', fam);
  if (value === null || value === undefined) return wordFor('null', fam);
  if (Array.isArray(value)) {
    if ((node.type === 'list' || node.type === 'table') && node.entries.length === value.length && node.entries.every((e) => e.key === null)) {
      return spliceEntries(w, node.entries.map((e, i) => [e, value[i]]));
    }
    return listText(value, w);
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (node.type === 'table' && node.entries.length === keys.length && node.entries.every((e) => e.key !== null && Object.hasOwn(value, e.key))) {
      return spliceEntries(w, node.entries.map((e) => [e, value[e.key]]));
    }
    return tableText(value, w);
  }
  return null;
}

/** The old text with each entry's value rewritten where it changed: layout and comments stay. */
function spliceEntries(w, pairs) {
  const { toks, old } = w;
  let out = '';
  let at = 0;
  for (const [entry, value] of pairs) {
    const s = toks[entry.a].s;
    const e = toks[entry.b - 1].e;
    const next = writeLiteral(value, entryContext(w, entry));
    if (next === null) return null;
    out += old.slice(at, s) + next;
    at = e;
  }
  return out + old.slice(at);
}

/**
 * The brackets and spacing a written list or table uses, so a rebuilt one looks like it: the
 * language's own (Lua's `{ a, b }`, JavaScript's `[a, b]` and `{ k: v }`, Python's `[a, b]` and
 * `{"k": v}`), with the old one's padding inside the brackets and anything before them (C#'s new[]).
 */
function styleOf(w, listLike) {
  const { node, old, fam } = w;
  const braces = fam === 'lua' || fam === 'cpp' || fam === 'csharp' || fam === 'java' || !listLike;
  const open = braces ? '{' : '[';
  const close = braces ? '}' : ']';
  let pad = braces && fam !== 'python' && fam !== 'json' ? ' ' : '';
  let prefix = '';
  if ((node.type === 'list' || node.type === 'table') && node.entries.length) {
    const o = w.toks[node.open];
    const c = w.toks[node.close];
    prefix = old.slice(0, o.s);
    const inside = old.slice(o.e, c.s);
    pad = /^[ \t]/.test(inside) ? ' ' : '';
  }
  return { open, close, pad, prefix };
}

/** An entry's old literal, by index or key, for writing a new value in its form. */
function entryContext(w, entry) {
  if (!entry) return { ...w, old: '', toks: [], node: { type: 'computed' } };
  const s = w.toks[entry.a].s;
  const e = w.toks[entry.b - 1].e;
  const text = w.old.slice(s, e);
  const toks = tokenize(text, w.fam);
  const match = matchBrackets(toks);
  return { ...w, old: text, toks, match, node: literalOf(toks, 0, toks.length, w.fam, match) };
}

function listText(value, w) {
  const { open, close, pad, prefix } = styleOf(w, true);
  const olds = w.node.type === 'list' || w.node.type === 'table' ? w.node.entries.filter((e) => e.key === null) : [];
  const items = value.map((v, i) => writeLiteral(v, entryContext(w, olds[i] ?? olds[olds.length - 1] ?? null)));
  if (items.some((x) => x === null)) return null;
  return `${prefix}${open}${items.length ? pad : ''}${items.join(', ')}${items.length ? pad : ''}${close}`;
}

function keyText(key, w, oldEntry) {
  const fam = w.fam;
  if (fam === 'lua') {
    if (oldEntry?.keyStyle === 'bracket' || !IDENT.test(key) || LUA_WORDS.has(key)) return `[${quoteLike(key, oldEntry?.keyTok !== undefined ? w.toks[oldEntry.keyTok] : null, fam)}]`;
    return key;
  }
  if (fam === 'python' || fam === 'json') return quoteLike(key, oldEntry?.keyTok !== undefined ? w.toks[oldEntry.keyTok] : null, fam);
  if (oldEntry?.keyStyle === 'string' || !JS_IDENT.test(key)) return quoteLike(key, oldEntry?.keyTok !== undefined ? w.toks[oldEntry.keyTok] : null, fam);
  return key;
}

function tableText(value, w) {
  const { pad, prefix } = styleOf(w, false);
  const olds = w.node.type === 'table' ? w.node.entries.filter((e) => e.key !== null) : [];
  const assign = w.fam === 'lua' ? ' = ' : ': ';
  const items = Object.entries(value).map(([k, v]) => {
    const oldEntry = olds.find((e) => e.key === k) ?? null;
    const text = writeLiteral(v, entryContext(w, oldEntry));
    return text === null ? null : `${keyText(k, w, oldEntry)}${assign}${text}`;
  });
  if (items.some((x) => x === null)) return null;
  const p = items.length ? pad : '';
  return `${prefix}{${p}${items.join(', ')}${p}}`;
}

/* --------------------------------------------------------------------------- write: envelopes */

/** The text range of tokens [a, b) of the old literal, as offsets into w.old. */
const spanOf = (w, a, b) => ({ s: w.toks[a].s, e: w.toks[b - 1].e });

/** A point entry's x and y entries, where its reader finds them (animEnvelope's envelopePointParts):
 *  a pair's first two items, a table's x and y keys, else its numbered items (Lua's { 0, 1, curve = … }),
 *  else the entries it numbers itself, counted from 0 when it has an entry 0 and from 1 when it does
 *  not ({ 0: 0, 1: 1 }, Lua's { [0] = 0, [1] = 1 }). Those were read as a point and found no entry
 *  here, so the row offered them to edit and an edit wrote nothing. */
function pointCoordinateEntries(entry) {
  const node = entry?.node;
  if (!node || (node.type !== 'list' && node.type !== 'table')) return null;
  const items = node.entries.filter((e) => e.key === null);
  const keyed = (k) => node.entries.find((e) => e.key === k) ?? null;
  const from = keyed('0') ? 0 : 1;
  return {
    x: keyed('x') ?? items[0] ?? keyed(String(from)) ?? null,
    y: keyed('y') ?? items[1] ?? keyed(String(from + 1)) ?? null,
  };
}

/** The text for one coordinate: the number in the form it was written in (text stays text). */
function coordinateText(w, entry, value) {
  const { node } = entry;
  const span = spanOf(w, entry.a, entry.b);
  const old = w.old.slice(span.s, span.e);
  if (node.type === 'number') return node.value === value ? old : numberText(value, node.raw, w.fam);
  if (node.type === 'string') {
    const was = Number(node.value);
    return was === value ? old : quoteLike(numberText(value, node.value.trim(), w.fam), w.toks[node.tok], w.fam);
  }
  return numberText(value, '', w.fam);
}

/** The text of point `entry` with its x and y written as `x` and `y`, the rest of it as it was. */
function pointText(w, entry, x, y) {
  const span = spanOf(w, entry.a, entry.b);
  const coords = pointCoordinateEntries(entry);
  if (!coords?.x || !coords?.y) return null;
  const edits = [[coords.x, x], [coords.y, y]].map(([e, v]) => ({ ...spanOf(w, e.a, e.b), text: coordinateText(w, e, v) }))
    .sort((p, q) => p.s - q.s);
  let out = '';
  let at = span.s;
  for (const edit of edits) { out += w.old.slice(at, edit.s) + edit.text; at = edit.e; }
  return out + w.old.slice(at, span.e);
}

function writeEnvelope(newValue, w) {
  const { node } = w;
  if (!Array.isArray(newValue) || (node.type !== 'list' && node.type !== 'table')) return null;
  const entries = node.entries.filter((e) => e.key === null);
  if (!entries.length) return null;
  const sameCount = newValue.length === entries.length;
  const next = [];
  for (const [k, item] of newValue.entries()) {
    const parts = envelopePointParts(item);
    const x = realNumber(parts?.x);
    const y = realNumber(parts?.y);
    if (x === undefined || y === undefined) return null;
    const from = !parts.pair && Number.isInteger(item.from) ? item.from : (sameCount ? k : null);
    if (from !== null && (from < 0 || from >= entries.length)) return null;
    next.push({ x, y, from });
  }
  // A new point is a copy of the written point after it, or of the last one when it is last.
  const texts = next.map((p, k) => {
    if (p.from !== null) return pointText(w, entries[p.from], p.x, p.y);
    const after = next.slice(k + 1).find((q) => q.from !== null);
    const before = [...next.slice(0, k)].reverse().find((q) => q.from !== null);
    const like = entries[(after ?? before)?.from ?? entries.length - 1];
    return pointText(w, like, p.x, p.y);
  });
  if (texts.some((t) => t === null)) return null;
  const first = spanOf(w, entries[0].a, entries[0].b);
  const last = spanOf(w, entries[entries.length - 1].a, entries[entries.length - 1].b);
  // What stood between each written point and the next: a comma, the spaces, a comment, a line
  // break and its indent. Each point keeps the one that followed it, so a comment stays with the
  // point it was written after, and goes with it. A point that had none (the last, or a new one)
  // takes the first one's comma and line break without its comment.
  const seps = entries.slice(0, -1).map((e, i) => w.old.slice(spanOf(w, e.a, e.b).e, spanOf(w, entries[i + 1].a, entries[i + 1].b).s));
  const lineBreak = (sep) => sep.lastIndexOf('\n');
  const plain = seps.length ? (lineBreak(seps[0]) >= 0 ? `,${seps[0].slice(lineBreak(seps[0]))}` : seps[0]) : ', ';
  let out = w.old.slice(0, first.s) + texts[0];
  for (let k = 1; k < texts.length; k += 1) {
    const prev = next[k - 1].from;
    out += (prev !== null && prev < seps.length ? seps[prev] : plain) + texts[k];
  }
  let tail = w.old.slice(last.e);
  // The last point taken out, from a list written a point a line: the one now last keeps the
  // comment on its line, and the line break before the closing bracket is the old last point's.
  // A comma after the last point stays where the list had one, and is not added where it had none.
  const nowLast = next[next.length - 1].from;
  if (nowLast !== null && nowLast < seps.length && lineBreak(seps[nowLast]) >= 0) {
    const head = seps[nowLast].slice(0, lineBreak(seps[nowLast]));
    const trailing = /^[ \t]*,/;
    if (trailing.test(tail)) { out += head; tail = tail.replace(trailing, ''); } else out += head.replace(/^([ \t]*),/, '$1');
  }
  return out + tail;
}

/* --------------------------------------------------------------------------- write: gradients */

/** A gradient to write, from the Gradient tab's object: { stops: [{ at, colour, opacity }], angle }. */
function gradientToWrite(value) {
  const stops = Array.isArray(value?.stops) ? value.stops : null;
  if (!stops) return null;
  const out = [];
  for (const s of stops) {
    const colour = colourToWrite(s?.colour ?? s?.color);
    if (!colour) return null;
    const at = Number.isFinite(Number(s?.at)) ? Number(s.at)
      : Number.isFinite(Number(s?.position)) ? Number(s.position) / 100 : null;
    out.push({ at, colour, opacity: Number.isFinite(Number(s?.opacity)) ? Number(s.opacity) : undefined });
  }
  out.forEach((s, i) => { if (s.at === null) s.at = out.length === 1 ? 0 : i / (out.length - 1); });
  return { stops: out, angle: Number.isFinite(Number(value?.angle)) ? Number(value.angle) : undefined };
}

const near = (a, b) => Math.abs(a - b) < 1e-6;

function writeDrawGradient(src, arg, newValue, w) {
  const next = gradientToWrite(newValue);
  if (!next) return null;
  const m = arg.meaning ?? {};
  const oldStops = m.stops ?? [];
  const angleRange = m.angleRange ?? null;
  const end = angleRange ? angleRange.end : arg.range.end;
  const keepAngle = next.angle === undefined ? (m.angle ?? undefined) : next.angle;
  // Nothing changed: the text as it is.
  const same = oldStops.length === next.stops.length && next.stops.every((s, i) => {
    const o = oldStops[i];
    const parts = o.css ? cssParts(o.css) : null;
    return parts && parts.rgb === s.colour.rgb && parts.alphaByte === s.colour.alphaByte && near(o.at, s.at)
      && (s.opacity === undefined || near(s.opacity, o.opacity ?? 1));
  }) && (keepAngle === undefined ? m.angle === null || m.angle === undefined : keepAngle === (m.angle ?? 180));
  if (same) return { start: arg.range.start, end, text: src.slice(arg.range.start, end) };

  // Each new stop takes the old one it most likely is: by place when the count is the same, else
  // the same colour, else the nearest position.
  const entries = (w.node.type === 'list' || w.node.type === 'table') ? w.node.entries.filter((e) => e.key === null || /^\d+$/.test(e.key)) : [];
  const used = new Set();
  const matchOf = (stop, i) => {
    if (entries.length === next.stops.length) return i;
    let best = -1;
    let bestD = Infinity;
    oldStops.forEach((o, k) => {
      if (used.has(k)) return;
      const parts = o.css ? cssParts(o.css) : null;
      const d = (parts && parts.rgb === stop.colour.rgb ? 0 : 1) + Math.abs((o.at ?? 0) - stop.at);
      if (d < bestD) { best = k; bestD = d; }
    });
    if (best >= 0 && (bestD < 1 || entries.length > next.stops.length)) { used.add(best); return best; }
    return -1;
  };
  const n = next.stops.length;
  const evenly = n >= 2 && next.stops.every((s, i) => near(s.at, i / (n - 1)));
  const withOpacity = next.stops.map((s, i) => {
    const k = matchOf(s, i);
    return { ...s, old: k >= 0 ? k : null, opacity: s.opacity !== undefined ? s.opacity : (k >= 0 ? oldStops[k]?.opacity : undefined) };
  });
  const bare = evenly && withOpacity.every((s) => s.opacity === undefined);
  const firstColourTok = (k) => {
    const e = entries[k];
    if (!e) return null;
    if (e.node.type === 'string') return { tok: w.toks[e.node.tok], text: e.node.value };
    if (e.node.type === 'table') {
      const c = e.node.entries.find((x) => x.key === 'colour' || x.key === 'color');
      if (c?.node.type === 'string') return { tok: w.toks[c.node.tok], text: c.node.value, key: c.key };
    }
    return null;
  };
  const template = entries.map((_, k) => firstColourTok(k)).find(Boolean) ?? null;
  const fam = w.fam;
  const stopTexts = withOpacity.map((s) => {
    const like = (s.old !== null ? firstColourTok(s.old) : null) ?? template;
    const colourInner = colourText(like?.text ?? '#000000', 'drawing', s.colour);
    const colour = quoteLike(colourInner, like?.tok ?? null, fam);
    if (bare) return colour;
    const key = like?.key ?? template?.key ?? 'colour';
    const at = numberText(Number(s.at.toFixed(4)), '', fam);
    const parts = [['at', at], [key, colour]];
    if (s.opacity !== undefined) parts.push(['opacity', numberText(Number(s.opacity.toFixed(4)), '', fam)]);
    if (fam === 'lua') return `{ ${parts.map(([k, v]) => `${k} = ${v}`).join(', ')} }`;
    if (fam === 'python') {
      const q = like?.tok?.q && !like.tok.q.startsWith('[') ? like.tok.q : DEFAULT_QUOTE;
      return `{${parts.map(([k, v]) => `${q}${k}${q}: ${v}`).join(', ')}}`;
    }
    return `{ ${parts.map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
  });
  const { open, close, pad, prefix } = styleOf(w, true);
  const lineStart = src.lastIndexOf('\n', arg.range.start - 1) + 1;
  const lineEndAt = src.indexOf('\n', end);
  const before = src.slice(lineStart, arg.range.start);
  const after = src.slice(end, lineEndAt < 0 ? src.length : lineEndAt);
  const indent = /^[ \t]*/.exec(before)[0];
  let angleText = '';
  if (angleRange) angleText = src.slice(arg.range.end, angleRange.start) + numberText(keepAngle ?? 180, (m.angle !== null && arg.meaning?.angleWritten) ? src.slice(angleRange.start, angleRange.end) : '', fam);
  else if (keepAngle !== undefined && keepAngle !== 180) angleText = `, ${numberText(keepAngle, '', fam)}`;
  const oneLine = `${prefix}${open}${pad}${stopTexts.join(', ')}${pad}${close}`;
  const multi = w.old.includes('\n');
  // One line while it fits in 100 characters, or in the line the script already had, if longer.
  const width = Math.max(100, before.length + src.slice(arg.range.start, end).length + after.length);
  let stopsText = oneLine;
  if (multi || (before + oneLine + angleText + after).length > width) {
    const inner = `${indent}  ${stopTexts.join(', ')},`;
    stopsText = inner.length <= 100
      ? `${prefix}${open}\n${inner}\n${indent}${close}`
      : `${prefix}${open}\n${stopTexts.map((t) => `${indent}  ${t},`).join('\n')}\n${indent}${close}`;
  }
  return { start: arg.range.start, end, text: stopsText + angleText };
}

/** A stored gradient (the panel file's), rewritten whole in the file's own layout. */
function writeStoredGradient(src, arg, newValue, w) {
  if (!newValue || typeof newValue !== 'object' || !Array.isArray(newValue.stops)) return null;
  const oldValue = arg.value && typeof arg.value === 'object' ? arg.value : {};
  // A stored stop is { color: RRGGBB, position: 0..100 } and nothing else: no alpha and no opacity
  // of its own (the fill's gradientOpacity is the whole gradient's), so a stop asking for either is
  // refused rather than quietly flattened. Its keys keep the order the file had them in.
  const oldStops = Array.isArray(oldValue.stops) ? oldValue.stops : [];
  const order = Object.keys(oldStops[0] ?? {}).filter((k) => k === 'color' || k === 'position');
  const keys = order.length === 2 ? order : ['color', 'position'];
  const stops = [];
  for (const [i, s] of newValue.stops.entries()) {
    if (!s || typeof s !== 'object') return null;
    const colour = colourToWrite(s.color ?? s.colour);
    if (!colour || colour.alphaByte < 255) return null;
    if (s.opacity !== undefined && s.opacity !== null && Number(s.opacity) < 1) return null;
    const at = Number.isFinite(Number(s.position)) ? Number(s.position)
      : Number.isFinite(Number(s.at)) ? Number((Number(s.at) * 100).toFixed(2))
        : (newValue.stops.length > 1 ? Number(((i / (newValue.stops.length - 1)) * 100).toFixed(2)) : 0);
    const old = oldStops[i] && typeof oldStops[i] === 'object' ? oldStops[i] : {};
    // A colour the old stop already had, as it was written there (its case, say).
    const same = colourToWrite(old.color);
    const color = same && same.rgb === colour.rgb && same.alphaByte === colour.alphaByte ? old.color : colourText('', 'stop', colour);
    const stop = {};
    for (const k of keys) stop[k] = k === 'color' ? color : at;
    for (const [k, v] of Object.entries(old)) if (!Object.hasOwn(stop, k)) stop[k] = v;
    stops.push(stop);
  }
  const { stops: _ignored, ...rest } = newValue;
  const merged = {};
  for (const k of Object.keys(oldValue)) merged[k] = k === 'stops' ? stops : rest[k] !== undefined ? rest[k] : oldValue[k];
  for (const k of Object.keys(rest)) if (!Object.hasOwn(merged, k) && rest[k] !== undefined) merged[k] = rest[k];
  if (!Object.hasOwn(merged, 'stops')) merged.stops = stops;
  if (sameValue(oldValue, merged)) return { start: arg.range.start, end: arg.range.end, text: w.old };
  const lineStart = src.lastIndexOf('\n', arg.range.start - 1) + 1;
  const indent = /^[ \t]*/.exec(src.slice(lineStart, arg.range.start))[0];
  const text = formatJson(merged, { width: Math.max(40, 100 - indent.length) }).split('\n').map((l, i) => (i ? indent + l : l)).join('\n');
  return { start: arg.range.start, end: arg.range.end, text };
}
