import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recorderConfig, recorderState, recorderChannel, recorderTranspose, recorderBars,
  recorderSynced, recorderLoopSeconds, recorderPhase, isRecordingState,
  EMPTY_TAKE, recorderTake, normalizeEvents, takeIsEmpty, takeEventCount, takePasses, lastPass,
  recordNoteOn, recordNoteOff, closeOpenNotes, undoPass, clearTake,
  quantizeTime, snapNoteToScale, quantizeTake,
  eventsInWindow, eventSeconds, playedNote, playedVelocity,
  takeNoteRange, recorderGeometry, eventRects, playheadX,
  onLoopBoundary, toggleRecordState, nextPassFor,
  RECORDER_STATES, MAX_EVENTS, recorderScriptPatch, RECORDER_SCRIPT_ACTIONS, phaseAtTime,
  countInBars, countInLaps, editNote, deleteNote, nudgeTake, transposeTake,
  recorderSlots, slotIndex, storeSlot, loadSlot, MAX_SLOTS,
} from '../src/CE_Application/utils/noteRecorderLayout.js';
import { noteOutputFromBytes } from '../src/CE_Application/stores/noteOutput.js';
import { applyNoteEvent, EMPTY_NOTE_STATE } from '../src/CE_Application/utils/midiNoteInput.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function rc(c) { return { _children: { Core: { controlType: 'Recorder' }, Recorder: c } }; }

test('config clamps and falls back', () => {
  assert.equal(recorderState(rc({})), 'idle');
  assert.equal(recorderState(rc({ state: 'nope' })), 'idle');
  assert.equal(recorderState(rc({ state: 'overdub' })), 'overdub');
  assert.equal(recorderChannel(rc({ channel: 99 })), 16);
  assert.equal(recorderTranspose(rc({ transpose: 999 })), 48);
  assert.equal(recorderBars(rc({ bars: 99 })), 16);
  assert.equal(recorderSynced(rc({})), false);
  assert.equal(recorderPhase(rc({ __phase: 1.25 })), 0.25, 'phase wraps');
  assert.equal(RECORDER_STATES.length, 4);
  assert.equal(isRecordingState('overdub'), true);
  assert.equal(isRecordingState('armed'), false);
});

test('a synced loop is bars, so tempo changes keep the take the same length', () => {
  const c = rc({ syncToTransport: true, bars: 2 });
  // 2 bars of 4 beats at 120bpm = 4 seconds.
  assert.ok(near(recorderLoopSeconds(c, 120, 4), 4));
  // Twice the tempo, half the wall-clock — but still two bars, which is the
  // whole reason to sync a recorded phrase.
  assert.ok(near(recorderLoopSeconds(c, 240, 4), 2));
  assert.equal(recorderLoopSeconds(rc({ seconds: 3 }), 120), 3, 'free-running ignores bpm');
});

// --- Recording ----------------------------------------------------------------
test('a note-on parks and the note-off completes it', () => {
  let take = recordNoteOn(EMPTY_TAKE, 0.1, 1, 60, 100);
  assert.equal(takeEventCount(take), 0, 'not an event until it ends');
  assert.equal(Object.keys(take.pending).length, 1);
  take = recordNoteOff(take, 0.35, 1, 60);
  assert.equal(takeEventCount(take), 1);
  assert.ok(near(take.events[0].t, 0.1));
  assert.ok(near(take.events[0].dur, 0.25));
  assert.equal(Object.keys(take.pending).length, 0);
});

test('a note held across the loop seam keeps its real length', () => {
  // Down at 0.9, up at 0.1 next lap: that is a fifth of a loop, not minus
  // four-fifths of one.
  let take = recordNoteOn(EMPTY_TAKE, 0.9, 1, 60, 100);
  take = recordNoteOff(take, 0.1, 1, 60);
  assert.ok(near(take.events[0].dur, 0.2), `got ${take.events[0].dur}`);
});

test('the same pitch on two channels is two notes', () => {
  let take = recordNoteOn(EMPTY_TAKE, 0.1, 1, 60, 100);
  take = recordNoteOn(take, 0.2, 2, 60, 100);
  assert.equal(Object.keys(take.pending).length, 2, 'collapsing them would lose one');
  take = recordNoteOff(take, 0.3, 1, 60);
  take = recordNoteOff(take, 0.4, 2, 60);
  assert.equal(takeEventCount(take), 2);
});

test('a retrigger with no note-off closes the first rather than dropping it', () => {
  // A lost note-off is a real thing on a real cable. The alternative is an
  // event that never ends.
  let take = recordNoteOn(EMPTY_TAKE, 0.1, 1, 60, 100);
  take = recordNoteOn(take, 0.3, 1, 60, 110);
  assert.equal(takeEventCount(take), 1, 'the first one was closed');
  assert.ok(near(take.events[0].dur, 0.2));
  take = recordNoteOff(take, 0.5, 1, 60);
  assert.equal(takeEventCount(take), 2);
});

test('an off with no on is ignored, not invented', () => {
  const take = recordNoteOff(EMPTY_TAKE, 0.5, 1, 60);
  assert.equal(take, EMPTY_TAKE, 'same object out — nothing changed');
});

test('stopping with keys down closes them', () => {
  // An event with no end plays as a stuck note forever.
  let take = recordNoteOn(EMPTY_TAKE, 0.2, 1, 60, 100);
  take = recordNoteOn(take, 0.25, 1, 64, 100);
  take = closeOpenNotes(take, 0.8);
  assert.equal(takeEventCount(take), 2);
  assert.equal(Object.keys(take.pending).length, 0);
  assert.equal(closeOpenNotes(take, 0.9), take, 'nothing open, same object');
});

test('the event cap stops a stuck input growing forever', () => {
  let take = EMPTY_TAKE;
  for (let i = 0; i < MAX_EVENTS + 20; i += 1) {
    take = recordNoteOn(take, i / 1000, 1, 60 + (i % 12), 100);
    take = recordNoteOff(take, (i + 0.5) / 1000, 1, 60 + (i % 12));
  }
  assert.equal(takeEventCount(take), MAX_EVENTS);
});

// --- Overdub and undo ------------------------------------------------------------
test('undo drops the last pass, not the last note', () => {
  // The thing you actually want is "that layer was wrong, take it off".
  let take = EMPTY_TAKE;
  const lay = (t, note, pass) => {
    take = recordNoteOn(take, t, 1, note, 100, pass);
    take = recordNoteOff(take, t + 0.05, 1, note);
  };
  lay(0.0, 60, 0); lay(0.5, 62, 0);
  lay(0.25, 67, 1); lay(0.75, 69, 1);
  assert.deepEqual(takePasses(take), [0, 1]);
  assert.equal(lastPass(take), 1);
  take = undoPass(take);
  assert.deepEqual(take.events.map((e) => e.note), [60, 62], 'both notes of the pass, not one');
  take = undoPass(take);
  assert.equal(takeIsEmpty(take), true);
  assert.equal(undoPass(take), take, 'nothing to undo, same object');
  assert.equal(takeIsEmpty(clearTake()), true);
});

test('the next pass number depends on the state', () => {
  const take = { events: [{ t: 0, note: 60, velocity: 100, dur: 0.1, pass: 2 }], pending: {} };
  assert.equal(nextPassFor(take, 'overdub'), 3);
  assert.equal(nextPassFor(take, 'recording'), 0, 'a fresh record is pass 0 — it replaces');
});

// --- Arming ---------------------------------------------------------------------
test('armed starts at the top of the loop, not where your hand was', () => {
  // Recording from mid-loop gives you a take whose downbeat is wherever you
  // happened to press, which is never what anyone wanted.
  assert.equal(onLoopBoundary('armed', { hadEvents: false }), 'recording');
  assert.equal(onLoopBoundary('armed', { hadEvents: true }), 'overdub', 'a take already there means layer');
  assert.equal(onLoopBoundary('recording', { once: false }), 'recording', 'keeps going');
  assert.equal(onLoopBoundary('recording', { once: true }), 'idle', 'one pass and out');
  assert.equal(onLoopBoundary('overdub', { once: true }), 'idle');
  assert.equal(onLoopBoundary('idle', {}), 'idle');
});

test('pressing record twice changes your mind', () => {
  assert.equal(toggleRecordState('idle', false), 'armed');
  assert.equal(toggleRecordState('armed', false), 'idle');
  assert.equal(toggleRecordState('recording', true), 'idle');
  assert.equal(toggleRecordState('overdub', true), 'idle');
});

// --- Quantise -------------------------------------------------------------------
test('quantise strength is partial on purpose', () => {
  // Full quantise makes a human take sound like a step sequencer — and if that
  // is what you wanted, the Phrase Sequencer is better at it.
  assert.ok(near(quantizeTime(0.26, 16, 1), 0.25), 'full snap');
  assert.ok(near(quantizeTime(0.26, 16, 0), 0.26), 'none');
  assert.ok(near(quantizeTime(0.26, 16, 0.5), 0.255), 'halfway there, feel kept');
  assert.ok(quantizeTime(0.99, 4, 1) === 0, 'snapping past the end wraps to the downbeat');
});

test('pitch snaps to the nearest scale tone, ties down', () => {
  // C minor has no E natural (64); D♯/E♭ is 63 and F is 65 — equidistant, so
  // the rule has to be stated or the same take quantises two ways.
  assert.equal(snapNoteToScale(64, 0, 'minor'), 63);
  assert.equal(snapNoteToScale(60, 0, 'minor'), 60, 'already in key');
  assert.equal(snapNoteToScale(61, 0, 'major'), 60, 'C♯ down to C');
  assert.equal(snapNoteToScale(66, 0, 'major'), 65, 'F♯ down to F');
  assert.equal(snapNoteToScale(64, 0, 'nonsense'), 64, 'unknown scale leaves it alone');
});

test('quantising leaves lengths alone unless asked', () => {
  const take = { events: [{ t: 0.26, note: 64, velocity: 100, dur: 0.13, pass: 0 }], pending: {} };
  const q = quantizeTake(take, { grid: 16, strength: 1, keyPc: 0, scaleName: 'minor' });
  assert.ok(near(q.events[0].t, 0.25));
  assert.equal(q.events[0].note, 63, 'and the pitch came into key');
  assert.ok(near(q.events[0].dur, 0.13), 'length untouched — that is a separate decision');
  const ql = quantizeTake(take, { grid: 16, strength: 1, quantizeLength: true });
  assert.ok(near(ql.events[0].dur, 0.125));
  assert.equal(quantizeTake(EMPTY_TAKE, {}), EMPTY_TAKE);
});

// --- Playback -------------------------------------------------------------------
test('the play window is half-open, so a seam event fires once a lap', () => {
  const evs = normalizeEvents([
    { t: 0, note: 60, dur: 0.1 }, { t: 0.5, note: 62, dur: 0.1 }, { t: 0.9, note: 64, dur: 0.1 },
  ]);
  assert.deepEqual(eventsInWindow(evs, 0.4, 0.6).map((e) => e.note), [62]);
  assert.deepEqual(eventsInWindow(evs, 0.5, 0.6).map((e) => e.note), [], 'exclusive at the start');
  assert.deepEqual(eventsInWindow(evs, 0.4, 0.5).map((e) => e.note), [62], 'inclusive at the end');
  // Across the seam: 0.85 → 0.05 must catch 0.9 AND 0.
  assert.deepEqual(eventsInWindow(evs, 0.85, 0.05).map((e) => e.note), [60, 64]);
  assert.deepEqual(eventsInWindow(evs, 0.3, 0.3), [], 'an empty window is empty');
});

test('a note out of range after transpose is dropped, not clamped', () => {
  // Clamping piles every stray note onto 0 or 127, which sounds like a stuck key.
  const up = rc({ transpose: 48 });
  assert.equal(playedNote(up, { note: 100 }), null);
  assert.equal(playedNote(up, { note: 60 }), 108);
  assert.equal(playedNote(rc({ transpose: -48 }), { note: 10 }), null);
  assert.equal(playedVelocity(rc({ velocityScale: 2 }), { velocity: 80 }), 127, 'clamped, not wrapped');
  assert.equal(playedVelocity(rc({}), { velocity: 80 }), 80);
  assert.ok(near(eventSeconds({ dur: 0.25 }, 4), 1));
});

test('a stored take is normalised on the way in', () => {
  const control = rc({ take: { events: [
    { t: 1.5, note: 200, velocity: 0, dur: 99 },
    { t: 0.2, note: 60 },
    { note: 'nonsense' },
  ] } });
  const take = recorderTake(control);
  assert.equal(takeEventCount(take), 2, 'the unusable one is dropped');
  assert.ok(take.events[0].t <= take.events[1].t, 'sorted by time');
  const [a] = take.events;
  assert.ok(a.t >= 0 && a.t < 1);
  assert.ok(a.dur <= 1, 'a note longer than the loop would overlap itself');
  assert.deepEqual(recorderTake(rc({})), EMPTY_TAKE);
});

// --- Geometry -------------------------------------------------------------------
test('the roll fits itself to the take', () => {
  // A fixed 128-row range draws one recorded octave as three invisible pixels.
  const r = takeNoteRange([{ note: 60 }, { note: 67 }], 12);
  assert.ok(r.lo <= 60 && r.hi >= 67);
  assert.equal(r.hi - r.lo + 1, 12, 'padded out to the minimum span');
  const empty = takeNoteRange([], 12);
  assert.equal(empty.hi - empty.lo, 12);
  const wide = takeNoteRange([{ note: 20 }, { note: 100 }], 12);
  assert.ok(wide.lo <= 20 && wide.hi >= 100, 'a wide take is not cropped');
});

test('a note wrapping the seam is drawn as two bars', () => {
  // One bar would run off the right edge and look shorter than it sounds.
  const geom = recorderGeometry(200, 100, 8, 20);
  const range = { lo: 60, hi: 71 };
  const one = eventRects(geom, { t: 0.1, note: 60, dur: 0.2 }, range);
  assert.equal(one.length, 1);
  const two = eventRects(geom, { t: 0.9, note: 60, dur: 0.2 }, range);
  assert.equal(two.length, 2);
  assert.ok(near(two[1].x, geom.x0), 'the second starts at the left edge');
  assert.ok(near(two[0].w + two[1].w, 0.2 * geom.w), 'and together they are the real length');
  // Low notes are low.
  const lowY = eventRects(geom, { t: 0, note: 60, dur: 0.1 }, range)[0].y;
  const highY = eventRects(geom, { t: 0, note: 71, dur: 0.1 }, range)[0].y;
  assert.ok(highY < lowY);
  assert.ok(near(playheadX(geom, 0.5), geom.x0 + geom.w / 2));
});

// --- the panel note tap ---------------------------------------------------------

test('the output tap reads a note-on at velocity 0 as a note-off', () => {
  // Every device does this, and a recorder that misses it records a note that
  // never ends.
  assert.deepEqual(noteOutputFromBytes([0x90, 60, 100], 'ChordPad', 'c1'),
    { kind: 'on', channel: 1, note: 60, velocity: 100, sourceType: 'ChordPad', sourceId: 'c1' });
  assert.equal(noteOutputFromBytes([0x90, 60, 0]).kind, 'off');
  assert.equal(noteOutputFromBytes([0x80, 60, 64]).kind, 'off');
  assert.equal(noteOutputFromBytes([0x93, 60, 100]).channel, 4, 'channel is 1-based');
  // Anything that isn't a note is not the recorder's business.
  assert.equal(noteOutputFromBytes([0xB0, 1, 64]), null);
  assert.equal(noteOutputFromBytes([0x90, 60]), null, 'a truncated message is not a note');
  assert.equal(noteOutputFromBytes([]), null);
});

// --- the script API ------------------------------------------------------------------

test('a recorder script patch only names what it changes', () => {
  const cfg = { state: 'idle', playing: true, bars: 2, transpose: 0, source: 'both', take: { events: [] } };
  assert.deepEqual(recorderScriptPatch(cfg, 'record', {}), { state: 'armed' });
  assert.deepEqual(recorderScriptPatch(cfg, 'transpose', { transpose: -12 }), { transpose: -12 });
  assert.deepEqual(recorderScriptPatch(cfg, 'bars', { bars: 4 }), { bars: 4 });
  assert.deepEqual(recorderScriptPatch(cfg, 'source', { source: 'panel' }), { source: 'panel' });
  assert.deepEqual(recorderScriptPatch(cfg, 'play', { playing: false }), { playing: false });
  // Already in that state: nothing to say.
  assert.deepEqual(recorderScriptPatch(cfg, 'play', { playing: true }), {});
  assert.deepEqual(recorderScriptPatch(cfg, 'stop', {}), {});
});

test('record is idempotent when told and toggles when not', () => {
  // A footswitch wants a toggle; a MIDI-mapped switch may fire twice and wants
  // an explicit value to mean the same thing both times.
  const idle = { state: 'idle', take: { events: [] } };
  assert.deepEqual(recorderScriptPatch(idle, 'record', { on: true }), { state: 'armed' });
  const armed = { state: 'armed', take: { events: [] } };
  assert.deepEqual(recorderScriptPatch(armed, 'record', { on: true }), {}, 'already arming');
  assert.deepEqual(recorderScriptPatch(armed, 'record', { on: false }), { state: 'idle' });
  assert.deepEqual(recorderScriptPatch(armed, 'record', {}), { state: 'idle' }, 'toggle = change your mind');
});

test('take edits refuse while it is capturing', () => {
  // The live take lives in the session while recording and is committed when it
  // stops. A script writing the take now would be silently overwritten.
  const busy = { state: 'recording', take: { events: [{ t: 0, note: 60, dur: 0.1, pass: 0 }] } };
  assert.deepEqual(recorderScriptPatch(busy, 'clear', {}), {});
  assert.deepEqual(recorderScriptPatch(busy, 'undo', {}), {});
  assert.deepEqual(recorderScriptPatch(busy, 'quantize', { grid: 16, strength: 1 }), {});
  // …but stopping it is always allowed.
  assert.deepEqual(recorderScriptPatch(busy, 'stop', {}), { state: 'idle' });
});

test('clear and undo do nothing to an empty take', () => {
  const empty = { state: 'idle', take: { events: [] } };
  assert.deepEqual(recorderScriptPatch(empty, 'clear', {}), {});
  assert.deepEqual(recorderScriptPatch(empty, 'undo', {}), {});
  const one = { state: 'idle', take: { events: [{ t: 0.5, note: 60, dur: 0.1, pass: 0 }] } };
  assert.ok(recorderScriptPatch(one, 'clear', {}).take);
  assert.equal(recorderScriptPatch(one, 'clear', {}).state, 'idle');
});

test('a scripted quantise only goes into key when asked', () => {
  const cfg = { state: 'idle', grid: 16, take: { events: [{ t: 0.26, note: 64, velocity: 100, dur: 0.1, pass: 0 }] } };
  const timing = recorderScriptPatch(cfg, 'quantize', { grid: 16, strength: 1 });
  assert.equal(timing.take.events[0].note, 64, 'pitch untouched without a scale');
  assert.ok(near(timing.take.events[0].t, 0.25));
  const inKey = recorderScriptPatch(cfg, 'quantize', { grid: 16, strength: 1, scale: 'minor', key: 0 });
  assert.equal(inKey.take.events[0].note, 63, 'E is not in C minor');
});

test('a bad recorder argument is a no-op, not a throw', () => {
  const cfg = { state: 'idle', take: { events: [] } };
  assert.deepEqual(recorderScriptPatch(cfg, 'source', { source: 'telepathy' }), {});
  assert.deepEqual(recorderScriptPatch(cfg, 'transpose', { transpose: 'up' }), {});
  assert.deepEqual(recorderScriptPatch(cfg, 'bars', { bars: 'lots' }), {});
  assert.deepEqual(recorderScriptPatch(cfg, 'nonsense', {}), {});
  assert.deepEqual(recorderScriptPatch(null, 'stop', {}), {});
  for (const action of RECORDER_SCRIPT_ACTIONS) {
    assert.ok(Object.keys(recorderScriptPatch(cfg, action, {})).length <= 2);
  }
});

test('a note is recorded where it arrived, not where the frame noticed it', () => {
  // The input store publishes STATE, so the recorder learns about a note up to
  // a frame late. The stamp winds the position back.
  const loop = 4;                                  // seconds
  // Playhead at 0.5; the note arrived 200ms ago = 0.05 of a 4s loop earlier.
  assert.ok(near(phaseAtTime(0.5, 1000, 800, loop), 0.45));
  // Across the seam it wraps rather than going negative.
  assert.ok(near(phaseAtTime(0.01, 1000, 900, loop), 0.985));
  // No stamp, a future stamp, or one older than a whole loop: use now. An
  // older-than-a-loop stamp would wrap round and land somewhere arbitrary.
  assert.equal(phaseAtTime(0.5, 1000, 0, loop), 0.5);
  assert.equal(phaseAtTime(0.5, 1000, 1200, loop), 0.5);
  assert.equal(phaseAtTime(0.5, 9000, 1000, loop), 0.5);
});

test('the held-note store carries an arrival stamp', () => {
  const on = applyNoteEvent(EMPTY_NOTE_STATE, { kind: 'noteOn', channel: 1, note: 60, velocity: 100 }, 1234);
  assert.equal(on['1:60'].at, 1234);
  // A re-sent identical note-on is the same note, so the stamp does not move.
  const again = applyNoteEvent(on, { kind: 'noteOn', channel: 1, note: 60, velocity: 100 }, 9999);
  assert.equal(again, on, 'same object out');
  assert.equal(applyNoteEvent(EMPTY_NOTE_STATE, { kind: 'noteOn', channel: 1, note: 60, velocity: 100 })['1:60'].at, 0);
});

// --- count-in, editing, slots ---------------------------------------------------

test('a count-in waits whole laps before it starts capturing', () => {
  // The Transport's count-in counts the whole panel in from a stop. This one
  // counts THIS recorder in from wherever the music already is — what you want
  // when the band is playing and you want the next four bars.
  const opts = { hadEvents: false, countInLaps: 2 };
  assert.equal(onLoopBoundary('armed', { ...opts, lapsWaited: 0 }), 'armed', 'still counting');
  assert.equal(onLoopBoundary('armed', { ...opts, lapsWaited: 1 }), 'armed');
  assert.equal(onLoopBoundary('armed', { ...opts, lapsWaited: 2 }), 'recording');
  // No count-in behaves exactly as before.
  assert.equal(onLoopBoundary('armed', { hadEvents: false }), 'recording');
  // A count-in shorter than the loop is still one lap — it lands on a boundary.
  assert.equal(countInLaps(rc({ countIn: 1, bars: 4 })), 1);
  assert.equal(countInLaps(rc({ countIn: 4, bars: 2 })), 2);
  assert.equal(countInLaps(rc({ countIn: 0 })), 0);
  assert.equal(countInBars(rc({ countIn: 99 })), 4, 'capped');
});

test('a recorded note can be repaired without a piano roll', () => {
  // Not an editor — the Phrase Sequencer is that. This is the small set of
  // repairs you want on a take you otherwise like.
  let take = recordNoteOn(EMPTY_TAKE, 0.1, 1, 60, 100);
  take = recordNoteOff(take, 0.3, 1, 60);
  take = recordNoteOn(take, 0.5, 1, 64, 100);
  take = recordNoteOff(take, 0.7, 1, 64);
  assert.ok(near(editNote(take, 0, { t: 0.25 }).events[0].t, 0.25));
  assert.equal(editNote(take, 0, { note: 62 }).events[0].note, 62);
  assert.equal(editNote(take, 0, { velocity: 40 }).events[0].velocity, 40);
  // Nothing actually moved: same object, so no re-render.
  assert.equal(editNote(take, 0, { t: 0.1 }), take);
  assert.equal(editNote(take, 9, { t: 0.5 }), take, 'no such note');
  assert.equal(editNote(take, 0, null), take);
  // Editing re-sorts, because everything downstream assumes time order.
  const moved = editNote(take, 0, { t: 0.9 });
  assert.ok(moved.events[0].t < moved.events[1].t);
  assert.equal(deleteNote(take, 0).events.length, 1);
  assert.equal(deleteNote(take, 9), take);
});

test('nudge moves the whole take, transpose drops what falls off the end', () => {
  // "Consistently a hair late" is the commonest thing wrong with a take.
  let take = recordNoteOn(EMPTY_TAKE, 0.10, 1, 60, 100);
  take = recordNoteOff(take, 0.20, 1, 60);
  take = recordNoteOn(take, 0.50, 1, 64, 100);
  take = recordNoteOff(take, 0.60, 1, 64);
  const early = nudgeTake(take, -0.02);
  assert.ok(near(early.events[0].t, 0.08));
  assert.ok(near(early.events[1].t, 0.48));
  assert.equal(nudgeTake(take, 0), take);
  // Across the seam it wraps and re-sorts rather than going negative.
  const wrapped = nudgeTake(take, -0.15);
  assert.ok(wrapped.events.every((e) => e.t >= 0 && e.t < 1));
  // Transpose uses playback's rule, so the two can't disagree about the take.
  assert.equal(transposeTake(take, 12).events[0].note, 72);
  assert.equal(transposeTake(take, 90).events.length, 0, 'dropped, not clamped');
  assert.equal(transposeTake(take, 0), take);
});

test('a slot is a copy in each direction', () => {
  // Otherwise editing the live take would silently rewrite the stored one.
  let take = recordNoteOn(EMPTY_TAKE, 0.1, 1, 60, 100);
  take = recordNoteOff(take, 0.3, 1, 60);
  const slots = storeSlot([], 1, take, 'Verse');
  assert.equal(slots.length, 2, 'the gap is filled with empty takes');
  assert.equal(slots[1].name, 'Verse');
  assert.equal(slots[1].events.length, 1);
  const loaded = loadSlot(slots, 1);
  assert.equal(loaded.events.length, 1);
  assert.notEqual(loaded.events[0], slots[1].events[0], 'a copy, not the same object');
  loaded.events[0].note = 99;
  assert.equal(slots[1].events[0].note, 60, 'and editing it leaves the slot alone');
  assert.equal(loadSlot(slots, 9), EMPTY_TAKE);
  assert.equal(storeSlot([], 99, take).length, 0, 'out of range stores nothing');
  assert.equal(slotIndex(rc({ slots: [{}, {}], slot: 5 })), 1);
  assert.equal(slotIndex(rc({})), -1);
});
