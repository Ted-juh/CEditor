// Phrase Sequencer — notes on a grid. The gap this fills is specific: the
// [Turing Modulator] sequences VALUES, the [Arpeggiator] walks notes you are
// already holding, and nothing here sequenced PITCH. This does.
//
// The one decision that makes it different from a piano roll: **rows are scale
// degrees, not semitones**. A pattern is therefore a shape rather than a set of
// pitches — change the key and it transposes, change major to minor and it
// re-harmonises, and neither can produce a wrong note. A chromatic mode is there
// for when you want the piano roll after all, but the degree grid is the point.
//
// Pure: pattern + position in, notes out. The clock, the note output and the
// note-off bookkeeping live in the preview surface.
import { SCALES, useFlats, noteName } from './chordPadLayout.js';
import { DIVISION_IDS, DIVISION_LABELS, beatsPerStep, secondsPerBeat } from './transportLayout.js';
// Deliberately the Arpeggiator's own swing function rather than a copy of the
// formula: an Arp and a Phrase on the same clock at the same swing have to land
// on the same beat, and two implementations of "delay the odd steps" would
// eventually disagree about it.
import { swingDelay } from './arpLayout.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export const MIN_STEPS = 1;
export const MAX_STEPS = 64;
export const MIN_ROWS = 1;
export const MAX_ROWS = 24;

export const PHRASE_MODES = ['degree', 'chromatic'];
export const PHRASE_MODE_LABELS = {
  degree: 'Scale degrees (stays in key)', chromatic: 'Chromatic (semitones)',
};
// How the pattern advances. Forward is what everyone means by a sequencer;
// the rest are here because they cost one function and make one pattern into
// four.
export const PHRASE_DIRECTIONS = ['forward', 'reverse', 'pingpong', 'random'];
export const PHRASE_DIRECTION_LABELS = {
  forward: 'Forward', reverse: 'Reverse', pingpong: 'Ping-pong', random: 'Random',
};

export function phraseConfig(control) {
  return control?._children?.Phrase ?? {};
}
export function phraseMode(control) {
  const m = String(phraseConfig(control).mode ?? 'degree');
  return PHRASE_MODES.includes(m) ? m : 'degree';
}
export function phraseSteps(control) { return clampInt(phraseConfig(control).steps ?? 16, MIN_STEPS, MAX_STEPS); }
export function phraseRows(control) { return clampInt(phraseConfig(control).rows ?? 8, MIN_ROWS, MAX_ROWS); }
export function phraseChannel(control) { return clampInt(phraseConfig(control).channel ?? 1, 1, 16); }
export function phraseVelocity(control) { return clampInt(phraseConfig(control).velocity ?? 100, 1, 127); }
export function phraseDirection(control) {
  const d = String(phraseConfig(control).direction ?? 'forward');
  return PHRASE_DIRECTIONS.includes(d) ? d : 'forward';
}
export function phraseSynced(control) { return phraseConfig(control).syncToTransport === true; }
export function phraseDivision(control) {
  const d = String(phraseConfig(control).division ?? '1/16');
  return DIVISION_IDS.includes(d) ? d : '1/16';
}
export function phraseDivisionLabel(control) {
  return DIVISION_LABELS[phraseDivision(control)] ?? phraseDivision(control);
}
export function phraseRate(control) { return Math.max(0.1, num(phraseConfig(control).rate, 8)); }
export function phraseBeatsPerStep(control) { return beatsPerStep(phraseDivision(control)); }
// Swing delays every ODD step by up to half a step. It's applied to the running
// index, not the pattern step, so it stays an even shuffle in reverse and
// ping-pong instead of following the pattern back and forth.
export function phraseSwing(control) { return clamp01(num(phraseConfig(control).swing, 0)); }
export function phraseSwingSeconds(control, index, stepSecs) {
  return swingDelay(index, phraseSwing(control), stepSecs);
}
export function phraseStepSeconds(control, bpm = null) {
  if (phraseSynced(control) && bpm !== null) return phraseBeatsPerStep(control) * secondsPerBeat(bpm);
  return 1 / phraseRate(control);
}

// --- The pattern ------------------------------------------------------------------
// Stored as a sparse map keyed "step:row", not a dense 2D array. Resizing the
// grid then never destroys anything: shrink to 8 steps, change your mind, and
// the notes past 8 are still there. A dense array would have thrown them away
// the moment you typed the smaller number.
export const EMPTY_PATTERN = Object.freeze({});
export const cellKey = (step, row) => `${Math.round(num(step, 0))}:${Math.round(num(row, 0))}`;

export function phrasePattern(control) {
  const raw = phraseConfig(control).pattern;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : EMPTY_PATTERN;
}
export function cellAt(pattern, step, row) {
  return (pattern ?? EMPTY_PATTERN)[cellKey(step, row)] ?? null;
}
export function isCellOn(pattern, step, row) { return cellAt(pattern, step, row) !== null; }

// Toggling returns a NEW pattern (pure); an existing cell is removed.
export function toggleCell(pattern, step, row, cell = {}) {
  const map = { ...(pattern ?? EMPTY_PATTERN) };
  const key = cellKey(step, row);
  if (map[key]) delete map[key];
  else map[key] = { velocity: null, tie: false, ...cell };
  return map;
}
export function setCell(pattern, step, row, patch) {
  const prior = pattern ?? EMPTY_PATTERN;
  const key = cellKey(step, row);
  // Same object out when there is nothing to change — the rule every reducer
  // here follows, so a consumer can compare by identity and skip the re-render.
  if (!prior[key] || !patch || typeof patch !== 'object') return prior;
  return { ...prior, [key]: { ...prior[key], ...patch } };
}
export function clearPattern() { return EMPTY_PATTERN; }
// Every cell in a step, low row first — a step with more than one is a chord.
export function cellsInStep(pattern, step, rows) {
  const out = [];
  for (let row = 0; row < rows; row += 1) {
    const cell = cellAt(pattern, step, row);
    if (cell) out.push({ row, ...cell });
  }
  return out;
}
// Cells outside the current grid. Kept, not deleted — but the editor says so,
// because "I shrank it and my notes came back when I grew it again" is only a
// nice surprise if you were told it would happen.
export function hiddenCellCount(pattern, steps, rows) {
  let n = 0;
  for (const key of Object.keys(pattern ?? EMPTY_PATTERN)) {
    const [s, r] = key.split(':').map(Number);
    if (s >= steps || r >= rows) n += 1;
  }
  return n;
}
export function trimPattern(pattern, steps, rows) {
  const out = {};
  for (const [key, cell] of Object.entries(pattern ?? EMPTY_PATTERN)) {
    const [s, r] = key.split(':').map(Number);
    if (s < steps && r < rows) out[key] = cell;
  }
  return out;
}

// --- Rows to pitches ----------------------------------------------------------------
// The heart of it. Row 0 is the tonic at the base octave; each row up is the
// next degree of the scale, wrapping into the octave above. So a pattern drawn
// in C minor played in F major is the same *shape* in F major — which is the
// entire reason to sequence degrees rather than semitones.
export function rowToNote(control, row) {
  const cfg = phraseConfig(control);
  const r = Math.round(num(row, 0));
  const base = 12 * (clampInt(cfg.baseOctave ?? 3, -1, 8) + 1) + clampInt(cfg.key ?? 0, 0, 11);
  if (phraseMode(control) === 'chromatic') return base + r + clampInt(cfg.transpose ?? 0, -48, 48);
  const scale = SCALES[String(cfg.scale ?? 'minor')] ?? SCALES.minor;
  const len = scale.length;
  const octave = Math.floor(r / len);
  const degree = ((r % len) + len) % len;
  return base + octave * 12 + scale[degree] + clampInt(cfg.transpose ?? 0, -48, 48);
}
export function phraseUseFlats(control) {
  const cfg = phraseConfig(control);
  return useFlats(clampInt(cfg.key ?? 0, 0, 11), String(cfg.scale ?? 'minor'));
}
export function noteLabel(note, flats = false) {
  const m = clampInt(note, 0, 127);
  return `${noteName(((m % 12) + 12) % 12, flats)}${Math.floor(m / 12) - 1}`;
}
// The label for a row: the degree number in degree mode (1-based, as musicians
// count), the note name in chromatic.
export function rowLabel(control, row) {
  if (phraseMode(control) === 'chromatic') return noteLabel(rowToNote(control, row), phraseUseFlats(control));
  const scale = SCALES[String(phraseConfig(control).scale ?? 'minor')] ?? SCALES.minor;
  const r = Math.round(num(row, 0));
  const degree = ((r % scale.length) + scale.length) % scale.length;
  const octave = Math.floor(r / scale.length);
  return `${degree + 1}${octave ? `+${octave}` : ''}`;
}

// --- Playback ------------------------------------------------------------------------
// Which pattern step a sequence index lands on. `index` counts monotonically
// upward — from the transport position or a free-running counter — and the
// direction folds it. Keeping it a pure function of a rising index is the same
// rule the transport uses: nothing accumulates, so nothing drifts, and a
// direction change mid-pattern can't corrupt a stored cursor.
export function stepAtIndex(index, steps, direction = 'forward', seed = 0) {
  const n = Math.max(1, Math.round(num(steps, 1)));
  const i = Math.max(0, Math.round(num(index, 0)));
  switch (String(direction)) {
    case 'reverse': return (n - 1) - (i % n);
    case 'pingpong': {
      if (n === 1) return 0;
      const period = n * 2 - 2;                  // …3,2,1,0,1,2,3… without repeating the ends
      const p = i % period;
      return p < n ? p : period - p;
    }
    case 'random': {
      // Deterministic from the index, so two components on the same clock with
      // the same seed agree — and so a repeat of the same index is the same
      // step rather than a new roll.
      let h = (i + 1) * 2654435761 + Math.round(num(seed, 0)) * 40503;
      h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
      return Math.abs(h) % n;
    }
    case 'forward':
    default: return i % n;
  }
}

// What a step should play. Returns the notes, their velocity, and whether each
// is TIED to the same row in the previous step — a tie holds the note rather
// than retriggering it, which is the difference between a line and a stutter.
export function stepNotes(control, index) {
  const steps = phraseSteps(control);
  const rows = phraseRows(control);
  const pattern = phrasePattern(control);
  const step = stepAtIndex(index, steps, phraseDirection(control), phraseConfig(control).seed ?? 0);
  const prevStep = stepAtIndex(Math.max(0, Math.round(num(index, 0)) - 1), steps, phraseDirection(control), phraseConfig(control).seed ?? 0);
  const base = phraseVelocity(control);
  return {
    step,
    notes: cellsInStep(pattern, step, rows).map((c) => ({
      row: c.row,
      note: rowToNote(control, c.row),
      velocity: clampInt(c.velocity ?? base, 1, 127),
      // A tie only means anything if the same row was on in the step we came
      // FROM — otherwise there is nothing to hold, and it would swallow the
      // note-on entirely.
      tied: c.tie === true && index > 0 && isCellOn(pattern, prevStep, c.row),
    })),
  };
}
// Gate length as a fraction of a step. 1 = legato into the next step.
export function phraseGate(control) { return clamp01(num(phraseConfig(control).gate, 0.8)) || 0.01; }
export function gateSeconds(control, stepSecs) {
  return Math.max(0.005, phraseGate(control) * Math.max(0.01, num(stepSecs, 0.1)));
}
// A rest is a step with nothing in it — worth naming, because "the pattern is
// empty" and "this step is a rest" are the same thing to the player and very
// different things to a person reading the grid.
export function isRest(control, step) {
  return cellsInStep(phrasePattern(control), step, phraseRows(control)).length === 0;
}

// --- Sounding-note bookkeeping ---------------------------------------------------------
// The same trap as the Zone Splitter, for the same reason: a note-off must go
// where its note-on went. Here the hazard is editing the key, the scale, the
// transpose or the base octave WHILE the sequence plays — every one of those
// changes what a row means, so a re-derived note-off would release a pitch that
// was never started and leave the real one ringing.
export const EMPTY_SOUNDING = Object.freeze({});

// Play a step: hold anything tied, release anything that has stopped, start the
// rest. Returns the new sounding state and the messages to send.
export function playStep(sounding, control, index) {
  const prior = sounding ?? EMPTY_SOUNDING;
  const { step, notes } = stepNotes(control, index);
  const channel = phraseChannel(control);
  const sends = [];
  const next = {};

  // Anything tied and already sounding on the same row carries over untouched.
  for (const n of notes) {
    const held = prior[`${n.row}`];
    if (n.tied && held && held.note === n.note && held.channel === channel) {
      next[`${n.row}`] = held;
    }
  }
  // Release everything that isn't carrying over.
  for (const [row, held] of Object.entries(prior)) {
    if (next[row]) continue;
    sends.push({ kind: 'off', channel: held.channel, note: held.note });
  }
  // Start the rest.
  for (const n of notes) {
    if (next[`${n.row}`]) continue;
    sends.push({ kind: 'on', channel, note: n.note, velocity: n.velocity, row: n.row });
    next[`${n.row}`] = { channel, note: n.note };
  }
  return { sounding: next, sends, step };
}
// Does the NEXT step tie this row? A gate shorter than the step must not cut a
// tie — the whole point of a tie is that the note keeps ringing — so a note
// about to be held is exempt from the gate.
export function tiesForward(control, index, row) {
  const steps = phraseSteps(control);
  const dir = phraseDirection(control);
  const seed = phraseConfig(control).seed ?? 0;
  const nextStep = stepAtIndex(Math.round(num(index, 0)) + 1, steps, dir, seed);
  const cell = cellAt(phrasePattern(control), nextStep, row);
  if (!cell || cell.tie !== true) return false;
  // …and only if this row is on in the step we're leaving, or the tie has
  // nothing to hold and will retrigger anyway.
  const thisStep = stepAtIndex(Math.round(num(index, 0)), steps, dir, seed);
  return isCellOn(phrasePattern(control), thisStep, row);
}

export function releaseAll(sounding) {
  const map = sounding ?? EMPTY_SOUNDING;
  const sends = Object.values(map).map((h) => ({ kind: 'off', channel: h.channel, note: h.note }));
  return { sounding: EMPTY_SOUNDING, sends };
}
export function soundingNotes(sounding) {
  return Object.values(sounding ?? EMPTY_SOUNDING).map((h) => h.note).sort((a, b) => a - b);
}

// --- Geometry ---------------------------------------------------------------------------
export function phraseGeometry(width, height, steps, rows, pad = 8, headerH = 20, gutterW = 26) {
  const p = Math.max(0, num(pad, 8));
  const hdr = Math.max(0, num(headerH, 0));
  const gut = Math.max(0, num(gutterW, 0));
  const w = Math.max(1, num(width, 0) - p * 2 - gut);
  const h = Math.max(1, num(height, 0) - p * 2 - hdr);
  const nS = Math.max(1, Math.round(num(steps, 1)));
  const nR = Math.max(1, Math.round(num(rows, 1)));
  const gap = nS > 24 ? 1 : 2;
  return {
    x0: p + gut, y0: p + hdr, w, h, gutterX: p, gutterW: gut, gap,
    steps: nS, rows: nR,
    cellW: Math.max(2, (w - gap * (nS - 1)) / nS),
    cellH: Math.max(2, (h - gap * (nR - 1)) / nR),
  };
}
// Row 0 is drawn at the BOTTOM — low notes low, the way every sequencer and
// every piano roll does it.
export function cellRect(geom, step, row) {
  return {
    x: geom.x0 + step * (geom.cellW + geom.gap),
    y: geom.y0 + (geom.rows - 1 - row) * (geom.cellH + geom.gap),
    w: geom.cellW, h: geom.cellH,
  };
}
export function cellAtPoint(geom, px, py) {
  const x = num(px, -1);
  const y = num(py, -1);
  for (let step = 0; step < geom.steps; step += 1) {
    for (let row = 0; row < geom.rows; row += 1) {
      const r = cellRect(geom, step, row);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { step, row };
    }
  }
  return null;
}
export function rowLabelY(geom, row) {
  const r = cellRect(geom, 0, row);
  return r.y + r.h / 2 + 3;
}

// --- Patterns you can start from ----------------------------------------------------------
// Not "presets" in the splitter's sense — a blank grid is a blank page, and the
// hardest part of a step sequencer is the first four notes.
export const PHRASE_SEEDS = [
  { id: 'clear', label: 'Clear', hint: 'Empty the grid.' },
  { id: 'octaves', label: 'Octave bass', hint: 'Tonic, tonic-up-an-octave, alternating.' },
  { id: 'arpUp', label: 'Arp up', hint: 'Triad walked upward across the bar.' },
  { id: 'riff', label: 'Riff', hint: 'A syncopated one-bar line with ties.' },
  { id: 'random', label: 'Random', hint: 'One note per step, drawn from the scale.' },
];
// `roll` is passed in (a 0..1 supplier) so the seeds stay pure and testable.
export function phraseSeedPattern(seedId, steps, rows, roll = () => 0.5) {
  const nS = clampInt(steps, MIN_STEPS, MAX_STEPS);
  const nR = clampInt(rows, MIN_ROWS, MAX_ROWS);
  const put = (map, step, row, cell) => {
    if (step < nS && row < nR && row >= 0) map[cellKey(step, row)] = { velocity: null, tie: false, ...cell };
  };
  const map = {};
  switch (String(seedId)) {
    case 'octaves':
      for (let s = 0; s < nS; s += 2) put(map, s, 0, {});
      for (let s = 1; s < nS; s += 2) put(map, s, Math.min(nR - 1, 7), {});
      return map;
    case 'arpUp': {
      const triad = [0, 2, 4].filter((r) => r < nR);
      for (let s = 0; s < nS; s += 1) put(map, s, triad[s % triad.length], {});
      return map;
    }
    case 'riff':
      // Deliberately not on every step: the rests are what make it a riff.
      put(map, 0, 0, { velocity: 110 });
      // The tie sits directly after the note it holds. A tie with a rest before
      // it is just a retrigger, which teaches the wrong thing about the box.
      put(map, 1, 0, { tie: true });
      put(map, 4, 0, {});
      put(map, 6, Math.min(nR - 1, 2), {});
      put(map, 7, Math.min(nR - 1, 4), {});
      put(map, 10, Math.min(nR - 1, 2), { velocity: 80 });
      put(map, 11, Math.min(nR - 1, 2), { tie: true });
      put(map, 14, 0, {});
      return map;
    case 'random':
      for (let s = 0; s < nS; s += 1) put(map, s, Math.min(nR - 1, Math.floor(clamp01(roll(s)) * nR)), {});
      return map;
    case 'clear':
    default:
      return EMPTY_PATTERN;
  }
}

// --- Driving it from a script -------------------------------------------------------------
// A sequencer you can't re-point mid-song is half a sequencer: the whole reason
// to have one on a panel is that a footswitch can swap the riff, drop it a
// fourth, or run it backwards. Same shape as the Zone Splitter's script API —
// a PURE reducer over the config, so the script path and the inspector's own
// buttons cannot diverge.
//
// Returns a PATCH: only the fields that change. An empty patch is a no-op, which
// is what every unrecognised argument produces. A script firing on a footswitch
// must not take the panel down because someone typed "dorain".
export const PHRASE_SCRIPT_ACTIONS = ['seed', 'clear', 'key', 'scale', 'transpose', 'direction', 'run', 'cell'];

export function phraseScriptPatch(cfg, action, args = {}, roll = () => 0.5) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const steps = clampInt(c.steps ?? 16, MIN_STEPS, MAX_STEPS);
  const rows = clampInt(c.rows ?? 8, MIN_ROWS, MAX_ROWS);
  const pattern = c.pattern && typeof c.pattern === 'object' && !Array.isArray(c.pattern) ? c.pattern : EMPTY_PATTERN;
  const a = args && typeof args === 'object' ? args : {};

  switch (String(action)) {
    case 'seed': {
      const id = String(a.seed ?? '');
      if (!PHRASE_SEEDS.some((s) => s.id === id)) return {};
      return { pattern: phraseSeedPattern(id, steps, rows, roll) };
    }
    case 'clear':
      return { pattern: {} };
    case 'key': {
      const k = Number(a.key);
      if (!Number.isFinite(k)) return {};
      // Wrapped, not clamped: transposing up by twelve semitones one at a time
      // should come back to where it started rather than pile up on B.
      return { key: ((Math.round(k) % 12) + 12) % 12 };
    }
    case 'scale': {
      const s = String(a.scale ?? '');
      return SCALES[s] ? { scale: s } : {};
    }
    case 'transpose': {
      const t = Number(a.transpose);
      return Number.isFinite(t) ? { transpose: clampInt(t, -48, 48) } : {};
    }
    case 'direction': {
      const d = String(a.direction ?? '');
      return PHRASE_DIRECTIONS.includes(d) ? { direction: d } : {};
    }
    case 'run':
      return { running: a.running !== false };
    case 'cell': {
      const step = Math.round(num(a.step, -1));
      const row = Math.round(num(a.row, -1));
      if (step < 0 || step >= steps || row < 0 || row >= rows) return {};
      const on = a.on;
      // Unspecified means toggle — which is what a footswitch wants. An
      // explicit true/false is idempotent, which is what a MIDI-mapped
      // switch wants, because it may fire twice.
      if (on === undefined) return { pattern: toggleCell(pattern, step, row) };
      const already = isCellOn(pattern, step, row);
      if (on === true) return already ? {} : { pattern: toggleCell(pattern, step, row) };
      return already ? { pattern: toggleCell(pattern, step, row) } : {};
    }
    default:
      return {};
  }
}
