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

// --- Scope registry, for expand/collapse-all -----------------------------------------------
//
// A PropertySection that manages its own collapse state registers its key under the scope it is
// rendered in (SectionRenderer supplies the scope: "component:text", "panel:background", ...).
// Without this the card header could offer a collapse-all button but would have nothing to
// collapse — the keys are only knowable from the sections that actually rendered, and which ones
// those are depends on the selected control.
//
// Registration is refcounted because the panel mounts the same tab twice in the pinned-split
// view, and a plain Set would have the first unmount take the second view's sections with it.
const scopeKeys = new Map();

export function registerSectionKey(scope, key) {
  if (!scope || !key) return () => {};
  let keys = scopeKeys.get(scope);
  if (!keys) { keys = new Map(); scopeKeys.set(scope, keys); }
  keys.set(key, (keys.get(key) ?? 0) + 1);
  return () => {
    const count = (keys.get(key) ?? 0) - 1;
    if (count > 0) keys.set(key, count);
    else keys.delete(key);
    if (keys.size === 0) scopeKeys.delete(scope);
  };
}

/** The section keys currently rendered in a scope. */
export function sectionKeysInScope(scope) {
  return Array.from(scopeKeys.get(scope)?.keys() ?? []);
}

/** Collapse or expand every section currently rendered in a scope, in one store write. */
export function setAllCollapsedInScope(scope, collapsed) {
  const keys = sectionKeysInScope(scope);
  if (!keys.length) return 0;
  sectionCollapse.update((state) => {
    const next = { ...state };
    for (const key of keys) next[key] = collapsed;
    return next;
  });
  return keys.length;
}
