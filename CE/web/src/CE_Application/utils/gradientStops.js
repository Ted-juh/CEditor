/**
 * Gradient stop list manipulation — pure functions returning new arrays.
 * The minimum stop count is 2; `deleteStopAt` enforces that.
 */

/** Return a copy of the stops sorted by position ascending. */
export function sortStops(stops) {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * Midpoint blend of two 6-char hex colors (per-channel average).
 * Returns an uppercase RRGGBB hex string.
 */
function midpointBlend(a, b) {
  const blend = (x, y) => Math.round((parseInt(x, 16) + parseInt(y, 16)) / 2)
    .toString(16).padStart(2, '0');
  return (blend(a.slice(0, 2), b.slice(0, 2))
        + blend(a.slice(2, 4), b.slice(2, 4))
        + blend(a.slice(4, 6), b.slice(4, 6))).toUpperCase();
}

/**
 * Insert a new stop in the largest gap between existing stops.
 * The new stop's color is a midpoint blend of the surrounding colors.
 * Returns { stops, newIndex } — newIndex is the index in the *returned*
 * stops array where the new stop lives (always the last one).
 */
export function addStopInLargestGap(stops) {
  const sorted = sortStops(stops);
  let maxGap = 0, gapStart = 0, gapEnd = 100;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].position - sorted[i].position;
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = sorted[i].position;
      gapEnd = sorted[i + 1].position;
    }
  }
  const position = Math.round((gapStart + gapEnd) / 2);
  const startColor = sorted.find(s => s.position === gapStart)?.color || '888888';
  const endColor = sorted.find(s => s.position === gapEnd)?.color || '888888';
  const color = midpointBlend(startColor, endColor);
  const newStops = [...stops, { color, position }];
  return { stops: newStops, newIndex: newStops.length - 1 };
}

/** Update one stop by index with partial changes. Returns a new array. */
export function updateStopAt(stops, index, changes) {
  return stops.map((s, i) => (i === index ? { ...s, ...changes } : s));
}

/**
 * Remove a stop if there are at least 3 (keeps minimum of 2).
 * Returns { stops, newIndex } — newIndex is the selection that should
 * follow the removal — or null if the removal was blocked.
 */
export function deleteStopAt(stops, index) {
  if (stops.length <= 2) return null;
  const newStops = stops.filter((_, i) => i !== index);
  return { stops: newStops, newIndex: Math.min(index, newStops.length - 1) };
}

/**
 * The stops of a gradient as an SVG gradient element draws them: colour as RRGGBB, position a
 * number 0–100, in order. Shared by the two SVG border drawings (SegmentedBorder.svelte,
 * OutlineBorder.svelte).
 */
export function svgGradientStops(grad) {
  if (!grad?.stops?.length) return [];
  const out = [...grad.stops]
    .map((s) => {
      const raw = s?.position;
      const parsed = typeof raw === 'number'
        ? raw
        : parseFloat(String(raw ?? '0').replace('%', ''));
      const position = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
      return {
        color: String(s?.color || 'FFFFFF').slice(-6).toUpperCase(),
        position,
      };
    })
    .sort((a, b) => a.position - b.position);

  // If persisted data accidentally stores every stop at the same position
  // (for example from malformed input), spread them evenly so gradients do
  // not collapse into a hard edge.
  if (out.length >= 2 && Math.abs(out[out.length - 1].position - out[0].position) < 0.0001) {
    const denom = Math.max(1, out.length - 1);
    for (let i = 0; i < out.length; i++) out[i].position = (i / denom) * 100;
  }

  return out;
}
