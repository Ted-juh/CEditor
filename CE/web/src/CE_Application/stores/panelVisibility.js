import { writable } from 'svelte/store';
import { readStoredBool, writeStoredJson } from '../utils/localStorageState.js';

/**
 * panelVisibility.js — the three dock toggles, out of App.svelte and into a store.
 *
 * Review finding D6: "There is no Window menu and View carries no panel toggles." The reason
 * there wasn't one is structural, not an oversight: `showTreePanel` / `showDisplayPanel` /
 * `showPropertiesPanel` were three `$state` locals inside App.svelte, reachable only by the icon
 * rail because App passes them down as props. Nothing else in the app could read them, so a menu
 * item could neither show a checkmark nor flip one.
 *
 * The storage keys are exactly the ones App.svelte already used, so a running install keeps its
 * layout across this change — do not rename them without a migration.
 *
 * WIRING NOTE (for whoever owns App.svelte): App must stop declaring these as `$state` and read
 * them from here instead, or there will be two copies of the truth and the menu will tick a box
 * the layout ignores until the next restart. That is three lines:
 *     let showTreePanel = $derived($showTreePanel_store) ... etc.
 * or, more simply, use `$showTreePanel` directly in the markup and delete App's own `$effect`
 * persistence blocks — persistence lives here now.
 */

export const PANEL_VISIBILITY_STORAGE_KEYS = {
  tree: 'ce.ui.showTreePanel',
  display: 'ce.ui.showDisplayPanel',
  properties: 'ce.ui.showPropertiesPanel',
};

// Defaults match what App.svelte shipped: the tree and properties open, the display dock closed.
const DEFAULTS = { tree: true, display: false, properties: true };

function persisted(which) {
  const key = PANEL_VISIBILITY_STORAGE_KEYS[which];
  const store = writable(readStoredBool(key, DEFAULTS[which]));
  // Persist on every write regardless of who wrote it — the menu, the rail and App.svelte are
  // all legitimate writers and none of them should have to remember to save.
  store.subscribe((value) => writeStoredJson(key, value === true));
  return store;
}

export const showTreePanel = persisted('tree');
export const showDisplayPanel = persisted('display');
export const showPropertiesPanel = persisted('properties');

const STORES = {
  tree: showTreePanel,
  display: showDisplayPanel,
  properties: showPropertiesPanel,
};

/** The three toggles, in the order the Window menu and the icon rail list them. */
export const PANEL_VISIBILITY_ITEMS = [
  { id: 'tree', label: 'Component Tree' },
  { id: 'properties', label: 'Properties Panel' },
  { id: 'display', label: 'Display Panel' },
];

export function panelVisibilityStore(which) {
  return STORES[which] ?? null;
}

export function setPanelVisibility(which, value) {
  STORES[which]?.set(value === true);
}

export function togglePanelVisibility(which) {
  STORES[which]?.update((value) => !value);
}
