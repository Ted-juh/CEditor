// Live state from the hardware MIDI input: held notes, and expression levels.
//
// The bridge has always emitted `midiInputMessage` and deviceProfiles has always
// parked the last one in `latestMidiInputMessage` — but nothing read it. This is
// the consumer: it folds every incoming message through the pure reducer in
// utils/midiNoteInput.js and publishes "what is currently held", which the
// note-playing controls (Chord Pad, Arp, Ribbon Keyboard, Drum Pads) echo.
//
// One listener for the whole app: notes are global, and four controls watching
// the same stream should agree about it.
import { writable, get } from 'svelte/store';
import { latestMidiInputMessage } from './deviceProfiles.js';
import {
  EMPTY_NOTE_STATE, applyMidiHex, heldNotes, heldNoteEntries,
  EMPTY_EXPRESSION_STATE, applyExpressionHex, expressionEventsFromHex,
  EMPTY_LEARN_STATE, applyLearnHex, learnBest,
} from '../utils/midiNoteInput.js';

// `seq` increments on every change so consumers can depend on it directly; the
// state object itself is swapped (never mutated) by the pure reducer.
export const midiNoteState = writable({ notes: EMPTY_NOTE_STATE, seq: 0 });

// The continuous half of the same stream: mod wheel, breath, expression, foot,
// aftertouch, note velocity. Separate store so a control that only cares about
// notes doesn't re-render on every CC of a mod-wheel sweep (and vice versa).
export const midiExpressionState = writable({ expression: EMPTY_EXPRESSION_STATE, seq: 0 });

// Routable EVENTS, not state. The expression store above answers "where is the
// mod wheel now", which is right for a display and wrong for a router: a splitter
// forwarding messages has to forward each one once, when it arrives. Re-sending
// a snapshot would either spam or miss. `seq` lets a consumer take each batch
// exactly once.
//
// Carries controllers, pitch bend, channel pressure and poly key pressure —
// everything a router has to pass on that isn't a note.
export const midiRouteEvents = writable({ events: [], seq: 0 });

// --- MIDI learn session -------------------------------------------------------
// Only ever one at a time: two controls both listening for "the next thing that
// moves" would both adopt it, which is never what anyone wants. Starting a
// session cancels any other.
export const midiLearnState = writable({ ownerId: '', session: EMPTY_LEARN_STATE, best: null });
const LEARN_TIMEOUT_MS = 12000;
let learnTimer = null;

export function startMidiLearn(ownerId) {
  stopMidiLearn();
  startNoteInputListener();
  midiLearnState.set({ ownerId: String(ownerId ?? 'learn'), session: EMPTY_LEARN_STATE, best: null });
  // Give up rather than listening forever if nothing ever moves.
  learnTimer = setTimeout(() => stopMidiLearn(), LEARN_TIMEOUT_MS);
}
export function stopMidiLearn() {
  if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
  const cur = get(midiLearnState);
  if (!cur.ownerId) return;
  midiLearnState.set({ ownerId: '', session: EMPTY_LEARN_STATE, best: null });
}
export function isLearning(ownerId) {
  return get(midiLearnState).ownerId === String(ownerId ?? '');
}

let started = false;
let lastPayload = null;

// Idempotent: the preview surface calls this on mount, so a headless import of
// this module (a test, the profile editor) never attaches a listener.
export function startNoteInputListener() {
  if (started) return;
  started = true;
  latestMidiInputMessage.subscribe((payload) => {
    if (!payload || payload === lastPayload) return;
    lastPayload = payload;
    // SysEx is a dump, not performance data — the reducer skips it anyway, but
    // there's no reason to walk a multi-kilobyte blob on every arrival.
    if (String(payload.messageType ?? '') === 'sysex') return;
    const cur = get(midiNoteState);
    // Stamp the arrival. The store publishes STATE, so a consumer sampling it
    // per frame would otherwise only know a note arrived some time in the last
    // 16ms — fine for lighting a pad, audibly loose for recording a phrase.
    const nextNotes = applyMidiHex(cur.notes, payload.hex, Date.now());
    // Both reducers return the SAME object when nothing they track changed, so
    // a CC sweep never touches the note store and a note never touches the
    // expression store.
    if (nextNotes !== cur.notes) midiNoteState.set({ notes: nextNotes, seq: cur.seq + 1 });
    const curX = get(midiExpressionState);
    const nextX = applyExpressionHex(curX.expression, payload.hex);
    if (nextX !== curX.expression) midiExpressionState.set({ expression: nextX, seq: curX.seq + 1 });
    // The same bytes as an event batch, for routers rather than displays. Only
    // published when there is something in it, so a run of notes never wakes a
    // controller consumer.
    const routable = expressionEventsFromHex(payload.hex)
      .filter((e) => e.kind === 'cc' || e.kind === 'bend'
        || e.kind === 'aftertouch' || e.kind === 'polyAftertouch');
    if (routable.length) {
      const curR = get(midiRouteEvents);
      midiRouteEvents.set({ events: routable, seq: curR.seq + 1 });
    }
    // Feed an active learn session from the same bytes.
    const curL = get(midiLearnState);
    if (curL.ownerId) {
      const session = applyLearnHex(curL.session, payload.hex);
      if (session !== curL.session) {
        midiLearnState.set({ ...curL, session, best: learnBest(session) });
      }
    }
  });
}

// Drop everything — used when a panel stops previewing, so a stuck note from a
// disconnected keyboard doesn't leave pads lit forever.
export function clearNoteInput() {
  const cur = get(midiNoteState);
  if (cur.notes === EMPTY_NOTE_STATE) return;
  midiNoteState.set({ notes: EMPTY_NOTE_STATE, seq: cur.seq + 1 });
}
// Expression values are LEVELS, not gestures — a mod wheel left at 40% is still
// at 40% when you come back. They're deliberately not cleared with the notes.

// Convenience readers for non-reactive callers. `channel` 0 = omni.
export function inputNotes(channel = 0) { return heldNotes(get(midiNoteState).notes, channel); }
export function inputNoteEntries(channel = 0) { return heldNoteEntries(get(midiNoteState).notes, channel); }

// Test seam: feed hex straight in, without a bridge.
export function ingestMidiHexForTest(hex) {
  const cur = get(midiNoteState);
  midiNoteState.set({ notes: applyMidiHex(cur.notes, hex), seq: cur.seq + 1 });
  const curX = get(midiExpressionState);
  midiExpressionState.set({ expression: applyExpressionHex(curX.expression, hex), seq: curX.seq + 1 });
  const curL = get(midiLearnState);
  if (curL.ownerId) {
    const session = applyLearnHex(curL.session, hex);
    midiLearnState.set({ ...curL, session, best: learnBest(session) });
  }
}
