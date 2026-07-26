// Chord Pad — play the synth FROM the panel. Every other native control here
// modulates parameters; this one emits MIDI NOTES. You pick a key + scale and the
// pads auto-fill with the in-key chords (or scale notes); tapping one sounds it.
// Two layouts share this one engine: GRID (compact, in-key) and WHEEL (circle of
// fifths — the V is one step clockwise, the IV one anti-clockwise, each relative
// minor sits inside its major, and stepping outside the lit wedge gives you
// borrowed chords). Pure music theory + geometry, no DOM/store deps, unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
const mod12 = (n) => ((Math.round(num(n, 0)) % 12) + 12) % 12;

export const NOTE_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NOTE_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// Scale interval sets (semitones from the tonic).
export const SCALES = {
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:   [0, 2, 3, 5, 7, 9, 11],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  phrygian:       [0, 1, 3, 5, 7, 8, 10],
  lydian:         [0, 2, 4, 6, 7, 9, 11],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  locrian:        [0, 1, 3, 5, 6, 8, 10],
  pentatonicMaj:  [0, 2, 4, 7, 9],
  pentatonicMin:  [0, 3, 5, 7, 10],
  blues:          [0, 3, 5, 6, 7, 10],
};
export const SCALE_LABELS = {
  major: 'Major', minor: 'Minor', harmonicMinor: 'Harmonic minor', melodicMinor: 'Melodic minor',
  dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian',
  locrian: 'Locrian', pentatonicMaj: 'Major pentatonic', pentatonicMin: 'Minor pentatonic', blues: 'Blues',
};
// Scales whose tonic triad is minor (used for spelling + the wheel's relative major).
const MINOR_ISH = new Set(['minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian', 'locrian', 'pentatonicMin']);

export function chordPadConfig(control) {
  return control?._children?.ChordPad ?? {};
}
export function chordPadKey(control) { return mod12(chordPadConfig(control).key ?? 0); }
export function chordPadScaleName(control) {
  const s = String(chordPadConfig(control).scale ?? 'major');
  return SCALES[s] ? s : 'major';
}
export function chordPadScale(control) { return SCALES[chordPadScaleName(control)]; }
export function chordPadLayout(control) {
  return String(chordPadConfig(control).layout ?? 'wheel') === 'grid' ? 'grid' : 'wheel';
}

// Flat vs sharp spelling: flat keys read better with flats. Keyed off the
// RELATIVE MAJOR so C minor spells E♭/A♭ rather than D♯/G♯.
export function useFlats(keyPc, scaleName) {
  const relMajor = MINOR_ISH.has(String(scaleName)) ? mod12(keyPc + 3) : mod12(keyPc);
  return [5, 10, 3, 8, 1, 6].includes(relMajor);   // F B♭ E♭ A♭ D♭ G♭
}
export function noteName(pc, flats = true) {
  return (flats ? NOTE_FLAT : NOTE_SHARP)[mod12(pc)];
}

// The scale's pitch classes for a key.
export function scalePitchClasses(keyPc, scale) {
  return (Array.isArray(scale) ? scale : []).map((s) => mod12(keyPc + s));
}
export function inScale(pc, keyPc, scale) {
  return scalePitchClasses(keyPc, scale).includes(mod12(pc));
}

// --- Chord building ----------------------------------------------------------
// Stack scale thirds from a degree: take every other scale note (wrapping octaves).
// `size` 3 = triad, 4 = seventh. Returns semitone offsets from the TONIC.
export function stackedChord(scale, degree, size = 3) {
  const s = Array.isArray(scale) ? scale : [];
  const n = s.length;
  if (!n) return [];
  const out = [];
  for (let k = 0; k < Math.max(2, Math.round(num(size, 3))); k += 1) {
    const idx = degree + k * 2;
    const oct = Math.floor(idx / n);
    out.push(s[((idx % n) + n) % n] + oct * 12);
  }
  return out;
}
// Classify a chord from its intervals above the root → a quality tag.
export function chordQuality(intervals) {
  const iv = (Array.isArray(intervals) ? intervals : []).map((x) => mod12(x - intervals[0]));
  const has = (a) => iv.includes(a);
  const third = has(3) ? 'min' : has(4) ? 'maj' : has(2) ? 'sus2' : has(5) ? 'sus4' : '';
  const fifth = has(7) ? 'p5' : has(6) ? 'd5' : has(8) ? 'a5' : '';
  const seventh = has(10) ? 'm7' : has(11) ? 'M7' : has(9) && fifth === 'd5' ? 'd7' : '';
  if (third === 'min' && fifth === 'd5') return seventh === 'm7' ? 'm7b5' : seventh === 'd7' ? 'dim7' : 'dim';
  if (third === 'maj' && fifth === 'a5') return 'aug';
  if (third === 'min') return seventh === 'm7' ? 'min7' : seventh === 'M7' ? 'minMaj7' : 'min';
  if (third === 'maj') return seventh === 'm7' ? 'dom7' : seventh === 'M7' ? 'maj7' : 'maj';
  if (third === 'sus2') return 'sus2';
  if (third === 'sus4') return 'sus4';
  return 'maj';
}
// Suffix shown after the root name (Cm, C°, Cmaj7 …).
export const QUALITY_SUFFIX = {
  maj: '', min: 'm', dim: '°', aug: '+', sus2: 'sus2', sus4: 'sus4',
  maj7: 'maj7', dom7: '7', min7: 'm7', m7b5: 'm7♭5', dim7: '°7', minMaj7: 'mMaj7',
};
const MINOR_QUALITIES = new Set(['min', 'min7', 'dim', 'dim7', 'm7b5', 'minMaj7']);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// A roman numeral for a chord root, spelled relative to the MAJOR scale so
// borrowed degrees read as ♭III / ♭VI / ♭VII.
export function romanNumeral(rootSemitone, quality) {
  const semi = mod12(rootSemitone);
  const MAJOR = SCALES.major;
  let best = 0; let acc = '';
  for (let d = 0; d < 7; d += 1) {
    const diff = mod12(semi - MAJOR[d]);
    if (diff === 0) { best = d; acc = ''; break; }
    if (diff === 11) { best = d; acc = '♭'; }        // a semitone below degree d
    else if (diff === 1 && acc === '') { best = d; acc = '♯'; }
  }
  let r = ROMAN[best];
  if (MINOR_QUALITIES.has(quality)) r = r.toLowerCase();
  if (quality === 'dim' || quality === 'dim7' || quality === 'm7b5') r += '°';
  if (quality === 'aug') r += '+';
  return acc + r;
}

// One chord built on a scale degree, fully described.
export function degreeChord(keyPc, scale, degree, size = 3, flats = true) {
  const offsets = stackedChord(scale, degree, size);
  if (!offsets.length) return null;
  const quality = chordQuality(offsets);
  const rootSemi = offsets[0];
  const rootPc = mod12(keyPc + rootSemi);
  return {
    degree,
    rootPc,
    rootSemitone: mod12(rootSemi),
    quality,
    name: noteName(rootPc, flats) + (QUALITY_SUFFIX[quality] ?? ''),
    roman: romanNumeral(rootSemi, quality),
    // Semitone offsets from the tonic (may exceed 12 — that's the stacking).
    offsets,
    noteNames: offsets.map((o) => noteName(keyPc + o, flats)),
  };
}

// --- Voicing → actual MIDI note numbers --------------------------------------
// baseOctave 4 ⇒ tonic near middle C (MIDI 60). `voicing`: close | spread | drop2.
export function chordNotes(keyPc, offsets, { baseOctave = 4, voicing = 'close', inversion = 0 } = {}) {
  const root = 12 * (clampInt(baseOctave, -1, 8) + 1) + mod12(keyPc);
  let notes = (Array.isArray(offsets) ? offsets : []).map((o) => root + Math.round(num(o, 0)));
  const inv = clampInt(inversion, 0, Math.max(0, notes.length - 1));
  for (let i = 0; i < inv; i += 1) notes = [...notes.slice(1), notes[0] + 12];
  if (String(voicing) === 'spread' && notes.length >= 3) {
    notes = notes.map((n2, i) => (i % 2 === 1 ? n2 + 12 : n2));      // alternate up an octave
  } else if (String(voicing) === 'drop2' && notes.length >= 3) {
    const sorted = [...notes].sort((a, b) => a - b);
    const idx = sorted.length - 2;                                   // 2nd from the top
    sorted[idx] -= 12;
    notes = sorted;
  }
  return notes.map((n2) => clampInt(n2, 0, 127)).sort((a, b) => a - b);
}

// --- The pads ---------------------------------------------------------------
// GRID: one pad per scale degree (chords mode) or per scale note (notes mode).
export function chordPadPads(control) {
  const cfg = chordPadConfig(control);
  const keyPc = chordPadKey(control);
  const scale = chordPadScale(control);
  const flats = useFlats(keyPc, chordPadScaleName(control));
  const notesMode = String(cfg.mode ?? 'chords') === 'notes';
  const size = notesMode ? 1 : (String(cfg.chordType ?? 'triad') === 'seventh' ? 4 : 3);

  if (notesMode) {
    const span = clampInt(cfg.noteSpan ?? 2, 1, 3);                  // octaves of scale notes
    const out = [];
    for (let o = 0; o < span; o += 1) {
      scale.forEach((s, i) => {
        const pc = mod12(keyPc + s);
        // `offsets` stays within one octave — the octave lives in octaveOffset,
        // which padNotes applies (baking it into both would double-count).
        out.push({
          id: `n${o}_${i}`, degree: i, octaveOffset: o, rootPc: pc, quality: 'note',
          name: noteName(pc, flats), roman: '', offsets: [s], noteNames: [noteName(pc, flats)],
          isRoot: mod12(s) === 0,
        });
      });
    }
    return out;
  }
  return scale.map((_, d) => {
    const ch = degreeChord(keyPc, scale, d, size, flats);
    return { id: `c${d}`, octaveOffset: 0, isRoot: d === 0, ...ch };
  });
}

// The MIDI notes a pad sounds, honouring octave / voicing / inversion.
export function padNotes(control, pad) {
  const cfg = chordPadConfig(control);
  const keyPc = chordPadKey(control);
  const offsets = (pad?.offsets ?? []).map((o) => o + 12 * clampInt(pad?.octaveOffset ?? 0, 0, 3));
  return chordNotes(keyPc, offsets, {
    baseOctave: clampInt(cfg.baseOctave ?? 4, -1, 8) + clampInt(cfg.octave ?? 0, -3, 3),
    voicing: String(cfg.voicing ?? 'close'),
    inversion: clampInt(cfg.inversion ?? 0, 0, 3),
  });
}
export function chordPadVelocity(control) { return clampInt(chordPadConfig(control).velocity ?? 96, 1, 127); }
export function chordPadChannel(control) { return clampInt(chordPadConfig(control).channel ?? 1, 1, 16); }

// --- Circle of fifths (the WHEEL) -------------------------------------------
// Clockwise from the top: C G D A E B G♭ D♭ A♭ E♭ B♭ F.
export const CIRCLE_PCS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
// A printed circle of fifths spells the sharp side with sharps and the flat side
// with flats, regardless of the current key — so the wheel reads conventionally.
export const CIRCLE_FLATS = [false, false, false, false, false, false, true, true, true, true, true, true];

// The 12 wheel slots: an outer MAJOR and an inner RELATIVE MINOR each, flagged
// in-key when every chord tone belongs to the scale (the lit wedge).
export function wheelSlots(control) {
  const keyPc = chordPadKey(control);
  const scale = chordPadScale(control);
  const pcs = scalePitchClasses(keyPc, scale);
  const seventh = String(chordPadConfig(control).chordType ?? 'triad') === 'seventh';
  const build = (rootPc, minor, flats) => {
    const iv = minor ? [0, 3, 7] : [0, 4, 7];
    if (seventh) iv.push(minor ? 10 : 11);
    const tones = iv.map((s) => mod12(rootPc + s));
    const quality = chordQuality(iv);
    return {
      rootPc,
      quality,
      name: noteName(rootPc, flats) + (QUALITY_SUFFIX[quality] ?? ''),
      roman: romanNumeral(mod12(rootPc - keyPc), quality),
      offsets: iv.map((s) => mod12(rootPc - keyPc) + s),
      noteNames: tones.map((t) => noteName(t, flats)),
      inKey: tones.every((t) => pcs.includes(t)),
      isTonic: mod12(rootPc) === keyPc,
    };
  };
  return CIRCLE_PCS.map((pc, i) => {
    const flats = CIRCLE_FLATS[i];
    return {
      index: i,
      major: { id: `w${i}M`, octaveOffset: 0, ...build(pc, false, flats) },
      minor: { id: `w${i}m`, octaveOffset: 0, ...build(mod12(pc + 9), true, flats) }, // relative minor
    };
  });
}

// --- Geometry ----------------------------------------------------------------
export function gridGeometry(width, height, count, cols = 4, pad = 10, headerH = 34, footerH = 0) {
  const p = Math.max(0, num(pad, 10));
  const n = Math.max(1, Math.round(num(count, 1)));
  const c = Math.max(1, Math.round(num(cols, 4)));
  const rows = Math.max(1, Math.ceil(n / c));
  const x0 = p;
  const y0 = p + Math.max(0, num(headerH, 0));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - y0 - p - Math.max(0, num(footerH, 0)));
  const gap = 7;
  return {
    x0, y0, w, h, cols: c, rows, gap,
    cellW: Math.max(2, (w - gap * (c - 1)) / c),
    cellH: Math.max(2, (h - gap * (rows - 1)) / rows),
  };
}
export function gridCell(geom, i) {
  const col = i % geom.cols;
  const row = Math.floor(i / geom.cols);
  return {
    x: geom.x0 + col * (geom.cellW + geom.gap),
    y: geom.y0 + row * (geom.cellH + geom.gap),
    w: geom.cellW, h: geom.cellH,
  };
}
export function gridHit(geom, px, py, count) {
  const n = Math.max(1, Math.round(num(count, 1)));
  for (let i = 0; i < n; i += 1) {
    const c = gridCell(geom, i);
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return i;
  }
  return -1;
}

export function wheelGeometry(width, height, pad = 10, headerH = 34) {
  const p = Math.max(0, num(pad, 10));
  const top = p + Math.max(0, num(headerH, 0));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - top - p);
  const size = Math.min(w, h);
  const cx = p + w / 2;
  const cy = top + h / 2;
  const outerR = size / 2;
  return {
    cx, cy, outerR,
    ringMajor: outerR * 0.79,       // centre-line radius of the outer (major) ring
    ringMinor: outerR * 0.52,       // centre-line radius of the inner (minor) ring
    rMajor: Math.max(6, outerR * 0.165),
    rMinor: Math.max(5, outerR * 0.125),
    hubR: Math.max(10, outerR * 0.29),
  };
}
// Slot centre: ring 'major' | 'minor'. Slot 0 sits at the top, clockwise.
export function wheelSlotCenter(geom, index, ring = 'major') {
  const a = (-90 + Math.round(num(index, 0)) * 30) * Math.PI / 180;
  const r = ring === 'minor' ? geom.ringMinor : geom.ringMajor;
  return { x: geom.cx + r * Math.cos(a), y: geom.cy + r * Math.sin(a) };
}
// Hit-test the wheel → { index, ring } or null (hub / empty space returns null).
export function wheelHit(geom, px, py) {
  for (let i = 0; i < 12; i += 1) {
    for (const ring of ['major', 'minor']) {
      const c = wheelSlotCenter(geom, i, ring);
      const r = ring === 'minor' ? geom.rMinor : geom.rMajor;
      if ((c.x - px) ** 2 + (c.y - py) ** 2 <= (r + 2) ** 2) return { index: i, ring };
    }
  }
  return null;
}

// --- MIDI note messages (pure byte building) --------------------------------
export function noteOnBytes(channel, note, velocity) {
  return [0x90 | (clampInt(channel, 1, 16) - 1), clampInt(note, 0, 127), clampInt(velocity, 1, 127)];
}
export function noteOffBytes(channel, note) {
  return [0x80 | (clampInt(channel, 1, 16) - 1), clampInt(note, 0, 127), 0];
}
export function bytesToHex(bytes) {
  return (Array.isArray(bytes) ? bytes : []).map((v) => (clampInt(v, 0, 255) & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
