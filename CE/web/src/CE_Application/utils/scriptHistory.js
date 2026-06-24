// scriptHistory.js — lightweight, per-script version history that survives the session.
//
// Snapshots a script's source into localStorage so you can roll back to an earlier
// version even after reloading (the editor's native undo is session-only). Rapid edits
// coalesce into the most recent snapshot; distinct save points (spaced out in time) become
// separate restorable versions. The list-update logic is pure + tested; the storage layer
// is a thin wrapper.

const KEY = 'ce-script-history';
const MAX_PER_SCRIPT = 25;
const MIN_INTERVAL_MS = 20000; // coalesce edits within this window into one snapshot

/**
 * Pure history-list update. Returns a NEW list (does not mutate `list`).
 * - identical-to-latest source → unchanged
 * - within `minIntervalMs` of the latest snapshot → replace it (coalesce)
 * - otherwise → append a new snapshot, trimmed to `max`
 */
export function updateHistoryList(list, source, now, { minIntervalMs = MIN_INTERVAL_MS, max = MAX_PER_SCRIPT } = {}) {
  const base = Array.isArray(list) ? list.slice() : [];
  const last = base[base.length - 1];
  if (last && last.source === source) return base;
  const entry = { t: now, source };
  if (last && now - last.t < minIntervalMs) base[base.length - 1] = entry;
  else base.push(entry);
  while (base.length > max) base.shift();
  return base;
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function saveAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota / unavailable — ignore */ }
}

/** Record a snapshot of a script's source (coalescing rapid edits). */
export function recordVersion(scriptId, source, now = Date.now()) {
  if (!scriptId || typeof source !== 'string') return;
  const all = loadAll();
  all[scriptId] = updateHistoryList(all[scriptId], source, now);
  saveAll(all);
}

/** Versions for a script, newest first: [{ t, source }]. */
export function getVersions(scriptId) {
  return (loadAll()[scriptId] || []).slice().reverse();
}

/** Forget a script's history. */
export function clearVersions(scriptId) {
  const all = loadAll();
  delete all[scriptId];
  saveAll(all);
}
