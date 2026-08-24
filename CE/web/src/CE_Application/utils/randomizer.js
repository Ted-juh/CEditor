// randomizer.js — generate a patch inside the profile's own ranges, with locks.
//
// THE THING THAT MAKES IT USEFUL rather than a toy: it is CONSTRAINED. A randomiser that writes
// arbitrary bytes produces noise and a synth that needs a power cycle. This one only ever writes
// values the profile says are legal, only to parameters the user has not locked, and only in the
// scope they chose — so the worst outcome is a patch nobody likes, which is the point.
//
// THREE MODES, and they are genuinely different operations rather than one with a knob:
//
//   full       every unlocked parameter, anywhere in its range. A new patch.
//   humanize   every unlocked parameter nudged by a small percentage of its own range. The patch
//              you have, slightly different — which is what people actually reach for.
//   scoped     full, but only inside a chosen group. "Randomise the filter."
//
// UNDO IS A SNAPSHOT, not a special case: capture before, recall after. That is why this module
// produces a value map rather than writing anything — the caller snapshots, applies, and can put it
// back with the machinery that already exists.
//
// DETERMINISM. The generator takes a `random` function, so a test can hand it a sequence and a user
// can be given a seed. `Math.random` is the default and nothing here calls it directly, which also
// keeps the module usable from a workflow script where Date.now/Math.random are unavailable.

import { clampToParameter } from './panelValueAccess.js';

export const RANDOMIZE_MODE = {
  full: 'full',
  humanize: 'humanize',
  scoped: 'scoped',
};

/** How far `humanize` moves a parameter, as a fraction of its own range. */
export const HUMANIZE_AMOUNT = 0.08;

/**
 * Can this parameter be randomised at all?
 *
 * Two refusals, and both are about not producing something the instrument cannot be. A `text` or
 * `patchName` parameter has no range to draw from — a random patch name is a random string, which
 * is vandalism rather than randomisation. A parameter with no usable span has one legal value.
 */
export function isRandomizable(parameter) {
  const kind = String(parameter?.valueKind ?? 'float');
  if (kind === 'text' || kind === 'patchName' || kind === 'none') return false;
  const min = Number(parameter?.min ?? 0);
  const max = Number(parameter?.max ?? 1);
  return Number.isFinite(min) && Number.isFinite(max) && max !== min;
}

/**
 * One random value for one parameter.
 *
 * A `choice` or `bool` lands on a whole step, always. Handing a synth 2.4 for a five-way waveform
 * selector is exactly the class of thing the constraint exists to prevent — the byte either gets
 * rounded somewhere arbitrary or is not a waveform at all.
 */
export function randomValueFor(parameter, random, { mode = RANDOMIZE_MODE.full, current = null } = {}) {
  const min = Math.min(Number(parameter.min ?? 0), Number(parameter.max ?? 1));
  const max = Math.max(Number(parameter.min ?? 0), Number(parameter.max ?? 1));
  const kind = String(parameter?.valueKind ?? 'float');
  const stepped = kind === 'choice' || kind === 'bool';

  let value;
  if (mode === RANDOMIZE_MODE.humanize && Number.isFinite(Number(current))) {
    // Symmetric around where it is: (r - 0.5) * 2 * amount * span.
    const nudge = (random() - 0.5) * 2 * HUMANIZE_AMOUNT * (max - min);
    value = Number(current) + nudge;
  } else {
    value = min + random() * (max - min);
  }

  if (stepped) value = Math.round(value);
  return clampToParameter(parameter, value);
}

/**
 * A whole randomised value map.
 *
 * Returns what it did AND what it refused, because a randomiser that appears to do nothing is
 * indistinguishable from one that is broken: a panel where every parameter is locked, or one whose
 * only parameters are patch names, should say so rather than shrug.
 */
export function randomizeValues(parameters, {
  mode = RANDOMIZE_MODE.full,
  locked = new Set(),
  groups = null,
  current = {},
  random = Math.random,
} = {}) {
  const lockedIds = locked instanceof Set ? locked : new Set(locked ?? []);
  const wantedGroups = groups instanceof Set ? groups : (Array.isArray(groups) ? new Set(groups) : null);

  const values = {};
  const skipped = { locked: [], outOfScope: [], notRandomizable: [] };

  for (const parameter of parameters ?? []) {
    if (lockedIds.has(parameter.id)) { skipped.locked.push(parameter.id); continue; }

    if (mode === RANDOMIZE_MODE.scoped && wantedGroups) {
      const group = String(parameter.group ?? parameter.controlName ?? '');
      if (!wantedGroups.has(group)) { skipped.outOfScope.push(parameter.id); continue; }
    }

    if (!isRandomizable(parameter)) { skipped.notRandomizable.push(parameter.id); continue; }

    values[parameter.id] = randomValueFor(parameter, random, { mode, current: current[parameter.id] });
  }

  return {
    values,
    changed: Object.keys(values).length,
    skipped,
    // The one-line answer to "why did nothing happen".
    reason: Object.keys(values).length > 0 ? '' : reasonNothingHappened(skipped, parameters),
  };
}

function reasonNothingHappened(skipped, parameters) {
  if (!parameters?.length) return 'This panel exposes no parameters to randomise.';
  if (skipped.locked.length && !skipped.outOfScope.length && !skipped.notRandomizable.length) {
    return `All ${skipped.locked.length} parameter(s) are locked.`;
  }
  if (skipped.outOfScope.length) return 'No parameters are in the chosen scope.';
  if (skipped.notRandomizable.length) {
    return `None of the ${skipped.notRandomizable.length} parameter(s) here can be randomised — `
      + 'text and single-valued parameters have nothing to draw from.';
  }
  return 'Nothing to randomise.';
}

/**
 * A seeded generator, so a randomisation can be reproduced.
 *
 * mulberry32: four lines, well-distributed enough for this, and — the property that matters — it
 * is deterministic from an integer a user can write down and hand to somebody else.
 */
export function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
