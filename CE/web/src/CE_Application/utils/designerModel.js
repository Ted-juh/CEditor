/**
 * designerModel.js — the working parts of the Designer tab, with no Svelte in them.
 *
 * WHY THIS TAB EXISTS. Fourteen components in this app have a section that is really a small
 * editor: a grid, a curve, a keyboard, a step pattern. None of their CONTENT can be authored.
 *
 * There are two places it could be, and neither works:
 *
 *   1. The properties panel has no drawing surface for any of them. It has numbers, dropdowns and
 *      read-only text — the Arp prints its muted steps as `mutes.join(', ')`, the Envelope prints
 *      its curve as one row of two number boxes per node.
 *   2. Preview mode does have drawing for several of them — and preview is a REHEARSAL.
 *      `stores/previewRehearsal.js` photographs the panels store when preview starts and puts it
 *      back when preview stops, on purpose, so that a runtime script cannot edit the author's file
 *      behind their back. A pattern drawn by hand goes back with it.
 *
 *      Measured: draw two cells into a Phrase during preview, leave preview, and the pattern is the
 *      eight starter cells again.
 *
 * So the fix is not another drawing surface in preview. It is a drawing surface at DESIGN time,
 * whose writes are ordinary authored edits — undoable, autosaved, kept.
 *
 * AND THE STEP SEQUENCER CANNOT BE DRAWN EVEN IN PREVIEW. `stepSequencerLayout.js` exports 24
 * things. Seven are never imported anywhere, and five of those seven are exactly the editing half:
 * `cellAtPoint` (which cell is under the pointer), `cellAt` and `isCellOn` (read one), `toggleCell`
 * and `setCellVelocity` (write one). The default pattern is `{}`. So a Step Sequencer draws an empty
 * grid and plays silence — in the editor, in preview, and in the exported player.
 *
 * `designerModel.test.js` pins both facts against the shipped sources.
 *
 * NOTHING IS MOVED. Every section editor still draws every row it drew before.
 */

import {
  sequencerConfig, sequencerSteps, sequencerTracks, sequencerPattern,
  cellKey, toggleCell, setCellVelocity,
} from './stepSequencerLayout.js';
import { envelopeConfig, envelopePoints, envelopeStageValues } from './envelopeLayout.js';
import { turingConfig, turingLength, turingSteps, gateAt, stepOutput } from './turingLayout.js';

/**
 * The components whose content is a drawing.
 *
 * `built` says whether this tab has a designer for it yet. The list carries the ones it does not,
 * rather than only the three it does, because the tab has to be able to say "not this one yet" and
 * name what it can do — and because the count is the argument for the tab existing.
 *
 * `height` is measured, not estimated: each section editor mounted in Chromium at a 340px panel
 * width with a default control, every section it draws included. See the design record.
 */
export const DESIGNER_COMPONENTS = [
  { type: 'StepSequencer', label: 'Step Sequencer', section: 'StepSequencer', content: 'pattern', shape: 'grid', built: true, height: 388 },
  { type: 'Envelope', label: 'Envelope', section: 'Envelope', content: 'points', shape: 'curve', built: true, height: 516 },
  { type: 'Turing', label: 'Turing Modulator', section: 'Turing', content: 'steps', shape: 'bars', built: true, height: 335 },
  { type: 'Arp', label: 'Arpeggiator', section: 'Arp', content: 'mutes', shape: 'lane', built: false, height: 625 },
  { type: 'Phrase', label: 'Phrase Sequencer', section: 'Phrase', content: 'pattern', shape: 'grid', built: false, height: 943 },
  { type: 'SplitZone', label: 'Zone Splitter', section: 'SplitZone', content: 'splitZones', shape: 'keyboard', built: false, height: 476 },
  { type: 'Harmoniser', label: 'Harmoniser', section: 'Harmoniser', content: 'degrees', shape: 'keyboard', built: false, height: 831 },
  { type: 'ChordPad', label: 'Chord Pad', section: 'ChordPad', content: 'pads', shape: 'grid', built: false, height: 502 },
  { type: 'DrumPads', label: 'Drum Pads', section: 'DrumPads', content: 'pads', shape: 'grid', built: false, height: 1017 },
  { type: 'Router', label: 'Expression Router', section: 'Router', content: 'destinations', shape: 'curve', built: false, height: 568 },
  { type: 'Transport', label: 'Transport', section: 'Transport', content: 'divisions', shape: 'lane', built: false, height: 347 },
  { type: 'Recorder', label: 'Phrase Recorder', section: 'Recorder', content: 'takes', shape: 'lane', built: false, height: 912 },
  { type: 'Numpad', label: 'Numpad', section: 'Numpad', content: 'keys', shape: 'grid', built: false, height: 235 },
  { type: 'Kinetic', label: 'Kinetic Modulator', section: 'Kinetic', content: 'field', shape: 'field', built: false, height: 448 },
];

export function controlTypeOf(control) {
  return String(control?._children?.Core?.controlType ?? '');
}

/** The registry row for a component type, or null. */
export function designerFor(type) {
  return DESIGNER_COMPONENTS.find((entry) => entry.type === String(type ?? '')) ?? null;
}

/** The row for a control, or null when the component has no drawn content at all. */
export function designerForControl(control) {
  return designerFor(controlTypeOf(control));
}

export function builtDesigners() {
  return DESIGNER_COMPONENTS.filter((entry) => entry.built);
}

export function pendingDesigners() {
  return DESIGNER_COMPONENTS.filter((entry) => !entry.built);
}

/** What the properties panel spends on these components today, measured. */
export function designerPanelHeight() {
  return DESIGNER_COMPONENTS.reduce((sum, entry) => sum + entry.height, 0);
}

// --- Step Sequencer ---------------------------------------------------------
// The pattern is a sparse map keyed "trackId:step" holding `{ on, velocity }`. An off cell is
// absent rather than stored as false, which is why every helper here returns a whole new map.

export const EMPTY_PATTERN = {};

/** One row per track, with its cells read out as a plain array — what the tab draws its list from. */
export function sequencerRows(control) {
  const steps = sequencerSteps(control);
  const pattern = sequencerPattern(control);
  return sequencerTracks(control).map((track, index) => {
    const cells = [];
    for (let step = 0; step < steps; step += 1) {
      const cell = pattern[cellKey(track.id, step)];
      cells.push(cell?.on === true ? { on: true, velocity: Number(cell.velocity ?? 100) } : { on: false, velocity: null });
    }
    return {
      index,
      id: String(track.id ?? `t${index}`),
      label: String(track.label ?? `Track ${index + 1}`),
      note: Number(track.note ?? 36),
      channel: Number(track.channel ?? 10),
      muted: track.muted === true,
      colour: track.colour ?? null,
      cells,
      onCount: cells.filter((cell) => cell.on).length,
    };
  });
}

/** How many cells are lit across the whole pattern. Zero is the state every sequencer ships in. */
export function litCells(control) {
  return Object.values(sequencerPattern(control)).filter((cell) => cell?.on === true).length;
}

/** Clear one track's row, leaving every other track alone. */
export function clearRow(pattern, trackId, steps) {
  const next = { ...(pattern ?? {}) };
  for (let step = 0; step < steps; step += 1) delete next[cellKey(trackId, step)];
  return next;
}

/**
 * Light every `every`-th step of a row, starting at `offset`, and clear the rest of it.
 *
 * This is the button a hardware sequencer has and a grid of sixteen boxes needs: four-on-the-floor
 * is one click rather than four, and off-beat hats are one click rather than eight.
 */
export function fillEvery(pattern, trackId, steps, every, offset = 0, velocity = 100) {
  const gap = Math.max(1, Math.round(Number(every) || 1));
  const start = Math.max(0, Math.round(Number(offset) || 0));
  let next = clearRow(pattern, trackId, steps);
  for (let step = start; step < steps; step += gap) {
    next = toggleCell(next, trackId, step, { velocity });
  }
  return next;
}

/** Rotate one row by `by` steps, wrapping. Negative moves it earlier. */
export function shiftRow(pattern, trackId, steps, by) {
  const count = Math.max(1, Math.round(steps));
  const move = ((Math.round(Number(by) || 0) % count) + count) % count;
  if (move === 0) return { ...(pattern ?? {}) };
  const source = [];
  for (let step = 0; step < count; step += 1) source.push((pattern ?? {})[cellKey(trackId, step)] ?? null);
  let next = clearRow(pattern, trackId, count);
  for (let step = 0; step < count; step += 1) {
    const cell = source[step];
    if (cell?.on !== true) continue;
    const to = (step + move) % count;
    next = toggleCell(next, trackId, to, { velocity: cell.velocity ?? 100 });
  }
  return next;
}

/** Every lit step goes out, every dark step comes on. */
export function invertRow(pattern, trackId, steps, velocity = 100) {
  const count = Math.max(1, Math.round(steps));
  let next = { ...(pattern ?? {}) };
  for (let step = 0; step < count; step += 1) {
    const on = next[cellKey(trackId, step)]?.on === true;
    next = on ? clearCell(next, trackId, step) : toggleCell(next, trackId, step, { velocity });
  }
  return next;
}

/** One cell off, whatever it was. `toggleCell` flips; this one is definite. */
export function clearCell(pattern, trackId, step) {
  const next = { ...(pattern ?? {}) };
  delete next[cellKey(trackId, step)];
  return next;
}

/** One cell on at a chosen velocity, whatever it was. */
export function setCell(pattern, trackId, step, velocity = 100) {
  return { ...(pattern ?? {}), [cellKey(trackId, step)]: { on: true, velocity: clampVelocity(velocity) } };
}

export function cellVelocity(pattern, trackId, step) {
  const cell = (pattern ?? {})[cellKey(trackId, step)];
  return cell?.on === true ? clampVelocity(cell.velocity ?? 100) : null;
}

/** Change one lit cell's velocity. The shipped `setCellVelocity` does the work — it had no caller. */
export function writeCellVelocity(pattern, trackId, step, velocity) {
  return setCellVelocity(pattern ?? {}, trackId, step, clampVelocity(velocity));
}

function clampVelocity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 100;
  return n < 1 ? 1 : n > 127 ? 127 : n;
}

/** The step count and the beat spacing, so the tab can group the grid without re-deriving them. */
export function sequencerShape(control) {
  const config = sequencerConfig(control);
  return {
    steps: sequencerSteps(control),
    tracks: sequencerTracks(control).length,
    beatEvery: Math.max(1, Math.round(Number(config.beatEvery ?? 4) || 4)),
  };
}

// --- Envelope ---------------------------------------------------------------

/** The breakpoints, with what the panel's node rows leave out: which one sustains, which are ends. */
export function envelopeRows(control) {
  const points = envelopePoints(control);
  const config = envelopeConfig(control);
  const sustain = Math.round(Number(config.sustainIndex ?? -1));
  const locked = Array.isArray(config.lockYIndices) ? config.lockYIndices.map(Number) : [];
  return points.map((point, index) => ({
    index,
    id: String(point.id ?? `e${index}`),
    x: Number(point.x ?? 0),
    y: Number(point.y ?? 0),
    curve: String(point.curve ?? 'linear'),
    isSustain: index === sustain,
    isEnd: index === 0 || index === points.length - 1,
    yLocked: locked.includes(index),
  }));
}

/** Attack / decay / sustain / release, in the time unit the component reads out. */
export function envelopeStages(control) {
  const stages = envelopeStageValues(control);
  const config = envelopeConfig(control);
  const span = Number(config.timeMax ?? 1000) || 1000;
  return {
    ...stages,
    attackMs: Math.round(stages.attack * span),
    decayMs: Math.round(stages.decay * span),
    releaseMs: Math.round(stages.release * span),
    unit: String(config.timeUnit ?? 'ms'),
  };
}

/** A curve that is one flat line says nothing, and is what a bad drag leaves behind. */
export function envelopeIsFlat(control) {
  const ys = envelopePoints(control).map((point) => Number(point.y ?? 0));
  return ys.length > 0 && Math.max(...ys) - Math.min(...ys) < 0.001;
}

/** Snap a normalized value to a grid, or leave it alone when the grid is off. */
export function snapTo(value, step) {
  const grid = Number(step) || 0;
  const n = Number(value) || 0;
  if (grid <= 0) return n;
  return Math.round(n / grid) * grid;
}

// --- Turing -----------------------------------------------------------------

/**
 * The register, one row per step.
 *
 * `value` is what is stored; `output` is what the component actually plays, which differs the
 * moment `quantizeLevels` is on — the panel shows the levels count and never what it does to the
 * numbers. `gate` is the port the step would fire.
 */
export function turingRows(control) {
  const config = turingConfig(control);
  const steps = turingSteps(control);
  const length = turingLength(control);
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    rows.push({
      index,
      value: clamp01(steps[index]),
      output: stepOutput(steps, index, config.quantizeLevels),
      gate: gateAt(steps, index, config.gateThreshold) === 1,
    });
  }
  return rows;
}

/** One step to a chosen value. `mutateStep` is gated on the randomness roll; a drag is not. */
export function writeStep(steps, index, value) {
  const list = (Array.isArray(steps) ? steps : []).map(clamp01);
  if (index < 0 || index >= list.length) return list;
  list[index] = clamp01(value);
  return list;
}

/** Snap every step to N levels — the same levels `quantizeLevels` makes the component play. */
export function quantizeAll(steps, levels) {
  const n = Math.round(Number(levels) || 0);
  const list = (Array.isArray(steps) ? steps : []).map(clamp01);
  if (n < 2) return list;
  return list.map((value) => Math.round(value * (n - 1)) / (n - 1));
}

/** Rotate the register, wrapping. This is the one edit that makes a locked loop feel different. */
export function rotateSteps(steps, by) {
  const list = (Array.isArray(steps) ? steps : []).map(clamp01);
  const count = list.length;
  if (count < 2) return list;
  const move = ((Math.round(Number(by) || 0) % count) + count) % count;
  if (move === 0) return list;
  return list.map((_, index) => list[(index - move + count * 2) % count]);
}

/** The register grown or trimmed to `length`, keeping what is already there. */
export function resizeSteps(steps, length, fill = 0.5) {
  const n = Math.max(2, Math.min(64, Math.round(Number(length) || 8)));
  const list = (Array.isArray(steps) ? steps : []).map(clamp01);
  const out = [];
  for (let index = 0; index < n; index += 1) out.push(index < list.length ? list[index] : clamp01(fill));
  return out;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Every label this tab can edit.
 *
 * The properties panel builds its search box from the rows it draws. When these rows eventually
 * leave the panel, the search has to be fed from here instead.
 */
export function allDesignerFieldLabels() {
  return ['Pattern', 'Velocity', 'Track', 'Nodes', 'Curve', 'Sustain', 'Register', 'Step value', 'Length'];
}
