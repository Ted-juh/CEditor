import { writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

const STORAGE_KEY = 'ce.sectionCollapse.v1';

/**
 * Persistent collapse state for property sections.
 * Keyed by section identifier string.
 * Survives component re-creation (tab switches).
 */
export const sectionCollapse = writable(readStoredJson(STORAGE_KEY, {}));

sectionCollapse.subscribe((value) => {
  writeStoredJson(STORAGE_KEY, value);
});

export function isCollapsed(key, defaultValue = false) {
  let val;
  sectionCollapse.subscribe(s => val = s[key] ?? defaultValue)();
  return val;
}

export function setCollapsed(key, collapsed) {
  sectionCollapse.update(s => ({ ...s, [key]: collapsed }));
}

export function toggleCollapsed(key, defaultValue = false) {
  sectionCollapse.update(s => ({ ...s, [key]: !(s[key] ?? defaultValue) }));
}
