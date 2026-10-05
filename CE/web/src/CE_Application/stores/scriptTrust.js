/**
 * Script trust: a panel's scripts run in the editor only once this computer trusts that exact code.
 *
 * Preview scripts run with the page's own reach, and the page reaches the native bridge — so a
 * shared panel's JavaScript, the moment Preview was pressed, could read or write any file on the
 * machine (release audit C-08, reproduced in the running app). Moving every script into an isolated
 * frame with an asynchronous API is the full answer, and too large a change to make safely before a
 * beta. This is the answer documents with macros have long used: code that arrived from somewhere
 * else does not run until the user says so.
 *
 * Only code that ARRIVED is gated. File > Open and an opened package call markScriptsForeign, which
 * records on the panel the hash of the scripts it came with (`scriptsAwaitingTrust`). Scripts written
 * here never carry it, so an author is never asked about their own work. The mark is not saved into
 * the .cepanel — a file cannot vouch for itself, and reopening recomputes it — but it does ride the
 * recovery snapshot, so a restart does not lift it. Editing the scripts does not lift it either;
 * only "Run scripts" does, and that is remembered per content: a panel you trusted keeps running
 * when you reopen it, while a copy whose scripts somebody else changed asks again.
 *
 * The gate is armed by the editor shell (App.svelte calls initScriptTrust). The exported player runs
 * its own baked panel, and the unit tests drive the runtime directly; neither arms it.
 */

import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'ceditor.trustedScripts.v1';
const MAX_REMEMBERED = 500;

let armed = false;
let storage = null;
let trusted = new Set();
const declined = new Set();

/** What the banner shows: `{ panelId, panelName, hash, count, languages }`, or null. */
export const pendingScriptTrust = writable(null);

function load() {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    trusted = new Set(Array.isArray(list) ? list.filter((h) => typeof h === 'string') : []);
  } catch {
    trusted = new Set();
  }
}

function save() {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...trusted].slice(-MAX_REMEMBERED)));
  } catch {
    // A private window or a full quota: trust still holds for this session.
  }
}

/** Arm the gate. `store` is a Storage-like object; the default is the page's localStorage. */
export function initScriptTrust(store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  armed = true;
  storage = store;
  declined.clear();
  pendingScriptTrust.set(null);
  load();
}

/** For tests: disarm and forget everything. */
export function resetScriptTrustForTests() {
  armed = false;
  storage = null;
  trusted = new Set();
  declined.clear();
  pendingScriptTrust.set(null);
}

export function scriptTrustArmed() {
  return armed;
}

/** FNV-1a over a string, as 13 base-36 characters. Not cryptographic: it names content, it does not guard it. */
function fnv(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0');
}

const hashes = new WeakMap();

/**
 * A stable name for a set of scripts' code. Order-independent; disabled scripts count too; entries
 * that are not source scripts are skipped, so the editor's list and the stored list name the same
 * code. Cached by array identity — pass the stored array, which keeps its identity between edits.
 */
export function scriptsHash(scripts) {
  if (!Array.isArray(scripts)) return null;
  const cached = hashes.get(scripts);
  if (cached !== undefined) return cached;
  const sources = scripts.filter((s) => s != null && typeof s.source === 'string' && typeof s.language === 'string');
  if (sources.length === 0) { hashes.set(scripts, null); return null; }
  const parts = sources
    .map((s) => [s?.language ?? '', s?.scope ?? '', s?.target ?? '', s?.event ?? '', s?.source ?? ''].join('\u0001'))
    .sort();
  const hash = fnv(parts.join('\u0002'));
  hashes.set(scripts, hash);
  return hash;
}

export function isTrustedHash(hash) {
  return hash != null && trusted.has(hash);
}

/** Trust this code from now on, on this computer. */
export function trustScriptsHash(hash) {
  if (hash == null) return;
  trusted.delete(hash);
  trusted.add(hash);
  save();
  const pending = get(pendingScriptTrust);
  if (pending?.hash === hash) pendingScriptTrust.set(null);
}

/** "Keep them off": stop asking about this code until Preview is next turned on. */
export function declineScriptsHash(hash) {
  if (hash == null) return;
  declined.add(hash);
  const pending = get(pendingScriptTrust);
  if (pending?.hash === hash) pendingScriptTrust.set(null);
}

/** Preview is going live: a panel whose scripts were kept off may be asked about again. */
export function forgetDeclinedScripts() {
  declined.clear();
}

/** The panel field that holds the hash of the scripts a panel arrived with, until they are trusted. */
export const AWAITING_TRUST_FIELD = 'scriptsAwaitingTrust';

/**
 * A panel that came from outside this editor — a file or a package. Returns the panel with the
 * mark set to its scripts' hash, or cleared when it has no scripts or this computer already trusts
 * them. Whatever the document itself said about the mark is discarded.
 */
export function markScriptsForeign(panel) {
  if (!panel || typeof panel !== 'object') return panel;
  const { [AWAITING_TRUST_FIELD]: _ignored, ...rest } = panel;
  const hash = scriptsHash(rest.scripts);
  return hash != null && !trusted.has(hash) ? { ...rest, [AWAITING_TRUST_FIELD]: hash } : rest;
}

/**
 * May these scripts run? Called by the runtime every time it gathers a panel's scripts. A panel
 * still awaiting trust raises the banner (once per content) and the answer is no.
 */
export function scriptsAllowed(panel, scripts) {
  if (!armed) return true;
  const hash = panel?.[AWAITING_TRUST_FIELD];
  if (typeof hash !== 'string' || trusted.has(hash)) return true;
  if (!declined.has(hash)) {
    const pending = get(pendingScriptTrust);
    if (pending?.hash !== hash) {
      const list = Array.isArray(scripts) ? scripts : [];
      const languages = [...new Set(list.map((s) => s?.language).filter(Boolean))];
      pendingScriptTrust.set({ panelId: panel?.id ?? null, panelName: panel?.name ?? 'This panel', hash, count: list.length, languages });
    }
  }
  return false;
}
