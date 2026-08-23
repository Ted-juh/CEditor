// updateChannel.js — the update check as a command, and the state a surface can read.
//
// `utils/updateCheck.js` is the rules and is pure. This is the part that talks to the bridge, holds
// the answer, and enforces the one thing that must not be got wrong: a check happens because the
// setting is on or because a person asked for it, and never otherwise.
//
// It is a store rather than a callback because two surfaces read the same answer — the About dialog
// shows it as a line, and a startup check raises it as a notice — and a second copy of "what did
// the last check say" is a second thing to get out of step.

import { get, writable } from 'svelte/store';

import { buildInfo } from '../buildInfo.js';
import { checkForUpdates as bridgeCheckForUpdates, onUpdateCheckResult } from '../bridge/bridge.js';
import { generalSettings } from './appSettings.js';
import { cerror, cinfo } from './console.js';
import { readLatestRelease, updateCheckIsAllowed, updateCheckSummary } from '../utils/updateCheck.js';

/**
 * The last answer, or null before anything has run.
 *
 * `{ state, ok, updateAvailable, latestVersion, releaseUrl, publishedAt, error, checkedAt }`.
 * `state` is 'checking' | 'done' | 'failed', so a surface can say "checking…" rather than showing
 * a stale answer while a new one is in flight.
 */
export const updateStatus = writable(null);

let listenersReady = false;
let inFlight = false;

function ensureListener() {
  if (listenersReady) return;
  listenersReady = true;

  onUpdateCheckResult((payload) => {
    inFlight = false;

    if (payload?.ok !== true) {
      const error = String(payload?.error ?? 'The update check did not complete.');
      updateStatus.set({ state: 'failed', ok: false, updateAvailable: false, error, checkedAt: new Date().toISOString() });
      cerror('[update]', error);
      return;
    }

    const result = readLatestRelease(payload.release, buildInfo.version);
    updateStatus.set({ ...result, state: result.ok ? 'done' : 'failed', checkedAt: new Date().toISOString() });

    const summary = updateCheckSummary(result, buildInfo.version);
    if (result.ok && result.updateAvailable) cinfo('[update]', summary, result.releaseUrl);
    else if (result.ok) cinfo('[update]', summary);
    else cerror('[update]', summary);
  });
}

/**
 * Run a check.
 *
 * `userAsked` is the consent, and the only thing that lets a check run with the setting off — so it
 * is a required argument rather than a defaulted one. A caller that has to decide what to pass is a
 * caller that has thought about it.
 */
export function runUpdateCheck({ userAsked }) {
  const enabled = get(generalSettings)?.checkForUpdatesOnStartup === true;
  if (!updateCheckIsAllowed(enabled, userAsked)) return false;
  if (inFlight) return false;

  ensureListener();
  inFlight = true;
  updateStatus.set({ state: 'checking', ok: false, updateAvailable: false, error: '', checkedAt: null });
  bridgeCheckForUpdates();
  return true;
}

/** The startup path. Does nothing unless the user turned the setting on. */
export function runStartupUpdateCheck() {
  return runUpdateCheck({ userAsked: false });
}

/** One sentence for whatever the last check said, including "none has run". */
export function updateStatusLine(status) {
  if (status?.state === 'checking') return 'Checking for updates…';
  return updateCheckSummary(status, buildInfo.version);
}
