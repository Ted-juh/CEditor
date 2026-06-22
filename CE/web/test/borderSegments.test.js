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
