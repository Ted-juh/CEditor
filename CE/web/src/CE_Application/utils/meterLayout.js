// Meter — pure math for a value-driven level meter: normalize a value (linear
// or dB) into a 0..1 fill position, split it into LED segments, colour it by
// threshold zones, track a falling peak-hold marker, place scale ticks, and
// map a position onto an arc angle. No DOM / store deps, so it's shared by the
// renderer (draw) and the preview surface (peak tracking) and unit-tested.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

// A plain fraction, or the fraction's decibel value across [dbFloor, dbCeil].
export const METER_SCALES = ['linear', 'db'];

export function meterConfig(control) {
  return control?._children?.Meter ?? {};
}

// The linear fraction of a raw value within [min, max] (0..1).
export function meterLinearFraction(value, min, max) {
  const lo = num(min, 0);
  const hi = num(max, 1);
  if (hi === lo) return 0;
  return clamp01((num(value, lo) - lo) / (hi - lo));
}

// The fill position 0..1 for a value under the configured scale. 'linear' is the
// plain fraction; 'db' maps the fraction's decibel value across [dbFloor, dbCeil]
// so a level meter reads in dB (0 dB ≈ full-scale fraction 1.0).
export function meterPosition(value, cfg = {}) {
  const frac = meterLinearFraction(value, cfg.valueMin ?? 0, cfg.valueMax ?? 1);
  if (String(cfg.scale) !== 'db') return frac;
  const floor = num(cfg.dbFloor, -60);
  const ceil = num(cfg.dbCeil, 6);
  if (ceil === floor) return 0;
  const db = 20 * Math.log10(Math.max(frac, 1e-4));
  return clamp01((db - floor) / (ceil - floor));
}

// Normalized zone thresholds sorted low→high, each { from (0..1), colour }.
// Defaults to a single full-range zone when none are configured.
export function meterZones(cfg = {}) {
  const zones = Array.isArray(cfg.zones) ? cfg.zones : [];
  const usable = zones
    .map((z) => ({ from: clamp01(num(z?.from, 0)), colour: String(z?.colour ?? '') }))
    .filter((z) => z.colour)
    .sort((a, b) => a.from - b.from);
  if (!usable.length) return [{ from: 0, colour: String(cfg.fillColour ?? '') || 'FF39D98A' }];
  if (usable[0].from > 0) usable.unshift({ from: 0, colour: usable[0].colour });
  return usable;
}

// The zone colour that applies at position `pos` (the last zone whose `from` ≤ pos).
export function meterZoneColourAt(pos, cfg = {}) {
  const zones = meterZones(cfg);
  const p = clamp01(num(pos, 0));
  let colour = zones[0].colour;
  for (const z of zones) { if (p >= z.from) colour = z.colour; else break; }
  return colour;
}

// How many of `n` LED segments are lit at position `pos`. Segments are indexed
// 0..n-1; segment i is lit when i < litCount. Rounds so the tip segment lights
// once the fill passes its midpoint.
export function meterSegmentsLit(pos, n) {
  const count = Math.max(0, Math.round(num(n, 0)));
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count, Math.round(clamp01(num(pos, 0)) * count)));
}

// The centre position (0..1) of LED segment `i` of `n` — for colouring each
// segment by its own zone.
export function meterSegmentCenter(i, n) {
  const count = Math.max(1, num(n, 1));
  return clamp01((num(i, 0) + 0.5) / count);
}

// Peak-hold: the marker jumps up to any new maximum, holds for `holdMs`, then
// falls at `decayPerSec` (normalized units/second). Pure: given the previous
// peak + when it was set and the current position + time, returns the next
// { peak, peakAt }. `peakAt` anchors to the last rise so the hold/decay clock
// is stable across calls.
export function meterPeak({ prevPeak = 0, prevPeakAt = 0, pos = 0, now = 0, holdMs = 1200, decayPerSec = 0.4 }) {
  const p = clamp01(num(pos, 0));
  const last = clamp01(num(prevPeak, 0));
  if (p >= last) return { peak: p, peakAt: num(now, 0) };
  const elapsed = num(now, 0) - num(prevPeakAt, 0);
  if (elapsed < num(holdMs, 0)) return { peak: last, peakAt: num(prevPeakAt, 0) };
  const fallen = last - num(decayPerSec, 0) * ((elapsed - num(holdMs, 0)) / 1000);
  return { peak: Math.max(p, clamp01(fallen)), peakAt: num(prevPeakAt, 0) };
}

// Tick positions (0..1) and their value/label along the scale. `count` ticks
// gives count+1 marks (including both ends). Labels are the scale value at each
// mark: raw value for linear, dB for a dB scale.
export function meterTicks(cfg = {}, count = 4) {
  const n = Math.max(1, Math.round(num(count, 4)));
  const lo = num(cfg.valueMin, 0);
  const hi = num(cfg.valueMax, 1);
  const db = String(cfg.scale) === 'db';
  const floor = num(cfg.dbFloor, -60);
  const ceil = num(cfg.dbCeil, 6);
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const pos = i / n;
    const value = db ? (floor + pos * (ceil - floor)) : (lo + pos * (hi - lo));
    out.push({ pos, value });
  }
  return out;
}

// Map a fill position 0..1 to an angle (degrees) along an arc that starts at
// `startDeg` and sweeps `sweepDeg` (clockwise-positive in SVG screen space).
export function meterArcAngle(pos, startDeg = 135, sweepDeg = 270) {
  return num(startDeg, 135) + clamp01(num(pos, 0)) * num(sweepDeg, 270);
}

// Cartesian point on a circle (SVG coords: y grows downward, angle clockwise
// from the +x axis / 3 o'clock).
export function meterPolar(cx, cy, r, angleDeg) {
  const a = (num(angleDeg, 0) * Math.PI) / 180;
  return { x: num(cx, 0) + num(r, 0) * Math.cos(a), y: num(cy, 0) + num(r, 0) * Math.sin(a) };
}

// An SVG arc path ("M…A…") from `fromPos` to `toPos` along the configured arc.
export function meterArcPath(cx, cy, r, fromPos, toPos, startDeg = 135, sweepDeg = 270) {
  const a0 = meterArcAngle(fromPos, startDeg, sweepDeg);
  const a1 = meterArcAngle(toPos, startDeg, sweepDeg);
  const p0 = meterPolar(cx, cy, r, a0);
  const p1 = meterPolar(cx, cy, r, a1);
  const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweepFlag = a1 >= a0 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${num(r, 0).toFixed(2)} ${num(r, 0).toFixed(2)} 0 ${largeArc} ${sweepFlag} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}
