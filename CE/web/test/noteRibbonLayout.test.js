import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIBBON_MODES, ribbonMode, ribbonRange, ribbonZones, ribbonBendRange,
  ribbonGeometry, zoneRect, inRibbon, positionAlong, positionAcross, zoneIndexAt,
  snapZone, pitchAt, bendValue, glideStep, bendBytes, ccBytes,
  touchVelocity, modValue, modCc, touchLabel,
} from '../src/CE_Application/utils/noteRibbonLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function rb(c) { return { _children: { Core: { controlType: 'NoteRibbon' }, NoteRibbon: c } }; }

test('mode + range clamp', () => {
  assert.equal(ribbonMode(rb({ mode: 'nope' })), 'snap');
  assert.equal(ribbonMode(rb({ mode: 'glide' })), 'glide');
  assert.deepEqual(ribbonRange(rb({ baseNote: 48, octaves: 2 })), { lo: 48, hi: 72 });
  assert.deepEqual(ribbonRange(rb({ baseNote: 48, octaves: 99 })), { lo: 48, hi: 108 });   // 5 octaves max
  assert.deepEqual(ribbonRange(rb({ baseNote: 126, octaves: 2 })), { lo: 126, hi: 127 });  // clipped at 127
  assert.equal(ribbonBendRange(rb({ bendRange: 0 })), 1);
  assert.equal(ribbonBendRange(rb({})), 2);
});

test('scale-snap zones keep only in-key notes', () => {
  // C major over one octave → C D E F G A B C = 8 zones, no accidentals
  const zones = ribbonZones(rb({ mode: 'snap', key: 0, scale: 'major', baseNote: 60, octaves: 1 }));
  assert.deepEqual(zones.map((z) => z.note), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(zones.map((z) => z.shortName), ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
  assert.equal(zones[0].isRoot, true);
  assert.equal(zones[1].isRoot, false);
  assert.equal(zones[7].isRoot, true);
});

test('chromatic + glide zones keep every semitone, flagged in/out of scale', () => {
  const zones = ribbonZones(rb({ mode: 'chromatic', key: 0, scale: 'major', baseNote: 60, octaves: 1 }));
  assert.equal(zones.length, 13);
  assert.equal(zones[1].note, 61);
  assert.equal(zones[1].inScale, false);       // C♯ is out of C major
  assert.equal(zones[2].inScale, true);
  // C minor spells flats, so the strip reads E♭ not D♯
  const min = ribbonZones(rb({ mode: 'chromatic', key: 0, scale: 'minor', baseNote: 60, octaves: 1 }));
  assert.equal(min[3].shortName, 'E♭');
  // glide shows the same landmarks as chromatic
  assert.equal(ribbonZones(rb({ mode: 'glide', key: 0, scale: 'major', baseNote: 60, octaves: 1 })).length, 13);
});

test('geometry + hit-test, horizontal', () => {
  const g = ribbonGeometry(320, 90, 8, 22, 'horizontal');
  assert.equal(g.horizontal, true);
  assert.equal(g.x0, 8);
  assert.equal(g.y0, 30);
  assert.equal(inRibbon(g, 10, 40), true);
  assert.equal(inRibbon(g, 10, 5), false);            // header area
  const r0 = zoneRect(g, 0, 8);
  const r7 = zoneRect(g, 7, 8);
  assert.ok(r7.x > r0.x);
  assert.ok(near(r0.y, r7.y));                        // one row
  assert.ok(near(positionAlong(g, g.x0, g.y0 + 1), 0));
  assert.ok(near(positionAlong(g, g.x0 + g.w, g.y0 + 1), 1));
  assert.equal(zoneIndexAt(g, r0.x + 1, g.y0 + 1, 8), 0);
  assert.equal(zoneIndexAt(g, r7.x + 1, g.y0 + 1, 8), 7);
  assert.equal(zoneIndexAt(g, 0, 0, 8), -1);
});

test('geometry, vertical: low notes at the bottom + the cross axis flips', () => {
  const g = ribbonGeometry(90, 320, 8, 22, 'vertical');
  assert.equal(g.horizontal, false);
  const r0 = zoneRect(g, 0, 8);
  const r7 = zoneRect(g, 7, 8);
  assert.ok(r0.y > r7.y);                             // zone 0 (lowest) sits lowest
  assert.ok(near(positionAlong(g, g.x0 + 1, g.y0 + g.h), 0));
  assert.ok(near(positionAlong(g, g.x0 + 1, g.y0), 1));
  // horizontal strips read the expression axis bottom-up; vertical ones left-right
  const h = ribbonGeometry(320, 90, 8, 22, 'horizontal');
  assert.ok(near(positionAcross(h, 100, h.y0 + h.h), 0));
  assert.ok(near(positionAcross(h, 100, h.y0), 1));
  assert.ok(near(positionAcross(g, g.x0, 100), 0));
  assert.ok(near(positionAcross(g, g.x0 + g.w, 100), 1));
});

test('snapZone maps a position to a zone', () => {
  const zones = ribbonZones(rb({ mode: 'snap', key: 0, scale: 'major', baseNote: 60, octaves: 1 }));
  assert.equal(snapZone(zones, 0).note, 60);
  assert.equal(snapZone(zones, 0.99).note, 72);
  assert.equal(snapZone(zones, 0.5).note, 67);        // 4th of 8 zones → G
  assert.equal(snapZone([], 0.5), null);
});

test('pitchAt is continuous across the span', () => {
  const c = rb({ baseNote: 48, octaves: 2 });
  assert.ok(near(pitchAt(c, 0), 48));
  assert.ok(near(pitchAt(c, 1), 72));
  assert.ok(near(pitchAt(c, 0.5), 60));
  assert.ok(near(pitchAt(c, 2), 72));                 // clamped
});

test('bendValue centres at 8192 and saturates at the range', () => {
  assert.equal(bendValue(0, 2), 8192);
  assert.equal(bendValue(2, 2), 16383);
  assert.equal(bendValue(-2, 2), 1);
  assert.equal(bendValue(9, 2), 16383);               // clamped to the range
  assert.ok(bendValue(1, 2) > 8192 && bendValue(1, 2) < 16383);
  assert.equal(bendValue(1, 12), bendValue(2, 24));   // same fraction of the range
});

test('glideStep holds a root until the bend window runs out, then retriggers', () => {
  const c = rb({ baseNote: 48, octaves: 2, bendRange: 2 });   // 48..72 over the strip
  // first touch: no root yet, so it picks one and reports a retrigger
  const first = glideStep(c, 0.5, null);
  assert.equal(first.root, 60);
  assert.equal(first.retrigger, true);
  assert.equal(first.bend, 8192);
  // a small move stays on the same root and just bends
  const near1 = glideStep(c, 0.5 + 1 / 24, 60);              // +1 semitone
  assert.equal(near1.root, 60);
  assert.equal(near1.retrigger, false);
  assert.ok(near1.bend > 8192);
  // past the ±2 window it moves to a new root
  const far = glideStep(c, 0.5 + 5 / 24, 60);                // +5 semitones
  assert.equal(far.root, 65);
  assert.equal(far.retrigger, true);
  // a wider bend range holds the same root much further
  const wide = glideStep(rb({ baseNote: 48, octaves: 2, bendRange: 12 }), 0.5 + 5 / 24, 60);
  assert.equal(wide.root, 60);
  assert.equal(wide.retrigger, false);
  // the root never leaves the strip's range
  assert.equal(glideStep(c, 1, null).root, 72);
  assert.equal(glideStep(c, 0, null).root, 48);
});

test('pitch-bend + CC bytes', () => {
  assert.deepEqual(bendBytes(1, 8192), [0xE0, 0x00, 0x40]);
  assert.deepEqual(bendBytes(10, 8192), [0xE9, 0x00, 0x40]);
  assert.deepEqual(bendBytes(1, 0), [0xE0, 0x00, 0x00]);
  assert.deepEqual(bendBytes(1, 16383), [0xE0, 0x7F, 0x7F]);
  assert.deepEqual(ccBytes(1, 1, 64), [0xB0, 1, 64]);
  assert.deepEqual(ccBytes(16, 74, 200), [0xBF, 74, 127]);   // clamped
});

test('expression axis: velocity + mod CC', () => {
  assert.equal(touchVelocity(rb({ velocity: 96 }), 0.1), 96);            // fixed ignores position
  const byPos = rb({ velocityFrom: 'position', velocity: 96 });
  assert.ok(touchVelocity(byPos, 0) < touchVelocity(byPos, 1));
  assert.ok(touchVelocity(byPos, 1) <= 127 && touchVelocity(byPos, 0) >= 1);
  assert.equal(modValue(rb({ modAxis: 'none' }), 0.5), null);
  assert.equal(modValue(rb({ modAxis: 'cc' }), 0), 0);
  assert.equal(modValue(rb({ modAxis: 'cc' }), 1), 127);
  assert.equal(modCc(rb({})), 1);                                        // mod wheel by default
  assert.equal(modCc(rb({ modCc: 74 })), 74);
});

test('touch label reports the note, and cents while gliding', () => {
  assert.equal(touchLabel(rb({ mode: 'snap', key: 0, scale: 'major' }), { note: 60 }), 'C4');
  assert.equal(touchLabel(rb({ mode: 'snap', key: 0, scale: 'minor' }), { note: 63 }), 'E♭4');
  assert.equal(touchLabel(rb({ mode: 'glide' }), { note: 60, pitch: 60 }), 'C4');
  assert.equal(touchLabel(rb({ mode: 'glide' }), { note: 60, pitch: 60.5 }), 'C4 +50¢');
  assert.equal(touchLabel(rb({ mode: 'glide' }), { note: 60, pitch: 59.75 }), 'C4 -25¢');
  assert.equal(touchLabel(rb({}), null), '');
});

test('mode registry is complete', () => {
  assert.equal(RIBBON_MODES.length, 3);
  for (const m of RIBBON_MODES) assert.equal(ribbonMode(rb({ mode: m })), m);
});
