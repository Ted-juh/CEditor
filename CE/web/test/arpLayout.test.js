import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arpPattern, arpPhase, arpRate, arpBaseNotes, expandOctaves, orderNotes, arpSequence,
  euclid, stepFires, stepIndexAt, swingDelay, gateSeconds, stepSeconds,
  arpGeometry, arpCell, arpCellAt, arpVelocity, arpChannel, ARP_PATTERNS,
  toggleMute, midiNoteLabel, arpUseFlats, arpSource, arpSourceIsExternal, ARP_SOURCES,
  arpSynced, arpDivision, arpBeatsPerStep, syncedStepAt, syncedPhaseAt,
} from '../src/CE_Application/utils/arpLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ap(a) { return { _children: { Core: { controlType: 'Arp' }, Arp: a } }; }
const flat = (seq) => seq.map((s) => (s.length === 1 ? s[0] : s));

test('config basics clamp + wrap', () => {
  assert.equal(arpPattern(ap({ pattern: 'nope' })), 'up');
  assert.equal(arpPattern(ap({ pattern: 'downup' })), 'downup');
  assert.ok(near(arpPhase(ap({ phase: 1.25 })), 0.25));
  assert.ok(near(arpPhase(ap({ phase: 0.1, __phase: 0.8 })), 0.8));
  assert.ok(near(arpRate(ap({ rate: 0 })), 0.1));
  assert.equal(arpVelocity(ap({ velocity: 999 })), 127);
  assert.equal(arpChannel(ap({ channel: 99 })), 16);
});

test('own chord source builds a triad from key/scale/degree', () => {
  // C minor, degree 0, base octave 3 → C3 E♭3 G3 = 48, 51, 55
  const notes = arpBaseNotes(ap({ source: 'chord', key: 0, scale: 'minor', degree: 0, baseOctave: 3 }));
  assert.deepEqual(notes, [48, 51, 55]);
});

test('external sources take the injected held notes (deduped + sorted)', () => {
  const notes = arpBaseNotes(ap({ source: 'link', __sourceNotes: [67, 60, 64, 60] }));
  assert.deepEqual(notes, [60, 64, 67]);
  assert.deepEqual(arpBaseNotes(ap({ source: 'link' })), []);   // nothing held yet
  // 'input' (a keyboard on the MIDI in) feeds the arp exactly the same way
  assert.deepEqual(arpBaseNotes(ap({ source: 'input', __sourceNotes: [64, 60] })), [60, 64]);
  assert.equal(arpSource(ap({ source: 'input' })), 'input');
  assert.equal(arpSource(ap({ source: 'bogus' })), 'chord');
  assert.equal(arpSourceIsExternal(ap({ source: 'chord' })), false);
  assert.equal(arpSourceIsExternal(ap({ source: 'input' })), true);
  assert.deepEqual(ARP_SOURCES, ['chord', 'link', 'input']);
});

test('expandOctaves repeats the set upward', () => {
  assert.deepEqual(expandOctaves([60, 64, 67], 1), [60, 64, 67]);
  assert.deepEqual(expandOctaves([60, 64, 67], 2), [60, 64, 67, 72, 76, 79]);
  // never exceeds MIDI 127
  for (const n of expandOctaves([120, 124], 4)) assert.ok(n <= 127);
});

test('patterns order the walk correctly', () => {
  const n = [60, 64, 67];
  assert.deepEqual(flat(orderNotes(n, 'up')), [60, 64, 67]);
  assert.deepEqual(flat(orderNotes(n, 'down')), [67, 64, 60]);
  // up-down doesn't repeat the endpoints: 60 64 67 64
  assert.deepEqual(flat(orderNotes(n, 'updown')), [60, 64, 67, 64]);
  assert.deepEqual(flat(orderNotes(n, 'downup')), [67, 64, 60, 64]);
  // chord mode is a single step holding everything
  const chord = orderNotes(n, 'chord');
  assert.equal(chord.length, 1);
  assert.deepEqual(chord[0], [60, 64, 67]);
  assert.deepEqual(orderNotes([], 'up'), []);
});

test('arpSequence combines octaves + pattern', () => {
  const c = ap({ pattern: 'up', octaves: 2 });
  assert.deepEqual(flat(arpSequence(c, [60, 64])), [60, 64, 72, 76]);
  const d = ap({ pattern: 'down', octaves: 2 });
  assert.deepEqual(flat(arpSequence(d, [60, 64])), [76, 72, 64, 60]);
});

test('euclid spreads pulses over steps', () => {
  assert.deepEqual(euclid(4, 0), [false, false, false, false]);
  assert.deepEqual(euclid(4, 4), [true, true, true, true]);
  // 4 pulses over 8 → every other step
  assert.deepEqual(euclid(8, 4), [false, true, false, true, false, true, false, true]);
  // the classic 3-over-8 tresillo shape: 3 hits, evenly spread
  const e38 = euclid(8, 3);
  assert.equal(e38.filter(Boolean).length, 3);
  // 5 over 8 keeps 5 hits
  assert.equal(euclid(8, 5).filter(Boolean).length, 5);
  // rotation shifts the pattern without changing the hit count
  const r = euclid(8, 3, 2);
  assert.equal(r.filter(Boolean).length, 3);
  assert.notDeepEqual(r, e38);
});

test('stepFires honours the euclid mask only when enabled', () => {
  const off = ap({ euclidEnabled: false, euclidSteps: 8, euclidPulses: 1 });
  for (let i = 0; i < 8; i += 1) assert.equal(stepFires(off, i), true);
  const on = ap({ euclidEnabled: true, euclidSteps: 8, euclidPulses: 4, euclidRotate: 0 });
  const mask = euclid(8, 4);
  for (let i = 0; i < 8; i += 1) assert.equal(stepFires(on, i), mask[i]);
  // it wraps past the mask length
  assert.equal(stepFires(on, 8), mask[0]);
});

test('step index, swing and gate timing', () => {
  assert.equal(stepIndexAt(0, 4), 0);
  assert.equal(stepIndexAt(0.5, 4), 2);
  assert.equal(stepIndexAt(0.99, 4), 3);
  // swing delays odd steps only
  assert.ok(near(swingDelay(0, 0.5, 0.2), 0));
  assert.ok(near(swingDelay(1, 0.5, 0.2), 0.05));   // 0.5 * 0.5 * 0.2
  assert.ok(near(swingDelay(1, 0, 0.2), 0));
  // gate is a fraction of the step
  assert.ok(near(stepSeconds(ap({ rate: 4 })), 0.25));
  assert.ok(near(gateSeconds(ap({ gate: 0.5 }), 0.2), 0.1));
  assert.ok(gateSeconds(ap({ gate: 0 }), 0.2) > 0);  // never zero-length
});

test('step-lane geometry + hit-test', () => {
  const g = arpGeometry(320, 90, 8, 8, 26);
  assert.equal(g.count, 8);
  const c0 = arpCell(g, 0);
  const c7 = arpCell(g, 7);
  assert.ok(c7.x > c0.x);
  assert.equal(arpCellAt(g, c0.x + 1, 8), 0);
  assert.equal(arpCellAt(g, c7.x + 1, 8), 7);
  assert.equal(arpCellAt(g, g.x0 - 5, 8), -1);
});

test('hand-muted steps never fire, and toggle round-trips', () => {
  const c = ap({ mutes: [2] });
  assert.equal(stepFires(c, 1), true);
  assert.equal(stepFires(c, 2), false);
  // a mute wins even when the euclid mask says "hit"
  const e = ap({ euclidEnabled: true, euclidSteps: 4, euclidPulses: 4, mutes: [0] });
  assert.equal(stepFires(e, 0), false);
  assert.equal(stepFires(e, 1), true);
  assert.deepEqual(toggleMute(ap({}), 3), [3]);
  assert.deepEqual(toggleMute(ap({ mutes: [1, 3] }), 3), [1]);
  assert.deepEqual(toggleMute(ap({ mutes: [3] }), 1), [1, 3]);
});

test('note labels + spelling', () => {
  assert.equal(midiNoteLabel(60), 'C4');
  assert.equal(midiNoteLabel(63, true), 'E♭4');
  assert.equal(midiNoteLabel(63, false), 'D♯4');
  assert.equal(arpUseFlats(ap({ key: 0, scale: 'minor' })), true);   // C minor → E♭
  assert.equal(arpUseFlats(ap({ key: 0, scale: 'major' })), false);
});

test('pattern registry is complete', () => {
  assert.equal(ARP_PATTERNS.length, 7);
  for (const p of ARP_PATTERNS) assert.equal(arpPattern(ap({ pattern: p })), p);
});

// --- Tempo sync ---------------------------------------------------------------
test('sync config falls back to a sane division', () => {
  assert.equal(arpSynced(ap({})), false);
  assert.equal(arpSynced(ap({ syncToTransport: true })), true);
  assert.equal(arpDivision(ap({})), '1/16');
  assert.equal(arpDivision(ap({ division: 'banana' })), '1/16');
  assert.equal(arpDivision(ap({ division: '1/8T' })), '1/8T');
  assert.ok(near(arpBeatsPerStep(ap({ division: '1/8' })), 0.5));
  assert.ok(near(arpBeatsPerStep(ap({ division: '1/4D' })), 1.5));
});

test('synced step length is the division at the transport tempo', () => {
  const free = ap({ rate: 4 });
  assert.ok(near(stepSeconds(free, 120), 0.25));           // not synced: bpm ignored
  const sync = ap({ rate: 4, syncToTransport: true, division: '1/16' });
  assert.ok(near(stepSeconds(sync, 120), 0.125));          // 16th at 120bpm
  assert.ok(near(stepSeconds(sync, 60), 0.25));            // half the tempo, twice as long
  // No transport reading available yet — fall back to the free-running rate
  // rather than guessing a tempo.
  assert.ok(near(stepSeconds(sync, null), 0.25));
  // Gate is a fraction of the step, so it follows the tempo for free.
  assert.ok(near(gateSeconds(ap({ gate: 0.5, syncToTransport: true }), stepSeconds(sync, 120)), 0.0625));
});

test('synced position maps to a step without accumulating', () => {
  const c = ap({ syncToTransport: true, division: '1/16' });   // 0.25 beats/step
  assert.equal(syncedStepAt(0, c, 4), 0);
  assert.equal(syncedStepAt(0.24, c, 4), 0);
  assert.equal(syncedStepAt(0.25, c, 4), 1);
  assert.equal(syncedStepAt(0.75, c, 4), 3);
  assert.equal(syncedStepAt(1.0, c, 4), 0);                    // wraps with the sequence
  // The point of position-not-phase: joining late lands on the step the bar is
  // actually on, not on step 0.
  assert.equal(syncedStepAt(12.5, c, 4), 2);
  assert.ok(near(syncedPhaseAt(0.5, c, 4), 0.5));
  assert.ok(near(syncedPhaseAt(1.5, c, 4), 0.5));              // one sequence later, same phase
});

test('two synced arps on different divisions stay in a fixed ratio', () => {
  const eighth = ap({ syncToTransport: true, division: '1/8' });
  const sixteenth = ap({ syncToTransport: true, division: '1/16' });
  for (const beats of [0.5, 1.25, 3, 7.75]) {
    const a = Math.floor(beats / arpBeatsPerStep(eighth));
    const b = Math.floor(beats / arpBeatsPerStep(sixteenth));
    assert.equal(b, a * 2 + (Math.floor(beats * 4) % 2));      // exactly twice as fast, always
  }
});
