// panelSessionPersistence.js — the unsaved-work recovery snapshot.
//
// Kept in IndexedDB (utils/browserDatabase.js) as one record: the open panels that have no file or
// unsaved changes, the active tab, and when it was taken. It used to be two localStorage keys,
// which capped recovery at about 5 MB for everything open — a single large panel with its images
// did not fit, and recovery silently stopped covering exactly the work most worth recovering.
//
// localStorage is still used in two narrow ways:
//
//   - READ ONCE, to pick up a snapshot an older build left there. It is then moved: the next
//     successful write to IndexedDB removes the old keys and the space they held.
//   - WRITTEN on the way out (`unloading`), when the snapshot fits. An IndexedDB write is
//     asynchronous and a closing WebView does not promise to finish it; a synchronous copy of a
//     small snapshot is cheap insurance. On restore the newer of the two wins, by `savedAt`.
//     A snapshot too large for localStorage gets the IndexedDB write alone, which is still strictly
//     more than it got before.
//
// Everywhere IndexedDB does not exist (a node test without the shim), the old localStorage path runs
// unchanged.
import { readStoredJson, removeStoredValue, writeStoredJson } from '../utils/localStorageState.js';
import { browserDatabase, readRecord, removeRecord, writeRecord } from '../utils/browserDatabase.js';
import { expandControl, shrinkControl } from './documentShape.js';

const UNSAVED_PANELS_KEY = 'ce.unsavedPanels';
const UNSAVED_ACTIVE_TAB_KEY = 'ce.unsavedActiveEditorTab';
const UNSAVED_SAVED_AT_KEY = 'ce.unsavedSavedAt';
const RECORD_KEY = 'unsavedSession';

// The first read of the session, while it is in flight. A write or a clear waits for it: an autosave
// or a close that fires during start-up must not replace the snapshot before it has been restored.
let pendingRead = null;
// Writes are queued so they commit in the order they were asked for, whatever each one costs.
let writeQueue = Promise.resolve();

function enqueue(task) {
  const next = writeQueue.then(() => pendingRead).then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

function clearLegacyKeys() {
  removeStoredValue(UNSAVED_PANELS_KEY);
  removeStoredValue(UNSAVED_ACTIVE_TAB_KEY);
  removeStoredValue(UNSAVED_SAVED_AT_KEY);
}

export function clearUnsavedSessionSnapshot() {
  clearLegacyKeys();
  return enqueue(() => removeRecord(RECORD_KEY));
}

export function buildUnsavedSessionSnapshot(panelList) {
  return (panelList ?? [])
    .filter((panel) => !panel.filePath || panel.modified)
    .map((panel) => ({
      ...panel,
      // Use the same lossless default elision as .cepanel files: a snapshot is a document, and the
      // expanded model of a large panel is several times its saved size.
      controls: (panel.controls ?? []).map(shrinkControl),
      _sessionControlsSparse: true,
    }));
}

function writeLegacy(snapshot, activeEditorTab, savedAt) {
  if (!writeStoredJson(UNSAVED_PANELS_KEY, snapshot)) return false;
  writeStoredJson(UNSAVED_SAVED_AT_KEY, savedAt);
  return writeStoredJson(UNSAVED_ACTIVE_TAB_KEY, activeEditorTab);
}

/**
 * Store the snapshot. Resolves true once it is committed somewhere it will be restored from, false
 * when it could not be (the caller warns the author once). `unloading` adds the synchronous
 * localStorage copy described at the top; it is written before this returns its promise.
 */
export function persistUnsavedSessionSnapshot({
  panelList,
  activeEditorTab,
  autosaveEnabled,
  restoreUnsavedWork,
  unloading = false,
}) {
  if (!autosaveEnabled || !restoreUnsavedWork) {
    return clearUnsavedSessionSnapshot().then(() => true);
  }

  const snapshot = buildUnsavedSessionSnapshot(panelList);
  if (snapshot.length === 0) {
    return clearUnsavedSessionSnapshot().then(() => true);
  }

  const savedAt = Date.now();
  if (!browserDatabase()) return Promise.resolve(writeLegacy(snapshot, activeEditorTab, savedAt));

  // Synchronously, before any await: this is the copy that survives a WebView closing mid-write.
  const legacyWritten = unloading ? writeLegacy(snapshot, activeEditorTab, savedAt) : false;
  return enqueue(async () => {
    const stored = await writeRecord(RECORD_KEY, { panels: snapshot, activeEditorTab, savedAt });
    if (stored && !unloading) clearLegacyKeys();
    if (stored) return true;
    // The database refused (disk full, profile locked): localStorage, if it fits, is better than nothing.
    return legacyWritten || writeLegacy(snapshot, activeEditorTab, savedAt);
  });
}

function expandSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((panel) => {
    if (!panel?._sessionControlsSparse) return panel; // Older expanded snapshots.
    const { _sessionControlsSparse, ...restored } = panel;
    return { ...restored, controls: (restored.controls ?? []).map(expandControl) };
  });
}

function readLegacy() {
  const panels = readStoredJson(UNSAVED_PANELS_KEY, null);
  if (!Array.isArray(panels)) return null;
  return {
    panels,
    activeEditorTab: readStoredJson(UNSAVED_ACTIVE_TAB_KEY, null),
    savedAt: Number(readStoredJson(UNSAVED_SAVED_AT_KEY, 0)) || 0,
  };
}

/**
 * The stored session: `{ panels, activeEditorTab }`, panels expanded back to the editor's model.
 * Empty when there is nothing to restore. The newer of the database record and a localStorage copy
 * wins — the latter is either left by an older build (savedAt 0) or written on the way out.
 */
export function readUnsavedSession() {
  const read = (async () => {
    const legacy = readLegacy();
    const record = browserDatabase() ? await readRecord(RECORD_KEY, null) : null;
    const usable = (candidate) => candidate && Array.isArray(candidate.panels) ? candidate : null;
    const fromRecord = usable(record);
    const fromLegacy = usable(legacy);
    const chosen = fromRecord && fromLegacy
      ? (Number(fromLegacy.savedAt) > Number(fromRecord.savedAt) ? fromLegacy : fromRecord)
      : (fromRecord ?? fromLegacy);
    return {
      panels: expandSnapshot(chosen?.panels ?? []),
      activeEditorTab: chosen?.activeEditorTab ?? null,
    };
  })();
  pendingRead = read.then(() => undefined, () => undefined);
  return read;
}

/** Tests only: wait for every queued write to settle. */
export function settleUnsavedSessionWrites() {
  return writeQueue;
}
