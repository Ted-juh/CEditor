// scriptUi.js — what a script has told the person using the panel, and what it has asked them.
//
// Three lifetimes, deliberately different. A NOTIFICATION is an event: it appears, it expires, it
// is gone. A STATUS is a state: it stays until the script changes or clears it. A DIALOG is a
// QUESTION: it stays until it is answered, and answering it runs a callback. Collapsing any two of
// them would mean either a state that vanishes, an event that never does, or a question nobody
// can answer.
//
// Panel view only, and nothing here is persisted — a message shown to somebody is not part of the
// document, the same rule drawings and generated controls follow.

import { writable, get } from 'svelte/store';

/** Live notifications, newest last: [{ id, message, kind, expiresAt }] */
export const scriptNotifications = writable([]);

/** The script-set status line: { message, kind }. `message` is '' when nothing has set one.
 *  `kind` matches a notification's, because a state can be a warning too — a status saying
 *  "Device not responding" in the same grey as "Ready" is a warning nobody sees. */
export const scriptStatus = writable({ message: '', kind: 'info' });

const KINDS = new Set(['info', 'warn', 'error']);
let nextId = 1;

/** Add a notification. `duration` is how long it lives; 0 or less means until dismissed. */
export function notify(message, { kind = 'info', duration = 3000 } = {}) {
  const text = String(message ?? '').trim();
  if (!text) return null;
  const id = nextId++;
  const ms = Number(duration);
  const entry = {
    id,
    message: text,
    kind: KINDS.has(kind) ? kind : 'info',
    expiresAt: Number.isFinite(ms) && ms > 0 ? Date.now() + ms : null,
    // When it was last (re)set, so update() can give a timed message the rest of its life back
    // rather than guessing how long it originally had.
    setAt: Date.now(),
  };
  scriptNotifications.update((list) => [...list, entry]);
  return id;
}

/** Take a message back. No id at all clears every one — "stop saying things" is a real request,
 *  and making a script remember six ids to make it would be busywork. Returns how many went. */
export function dismissNotification(id) {
  let removed = 0;
  scriptNotifications.update((list) => {
    const keep = id == null ? [] : list.filter((n) => n.id !== id);
    removed = list.length - keep.length;
    return keep;
  });
  return removed;
}

/**
 * Replace a LIVE notification's text, in place.
 *
 * This is what makes progress possible. Without it, "Sending dump… 40%" means dismissing and
 * re-notifying, which flickers and moves the toast to the bottom of the stack every time — so in
 * practice people stack ten toasts instead. Updating restarts the expiry too: a message that just
 * changed has just become relevant again.
 *
 * Returns false when that notification is already gone, which is how a script knows its progress
 * message was dismissed by hand and it should stop updating it.
 */
export function updateNotification(id, message, { kind, duration } = {}) {
  const text = String(message ?? '').trim();
  if (!text) return false;
  let found = false;
  scriptNotifications.update((list) => list.map((n) => {
    if (n.id !== id) return n;
    found = true;
    const ms = duration === undefined ? null : Number(duration);
    return {
      ...n,
      message: text,
      kind: kind !== undefined && KINDS.has(kind) ? kind : n.kind,
      expiresAt: ms === null
        // No duration given: keep a sticky message sticky, and give a timed one its full life back.
        ? (n.expiresAt == null ? null : Date.now() + Math.max(0, n.expiresAt - (n.setAt ?? Date.now())))
        : (Number.isFinite(ms) && ms > 0 ? Date.now() + ms : null),
      setAt: Date.now(),
    };
  }));
  return found;
}

/** Drop everything that has outlived its duration. Driven by whoever renders the toasts. */
export function expireNotifications(now = Date.now()) {
  scriptNotifications.update((list) => list.filter((n) => n.expiresAt == null || n.expiresAt > now));
}

export function setStatus(message, { kind = 'info' } = {}) {
  const text = String(message ?? '').trim();
  scriptStatus.set({ message: text, kind: text && KINDS.has(kind) ? kind : 'info' });
}

/* ------------------------------------------------------------------------------ dialogs */
// One at a time, and never queued. A queue would let a script in a loop stack a hundred modals in
// front of somebody with no way out; refusing the second call leaves the script to decide what to
// do about it, which is the only party that knows.
//
// The callback is the answer, and it runs EXACTLY ONCE — on a choice, on a dismissal, or on panel
// teardown. "Exactly once" is the whole contract: a script that opens a dialog and cleans up in the
// callback must never be left holding cleanup that will not happen.

/** The open dialog, or null: { id, ask, title, message, buttons, kind, default, value, placeholder,
 *  items, multiple }. `ask` is "choice" | "text" | "list" — the SHAPE of the question, which is what
 *  decides whether the answer is a label, a string, or a selection. */
export const scriptDialog = writable(null);

// Held outside the store on purpose — a function is not view state, and putting it in a store that
// a component reads makes it far too easy to serialise or clone it by accident.
let pending = null;   // { id, onChoice, answered }

/**
 * Open a dialog. Returns its id, or null when there is already one open.
 *
 * `ask` is the SHAPE of the question, and the shape decides what the answer is:
 *   · "choice" — buttons. The answer is the chosen LABEL. (The original, and the default.)
 *   · "text"   — a field. The answer is the STRING, which is what the app itself uses the
 *                browser's prompt() for when it renames a note.
 *   · "list"   — a picker. The answer is the chosen ITEM, or a LIST of them when `multiple`.
 *
 * Three shapes rather than three verbs' worth of machinery: one dialog is open at a time whatever
 * it is asking, one callback contract, one teardown. `onChoice` is called with the answer, or
 * undefined for a dismissal — the same "exactly once" promise as before.
 */
export function openDialog(opts, onChoice) {
  if (pending) return null;
  const o = opts && typeof opts === 'object' ? opts : {};
  const ask = ['choice', 'text', 'list'].includes(o.ask) ? o.ask : 'choice';
  const buttons = (Array.isArray(o.buttons) ? o.buttons : [])
    .map((b) => String(b ?? '').trim()).filter(Boolean);
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((i) => String(i ?? '').trim()).filter(Boolean);
  const title = String(o.title ?? '').trim();
  const message = String(o.message ?? '').trim();
  if (!title && !message) return null;   // a dialog asking nothing is a modal with no question
  // …and a list with nothing in it is a picker with nothing to pick, which is the same mistake.
  if (ask === 'list' && !items.length) return null;

  // Text and list dialogs need a way to say "yes" and a way to say "no", and those are not the
  // question — so they get a fixed pair rather than the caller's buttons. One less thing to get
  // wrong, and it keeps Escape/backdrop meaning the same thing in all three shapes.
  const settle = ask === 'choice'
    ? (buttons.length ? buttons : ['OK'])
    : [String(o.accept ?? 'OK').trim() || 'OK', String(o.cancel ?? 'Cancel').trim() || 'Cancel'];

  const id = nextId++;
  pending = { id, onChoice: typeof onChoice === 'function' ? onChoice : null, answered: false };
  scriptDialog.set({
    id,
    ask,
    title: title || message,
    message: title ? message : '',
    buttons: settle,
    kind: KINDS.has(o.kind) ? o.kind : 'info',
    default: settle.includes(o.default) ? o.default : settle[0],
    value: String(o.value ?? ''),
    placeholder: String(o.placeholder ?? ''),
    items,
    multiple: ask === 'list' && o.multiple === true,
    // Which item starts selected. A name rather than an index, because the caller gave names.
    selected: ask === 'list' && items.includes(o.default) ? o.default : (items[0] ?? ''),
  });
  return id;
}

/**
 * Settle the open dialog. `label` is the chosen button, or undefined for a dismissal.
 * Safe to call twice: the second call does nothing, so a click racing a teardown cannot
 * answer the same question twice.
 */
export function answerDialog(label) {
  const p = pending;
  if (!p || p.answered) return false;
  p.answered = true;
  pending = null;
  scriptDialog.set(null);
  // Cleared BEFORE the callback runs, so a callback that opens another dialog gets to.
  //
  // An array survives as an array: a `multiple` list answers with a SELECTION, and String()-ing it
  // would hand the script "a,b" — a string that looks like an answer and cannot be indexed. Every
  // other shape answers with one string, which is the contract a button label always had.
  const answer = label == null ? undefined
    : (Array.isArray(label) ? label.map((v) => String(v)) : String(label));
  if (p.onChoice) p.onChoice(answer);
  return true;
}

/** Is a dialog on screen right now? Exposed to scripts through ce.ui.state(): dialog() returning
 *  false could mean "nobody to ask" or "one already open", and those want different handling. */
export function dialogOpen() { return pending != null; }

/** What is on screen, as a script sees it. One read rather than three, the same shape ce.time's
 *  timers() and ce.panel's entries() settled on. */
export function uiSnapshot() {
  const status = get(scriptStatus);
  return {
    status: status.message,
    statusKind: status.kind,
    notifications: get(scriptNotifications)
      .map((n) => ({ id: n.id, message: n.message, kind: n.kind, sticky: n.expiresAt == null })),
    dialog: pending != null,
  };
}

/** Panel teardown: a message about a panel that is gone is worse than no message. */
export function clearScriptUi() {
  scriptNotifications.set([]);
  scriptStatus.set({ message: '', kind: 'info' });
  // The open question is dismissed rather than dropped. A callback that never runs is the one
  // failure mode this API cannot afford — a script waiting on an answer would wait forever.
  answerDialog(undefined);
}

export function currentNotifications() { return get(scriptNotifications); }
