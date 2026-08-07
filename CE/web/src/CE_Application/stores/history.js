import { get, writable } from 'svelte/store';
import { deepClone } from '../utils/deepClone.js';
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
// Recording is suspended for the length of a preview run. Everything a preview does to the
// document — a script's writes, and the gesture handlers that edit the model directly — is put
// back when preview stops (stores/previewRehearsal.js), so none of it belongs in the author's
// undo history. Without this a 60Hz animation or a timer script fills all 50 slots in seconds and
// evicts the real edits underneath.
let suppressed = false;
let debounceTimer = null;
let lastSnapshot = null;

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

/**
 * A snapshot of the active context's editable state.
 *
 * THIS USED TO BE `JSON.stringify(panel)`, AND THAT IS WHY BIG PANELS FELT SLOW. The in-memory
 * model is the expanded control tree, so the GAIA panel — 4.8 MB on disk — stringifies to 21 MB
 * and takes ~190 ms. That ran on a 400 ms debounce after every edit, which is a fifth of a second
 * of dead main thread every time you let go of something, and MAX_HISTORY of them is a gigabyte
 * of strings for the collector to walk.
 *
 * It is now a shallow copy that SHARES the control objects. The store is immutable by copy:
 * mutatePanelControlsInList returns unchanged controls by reference and deepClones the ones it
 * edits, so holding references costs one pointer per control and retains only what actually
 * changed. Cost goes from O(bytes in the panel) to O(controls), and 21 MB becomes a few kilobytes.
 *
 * WHAT THIS RESTS ON, stated plainly: nothing may mutate a control in place. That is not a new
 * requirement and not a fragile one — Svelte's reactivity already depends on it, so an in-place
 * mutation would show up as "the canvas did not update" long before it showed up as a corrupted
 * undo. historySnapshot.test.js pins it from the history side anyway, by editing through the real
 * store API and asserting the snapshot taken beforehand did not move.
 */
function snapshotOf(context) {
  if (!context) return null;
  if (context.kind === 'component') {
    const doc = get(componentDocuments).find((entry) => entry.id === context.id);
    if (!doc?.control) return null;
    return { control: doc.control };
  }
  const panel = get(panels).find((p) => p.id === context.id);
  if (!panel) return null;
  const { id, modified, ...data } = panel;
  // The array is copied so a stray in-place push cannot reach back into history; its ELEMENTS are
  // shared, which is the whole point.
  return { ...data, controls: Array.isArray(data.controls) ? data.controls.slice() : data.controls };
}

/** Everything except the control tree, as a string. Small — panel settings, notepad, layers. */
function chromeOf(snapshot) {
  const { controls, control, ...rest } = snapshot;
  return JSON.stringify(rest);
}

/**
 * Are two snapshots the same state?
 *
 * Reference equality first, which is free and true for every control an edit did not touch. Only
 * the ones whose identity changed get compared by value, and only those — so a no-op edit still
 * dedupes (it did before, via the string compare) without the whole panel being serialized to
 * find that out. O(changed), not O(panel).
 */
function sameSnapshot(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (chromeOf(a) !== chromeOf(b)) return false;

  if (a.control || b.control) {
    return a.control === b.control || JSON.stringify(a.control) === JSON.stringify(b.control);
  }

  const left = a.controls ?? [];
  const right = b.controls ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] === right[i]) continue;
    if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) return false;
  }
  return true;
}

function restoreSnapshot(context, snapshot) {
  if (snapshot == null) return;
  isRestoring = true;
  if (context.kind === 'component') {
    // Cloned on the way back in, so the live document and the history entry stop sharing the
    // moment one of them is editable again. Restores are rare; the clone is not on any hot path.
    const control = deepClone(snapshot.control);
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
    // The chrome — panel size, colours, notepad, export settings — is small enough to clone, so a
    // restore never leaves the live panel aliasing a history entry's settings objects. The
    // CONTROLS go back by reference, which is the point: they are immutable, and copying them is
    // the cost this whole change exists to remove.
    const { controls, ...chrome } = snapshot;
    const data = { ...deepClone(chrome), controls: (controls ?? []).slice() };
    panels.update((list) =>
      list.map((p) => (p.id === context.id ? { ...p, ...data, modified: true } : p))
    );
  }
  isRestoring = false;
  lastSnapshot = snapshot;
}

/**
 * Push the current active context state onto the undo stack.
 * Called automatically via debounce, or manually before destructive actions.
 */
export function pushSnapshot() {
  if (isRestoring || suppressed) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;

  const context = activeContext();
  if (!context) return;

  const snapshot = snapshotOf(context);
  if (snapshot == null) return;

  // Skip if identical to last snapshot, or if there is no committed baseline yet.
  if (sameSnapshot(snapshot, lastSnapshot)) return;
  if (lastSnapshot == null) {
    lastSnapshot = snapshot;
    return;
  }

  const history = getHistory(contextKey(context));
  history.undoStack.push(lastSnapshot);

  // Cap undo stack size
  if (history.undoStack.length > MAX_HISTORY) {
    history.undoStack.shift();
  }

  // Clear redo stack on new action
  history.redoStack.length = 0;

  lastSnapshot = snapshot;
  updateAvailability();
}

/**
 * Schedule a snapshot after a debounce delay.
 * Groups rapid changes (drag, typing) into one snapshot.
 */
function scheduleSnapshot() {
  if (isRestoring || suppressed) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(pushSnapshot, 400);
}

/**
 * Stop (or resume) recording undo steps.
 *
 * Called around a preview run. Resuming re-baselines, so the next real edit is measured against
 * what is on screen now rather than against a preview state that has since been put back.
 */
export function setHistoryRecordingSuppressed(on) {
  const next = on === true;
  if (next === suppressed) return;
  suppressed = next;
  if (suppressed) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  } else {
    resetBaseline();
  }
}

/** Reset the committed baseline to the active context's current state. */
function resetBaseline() {
  if (isRestoring) return;
  lastSnapshot = snapshotOf(activeContext());
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
