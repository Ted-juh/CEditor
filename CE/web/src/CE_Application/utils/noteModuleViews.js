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
export function strumOrder(pattern, count, secondStroke = false) {
  const order = Array.from({ length: count }, (_, i) => i);
  let stroke = pattern;
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
export function strumNotes({ pattern, spreadBeats, feel, velocityRamp }, notes, played = 100, secondStroke = false) {
  const sorted = [...notes].sort((a, b) => a - b);
  return strumOrder(pattern, sorted.length, secondStroke).map((index, rank) => {
    const position = strokePosition(rank, sorted.length, feel);
    return {
      note: sorted[index],
      rank,
      atBeats: spreadBeats * position,
      velocity: Math.max(1, Math.min(127, played + Math.round((Number(velocityRamp) || 0) * position))),
    };
  });
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
export function humanizeExample({ timing, velocity, protectBeats = false }, seed = 7, base = 96) {
  let state = seed >>> 0 || 7;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  return Array.from({ length: 16 }, (_, i) => ({
    step: i,
    // "Protect whole beats": a note on the beat (every fourth sixteenth) is never moved.
    lateBeats: (protectBeats && i % 4 === 0 ? (next(), 0) : next()) * Math.max(0, Number(timing) || 0),
    velocity: Math.max(1, Math.min(127, Math.round(base + (next() * 2 - 1) * (Number(velocity) || 0)))),
  }));
}
