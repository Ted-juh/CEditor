import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePoints, envelopeGeometry, envToPx, envFromPx, envWarp, envValueAt,
  envHitNode, envDragNode, envAddNode, envRemoveNode, envelopePreset, envPath,
  envelopeStageValues,
} from '../src/CE_Application/utils/envelopeLayout.js';

function envControl(points, sustainIndex) {
  return { _children: { Envelope: { points, sustainIndex } } };
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('normalizePoints clamps + sorts by x', () => {
  const p = normalizePoints([{ x: 1.5, y: -0.2 }, { x: 0.2, y: 0.5 }]);
  assert.deepEqual(p.map((q) => [q.x, q.y]), [[0.2, 0.5], [1, 0]]);
});

test('px round-trips through a geometry (y flipped)', () => {
  const g = envelopeGeometry(120, 100, 10); // inner 100x80 at (10,10)
  const top = envToPx({ x: 0, y: 1 }, g);
  assert.ok(near(top.px, 10) && near(top.py, 10));      // y=1 → top
  const bot = envToPx({ x: 1, y: 0 }, g);
  assert.ok(near(bot.px, 110) && near(bot.py, 90));     // y=0 → bottom
  const back = envFromPx(60, 50, g);
  assert.ok(near(back.x, 0.5) && near(back.y, 0.5));
});

test('warp shapes: linear/exp/log/scurve/hold', () => {
  assert.ok(near(envWarp(0.5, 'linear'), 0.5));
  assert.ok(envWarp(0.5, 'exp', 1) < 0.5);   // convex (slow start)
  assert.ok(envWarp(0.5, 'log', 1) > 0.5);   // concave (fast start)
  assert.ok(near(envWarp(0.5, 'scurve'), 0.5));
  assert.equal(envWarp(0.4, 'hold'), 0);     // step until the end
  assert.equal(envWarp(1, 'hold'), 1);
});

test('envValueAt walks segments with the curve', () => {
  const pts = [{ x: 0, y: 0, curve: 'linear' }, { x: 1, y: 1, curve: 'linear' }];
  assert.ok(near(envValueAt(pts, 0.25), 0.25));
  assert.equal(envValueAt(pts, -1), 0);      // before start
  assert.equal(envValueAt(pts, 2), 1);       // after end
  // ADSR sustain plateau: between decay-end and release, level ≈ sustain.
  const { points } = envelopePreset('adsr');
  assert.ok(Math.abs(envValueAt(points, 0.7) - 0.6) < 0.2); // near sustain 0.6
});

test('hit-test finds the nearest node within radius', () => {
  const g = envelopeGeometry(120, 100, 10);
  const pts = [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }];
  const mid = envToPx(pts[1], g);
  assert.equal(envHitNode(pts, g, mid.px + 3, mid.py - 2, 10), 1);
  assert.equal(envHitNode(pts, g, mid.px + 40, mid.py, 10), -1); // too far
});

test('drag constrains x between neighbors + locks ends', () => {
  const pts = [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }];
  // Middle node cannot pass its neighbors.
  let d = envDragNode(pts, 1, 2.0, 0.3);
  assert.ok(near(d[1].x, 1));  // clamped to next neighbor (1)
  d = envDragNode(pts, 1, -1, 0.3);
  assert.ok(near(d[1].x, 0));  // clamped to prev neighbor (0)
  // End nodes keep their x; y clamps.
  d = envDragNode(pts, 0, 0.4, 0.9, { lockEndsX: true });
  assert.equal(d[0].x, 0);
  assert.equal(d[0].y, 0.9);
  // y-locked node ignores the y drag (stays at its original y).
  d = envDragNode(pts, 0, 0, 0.8, { lockYIndices: [0] });
  assert.equal(d[0].y, 0);
});

test('add/remove nodes keep endpoints intact', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const { points, index } = envAddNode(pts, 0.5, 0.7);
  assert.equal(points.length, 3);
  assert.equal(index, 1);
  assert.ok(near(points[1].x, 0.5) && near(points[1].y, 0.7));
  // Removing an interior node works; endpoints are protected.
  assert.equal(envRemoveNode(points, 1).length, 2);
  assert.equal(envRemoveNode(points, 0).length, 3);   // endpoint → unchanged
  assert.equal(envRemoveNode(points, 2).length, 3);   // endpoint → unchanged
});

test('presets provide sane shapes + sustain markers', () => {
  assert.equal(envelopePreset('adsr').sustainIndex, 2);
  assert.equal(envelopePreset('ar').sustainIndex, -1);
  assert.equal(envelopePreset('dahdsr').points.length, 6);
  // Envelope presets start + settle at 0.
  const adsr = envelopePreset('adsr').points;
  assert.equal(adsr[0].y, 0);
  assert.equal(adsr.at(-1).y, 0);
});

test('envelopeStageValues fans an ADSR out to normalized ports', () => {
  // A clean ADSR: peak at x=0.2, sustain node index 2 at x=0.5 level 0.6, end x=1.
  const pts = [
    { x: 0, y: 0 }, { x: 0.2, y: 1 }, { x: 0.5, y: 0.6 }, { x: 1, y: 0 },
  ];
  const s = envelopeStageValues(envControl(pts, 2));
  assert.ok(near(s.attack, 0.2));    // 0 → peak
  assert.ok(near(s.decay, 0.3));     // peak → sustain (0.5 - 0.2)
  assert.ok(near(s.sustain, 0.6));   // sustain level
  assert.ok(near(s.release, 0.5));   // sustain → end (1 - 0.5)
  assert.equal(s.peakIndex, 1);
  assert.equal(s.sustainIndex, 2);
});

test('envelopeStageValues handles no-sustain (AR) shapes', () => {
  const { points } = envelopePreset('ar'); // [0,0] [0.45,1] [1,0], sustain -1
  const s = envelopeStageValues(envControl(points, -1));
  assert.ok(near(s.attack, 0.45));   // to the peak
  assert.equal(s.decay, 0);          // no sustain node
  assert.ok(near(s.sustain, 1));     // peak level
  assert.ok(near(s.release, 0.55));  // peak → end
});

test('envPath emits a move + line commands across all segments', () => {
  const g = envelopeGeometry(100, 100, 0);
  const d = envPath([{ x: 0, y: 0 }, { x: 1, y: 1, curve: 'linear' }], g, 4);
  assert.ok(d.startsWith('M '));
  assert.equal((d.match(/L /g) || []).length, 4); // 4 sample steps in the one segment
});
