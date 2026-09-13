import { readStoredJson, removeStoredValue, writeStoredJson } from '../utils/localStorageState.js';
import { expandControl, shrinkControl } from './documentShape.js';

const UNSAVED_PANELS_KEY = 'ce.unsavedPanels';
const UNSAVED_ACTIVE_TAB_KEY = 'ce.unsavedActiveEditorTab';

export function clearUnsavedSessionSnapshot() {
  removeStoredValue(UNSAVED_PANELS_KEY);
  removeStoredValue(UNSAVED_ACTIVE_TAB_KEY);
}

export function buildUnsavedSessionSnapshot(panelList) {
  return (panelList ?? [])
    .filter((panel) => !panel.filePath || panel.modified)
    .map((panel) => ({
      ...panel,
      // Use the same lossless default elision as .cepanel files. Expanded
      // controls can exhaust browser storage with only a few ordinary panels.
      controls: (panel.controls ?? []).map(shrinkControl),
      _sessionControlsSparse: true,
    }));
}

export function persistUnsavedSessionSnapshot({
  panelList,
  activeEditorTab,
  autosaveEnabled,
  restoreUnsavedWork,
}) {
  if (!autosaveEnabled || !restoreUnsavedWork) {
    clearUnsavedSessionSnapshot();
    return true;
  }

  const snapshot = buildUnsavedSessionSnapshot(panelList);
  if (snapshot.length === 0) {
    clearUnsavedSessionSnapshot();
    return true;
  }

  if (!writeStoredJson(UNSAVED_PANELS_KEY, snapshot)) return false;
  return writeStoredJson(UNSAVED_ACTIVE_TAB_KEY, activeEditorTab);
}

export function readUnsavedSessionSnapshot() {
  const snapshot = readStoredJson(UNSAVED_PANELS_KEY, []);
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((panel) => {
    if (!panel?._sessionControlsSparse) return panel; // Older expanded snapshots.
    const { _sessionControlsSparse, ...restored } = panel;
    return { ...restored, controls: (restored.controls ?? []).map(expandControl) };
  });
}

export function readUnsavedActiveEditorTab() {
  return readStoredJson(UNSAVED_ACTIVE_TAB_KEY, null);
}
