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
 * There are two BUILT-IN editing contexts that share the same undo/redo entry
 * points (global Ctrl+Z/Y, the menu, and the toolbar):
 *   - `panel`     — the active panel in the `panels` store.
 *   - `component` — the active custom-component document in the component
 *                   workspace (`componentDocuments`), shown when the workspace
 *                   is in `surface` mode.
 *
 * Any other workspace can join by calling `registerHistoryContext()` — see the
 * contract above that function. The Device Profile Designer and Settings had no
 * undo at all because this file only knew about panels and components; the
 * registry exists so that is a wiring job in the workspace, not another special
 * case in here.
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
const DEBOUNCE_MS = 400;

// Per-context history: Map<contextKey, { undoStack: [], redoStack: [] }>.
// Stack entries are { snapshot, selection } — the captured state plus the
// selection that went with it, so undoing a delete re-selects what came back.
const historyMap = new Map();
// Per-context marker of the state the document was last SAVED (or freshly
// opened) in. Restore compares against this instead of hardcoding
// `modified: true`, which is why undoing back to the saved state now clears the
// dirty dot instead of leaving it stuck on forever.
const savedMarkers = new Map();
// Contexts registered by other workspaces: Map<contextKey, registration>.
const registeredContexts = new Map();
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
// The state as it stood when the pending change landed, and the selection that
// went with it. Held because a mid-window flush has to commit THAT state, not
// whatever is in the store by the time the flush is triggered — committing the
// live state would fold the change that triggered the flush into the step being
// flushed, which is exactly the merging this is here to stop.
let pendingSnapshot = null;
let pendingSelection = null;
// Tag identifying the pending change. See scheduleSnapshot().
let pendingTag = null;
// A tag supplied by a caller for the change it is about to make. Consumed by
// whatever scheduleSnapshot calls land in the same task, then dropped.
let explicitTag = null;

/**
 * Grouping guard for one logical edit that writes to the store more than once.
 *
 * The trap: nudging a three-control selection calls `updateControlProperty`
 * three times, so the store fires three notifications and the changed-control
 * set grows {A}, {A,B}, {A,B,C}. Tag those three apart and one arrow press
 * becomes three undo steps — worse than the merging this replaced. So changes
 * that arrive in the same synchronous burst are always one group, whatever
 * their tags say.
 *
 * `burstOpen` covers the synchronous case exactly (a microtask cannot run until
 * the loop finishes). The 20 ms grace covers the same loop written with an
 * `await` in the middle, and is far below the shortest gap two separate human
 * edits can have.
 */
const BURST_GRACE_MS = 20;
let burstOpen = false;
let lastChangeAt = 0;

function sameBurst() {
  const now = Date.now();
  const continuous = burstOpen || (lastChangeAt !== 0 && now - lastChangeAt < BURST_GRACE_MS);
  lastChangeAt = now;
  if (!burstOpen) {
    burstOpen = true;
    queueMicrotask(() => {
      burstOpen = false;
    });
  }
  return continuous;
}

/**
 * Register an editing context so a workspace outside panels/components gets
 * undo. THE CONTRACT, because getting it wrong is silent:
 *
 *   kind      Required. A short string naming the workspace, e.g.
 *             'deviceProfile' or 'settings'. `panel` and `component` are
 *             reserved for the built-ins and are rejected.
 *   id        Required. Identifies the document within that kind. `kind:id`
 *             keys the undo stack, so two profile tabs keep separate stacks.
 *   isActive  Required. `() => boolean` — true when this context has the
 *             editing focus. A registered context that says it is active WINS
 *             over the built-in panel fallback, which is the point: the panel
 *             fallback always resolves to *something*, so without this the
 *             profile designer's edits would be recorded against whatever panel
 *             sits behind it.
 *   snapshot  Required. `() => object|null` returning the state to remember.
 *             Must be a plain JSON-serialisable object — history compares
 *             snapshots by value with JSON.stringify and never looks inside.
 *             Return null when there is nothing to capture.
 *             Follow the same rule the panel snapshots rest on: never mutate
 *             anything a snapshot still points at. Share what is immutable,
 *             copy what is not.
 *   restore   Required. `(snapshot, meta) => void` putting a snapshot back.
 *             `meta.selection` is whatever `selection()` returned when the
 *             snapshot was taken; `meta.modified` is false when the restored
 *             state matches the last saved marker, so the workspace can clear
 *             its own dirty flag instead of guessing. History hands back the
 *             object it stored — clone it if the workspace will edit in place.
 *   selection Optional. `() => string[]` captured alongside each snapshot and
 *             handed back through `meta.selection`.
 *   isClean   Optional. `() => boolean` — true when the document is in its
 *             saved state. History adopts a saved marker whenever this says
 *             clean, so `meta.modified` can be trusted without a save hook.
 *
 * The workspace must also call `scheduleSnapshot(tag)` after each mutation (or
 * `pushSnapshot()` at a gesture boundary) — nothing here subscribes to a store
 * it does not own.
 *
 * Returns a function that unregisters again.
 */
export function registerHistoryContext(registration) {
  const { kind, id, snapshot, restore, isActive, selection, isClean } = registration ?? {};
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new TypeError('registerHistoryContext: kind must be a non-empty string');
  }
  if (kind === 'panel' || kind === 'component') {
    throw new TypeError(`registerHistoryContext: "${kind}" is reserved for the built-in context`);
  }
  if (id == null) throw new TypeError('registerHistoryContext: id is required');
  for (const [name, fn] of [['snapshot', snapshot], ['restore', restore], ['isActive', isActive]]) {
    if (typeof fn !== 'function') {
      throw new TypeError(`registerHistoryContext: ${name} must be a function`);
    }
  }
  const key = `${kind}:${id}`;
  registeredContexts.set(key, { kind, id, snapshot, restore, isActive, selection, isClean });
  // Registering may have changed which context is active (a profile tab that
  // registers on mount is already focused), so re-baseline rather than measure
  // its first edit against the panel that was active a moment ago.
  resetBaseline();
  return () => unregisterHistoryContext(kind, id);
}

/** Drop a registered context and everything remembered for it. */
export function unregisterHistoryContext(kind, id) {
  const key = `${kind}:${id}`;
  if (!registeredContexts.delete(key)) return;
  historyMap.delete(key);
  savedMarkers.delete(key);
  resetBaseline();
}

/**
 * Resolve which editing context is currently active. A registered context that
 * reports itself active takes precedence; then the component workspace when it
 * is open with a valid active document; otherwise the active panel. Returns
 * null when nothing editable is focused.
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
  for (const entry of registeredContexts.values()) {
    let active = false;
    try {
      active = entry.isActive() === true;
    } catch {
      // A workspace with a throwing predicate must not take undo down with it
      // for every other workspace as well.
      active = false;
    }
    if (active) return { kind: entry.kind, id: entry.id, registered: entry };
  }

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

/** Accept `{kind,id}`, a bare panel id, or nothing (meaning: whatever is active). */
function normaliseContext(context) {
  if (context == null) return activeContext();
  if (typeof context === 'number') return { kind: 'panel', id: context };
  if (typeof context !== 'object') return null;
  if (context.registered) return context;
  const kind = context.kind ?? 'panel';
  if (context.id == null) return null;
  const registered = registeredContexts.get(`${kind}:${context.id}`);
  return registered ? { kind, id: context.id, registered } : { kind, id: context.id };
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
  if (context.registered) {
    let snapshot = null;
    try {
      snapshot = context.registered.snapshot();
    } catch {
      return null;
    }
    return snapshot ?? null;
  }
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
  if (context?.registered) {
    let selection = null;
    try {
      selection = context.registered.selection?.();
    } catch {
      selection = null;
    }
    return Array.isArray(selection) ? [...selection] : [];
  }
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
function sameSnapshot(a, b, context) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // A registered snapshot is opaque to history: compared, and only compared, by
  // value. That is why the contract insists it be JSON-serialisable.
  if (context?.registered) return JSON.stringify(a) === JSON.stringify(b);
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

/** Top-level keys whose value differs, ignoring the control tree. */
function changedTopLevelKeys(a, b, skip) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out = [];
  for (const key of keys) {
    if (skip?.has(key)) continue;
    if (a?.[key] === b?.[key]) continue;
    if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) out.push(key);
  }
  out.sort();
  return out;
}

const TREE_KEYS = new Set(['controls', 'control']);
// Beyond this many changed controls the tag stops naming them individually.
// A bulk edit that big is a command, and commands push their own snapshot.
const TAG_ID_CAP = 32;

/** Sorted, capped, and appended — so the same set of controls always reads the same. */
function pushIdPart(parts, ids) {
  if (ids.length === 0) return;
  ids.sort();
  if (ids.length > TAG_ID_CAP) parts.push(`n${ids.length}:${ids.slice(0, TAG_ID_CAP).join(',')}`);
  else parts.push(ids.join(','));
}

const controlId = (control, fallback) => control?._children?.Core?.id ?? fallback;

/**
 * A short string naming WHAT this change touched, used to decide whether the
 * change belongs with the one already waiting on the debounce.
 *
 * Same tag inside the window coalesces — that is the point of the debounce, and
 * a drag, a scrub or a held arrow key must stay one undo step. A different tag
 * flushes first, so two unrelated edits 100 ms apart stop collapsing into one.
 *
 * Derived against the committed baseline rather than the previous notification,
 * so a gesture that keeps editing the same controls keeps the same tag however
 * many frames it runs for.
 */
function changeTagFor(context, snapshot) {
  const key = contextKey(context);
  if (snapshot == null || lastSnapshot == null || baselineKey !== key) return `${key}|initial`;
  const prev = lastSnapshot;
  const parts = [];

  if (context.registered) {
    for (const field of changedTopLevelKeys(prev, snapshot, null)) parts.push(`@${field}`);
  } else {
    for (const field of changedTopLevelKeys(prev, snapshot, TREE_KEYS)) parts.push(`@${field}`);
    if (snapshot.control || prev.control) {
      if (snapshot.control !== prev.control) parts.push('control');
    } else {
      const left = prev.controls ?? [];
      const right = snapshot.controls ?? [];
      if (left.length === right.length) {
        // The common case, and the cheap one: positions line up, so a pointer
        // compare per control finds what moved.
        const ids = [];
        for (let i = 0; i < right.length; i++) {
          if (left[i] === right[i]) continue;
          ids.push(controlId(right[i], `#${i}`));
        }
        pushIdPart(parts, ids);
      } else {
        // Add or delete: positions no longer line up, so diff by id. Tagging
        // this `len:N` instead read fine until an insert was followed by a
        // move — the length stays different from the baseline either way, so
        // both derived the same tag and merged back into one undo step.
        const leftById = new Map();
        for (let i = 0; i < left.length; i++) leftById.set(controlId(left[i], `#L${i}`), left[i]);
        const ids = [];
        const seen = new Set();
        for (let i = 0; i < right.length; i++) {
          const id = controlId(right[i], `#R${i}`);
          seen.add(id);
          if (!leftById.has(id)) ids.push(`+${id}`);
          else if (leftById.get(id) !== right[i]) ids.push(id);
        }
        for (const id of leftById.keys()) if (!seen.has(id)) ids.push(`-${id}`);
        pushIdPart(parts, ids);
      }
    }
  }

  return parts.length > 0 ? `${key}|${parts.join('|')}` : `${key}|none`;
}

/** Is the document currently claiming to be in its saved state? */
function documentIsClean(context) {
  if (!context) return false;
  if (context.registered) {
    try {
      return context.registered.isClean?.() === true;
    } catch {
      return false;
    }
  }
  if (context.kind === 'component') {
    const doc = get(componentDocuments).find((entry) => entry.id === context.id);
    return doc ? doc.modified !== true : false;
  }
  const panel = get(panels).find((p) => p.id === context.id);
  return panel ? panel.modified !== true : false;
}

/**
 * Remember this state as the saved one, if the document says it is clean.
 *
 * Every save and open path already clears `modified`, so observing the flag
 * keeps the marker current without those paths having to know history exists.
 * `markContextSaved()` stays the explicit hook for anything that saves without
 * routing the clean flag through the store.
 */
function noteCleanState(context, snapshot) {
  if (snapshot == null || !context) return;
  if (documentIsClean(context)) savedMarkers.set(contextKey(context), snapshot);
}

/**
 * Record the current state of a context as its saved baseline.
 *
 * Call this from a save or open path: undo compares against this marker to
 * decide whether the restored state is dirty, so without it undoing back to the
 * saved state leaves the dirty dot on. Accepts `{kind, id}`, a bare panel id,
 * or nothing for whatever context is active.
 */
export function markContextSaved(context) {
  const target = normaliseContext(context);
  if (!target) return;
  const snapshot = snapshotOf(target);
  if (snapshot == null) return;
  savedMarkers.set(contextKey(target), snapshot);
}

/** `markContextSaved()` for the active context — the readable form at a save site. */
export function markSavedBaseline() {
  markContextSaved();
}

/** Forget a context's saved marker: after this, every restore reads as dirty. */
export function clearSavedBaseline(context) {
  const target = normaliseContext(context);
  if (!target) return;
  savedMarkers.delete(contextKey(target));
}

function restoreSnapshot(context, entry) {
  const snapshot = entry?.snapshot;
  if (snapshot == null) return;

  // Dirty flag by comparison, not by assumption. This used to be a hardcoded
  // `modified: true`, so undoing all the way back to the last save still showed
  // an unsaved-changes dot and the Save prompt still fired on close. No marker
  // means we have never seen this document in a saved state and cannot prove
  // the restore lands on one — stay dirty, which is what it always did.
  //
  // The excluded asset payloads (bgImage/bgTexture/viewer) are outside the
  // comparison as well as outside undo: swap a background image and undo an
  // unrelated edit and this reads clean. Undo could not have reverted the image
  // anyway, so claiming dirty over it would be no more honest.
  const marker = savedMarkers.get(contextKey(context));
  const modified = marker == null ? true : !sameSnapshot(snapshot, marker, context);
  const selection = Array.isArray(entry.selection) ? entry.selection : [];

  isRestoring = true;
  try {
    if (context.registered) {
      context.registered.restore(snapshot, { selection, modified });
    } else if (context.kind === 'component') {
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
            modified,
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
        list.map((p) => (p.id === context.id ? { ...p, ...data, modified } : p))
      );
      // Restore the selection that went with this state, so undoing a delete
      // hands the control back selected instead of blanking the properties view.
      if (Array.isArray(entry.selection)) {
        selectedComponentIds.set(new Set(entry.selection));
      }
    }
  } finally {
    // A throwing restore must not leave recording wedged off for the session.
    isRestoring = false;
  }

  lastSnapshot = snapshot;
  lastSelection = selection;
  baselineKey = contextKey(context);
}

/** Drop whatever is waiting on the debounce without committing it. */
function clearPending() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingContext = null;
  pendingSnapshot = null;
  pendingSelection = null;
  pendingTag = null;
  lastChangeAt = 0;
}

function commitSnapshot(context, snapshotOverride, selectionOverride) {
  if (isRestoring || suppressed) return;
  clearPending();

  if (!context) return;

  const snapshot = snapshotOverride ?? snapshotOf(context);
  if (snapshot == null) return;
  const selection = selectionOverride ?? selectionOf(context);

  // A state the document calls clean IS the saved state, whoever put it there.
  noteCleanState(context, snapshot);

  // Skip if identical to last snapshot, or if there is no committed baseline
  // yet. A baseline from a different context can't be diffed against — it
  // becomes the new baseline instead of a bogus undo entry.
  if (baselineKey === contextKey(context) && sameSnapshot(snapshot, lastSnapshot, context)) return;
  if (lastSnapshot == null || baselineKey !== contextKey(context)) {
    lastSnapshot = snapshot;
    lastSelection = selection;
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
  lastSelection = selection;
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
  const context = pendingContext ?? activeContext();
  const snapshot = pendingSnapshot;
  const selection = pendingSelection;
  clearPending();
  commitSnapshot(context, snapshot, selection);
}

/**
 * Commit whatever the debounce is still holding, right now.
 *
 * The one that matters: a HELD arrow key. Every repeat resets the 400 ms timer,
 * so a key held for two seconds emitted no snapshot at all until it was let go
 * — and if the user clicked away first, the whole nudge vanished from history.
 * Call this on keyup and the nudge becomes exactly one undo step, ending where
 * the key was released.
 *
 * A no-op when nothing is pending, so it is safe on every keyup.
 */
export function flushHistory() {
  flushPendingSnapshot();
}

/**
 * Tag the change this caller is about to make.
 *
 * Only needed where the derived tag cannot tell two edits apart because they
 * touch the same controls — nudging left and then nudging up, say. Both move
 * one control, so they derive the same tag and merge; tag them
 * `nudge:x:-1` / `nudge:y:-1` and they are two undo steps.
 *
 * The tag applies to the store writes made in the same task and is then
 * dropped, so an unrelated edit later never inherits it.
 */
export function tagNextChange(tag) {
  if (tag == null) return;
  explicitTag = String(tag);
  queueMicrotask(() => {
    explicitTag = null;
  });
}

/**
 * Schedule a snapshot after a debounce delay.
 *
 * Groups rapid changes (drag, typing) into one snapshot — but only rapid
 * changes that are the SAME change. A change whose tag differs from the pending
 * one commits the pending state first, so the two land as two undo steps
 * instead of merging. Registered contexts call this themselves after each
 * mutation; the built-in contexts get it from the store subscriptions below.
 */
export function scheduleSnapshot(tag) {
  if (isRestoring || suppressed) return;
  const context = activeContext();
  let snapshot = snapshotOf(context);
  let nextTag = tag ?? explicitTag ?? (context ? changeTagFor(context, snapshot) : null);
  const continuous = sameBurst();

  if (debounceTimer && !continuous && pendingTag != null && nextTag !== pendingTag) {
    const flushContext = pendingContext ?? context;
    const flushSnapshot = pendingSnapshot;
    const flushSelection = pendingSelection;
    clearPending();
    commitSnapshot(flushContext, flushSnapshot, flushSelection);
    // The baseline moved, so the tag has to be derived against the new one or
    // the next change would be compared with a tag from a vanished baseline.
    snapshot = snapshotOf(context);
    nextTag = tag ?? explicitTag ?? (context ? changeTagFor(context, snapshot) : null);
    lastChangeAt = Date.now();
  } else if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Captured once per group, not once per notification: copying the selection
  // set on every frame of a 400-control drag is real work for a value that does
  // not move during a gesture anyway.
  const nextKey = context ? contextKey(context) : null;
  const heldKey = pendingContext ? contextKey(pendingContext) : null;
  if (pendingSelection == null || heldKey !== nextKey) {
    pendingSelection = selectionOf(context);
  }
  pendingContext = context;
  pendingSnapshot = snapshot;
  pendingTag = nextTag;
  debounceTimer = setTimeout(() => {
    const flushContext = pendingContext ?? activeContext();
    const flushSnapshot = pendingSnapshot;
    const flushSelection = pendingSelection;
    clearPending();
    commitSnapshot(flushContext, flushSnapshot, flushSelection);
  }, DEBOUNCE_MS);
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
    clearPending();
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
  explicitTag = null;
  lastChangeAt = 0;
  const context = activeContext();
  lastSnapshot = snapshotOf(context);
  lastSelection = selectionOf(context);
  baselineKey = context ? contextKey(context) : null;
  // Opening or switching to a document that reports itself unmodified is the
  // other place a saved marker comes from, so a freshly opened file gets one
  // without the open path having to call markContextSaved().
  noteCleanState(context, lastSnapshot);
  updateAvailability();
}

/** Re-baseline against whatever is active now. Registered workspaces call this
 *  when their tab gains focus, so the first edit after the switch is measured
 *  against the right document. */
export function resetHistoryBaseline() {
  resetBaseline();
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
    for (const key of savedMarkers.keys()) {
      if (key.startsWith('panel:') && !alive.has(key)) savedMarkers.delete(key);
    }
  });
  componentDocuments.subscribe((list) => {
    const alive = new Set(list.map((doc) => `component:${doc.id}`));
    for (const key of historyMap.keys()) {
      if (key.startsWith('component:') && !alive.has(key)) historyMap.delete(key);
    }
    for (const key of savedMarkers.keys()) {
      if (key.startsWith('component:') && !alive.has(key)) savedMarkers.delete(key);
    }
  });
}

/**
 * Clear history for a specific document (e.g. on panel or document close).
 *
 * Two call shapes, because there are two kinds of caller. A bare id is the old one and stays
 * kind-agnostic: panel and component ids come from different generators and never collide, so
 * dropping both keys is correct and saves every close path from having to say which it is.
 * `{ kind, id }` is for a registered context (see registerHistoryContext) — those pick their own
 * kind, so there is no set of keys to guess at, and without this form a workspace could only
 * clear its stack by unregistering and registering again.
 */
export function clearHistory(target) {
  const drop = (key) => { historyMap.delete(key); savedMarkers.delete(key); };

  if (target && typeof target === 'object') {
    const { kind, id } = target;
    if (kind) drop(`${kind}:${id}`);
    return;
  }

  drop(`panel:${target}`);
  drop(`component:${target}`);
}
