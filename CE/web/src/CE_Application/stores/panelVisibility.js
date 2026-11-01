import { derived, get, writable } from 'svelte/store';
import { readStoredBool, readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

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

/** Where Ctrl+\ keeps the panels it hid, so a reload in between does not lose them. */
export const CANVAS_FOCUS_STORAGE_KEY = 'ce.ui.canvasFocusRestore';
const FOCUS_PANELS = ['tree', 'properties', 'display'];

// Which ones Ctrl+\ hid: held here, and stored so a reload in between does not lose them.
let canvasFocusHidden = (() => {
  const stored = readStoredJson(CANVAS_FOCUS_STORAGE_KEY, []);
  return Array.isArray(stored) ? FOCUS_PANELS.filter((which) => stored.includes(which)) : [];
})();

function rememberHidden(list) {
  canvasFocusHidden = list;
  writeStoredJson(CANVAS_FOCUS_STORAGE_KEY, list);
}

/**
 * Ctrl+\: the whole window for the canvas, and back (item 3 of the editor-space list).
 *
 * Each of the three had a chord of its own (Ctrl+Shift+E, Ctrl+Shift+D, Ctrl+J), so clearing the
 * canvas took three and putting it back three more, and the author had to remember which had been
 * open. With any of them open, this hides them all and remembers which; with none open, it brings
 * back the ones it hid, exactly those. If it hid none (they were closed one by one, or never
 * opened), it brings back what a new install shows: the tree and the properties panel.
 *
 * 'display' is the dock of the workspace in front, as everywhere here: hidden from the script
 * workspace, the script dock comes back, and the panel editor's keeps its own switch.
 */
export function toggleCanvasFocus() {
  const open = FOCUS_PANELS.filter((which) => isPanelVisible(which));
  if (open.length > 0) {
    rememberHidden(open);
    for (const which of open) setPanelVisibility(which, false);
    return { hidden: open, shown: [] };
  }
  const shown = canvasFocusHidden.length > 0 ? canvasFocusHidden : FOCUS_PANELS.filter((which) => DEFAULTS[which]);
  for (const which of shown) setPanelVisibility(which, true);
  rememberHidden([]);
  return { hidden: [], shown };
}
