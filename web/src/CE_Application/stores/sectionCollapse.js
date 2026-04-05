import { writable } from 'svelte/store';

/**
 * Persistent collapse state for property sections.
 * Keyed by section identifier string.
 * Survives component re-creation (tab switches).
 */
export const sectionCollapse = writable({});

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
