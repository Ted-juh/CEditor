import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GM_DRUMS, PAD_MAPS, PAD_MODES, drumRows, drumCols, drumCount, drumChannel,
  drumMode, drumMap, drumGateMs, drumNoteLabel, drumPads, chokedBy,
  drumGeometry, padCell, padRect, padHit, padStrikeY, strikeVelocity,
} from '../src/CE_Application/utils/drumPadLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function dp(c) { return { _children: { Core: { controlType: 'DrumPads' }, DrumPads: c } }; }

test('grid size + defaults clamp', () => {
  assert.equal(drumRows(dp({})), 4);
  assert.equal(drumCols(dp({})), 4);
  assert.equal(drumCount(dp({ rows: 2, cols: 8 })), 16);
  assert.equal(drumRows(dp({ rows: 99 })), 8);
  assert.equal(drumChannel(dp({})), 10);            // GM percussion channel
  assert.equal(drumChannel(dp({ channel: 0 })), 1);
  assert.equal(drumMode(dp({ mode: 'nope' })), 'momentary');
  assert.equal(drumMap(dp({ map: 'nope' })), 'gm');
  assert.equal(drumGateMs(dp({ gateMs: 1 })), 5);
});

test('note labels use the GM percussion names, else the note name', () => {
  assert.equal(drumNoteLabel(36, false), 'Bass Drum 1');
  assert.equal(drumNoteLabel(36, true), 'Kick');
  assert.equal(drumNoteLabel(42, true), 'CH Hat');
  assert.equal(drumNoteLabel(46, false), 'Open Hi-Hat');
  // outside the GM range there's no drum name, so fall back to pitch
  assert.equal(drumNoteLabel(24, true), 'C1');
  assert.equal(drumNoteLabel(100, true), 'E7');
  assert.equal(Object.keys(GM_DRUMS).length, 47);   // 35..81 inclusive
});

test('the GM map fills a 4x4 grid from the kick up', () => {
  const pads = drumPads(dp({ map: 'gm', rows: 4, cols: 4, baseNote: 36 }));
  assert.equal(pads.length, 16);
  assert.equal(pads[0].note, 36);
  assert.equal(pads[0].label, 'Kick');
  assert.equal(pads[2].label, 'Snare');            // 38
  assert.equal(pads[15].note, 51);
  assert.equal(pads[15].label, 'Ride');
  assert.equal(pads[0].fullName, 'Bass Drum 1');
});

test('the hi-hats share a choke group, and choke silences the others', () => {
  const pads = drumPads(dp({ map: 'gm', rows: 4, cols: 4, baseNote: 36 }));
  const closed = pads.find((p) => p.note === 42);
  const pedal = pads.find((p) => p.note === 44);
  const open = pads.find((p) => p.note === 46);
  assert.equal(closed.choke, 1);
  assert.equal(pedal.choke, 1);
  assert.equal(open.choke, 1);
  assert.equal(pads.find((p) => p.note === 38).choke, 0);   // the snare chokes nothing
  // hitting the closed hat silences the pedal + open hats, and nothing else
  assert.deepEqual(chokedBy(pads, closed).map((p) => p.note).sort((a, b) => a - b), [44, 46]);
  assert.deepEqual(chokedBy(pads, pads.find((p) => p.note === 38)), []);
});

test('chromatic map + per-pad overrides', () => {
  const chrom = drumPads(dp({ map: 'chromatic', rows: 2, cols: 2, baseNote: 60 }));
  assert.deepEqual(chrom.map((p) => p.note), [60, 61, 62, 63]);
  // a chromatic pad on a GM note still reads as a pitch, not as a drum
  assert.equal(drumPads(dp({ map: 'chromatic', rows: 1, cols: 1, baseNote: 36 }))[0].label, 'Kick');
  // overrides re-point / rename / recolour a single pad without touching the rest
  const over = drumPads(dp({
    map: 'gm', rows: 2, cols: 2, baseNote: 36,
    pads: [{ label: 'Boom', note: 35, colour: 'FF00FF00', choke: 3 }],
  }));
  assert.equal(over[0].label, 'Boom');
  assert.equal(over[0].note, 35);
  assert.equal(over[0].colour, 'FF00FF00');
  assert.equal(over[0].choke, 3);
  assert.equal(over[1].label, 'Stick');            // 37, untouched
  assert.equal(over[1].colour, '');
});

test('pad 1 sits bottom-left by default, top-left on request', () => {
  // 4x4, bottom-left origin: pad 0 is the BOTTOM row
  assert.deepEqual(padCell(0, 4, 4, 'bottomLeft'), { row: 3, col: 0 });
  assert.deepEqual(padCell(3, 4, 4, 'bottomLeft'), { row: 3, col: 3 });
  assert.deepEqual(padCell(12, 4, 4, 'bottomLeft'), { row: 0, col: 0 });   // top-left
  // top-left origin is plain reading order
  assert.deepEqual(padCell(0, 4, 4, 'topLeft'), { row: 0, col: 0 });
  assert.deepEqual(padCell(5, 4, 4, 'topLeft'), { row: 1, col: 1 });
});

test('geometry + hit-test round-trip', () => {
  const g = drumGeometry(320, 300, 4, 4, 8, 22, 5);
  assert.equal(g.rows, 4);
  assert.equal(g.y0, 30);
  const p0 = padRect(g, 0);
  const p15 = padRect(g, 15);
  assert.ok(p0.y > p15.y);                          // pad 1 lower than pad 16
  assert.ok(near(p0.x, g.x0));
  for (const i of [0, 3, 7, 12, 15]) {
    const r = padRect(g, i);
    assert.equal(padHit(g, r.x + 2, r.y + 2, 'bottomLeft'), i);
  }
  assert.equal(padHit(g, 0, 0), -1);                // header
  // the gap between pads is not a hit
  const between = padRect(g, 0).x + g.cellW + g.gap / 2;
  assert.equal(padHit(g, between, padRect(g, 0).y + 2), -1);
  // The same screen cell means a different pad under the other origin: the
  // top-left cell is pad 12 counting from the bottom, pad 0 counting from the top.
  const topLeftCell = padRect(g, 12, 'bottomLeft');
  assert.equal(padHit(g, topLeftCell.x + 2, topLeftCell.y + 2, 'bottomLeft'), 12);
  assert.equal(padHit(g, topLeftCell.x + 2, topLeftCell.y + 2, 'topLeft'), 0);
  // …and the top-right cell is pad 15 from the bottom, pad 3 from the top.
  assert.equal(padHit(g, p15.x + 2, p15.y + 2, 'topLeft'), 3);
});

test('velocity comes from where in the pad you strike', () => {
  const g = drumGeometry(320, 300, 4, 4, 8, 22, 5);
  const r = padRect(g, 0);
  assert.ok(near(padStrikeY(r, r.y), 1));           // top of the pad = hardest
  assert.ok(near(padStrikeY(r, r.y + r.h), 0));     // bottom = softest
  assert.ok(near(padStrikeY(r, r.y + r.h / 2), 0.5));
  // fixed velocity ignores the strike position
  assert.equal(strikeVelocity(dp({ velocity: 100 }), 0.1), 100);
  const byPos = dp({ velocityFrom: 'position', velocity: 100 });
  assert.ok(strikeVelocity(byPos, 0) < strikeVelocity(byPos, 1));
  assert.ok(strikeVelocity(byPos, 1) <= 127);
  assert.ok(strikeVelocity(byPos, 0) >= 1);
});

test('registries are complete', () => {
  assert.deepEqual(PAD_MAPS, ['gm', 'chromatic', 'custom']);
  assert.deepEqual(PAD_MODES, ['momentary', 'oneShot', 'toggle']);
  for (const m of PAD_MODES) assert.equal(drumMode(dp({ mode: m })), m);
  for (const m of PAD_MAPS) assert.equal(drumMap(dp({ map: m })), m);
});
