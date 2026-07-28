// scriptUi.js — what a script has told the person using the panel.
//
// Two lifetimes, deliberately different. A NOTIFICATION is an event: it appears, it expires, it is
// gone. A STATUS is a state: it stays until the script changes or clears it. Collapsing them into
// one thing would mean either a state that vanishes or an event that never does.
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

/** Panel teardown: a message about a panel that is gone is worse than no message. */
export function clearScriptUi() {
  scriptNotifications.set([]);
  scriptStatus.set('');
}

export function currentNotifications() { return get(scriptNotifications); }
