// ce.format — a value as the text a person reads, and typed text back as a value.
//
// Design record: docs/design/ce-format-module.md. Every function here is pure and sends nothing, and
// each has a line-for-line twin in the Lua, JavaScript and Python preludes (LuaScriptEngine.cpp,
// JsScriptEngine.cpp, PythonScriptEngine.cpp, `@module ce.format`). The point of the module is the
// SAME TEXT in every language, so nothing here leans on the language's own number formatting:
// rounding is half away from zero and written out digit by digit (fixedText), and the only
// conversions used are ones every language does identically for whole numbers below 2^53.
// test/formatParity.test.js runs one table of inputs and expected text through all four.
//
// `say(level, text)` is how a command reports a rejected argument ('error') or a value past the end
// of a table ('warn'); the runtime binds it to its console.

export const FORMAT_PLACEHOLDER = '--';

// The note lengths division() names, in the order it tries them (the panel's own vocabulary,
// utils/transportLayout.js DIVISIONS; a tie goes to the earlier one).
export const FORMAT_DIVISIONS = [
  ['1/1', 4], ['1/2', 2], ['1/4', 1], ['1/8', 0.5], ['1/16', 0.25], ['1/32', 0.125],
  ['1/2D', 3], ['1/4D', 1.5], ['1/8D', 0.75], ['1/16D', 0.375],
  ['1/2T', 4 / 3], ['1/4T', 2 / 3], ['1/8T', 1 / 3], ['1/16T', 1 / 6],
];

// fit()'s first step: the words a synth's display shortens, and how.
export const FORMAT_ABBREVIATIONS = [
  ['Amount', 'Amt'], ['Attack', 'Atk'], ['Balance', 'Bal'], ['Bandwidth', 'BW'], ['Channel', 'Ch'],
  ['Chorus', 'Chor'], ['Coarse', 'Crs'], ['Control', 'Ctrl'], ['Controller', 'Ctrl'], ['Decay', 'Dcy'],
  ['Delay', 'Dly'], ['Depth', 'Dpth'], ['Destination', 'Dest'], ['Distortion', 'Dist'], ['Effect', 'FX'],
  ['Effects', 'FX'], ['Envelope', 'Env'], ['Feedback', 'Fdbk'], ['Frequency', 'Freq'], ['Keyboard', 'Kbd'],
  ['Length', 'Len'], ['Level', 'Lvl'], ['Master', 'Mstr'], ['Maximum', 'Max'], ['Minimum', 'Min'],
  ['Modulation', 'Mod'], ['Number', 'Num'], ['Octave', 'Oct'], ['Oscillator', 'Osc'], ['Parameter', 'Param'],
  ['Pattern', 'Pat'], ['Portamento', 'Porta'], ['Position', 'Pos'], ['Pressure', 'Press'], ['Program', 'Prog'],
  ['Random', 'Rnd'], ['Release', 'Rel'], ['Resonance', 'Reso'], ['Reverb', 'Rvb'], ['Sample', 'Smp'],
  ['Semitone', 'Semi'], ['Sequence', 'Seq'], ['Sequencer', 'Seq'], ['Source', 'Src'], ['Sustain', 'Sus'],
  ['Transpose', 'Trans'], ['Tremolo', 'Trem'], ['Velocity', 'Vel'], ['Vibrato', 'Vib'], ['Volume', 'Vol'],
  ['Waveform', 'Wave'], ['Width', 'Wdth'],
];

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/* ---------------------------------------------------------------- the shared arithmetic */

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A number, or text that is one ("440"), else NaN. Never a boolean. */
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_TEXT.test(v.trim())) return Number(v.trim());
  return NaN;
}

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

function optNumber(opts, key, fallback) {
  const v = toNumber(opt(opts, key));
  return Number.isFinite(v) ? v : fallback;
}

function clampInt(v, lo, hi) {
  const r = Math.floor(v + 0.5);
  return r < lo ? lo : r > hi ? hi : r;
}

/** Half away from zero, to `d` decimals, written digit by digit. */
function fixedText(x, d) {
  const neg = x < 0;
  const p = 10 ** d;
  const r = Math.floor(Math.abs(x) * p + 0.5 + 1e-9);
  let s = r.toFixed(0);
  while (s.length < d + 1) s = '0' + s;
  const body = d > 0 ? s.slice(0, s.length - d) + '.' + s.slice(s.length - d) : s;
  return (neg && r !== 0 ? '-' : '') + body;
}

/** How many decimals `digits` significant digits of `a` (>= 0) need, 0 to 6. */
function significantDecimals(a, digits) {
  if (a === 0) return 0;
  let e = Math.floor(Math.log10(a));
  if (10 ** (e + 1) <= a) e += 1;
  if (10 ** e > a) e -= 1;
  const d = digits - 1 - e;
  return d < 0 ? 0 : d > 6 ? 6 : d;
}

function stripZeros(s) {
  if (s.indexOf('.') < 0) return s;
  let t = s;
  while (t.endsWith('0')) t = t.slice(0, -1);
  if (t.endsWith('.')) t = t.slice(0, -1);
  return t;
}

/** The number part of every command: `decimals` exactly, else `fallback` decimals, else significant digits. */
function numberText(v, opts, fallback) {
  const decimals = toNumber(opt(opts, 'decimals'));
  let s;
  if (Number.isFinite(decimals)) s = fixedText(v, clampInt(decimals, 0, 6));
  else if (fallback !== undefined) s = fixedText(v, fallback);
  else s = stripZeros(fixedText(v, significantDecimals(Math.abs(v), clampInt(optNumber(opts, 'digits', 3), 1, 6))));
  if (s === '-0') s = '0';
  if (opt(opts, 'sign') === 'always' && !s.startsWith('-') && /[1-9]/.test(s)) s = '+' + s;
  return s;
}

function withUnit(text, unit, opts) {
  const u = opt(opts, 'unit');
  if (u === false) return text;
  const name = typeof u === 'string' ? u : unit;
  if (!name) return text;
  const space = opt(opts, 'space') === false || (name === '%' && typeof u !== 'string') ? '' : ' ';
  return text + space + name;
}

/** The rules every command ends with: the typographic minus when asked, and the width. */
function finish(text, opts) {
  let t = text;
  if (opt(opts, 'unicode') === true && t.startsWith('-')) t = '\u2212' + t.slice(1);
  const width = toNumber(opt(opts, 'width'));
  if (Number.isFinite(width)) {
    const w = clampInt(width, 0, 200);
    while (t.length < w) t = ' ' + t;
  }
  return t;
}

function placeholder(opts) {
  const p = opt(opts, 'placeholder');
  return typeof p === 'string' ? p : FORMAT_PLACEHOLDER;
}

/* ------------------------------------------------------------------------------- units */

export function formatNumber(v, opts, say) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(opts);
  void say;
  return finish(withUnit(numberText(n, opts), '', opts), opts);
}

function scaled(v, opts, say, verb, small, large, factor, what) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(opts);
  if (n < 0) {
    say('error', `ce.format.${verb}: ${what} below 0 is not one, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const scale = String(opt(opts, 'scale') ?? 'auto').toLowerCase();
  const big = scale === large.toLowerCase() || (scale !== small.toLowerCase() && n >= factor);
  return finish(withUnit(numberText(big ? n / factor : n, opts), big ? large : small, opts), opts);
}

export function formatHz(v, opts, say) {
  return scaled(v, opts, say, 'hz', 'Hz', 'kHz', 1000, 'a frequency');
}

export function formatTime(ms, opts, say) {
  return scaled(ms, opts, say, 'time', 'ms', 's', 1000, 'a duration');
}

export function formatDb(v, opts, say) {
  void say;
  let n = toNumber(v);
  if (Number.isNaN(n)) return placeholder(opts);
  if (opt(opts, 'fromGain') === true) {
    n = n <= 0 ? -144 : 20 * Math.log10(n);
    if (n < -144) n = -144;
  }
  const floor = optNumber(opts, 'floor', -144);
  let text;
  if (n <= floor) text = opt(opts, 'unicode') === true ? '-\u221e' : '-inf';
  else if (n === Infinity) text = opt(opts, 'unicode') === true ? '\u221e' : 'inf';
  else text = numberText(n, opts, 1);
  return finish(withUnit(text, 'dB', opts), opts);
}

export function formatPercent(v, opts, say) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(opts);
  const min = optNumber(opts, 'min', 0);
  const max = optNumber(opts, 'max', 1);
  if (max === min) {
    say('error', `ce.format.percent: min and max are the same, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  return finish(withUnit(numberText(((n - min) / (max - min)) * 100, opts, 0), '%', opts), opts);
}

export function formatPan(v, opts, say) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(opts);
  const custom = opt(opts, 'min') !== undefined || opt(opts, 'max') !== undefined;
  const min = optNumber(opts, 'min', -1);
  const max = optNumber(opts, 'max', 1);
  if (max === min) {
    say('error', `ce.format.pan: min and max are the same, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const center = optNumber(opts, 'center', (min + max) / 2);
  const steps = optNumber(opts, 'steps', 50);
  const amount = custom ? n - center : ((n - center) / ((max - min) / 2)) * steps;
  const t = numberText(Math.abs(amount), { decimals: opt(opts, 'decimals') }, 0);
  if (!/[1-9]/.test(t)) return finish('C', opts);
  const left = amount < 0;
  const style = String(opt(opts, 'style') ?? 'L50');
  let text;
  if (style === '50L') text = t + (left ? 'L' : 'R');
  else if (style === '<50') text = (left ? '<' : '>') + t;
  else if (style === '50>') text = t + (left ? '<' : '>');
  else text = (left ? 'L' : 'R') + t;
  return finish(text, opts);
}

export function formatRatio(v, opts, say) {
  const n = toNumber(v);
  if (Number.isNaN(n)) return placeholder(opts);
  if (n <= 0) {
    say('error', `ce.format.ratio: a ratio must be above 0, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const x = opt(opts, 'style') === 'x';
  let text;
  if (n === Infinity) text = opt(opts, 'unicode') === true ? '\u221e' : 'inf';
  else text = numberText(n, opts, x ? 2 : undefined);
  return finish(x ? 'x' + text : text + ':1', opts);
}

function pad2(n) {
  const s = n.toFixed(0);
  return s.length < 2 ? '0' + s : s;
}

export function formatClock(ms, opts, say) {
  void say;
  const n = toNumber(ms);
  if (!Number.isFinite(n)) return placeholder(opts);
  const d = clampInt(optNumber(opts, 'decimals', 1), 0, 3);
  const p = 10 ** d;
  // Cut, not rounded: a clock shows the tenth that has passed, never one still to come.
  const units = Math.floor((Math.abs(n) * p) / 1000 + 1e-9);
  const secs = Math.floor(units / p);
  const frac = units - secs * p;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  let text = h > 0 || opt(opts, 'hours') === true
    ? h.toFixed(0) + ':' + pad2(m) + ':' + pad2(s)
    : m.toFixed(0) + ':' + pad2(s);
  if (d > 0) {
    let f = frac.toFixed(0);
    while (f.length < d) f = '0' + f;
    text += '.' + f;
  }
  return finish((n < 0 && units > 0 ? '-' : '') + text, opts);
}

/* ------------------------------------------------------------------------------- music */

export function formatNote(n, opts, say) {
  const v = toNumber(n);
  if (!Number.isFinite(v)) return placeholder(opts);
  const note = v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5);
  if (note < 0 || note > 127) {
    say('error', `ce.format.note: a MIDI note is 0 to 127, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const middleC = clampInt(optNumber(opts, 'middleC', 4), -2, 9);
  let name = (opt(opts, 'flats') === true ? FLATS : SHARPS)[note % 12];
  if (opt(opts, 'unicode') === true) name = name.slice(0, 1) + name.slice(1).replace('#', '\u266f').replace('b', '\u266d');
  if (opt(opts, 'octave') === false) return finish(name, { width: opt(opts, 'width') });
  const octave = Math.floor(note / 12) - 5 + middleC;
  return finish(name + octave.toFixed(0), { width: opt(opts, 'width') });
}

export function formatDivision(beats, opts, say) {
  const n = toNumber(beats);
  if (!Number.isFinite(n)) return placeholder(opts);
  if (n <= 0) {
    say('error', `ce.format.division: a length must be above 0 beats, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const tolerance = Math.min(0.5, Math.max(0, optNumber(opts, 'tolerance', 0.02)));
  let best = null;
  let bestError = Infinity;
  for (const [name, b] of FORMAT_DIVISIONS) {
    const error = Math.abs(n - b) / b;
    if (error < bestError) { best = name; bestError = error; }
  }
  if (bestError <= tolerance + 1e-12) return finish(best, opts);
  return finish(numberText(n, opts) + ' beats', opts);
}

/* --------------------------------------------------------------------- lookup tables */

/** A list, or a table of `{ upTo, text }` ranges. `list` is a JS array here; the preludes take their
    language's own list (a Lua table read from 1, a Python list). */
export function formatTable(v, list, opts, say) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(opts);
  if (!Array.isArray(list) || list.length === 0) {
    say('error', `ce.format.table: the table must be a list of texts, or of { upTo, text } ranges, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const first = list[0];
  if (first && typeof first === 'object' && first.upTo !== undefined) {
    for (const entry of list) {
      const upTo = toNumber(entry?.upTo);
      if (Number.isFinite(upTo) && n <= upTo) return finish(asText(entry.text), opts);
    }
    say('warn', `ce.format.table: ${numberText(n, {})} is past the last range, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  const start = Math.floor(optNumber(opts, 'start', 0) + 0.5);
  const index = (n < 0 ? -Math.floor(-n + 0.5) : Math.floor(n + 0.5)) - start;
  if (index < 0 || index >= list.length) {
    say('warn', `ce.format.table: ${numberText(n, {})} is past the end of the table, so "${placeholder(opts)}" is shown.`);
    return placeholder(opts);
  }
  return finish(asText(list[index]), opts);
}

/* -------------------------------------------------------------- as the synth shows it */

/** The options a command gets from a profile `display`, before the call's own (which win). */
function describedOptions(d, kind, opts) {
  const o = {};
  const precision = toNumber(d.precision);
  if (Number.isFinite(precision)) o.decimals = precision;
  if (typeof d.unit === 'string' && d.unit !== '' && (kind === '' || kind === 'number')) o.unit = d.unit;
  const middleC = toNumber(d.middleC);
  if (Number.isFinite(middleC)) o.middleC = middleC;
  if (opts && typeof opts === 'object') {
    for (const key of Object.keys(opts)) if (key !== 'role') o[key] = opts[key];
  }
  return o;
}

function withOptions(base, extra) {
  const o = {};
  for (const key of Object.keys(base)) o[key] = base[key];
  for (const key of Object.keys(extra)) if (o[key] === undefined) o[key] = extra[key];
  return o;
}

/**
 * A parameter's value as the synth's display writes it, from the parameter as the device profile
 * describes it (`ce.device.parameter(id)`): its choices, `display.table`, `display.min`/`max` over
 * `range`, `display.format`, `display.unit`, `display.precision`, and `display.middleC`.
 * ce.format.parameter is this after the lookup; the panel's readouts use it for a bound control.
 */
export function formatDescribed(desc, v, opts, say) {
  const p = desc && typeof desc === 'object' ? desc : {};
  const d = p.display && typeof p.display === 'object' ? p.display : {};
  const kind = typeof d.format === 'string' ? d.format : '';
  const o = describedOptions(d, kind, opts);

  if (d.mode === 'text' || p.type === 'text') return finish(asText(v), o);

  if (Array.isArray(p.choices)) {
    const wanted = toNumber(v);
    for (const c of p.choices) {
      if (!c || typeof c !== 'object') continue;
      const value = toNumber(c.value);
      if ((Number.isFinite(wanted) && value === wanted) || (typeof v === 'string' && c.id === v)) {
        return finish(asText(c.label !== undefined && c.label !== null ? c.label : c.id), o);
      }
    }
  }

  const n = toNumber(v);
  if (!Number.isFinite(n)) return placeholder(o);
  const range = p.range && typeof p.range === 'object' ? p.range : {};
  const lo = toNumber(range.min);
  const hi = toNumber(range.max);
  const wireMin = Number.isFinite(lo) ? lo : 0;
  const wireMax = Number.isFinite(hi) ? hi : 127;

  // A list's first entry is for the lowest stored value, as a synth's manual lists them.
  if (Array.isArray(d.table) && d.table.length > 0) return formatTable(n, d.table, withOptions(o, { start: wireMin }), say);

  const dmin = toNumber(d.min);
  const dmax = toNumber(d.max);
  const scaled = Number.isFinite(dmin) && Number.isFinite(dmax) && wireMax !== wireMin;
  const shown = scaled ? dmin + ((n - wireMin) / (wireMax - wireMin)) * (dmax - dmin) : n;

  if (kind === 'hz') return formatHz(shown, o, say);
  if (kind === 'time') return formatTime(shown, o, say);
  if (kind === 'db') return formatDb(shown, o, say);
  if (kind === 'ratio') return formatRatio(shown, o, say);
  if (kind === 'note') return formatNote(shown, o, say);
  if (kind === 'division') return formatDivision(shown, o, say);
  // How far along the stored range, so it needs no display range of its own.
  if (kind === 'percent') return formatPercent(n, withOptions(o, { min: wireMin, max: wireMax }), say);
  if (kind === 'pan') {
    const a = scaled ? dmin : wireMin;
    const b = scaled ? dmax : wireMax;
    const center = a < 0 && b > 0 ? 0 : Math.floor((a + b) / 2 + 0.5);
    return formatPan(shown, withOptions(o, { min: a, max: b, center }), say);
  }
  return formatNumber(shown, o, say);
}

/** What a command shows for a value it cannot write: the call's `placeholder`, else "--". */
export function formatPlaceholderFor(opts) {
  return placeholder(opts);
}

/* ------------------------------------------------------------------- fitting a display */

/** Text as given; a number written by numberText, never by the language (Lua writes 2 as "2.0"). */
function asText(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? numberText(v, {}) : FORMAT_PLACEHOLDER;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v === undefined || v === null ? '' : String(v);
}

function abbreviationMap(extra) {
  const map = new Map();
  for (const [word, short] of FORMAT_ABBREVIATIONS) map.set(word.toLowerCase(), short);
  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) map.set(key.toLowerCase(), String(extra[key]));
  }
  return map;
}

const VOWELS = 'aeiouAEIOU';

function shorten(text, width, steps, extra) {
  if (text.length <= width) return text;
  let words = text.split(' ').filter((w) => w !== '');
  const join = () => words.join(' ');
  if (steps >= 1) {
    const map = abbreviationMap(extra);
    words = words.map((w) => (map.has(w.toLowerCase()) ? map.get(w.toLowerCase()) : w));
    if (join().length <= width) return join();
  }
  if (steps >= 2) {
    while (join().length > width) {
      let pick = -1;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        let removable = false;
        for (let k = 1; k < w.length; k++) if (VOWELS.includes(w[k])) removable = true;
        if (removable && (pick < 0 || w.length > words[pick].length)) pick = i;
      }
      if (pick < 0) break;
      const w = words[pick];
      let k = w.length - 1;
      while (k >= 1 && !VOWELS.includes(w[k])) k -= 1;
      words[pick] = w.slice(0, k) + w.slice(k + 1);
    }
    if (join().length <= width) return join();
  }
  if (steps >= 3) {
    while (join().length > width && words.length > 1) {
      const last = words.pop();
      words[words.length - 1] += last;
    }
    if (join().length <= width) return join();
  }
  return join().slice(0, width);
}

function padTo(text, width, align) {
  let t = text;
  if (align === 'right') { while (t.length < width) t = ' ' + t; return t; }
  if (align === 'center') {
    const before = Math.floor((width - t.length) / 2);
    for (let i = 0; i < before; i++) t = ' ' + t;
  }
  while (t.length < width) t += ' ';
  return t;
}

export function formatFit(text, width, opts, say) {
  const w = toNumber(width);
  if (!Number.isFinite(w) || w < 1) {
    say('error', 'ce.format.fit: the width must be 1 character or more, so nothing is shown.');
    return '';
  }
  const width0 = Math.floor(w);
  const steps = clampInt(optNumber(opts, 'steps', 4), 1, 4);
  const short = shorten(asText(text), width0, steps, opt(opts, 'abbreviations'));
  if (opt(opts, 'pad') === false) return short;
  return padTo(short, width0, String(opt(opts, 'align') ?? 'left'));
}

export function formatLine(left, right, width, opts, say) {
  const w = toNumber(width);
  if (!Number.isFinite(w) || w < 1) {
    say('error', 'ce.format.line: the width must be 1 character or more, so nothing is shown.');
    return '';
  }
  const width0 = Math.floor(w);
  const gap = clampInt(optNumber(opts, 'gap', 1), 0, width0);
  const r = asText(right);
  // The value is never shortened: a wrong-looking value is worse than a short name. Too wide for the
  // line, its end, where the unit is, stays.
  if (r.length >= width0) return r.slice(r.length - width0);
  const room = width0 - gap - r.length;
  if (room <= 0) return padTo(r, width0, 'right');
  let l = asText(left);
  if (l.length > room) l = shorten(l, room, 4, opt(opts, 'abbreviations'));
  let spaces = '';
  while (l.length + spaces.length + r.length < width0) spaces += ' ';
  return l + spaces + r;
}

/* ------------------------------------------------------------------- reading typed text */

const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function readNumber(s) {
  if (s === 'inf' || s === '+inf') return Infinity;
  if (s === '-inf') return -Infinity;
  return PLAIN_NUMBER.test(s) ? Number(s) : NaN;
}

const UNIT_SUFFIXES = [['khz', 'hz', 1000], ['hz', 'hz', 1], ['ms', 'time', 1], ['db', 'db', 1],
  ['%', 'percent', 0.01], ['s', 'time', 1000], ['k', '', 1000]];

function parseNote(s, opts) {
  const letter = s.slice(0, 1);
  if (!(letter in NOTE_BASE)) return NaN;
  let rest = s.slice(1);
  let pc = NOTE_BASE[letter];
  if (rest.startsWith('#')) { pc += 1; rest = rest.slice(1); } else if (rest.startsWith('b') && rest.length > 1) { pc -= 1; rest = rest.slice(1); }
  if (!/^-?\d+$/.test(rest)) return NaN;
  const middleC = clampInt(optNumber(opts, 'middleC', 4), -2, 9);
  const n = pc + (Number(rest) - middleC + 5) * 12;
  return n >= 0 && n <= 127 ? n : NaN;
}

function parsePan(s, opts) {
  if (s === 'c') return optNumber(opts, 'center', (optNumber(opts, 'min', -1) + optNumber(opts, 'max', 1)) / 2);
  let side = '';
  let digits = s;
  const head = s.slice(0, 1);
  const tail = s.slice(-1);
  if (head === 'l' || head === '<') { side = 'l'; digits = s.slice(1); } else if (head === 'r' || head === '>') { side = 'r'; digits = s.slice(1); } else if (tail === 'l' || tail === '<') { side = 'l'; digits = s.slice(0, -1); } else if (tail === 'r' || tail === '>') { side = 'r'; digits = s.slice(0, -1); }
  const amount = readNumber(digits);
  if (!side || !Number.isFinite(amount)) return NaN;
  const custom = opt(opts, 'min') !== undefined || opt(opts, 'max') !== undefined;
  const min = optNumber(opts, 'min', -1);
  const max = optNumber(opts, 'max', 1);
  const center = optNumber(opts, 'center', (min + max) / 2);
  const steps = optNumber(opts, 'steps', 50);
  const signed = side === 'l' ? -amount : amount;
  return custom ? center + signed : center + (signed / steps) * ((max - min) / 2);
}

function parseKind(s, kind, opts) {
  if (kind === 'note') return parseNote(s, opts);
  if (kind === 'division') {
    for (const [name, b] of FORMAT_DIVISIONS) if (name.toLowerCase() === s) return b;
    return NaN;
  }
  if (kind === 'pan') return parsePan(s, opts);
  if (kind === 'ratio') {
    if (s.endsWith(':1')) return readNumber(s.slice(0, -2));
    if (s.startsWith('x')) return readNumber(s.slice(1));
  }
  return NaN;
}

/** The number typed, or undefined when there is none to read. */
export function formatParse(text, opts) {
  if (typeof text !== 'string' && typeof text !== 'number') return undefined;
  let s = String(text).toLowerCase().replace(/\s+/g, '').replace(/\u2212/g, '-').replace(/\u266f/g, '#').replace(/\u266d/g, 'b').replace(/\u221e/g, 'inf');
  if (s === '') return undefined;
  const kind = String(opt(opts, 'kind') ?? 'auto');
  let value = parseKind(s, kind, opts);
  if (Number.isNaN(value)) {
    let factor = 1;
    let unitKind = '';
    for (const [suffix, k, f] of UNIT_SUFFIXES) {
      if (s.length > suffix.length && s.endsWith(suffix)) {
        s = s.slice(0, s.length - suffix.length);
        factor = f;
        unitKind = k;
        break;
      }
    }
    if (unitKind && kind !== 'auto' && unitKind !== kind) return undefined;
    value = readNumber(s);
    if (Number.isNaN(value)) return undefined;
    if (!unitKind && factor === 1 && kind === 'percent') factor = 0.01;
    value *= factor;
  }
  const min = toNumber(opt(opts, 'min'));
  const max = toNumber(opt(opts, 'max'));
  if (Number.isFinite(min) && value < min) value = min;
  if (Number.isFinite(max) && value > max) value = max;
  return value;
}
