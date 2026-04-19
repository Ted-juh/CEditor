import { get, writable } from 'svelte/store';
import { panels, resolvedActivePanelId } from './panels.js';

/** Reactive stores for UI binding */
export const undoAvailable = writable(false);
export const redoAvailable = writable(false);

/**
 * Undo/Redo history — per-panel state snapshots.
 *
 * Approach: snapshot the active panel's state on each meaningful change.
 * A debounce timer groups rapid changes (drag, typing) into one snapshot.
 * Manual actions can call `pushSnapshot()` to flush immediately.
 */

const MAX_HISTORY = 50;

// Per-panel history: Map<panelId, { undoStack: [], redoStack: [] }>
const historyMap = new Map();
let isRestoring = false;
let debounceTimer = null;
let lastSnapshotJson = null;

function getHistory(panelId) {
  if (!historyMap.has(panelId)) {
    historyMap.set(panelId, { undoStack: [], redoStack: [] });
  }
  return historyMap.get(panelId);
}

function updateAvailability() {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) {
    undoAvailable.set(false);
    redoAvailable.set(false);
    return;
  }
  const h = getHistory(panelId);
  undoAvailable.set(h.undoStack.length > 0);
  redoAvailable.set(h.redoStack.length > 0);
}

function snapshotPanel(panel) {
  // Strip transient fields
  const { id, modified, ...data } = panel;
  return JSON.stringify(data);
}

function restoreSnapshot(panelId, json) {
  const data = JSON.parse(json);
  isRestoring = true;
  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, ...data, modified: true };
    })
  );
  isRestoring = false;
  lastSnapshotJson = json;
}

/**
 * Push the current active panel state onto the undo stack.
 * Called automatically via debounce, or manually before destructive actions.
 */
export function pushSnapshot() {
  if (isRestoring) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;

  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return;

  const json = snapshotPanel(panel);

  // Skip if identical to last snapshot
  if (json === lastSnapshotJson) return;

  const history = getHistory(panelId);
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

/**
 * Undo the last action on the active panel.
 */
export function undo() {
  // Flush any pending debounced snapshot first
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    pushSnapshot();
  }

  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  const history = getHistory(panelId);
  if (history.undoStack.length === 0) return;

  // Save current state to redo
  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return;

  history.redoStack.push(snapshotPanel(panel));

  // Restore previous state
  const prev = history.undoStack.pop();
  restoreSnapshot(panelId, prev);
  updateAvailability();
}

/**
 * Redo the last undone action on the active panel.
 */
export function redo() {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  const history = getHistory(panelId);
  if (history.redoStack.length === 0) return;

  // Save current state to undo
  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return;

  history.undoStack.push(snapshotPanel(panel));

  // Restore redo state
  const next = history.redoStack.pop();
  restoreSnapshot(panelId, next);
  updateAvailability();
}

/**
 * Check if undo/redo is available for the active panel.
 */
export function canUndo() {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return false;
  return getHistory(panelId).undoStack.length > 0;
}

export function canRedo() {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return false;
  return getHistory(panelId).redoStack.length > 0;
}

/**
 * Initialize history tracking.
 * Subscribe to panels store and capture snapshots on changes.
 * Call once at app startup.
 */
export function initHistory() {
  // Capture initial state of active panel
  const panelId = get(resolvedActivePanelId);
  if (panelId != null) {
    const panel = get(panels).find(p => p.id === panelId);
    if (panel) lastSnapshotJson = snapshotPanel(panel);
  }

  // Watch for active panel changes to reset lastSnapshotJson
  resolvedActivePanelId.subscribe(id => {
    if (id == null) { lastSnapshotJson = null; return; }
    const panel = get(panels).find(p => p.id === id);
    if (panel) lastSnapshotJson = snapshotPanel(panel);
  });

  // Watch for panel mutations
  panels.subscribe(() => {
    if (isRestoring) return;
    scheduleSnapshot();
  });
}

/**
 * Clear history for a specific panel (e.g., on close).
 */
export function clearHistory(panelId) {
  historyMap.delete(panelId);
}
