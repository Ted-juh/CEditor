import { get, writable } from 'svelte/store';
import { panels, resolvedActivePanelId, activeEditorTab } from './panels.js';
import {
  componentWorkspaceMode,
  componentDocuments,
  activeComponentDocumentId,
} from './componentWorkspace.js';

/** Reactive stores for UI binding */
export const undoAvailable = writable(false);
export const redoAvailable = writable(false);

/**
 * Undo/Redo history — per-context state snapshots.
 *
 * There are two editing contexts that share the same undo/redo entry points
 * (global Ctrl+Z/Y, the menu, and the toolbar):
 *   - `panel`     — the active panel in the `panels` store.
 *   - `component` — the active custom-component document in the component
 *                   workspace (`componentDocuments`), shown when the workspace
 *                   is in `surface` mode.
 *
 * Whichever context is active receives the snapshot/undo/redo. History is kept
 * per context id so switching between panels and components — or between two
 * component documents — preserves each one's stack.
 *
 * Approach: snapshot the active context's state on each meaningful change.
 * A debounce timer groups rapid changes (drag, typing) into one snapshot.
 * Manual actions can call `pushSnapshot()` to flush immediately.
 */

const MAX_HISTORY = 50;

// Per-context history: Map<contextKey, { undoStack: [], redoStack: [] }>
const historyMap = new Map();
let isRestoring = false;
let debounceTimer = null;
let lastSnapshotJson = null;

/**
 * Resolve which editing context is currently active. The component workspace
 * takes precedence when it is open with a valid active document; otherwise the
 * active panel is used. Returns null when nothing editable is focused.
 *
 * A custom component is being edited in two cases, mirroring how the editor
 * decides to render the creator (see EditorCanvas's `componentSurfaceWorkspace`):
 * either the workspace is in `surface` mode, or a standalone `component` editor
 * tab is active. The tab case matters because opening a component tab resets the
 * workspace mode back to `panel`, yet the creator (and its edits) stay live — so
 * gating only on `surface` mode would miss every standalone-tab edit and leave
 * undo/redo dead.
 */
function activeContext() {
  const editingComponent =
    get(componentWorkspaceMode) === 'surface' || get(activeEditorTab)?.type === 'component';
  if (editingComponent) {
    const documentId = get(activeComponentDocumentId);
    if (documentId != null && get(componentDocuments).some((doc) => doc.id === documentId)) {
      return { kind: 'component', id: documentId };
    }
  }
  const panelId = get(resolvedActivePanelId);
  if (panelId != null) return { kind: 'panel', id: panelId };
  return null;
}

function contextKey(context) {
  return `${context.kind}:${context.id}`;
}

function getHistory(key) {
  if (!historyMap.has(key)) {
    historyMap.set(key, { undoStack: [], redoStack: [] });
  }
  return historyMap.get(key);
}

function updateAvailability() {
  const context = activeContext();
  if (!context) {
    undoAvailable.set(false);
    redoAvailable.set(false);
    return;
  }
  const h = getHistory(contextKey(context));
  undoAvailable.set(h.undoStack.length > 0);
  redoAvailable.set(h.redoStack.length > 0);
}

/** Serialize the active context's editable state, stripping transient fields. */
function snapshotOf(context) {
  if (!context) return null;
  if (context.kind === 'component') {
    const doc = get(componentDocuments).find((entry) => entry.id === context.id);
    if (!doc?.control) return null;
    return JSON.stringify(doc.control);
  }
  const panel = get(panels).find((p) => p.id === context.id);
  if (!panel) return null;
  const { id, modified, ...data } = panel;
  return JSON.stringify(data);
}

function restoreSnapshot(context, json) {
  if (json == null) return;
  isRestoring = true;
  if (context.kind === 'component') {
    const control = JSON.parse(json);
    componentDocuments.update((list) =>
      list.map((doc) => {
        if (doc.id !== context.id) return doc;
        return {
          ...doc,
          control,
          name: control?._children?.Core?.name ?? doc.name,
          modified: true,
        };
      })
    );
  } else {
    const data = JSON.parse(json);
    panels.update((list) =>
      list.map((p) => (p.id === context.id ? { ...p, ...data, modified: true } : p))
    );
  }
  isRestoring = false;
  lastSnapshotJson = json;
}

/**
 * Push the current active context state onto the undo stack.
 * Called automatically via debounce, or manually before destructive actions.
 */
export function pushSnapshot() {
  if (isRestoring) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;

  const context = activeContext();
  if (!context) return;

  const json = snapshotOf(context);
  if (json == null) return;

  // Skip if identical to last snapshot, or if there is no committed baseline yet.
  if (json === lastSnapshotJson) return;
  if (lastSnapshotJson == null) {
    lastSnapshotJson = json;
    return;
  }

  const history = getHistory(contextKey(context));
  history.undoStack.push(lastSnapshotJson);

  // Cap undo stack size
  if (history.undoStack.length > MAX_HISTORY) {
    history.undoStack.shift();
  }

  // Clear redo stack on new action
  history.redoStack.length = 0;

  lastSnapshotJson = json;
  updateAvailability();
}

/**
 * Schedule a snapshot after a debounce delay.
 * Groups rapid changes (drag, typing) into one snapshot.
 */
function scheduleSnapshot() {
  if (isRestoring) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(pushSnapshot, 400);
}

/** Reset the committed baseline to the active context's current state. */
function resetBaseline() {
  if (isRestoring) return;
  lastSnapshotJson = snapshotOf(activeContext());
  updateAvailability();
}

/**
 * Undo the last action on the active context.
 */
export function undo() {
  // Flush any pending debounced snapshot first
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    pushSnapshot();
  }

  const context = activeContext();
  if (!context) return;

  const history = getHistory(contextKey(context));
  if (history.undoStack.length === 0) return;

  // Save current state to redo
  const current = snapshotOf(context);
  if (current == null) return;
  history.redoStack.push(current);

  // Restore previous state
  const prev = history.undoStack.pop();
  restoreSnapshot(context, prev);
  updateAvailability();
}

/**
 * Redo the last undone action on the active context.
 */
export function redo() {
  const context = activeContext();
  if (!context) return;

  const history = getHistory(contextKey(context));
  if (history.redoStack.length === 0) return;

  // Save current state to undo
  const current = snapshotOf(context);
  if (current == null) return;
  history.undoStack.push(current);

  // Restore redo state
  const next = history.redoStack.pop();
  restoreSnapshot(context, next);
  updateAvailability();
}

/**
 * Check if undo/redo is available for the active context.
 */
export function canUndo() {
  const context = activeContext();
  if (!context) return false;
  return getHistory(contextKey(context)).undoStack.length > 0;
}

export function canRedo() {
  const context = activeContext();
  if (!context) return false;
  return getHistory(contextKey(context)).redoStack.length > 0;
}

/**
 * Initialize history tracking.
 * Subscribe to the editable stores and capture snapshots on changes.
 * Call once at app startup.
 */
export function initHistory() {
  // Capture initial state of whatever context is active.
  resetBaseline();

  // Re-baseline when the active context changes so the next edit is measured
  // against the newly-focused panel or component document, not the previous one.
  resolvedActivePanelId.subscribe(resetBaseline);
  activeComponentDocumentId.subscribe(resetBaseline);
  componentWorkspaceMode.subscribe(resetBaseline);
  activeEditorTab.subscribe(resetBaseline);

  // Watch for mutations in either editable store.
  panels.subscribe(() => {
    if (isRestoring) return;
    scheduleSnapshot();
  });
  componentDocuments.subscribe(() => {
    if (isRestoring) return;
    scheduleSnapshot();
  });
}

/**
 * Clear history for a specific id (e.g., on panel or document close).
 */
export function clearHistory(id) {
  historyMap.delete(`panel:${id}`);
  historyMap.delete(`component:${id}`);
}
