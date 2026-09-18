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

import { derived, get } from 'svelte/store';
import { activePanel, updatePanel } from './panels.js';
import { controlSetForPanel, normalizeControlSet } from '../models/controlSets.js';

export { CONTROL_SET_CONTEXT_KEY } from '../models/controlSets.js';

export const activeControlSet = derived(activePanel, ($panel) => controlSetForPanel($panel));

/** Point the active panel at a set by id. An id this build does not know is kept as written. */
export function setActivePanelControlSet(id) {
  const panel = get(activePanel);
  if (!panel) return;
  updatePanel(panel.id, { controlSet: normalizeControlSet(id) });
}
