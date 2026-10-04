/**
 * "More like this, but brighter." The closest measured sounds that differ from this one in one
 * direction: every other measurement counts towards the distance, and the one being nudged has
 * to have moved at least a small step the asked way. Worked out from the measurements the
 * records already carry, so it only looks at the sounds the browser holds.
 */

export const NUDGES = Object.freeze([
  { id: 'brighter', axis: 'brightness', sign: 1, label: 'Brighter' },
  { id: 'darker', axis: 'brightness', sign: -1, label: 'Darker' },
  { id: 'shorter', axis: 'tail', sign: -1, label: 'Shorter' },
  { id: 'longer', axis: 'tail', sign: 1, label: 'Longer' },
  { id: 'wider', axis: 'width', sign: 1, label: 'Wider' },
  { id: 'cleaner', axis: 'noisiness', sign: -1, label: 'Cleaner' },
]);

const AXES = ['brightness', 'attack', 'tail', 'width', 'noisiness'];

export function nudgedNeighbours(record, candidates, nudgeId, { limit = 6, minStep = 0.06 } = {}) {
  const nudge = NUDGES.find((n) => n.id === nudgeId);
  if (!nudge || !record?.sonic || record.sonic.silent) return [];
  const from = record.sonic;
  return candidates
    .filter((c) => c.recordId !== record.recordId && c.sonic && !c.sonic.silent)
    .map((c) => {
      let squared = 0;
      for (const axis of AXES) if (axis !== nudge.axis) squared += ((c.sonic[axis] ?? 0) - (from[axis] ?? 0)) ** 2;
      return { record: c, distance: Math.sqrt(squared), step: ((c.sonic[nudge.axis] ?? 0) - (from[nudge.axis] ?? 0)) * nudge.sign };
    })
    .filter((o) => o.step >= minStep)
    .sort((a, b) => a.distance - b.distance || a.step - b.step)
    .slice(0, limit)
    .map((o) => ({ ...o, percent: Math.round(Math.max(0, 1 - o.distance / 1.5) * 100) }));
}
