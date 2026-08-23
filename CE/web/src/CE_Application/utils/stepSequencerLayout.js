// stepSequencerLayout.js — steps across, tracks down, a playhead walking left to right.
//
// The other half of the backlog's "substantial new work". What makes it substantial is not the
// grid — the generator grid draws that already — but the TRANSPORT: a playhead, a pattern that
// advances, and the fact that time here is wall-clock rather than tempo-locked.
//
// THE TEMPO CAVEAT IS LOAD-BEARING and the backlog flagged it: the Timer is wall-clock, so a
// sequence set to 120 BPM runs at 120 BPM on its own and drifts against a DAW's transport. Rather
// than pretend otherwise, the step time is derived from a BPM the component owns and the component
// says so; a Transport component on the panel can drive it, which is what tempo-sync means here
// until MIDI clock in exists.
//
// SEPARATE FROM THE PAD GRID, deliberately, and from the mod matrix. All three are steps × tracks
// grids and they are three different questions: a pad grid triggers, a matrix routes, a sequencer
// PLAYS — it owns a position in time and nothing else here does.
//
// PURE. The Timer drives `advance` and the preview surface emits what `stepNotes` returns.

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clampInt = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(value, lo))));

/** Direction the playhead walks. */
export const STEP_DIRECTION = {
  forward: 'forward',
  reverse: 'reverse',
  /** Out and back, without repeating the end steps — the musical ping-pong, not the naïve one. */
  pingpong: 'pingpong',
  random: 'random',
};

/** How many steps a bar of each division holds, for the readout. */
export const STEP_DIVISIONS = {
  '1/4': 1, '1/8': 2, '1/8T': 3, '1/16': 4, '1/16T': 6, '1/32': 8,
};

export function sequencerConfig(control) {
  return control?._children?.StepSequencer ?? {};
}

export function sequencerSteps(control) {
  return clampInt(sequencerConfig(control).steps ?? 16, 1, 64);
}

export function sequencerTracks(control) {
  const tracks = sequencerConfig(control).tracks;
  if (Array.isArray(tracks) && tracks.length) return tracks;
  return [{ id: 't0', label: 'Track 1', note: 36, channel: 10, colour: 'FF5B9BD5', muted: false }];
}

/**
 * The pattern, as a tracks × steps grid of cells.
 *
 * Stored sparsely — a cell is `{ on, velocity }` and an absent one is off — because a 64-step,
 * 16-track pattern is a thousand cells and a panel file that carried a thousand `false`s for every
 * sequencer would be mostly punctuation.
 */
export function sequencerPattern(control) {
  const pattern = sequencerConfig(control).pattern;
  return pattern && typeof pattern === 'object' ? pattern : {};
}

export function cellKey(trackId, step) {
  return `${trackId}:${step}`;
}

export function cellAt(control, trackId, step) {
  return sequencerPattern(control)[cellKey(trackId, step)] ?? null;
}

export function isCellOn(control, trackId, step) {
  return cellAt(control, trackId, step)?.on === true;
}

/** Toggle a cell, returning the whole pattern. An off cell is DELETED rather than stored as false. */
export function toggleCell(pattern, trackId, step, { velocity = 100 } = {}) {
  const key = cellKey(trackId, step);
  const next = { ...(pattern ?? {}) };
  if (next[key]?.on) delete next[key];
  else next[key] = { on: true, velocity: clampInt(velocity, 1, 127) };
  return next;
}

/** Set a cell's velocity without changing whether it is on. */
export function setCellVelocity(pattern, trackId, step, velocity) {
  const key = cellKey(trackId, step);
  if (!pattern?.[key]?.on) return pattern ?? {};
  return { ...pattern, [key]: { ...pattern[key], velocity: clampInt(velocity, 1, 127) } };
}

/**
 * How long one step lasts, in milliseconds.
 *
 * Wall-clock, from the component's own BPM. Named `stepMs` rather than anything suggesting a
 * musical grid, because that is exactly what it is not: two sequencers at the same BPM started a
 * second apart stay a second apart.
 */
export function stepMs(control) {
  const config = sequencerConfig(control);
  const bpm = Math.max(20, Math.min(300, num(config.bpm, 120)));
  const perBeat = STEP_DIVISIONS[String(config.division ?? '1/16')] ?? 4;
  return 60000 / bpm / perBeat;
}

/**
 * Where the playhead goes next.
 *
 * `state` carries the direction it is currently travelling, which ping-pong needs and nothing else
 * does — deriving it from the position alone is impossible at the turning points, and a sequencer
 * that guesses wrong there stutters on the last step every other pass.
 */
export function advanceStep(position, steps, direction = STEP_DIRECTION.forward, state = {}) {
  const count = Math.max(1, Math.round(steps));
  const at = ((Math.round(num(position, 0)) % count) + count) % count;

  if (count === 1) return { position: 0, forward: true, wrapped: true };

  switch (direction) {
    case STEP_DIRECTION.reverse: {
      const next = at - 1;
      return { position: next < 0 ? count - 1 : next, forward: false, wrapped: next < 0 };
    }
    case STEP_DIRECTION.pingpong: {
      const forward = state.forward !== false;
      // The ends are NOT repeated: at the last step the direction flips and the next step is the
      // one before it. Repeating the end is the naïve ping-pong and it makes a sixteen-step pattern
      // sound thirty steps long with two stutters in it.
      if (forward) {
        if (at >= count - 1) return { position: count - 2, forward: false, wrapped: false };
        return { position: at + 1, forward: true, wrapped: false };
      }
      if (at <= 0) return { position: 1, forward: true, wrapped: true };
      return { position: at - 1, forward: false, wrapped: false };
    }
    case STEP_DIRECTION.random: {
      // Never the same step twice running: a random walk that repeats reads as a stuck sequencer,
      // and the fix is one line here rather than an explanation in a support thread.
      const offset = 1 + Math.floor(Math.random() * (count - 1));
      return { position: (at + offset) % count, forward: true, wrapped: false };
    }
    default: {
      const next = at + 1;
      return { position: next % count, forward: true, wrapped: next >= count };
    }
  }
}

/**
 * The notes a step fires.
 *
 * Muted tracks contribute nothing, and a track with no cell on this step contributes nothing —
 * which is not the same as a rest, and the difference matters for the gate length below.
 */
export function stepNotes(control, step) {
  const pattern = sequencerPattern(control);
  const config = sequencerConfig(control);
  const out = [];

  for (const track of sequencerTracks(control)) {
    if (track?.muted === true) continue;
    const cell = pattern[cellKey(track.id, step)];
    if (!cell?.on) continue;
    out.push({
      trackId: String(track.id),
      note: clampInt(track.note ?? 36, 0, 127),
      velocity: clampInt(cell.velocity ?? track.velocity ?? 100, 1, 127),
      channel: clampInt(track.channel ?? config.channel ?? 10, 1, 16),
    });
  }
  return out;
}

/**
 * How long a step's notes are held.
 *
 * A percentage of the step, not a fixed time: change the tempo and the gate follows, which is what
 * anybody adjusting BPM expects. Capped just under 100% so consecutive steps on one track produce
 * two notes rather than one long one — a sequencer whose repeated notes merge is a sequencer that
 * cannot play a repeated note.
 */
export function gateMs(control) {
  const gate = Math.max(1, Math.min(99, num(sequencerConfig(control).gate, 60)));
  return (stepMs(control) * gate) / 100;
}

/** Grid geometry: a row per track, a column per step, with a lane for the track headers. */
export function sequencerGeometry(width, height, control) {
  const config = sequencerConfig(control);
  const pad = num(config.padding, 6);
  const headerW = num(config.trackHeaderWidth, 64);
  const steps = sequencerSteps(control);
  const tracks = sequencerTracks(control).length;

  const gridX = pad + headerW;
  const gridY = pad;
  const gridW = Math.max(1, num(width, 0) - gridX - pad);
  const gridH = Math.max(1, num(height, 0) - gridY - pad);

  return {
    pad,
    headerW,
    x0: gridX,
    y0: gridY,
    width: gridW,
    height: gridH,
    cellW: gridW / steps,
    cellH: gridH / Math.max(1, tracks),
    steps,
    tracks,
  };
}

/** One cell's rectangle. */
export function cellRect(geom, trackIndex, step) {
  const gap = 1;
  return {
    x: geom.x0 + step * geom.cellW + gap,
    y: geom.y0 + trackIndex * geom.cellH + gap,
    w: Math.max(1, geom.cellW - gap * 2),
    h: Math.max(1, geom.cellH - gap * 2),
  };
}

/** Which cell a point is in, or null. */
export function cellAtPoint(geom, px, py) {
  const x = num(px, -1);
  const y = num(py, -1);
  if (x < geom.x0 || y < geom.y0 || x > geom.x0 + geom.width || y > geom.y0 + geom.height) return null;
  const step = Math.floor((x - geom.x0) / geom.cellW);
  const trackIndex = Math.floor((y - geom.y0) / geom.cellH);
  if (step < 0 || step >= geom.steps || trackIndex < 0 || trackIndex >= geom.tracks) return null;
  return { step, trackIndex };
}

/**
 * Which step columns get the heavier line.
 *
 * Every fourth by default, because a sixteen-step grid with no beat markers is sixteen identical
 * boxes and nobody can see where beat three is.
 */
export function beatLines(control) {
  const per = clampInt(sequencerConfig(control).beatEvery ?? 4, 1, 16);
  const steps = sequencerSteps(control);
  const lines = [];
  for (let step = per; step < steps; step += per) lines.push(step);
  return lines;
}

export function sequencerPorts(control, parameterTypes = null) {
  const types = parameterTypes ?? {};
  const numeric = [types.INTEGER ?? 'integer', types.FLOAT ?? 'float'].filter(Boolean);
  return [
    { id: 'position', label: 'Playhead', accepts: numeric, defaultBindingMode: 'continuous' },
    { id: 'bpm', label: 'Tempo', accepts: numeric, defaultBindingMode: 'continuous' },
    { id: 'running', label: 'Running', accepts: [types.BOOLEAN ?? 'boolean'], defaultBindingMode: 'onCommit' },
  ];
}
