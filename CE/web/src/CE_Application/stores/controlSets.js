// The active panel's control set, as a store, and the one action that changes it.
//
// The set itself is a property of the panel document (`panel.controlSet`, see
// models/controlSets.js), so there is nothing to persist here: this store is a view of the active
// panel for the components that render or inspect colours — CanvasControl resolves references
// against it, the swatches in BackgroundEditor / TextEditor show the colour it gives, and the
// panel card's picker writes through `setActivePanelControlSet`.
//
// The preview surface does NOT read this store. It renders whatever panel it is handed — in the
// Player that is a document the editor's panel list has never seen — so it puts its own panel's
// set into Svelte context under CONTROL_SET_CONTEXT_KEY and CanvasControl prefers that when
// present. One key, two providers, and the editor's canvas and the player agree on what a panel
// looks like.
//
// Where the set comes from: the document's own sets first, then the user's library
// (stores/controlSetLibrary.js), then the built-ins. Choosing a library set copies it into the
// document, so the Player and the build — which have no library — find it there.

import { derived, get, writable } from 'svelte/store';
import { activePanel, panels, updatePanel } from './panels.js';
import { controlSetLibrary, carryControlSetInDocument } from './controlSetLibrary.js';
import { DEFAULT_CONTROL_SET_ID, controlSetForPanel, getControlSet, normalizeControlSet } from '../models/controlSets.js';
import { applyControlSetChoices } from '../utils/controlSetApply.js';
import { DEFAULT_PANEL_COLOUR } from '../utils/backgroundCSS.js';

export { CONTROL_SET_CONTEXT_KEY, CONTROL_SET_LAMP_CONTEXT_KEY } from '../models/controlSets.js';

export const activeControlSet = derived(
  [activePanel, controlSetLibrary],
  ([$panel, $library]) => controlSetForPanel($panel, $library),
);

/**
 * Point the active panel at a set by id. A library set is copied into the document as it is
 * chosen; a built-in is not (every build has it). An id this build does not know is kept as
 * written, so a file that names a set the reader lacks still says which one it wanted.
 */
export function setActivePanelControlSet(id) {
  const panel = get(activePanel);
  if (!panel) return;
  const normalized = normalizeControlSet(id);
  const inDocument = getControlSet(normalized.id, { document: panel.controlSets });
  if (!inDocument) {
    const fromLibrary = getControlSet(normalized.id, { library: get(controlSetLibrary) });
    // Only a library set needs carrying: getControlSet falls through to the built-ins, so a
    // built-in id resolves here too and must not be copied into every file that picks it.
    if (fromLibrary && get(controlSetLibrary).some((set) => set.id === fromLibrary.id)) {
      carryControlSetInDocument(fromLibrary);
    }
  }
  updatePanel(panel.id, { controlSet: normalized });
}

/** Set a known panel's visual language, including while the Settings tab is in front. */
export function setPanelControlSet(panelId, id) {
  const panel = get(panels).find((entry) => entry.id === panelId);
  if (!panel) return false;
  const normalized = normalizeControlSet(id);
  const librarySet = get(controlSetLibrary).find((set) => set.id === normalized.id);
  const carried = librarySet
    ? [librarySet, ...(panel.controlSets ?? []).filter((set) => set.id !== librarySet.id)]
    : panel.controlSets;
  updatePanel(panel.id, { controlSet: normalized, controlSets: carried });
  return true;
}

/**
 * The Apply window (layout/ApplyControlSetDialog.svelte): `{ panelId, setId }` while it is open.
 * Every place a set is applied asks through here, so the choice of what changes is offered once,
 * the same everywhere: Settings › Control Sets, its template gallery and the panel's own Set.
 */
export const controlSetApplyRequest = writable(null);

export function requestControlSetApply(setId, panelId = get(activePanel)?.id) {
  if (!panelId || !setId) return false;
  controlSetApplyRequest.set({ panelId, setId: String(setId) });
  return true;
}

/**
 * Apply `setId` to the panel as chosen (utils/controlSetApply.js): one store write, one undo step.
 * A library set is carried into the document, as choosing it always did.
 */
export function applyControlSetWithChoices(panelId, setId, choices = {}) {
  const panel = get(panels).find((entry) => entry.id === panelId);
  if (!panel) return false;
  const library = get(controlSetLibrary);
  const newRef = normalizeControlSet(setId);
  const librarySet = library.find((set) => set.id === newRef.id);
  const oldSetId = String(panel.controlSet?.id ?? DEFAULT_CONTROL_SET_ID);
  const oldSet = getControlSet(oldSetId, { document: panel.controlSets, library });
  const newSet = getControlSet(newRef.id, { document: panel.controlSets, library });
  const applied = applyControlSetChoices(panel, newRef, choices, { oldSetId, oldSet, newSet, defaultPanelColour: DEFAULT_PANEL_COLOUR });
  const controlSets = librarySet
    ? [librarySet, ...(panel.controlSets ?? []).filter((set) => set.id !== librarySet.id)]
    : panel.controlSets;
  // The old set stays in the document while a control is pinned to it, so a library set pinned
  // here still resolves where the library is not (the Player, the build).
  const oldLibrarySet = library.find((set) => set.id === oldSetId);
  const carried = oldLibrarySet && !(controlSets ?? []).some((set) => set.id === oldSetId)
    ? [...(controlSets ?? []), oldLibrarySet]
    : controlSets;
  const { id: _id, ...patch } = { ...applied, controlSets: carried };
  // updatePanel merges, so a field the choices took away has to be written as gone.
  for (const key of ['bgFollowsSet', 'surfaceMaterial']) if (!(key in patch)) patch[key] = undefined;
  updatePanel(panel.id, patch);
  return true;
}
