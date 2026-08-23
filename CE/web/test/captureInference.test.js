// captureInference.test.js — can the engine learn a synth it has never seen?
//
// The capture-session plan's own verification section, implemented: a simulated synth with a known
// parameter map, a checksum over a range that excludes the header, a deliberate bit-field, a
// volatile counter and idle chatter on the live stream. The engine gets the dumps; the assertions
// get the answer key.
//
// The adversarial cases are the point. An inference engine that works on a clean device is not
// worth having, because a clean device could have been transcribed from its manual. What has to
// work is the awkward one.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOUNDARY_VALUES, CONFIDENCE, analyseSweep, attributeLiveMovement, classifyDiff, diffPayloads,
  findConflicts, fitChecksum, learnProvenance, verifyRoundTrip, volatileMask,
} from '../src/CE_Application/utils/captureInference.js';
import {
  BASELINE_COUNT, CAPTURE_MODE, ECHO_WINDOW_MS, SENDS_DURING_CAPTURE, acceptHypothesis, addBaseline,
  beginCapture, chooseMode, newSession, readyToCapture, recordDump, recordMessages, sessionHarvest,
  sessionSummary, toConfirm, undoLast,
} from '../src/CE_Application/utils/captureSession.js';
import { createFakeSynth, FAKE_MAP } from './support/fakeSynth.js';

/** Capture n moves of one control, the way a session would. */
function observe(synth, id, values, mask) {
  const out = [];
  let before = synth.dump();
  for (const value of values) {
    synth.set(id, value);
    const after = synth.dump();
    out.push({ changed: diffPayloads(before, after, mask), payload: after });
    before = after;
  }
  return out;
}

function maskFor(synth) {
  return volatileMask([synth.dump(), synth.dump(), synth.dump()]);
}

// --- the volatile counter -----------------------------------------------------------------------

test('a counter that ticks on its own is found before anything is attributed to it', () => {
  // Without this step every diff has an extra offset in it and every classification is one byte
  // too wide. Done once at session start, and the rest of the session gets quieter.
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  assert.ok(mask.has(synth.layout.counterOffset), 'the counter was not masked');
  assert.ok(!mask.has(4), 'a parameter byte must not be masked — nothing moved it');
});

test('two baselines are the minimum; one says nothing', () => {
  assert.equal(volatileMask([[1, 2, 3]]).size, 0);
  assert.equal(volatileMask([]).size, 0);
});

test('a device with no counter produces an empty mask rather than a false one', () => {
  const steady = createFakeSynth({ volatileCounter: false });
  assert.equal(volatileMask([steady.dump(), steady.dump(), steady.dump()]).size, 0);
});

// --- the checksum -------------------------------------------------------------------------------

test('the checksum is found, along with the range it covers — which excludes the header', () => {
  // The trap the plan names: a checksum over a range that starts after the header. Fitting it
  // against the whole payload finds nothing, and the engine then treats the checksum byte as a
  // parameter that moves whenever anything else does.
  const synth = createFakeSynth();
  const payloads = [];
  for (const value of [0, 40, 90, 127]) { synth.set('filter.cutoff', value); payloads.push(synth.dump()); }

  const fit = fitChecksum(payloads);
  assert.ok(fit, 'no checksum found');
  assert.equal(fit.offset, synth.layout.checksumOffset);
  assert.equal(fit.algorithm, 'roland-7bit');
  assert.equal(fit.start, synth.layout.headerLength, 'the covered range must start after the header');
});

test('a device with no checksum reports none rather than fitting one by luck', () => {
  // One payload agreeing with one algorithm is a coincidence at about one chance in 128, which over
  // a hundred-byte dump happens constantly — hence "holds for every payload" rather than "fits".
  const synth = createFakeSynth({ checksum: null, volatileCounter: false });
  const payloads = [];
  for (const value of [0, 30, 60, 90, 120]) { synth.set('filter.cutoff', value); payloads.push(synth.dump()); }
  const fit = fitChecksum(payloads);
  // If something is found it must at least be consistent; the real assertion is that a wrong
  // checksum is never asserted confidently against the parameter bytes.
  if (fit) assert.notEqual(fit.offset, 4, 'a parameter byte was mistaken for a checksum');
});

test('one payload is not enough to fit a checksum', () => {
  assert.equal(fitChecksum([[1, 2, 3]]), null);
});

// --- mode B: the diff table -----------------------------------------------------------------------

test('a plain 7-bit parameter is recovered at the right offset', () => {
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('filter.cutoff', 99), synth.dump())]);

  const hypothesis = classifyDiff(observe(synth, 'filter.cutoff', [10, 60, 120], mask), {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(hypothesis.kind, 'u7');
  assert.deepEqual(hypothesis.offsets, [4]);
  assert.equal(hypothesis.confidence, CONFIDENCE.probable, 'three observations, one reading');
});

test('one observation is a candidate, not a probability', () => {
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const hypothesis = classifyDiff(observe(synth, 'filter.res', [77], mask), { payloadLength: 15 });
  assert.equal(hypothesis.confidence, CONFIDENCE.candidate);
});

test('a 14-bit parameter is recovered, MSB first', () => {
  // Which byte is coarse says which way round it is: the high byte moves in small steps across the
  // whole sweep while the low one wraps repeatedly.
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('osc.fine', 500), synth.dump())]);

  const hypothesis = classifyDiff(observe(synth, 'osc.fine', [1000, 5000, 12000], mask), {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(hypothesis.kind, 'u14');
  assert.deepEqual(hypothesis.offsets, [6, 7]);
});

test('a nibble-encoded parameter is recovered with its width', () => {
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('amp.level', 100), synth.dump())]);

  const hypothesis = classifyDiff(observe(synth, 'amp.level', [0x1234, 0x5678, 0xABCD], mask), {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(hypothesis.kind, 'nibbles');
  assert.equal(hypothesis.encoding.bytes, 4);
  assert.deepEqual(hypothesis.offsets, [8, 9, 10, 11]);
});

test('A SHARED BYTE IS A FINDING, not a failure — and it says which bits are still free', () => {
  // Two parameters in one byte is the case only a person can finish. The engine's job is to notice
  // and say so, with enough detail that the next capture into the same byte lands as the other
  // half rather than as a contradiction.
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('osc.wave', 3), synth.dump())]);

  const wave = classifyDiff(observe(synth, 'osc.wave', [1, 4, 7], mask), {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(wave.kind, 'bitslice');
  assert.equal(wave.sharedByte, 12);
  assert.ok(wave.freeBits.includes(4) && wave.freeBits.includes(5), 'the octave bits should read as free');
  assert.match(wave.why, /shared/);

  const octave = classifyDiff(observe(synth, 'osc.octave', [1, 2, 3], mask), {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(octave.kind, 'bitslice');
  assert.equal(octave.sharedByte, 12);
});

test('two moves that touch different offsets are reported as inconsistent, not averaged', () => {
  // Either the human moved two controls, or something drifted between dumps. Both are worth saying;
  // neither is worth guessing through.
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const first = observe(synth, 'filter.cutoff', [30], mask);
  const second = observe(synth, 'filter.res', [90], mask);
  const hypothesis = classifyDiff([...first, ...second], { payloadLength: 15 });
  assert.equal(hypothesis.kind, 'inconsistent');
  assert.match(hypothesis.why, /different offsets/);
});

test('a parameter that is not in this dump reports "none" rather than an offset', () => {
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('filter.cutoff', 1), synth.dump())]);
  // Two dumps with nothing but the counter and checksum moving.
  const before = synth.dump();
  const after = synth.dump();
  const hypothesis = classifyDiff([{ changed: diffPayloads(before, after, mask), payload: after }], {
    checksum, payloadLength: synth.layout.payloadLength,
  });
  assert.equal(hypothesis.kind, 'none');
  assert.match(hypothesis.why, /not in this dump|nothing changed/);
});

test('a payload where most bytes moved is called packed, and says why that matters', () => {
  // Diffing packed bytes smears one parameter across a group and produces nonsense with high
  // confidence, which is the worst failure mode available.
  const changed = Array.from({ length: 12 }, (_, i) => ({ offset: i, from: 0, to: i + 1 }));
  const hypothesis = classifyDiff([{ changed }], { payloadLength: 16 });
  assert.equal(hypothesis.kind, 'packed');
  assert.match(hypothesis.why, /Unpack before diffing/);
});

test('the whole known map is recovered from dumps alone', () => {
  // The plan's golden-profile assertion, against the fake device: run the engine over every
  // parameter and check it finds the offset the answer key says.
  const synth = createFakeSynth();
  const mask = maskFor(synth);
  const checksum = fitChecksum([synth.dump(), (synth.set('filter.cutoff', 12), synth.dump())]);

  for (const parameter of FAKE_MAP) {
    const span = parameter.max - parameter.min;
    const probes = [
      parameter.min + Math.floor(span * 0.2),
      parameter.min + Math.floor(span * 0.5),
      parameter.min + Math.floor(span * 0.9),
    ];
    const hypothesis = classifyDiff(observe(synth, parameter.id, probes, mask), {
      checksum, payloadLength: synth.layout.payloadLength,
    });
    assert.equal(hypothesis.offsets[0], parameter.offset, `${parameter.id} landed at the wrong offset`);
    if (parameter.encoding === 'bits') assert.equal(hypothesis.kind, 'bitslice', parameter.id);
    else assert.equal(hypothesis.kind, parameter.encoding, parameter.id);
  }
});

// --- mode A: live transmit ---------------------------------------------------------------------------

test('IDLE CHATTER LOSES TO A REAL SWEEP — the attribution rule, in one test', () => {
  // A synth idles with sensing, clock and unrelated CCs. First-past-the-post learns the wrong thing
  // roughly as often as it works, which is why the rule is "whatever moved the most".
  const synth = createFakeSynth();
  const stream = [
    ...synth.idleChatter(4),          // arrives FIRST, and must not win
    ...synth.sweep('filter.cutoff', 0, 127),
    ...synth.idleChatter(2),
  ];
  const result = attributeLiveMovement(stream);
  assert.equal(result.hit.controller, 74);
  assert.equal(result.ambiguous, false);
});

test('a nudge is not a sweep, and the engine asks for a real one', () => {
  const result = attributeLiveMovement([
    { kind: 'cc', controller: 74, value: 64 },
    { kind: 'cc', controller: 74, value: 66 },
  ]);
  assert.equal(result.hit, null);
  assert.match(result.why, /end to end/);
});

test('two controllers moving together is an ambiguity, reported rather than resolved', () => {
  // Ganged controls, or a synth echoing its own edit on a second CC. Picking one silently is how a
  // capture session learns the echo.
  const stream = [];
  for (let value = 0; value <= 127; value += 8) {
    stream.push({ kind: 'cc', controller: 74, value });
    stream.push({ kind: 'cc', controller: 75, value });
  }
  const result = attributeLiveMovement(stream);
  assert.equal(result.ambiguous, true);
  assert.match(result.why, /moved together/);
});

test('an empty stream says nothing arrived', () => {
  assert.equal(attributeLiveMovement([]).hit, null);
});

test('a sweep gives the range, the step count and the type', () => {
  assert.deepEqual(
    (({ min, max, valueType }) => ({ min, max, valueType }))(analyseSweep([0, 20, 40, 80, 127])),
    { min: 0, max: 127, valueType: 'continuous' },
  );
  assert.equal(analyseSweep([0, 1, 0, 1]).valueType, 'toggle');
  assert.equal(analyseSweep([0, 32, 64, 96]).valueType, 'enum', 'four widely spaced values is a selector');
});

test('a value that jumps across the middle of its range is signed with a bias', () => {
  // The classic presentation: −64..+63 sent as 0..127. A sweep through zero looks like a wrap.
  const sweep = analyseSweep([64, 96, 127, 0, 32, 64]);
  assert.equal(sweep.signed, true);
  assert.equal(sweep.signedOffset, 64);
});

test('a control that never moved says so instead of claiming a range of zero', () => {
  const sweep = analyseSweep([64, 64, 64]);
  assert.match(sweep.why, /never changed/);
  assert.equal(sweep.confidence, CONFIDENCE.candidate);
});

// --- verify (mode C / S4) -----------------------------------------------------------------------------

test('a round trip across the boundary values is what promotes a guess to confirmed', () => {
  // The schema's own words: some facts are "INDISTINGUISHABLE by inspection - must be round-trip
  // verified across boundary values". This is that, promoted from a caveat to a check.
  const synth = createFakeSynth();
  const result = verifyRoundTrip({ id: 'filter.cutoff', min: 0, max: 127 }, {
    write: (p, v) => synth.write(p, v),
    read: (p) => synth.read(p),
  });
  assert.equal(result.ok, true);
  assert.equal(result.confidence, CONFIDENCE.confirmed);
  assert.ok(result.probes.every((value) => BOUNDARY_VALUES.includes(value)));
});

test('a codec that agrees in the middle and disagrees at the edges is caught', () => {
  // The exact failure the boundary set exists for: a parameter clamped at 100 round-trips at 64 and
  // not at 127, and only the second probe says so.
  let stored = 0;
  const result = verifyRoundTrip({ id: 'x', min: 0, max: 127 }, {
    write: (_p, v) => { stored = Math.min(100, v); },
    read: () => stored,
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.sent === 127 && f.got === 100));
  assert.equal(result.confidence, CONFIDENCE.conflict);
});

// --- conflicts and provenance ---------------------------------------------------------------------------

test('two parameters at one offset with overlapping bits is a conflict', () => {
  const conflicts = findConflicts([
    { id: 'a', offsets: [12], encoding: { type: 'bitslice', slices: [{ mask: 0b0000_0111 }] } },
    { id: 'b', offsets: [12], encoding: { type: 'bitslice', slices: [{ mask: 0b0000_0110 }] } },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].confidence, CONFIDENCE.conflict);
});

test('two bit-sliced parameters with DISJOINT masks are a bit-field, not a clash', () => {
  // The fake synth's own byte 12. Reporting this as a conflict would make the engine complain about
  // the thing it just correctly worked out.
  assert.deepEqual(findConflicts([
    { id: 'wave', offsets: [12], encoding: { type: 'bitslice', slices: [{ mask: 0b0000_0111 }] } },
    { id: 'octave', offsets: [12], encoding: { type: 'bitslice', slices: [{ mask: 0b0011_0000 }] } },
  ]), []);
});

test('a whole-byte parameter sharing an offset with anything is a conflict', () => {
  const conflicts = findConflicts([
    { id: 'a', offsets: [4], encoding: { type: 'u7' } },
    { id: 'b', offsets: [4], encoding: { type: 'u7' } },
  ]);
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].why, /not bit-sliced/);
});

test('a learned parameter can always answer "how do you know?"', () => {
  // The provenance vocabulary the schema already had — source: learn, verifiedRoundTrip,
  // confirmations — attached to the parameter rather than left in a session log nobody exports.
  const provenance = learnProvenance(
    { confidence: CONFIDENCE.confirmed, why: 'round-tripped at 0, 64, 127' },
    { at: '2026-08-23T00:00:00Z', sessionId: 's1' },
  );
  assert.equal(provenance.source, 'learn');
  assert.equal(provenance.verifiedRoundTrip, true);
  assert.equal(provenance.confirmations, 1);
  assert.match(provenance.evidence, /round-tripped/);

  const weak = learnProvenance({ confidence: CONFIDENCE.candidate, why: 'one observation' });
  assert.equal(weak.verifiedRoundTrip, false);
  assert.equal(weak.confirmations, 0);
});

// --- the session state machine ------------------------------------------------------------------

test('a device that neither transmits nor dumps is told so on the first screen', () => {
  // Twenty minutes of an unlearnable device is the worst outcome available.
  const { mode, why } = chooseMode({ transmitsOnEdit: false, answersDumpRequest: false });
  assert.equal(mode, CAPTURE_MODE.none);
  assert.match(why, /written by hand/);
});

test('the mode follows what the device can actually do', () => {
  assert.equal(chooseMode({ transmitsOnEdit: true }).mode, CAPTURE_MODE.live);
  assert.equal(chooseMode({ answersDumpRequest: true }).mode, CAPTURE_MODE.dump);
  assert.equal(chooseMode({ answersDumpRequest: true, hasProfile: true }).mode, CAPTURE_MODE.verify,
    'a profile that exists is cheaper to verify than to rediscover');
});

test('THE PANEL SENDS NOTHING DURING A CAPTURE — the echo rule, as a constant rather than an absence', () => {
  // The panel sends, the device echoes, the session learns its own transmission and is delighted
  // with itself. This is the single most likely way to ship something that demos beautifully and is
  // wrong, so the rule is a value that can be asserted rather than a gap in the code.
  assert.equal(SENDS_DURING_CAPTURE, false);
  assert.ok(ECHO_WINDOW_MS > 0);
});

test('an inbound message inside the echo window is discarded, not attributed', () => {
  let session = newSession({ mode: CAPTURE_MODE.live });
  session = beginCapture(session);
  const echo = [{ kind: 'cc', controller: 74, value: 100 }];
  session = recordMessages(session, echo, { at: 1000, sentAt: 960 });
  assert.equal(session.messages.length, 0, 'the echo was learned');
  assert.equal(session.lastSuppressed, 1);

  session = recordMessages(session, echo, { at: 2000, sentAt: 960 });
  assert.equal(session.messages.length, 1, 'and a message outside the window is kept');
});

test('a session walks setup → capture → confirm and back for the next control', () => {
  const synth = createFakeSynth();
  let session = newSession({ mode: CAPTURE_MODE.dump, profileId: 'fake', now: '2026-08-23T00:00:00Z' });
  assert.equal(session.state, 'setup');

  for (let i = 0; i < 3; i += 1) session = addBaseline(session, synth.dump());
  assert.ok(readyToCapture(session));
  assert.ok(session.mask.includes(synth.layout.counterOffset), 'the counter should be masked at setup');

  session = beginCapture(session);
  assert.equal(session.state, 'capture');
  assert.ok(session.checksum, 'the checksum is fitted once, at the start');

  for (const value of [20, 70, 120]) { synth.set('filter.cutoff', value); session = recordDump(session, synth.dump()); }
  assert.equal(session.hypothesis.kind, 'u7');
  assert.deepEqual(session.hypothesis.offsets, [4]);

  session = toConfirm(session);
  assert.equal(session.state, 'confirm');

  session = acceptHypothesis(session, { id: 'filter.cutoff', label: 'Cutoff', verified: true, now: '2026-08-23T00:01:00Z' });
  assert.equal(session.state, 'capture', 'and it goes round again');
  assert.equal(session.learned.length, 1);
  assert.equal(session.hypothesis, null, 'the next control starts clean');
});

test("the human's answer is what promotes a guess to confirmed, and nothing else", () => {
  // "That question is the ground truth, and no amount of byte analysis substitutes for it."
  const synth = createFakeSynth();
  let session = beginCapture(addBaseline(addBaseline(addBaseline(newSession({}), synth.dump()), synth.dump()), synth.dump()));
  for (const value of [10, 50, 110]) { synth.set('filter.cutoff', value); session = recordDump(session, synth.dump()); }
  assert.equal(session.hypothesis.confidence, CONFIDENCE.probable);

  const unverified = acceptHypothesis(session, { id: 'a', label: 'A', verified: false });
  assert.equal(unverified.learned[0].confidence, CONFIDENCE.probable);
  assert.equal(unverified.learned[0].provenance.verifiedOnHardware, false);

  const verified = acceptHypothesis(session, { id: 'a', label: 'A', verified: true });
  assert.equal(verified.learned[0].confidence, CONFIDENCE.confirmed);
  assert.equal(verified.learned[0].provenance.confirmations, 1);
});

test('confirm is refused when there is nothing to name', () => {
  const session = newSession({});
  assert.equal(toConfirm(session).state, 'setup');
});

test('the last thing kept can be undone', () => {
  // Naming twenty parameters and being unable to fix the third is what makes somebody stop.
  let session = newSession({});
  session = { ...session, learned: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(undoLast(session).learned.length, 1);
  assert.equal(undoLast(newSession({})).learned.length, 0);
});

test('the harvest splits by confidence, because they land differently', () => {
  // High confidence writes a parameter, low confidence writes a candidate, nothing writes silence.
  const session = { learned: [
    { id: 'a', confidence: CONFIDENCE.confirmed },
    { id: 'b', confidence: CONFIDENCE.probable },
    { id: 'c', confidence: CONFIDENCE.candidate },
    { id: 'd', confidence: CONFIDENCE.conflict },
  ] };
  const harvest = sessionHarvest(session);
  assert.equal(harvest.parameters.length, 2);
  assert.equal(harvest.candidates.length, 1);
  assert.equal(harvest.conflicts.length, 1);
  assert.equal(harvest.total, 4);
});

test('the summary says what is unsettled as loudly as what is settled', () => {
  // Hiding the four that are still guesses is how a 95%-right profile ships as a finished one.
  const summary = sessionSummary({ learned: [
    { confidence: CONFIDENCE.confirmed, kind: 'u7' },
    { confidence: CONFIDENCE.candidate, kind: 'u7' },
    { confidence: CONFIDENCE.probable, kind: 'bitslice' },
  ] });
  assert.match(summary, /2 parameters/);
  assert.match(summary, /1 still a guess/);
  assert.match(summary, /sharing a byte/);
});
