// dockTabMemory.js — the script editor's dock opens on the tab it was last on, per viewer.
//
// Decided by the owner on 2026-10-19 (docs/design/script-editor-value-editors.md, "Open questions
// for the owner"): someone who works with Values gets Values, someone browsing the API gets Insert,
// and Insert the first time. Kept in local storage as the minimap's toggle is (`ce-minimap`), so it
// is the viewer's and not the panel's, and nothing about it travels in a file.
//
// Storage can be missing or refuse (a private window, blocked site data): every read and write is
// wrapped, and the dock then simply opens on Insert.

/** The storage key. */
export const DOCK_TAB_KEY = 'ce-script-dock-tab';

/** The dock's tabs, in the order it shows them. */
export const DOCK_TABS = Object.freeze(['insert', 'library', 'history', 'values']);

/** The tab the dock opens on when nothing is remembered. */
export const DEFAULT_DOCK_TAB = 'insert';

function storageOf(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** The tab to open on: the one remembered, or Insert. Never throws. */
export function readDockTab(storage) {
  try {
    const value = storageOf(storage)?.getItem(DOCK_TAB_KEY);
    return DOCK_TABS.includes(value) ? value : DEFAULT_DOCK_TAB;
  } catch {
    return DEFAULT_DOCK_TAB;
  }
}

/** Remember `tab`. False when it is not a tab, or storage refused it. Never throws. */
export function writeDockTab(tab, storage) {
  if (!DOCK_TABS.includes(tab)) return false;
  try {
    const store = storageOf(storage);
    if (!store) return false;
    store.setItem(DOCK_TAB_KEY, tab);
    return true;
  } catch {
    return false;
  }
}
