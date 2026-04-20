import { readStoredJson, removeStoredValue, writeStoredJson } from '../utils/localStorageState.js';

const UNSAVED_PANELS_KEY = 'ce.unsavedPanels';
const UNSAVED_ACTIVE_TAB_KEY = 'ce.unsavedActiveEditorTab';

export function clearUnsavedSessionSnapshot() {
  removeStoredValue(UNSAVED_PANELS_KEY);
  removeStoredValue(UNSAVED_ACTIVE_TAB_KEY);
}

export function buildUnsavedSessionSnapshot(panelList) {
  return (panelList ?? [])
    .filter((panel) => !panel.filePath || panel.modified)
    .map((panel) => ({ ...panel }));
}

export function persistUnsavedSessionSnapshot({
  panelList,
  activeEditorTab,
  autosaveEnabled,
  restoreUnsavedWork,
}) {
  if (!autosaveEnabled || !restoreUnsavedWork) {
    clearUnsavedSessionSnapshot();
    return;
  }

  const snapshot = buildUnsavedSessionSnapshot(panelList);
  if (snapshot.length === 0) {
    clearUnsavedSessionSnapshot();
    return;
  }

  writeStoredJson(UNSAVED_PANELS_KEY, snapshot);
  writeStoredJson(UNSAVED_ACTIVE_TAB_KEY, activeEditorTab);
}

export function readUnsavedSessionSnapshot() {
  return readStoredJson(UNSAVED_PANELS_KEY, []);
}

export function readUnsavedActiveEditorTab() {
  return readStoredJson(UNSAVED_ACTIVE_TAB_KEY, null);
}
