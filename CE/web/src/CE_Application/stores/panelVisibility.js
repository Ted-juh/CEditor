import { derived, get, writable } from 'svelte/store';
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
  // The display panel in the script workspace (docs/design/script-editor-value-editors.md): a
  // switch of its own, so a dock left open in the panel editor does not take a third of the script
  // editor's height, and one opened for a script's colour does not follow the viewer back.
  displayScript: 'ce.ui.showDisplayPanel.script',
};

// Defaults match what App.svelte shipped: the tree and properties open, the display dock closed.
const DEFAULTS = { tree: true, display: false, properties: true, displayScript: false };

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
export const showDisplayPanelInScript = persisted('displayScript');

/** Which display switch is live: 'script' while the script workspace is showing, else 'panel'.
 *  App.svelte sets it from the workspace it lays out. */
export const displayPanelWorkspace = writable('panel');

/** Whether the display panel is showing in the workspace in front: what the rail and the Window
 *  menu tick. */
export const displayPanelVisible = derived(
  [displayPanelWorkspace, showDisplayPanel, showDisplayPanelInScript],
  ([workspace, panel, script]) => (workspace === 'script' ? script : panel),
);

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

// 'display' names the switch of the workspace in front, so the rail, the menu, a colour swatch and
// the script editor's Values tab all write the one the viewer is looking at.
function liveStore(which) {
  if (which === 'display' && get(displayPanelWorkspace) === 'script') return showDisplayPanelInScript;
  return STORES[which] ?? null;
}

export function isPanelVisible(which) {
  const store = liveStore(which);
  return store ? get(store) === true : false;
}

export function setPanelVisibility(which, value) {
  liveStore(which)?.set(value === true);
}

export function togglePanelVisibility(which) {
  liveStore(which)?.update((value) => !value);
}
