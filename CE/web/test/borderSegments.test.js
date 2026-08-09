// borderSegments.test.js — what a border's corners are actually shaped like.
//
// The corner arcs were drawn half a thickness too round. `Corners.radius: R` means the same thing
// to the fill as `border-radius: R` does to CSS — the OUTER edge of the box is rounded at R, which
// is what buildFillClipPath paints and what BackgroundRenderer hands to the border-radius shorthand
// when no clip-path is needed. The border stroke instead centred its arc on a circle of radius R at
// (R + t, R + t), so the band it painted ran from R to R + 2t: its outer edge was a round of R + t.
//
// The picture that makes: on the diagonal the fill's own corner pokes out past the border that is
// supposed to enclose it, and the straight run of each side starts half a thickness late. At the 1px
// borders most controls default to it is a rounding error; at the GAIA panel's 4px slot outlines it
// is a visible bulge, and on a capsule (radius clamped to half the box) the two arcs of one end
// overlap instead of meeting at the midpoint.
//
// The arcs were the wrong ones, not the radius: buildCornerGeom already described the corrected
// geometry — its arcStart/arcEnd sit at R on the box edge — which is how the two managed to
// disagree with each other for so long without either looking obviously wrong on its own.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBorderSegments } from '../src/CE_Application/utils/borderSegments.js';

function maxCoordInPaths(segments) {
  let max = 0;
  for (const seg of segments) {
    const d = String(seg?.d ?? '');
    for (const m of d.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const n = Math.abs(parseFloat(m[0]));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/** Read `M x1 y1 A r r 0 f s x2 y2` back into the circle the stroke is centred on. */
function arcOf(d) {
  const m = /^M ([\d.-]+) ([\d.-]+) A ([\d.-]+) [\d.-]+ 0 ([01]) ([01]) ([\d.-]+) ([\d.-]+)$/.exec(String(d));
  if (!m) return null;
  const [, x1, y1, r, , sweep, x2, y2] = m.map(Number);
  // Of the two circles of radius r through both endpoints, a quarter arc's centre is the one
  // reached by turning off the chord toward the sweep direction.
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const half = Math.hypot(dx, dy) / 2;
  const h = Math.sqrt(Math.max(0, r * r - half * half)) / (half * 2);
  const sign = sweep ? -1 : 1;
  return { cx: mx + sign * h * dy, cy: my - sign * h * dx, r, start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('a rounded border is rounded to its own radius, not half a thickness more', () => {
  const R = 10;
  const T = 4;
  const border = { enabled: true, linked: true, style: 'solid', thickness: T, colour: 'FF102030' };
  const corners = { linked: true, radius: R, style: 'rounded', direction: 'outward', borderEnabled: true };

  const segments = buildBorderSegments(60, 60, border, corners);
  const tl = segments.find((s) => s.kind === 'corner' && s.pos === 'tl');
  assert.ok(tl, 'expected a top-left corner segment');

  const arc = arcOf(tl.d);
  assert.ok(arc, `top-left corner is not a single arc: ${tl.d}`);

  // The band runs from `r - T/2` to `r + T/2` about the arc centre. For its outer edge to be the
  // R-radius round the fill paints, that outer edge must be the circle centred (R, R) radius R —
  // the one `border-radius: 10px` describes on this box.
  assert.ok(near(arc.cx, R) && near(arc.cy, R),
    `arc centred at (${arc.cx}, ${arc.cy}); a border-radius: ${R}px corner is centred at (${R}, ${R})`);
  assert.ok(near(arc.r + T / 2, R),
    `outer edge of the corner band is a ${arc.r + T / 2}px round on a box the fill rounds at ${R}px`);

  // Which puts the ends of the arc on the R marks, where each side's straight run begins.
  assert.ok(near(arc.start.x, T / 2) && near(arc.start.y, R), `arc starts at (${arc.start.x}, ${arc.start.y})`);
  assert.ok(near(arc.end.x, R) && near(arc.end.y, T / 2), `arc ends at (${arc.end.x}, ${arc.end.y})`);
});

test('the sides start where the arc ends', () => {
  // The join is the half of this that always looked right: the old arc ended at R + t and the old
  // sides began there too, so both were out by the same half thickness and neither showed a seam.
  // Pinning the join alone would therefore have pinned the bug, which is why the arc is checked
  // against the fill's radius above and the sides are checked against the arc here.
  const R = 10;
  const T = 4;
  const border = { enabled: true, linked: true, style: 'solid', thickness: T, colour: 'FF102030' };
  const corners = { linked: true, radius: R, style: 'rounded', direction: 'outward', borderEnabled: true };

  const segments = buildBorderSegments(60, 60, border, corners);
  const top = segments.find((s) => s.kind === 'corner' && s.pos === 'tl');
  const arc = arcOf(top.d);
  const side = segments.find((s) => s.kind === 'side' && s.key === 'top');

  const startX = Number(/^M ([\d.-]+)/.exec(side.d)[1]);
  assert.ok(near(startX, arc.end.x - 1),
    `top side starts at x=${startX}; the arc ends at x=${arc.end.x}, so it should start 1px earlier to overlap`);
});

test('a capsule end is one semicircle, not two arcs that overlap', () => {
  // radius 999 on a 30-wide box clamps to 15, so the two top corners share a centre and their arcs
  // have to meet exactly at the midpoint. Under the old geometry each was centred half a thickness
  // past it, so they crossed — the seam at the top of every GAIA fader slot.
  const border = { enabled: true, linked: true, style: 'solid', thickness: 2, colour: 'FF102030' };
  const corners = { linked: true, radius: 999, style: 'rounded', direction: 'outward', borderEnabled: true };

  const segments = buildBorderSegments(30, 100, border, corners);
  const tl = arcOf(segments.find((s) => s.kind === 'corner' && s.pos === 'tl').d);
  const tr = arcOf(segments.find((s) => s.kind === 'corner' && s.pos === 'tr').d);

  assert.ok(near(tl.cx, 15) && near(tr.cx, 15), `capsule arcs centred at x=${tl.cx} and x=${tr.cx}, not 15`);
  assert.ok(near(tl.end.x, tr.start.x),
    `the two top arcs meet at x=${tl.end.x} and x=${tr.start.x} — they should share the midpoint`);
});

test('a radius smaller than the border still closes its corner', () => {
  // No circle carries a band 6px wide inside a 2px radius, so the arc degenerates. It has to
  // degenerate to a square corner and not to nothing: the sides stop short of the anchor, and an
  // empty path there leaves a notch out of the outline rather than a tight corner.
  const border = { enabled: true, linked: true, style: 'solid', thickness: 6, colour: 'FF102030' };
  const corners = { linked: true, radius: 2, style: 'rounded', direction: 'outward', borderEnabled: true };

  const segments = buildBorderSegments(60, 60, border, corners);
  for (const pos of ['tl', 'tr', 'br', 'bl']) {
    const seg = segments.find((s) => s.kind === 'corner' && s.pos === pos);
    assert.ok(seg, `no ${pos} corner segment`);
    assert.match(seg.d, /L/, `${pos} corner drew a zero-length path (${seg.d}) — the corner is a hole`);
  }
});

test('corner radius is clamped to half the box (no oversized border arcs)', () => {
  const border = { enabled: true, linked: true, style: 'solid', thickness: 2, colour: 'FFFFFFFF' };
  // Round shapes (circle/ring/capsule) store radius: 999 to mean "fully round".
  // On a 70x70 part this must clamp to 35 — otherwise the SVG corner arcs are
  // generated at the literal 999 radius and bleed far beyond the part (the
  // white "astroid" curves bug).
  const corners = { linked: true, radius: 999, style: 'rounded', borderEnabled: true };

  const segments = buildBorderSegments(70, 70, border, corners);
  assert.ok(segments.length > 0, 'expected border segments to be produced');

  const max = maxCoordInPaths(segments);
  assert.ok(max <= 90, `border path coordinates must stay within the part bounds (got max ${max})`);
});
