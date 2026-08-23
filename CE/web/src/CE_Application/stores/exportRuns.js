// exportRuns.js — the live build log, the export history, and the plugin-identity registry.
//
// Phase E of the export plan asked for three things the Export tab did not have: a build log
// surface, export history with per-target re-export, and a success card with "Reveal in folder".
// All three want the same state, which is why they are one store rather than three.
//
// WHY THE CONSOLE WAS NOT ENOUGH. Build progress already streamed to the console panel, which is
// where every subsystem's chatter goes. A twenty-minute plugin build's output interleaved with MIDI
// traffic and script logs is not a build log — you cannot tell whether the build is stuck, and when
// it fails you cannot find where it started. So the lines are captured here too, per run, with a
// cap: a CMake build can emit thousands, and an unbounded array in a store that renders is how a
// UI stops responding at exactly the moment somebody is watching it.
//
// HISTORY IS PERSISTED, the live log is not. Which plugins you have built and where they went is
// worth having tomorrow; the scrollback of a build that finished is not.

import { derived, get, writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import {
  identityDecision, newCopyIdentity, openPanelCollisions, recordExport,
} from '../utils/guidRegistry.js';

const HISTORY_KEY = 'ce.exportHistory';
const REGISTRY_KEY = 'ce.pluginIdentityRegistry';

/**
 * Lines kept from a running build.
 *
 * A CMake build emits thousands and only the tail is diagnostic — but the HEAD is where a
 * configure error lives, and dropping it would hide the most common failure. So the head is kept
 * too, and the elision is counted and shown rather than silently swallowing the middle.
 */
export const LOG_HEAD = 60;
export const LOG_TAIL = 400;

/** Exports remembered. Enough to re-export anything from this project; not a permanent archive. */
export const MAX_HISTORY = 40;

/** The run in flight, or null. */
export const activeRun = writable(null);

/** Finished exports, newest first. */
export const exportHistory = writable(readStoredJson(HISTORY_KEY, []) ?? []);

/** Which panel owns which plugin identity. See utils/guidRegistry.js for why this exists. */
export const identityRegistry = writable(readStoredJson(REGISTRY_KEY, []) ?? []);

exportHistory.subscribe((value) => writeStoredJson(HISTORY_KEY, value.slice(0, MAX_HISTORY)));
identityRegistry.subscribe((value) => writeStoredJson(REGISTRY_KEY, value));

/** True while a build is running — the Export tab disables its button on this. */
export const buildRunning = derived(activeRun, ($run) => $run !== null && $run.status === 'running');

export function beginRun({ panelId = '', panelName = '', productName = '', guid = '', format = 'VST3', at = null } = {}) {
  activeRun.set({
    panelId: String(panelId),
    panelName: String(panelName),
    productName: String(productName),
    guid: String(guid),
    format: String(format),
    startedAt: at ?? new Date().toISOString(),
    status: 'running',
    head: [],
    tail: [],
    elided: 0,
    path: '',
    message: '',
  });
}

export function appendRunLine(line) {
  const text = String(line ?? '');
  if (!text.length) return;
  activeRun.update((run) => {
    if (!run) return run;
    if (run.head.length < LOG_HEAD) return { ...run, head: [...run.head, text] };
    const tail = [...run.tail, text];
    // The middle goes, not the beginning: a configure error is in the first few lines and a
    // compile error in the last, and the count says how much was dropped rather than leaving a
    // silent gap somebody reads straight past.
    const overflow = Math.max(0, tail.length - LOG_TAIL);
    return { ...run, tail: overflow ? tail.slice(overflow) : tail, elided: run.elided + overflow };
  });
}

/**
 * Finish the run and file it in history.
 *
 * A FAILED BUILD IS RECORDED TOO, with its last lines. Keeping only successes would mean the one
 * run somebody wants to look at again is the one that is gone.
 */
export function finishRun({ ok = false, path = '', message = '', at = null } = {}) {
  const run = get(activeRun);
  if (!run) return null;

  const finished = {
    ...run,
    status: ok ? 'ok' : 'failed',
    path: String(path ?? ''),
    message: String(message ?? ''),
    finishedAt: at ?? new Date().toISOString(),
  };
  activeRun.set(finished);

  exportHistory.update((list) => [{
    panelId: finished.panelId,
    panelName: finished.panelName,
    productName: finished.productName,
    guid: finished.guid,
    format: finished.format,
    path: finished.path,
    ok,
    message: finished.message,
    at: finished.finishedAt,
    // The tail only. A failed build's last lines are what somebody re-reads; keeping the whole log
    // for forty runs would put megabytes in local storage.
    log: finished.tail.slice(-40),
  }, ...list].slice(0, MAX_HISTORY));

  if (ok && finished.guid) {
    identityRegistry.update((registry) => recordExport(registry, {
      guid: finished.guid,
      panelId: finished.panelId,
      productName: finished.productName,
      at: finished.finishedAt,
    }));
  }
  return finished;
}

/** Drop a finished run from the tab without touching history. */
export function clearRun() {
  const run = get(activeRun);
  if (run?.status === 'running') return false;
  activeRun.set(null);
  return true;
}

export function clearHistory() {
  exportHistory.set([]);
}

/** What exporting this panel would do to the plugin identity. See utils/guidRegistry.js. */
export function identityFor(panel) {
  return identityDecision({ panel, registry: get(identityRegistry) });
}

/** Open panels that share a plugin identity — a copied .cepanel, nearly always. */
export function collisions(panels) {
  return openPanelCollisions(panels);
}

/** The patch that turns a panel into its own independent plugin. */
export function newCopyPatch(panel, makeGuid) {
  return newCopyIdentity(panel, makeGuid);
}

/**
 * Record a panel's identity without exporting.
 *
 * Called when a GUID is minted, so the registry knows who owns it before the build finishes —
 * otherwise a failed first export leaves the panel holding a GUID nothing has claimed, and the next
 * export of a copy of it reads as "adopt" instead of "ask".
 */
export function claimIdentity({ guid, panelId, panelPath = '', productName = '' }) {
  if (!guid) return;
  identityRegistry.update((registry) => recordExport(registry, {
    guid, panelId, panelPath, productName, at: new Date().toISOString(),
  }));
}
