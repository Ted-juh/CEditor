// The arithmetic behind the note-module pictures (Strum, Humanize), kept out of the components
// so it can be tested against the engine it draws. Each function names the C++ it mirrors in
// CE/src/Performance/NoteModules.h; when that changes, this changes with it.

/** StrumEngine::strokePosition: where in the spread (0..1) the note at `rank` lands.
    Feel above 0 bunches the first notes together (a quick start); below 0 spreads them. */
export function strokePosition(rank, count, feel) {
  if (count <= 1) return 0;
  const t = rank / (count - 1);
  const amount = Math.max(-1, Math.min(1, Number(feel) || 0));
  const exponent = amount >= 0 ? 1 + 3 * amount : 1 / (1 + 3 * -amount);
  return Math.pow(t, exponent);
}

/** StrumEngine::makeOrder: which chord note (0 = lowest) sounds at each rank. `secondStroke`
    shows the other half of "alternate" (the engine flips every chord). Random uses a fixed
    shuffle here, since the picture has to stand still. */
export function strumOrder(pattern, count, secondStroke = false, velocity = 100) {
  const order = Array.from({ length: count }, (_, i) => i);
  let stroke = pattern;
  // By velocity: a hard hit (90 and up) is a down-stroke, a softer one an up-stroke.
  if (stroke === 'by velocity') stroke = velocity >= 90 ? 'descending' : 'ascending';
  if (stroke === 'alternate') stroke = secondStroke ? 'descending' : 'ascending';
  if (stroke === 'descending') return order.reverse();
  if (stroke === 'outside in') {
    let low = 0, high = count - 1;
    return order.map((_, i) => (i % 2 === 0 ? low++ : high--));
  }
  if (stroke === 'inside out') {
    let low = Math.floor((count - 1) / 2), high = Math.floor(count / 2);
    const out = [];
    if (low === high) { out.push(low); low -= 1; high += 1; }
    while (out.length < count) {
      if (low >= 0) out.push(low--);
      if (out.length < count && high < count) out.push(high++);
    }
    return out;
  }
  if (stroke === 'random') {
    const shuffle = [2, 5, 0, 3, 1, 4, 7, 6];
    return shuffle.filter((i) => i < count).concat(order.filter((i) => i >= 8));
  }
  return order;
}

/** One strummed chord as the engine would play it: for each rank, which note, when (in beats
    after the chord) and at what velocity. StrumEngine::dealOut. */
export function strumNotes({ pattern, spreadBeats, feel, velocityRamp, harderFaster = false }, notes, played = 100,
  secondStroke = false) {
  const sorted = [...notes].sort((a, b) => a - b);
  // Harder is faster: half the spread at full velocity, half again as much at the softest.
  const spread = spreadBeats * (harderFaster ? Math.min(1.5, Math.max(0.5, 1.5 - played / 127)) : 1);
  return strumOrder(pattern, sorted.length, secondStroke, played).map((index, rank) => {
    const position = strokePosition(rank, sorted.length, feel);
    return {
      note: sorted[index],
      rank,
      atBeats: spread * position,
      velocity: Math.max(1, Math.min(127, played + Math.round((Number(velocityRamp) || 0) * position))),
    };
  });
}

/** Standard tuning, low E to high E: StrumEngine::tuning. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

/** StrumEngine::guitarVoicing: the chord laid onto six strings as a guitarist frets it. The
    lowest sounding string plays the bass note and nothing sounds below it; each other string
    takes the nearest chord tone in a four-fret hand position (open strings always), duplicates
    skipped. Every chord tone first, then no gaps, then the lowest position. Returns the string
    notes low to high, with the string each sits on. */
export function guitarVoicing(notes) {
  const chord = (notes ?? []).map(Number);
  if (chord.length === 0) return [];
  const bassClass = Math.min(...chord) % 12;
  const classes = new Set(chord.map((n) => n % 12));
  let best = null;
  let bestScore = Infinity;
  for (let base = 0; base <= 9; base += 1) {
    const low = Math.max(1, base);
    const fret = (s, floor, bassOnly) => {
      const fits = (n) => n > floor && classes.has(n % 12) && (!bassOnly || n % 12 === bassClass);
      if (fits(GUITAR_TUNING[s])) return GUITAR_TUNING[s];
      for (let f = low; f <= low + 3; f += 1) if (fits(GUITAR_TUNING[s] + f)) return GUITAR_TUNING[s] + f;
      return -1;
    };
    let first = 0;
    let bassNote = -1;
    for (; first < 6; first += 1) if ((bassNote = fret(first, -1, true)) >= 0) break;
    if (first === 6) continue;
    const voiced = [];
    let innerMutes = 0;
    for (let s = first; s < 6; s += 1) {
      const n = s === first ? bassNote : fret(s, bassNote, false);
      if (n < 0) { innerMutes += 1; continue; }
      if (voiced.some((v) => v.note === n)) continue;
      voiced.push({ note: n, string: s });
    }
    const covered = new Set(voiced.map((v) => v.note % 12));
    const missing = [...classes].filter((c) => !covered.has(c)).length;
    const score = missing * 1000 + innerMutes * 20 + base * 3 + first;
    if (score < bestScore) { bestScore = score; best = voiced; }
  }
  return (best ?? []).sort((a, b) => a.note - b.note);
}

/** The feel names Humanize offers: each sets all three amounts at once. The engine limits are
    HumanizeEngine's: timing 0..0.25 beat, velocity 0..64, gate 0..100 %. */
export const HUMANIZE_FEELS = [
  { id: 'tight', label: 'Tight', timing: 0.01, velocity: 4, gate: 5 },
  { id: 'loose', label: 'Loose', timing: 0.03, velocity: 12, gate: 15 },
  { id: 'human', label: 'Human', timing: 0.05, velocity: 18, gate: 20 },
  { id: 'drunk', label: 'Drunk', timing: 0.12, velocity: 32, gate: 40 },
];

/** Which named feel the amounts are, or '' when they have been set by hand. */
export function humanizeFeelOf({ timing, velocity, gate }) {
  const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-4;
  return HUMANIZE_FEELS.find((f) => near(f.timing, timing) && near(f.velocity, velocity) && near(f.gate, gate))?.id ?? '';
}

/** Beats to milliseconds at a tempo, for labels ("0.03 beat" means little; "15 ms" does). */
export const beatsToMs = (beats, tempo) => Math.round((Number(beats) || 0) * 60000 / Math.max(20, Number(tempo) || 120));

/** A repeatable example bar for the Humanize picture: sixteen sixteenth notes, each pushed late
    by up to `timing` beats and varied by up to `velocity`. HumanizeEngine only ever delays (it
    cannot play early), and so does this. Same seed, same bar. */
export function humanizeExample({ timing, velocity, protectBeats = false, layBack = 0, swing = 0, swingGrid = 0.25,
  accent = 0 }, seed = 7, base = 96) {
  let state = seed >>> 0 || 7;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  return Array.from({ length: 16 }, (_, i) => {
    const at = i * 0.25;
    // HumanizeEngine::swingDelay: the off-beat of each pair on the swing grid moves late.
    const pos = at / swingGrid;
    const swung = swing > 0 && Math.abs(pos - Math.round(pos)) <= 0.1 && Math.round(pos) % 2 === 1
      ? swingGrid * swing * 0.5 : 0;
    return {
      step: i,
      // "Protect whole beats": a note on the beat (every fourth sixteenth) is never moved at random.
      lateBeats: (protectBeats && i % 4 === 0 ? (next(), 0) : next()) * Math.max(0, Number(timing) || 0)
        + (Number(layBack) || 0) + swung,
      velocity: Math.max(1, Math.min(127, Math.round(base + (i % 4 === 0 ? Number(accent) || 0 : 0)
        + (next() * 2 - 1) * (Number(velocity) || 0)))),
    };
  });
}

const SCALE_DEGREES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'melodic minor': [0, 2, 3, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], 'pentatonic major': [0, 2, 4, 7, 9], 'pentatonic minor': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10], 'whole tone': [0, 2, 4, 6, 8, 10],
};

/** NoteEchoEngine::climbInScale: `steps` scale degrees from `note`; -1 off the keyboard. */
export function climbInScale(note, steps, scaleType = 'chromatic', root = 0) {
  const degrees = new Set((SCALE_DEGREES[scaleType] ?? SCALE_DEGREES.chromatic).map((d) => (d + root) % 12));
  if (degrees.size === 12) return note + steps >= 0 && note + steps <= 127 ? note + steps : -1;
  let n = note;
  const dir = steps > 0 ? 1 : -1;
  for (let s = 0; s < Math.abs(steps); s += 1) {
    do { n += dir; if (n < 0 || n > 127) return -1; } while (!degrees.has(((n % 12) + 12) % 12));
  }
  return n;
}

/** What NoteEchoEngine plays for one note: the note and its repeats, each with when it starts,
    how long it lasts and how hard it plays (all in beats / MIDI velocity). */
export function echoNotes(mod, note = 60, velocity = 100, scale = { type: 'major', root: 0 }) {
  const feel = mod.echoFeel === 'dotted' ? 1.5 : mod.echoFeel === 'triplet' ? 2 / 3 : 1;
  const step = Math.min(4, Math.max(0.03125, Number(mod.echoStepBeats) || 0.5)) * feel;
  const out = [{ at: 0, note, velocity, length: step * 0.9 }];
  let v = velocity;
  let length = step * 0.9;
  for (let r = 1; r <= mod.echoRepeats; r += 1) {
    v = Math.max(mod.echoFloor ?? 1, v * mod.echoFeedback);
    const n = mod.echoScaleClimb ? climbInScale(note, r * mod.echoTranspose, scale.type, scale.root)
                                 : note + r * mod.echoTranspose;
    if (n < 0 || n > 127 || v < 1) break;
    if (mod.echoShorter) length *= 0.75;
    out.push({ at: r * step, note: n, velocity: Math.max(1, Math.min(127, Math.round(v))), length });
  }
  return out;
}

/** An example bar for the Chance picture: sixteen sixteenths at the given velocities, and which
    of them pass by ChanceEngine's rules (downbeats kept; soft notes weighted down). Same seed,
    same bar. */
export function chanceBar(mod, seed = 3, velocities = [110, 50, 80, 45, 100, 55, 75, 40, 110, 50, 85, 45, 100, 60, 80, 70]) {
  let state = seed >>> 0 || 3;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  return velocities.map((velocity, step) => {
    const p = mod.chanceSoftFirst ? Math.min(1, Math.max(0, mod.chance * (0.5 + velocity / 127))) : mod.chance;
    const roll = next();
    return { step, velocity, plays: (mod.chanceKeepDownbeats && step % 4 === 0) || roll <= p, onBeat: step % 4 === 0 };
  });
}

/** What NoteLengthEngine does to notes played with these lengths (beats): the length sent. */
export function lengthOut(mod, played) {
  return played.map(({ at, length }, i) => {
    if (mod.legato) return played[i + 1] ? played[i + 1].at - at : length;
    if (!(mod.lengthBeats > 0)) return length;
    if (mod.lengthMode === 'at most') return Math.min(length, mod.lengthBeats);
    if (mod.lengthMode === 'at least') return Math.max(length, mod.lengthBeats);
    return mod.lengthBeats;
  });
}
