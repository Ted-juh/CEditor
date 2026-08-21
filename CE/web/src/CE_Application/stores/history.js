import { get, writable } from 'svelte/store';
import { deepClone } from '../utils/deepClone.js';
import { panels, resolvedActivePanelId, activeEditorTab, selectedComponentIds } from './panels.js';
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

// Per-context history: Map<contextKey, { undoStack: [], redoStack: [] }>.
// Stack entries are { snapshot, selection } — the captured state plus the
// selection that went with it, so undoing a delete re-selects what came back.
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
let lastSelection = [];
// Which context the committed baseline describes. A snapshot may only be
// pushed against a baseline of the SAME context — otherwise a flush racing a
// context switch would push one document's old state onto another's stack.
let baselineKey = null;
// Context the pending debounce belongs to. A tab switch flushes this before
// re-baselining — otherwise an edit made within the debounce window of a
// switch was silently erased from history.
let pendingContext = null;

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
 *
 * Base64 asset payloads (background image/texture, viewer images) are still
 * excluded: they would bloat the chrome comparison, and old snapshots would pin
 * replaced payloads in memory. Undo therefore does not revert those payloads —
 * restore keeps whatever asset is currently loaded.
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
  const { id, modified, bgImage, bgTexture, viewer, ...data } = panel;
  // The array is copied so a stray in-place push cannot reach back into history; its ELEMENTS are
  // shared, which is the whole point.
  return { ...data, controls: Array.isArray(data.controls) ? data.controls.slice() : data.controls };
}

/** Selection ids as a plain array, captured alongside panel snapshots. */
function selectionOf(context) {
  if (context?.kind !== 'panel') return [];
  return [...get(selectedComponentIds)];
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

function restoreSnapshot(context, entry) {
  const snapshot = entry?.snapshot;
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
      // Spread order keeps the excluded asset fields (bgImage/bgTexture/viewer)
      // from the live panel — they are not part of the snapshot.
      list.map((p) => (p.id === context.id ? { ...p, ...data, modified: true } : p))
    );
    // Restore the selection that went with this state, so undoing a delete
    // hands the control back selected instead of blanking the properties view.
    if (Array.isArray(entry.selection)) {
      selectedComponentIds.set(new Set(entry.selection));
    }
  }
  isRestoring = false;
  lastSnapshot = snapshot;
  lastSelection = Array.isArray(entry.selection) ? entry.selection : [];
  baselineKey = contextKey(context);
}

function commitSnapshot(context) {
  if (isRestoring || suppressed) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingContext = null;

  if (!context) return;

  const snapshot = snapshotOf(context);
  if (snapshot == null) return;

  // Skip if identical to last snapshot, or if there is no committed baseline
  // yet. A baseline from a different context can't be diffed against — it
  // becomes the new baseline instead of a bogus undo entry.
  if (baselineKey === contextKey(context) && sameSnapshot(snapshot, lastSnapshot)) return;
  if (lastSnapshot == null || baselineKey !== contextKey(context)) {
    lastSnapshot = snapshot;
    lastSelection = selectionOf(context);
    baselineKey = contextKey(context);
    return;
  }

  const history = getHistory(contextKey(context));
  history.undoStack.push({ snapshot: lastSnapshot, selection: lastSelection });

  // Cap undo stack size
  if (history.undoStack.length > MAX_HISTORY) {
    history.undoStack.shift();
  }

  // Clear redo stack on new action
  history.redoStack.length = 0;

  lastSnapshot = snapshot;
  lastSelection = selectionOf(context);
  updateAvailability();
}

/**
 * Push the current active context state onto the undo stack.
 * Called automatically via debounce, or manually at gesture boundaries
 * (drag/resize/rotate end) so one gesture is exactly one undo step.
 */
export function pushSnapshot() {
  commitSnapshot(activeContext());
}

/** Flush a snapshot that is still waiting on the debounce timer. */
function flushPendingSnapshot() {
  if (!debounceTimer) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;
  const context = pendingContext ?? activeContext();
  pendingContext = null;
  commitSnapshot(context);
}

/**
 * Schedule a snapshot after a debounce delay.
 * Groups rapid changes (drag, typing) into one snapshot.
 */
function scheduleSnapshot() {
  if (isRestoring || suppressed) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  pendingContext = activeContext();
  debounceTimer = setTimeout(() => {
    const context = pendingContext ?? activeContext();
    pendingContext = null;
    commitSnapshot(context);
  }, 400);
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

/** Reset the committed baseline to the active context's current state.
 *  Flushes any snapshot still waiting on the debounce first — it belongs to
 *  the context being left, and dropping it erased the last pre-switch edit
 *  from history. */
function resetBaseline() {
  if (isRestoring) return;
  flushPendingSnapshot();
  const context = activeContext();
  lastSnapshot = snapshotOf(context);
  lastSelection = selectionOf(context);
  baselineKey = context ? contextKey(context) : null;
  updateAvailability();
}

/**
 * Undo the last action on the active context.
 */
export function undo() {
  // Flush any pending debounced snapshot first
  flushPendingSnapshot();

  const context = activeContext();
  if (!context) return;

  const history = getHistory(contextKey(context));
  if (history.undoStack.length === 0) return;

  // Save current state to redo
  const current = snapshotOf(context);
  if (current == null) return;
  history.redoStack.push({ snapshot: current, selection: selectionOf(context) });

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
  history.undoStack.push({ snapshot: current, selection: selectionOf(context) });

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
let historyInited = false;

export function initHistory() {
  // Capture initial state of whatever context is active.
  resetBaseline();

  // Subscriptions are registered once; repeated init calls (tests, hot
  // reload) only re-baseline instead of stacking duplicate subscribers.
  if (historyInited) return;
  historyInited = true;

  // Keep the baseline's selection current while the document itself is
  // unchanged, so an undo entry pairs each state with the selection the user
  // had in it. Skipped while an edit is pending — a delete clears the
  // selection as part of the gesture, and the entry must keep the PRE-edit
  // selection to hand back on undo.
  selectedComponentIds.subscribe((ids) => {
    if (isRestoring || suppressed || debounceTimer) return;
    lastSelection = [...ids];
  });

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

  // Garbage-collect stacks for closed documents. Self-contained (no import
  // from the close paths, which would be circular): a context whose document
  // no longer exists can never be undone into again, yet its snapshots used
  // to pin memory for the whole session.
  panels.subscribe((list) => {
    const alive = new Set(list.map((p) => `panel:${p.id}`));
    for (const key of historyMap.keys()) {
      if (key.startsWith('panel:') && !alive.has(key)) historyMap.delete(key);
    }
  });
  componentDocuments.subscribe((list) => {
    const alive = new Set(list.map((doc) => `component:${doc.id}`));
    for (const key of historyMap.keys()) {
      if (key.startsWith('component:') && !alive.has(key)) historyMap.delete(key);
    }
  });
}

/**
 * Clear history for a specific id (e.g., on panel or document close).
 */
export function clearHistory(id) {
  historyMap.delete(`panel:${id}`);
  historyMap.delete(`component:${id}`);
}
