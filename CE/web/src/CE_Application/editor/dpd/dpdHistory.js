/**
 * Undo/redo wiring for the Device Profile Designer.
 *
 * The designer had no undo of any kind. `model` is a `$state` object that the
 * screens edit IN PLACE — they are handed the proxy, not a setter — and
 * stores/history.js only knew about panels and component documents, so Ctrl+Z
 * in a profile tab did nothing whatsoever, and in a panel/designer split it
 * quietly rewound the panel behind the designer instead. The registry in
 * stores/history.js exists so that is a wiring job out here; read the contract
 * above `registerHistoryContext()` before changing anything below.
 *
 * WHY THIS IS A MODULE AND NOT TEN LINES IN THE COMPONENT. Deciding what a
 * change to `model` MEANS is the whole job: an edit to record, a different
 * profile being opened (which undo must never be able to walk backwards
 * across), or history putting a state back — which arrives looking exactly like
 * an edit, because the effect watching the model runs after the restore has
 * finished, not during it. That is real logic, and .svelte files are compiled to
 * their SSR form in the test run, where no `$effect` ever runs. Logic left in
 * the component is logic no test can reach.
 */

import {
  registerHistoryContext,
  resetHistoryBaseline,
  scheduleSnapshot,
  markContextSaved,
  clearHistory,
} from '../../stores/history.js';

/** The `kind` half of the designer's history key. Also the editor tab's type. */
export const DPD_HISTORY_KIND = 'deviceProfile';

/**
 * Does the designer own Ctrl+Z at this moment?
 *
 * Two shapes, and the second is why this is not simply "am I mounted":
 *
 *   - The designer IS the workspace: a Device Profile tab is in front. Nothing
 *     competes for undo — `resolvePanelSelection` returns null for that tab, so
 *     the built-in panel fallback has nothing to offer either.
 *   - The designer is the COMPANION pane of a panel split (EditorCanvas's
 *     `splitDeviceProfileId`), where the active tab is the PANEL and the panel
 *     is what the user is mostly editing. A registered context that claims to be
 *     active outranks the panel fallback, so claiming undo unconditionally there
 *     would mean Ctrl+Z after a canvas drag rewound the profile instead of the
 *     drag. In that shape the designer claims undo only while the pointer or the
 *     keyboard focus is actually inside it.
 */
export function designerOwnsUndo({ activeTab, profileId, focusWithin } = {}) {
  if (activeTab?.type === DPD_HISTORY_KIND) {
    return String(activeTab.id ?? '') === String(profileId ?? '');
  }
  return focusWithin === true;
}

/**
 * Register one designer instance as an undo context.
 *
 *   id          keys the undo stack — the profile id, so two profiles never
 *               share a stack.
 *   isActive    see `designerOwnsUndo` above.
 *   applyModel  put a restored model back on screen. It receives the object
 *               history stored, so the designer must clone before editing it.
 *
 * The caller drives it by handing every state of the model to `observe()`.
 * Returns the handle the designer keeps for the life of the registration.
 */
export function createDeviceProfileHistory({ id, isActive, applyModel }) {
  // The plain (non-proxy) model as history last saw it, and its serialisation.
  // History compares snapshots by value and so does the dirty flag; keeping the
  // string means neither costs a second walk of the model.
  let current = null;
  let currentJson = null;
  // The state the profile was last opened in or last saved in. "Opened in"
  // counts because the designer has no dirty flag of its own to consult — clean
  // here means "nothing has been changed since this document appeared".
  let savedJson = null;
  // Is the next model to arrive a different DOCUMENT rather than an edit? True
  // to begin with: the first model a designer loads is the one it opened with,
  // and recording that as a step would let one Ctrl+Z blank a freshly opened
  // profile.
  let opening = true;

  const isDirty = () => currentJson != null && currentJson !== savedJson;

  const register = () => registerHistoryContext({
    kind: DPD_HISTORY_KIND,
    id,
    isActive,
    // Handing back the object `observe` was given, rather than taking another
    // copy: it is already a plain deep copy of the model, nothing else holds it,
    // and re-walking a 400 KB profile on every keystroke to produce a second
    // identical copy is exactly the cost the panel snapshots were rewritten to
    // avoid.
    snapshot: () => current,
    isClean: () => currentJson != null && currentJson === savedJson,
    restore: (snapshot) => {
      // Adopt the restored state as the one already seen BEFORE handing it over.
      // The effect that watches the model runs after the restore, not during it,
      // so history's own `isRestoring` guard has been lifted again by the time
      // it fires — without this the restore reads back as a fresh edit and undo
      // pushes the very state it just undid.
      current = snapshot;
      currentJson = snapshot == null ? null : JSON.stringify(snapshot);
      applyModel(snapshot);
    },
  });

  let unregister = register();

  return {
    /**
     * Report the model as it stands now; returns true when it differs from the
     * state it was opened or last saved in.
     *
     * Called from the effect that reads the model, so it fires once per edit,
     * however many fields deep in the tree that edit was made.
     */
    observe(model) {
      const json = model == null ? null : JSON.stringify(model);
      if (json === currentJson && !opening) return isDirty();

      // Arriving at — or leaving — "no profile at all" is not an edit either.
      // Neither is the first model after a profile switch. Both are a different
      // document, and undo must not be able to cross that boundary.
      const startsDocument = opening || currentJson == null || json == null;
      current = model;
      currentJson = json;

      if (startsDocument) {
        opening = false;
        savedJson = json;
        resetHistoryBaseline();
      } else {
        scheduleSnapshot();
      }
      return isDirty();
    },

    /**
     * The designer is about to swap in a different document — the engine's saved
     * source for this profile, say. Without this the swap looks like one very
     * large edit, and Ctrl+Z would hand back the model of a profile the user is
     * no longer looking at.
     */
    startsNewDocument() {
      opening = true;
      // Drop the stack the previous document built up. Skip this and its steps are still there
      // after the swap — one Ctrl+Z and the user is looking at a model they never opened.
      // `clearHistory({ kind, id })` is the registered-context form; the bare-id form only knows
      // the two built-in kinds and would silently clear nothing here.
      clearHistory({ kind: DPD_HISTORY_KIND, id });
    },

    /** The engine confirmed the save: this state is the one on disk now. */
    noteSaved() {
      if (currentJson == null) return;
      savedJson = currentJson;
      markContextSaved({ kind: DPD_HISTORY_KIND, id });
    },

    isDirty,

    /** Drop the registration (and with it this profile's undo stack). */
    dispose() {
      unregister();
    },
  };
}
