// setFromControl.js — Apply to Set and Edit on Panel (docs/design/changeable-control-sets.md,
// piece C; models/setFromControl.js says what applying means).
//
// Apply to Set writes a control's overrides into its set's family for its type. A set of your own
// is changed where it lives: the library, and the copy the panel carries (the panel's copy wins
// when a set is looked up, so both must change). A built-in set is never changed: a copy of it,
// named by the author, takes the change, goes into the library and the panel, and the panel (or
// the control, where it was given a set of its own) moves to it. The control hands the applied
// looks back to the set and follows it again. The panel changes in one write, one undo step; the
// library, as ever, is not part of a document's history.
//
// Edit on Panel starts from the set instead: it places one of the family's controls on the open
// panel, drawn with the set, selected, and remembers it (`setEditSession`), so a banner can offer
// Apply to Set for it, or Cancel, which takes it away.

import { get, writable } from 'svelte/store';
import { activePanel, activePanelId, panels, selectComponent, setActivePanel } from './panels.js';
import { controlSetLibrary, duplicateControlSet, updateControlSetInLibrary } from './controlSetLibrary.js';
import { addControl, removeControl } from './controls.js';
import { applyPatchObject } from './controlTreeUtils.js';
import { mutatePanelControlsInList, updatePanelInList } from './panelDocumentHelpers.js';
import { BUILT_IN_CONTROL_SETS, controlSetForPanel, normalizeControlSet } from '../models/controlSets.js';
import { resetToSetPatch, setOwnership } from '../models/controlSetOwnership.js';
import { applyReach, controlOverrides, familyPatchFromControl, setWithFamilyPatch } from '../models/setFromControl.js';
import { findControlById, flatControls } from '../utils/containment.js';
import { deepClone } from '../utils/deepClone.js';

/** The Apply to Set window (layout/ApplyToSetDialog.svelte): `{ panelId, controlId, paths }` while open. */
export const applyToSetRequest = writable(null);

/** Edit on Panel: `{ panelId, controlId, setId, type }` while a family's control is placed to style. */
export const setEditSession = writable(null);

function panelById(panelId) {
  return get(panels).find((entry) => entry.id === (panelId ?? get(activePanel)?.id ?? get(activePanelId))) ?? null;
}

function contextOf(panel) {
  const library = get(controlSetLibrary);
  return { library, panelSet: controlSetForPanel(panel, library), sources: { document: panel?.controlSets ?? [], library } };
}

const isBuiltIn = (id) => BUILT_IN_CONTROL_SETS.some((set) => set.id === id);

/** Open the Apply to Set window for a control: all its overrides, or `paths` of them ticked. */
export function requestApplyToSet(controlId, paths = null, panelId = null) {
  const panel = panelById(panelId);
  if (!panel || !controlId) return false;
  applyToSetRequest.set({ panelId: panel.id, controlId, paths: paths ? [...paths] : null });
  return true;
}

/**
 * What the Apply to Set window shows for a control: its overrides, its set, whether that set is
 * built in (and so copied), and for a choice of paths, how far the change reaches on the panel.
 */
export function applyToSetPreview(controlId, panelId = null) {
  const panel = panelById(panelId);
  const control = panel ? findControlById(panel.controls, controlId) : null;
  if (!control?._children?.Core) return null;
  const { panelSet, sources } = contextOf(panel);
  const { set, entries } = controlOverrides(control, panelSet, sources);
  const library = get(controlSetLibrary);
  const own = library.some((entry) => entry.id === set?.id) || (panel.controlSets ?? []).some((entry) => entry.id === set?.id);
  const others = flatControls(panel.controls);
  return {
    panel,
    control,
    set,
    entries,
    builtIn: !own,
    copyName: `${set?.name ?? 'Control Set'} Copy`,
    type: String(control._children.Core.controlType ?? ''),
    reach: (paths) => applyReach(control, paths, others, {
      setId: set?.id,
      ownershipOf: (other) => setOwnership(other, panelSet, sources),
    }),
  };
}

/**
 * Apply `paths` of the control's overrides to its set's family (see the top of the file). Returns
 * `{ setId, copied }`, or null when there is nothing to apply.
 */
export function applyLookToSet(controlId, paths, { panelId = null, copyName = '' } = {}) {
  const panel = panelById(panelId);
  const control = panel ? findControlById(panel.controls, controlId) : null;
  if (!control?._children?.Core || !paths?.length) return null;
  const { panelSet, sources, library } = contextOf(panel);
  const set = setOwnership(control, panelSet, sources).set;
  if (!set?.id) return null;
  const type = String(control._children.Core.controlType);
  const patch = familyPatchFromControl(control, paths);
  const carried = (panel.controlSets ?? []).find((entry) => entry.id === set.id) ?? null;
  const stored = library.find((entry) => entry.id === set.id) ?? null;
  let target;
  let copied = false;
  if (!carried && !stored && isBuiltIn(set.id)) {
    const copy = duplicateControlSet(set, String(copyName || `${set.name} Copy`).trim());
    if (!copy) return null;
    target = updateControlSetInLibrary(copy.id, setWithFamilyPatch(copy, type, patch)) ?? copy;
    copied = true;
  } else {
    const next = setWithFamilyPatch(carried ?? stored ?? set, type, patch);
    target = stored ? (updateControlSetInLibrary(set.id, next) ?? next) : next;
  }
  const { origin: _origin, ...carry } = deepClone(target);
  const follows = !String(control._children.Core.controlSetId ?? '').trim();
  const reset = resetToSetPatch(control, paths);
  panels.update((list) => {
    let next = mutatePanelControlsInList(list, panel.id, (entry) => entry?._children?.Core?.id === controlId, (draft) => {
      applyPatchObject(draft, reset);
      if (copied && !follows) draft._children.Core.controlSetId = carry.id;
      return draft;
    });
    next = updatePanelInList(next, panel.id, (entry) => ({
      ...entry,
      controlSets: [carry, ...(entry.controlSets ?? []).filter((item) => item.id !== carry.id)],
      ...(copied && follows ? { controlSet: normalizeControlSet(carry.id) } : {}),
      modified: true,
    }));
    return next;
  });
  return { setId: carry.id, copied };
}

// --- Edit on Panel ---------------------------------------------------------------------------------

/**
 * Place one of `type`'s controls on the panel, drawn with `setId`, selected, to style and then
 * apply. Leaves Settings for the panel. Returns the control's id, or null with no panel to place on.
 */
export function placeFamilyControlForEditing(setId, type, panelId = null) {
  const panel = panelById(panelId);
  if (!panel || !type) return null;
  endSetEditSession({ remove: true });
  setActivePanel(panel.id);
  // Drawn with the set being edited: the panel's own, or assigned to this control.
  const panelSetId = String(panel.controlSet?.id ?? '');
  const overrides = panelSetId === String(setId) ? {} : { Core: { controlSetId: String(setId) } };
  // Where the panel puts a new control: a free spot, not over the others.
  const control = addControl(type, overrides);
  if (!control) return null;
  const controlId = control._children.Core.id;
  selectComponent(controlId);
  setEditSession.set({ panelId: panel.id, controlId, setId: String(setId), type: String(type) });
  return controlId;
}

/** Apply the placed control's look to the set and take it away. Returns what applyLookToSet does. */
export function applySetEditSession({ copyName = '' } = {}) {
  const session = get(setEditSession);
  if (!session) return null;
  const preview = applyToSetPreview(session.controlId, session.panelId);
  const paths = preview?.entries.map((entry) => entry.path) ?? [];
  const result = paths.length ? applyLookToSet(session.controlId, paths, { panelId: session.panelId, copyName }) : null;
  endSetEditSession({ remove: true });
  return result;
}

/** End Edit on Panel; `remove` takes the placed control away (Cancel, or after Apply). */
export function endSetEditSession({ remove = false } = {}) {
  const session = get(setEditSession);
  setEditSession.set(null);
  if (!session || !remove) return;
  const panel = panelById(session.panelId);
  if (panel && findControlById(panel.controls, session.controlId)) removeControl(session.controlId);
}
