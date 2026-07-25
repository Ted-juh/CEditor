import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitConfig, splitZones, splitInputChannel, splitUnmatched, splitPassChannel,
  zoneContains, zoneSpan, zoneVelocity, zoneNote, velocityCurve, VELOCITY_CURVES,
  routeNoteOn, zonesAt, unclaimedNotes, zoneOverlaps,
  isBlackKey, whiteKeysBetween, whiteKeyCount, splitRange,
  splitGeometry, keyRect, noteAtPoint, zoneBandRect, hitZoneEdge, moveZoneEdge,
  adjacentEdge, dragSplitPoint,
  EMPTY_SOUNDING, pressNote, releaseNote, releaseAll, reconcileHeld, soundingNotes,
  MIN_NOTE, MAX_NOTE,
} from '../src/CE_Application/utils/splitZoneLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function sp(c) { return { _children: { Core: { controlType: 'SplitZone' }, SplitZone: c } }; }
// The classic: lower half to a bass patch on ch1 down an octave, upper half to
// a lead on ch2.
const CLASSIC = sp({
  zones: [
    { id: 'lo', label: 'Bass', lowNote: 36, highNote: 59, channel: 1, transpose: -12 },
    { id: 'hi', label: 'Lead', lowNote: 60, highNote: 96, channel: 2, transpose: 0 },
  ],
});

test('zones normalize, and a backwards zone is repaired not emptied', () => {
  const z = splitZones(sp({ zones: [{ lowNote: 72, highNote: 48 }] }))[0];
  assert.equal(z.lowNote, 48);
  assert.equal(z.highNote, 72);
  assert.equal(zoneSpan(z), 25);
  // Defaults + clamps.
  const d = splitZones(sp({ zones: [{}] }))[0];
  assert.equal(d.channel, 1);
  assert.equal(d.transpose, 0);
  assert.equal(d.curve, 'linear');
  assert.equal(d.enabled, true);
  assert.equal(splitZones(sp({ zones: [{ channel: 99, transpose: 999, curve: 'nope' }] }))[0].channel, 16);
  assert.equal(splitZones(sp({ zones: [{ transpose: 999 }] }))[0].transpose, 48);
  assert.equal(splitZones(sp({ zones: [{ curve: 'nope' }] }))[0].curve, 'linear');
  assert.equal(splitZones(sp({})).length, 0);
  assert.equal(splitInputChannel(sp({})), 0);            // omni
  assert.equal(splitInputChannel(sp({ inputChannel: 99 })), 16);
});

test('the classic split routes each half to its own channel', () => {
  // Bottom half, down an octave, channel 1.
  assert.deepEqual(routeNoteOn(CLASSIC, 48, 100), [{ zoneId: 'lo', channel: 1, note: 36, velocity: 100 }]);
  // Top half, untransposed, channel 2.
  assert.deepEqual(routeNoteOn(CLASSIC, 72, 100), [{ zoneId: 'hi', channel: 2, note: 72, velocity: 100 }]);
  // Either side of the split point, exactly.
  assert.equal(routeNoteOn(CLASSIC, 59, 64)[0].channel, 1);
  assert.equal(routeNoteOn(CLASSIC, 60, 64)[0].channel, 2);
  // Outside every zone: silence, which is the whole point of a split.
  assert.deepEqual(routeNoteOn(CLASSIC, 30, 100), []);
  assert.deepEqual(routeNoteOn(CLASSIC, 120, 100), []);
});

test('overlapping zones ARE the layering — one note, two outputs', () => {
  const layered = sp({
    zones: [
      { id: 'a', lowNote: 60, highNote: 72, channel: 1, transpose: 0 },
      { id: 'b', lowNote: 60, highNote: 72, channel: 3, transpose: 12 },
    ],
  });
  const out = routeNoteOn(layered, 64, 90);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { zoneId: 'a', channel: 1, note: 64, velocity: 90 });
  assert.deepEqual(out[1], { zoneId: 'b', channel: 3, note: 76, velocity: 90 });
  // And the editor can point the overlap out, since an ACCIDENTAL one just
  // sounds thin and detuned rather than obviously wrong.
  const pairs = zoneOverlaps(layered);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0], { a: 'a', b: 'b', lowNote: 60, highNote: 72 });
  assert.deepEqual(zoneOverlaps(CLASSIC), []);           // the classic split doesn't
});

test('a disabled zone routes nothing but is still in the list', () => {
  const c = sp({ zones: [{ id: 'a', lowNote: 0, highNote: 127, channel: 4, enabled: false }] });
  assert.equal(splitZones(c).length, 1);
  assert.deepEqual(routeNoteOn(c, 60, 100), []);
  assert.deepEqual(zonesAt(c, 60), []);
});

test('a transposition off the end is dropped, not clamped', () => {
  // Clamping would pile every out-of-range note onto note 127, which sounds
  // like a stuck key rather than like nothing.
  const up = sp({ zones: [{ id: 'a', lowNote: 100, highNote: 127, channel: 1, transpose: 24 }] });
  assert.deepEqual(routeNoteOn(up, 110, 100), []);       // 110 + 24 = 134
  assert.equal(routeNoteOn(up, 100, 100)[0].note, 124);  // still in range
  const down = sp({ zones: [{ id: 'a', lowNote: 0, highNote: 40, channel: 1, transpose: -24 }] });
  assert.deepEqual(routeNoteOn(down, 5, 100), []);       // 5 - 24 = -19
  assert.equal(routeNoteOn(down, 24, 100)[0].note, 0);   // exactly at the bottom
  assert.equal(routeNoteOn(down, 30, 100)[0].note, 6);
});

test('unmatched notes drop by default and can pass through', () => {
  assert.equal(splitUnmatched(sp({})), 'drop');
  const pass = sp({
    unmatched: 'pass', passChannel: 7,
    zones: [{ id: 'a', lowNote: 60, highNote: 72, channel: 1 }],
  });
  assert.equal(splitPassChannel(pass), 7);
  assert.deepEqual(routeNoteOn(pass, 40, 88), [{ zoneId: '', channel: 7, note: 40, velocity: 88 }]);
  // Inside a zone, the zone wins — pass-through is only for orphans.
  assert.equal(routeNoteOn(pass, 64, 88)[0].channel, 1);
});

test('velocity curves keep their endpoints and bend in the right direction', () => {
  for (const c of VELOCITY_CURVES) {
    assert.ok(near(velocityCurve(0, c), 0), c);
    assert.ok(near(velocityCurve(1, c), 1), c);
  }
  // Soft gives MORE output for the same touch; hard gives less.
  assert.ok(velocityCurve(0.5, 'soft') > 0.5);
  assert.ok(velocityCurve(0.5, 'hard') < 0.5);
  assert.ok(near(velocityCurve(0.5, 'linear'), 0.5));
});

test('zone velocity: curve first, then the range clamps what escapes', () => {
  const lin = splitZones(sp({ zones: [{ curve: 'linear' }] }))[0];
  assert.equal(zoneVelocity(lin, 1), 1);
  assert.equal(zoneVelocity(lin, 127), 127);
  // A narrowed range never sends outside itself, whatever the curve does.
  const narrow = splitZones(sp({ zones: [{ curve: 'hard', velLow: 40, velHigh: 90 }] }))[0];
  for (const v of [1, 20, 64, 100, 127]) {
    const out = zoneVelocity(narrow, v);
    assert.ok(out >= 40 && out <= 90, `${v} → ${out} escaped 40–90`);
  }
  assert.equal(zoneVelocity(narrow, 1), 40);
  assert.equal(zoneVelocity(narrow, 127), 90);
  // Fixed ignores the incoming velocity entirely — an organ zone.
  const fixed = splitZones(sp({ zones: [{ curve: 'fixed', fixedVelocity: 110 }] }))[0];
  assert.equal(zoneVelocity(fixed, 1), 110);
  assert.equal(zoneVelocity(fixed, 127), 110);
  // A range written backwards still behaves.
  const rev = splitZones(sp({ zones: [{ velLow: 90, velHigh: 40 }] }))[0];
  assert.equal(zoneVelocity(rev, 1), 40);
  assert.equal(zoneVelocity(rev, 127), 90);
  // Velocity 0 is a note-off elsewhere; it must never leave here as 0.
  assert.ok(zoneVelocity(lin, 0) >= 1);
});

test('gaps between zones are findable', () => {
  const gapped = sp({
    zones: [
      { id: 'a', lowNote: 36, highNote: 47, channel: 1 },
      { id: 'b', lowNote: 60, highNote: 71, channel: 2 },
    ],
  });
  const gaps = unclaimedNotes(gapped, 36, 71);
  assert.equal(gaps.length, 12);                 // 48..59
  assert.equal(gaps[0], 48);
  assert.equal(gaps.at(-1), 59);
  assert.deepEqual(unclaimedNotes(CLASSIC, 36, 96), []);
  assert.deepEqual(zonesAt(CLASSIC, 48).map((z) => z.id), ['lo']);
  assert.deepEqual(zonesAt(CLASSIC, 30), []);
});

// --- Keyboard geometry -------------------------------------------------------------
test('black keys are where a piano has them', () => {
  for (const n of [61, 63, 66, 68, 70]) assert.equal(isBlackKey(n), true, `${n}`);
  for (const n of [60, 62, 64, 65, 67, 69, 71]) assert.equal(isBlackKey(n), false, `${n}`);
  assert.equal(isBlackKey(1), true);              // and down at the bottom of the range
  assert.equal(whiteKeyCount(60, 71), 7);         // one octave = 7 whites
  assert.equal(whiteKeyCount(60, 72), 8);
  assert.equal(whiteKeysBetween(60, 60), 0);
  assert.equal(whiteKeysBetween(60, 62), 1);      // only C is below D
  assert.equal(whiteKeysBetween(60, 72), 7);
});

test('the drawn range snaps out to whole white keys', () => {
  // C#3 in, C3 out — a keyboard that starts on a floating black key looks broken.
  assert.deepEqual(splitRange(sp({ lowNote: 61, highNote: 96 })), { lowNote: 60, highNote: 96 });
  assert.deepEqual(splitRange(sp({ lowNote: 60, highNote: 94 })), { lowNote: 60, highNote: 95 });
  assert.deepEqual(splitRange(sp({})), { lowNote: 36, highNote: 96 });
  // Backwards range is repaired.
  assert.deepEqual(splitRange(sp({ lowNote: 96, highNote: 60 })), { lowNote: 60, highNote: 96 });
});

test('keys tile the width and hit-testing round-trips', () => {
  const geom = splitGeometry(700, 120, 8, 22, 14);
  const lo = 60; const hi = 71;
  const whites = whiteKeyCount(lo, hi);
  // White keys tile exactly: the last one ends at the right edge.
  const last = keyRect(geom, 71, lo, hi);
  assert.ok(near(last.x + last.w, geom.x0 + geom.w, 1e-6));
  assert.ok(near(keyRect(geom, 60, lo, hi).x, geom.x0));
  assert.ok(near(keyRect(geom, 60, lo, hi).w, geom.w / whites));
  // Black keys are narrower and shorter, and sit on top.
  const black = keyRect(geom, 61, lo, hi);
  assert.equal(black.black, true);
  assert.ok(black.w < keyRect(geom, 60, lo, hi).w);
  assert.ok(black.h < keyRect(geom, 60, lo, hi).h);
  // Every key can be hit at its own centre. Black keys are tested near their
  // top, where they're drawn over the white key below.
  for (let n = lo; n <= hi; n += 1) {
    const r = keyRect(geom, n, lo, hi);
    const found = noteAtPoint(geom, r.x + r.w / 2, r.y + r.h * 0.3, lo, hi);
    assert.equal(found, n, `note ${n} at its own centre found ${found}`);
  }
  // Below the keys is nothing.
  assert.equal(noteAtPoint(geom, geom.x0 + 10, geom.bandY, lo, hi), -1);
});

test('a click low on a black key hits the white key underneath', () => {
  const geom = splitGeometry(700, 120, 8, 22, 14);
  const black = keyRect(geom, 61, 60, 71);
  // Below the short black key, at its horizontal centre: that's C or D, and a
  // real keyboard behaves the same way.
  const found = noteAtPoint(geom, black.x + black.w / 2, black.y + black.h + 4, 60, 71);
  assert.ok(found === 60 || found === 62, `expected C or D, got ${found}`);
});

test('zone bands span their notes and clip to the drawn range', () => {
  const geom = splitGeometry(700, 120, 8, 22, 14);
  const zones = splitZones(CLASSIC);
  const lo = zoneBandRect(geom, zones[0], 36, 96, 0, 2);
  const hi = zoneBandRect(geom, zones[1], 36, 96, 1, 2);
  assert.ok(lo.x < hi.x, 'the bass band is left of the lead band');
  assert.ok(lo.x + lo.w <= hi.x + 1, 'and they do not run into each other');
  assert.ok(hi.y > lo.y, 'stacked into their own lanes');
  // A zone entirely outside the drawn range has no band at all.
  const off = splitZones(sp({ zones: [{ lowNote: 0, highNote: 20 }] }))[0];
  assert.equal(zoneBandRect(geom, off, 36, 96, 0, 1), null);
  // One that only partly overlaps is clipped, not dropped.
  const partial = splitZones(sp({ zones: [{ lowNote: 0, highNote: 40 }] }))[0];
  assert.ok(zoneBandRect(geom, partial, 36, 96, 0, 1).w > 0);
});

test('dragging a split point moves one edge and cannot invert the zone', () => {
  const geom = splitGeometry(700, 120, 8, 22, 14);
  const band = zoneBandRect(geom, splitZones(CLASSIC)[0], 36, 96, 0, 1);
  // The right-hand edge of the bass band is the split point — and the lead
  // zone's left edge is on the same pixel, so this has to be deterministic.
  const hit = hitZoneEdge(CLASSIC, geom, band.x + band.w, geom.bandY + 4, 36, 96);
  assert.equal(hit.index, 0);
  assert.equal(hit.edge, 'high');
  // Nowhere near an edge: nothing.
  assert.equal(hitZoneEdge(CLASSIC, geom, geom.x0 + geom.w / 2 - 3, geom.bandY + 4, 36, 96), null);
  // Below the band strip: nothing, so dragging on the keys plays instead.
  assert.equal(hitZoneEdge(CLASSIC, geom, band.x, geom.keysY + 5, 36, 96), null);

  const moved = moveZoneEdge(splitZones(CLASSIC), 0, 'high', 55);
  assert.equal(moved[0].highNote, 55);
  assert.equal(moved[1].highNote, 96, 'the other zone is untouched');
  // Dragging the top below the bottom pins it instead of turning the zone
  // inside out.
  const pinned = moveZoneEdge(splitZones(CLASSIC), 0, 'high', 10);
  assert.equal(pinned[0].highNote, 36);
  assert.equal(pinned[0].lowNote, 36);
  const pinnedLow = moveZoneEdge(splitZones(CLASSIC), 0, 'low', 120);
  assert.equal(pinnedLow[0].lowNote, 59);
  // Out of range clamps to the MIDI range.
  assert.equal(moveZoneEdge(splitZones(CLASSIC), 1, 'high', 999)[1].highNote, MAX_NOTE);
  assert.equal(moveZoneEdge(splitZones(CLASSIC), 0, 'low', -5)[0].lowNote, MIN_NOTE);
  // An index that isn't there is a no-op, not a crash.
  assert.equal(moveZoneEdge(splitZones(CLASSIC), 9, 'low', 60).length, 2);
});

test('dragging a shared split point carries both zones with it', () => {
  const zones = splitZones(CLASSIC);          // 36–59 / 60–96, abutting
  assert.deepEqual(adjacentEdge(zones, 0, 'high'), { index: 1, edge: 'low' });
  assert.deepEqual(adjacentEdge(zones, 1, 'low'), { index: 0, edge: 'high' });
  assert.equal(adjacentEdge(zones, 0, 'low'), null, 'the bottom of the keyboard has no twin');

  // Move the split down to B2/C3: both zones follow, no gap and no overlap.
  const moved = dragSplitPoint(zones, 0, 'high', 47);
  assert.equal(moved[0].highNote, 47);
  assert.equal(moved[1].lowNote, 48);
  assert.deepEqual(unclaimedNotes(sp({ zones: moved }), 36, 96), []);
  assert.deepEqual(zoneOverlaps(sp({ zones: moved })), []);

  // Grabbing the same split from the other side does the same thing.
  const other = dragSplitPoint(zones, 1, 'low', 48);
  assert.equal(other[1].lowNote, 48);
  assert.equal(other[0].highNote, 47);

  // Dragged past the far end of its own zone, the edge pins — and the twin
  // follows where it ACTUALLY landed, so they still can't overlap.
  const pinned = dragSplitPoint(zones, 0, 'high', 10);
  assert.equal(pinned[0].highNote, 36);
  assert.equal(pinned[1].lowNote, 37);
  assert.deepEqual(zoneOverlaps(sp({ zones: pinned })), []);

  // Zones with a gap between them are NOT twins, so dragging one leaves the
  // other alone — the gap was deliberate.
  const gapped = splitZones(sp({ zones: [
    { id: 'a', lowNote: 36, highNote: 47 }, { id: 'b', lowNote: 60, highNote: 71 },
  ] }));
  assert.equal(adjacentEdge(gapped, 0, 'high'), null);
  assert.equal(dragSplitPoint(gapped, 0, 'high', 50)[1].lowNote, 60);
});

// --- Sounding-note bookkeeping ------------------------------------------------------
test('a release goes where the press went, even after the split moved', () => {
  // The bug this exists to prevent: drag a split point while a key is down and
  // a re-derived note-off goes to the wrong channel, leaving the original note
  // ringing with nothing that will ever stop it.
  const down = pressNote(EMPTY_SOUNDING, CLASSIC, 48, 100);
  assert.deepEqual(down.sends, [{ kind: 'on', channel: 1, note: 36, velocity: 100 }]);
  assert.deepEqual(soundingNotes(down.sounding), [48]);

  // The split moves: 48 now belongs to the LEAD zone on channel 2, untransposed.
  const moved = sp({ zones: [
    { id: 'lo', lowNote: 36, highNote: 40, channel: 1, transpose: -12 },
    { id: 'hi', lowNote: 41, highNote: 96, channel: 2, transpose: 0 },
  ] });
  assert.equal(routeNoteOn(moved, 48, 100)[0].channel, 2);   // a fresh press would differ
  // …but the release still goes to where the press actually went.
  const up = releaseNote(down.sounding, 48);
  assert.deepEqual(up.sends, [{ kind: 'off', channel: 1, note: 36 }]);
  assert.deepEqual(soundingNotes(up.sounding), []);
});

test('a layered press and release covers every destination', () => {
  const layered = sp({ zones: [
    { id: 'a', lowNote: 60, highNote: 72, channel: 1, transpose: 0 },
    { id: 'b', lowNote: 60, highNote: 72, channel: 3, transpose: 12 },
  ] });
  const down = pressNote(EMPTY_SOUNDING, layered, 64, 90);
  assert.equal(down.sends.length, 2);
  const up = releaseNote(down.sounding, 64);
  assert.deepEqual(up.sends, [
    { kind: 'off', channel: 1, note: 64 },
    { kind: 'off', channel: 3, note: 76 },
  ]);
});

test('a retrigger without an off releases the old routing first', () => {
  const a = pressNote(EMPTY_SOUNDING, CLASSIC, 48, 100);
  const b = pressNote(a.sounding, CLASSIC, 48, 40);
  // off then on — otherwise the first press is orphaned and rings forever.
  assert.equal(b.sends[0].kind, 'off');
  assert.equal(b.sends[1].kind, 'on');
  assert.equal(b.sends[1].velocity, 40);
  assert.deepEqual(soundingNotes(b.sounding), [48]);
});

test('a note no zone claims leaves no bookkeeping behind', () => {
  const r = pressNote(EMPTY_SOUNDING, CLASSIC, 20, 100);
  assert.deepEqual(r.sends, []);
  assert.deepEqual(soundingNotes(r.sounding), []);
  // Releasing something that was never pressed is a no-op, not a stray off.
  assert.deepEqual(releaseNote(EMPTY_SOUNDING, 60).sends, []);
});

test('release-all empties everything exactly once', () => {
  let m = EMPTY_SOUNDING;
  for (const n of [40, 48, 70]) m = pressNote(m, CLASSIC, n, 100).sounding;
  assert.deepEqual(soundingNotes(m), [40, 48, 70]);
  const all = releaseAll(m);
  assert.equal(all.sends.length, 3);
  assert.ok(all.sends.every((x) => x.kind === 'off'));
  assert.deepEqual(soundingNotes(all.sounding), []);
  assert.deepEqual(releaseAll(all.sounding).sends, [], 'and again sends nothing');
});

test('reconciling against the live keyboard presses and releases the difference', () => {
  const held = (...notes) => notes.map((n) => ({ note: n, velocity: 100 }));
  let m = EMPTY_SOUNDING;
  // Two keys go down.
  let r = reconcileHeld(m, CLASSIC, held(48, 72));
  m = r.sounding;
  assert.equal(r.sends.filter((x) => x.kind === 'on').length, 2);
  assert.deepEqual(soundingNotes(m), [48, 72]);
  // Nothing changed: nothing sent. This is what stops a 30Hz pump from
  // retriggering every held note on every frame.
  r = reconcileHeld(m, CLASSIC, held(48, 72));
  assert.deepEqual(r.sends, []);
  m = r.sounding;
  // One released, one new.
  r = reconcileHeld(m, CLASSIC, held(72, 80));
  m = r.sounding;
  assert.deepEqual(r.sends.filter((x) => x.kind === 'off'), [{ kind: 'off', channel: 1, note: 36 }]);
  assert.equal(r.sends.filter((x) => x.kind === 'on').length, 1);
  assert.deepEqual(soundingNotes(m), [72, 80]);
  // Everything up.
  r = reconcileHeld(m, CLASSIC, []);
  assert.equal(r.sends.length, 2);
  assert.deepEqual(soundingNotes(r.sounding), []);
});

test('a mouse-auditioned key survives a keyboard reconcile', () => {
  // Clicking a key in preview holds it; the input pump must not release it just
  // because no hardware key is down.
  const clicked = pressNote(EMPTY_SOUNDING, CLASSIC, 64, 100);
  const r = reconcileHeld(clicked.sounding, CLASSIC, [], 64);
  assert.deepEqual(r.sends, []);
  assert.deepEqual(soundingNotes(r.sounding), [64]);
  // Without the keep, it is released like anything else.
  assert.equal(reconcileHeld(clicked.sounding, CLASSIC, []).sends.length, 1);
});

// --- Raw bytes to routed output ------------------------------------------------------
// The actual chain the hardware drives, minus Svelte: MIDI hex → the shared
// note-input reducer → held entries → the splitter. Worth having end to end,
// because each half being right doesn't prove they agree about the shape of a
// held note.
test('raw MIDI hex arrives as routed output on the right channels', async () => {
  const { applyMidiHex, heldNoteEntries, EMPTY_NOTE_STATE } =
    await import('../src/CE_Application/utils/midiNoteInput.js');

  let notes = EMPTY_NOTE_STATE;
  let sounding = EMPTY_SOUNDING;
  const pump = () => {
    const r = reconcileHeld(sounding, CLASSIC, heldNoteEntries(notes, 0));
    sounding = r.sounding;
    return r.sends;
  };

  // Left hand: C2 and E2 on channel 1, hard.
  notes = applyMidiHex(notes, '90 24 64 90 28 64');
  assert.deepEqual(pump(), [
    { kind: 'on', channel: 1, note: 24, velocity: 100 },   // 36 - 12
    { kind: 'on', channel: 1, note: 28, velocity: 100 },   // 40 - 12
  ]);

  // Right hand joins, on a different channel of the same keyboard — omni takes
  // it, and the LEAD zone claims it: channel 2, untransposed.
  notes = applyMidiHex(notes, '92 4C 50');
  assert.deepEqual(pump(), [{ kind: 'on', channel: 2, note: 76, velocity: 80 }]);

  // Note-on with velocity 0 is a note-off, which is how hardware releases keys
  // under running status. The off must go to ch1/24, not ch1/36.
  notes = applyMidiHex(notes, '90 24 00');
  assert.deepEqual(pump(), [{ kind: 'off', channel: 1, note: 24 }]);
  assert.deepEqual(soundingNotes(sounding), [40, 76]);

  // An all-notes-off (CC123) on channel 1 clears that channel only.
  notes = applyMidiHex(notes, 'B0 7B 00');
  assert.deepEqual(pump(), [{ kind: 'off', channel: 1, note: 28 }]);
  assert.deepEqual(soundingNotes(sounding), [76]);

  // A key below every zone reaches the splitter and is dropped there, silently.
  notes = applyMidiHex(notes, '90 14 64');
  assert.deepEqual(pump(), []);
  assert.deepEqual(soundingNotes(sounding), [76]);
});
