// valueEditSession.js — one edit opened from a row of the Values sidebar, and the rules it keeps.
// docs/design/script-editor-value-editors.md, "Rules every edit session follows":
//
//   2. Write when the gesture settles, not on every tick. The display panel hands a colour (or a
//      gradient) over on every movement of a drag; with Live on, every change to the source
//      replaces the script set and resets its state, so writing each one would run the script
//      sixty times a second. A value is held, and written once nothing new has arrived for
//      `settleMs` and no pointer is held down (or at once, by flush: Done, a dropdown, Enter).
//   3. One undo step per settled edit: each write is one replacement through `write`, which the
//      sidebar sends through the code editor's own edit path.
//   4. Cancel restores the original characters exactly, in one edit: the text the range held when
//      the session opened is kept and put back, not re-formed from the colour it meant.
//   5. A session ends when the text moves under it. It holds a character range and the text it
//      expects the editor to hold; any other text (an edit outside the range or inside it, an
//      undo, another script) ends it, and nothing is written after that.
//   7. The range follows the text: after a write the value is read again where it now starts, so
//      its range, and the box the editor draws around it, are the new value's.
//
// Pure: no store and no DOM. The timers are passed in, so the tests can drive the clock.

/** How long a value must stand before it is written, in milliseconds. */
export const SETTLE_MS = 350;

/** The characters an edit of `arg` covers: a gradient's stops and, when written, its angle. */
export function extentOf(arg) {
  if (!arg?.range) return null;
  const angle = arg.kind === 'gradient' ? arg.meaning?.angleRange : null;
  return angle && angle.end > arg.range.end ? { start: arg.range.start, end: angle.end } : { ...arg.range };
}

const defaultTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  now: () => Date.now(),
};

/**
 * Open a session on `arg` in `source`.
 *
 * @param {object} options
 * @param {string} options.source  The text as the editor holds it now.
 * @param {string} options.language  As writeValue takes it ('lua', 'javascript', … or 'json').
 * @param {object} options.arg  An Arg from readStatement or readJsonValues on `source`.
 * @param {(source: string, language: string, arg: object, value: *) => ({ start, end, text }|null)} options.writeValue
 *   The core's writeValue.
 * @param {(start: number, end: number, text: string) => (string|null)} options.write  Replace the
 *   characters through the editor, as one undo step; the editor's whole text after it, or null
 *   when it could not (a folded or read-only view).
 * @param {(source: string, start: number) => (object|null)} options.reread  The Arg that now starts
 *   at `start` in `source`.
 * @param {{ setTimeout, clearTimeout, now }} [options.timers]
 * @param {number} [options.settleMs]
 * @param {(session) => void} [options.onupdate]  Called after anything about the session changes.
 */
export function createEditSession({
  source, language, arg, writeValue, write, reread,
  timers = defaultTimers, settleMs = SETTLE_MS, onupdate = () => {},
}) {
  const start = extentOf(arg);
  const state = {
    arg,
    range: start,
    // What the range held when the session opened: what Cancel puts back.
    original: String(source ?? '').slice(start?.start ?? 0, start?.end ?? 0),
    // The text the session expects the editor to hold. Anything else is the text moving under it.
    expected: String(source ?? ''),
    pending: undefined,
    hasPending: false,
    writes: 0,
    refused: null,
    ended: null,
  };
  let timer = null;
  let held = false;
  let lastAt = 0;
  // True while a write of the session's own is in the editor: the text it reports then is its own.
  let writing = false;
  const send = (s, e, text) => {
    writing = true;
    try { return write(s, e, text); } finally { writing = false; }
  };

  const changed = () => { try { onupdate(session); } catch { /* the caller's problem, not the session's */ } };
  const stopTimer = () => { if (timer !== null) { timers.clearTimeout(timer); timer = null; } };
  const schedule = (ms) => { stopTimer(); timer = timers.setTimeout(check, Math.max(0, ms)); };

  function check() {
    timer = null;
    if (state.ended || !state.hasPending) return;
    if (held) return; // pointerUp checks again
    const waited = timers.now() - lastAt;
    if (waited < settleMs) { schedule(settleMs - waited); return; }
    writePending();
  }

  /** Write `value` now. True when the text holds it afterwards (or already did). */
  function writeNow(value) {
    const edit = writeValue(state.expected, language, state.arg, value);
    if (!edit) {
      state.refused = value;
      return false;
    }
    state.refused = null;
    if (edit.text === state.expected.slice(edit.start, edit.end)) return true;
    const next = send(edit.start, edit.end, edit.text);
    const wanted = state.expected.slice(0, edit.start) + edit.text + state.expected.slice(edit.end);
    if (typeof next !== 'string') { end('failed'); return false; }
    if (next !== wanted) { end('moved'); return false; }
    state.expected = next;
    state.writes += 1;
    const again = reread(next, edit.start);
    if (again) {
      state.arg = again;
      state.range = extentOf(again);
    } else {
      state.range = { start: edit.start, end: edit.start + edit.text.length };
      state.arg = { ...state.arg, range: { ...state.range }, text: edit.text };
    }
    return true;
  }

  function writePending() {
    if (!state.hasPending) return true;
    const value = state.pending;
    state.pending = undefined;
    state.hasPending = false;
    const ok = writeNow(value);
    changed();
    return ok;
  }

  function end(reason) {
    if (state.ended) return;
    stopTimer();
    state.pending = undefined;
    state.hasPending = false;
    state.ended = reason;
    changed();
  }

  const session = {
    get arg() { return state.arg; },
    get range() { return state.range; },
    get original() { return state.original; },
    get expected() { return state.expected; },
    get pending() { return state.pending; },
    get hasPending() { return state.hasPending; },
    get writes() { return state.writes; },
    get refused() { return state.refused; },
    get ended() { return state.ended; },
    get held() { return held; },

    /** A value from the editor that is open (a drag's latest colour): held until it settles. */
    preview(value) {
      if (state.ended) return;
      state.pending = value;
      state.hasPending = true;
      lastAt = timers.now();
      schedule(settleMs);
      changed();
    },
    /** A pointer went down somewhere: a drag may be under way, so nothing is written yet. */
    pointerDown() { held = true; },
    /** …and came up: a value that has already stood long enough is written now. */
    pointerUp() {
      held = false;
      if (state.hasPending && timer === null) check();
    },
    /** Write what is held, now (Done, the end of a field's edit). */
    flush() {
      if (state.ended) return false;
      stopTimer();
      return writePending();
    },
    /** Write `value` at once: a dropdown's pick, a field's Enter. One edit. */
    commit(value) {
      if (state.ended) return false;
      stopTimer();
      state.pending = undefined;
      state.hasPending = false;
      const ok = writeNow(value);
      changed();
      return ok;
    },
    /** Done: write what is held, and close. */
    done() {
      if (state.ended) return;
      session.flush();
      end('done');
    },
    /** Cancel: drop what is held, put the original characters back in one edit if anything was
     *  written, and close. */
    cancel() {
      if (state.ended) return;
      stopTimer();
      state.pending = undefined;
      state.hasPending = false;
      if (state.writes > 0 && state.range && state.expected.slice(state.range.start, state.range.end) !== state.original) {
        const { start: s, end: e } = state.range;
        const next = send(s, e, state.original);
        const wanted = state.expected.slice(0, s) + state.original + state.expected.slice(e);
        if (next === wanted) {
          state.expected = next;
          state.range = { start: s, end: s + state.original.length };
        }
      }
      end('cancel');
    },
    /** The editor's text, as it is now. Text the session did not write ends it (rule 5). */
    sourceChanged(next) {
      if (state.ended || writing) return;
      if (String(next ?? '') !== state.expected) end('moved');
    },
    /** End it for another reason: 'left' (another script, the editor gone), 'folded', … */
    end,
  };
  return session;
}
