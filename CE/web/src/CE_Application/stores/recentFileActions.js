import { get } from 'svelte/store';
import { openPanelFile, openScriptWorkspaceFile } from '../bridge/bridge.js';
import { openStandaloneDeviceProfileTab, setActiveEditorTab } from './panels.js';
import { createComponentDocumentFromLibraryEntry } from './componentWorkspace.js';
import { customComponentLibrary } from './customComponentLibrary.js';
import { deviceProfiles, refreshDeviceProfiles } from './deviceProfiles.js';
import { forgetRecentFile, recentFileLabel, rememberRecentFile } from './recentFiles.js';

/**
 * recentFileActions.js — "open this thing again", shared by the menu bar and the tab strip.
 *
 * Kept out of recentFiles.js on purpose: that store is pure list mechanics and is tested as such,
 * while everything here reaches for the C++ bridge or another store. Kept out of the two
 * components for the reason D6 exists at all — the menu and the tab strip had grown separate
 * answers to "open a saved component", and one of them was wrong.
 */

/** Open a package from the custom-component library, and record it. */
export function openComponentLibraryEntry(entry) {
  if (!entry) return null;
  const document = createComponentDocumentFromLibraryEntry(entry);
  if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  rememberRecentFile({ kind: 'component', id: entry.id, name: entry.name || entry.id });
  return document ?? null;
}

/** Open a loaded device profile in its Designer tab, and record it. */
export function openDeviceProfileEntry(profile) {
  if (!profile?.id) return;
  openStandaloneDeviceProfileTab(profile);
  rememberRecentFile({ kind: 'deviceProfile', id: profile.id, name: profile.name || profile.id });
}

/**
 * Re-open one recent entry.
 *
 * Path-backed kinds go straight to the C++ opener rather than through a file dialog — skipping
 * that dialog is the entire point of a recent list. Library-backed kinds are looked up by id, and
 * an entry whose subject has since been deleted is dropped from the list on the spot: a recent
 * item that silently does nothing is exactly the dead menu item D3 was about.
 *
 * @returns true if something was opened, false if the entry was stale and has been forgotten
 */
export function openRecentFile(entry) {
  if (!entry) return false;

  if (entry.kind === 'panel' && entry.path) {
    openPanelFile(entry.path);
    return true;
  }
  if (entry.kind === 'script' && entry.path) {
    openScriptWorkspaceFile(entry.path);
    return true;
  }
  if (entry.kind === 'component') {
    const found = (get(customComponentLibrary) ?? []).find((item) => item.id === entry.id);
    if (found) { openComponentLibraryEntry(found); return true; }
  }
  if (entry.kind === 'deviceProfile') {
    refreshDeviceProfiles();
    const found = (get(deviceProfiles) ?? []).find((item) => item.id === entry.id);
    if (found) { openDeviceProfileEntry(found); return true; }
  }

  forgetRecentFile(entry);
  window.alert?.(`"${recentFileLabel(entry)}" is no longer available, so it was removed from Open Recent.`);
  return false;
}
