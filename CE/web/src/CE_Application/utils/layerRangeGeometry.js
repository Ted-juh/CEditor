import { noteName } from './pianoGeometry.js';

export const clampLayerValue = (value, low = 0, high = 1) =>
  Math.max(low, Math.min(high, Number(value) || 0));

export const layerScale = (source) => source === 'macro' ? 100 : 127;
export const layerDisplayValue = (value, source) =>
  Math.round(clampLayerValue(value) * layerScale(source));
export const layerValueLabel = (value, source) => source === 'key'
  ? noteName(layerDisplayValue(value, source))
  : `${layerDisplayValue(value, source)}${source === 'macro' ? '%' : ''}`;

/** Matches LayerRouter::memberWeight, including fades centred on each boundary,
 * clipped source limits, overlapping ramps and full-width layers. */
export function layerWeight(member, value) {
  const low = clampLayerValue(member.minimum);
  const high = clampLayerValue(member.maximum, low);
  const fade = clampLayerValue(member.crossfade, 0, .5);
  if (fade <= 0) return value >= low && value <= high ? 1 : 0;
  const lower = low > 0 ? clampLayerValue((value - (low - fade)) / (2 * fade)) : 1;
  const upper = high < 1 ? clampLayerValue(((high + fade) - value) / (2 * fade)) : 1;
  return Math.min(lower, upper);
}

export function layerEnvelopePoints(member) {
  const low = clampLayerValue(member.minimum);
  const high = clampLayerValue(member.maximum, low);
  const fade = clampLayerValue(member.crossfade, 0, .5);
  if (!fade) return `${low * 100},40 ${low * 100},4 ${high * 100},4 ${high * 100},40`;
  // The midpoint is where overlapping lower and upper ramps intersect.
  const xs = [...new Set([0, 1, low - fade, low + fade, high - fade, high + fade,
    (low + high) / 2].map(x => clampLayerValue(x)))].sort((a, b) => a - b);
  return ['0,40', ...xs.map(x => `${x * 100},${40 - layerWeight(member, x) * 36}`), '100,40'].join(' ');
}

export function editLayerBoundary(member, field, value) {
  if (field === 'minimum') return { minimum: clampLayerValue(value, 0, member.maximum) };
  if (field === 'maximum') return { maximum: clampLayerValue(value, member.minimum, 1) };
  return { crossfade: clampLayerValue(value, 0, .5) };
}
