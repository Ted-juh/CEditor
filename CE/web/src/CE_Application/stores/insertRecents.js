import { writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

/**
 * Recently inserted component types, most recent first, persisted so the
 * Insert panel's Recents row survives restarts. Recorded by addControl, so
 * every insert path (panel, menu, drag-drop) counts.
 */
const STORAGE_KEY = 'ce.insertRecents';
const MAX_RECENTS = 8;

function readInitial() {
  const stored = readStoredJson(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter((t) => typeof t === 'string').slice(0, MAX_RECENTS) : [];
}

export const insertRecents = writable(readInitial());

export function recordInsertUse(type) {
  if (!type || typeof type !== 'string') return;
  insertRecents.update((list) => {
    const next = [type, ...list.filter((t) => t !== type)].slice(0, MAX_RECENTS);
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
}
