// scriptLibrary.js — a shared library of reusable scripts, independent of any panel.
//
// The "a+b" model: a script can live on the panel it belongs to AND be saved to this library so it
// can be reused on other panels. Import is COPY-on-import (a fresh id every time) so each panel owns
// its own copy — editing one never mutates another, and panels stay portable.

import { writable } from 'svelte/store';

const STORAGE_KEY = 'ce.scriptLibrary.v1';

function browserLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadLibrary() {
  const storage = browserLocalStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.source === 'string') : [];
  } catch {
    return [];
  }
}

export const scriptLibrary = writable(loadLibrary());

scriptLibrary.subscribe((items) => {
  const storage = browserLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Persistence is best-effort.
  }
});

let counter = 0;
function libraryId() {
  return `lib_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

/** Save a copy of a source-based script into the shared library. Returns the new entry. */
export function saveToLibrary(script) {
  if (!script || typeof script.source !== 'string') return null;
  const entry = {
    id: libraryId(),
    name: String(script.name ?? script.event ?? 'script'),
    language: String(script.language ?? 'lua'),
    event: String(script.event ?? 'onValueChanged'),
    scope: String(script.scope ?? 'component'),
    source: script.source,
    group: String(script.group ?? ''),
    savedAt: new Date().toISOString(),
  };
  scriptLibrary.update((items) => [entry, ...items.filter((e) => e.id !== entry.id)]);
  return entry;
}

export function removeFromLibrary(id) {
  scriptLibrary.update((items) => items.filter((e) => e.id !== id));
}
