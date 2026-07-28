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

/** The script-set status line, or '' when nothing has set one. */
export const scriptStatus = writable('');

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
  };
  scriptNotifications.update((list) => [...list, entry]);
  return id;
}

export function dismissNotification(id) {
  scriptNotifications.update((list) => list.filter((n) => n.id !== id));
}

/** Drop everything that has outlived its duration. Driven by whoever renders the toasts. */
export function expireNotifications(now = Date.now()) {
  scriptNotifications.update((list) => list.filter((n) => n.expiresAt == null || n.expiresAt > now));
}

export function setStatus(message) {
  scriptStatus.set(String(message ?? '').trim());
}

/* ------------------------------------------------------------------------------ dialogs */
// One at a time, and never queued. A queue would let a script in a loop stack a hundred modals in
// front of somebody with no way out; refusing the second call leaves the script to decide what to
// do about it, which is the only party that knows.
//
// The callback is the answer, and it runs EXACTLY ONCE — on a choice, on a dismissal, or on panel
// teardown. "Exactly once" is the whole contract: a script that opens a dialog and cleans up in the
// callback must never be left holding cleanup that will not happen.

/** The open dialog, or null: { id, title, message, buttons, kind, default }. */
export const scriptDialog = writable(null);

// Held outside the store on purpose — a function is not view state, and putting it in a store that
// a component reads makes it far too easy to serialise or clone it by accident.
let pending = null;   // { id, onChoice, answered }

/**
 * Open a dialog. Returns its id, or null when there is already one open.
 * `onChoice` is called with the chosen label, or undefined for a dismissal.
 */
export function openDialog(opts, onChoice) {
  if (pending) return null;
  const o = opts && typeof opts === 'object' ? opts : {};
  const buttons = (Array.isArray(o.buttons) ? o.buttons : [])
    .map((b) => String(b ?? '').trim()).filter(Boolean);
  const title = String(o.title ?? '').trim();
  const message = String(o.message ?? '').trim();
  if (!title && !message) return null;   // a dialog asking nothing is a modal with no question

  const id = nextId++;
  pending = { id, onChoice: typeof onChoice === 'function' ? onChoice : null, answered: false };
  scriptDialog.set({
    id,
    title: title || message,
    message: title ? message : '',
    buttons: buttons.length ? buttons : ['OK'],
    kind: KINDS.has(o.kind) ? o.kind : 'info',
    default: buttons.includes(o.default) ? o.default : (buttons[0] ?? 'OK'),
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
  if (p.onChoice) p.onChoice(label == null ? undefined : String(label));
  return true;
}

/** Is a dialog on screen right now? */
export function dialogOpen() { return pending != null; }

/** Panel teardown: a message about a panel that is gone is worse than no message. */
export function clearScriptUi() {
  scriptNotifications.set([]);
  scriptStatus.set('');
  // The open question is dismissed rather than dropped. A callback that never runs is the one
  // failure mode this API cannot afford — a script waiting on an answer would wait forever.
  answerDialog(undefined);
}

export function currentNotifications() { return get(scriptNotifications); }
