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
  CC_MODES, SUSTAIN_CC, zonePassesCc, routeCc, zoneAcceptsVelocity, zoneSwitchesOnVelocity,
  LATCHING_CCS, heldLatchingCcs, trackCc, SPLIT_PRESETS, splitPresetZones,
  BEND_MODES, BEND_CENTRE, BEND_MAX, routeBend, routePressure, bendBytes, pressureBytes,
  trackBend, offCentreBends, soundingZoneIds,
  routePolyPressure, polyPressureBytes,
  SPLIT_SCRIPT_ACTIONS, applySplitScriptAction, scriptApplyPreset, scriptPatchZone,
  scriptSetZoneEnabled, scriptSetZoneChannel, scriptSetZoneTranspose, scriptSetSplitPoint,
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

test('raw MIDI hex arrives as routed controllers on the right channels', async () => {
  const { expressionEventsFromHex } = await import('../src/CE_Application/utils/midiNoteInput.js');
  // The same split, but the bass synth's mod wheel means something unhelpful,
  // so that zone forwards nothing while still taking the pedal.
  const filtered = sp({ zones: [
    { id: 'lo', lowNote: 36, highNote: 59, channel: 1, ccMode: 'none', sustain: true },
    { id: 'hi', lowNote: 60, highNote: 96, channel: 2, ccMode: 'all', sustain: false },
  ] });
  const route = (hex) => expressionEventsFromHex(hex)
    .filter((e) => e.kind === 'cc')
    .flatMap((e) => routeCc(filtered, e.cc, e.value));

  // Mod wheel: only the lead hears it.
  assert.deepEqual(route('B0 01 40'), [{ zoneId: 'hi', channel: 2, cc: 1, value: 64 }]);
  // Sustain: only the bass, because the lead's pedal switch is off.
  assert.deepEqual(route('B0 40 7F'), [{ zoneId: 'lo', channel: 1, cc: 64, value: 127 }]);
  // Several controllers in one blob, running status and all.
  const sweep = route('B0 01 20 01 30 01 40');
  assert.equal(sweep.length, 3, 'running status keeps the whole sweep');
  assert.ok(sweep.every((m) => m.channel === 2));
  assert.deepEqual(sweep.map((m) => m.value), [32, 48, 64]);
  // Channel-mode messages (120+) are not continuous controllers and must not be
  // re-sent as if they were — they mean "silence the channel".
  assert.deepEqual(route('B0 7B 00'), []);
});

test('raw MIDI hex arrives as a routed bend on the zone you played', async () => {
  const { expressionEventsFromHex, applyMidiHex, heldNoteEntries, EMPTY_NOTE_STATE } =
    await import('../src/CE_Application/utils/midiNoteInput.js');

  // Play a note in the lead zone, then bend.
  let notes = applyMidiHex(EMPTY_NOTE_STATE, '90 48 64');
  const held = heldNoteEntries(notes, 0);
  const r = reconcileHeld(EMPTY_SOUNDING, CLASSIC, held);
  assert.deepEqual(r.zoneIds, ['hi']);

  const attribution = { lastZoneIds: r.zoneIds, soundingZoneIds: soundingZoneIds(r.sounding) };
  const bends = expressionEventsFromHex('E0 00 60')
    .filter((e) => e.kind === 'bend')
    .flatMap((e) => routeBend(CLASSIC, e.value14, attribution));
  // 0x60 << 7 = 12288, on channel 2 only — the bass does not bend.
  assert.deepEqual(bends, [{ zoneId: 'hi', channel: 2, value14: 12288 }]);
  assert.deepEqual(bendBytes(bends[0].channel, bends[0].value14), [0xE1, 0x00, 0x60],
    'and it goes back out with all fourteen bits intact');

  // Channel pressure follows the same attribution.
  const press = expressionEventsFromHex('D0 5A')
    .filter((e) => e.kind === 'aftertouch')
    .flatMap((e) => routePressure(CLASSIC, e.value, attribution));
  assert.deepEqual(press, [{ zoneId: 'hi', channel: 2, value: 90 }]);

  // A bend on a channel the splitter isn't listening to is filtered upstream by
  // the pump, but a bend it DOES take while nothing is held still lands
  // somewhere — 'sounding' mode is the one that goes quiet.
  notes = applyMidiHex(notes, '80 48 00');
  const after = reconcileHeld(r.sounding, CLASSIC, heldNoteEntries(notes, 0));
  assert.deepEqual(soundingZoneIds(after.sounding), []);
  const soundingOnly = sp({ zones: [
    { id: 'lo', lowNote: 36, highNote: 59, channel: 1, bendMode: 'sounding' },
    { id: 'hi', lowNote: 60, highNote: 96, channel: 2, bendMode: 'sounding' },
  ] });
  assert.deepEqual(routeBend(soundingOnly, 12288, { lastZoneIds: ['hi'], soundingZoneIds: [] }), []);
});

// --- Per-zone CC filtering + sustain -------------------------------------------------
test('a zone forwards the controllers it says it does', () => {
  const all = splitZones(sp({ zones: [{ ccMode: 'all' }] }))[0];
  const none = splitZones(sp({ zones: [{ ccMode: 'none' }] }))[0];
  const list = splitZones(sp({ zones: [{ ccMode: 'list', ccList: [11, 1, 74, 1] }] }))[0];
  assert.deepEqual(list.ccList, [1, 11, 74], 'deduped and sorted');
  assert.equal(zonePassesCc(all, 1), true);
  assert.equal(zonePassesCc(none, 1), false);
  assert.equal(zonePassesCc(list, 11), true);
  assert.equal(zonePassesCc(list, 7), false);
  // An unknown mode falls back to passing everything, not to silence.
  assert.equal(zonePassesCc(splitZones(sp({ zones: [{ ccMode: 'nope' }] }))[0], 1), true);
});

test('sustain answers to its own switch, whatever the CC mode says', () => {
  // A pedal is not something anyone should have to discover is governed by a
  // list of numbers three menus down.
  const blockAllButPedal = splitZones(sp({ zones: [{ ccMode: 'none', sustain: true }] }))[0];
  assert.equal(zonePassesCc(blockAllButPedal, 1), false);
  assert.equal(zonePassesCc(blockAllButPedal, SUSTAIN_CC), true);
  const passAllButPedal = splitZones(sp({ zones: [{ ccMode: 'all', sustain: false }] }))[0];
  assert.equal(zonePassesCc(passAllButPedal, 1), true);
  assert.equal(zonePassesCc(passAllButPedal, SUSTAIN_CC), false);
  // Default is on: a split where the pedal silently stopped working would be
  // reported as a bug, and rightly.
  assert.equal(zonePassesCc(splitZones(sp({ zones: [{}] }))[0], SUSTAIN_CC), true);
});

test('a controller reaches each channel once, never twice', () => {
  // Two zones on the SAME channel — a keyboard split into a low and high half of
  // one patch. Doubling every mod-wheel message is twice the traffic for no
  // audible difference, and on a busy wire that matters.
  const sameCh = sp({ zones: [
    { id: 'a', lowNote: 0, highNote: 59, channel: 1 },
    { id: 'b', lowNote: 60, highNote: 127, channel: 1 },
  ] });
  assert.deepEqual(routeCc(sameCh, 1, 90), [{ zoneId: 'a', channel: 1, cc: 1, value: 90 }]);
  // Different channels: once each.
  assert.equal(routeCc(CLASSIC, 1, 90).length, 2);
  // A zone that blocks it is skipped; a disabled zone doesn't count either.
  const mixed = sp({ zones: [
    { id: 'a', channel: 1, ccMode: 'none' },
    { id: 'b', channel: 2, ccMode: 'all' },
    { id: 'c', channel: 3, ccMode: 'all', enabled: false },
  ] });
  assert.deepEqual(routeCc(mixed, 1, 64), [{ zoneId: 'b', channel: 2, cc: 1, value: 64 }]);
  // Nothing claims it and pass-through is off: silence.
  assert.deepEqual(routeCc(sp({ zones: [{ channel: 1, ccMode: 'none' }] }), 1, 64), []);
  // Pass-through forwards controllers too, so a half-built panel doesn't go
  // dead the moment you touch the mod wheel.
  const pass = sp({ unmatched: 'pass', passChannel: 9, zones: [{ channel: 1, ccMode: 'none' }] });
  assert.deepEqual(routeCc(pass, 1, 64), [{ zoneId: '', channel: 9, cc: 1, value: 64 }]);
  // Values clamp into range.
  assert.equal(routeCc(CLASSIC, 1, 999)[0].value, 127);
});

test('latching controllers are remembered so they can be let go', () => {
  // Releasing the notes but leaving the pedal down is the half-fix that looks
  // like the panic button doesn't work.
  assert.ok(LATCHING_CCS.includes(SUSTAIN_CC));
  let st = trackCc({}, routeCc(CLASSIC, SUSTAIN_CC, 127));
  assert.deepEqual(heldLatchingCcs(CLASSIC, st).sort((a, b) => a.channel - b.channel), [
    { channel: 1, cc: SUSTAIN_CC, value: 0 },
    { channel: 2, cc: SUSTAIN_CC, value: 0 },
  ]);
  // A mod wheel is not latching — leaving it at 40 is a tone, not a hung note.
  st = trackCc(st, routeCc(CLASSIC, 1, 40));
  assert.equal(heldLatchingCcs(CLASSIC, st).length, 2);
  // Pedal up: nothing left to release.
  st = trackCc(st, routeCc(CLASSIC, SUSTAIN_CC, 0));
  assert.deepEqual(heldLatchingCcs(CLASSIC, st), []);
  // Tracking the same value twice returns the SAME object, so a held pedal
  // doesn't churn state on every repeat.
  const same = trackCc(st, routeCc(CLASSIC, SUSTAIN_CC, 0));
  assert.equal(same, st);
});

// --- Velocity switching ---------------------------------------------------------------
test('a zone only answers notes played inside its velocity window', () => {
  const layers = sp({ zones: [
    { id: 'soft', lowNote: 0, highNote: 127, channel: 1, velSwitchLow: 1, velSwitchHigh: 79 },
    { id: 'hard', lowNote: 0, highNote: 127, channel: 2, velSwitchLow: 80, velSwitchHigh: 127 },
  ] });
  assert.deepEqual(routeNoteOn(layers, 60, 40).map((o) => o.channel), [1]);
  assert.deepEqual(routeNoteOn(layers, 60, 79).map((o) => o.channel), [1]);
  assert.deepEqual(routeNoteOn(layers, 60, 80).map((o) => o.channel), [2]);
  assert.deepEqual(routeNoteOn(layers, 60, 127).map((o) => o.channel), [2]);
  // Windows may overlap, and then both sound — a soft pad under a hard lead.
  const overlapping = sp({ zones: [
    { id: 'a', lowNote: 0, highNote: 127, channel: 1, velSwitchLow: 1, velSwitchHigh: 100 },
    { id: 'b', lowNote: 0, highNote: 127, channel: 2, velSwitchLow: 60, velSwitchHigh: 127 },
  ] });
  assert.deepEqual(routeNoteOn(overlapping, 60, 70).map((o) => o.channel), [1, 2]);
  // A gap in the windows means silence, which the editor warns about.
  const gapped = sp({ zones: [
    { id: 'a', lowNote: 0, highNote: 127, channel: 1, velSwitchLow: 1, velSwitchHigh: 40 },
    { id: 'b', lowNote: 0, highNote: 127, channel: 2, velSwitchLow: 90, velSwitchHigh: 127 },
  ] });
  assert.deepEqual(routeNoteOn(gapped, 60, 64), []);
  // Off by default, so nothing changes until asked.
  assert.equal(zoneSwitchesOnVelocity(splitZones(sp({ zones: [{}] }))[0]), false);
  assert.equal(zoneAcceptsVelocity(splitZones(sp({ zones: [{}] }))[0], 1), true);
  assert.equal(zoneAcceptsVelocity(splitZones(sp({ zones: [{}] }))[0], 127), true);
  // Written backwards, it still behaves.
  const rev = splitZones(sp({ zones: [{ velSwitchLow: 100, velSwitchHigh: 20 }] }))[0];
  assert.equal(zoneAcceptsVelocity(rev, 50), true);
  assert.equal(zoneAcceptsVelocity(rev, 10), false);
});

test('velocity switching and the release memory agree', () => {
  // The gate is applied on the way IN, so a note that never sounded has nothing
  // to release — and one that did is released whatever it would do now.
  const layers = sp({ zones: [
    { id: 'soft', lowNote: 0, highNote: 127, channel: 1, velSwitchHigh: 79 },
    { id: 'hard', lowNote: 0, highNote: 127, channel: 2, velSwitchLow: 80 },
  ] });
  const soft = pressNote(EMPTY_SOUNDING, layers, 60, 40);
  assert.deepEqual(soft.sends, [{ kind: 'on', channel: 1, note: 60, velocity: 40 }]);
  assert.deepEqual(releaseNote(soft.sounding, 60).sends, [{ kind: 'off', channel: 1, note: 60 }]);
});

// --- Presets ---------------------------------------------------------------------------
test('presets are built from the range you actually have', () => {
  for (const p of SPLIT_PRESETS) {
    const zones = splitPresetZones(p.id, 36, 96);
    assert.ok(zones.length >= 1, p.id);
    // Every zone must survive normalization unchanged — a preset that needs
    // repairing is a preset that will confuse someone.
    const normalized = splitZones(sp({ zones }));
    assert.equal(normalized.length, zones.length, p.id);
    for (let i = 0; i < zones.length; i += 1) {
      assert.equal(normalized[i].lowNote, zones[i].lowNote, `${p.id} zone ${i} low`);
      assert.equal(normalized[i].highNote, zones[i].highNote, `${p.id} zone ${i} high`);
      assert.equal(normalized[i].channel, zones[i].channel, `${p.id} zone ${i} channel`);
    }
    // And nothing may stick out past the keyboard it was built for.
    for (const z of zones) {
      assert.ok(z.lowNote >= 36 && z.highNote <= 96, `${p.id} escaped the range`);
    }
  }
});

test('the classic preset splits on a white key and leaves no gap', () => {
  const zones = splitPresetZones('classic', 36, 96);
  assert.equal(zones.length, 2);
  assert.equal(zones[0].transpose, -12);
  assert.equal(zones[1].lowNote, zones[0].highNote + 1, 'contiguous');
  assert.equal(isBlackKey(zones[1].lowNote), false, 'a split point lands where a player would put it');
  assert.deepEqual(unclaimedNotes(sp({ zones }), 36, 96), []);
  assert.deepEqual(zoneOverlaps(sp({ zones })), []);
  // A 25-key controller gets boundaries on keys it actually has.
  const small = splitPresetZones('classic', 48, 72);
  assert.ok(small[0].lowNote === 48 && small[1].highNote === 72);
  assert.ok(small[0].highNote < small[1].lowNote);
});

test('the layer and velocity presets do what their names say', () => {
  const layered = splitPresetZones('splitLayer', 36, 96);
  assert.equal(layered.length, 3);
  // Two of them cover the same upper range on different channels — the layer.
  const overlaps = zoneOverlaps(sp({ zones: layered }));
  assert.equal(overlaps.length, 1);
  assert.equal(layered[2].transpose, 12);

  const vel = splitPresetZones('velLayer', 36, 96);
  assert.equal(vel.length, 2);
  assert.equal(vel[0].lowNote, vel[1].lowNote, 'same keys');
  // Windows abut with no hole: every velocity reaches exactly one of them.
  assert.equal(vel[0].velSwitchHigh + 1, vel[1].velSwitchLow);
  const c = sp({ zones: vel });
  for (const v of [1, 40, 79, 80, 110, 127]) {
    assert.equal(routeNoteOn(c, 60, v).length, 1, `velocity ${v}`);
  }

  const three = splitPresetZones('threeWay', 36, 96);
  assert.equal(three.length, 3);
  assert.deepEqual(unclaimedNotes(sp({ zones: three }), 36, 96), []);
  assert.deepEqual(zoneOverlaps(sp({ zones: three })), []);

  const whole = splitPresetZones('whole', 36, 96);
  assert.equal(whole.length, 1);
  assert.equal(whole[0].lowNote, 36);
  assert.equal(whole[0].highNote, 96);
});

// --- Pitch bend + channel pressure ----------------------------------------------------
// The awkward ones: no note in the message, so who hears them is a RULE.
test('a bend goes to the zone you last played, in a split', () => {
  const down = pressNote(EMPTY_SOUNDING, CLASSIC, 72, 100);      // the lead
  assert.deepEqual(down.zoneIds, ['hi']);
  const bend = routeBend(CLASSIC, 12000, { lastZoneIds: down.zoneIds });
  assert.deepEqual(bend, [{ zoneId: 'hi', channel: 2, value14: 12000 }]);
  // Play the bass instead and the bend follows.
  const low = pressNote(down.sounding, CLASSIC, 40, 100);
  assert.deepEqual(routeBend(CLASSIC, 12000, { lastZoneIds: low.zoneIds }),
    [{ zoneId: 'lo', channel: 1, value14: 12000 }]);
});

test('a bend goes to BOTH zones of a layer, because both claimed the note', () => {
  // This is why the rule is a SET rather than one zone: in a layer the same
  // note-on is claimed twice, so both bend together and stay in tune with each
  // other. A single-zone rule would bend half the layer.
  const layered = sp({ zones: [
    { id: 'a', lowNote: 60, highNote: 72, channel: 1 },
    { id: 'b', lowNote: 60, highNote: 72, channel: 3, transpose: 12 },
  ] });
  const down = pressNote(EMPTY_SOUNDING, layered, 64, 90);
  assert.deepEqual(down.zoneIds, ['a', 'b']);
  assert.deepEqual(routeBend(layered, 3000, { lastZoneIds: down.zoneIds }).map((m) => m.channel), [1, 3]);
});

test('before anything is played a bend goes everywhere, then narrows', () => {
  // "I moved the bend wheel and nothing happened" reads as broken, so with no
  // history there is nothing to attribute to and it broadcasts.
  assert.equal(routeBend(CLASSIC, 9000, { lastZoneIds: [] }).length, 2);
  assert.equal(routeBend(CLASSIC, 9000, null).length, 2);
  assert.equal(routeBend(CLASSIC, 9000, { lastZoneIds: ['hi'] }).length, 1);
});

test('the four bend modes do what they say', () => {
  const modes = (a, b) => sp({ zones: [
    { id: 'lo', lowNote: 36, highNote: 59, channel: 1, bendMode: a },
    { id: 'hi', lowNote: 60, highNote: 96, channel: 2, bendMode: b },
  ] });
  const attr = { lastZoneIds: ['hi'], soundingZoneIds: ['lo'] };
  // off: never, whatever is playing.
  assert.deepEqual(routeBend(modes('off', 'off'), 100, attr), []);
  // always: unconditionally.
  assert.equal(routeBend(modes('always', 'always'), 100, attr).length, 2);
  // lastPlayed: the lead, which is what was played last.
  assert.deepEqual(routeBend(modes('lastPlayed', 'lastPlayed'), 100, attr).map((m) => m.zoneId), ['hi']);
  // sounding: the bass, which is what is still holding a note.
  assert.deepEqual(routeBend(modes('sounding', 'sounding'), 100, attr).map((m) => m.zoneId), ['lo']);
  // Mixed modes on the same splitter are fine.
  assert.deepEqual(routeBend(modes('always', 'off'), 100, attr).map((m) => m.zoneId), ['lo']);
  // An unknown mode falls back to the default rather than to silence.
  assert.equal(routeBend(modes('nonsense', 'nonsense'), 100, attr).length, 1);
  assert.equal(BEND_MODES.length, 4);
});

test('sounding attribution follows what is actually held', () => {
  let m = EMPTY_SOUNDING;
  assert.deepEqual(soundingZoneIds(m), []);
  m = pressNote(m, CLASSIC, 40, 100).sounding;
  m = pressNote(m, CLASSIC, 72, 100).sounding;
  assert.deepEqual(soundingZoneIds(m).sort(), ['hi', 'lo']);
  m = releaseNote(m, 40).sounding;
  assert.deepEqual(soundingZoneIds(m), ['hi']);
  m = releaseAll(m).sounding;
  assert.deepEqual(soundingZoneIds(m), []);
});

test('a bend keeps all fourteen bits', () => {
  // Re-sending a bend as 7 bits turns a slow glide into a staircase, which is
  // precisely what a bend wheel exists to avoid.
  for (const v of [0, 1, 8191, BEND_CENTRE, 8193, BEND_MAX]) {
    const bytes = bendBytes(2, v);
    assert.equal(bytes[0], 0xE1, 'status carries the channel');
    assert.equal(bytes[1] & 0x80, 0);
    assert.equal(bytes[2] & 0x80, 0);
    assert.equal((bytes[2] << 7) | bytes[1], v, `round trip ${v}`);
  }
  assert.equal(routeBend(CLASSIC, 99999, { lastZoneIds: ['hi'] })[0].value14, BEND_MAX);
  assert.equal(routeBend(CLASSIC, -5, { lastZoneIds: ['hi'] })[0].value14, 0);
  assert.deepEqual(pressureBytes(3, 90), [0xD2, 90]);
});

test('an off-centre bend is remembered so panic can undo it', () => {
  // A bend left off-centre is a permanently detuned synth — the same class of
  // problem as a sustain pedal left down.
  let st = trackBend({}, routeBend(CLASSIC, 12000, { lastZoneIds: ['hi'] }));
  assert.deepEqual(offCentreBends(st), [{ channel: 2, value14: BEND_CENTRE }]);
  // Released back to centre by the player: nothing left to undo.
  st = trackBend(st, routeBend(CLASSIC, BEND_CENTRE, { lastZoneIds: ['hi'] }));
  assert.deepEqual(offCentreBends(st), []);
  // A rig nobody has touched sends nothing.
  assert.deepEqual(offCentreBends({}), []);
  assert.deepEqual(offCentreBends(null), []);
  // Repeating the same value returns the SAME object, so a parked wheel doesn't
  // churn state on every repeat.
  const same = trackBend(st, routeBend(CLASSIC, BEND_CENTRE, { lastZoneIds: ['hi'] }));
  assert.equal(same, st);
});

test('channel pressure has its own switch, sharing the rule', () => {
  // A synth that responds well to aftertouch and one that screams are a common
  // pair, so the choice is per zone and independent of bend.
  const c = sp({ zones: [
    { id: 'lo', lowNote: 36, highNote: 59, channel: 1, bendMode: 'always', pressureMode: 'off' },
    { id: 'hi', lowNote: 60, highNote: 96, channel: 2, bendMode: 'off', pressureMode: 'always' },
  ] });
  const attr = { lastZoneIds: ['hi'], soundingZoneIds: ['hi'] };
  assert.deepEqual(routeBend(c, 100, attr).map((m) => m.channel), [1]);
  assert.deepEqual(routePressure(c, 90, attr), [{ zoneId: 'hi', channel: 2, value: 90 }]);
  assert.equal(routePressure(c, 999, attr)[0].value, 127);
});

test('bend is deduplicated by channel and honours pass-through', () => {
  const sameCh = sp({ zones: [
    { id: 'a', lowNote: 0, highNote: 59, channel: 1, bendMode: 'always' },
    { id: 'b', lowNote: 60, highNote: 127, channel: 1, bendMode: 'always' },
  ] });
  assert.equal(routeBend(sameCh, 5000, null).length, 1, 'one message per channel');
  // Both switches off — pressureMode has its own default, so leaving it out
  // would send pressure to the zone and only bend to the pass channel.
  const off = sp({ unmatched: 'pass', passChannel: 9, zones: [{ channel: 1, bendMode: 'off', pressureMode: 'off' }] });
  assert.deepEqual(routeBend(off, 5000, null), [{ zoneId: '', channel: 9, value14: 5000 }]);
  assert.deepEqual(routePressure(off, 50, null), [{ zoneId: '', channel: 9, value: 50 }]);
  const dropped = sp({ zones: [{ channel: 1, bendMode: 'off', pressureMode: 'off' }] });
  assert.deepEqual(routeBend(dropped, 5000, null), []);
});

test('a note nothing claims still reports an empty zone list', () => {
  // The caller reads .length off this without knowing which path pressNote
  // took; returning it only on the success path is a crash waiting to happen.
  const r = pressNote(EMPTY_SOUNDING, CLASSIC, 20, 100);
  assert.deepEqual(r.zoneIds, []);
  assert.deepEqual(reconcileHeld(EMPTY_SOUNDING, CLASSIC, [{ note: 20, velocity: 100 }]).zoneIds, null);
});

// --- Poly key pressure -----------------------------------------------------------
test('poly pressure needs no rule — it names its note', () => {
  // Unlike bend and channel pressure, this message says which key it is about,
  // so it goes exactly where that key went, transposed the same way.
  const down = pressNote(EMPTY_SOUNDING, CLASSIC, 48, 100);   // → ch1, note 36
  assert.deepEqual(routePolyPressure(CLASSIC, down.sounding, 48, 90),
    [{ zoneId: 'lo', channel: 1, note: 36, value: 90 }]);
  assert.deepEqual(polyPressureBytes(1, 36, 90), [0xA0, 36, 90]);

  // A key that isn't sounding has nothing to apply pressure to.
  assert.deepEqual(routePolyPressure(CLASSIC, down.sounding, 72, 90), []);
  assert.deepEqual(routePolyPressure(CLASSIC, EMPTY_SOUNDING, 48, 90), []);

  // And once released, likewise — no stray pressure on a dead note.
  assert.deepEqual(routePolyPressure(CLASSIC, releaseNote(down.sounding, 48).sounding, 48, 90), []);
});

test('poly pressure reaches every destination of a layered note', () => {
  const layered = sp({ zones: [
    { id: 'a', lowNote: 60, highNote: 72, channel: 1 },
    { id: 'b', lowNote: 60, highNote: 72, channel: 3, transpose: 12 },
  ] });
  const down = pressNote(EMPTY_SOUNDING, layered, 64, 90);
  assert.deepEqual(routePolyPressure(layered, down.sounding, 64, 55), [
    { zoneId: 'a', channel: 1, note: 64, value: 55 },
    { zoneId: 'b', channel: 3, note: 76, value: 55 },
  ]);
});

test('a zone can refuse poly pressure while still playing the note', () => {
  const mixed = sp({ zones: [
    { id: 'a', lowNote: 60, highNote: 72, channel: 1, polyPressure: false },
    { id: 'b', lowNote: 60, highNote: 72, channel: 3, polyPressure: true },
  ] });
  const down = pressNote(EMPTY_SOUNDING, mixed, 64, 90);
  assert.equal(down.sends.length, 2, 'both still play it');
  assert.deepEqual(routePolyPressure(mixed, down.sounding, 64, 55).map((m) => m.channel), [3]);
  // On by default.
  assert.equal(splitZones(sp({ zones: [{}] }))[0].polyPressure, true);
  assert.equal(routePolyPressure(CLASSIC, pressNote(EMPTY_SOUNDING, CLASSIC, 48, 100).sounding, 48, 1).length, 1);
});

test('pass-through carries poly pressure without needing a zone', () => {
  // An unclaimed note IS in the sounding map, on the pass channel, so its
  // pressure follows it for free.
  const pass = sp({ unmatched: 'pass', passChannel: 7, zones: [{ id: 'a', lowNote: 60, highNote: 72, channel: 1 }] });
  const down = pressNote(EMPTY_SOUNDING, pass, 40, 88);
  assert.deepEqual(routePolyPressure(pass, down.sounding, 40, 33),
    [{ zoneId: '', channel: 7, note: 40, value: 33 }]);
});

// --- Scripting -----------------------------------------------------------------------
test('every advertised script action does something', () => {
  const base = splitPresetZones('classic', 36, 96);
  for (const a of SPLIT_SCRIPT_ACTIONS) {
    // enabled:false, because the default is "enable" and these are already on —
    // "mute changed nothing" would be the correct answer to the wrong question.
    const out = applySplitScriptAction(base, a.id, {
      preset: 'threeWay', zone: 0, channel: 5, transpose: 7, note: 50, enabled: false,
    });
    assert.ok(Array.isArray(out), a.id);
    assert.notDeepEqual(out, base, `${a.id} changed nothing`);
    // Whatever it produced must survive normalization untouched, or a script
    // could write a zone list the engine then quietly repairs.
    const norm = splitZones(sp({ zones: out }));
    assert.equal(norm.length, out.length, a.id);
    for (let i = 0; i < out.length; i += 1) {
      assert.equal(norm[i].channel, out[i].channel, `${a.id} zone ${i}`);
      assert.equal(norm[i].lowNote, out[i].lowNote, `${a.id} zone ${i}`);
      assert.equal(norm[i].highNote, out[i].highNote, `${a.id} zone ${i}`);
    }
  }
  // An action nobody registered leaves the zones alone.
  assert.deepEqual(applySplitScriptAction(base, 'nonsense', {}), base);
});

test('a script addresses a zone by name as well as by index', () => {
  // An index breaks the moment someone reorders the zones; a name survives it.
  const base = splitPresetZones('classic', 36, 96);   // Bass, Lead
  assert.equal(scriptSetZoneEnabled(base, 'Bass', false)[0].enabled, false);
  assert.equal(scriptSetZoneEnabled(base, 'bass', false)[0].enabled, false, 'case-insensitive');
  assert.equal(scriptSetZoneEnabled(base, 0, false)[0].enabled, false);
  assert.equal(scriptSetZoneChannel(base, 'Lead', 9)[1].channel, 9);
  assert.equal(scriptSetZoneTranspose(base, 'Lead', -12)[1].transpose, -12);
  // Values clamp rather than escaping the MIDI range.
  assert.equal(scriptSetZoneChannel(base, 'Lead', 99)[1].channel, 16);
  assert.equal(scriptSetZoneTranspose(base, 'Lead', 999)[1].transpose, 48);
  // A zone that isn't there is a no-op, not a throw — a script firing on a
  // footswitch must not take the panel down because a zone was renamed.
  assert.deepEqual(scriptSetZoneEnabled(base, 'Nope', false), base);
  assert.deepEqual(scriptSetZoneEnabled(base, 9, false), base);
  assert.deepEqual(scriptPatchZone(base, 'Bass', null), base);
  assert.deepEqual(scriptSetSplitPoint(base, 'Nope', 60), base);
});

test('a scripted split point carries its neighbour, like the drag does', () => {
  // A footswitch must not be able to leave a gap the mouse never could.
  const base = splitPresetZones('classic', 36, 96);
  const moved = scriptSetSplitPoint(base, 'Bass', 55);
  assert.equal(moved[0].highNote, 55);
  assert.equal(moved[1].lowNote, 56);
  assert.deepEqual(unclaimedNotes(sp({ zones: moved }), 36, 96), []);
  assert.deepEqual(zoneOverlaps(sp({ zones: moved })), []);
});

test('a scripted preset is the same one the button applies', () => {
  assert.deepEqual(scriptApplyPreset([], 'threeWay', 36, 96), splitPresetZones('threeWay', 36, 96));
  // An unknown preset falls back to the whole keyboard rather than to nothing:
  // a script typo should not silence the rig.
  assert.equal(scriptApplyPreset([], 'nope', 36, 96).length, 1);
  assert.equal(applySplitScriptAction([], 'preset', { preset: 'velLayer' }).length, 2);
});
