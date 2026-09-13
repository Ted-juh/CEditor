/**
 * Navigation state for the Hostage build environment.
 *
 * A workspace replaces the workspace in front of it. A utility is a single right-hand
 * drawer: selecting the active utility closes it, selecting another swaps its contents.
 */

export const HOST_WORKSPACES = Object.freeze(['rack', 'performance', 'mixer', 'layers', 'controller']);
export const HOST_UTILITIES = Object.freeze(['library', 'devices', 'project', 'product', 'health', 'licence']);

const STORAGE_KEY = 'ceditor.instrumentHost.navigation.v1';

export function normaliseHostNavigation(value = {}) {
  return {
    workspace: HOST_WORKSPACES.includes(value.workspace) ? value.workspace : 'rack',
    utility: HOST_UTILITIES.includes(value.utility) ? value.utility : '',
  };
}

export function toggleHostUtility(current, requested) {
  if (!HOST_UTILITIES.includes(requested)) return '';
  return current === requested ? '' : requested;
}

export function restoreHostNavigation(storage = globalThis?.localStorage) {
  if (!storage) return normaliseHostNavigation();
  try {
    return normaliseHostNavigation(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return normaliseHostNavigation();
  }
}

export function storeHostNavigation(value, storage = globalThis?.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normaliseHostNavigation(value)));
  } catch {
    // Navigation remains usable when storage is blocked or full.
  }
}
