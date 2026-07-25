// Harmoniser / Chord Memory — one finger in, a full chord out.
//
// Mostly assembly: the Chord Pad's scale engine builds the chord, the note-input
// path supplies the played note, the note-output path sends the result. What it
// adds is the two rules that make it behave when you play more than one note,
// which is the case every naive implementation gets wrong.
//
// Pure: a played note in, a set of notes out. The MIDI lives in the preview
// surface.
import {
  SCALES, scalePitchClasses, stackedChord, chordQuality, QUALITY_SUFFIX,
  noteName, useFlats, romanNumeral,
} from './chordPadLayout.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
const mod12 = (n) => ((Math.round(num(n, 0)) % 12) + 12) % 12;

export const MAX_VOICES = 8;

// Two modes, and the difference matters more than it looks.
export const HARMONY_MODES = ['diatonic', 'memory'];
export const HARMONY_MODE_LABELS = {
  // Builds the chord that belongs to the played note's degree IN THE KEY. Play
  // the third degree and you get the iii chord — the harmony is correct by
  // construction and cannot produce a wrong note.
  diatonic: 'Diatonic (in key)',
  // Transposes a fixed SHAPE to whatever you played, in key or out of it. This
  // is what a hardware chord-memory button does, and people expect it to do
  // exactly that — including the parallel fifths.
  memory: 'Chord memory (fixed shape)',
};
export const VOICINGS = ['close', 'open', 'drop2'];
export const VOICING_LABELS = { close: 'Close', open: 'Open', drop2: 'Drop 2' };

export function harmoniserConfig(control) {
  return control?._children?.Harmoniser ?? {};
}
export function harmoniserMode(control) {
  const m = String(harmoniserConfig(control).mode ?? 'diatonic');
  return HARMONY_MODES.includes(m) ? m : 'diatonic';
}
export function harmoniserKey(control) { return mod12(harmoniserConfig(control).key ?? 0); }
export function harmoniserScaleName(control) {
  const s = String(harmoniserConfig(control).scale ?? 'major');
  return SCALES[s] ? s : 'major';
}
export function harmoniserScale(control) { return SCALES[harmoniserScaleName(control)]; }
export function harmoniserChannel(control) { return clampInt(harmoniserConfig(control).channel ?? 1, 1, 16); }
export function harmoniserSize(control) { return clampInt(harmoniserConfig(control).size ?? 3, 2, 6); }
export function harmoniserVoicing(control) {
  const v = String(harmoniserConfig(control).voicing ?? 'close');
  return VOICINGS.includes(v) ? v : 'close';
}
export function harmoniserInversion(control) { return clampInt(harmoniserConfig(control).inversion ?? 0, 0, 3); }
export function harmoniserUseFlats(control) {
  return useFlats(harmoniserKey(control), harmoniserScaleName(control));
}
// The memory shape: semitone offsets from the played note. 0 is the note you
// played; it is in the list rather than implied, so "drop the root" is
// expressible.
export function memoryShape(control) {
  const raw = harmoniserConfig(control).shape;
  const list = (Array.isArray(raw) ? raw : [0, 4, 7])
    .map((n) => clampInt(n, -36, 36))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);
  return list.length ? list.slice(0, MAX_VOICES) : [0];
}
export const MEMORY_PRESETS = [
  { id: 'major', label: 'Major', shape: [0, 4, 7] },
  { id: 'minor', label: 'Minor', shape: [0, 3, 7] },
  { id: 'sus4', label: 'Sus 4', shape: [0, 5, 7] },
  { id: 'maj7', label: 'Major 7', shape: [0, 4, 7, 11] },
  { id: 'min7', label: 'Minor 7', shape: [0, 3, 7, 10] },
  { id: 'fifths', label: 'Fifths', shape: [0, 7, 12] },
  { id: 'octaves', label: 'Octaves', shape: [-12, 0, 12] },
];
export function memoryPresetShape(id) {
  return (MEMORY_PRESETS.find((p) => p.id === String(id)) ?? MEMORY_PRESETS[0]).shape.slice();
}

// --- The chord ------------------------------------------------------------------
// Which scale degree a played pitch is. A note OUTSIDE the key has no degree, and
// that has to be answered honestly rather than rounded — see below.
export function degreeOfNote(control, note) {
  const scale = harmoniserScale(control);
  const pcs = scalePitchClasses(harmoniserKey(control), scale);
  const i = pcs.indexOf(mod12(note));
  return i === -1 ? null : i;
}
// What happens when you play a note that isn't in the key. Three answers, and
// none of them is obviously right, so it's a setting rather than a guess.
export const OUT_OF_KEY = ['pass', 'nearest', 'mute'];
export const OUT_OF_KEY_LABELS = {
  pass: 'Play the note alone',     // no harmony, but you still hear what you played
  nearest: 'Harmonise the nearest scale tone',
  mute: 'Silent',
};
export function outOfKeyMode(control) {
  const m = String(harmoniserConfig(control).outOfKey ?? 'pass');
  return OUT_OF_KEY.includes(m) ? m : 'pass';
}
function nearestScaleNote(control, note) {
  const pcs = scalePitchClasses(harmoniserKey(control), harmoniserScale(control));
  for (let d = 0; d <= 6; d += 1) {
    if (pcs.includes(mod12(note - d))) return note - d;
    if (pcs.includes(mod12(note + d))) return note + d;
  }
  return note;
}

// `stackedChord` returns semitones from the KEY's root, because that is what the
// Chord Pad needs — it draws chords against a key. Here the offsets have to be
// relative to the note that was PLAYED, so the stack is rebased onto its own
// first note. Adding the key-relative numbers to the played pitch instead is the
// obvious mistake and produces a chord a degree too high.
function relativeStack(scale, degree, size) {
  const abs = stackedChord(scale, degree, size);
  if (!abs.length) return [0];
  return abs.map((n) => n - abs[0]);
}

// Apply a voicing to a set of semitone offsets above a root.
function voiceOffsets(offsets, voicing, inversion) {
  let out = offsets.slice().sort((a, b) => a - b);
  // Inversion moves the lowest voices up an octave, one at a time — the way an
  // inversion actually works, rather than rotating the list and hoping.
  const inv = Math.min(clampInt(inversion, 0, 3), Math.max(0, out.length - 1));
  for (let i = 0; i < inv; i += 1) out = [...out.slice(1), out[0] + 12].sort((a, b) => a - b);
  if (voicing === 'open' && out.length >= 3) {
    // Open: lift the middle voice an octave, which is what opens the sound.
    const mid = Math.floor(out.length / 2);
    out = out.map((v, i) => (i === mid ? v + 12 : v)).sort((a, b) => a - b);
  } else if (voicing === 'drop2' && out.length >= 3) {
    // Drop 2: the second voice from the TOP goes down an octave.
    const idx = out.length - 2;
    out = out.map((v, i) => (i === idx ? v - 12 : v)).sort((a, b) => a - b);
  }
  return out;
}

/**
 * The notes a played pitch produces. Returns [] when the rules say silence.
 * Notes outside 0..127 are dropped, not clamped — clamping stacks strays on one
 * pitch, which sounds like a stuck key rather than like nothing.
 */
export function chordForNote(control, note) {
  const cfg = harmoniserConfig(control);
  const played = clampInt(note, 0, 127);
  const withBass = cfg.keepPlayed !== false;
  const spread = clampInt(cfg.octaveSpread ?? 0, -3, 3) * 12;

  let offsets;
  if (harmoniserMode(control) === 'memory') {
    offsets = memoryShape(control);
  } else {
    const degree = degreeOfNote(control, played);
    if (degree === null) {
      const mode = outOfKeyMode(control);
      if (mode === 'mute') return [];
      if (mode === 'pass') return withBass ? [played] : [];
      return chordForNote(control, nearestScaleNote(control, played));
    }
    offsets = relativeStack(harmoniserScale(control), degree, harmoniserSize(control));
  }
  const voiced = voiceOffsets(offsets, harmoniserVoicing(control), harmoniserInversion(control));
  const notes = new Set();
  if (withBass) notes.add(played);
  for (const off of voiced) notes.add(played + off + spread);
  return [...notes]
    .filter((n) => n >= 0 && n <= 127)
    .sort((a, b) => a - b)
    .slice(0, clampInt(cfg.maxVoices ?? MAX_VOICES, 1, MAX_VOICES));
}

// A name for what came out, so the display can say something more useful than a
// list of numbers. Memory mode has no key context, so it names the shape from
// its own intervals.
export function chordLabel(control, note) {
  const flats = harmoniserUseFlats(control);
  if (harmoniserMode(control) === 'memory') {
    const shape = memoryShape(control);
    const rel = shape.map((s) => s - shape[0]);
    return `${noteName(mod12(note + shape[0]), flats)}${QUALITY_SUFFIX[chordQuality(rel)] ?? ''}`;
  }
  const degree = degreeOfNote(control, note);
  if (degree === null) return `${noteName(mod12(note), flats)} (out of key)`;
  const offsets = relativeStack(harmoniserScale(control), degree, harmoniserSize(control));
  const quality = chordQuality(offsets);
  const root = noteName(mod12(note), flats);
  return `${root}${QUALITY_SUFFIX[quality] ?? ''} · ${romanNumeral(harmoniserScale(control)[degree], quality)}`;
}

// --- Sounding bookkeeping ------------------------------------------------------
// The rule that has now bitten three components, plus one that is specific to
// this one.
//
// (1) A note-off must release what its note-on SENT. Change the key, the mode or
//     the voicing while a key is held and a re-derived release would let go of
//     pitches that were never started.
//
// (2) Two input notes can produce the SAME pitch — a third apart in diatonic
//     mode almost always do. Releasing one key would then stop a note the other
//     key is still holding. So sounding pitches are REFERENCE COUNTED: the
//     note-off is sent when the last holder lets go, not the first.
export const EMPTY_HELD = Object.freeze({ byNote: {}, counts: {} });

export function pressHarmony(held, control, note, velocity = 100) {
  const prior = held ?? EMPTY_HELD;
  const key = String(clampInt(note, 0, 127));
  const sends = [];
  const channel = harmoniserChannel(control);
  // A fixed velocity (an organ-like part) or the one you played. 0 means follow,
  // rather than a separate on/off flag that could disagree with the number.
  const fixed = clampInt(harmoniserConfig(control).velocity ?? 0, 0, 127);
  const vel = fixed > 0 ? fixed : clampInt(velocity, 1, 127);
  // A retrigger with no release in between: let the old chord go first, or its
  // notes are orphaned in the counts forever.
  let byNote = prior.byNote;
  let counts = prior.counts;
  if (byNote[key]) {
    const r = releaseHarmony(prior, control, note);
    byNote = r.held.byNote; counts = r.held.counts;
    sends.push(...r.sends);
  }
  const chord = chordForNote(control, clampInt(note, 0, 127));
  if (!chord.length) return { held: { byNote, counts }, sends };
  const nextCounts = { ...counts };
  for (const n of chord) {
    const c = nextCounts[n] ?? 0;
    // Only the first holder starts it. The second would be a duplicate note-on,
    // which most synths answer by retriggering the envelope mid-chord.
    if (c === 0) sends.push({ kind: 'on', channel, note: n, velocity: vel });
    nextCounts[n] = c + 1;
  }
  return { held: { byNote: { ...byNote, [key]: { channel, notes: chord } }, counts: nextCounts }, sends };
}

export function releaseHarmony(held, control, note) {
  const prior = held ?? EMPTY_HELD;
  const key = String(clampInt(note, 0, 127));
  const entry = prior.byNote[key];
  if (!entry) return { held: prior, sends: [] };      // never pressed — invent nothing
  const byNote = { ...prior.byNote };
  delete byNote[key];
  const counts = { ...prior.counts };
  const sends = [];
  for (const n of entry.notes) {
    const c = (counts[n] ?? 1) - 1;
    if (c <= 0) { delete counts[n]; sends.push({ kind: 'off', channel: entry.channel, note: n }); }
    else counts[n] = c;
  }
  return { held: { byNote, counts }, sends };
}

export function releaseAllHarmony(held) {
  const prior = held ?? EMPTY_HELD;
  const sends = [];
  for (const entry of Object.values(prior.byNote)) {
    for (const n of entry.notes) sends.push({ kind: 'off', channel: entry.channel, note: n });
  }
  // Deduplicated by pitch, because a doubled pitch is one sounding note.
  const seen = new Set();
  return {
    held: EMPTY_HELD,
    sends: sends.filter((s) => {
      const k = `${s.channel}:${s.note}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }),
  };
}
export function soundingPitches(held) {
  return Object.keys((held ?? EMPTY_HELD).counts).map(Number).sort((a, b) => a - b);
}
export function heldInputNotes(held) {
  return Object.keys((held ?? EMPTY_HELD).byNote).map(Number).sort((a, b) => a - b);
}

// Reconcile against the live input, the same shape the Zone Splitter uses: the
// shared store says what is held, and this works out what changed.
export function reconcileHarmony(held, control, entries, keepNote = null) {
  const prior = held ?? EMPTY_HELD;
  const want = new Map((Array.isArray(entries) ? entries : []).map((e) => [clampInt(e.note, 0, 127), e]));
  if (keepNote !== null && !want.has(keepNote)) want.set(clampInt(keepNote, 0, 127), { note: keepNote, velocity: 100 });
  const have = new Set(heldInputNotes(prior));
  let state = prior;
  const sends = [];
  for (const n of have) {
    if (!want.has(n)) { const r = releaseHarmony(state, control, n); state = r.held; sends.push(...r.sends); }
  }
  for (const [n, e] of want) {
    if (!have.has(n)) { const r = pressHarmony(state, control, n, e.velocity ?? 100); state = r.held; sends.push(...r.sends); }
  }
  // Nothing changed → the SAME object, so the caller's input pump doesn't
  // retrigger every held note on every frame.
  return sends.length ? { held: state, sends } : { held: prior, sends: [] };
}

// --- Geometry -------------------------------------------------------------------
// A one-octave-plus keyboard showing what is sounding, sized to the chord rather
// than to a fixed range.
export function harmoniserRange(held, control, fallbackLow = 48, span = 24) {
  const pitches = soundingPitches(held);
  if (!pitches.length) return { lo: fallbackLow, hi: fallbackLow + span };
  const lo = Math.min(...pitches);
  const hi = Math.max(...pitches);
  const need = Math.max(span, hi - lo + 2);
  const start = Math.max(0, lo - 1);
  return { lo: start, hi: Math.min(127, start + need) };
}
const BLACK_PCS = [1, 3, 6, 8, 10];
export function isBlackKey(note) { return BLACK_PCS.includes(mod12(note)); }
export function harmoniserKeys(range, width, height, pad = 8, headerH = 22) {
  const x0 = Math.max(0, num(pad, 8));
  const y0 = Math.max(0, num(pad, 8) + num(headerH, 0));
  const w = Math.max(1, num(width, 0) - x0 * 2);
  const h = Math.max(1, num(height, 0) - y0 - num(pad, 8));
  const whites = [];
  for (let n = range.lo; n <= range.hi; n += 1) if (!isBlackKey(n)) whites.push(n);
  const kw = w / Math.max(1, whites.length);
  const out = [];
  whites.forEach((n, i) => out.push({ note: n, black: false, x: x0 + i * kw, y: y0, w: kw, h }));
  // Blacks are drawn after, between their neighbours, so they sit on top.
  for (let n = range.lo; n <= range.hi; n += 1) {
    if (!isBlackKey(n)) continue;
    const leftWhite = whites.findIndex((w2) => w2 > n);
    if (leftWhite <= 0) continue;
    out.push({ note: n, black: true, x: x0 + leftWhite * kw - kw * 0.3, y: y0, w: kw * 0.6, h: h * 0.62 });
  }
  return out;
}

// --- Driving it from a script -------------------------------------------------------------
// A harmoniser you can't re-key from a footswitch is a harmoniser that only
// works for songs in one key. Same contract as the other two: a PURE reducer
// returning a PATCH of what changes, and a no-op for anything it doesn't
// recognise.
export const HARMONISER_SCRIPT_ACTIONS = [
  'mode', 'key', 'scale', 'size', 'shape', 'voicing', 'inversion', 'octave', 'outOfKey', 'keepPlayed', 'channel',
];

export function harmoniserScriptPatch(cfg, action, args = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const a = args && typeof args === 'object' ? args : {};
  switch (String(action)) {
    case 'mode': {
      const m = String(a.mode ?? '');
      return HARMONY_MODES.includes(m) ? { mode: m } : {};
    }
    case 'key': {
      const k = Number(a.key);
      // Wrapped, not clamped: twelve steps of one semitone come back to where
      // they started rather than piling up on B.
      return Number.isFinite(k) ? { key: mod12(k) } : {};
    }
    case 'scale': {
      const s = String(a.scale ?? '');
      return SCALES[s] ? { scale: s } : {};
    }
    case 'size': {
      const n = Number(a.size);
      return Number.isFinite(n) ? { size: clampInt(n, 2, 6) } : {};
    }
    case 'shape': {
      // Either a preset name or an explicit interval list. A preset id that
      // doesn't exist is a no-op rather than silently the first preset —
      // memoryPresetShape falls back for the UI, but a script typo should not
      // quietly rewrite the shape.
      if (Array.isArray(a.shape)) {
        const list = a.shape.map((n) => Number(n)).filter((n) => Number.isFinite(n));
        return list.length ? { shape: list.map((n) => clampInt(n, -36, 36)).slice(0, MAX_VOICES) } : {};
      }
      const id = String(a.preset ?? a.shape ?? '');
      return MEMORY_PRESETS.some((p) => p.id === id) ? { shape: memoryPresetShape(id) } : {};
    }
    case 'voicing': {
      const v = String(a.voicing ?? '');
      return VOICINGS.includes(v) ? { voicing: v } : {};
    }
    case 'inversion': {
      const n = Number(a.inversion);
      return Number.isFinite(n) ? { inversion: clampInt(n, 0, 3) } : {};
    }
    case 'octave': {
      const n = Number(a.octave);
      return Number.isFinite(n) ? { octaveSpread: clampInt(n, -3, 3) } : {};
    }
    case 'outOfKey': {
      const m = String(a.outOfKey ?? '');
      return OUT_OF_KEY.includes(m) ? { outOfKey: m } : {};
    }
    case 'keepPlayed': {
      const want = a.keepPlayed;
      const now = c.keepPlayed !== false;
      const next = want === undefined ? !now : want !== false;
      return next === now ? {} : { keepPlayed: next };
    }
    case 'channel': {
      const n = Number(a.channel);
      return Number.isFinite(n) ? { channel: clampInt(n, 1, 16) } : {};
    }
    default:
      return {};
  }
}
