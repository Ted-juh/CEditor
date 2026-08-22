import { flatControls, isContainerControl } from './containment.js';

/**
 * editMenuAvailability.js — which Edit-menu commands can run right now.
 *
 * Review finding D6: "Edit menu lacks Duplicate, Delete, Group/Ungroup, Arrange — all of which
 * work via shortcut or right-click but appear in no menu." Adding the rows is the easy half. The
 * half that goes wrong is the greying: D3 is the same menu shipping items that looked live and
 * were not, so every row added here has to answer the same question its shortcut already answers.
 *
 * Pure, and given the panel rather than reaching for the store, so the whole table can be tested
 * against a fabricated tree — the predicates are the part a reader has to trust.
 */

/**
 * Ungroup's target, or null.
 *
 * Ctrl+Shift+G has always required exactly one selected control that is actually a Container
 * (editorShortcuts.js:95-97). A menu item that merely required "something selected" would offer
 * to ungroup a button, do nothing, and be indistinguishable from a bug.
 */
export function singleSelectedContainerId(panel, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds ?? []);
  if (!panel || ids.size !== 1) return null;
  const selected = flatControls(panel.controls).filter((control) => ids.has(control?._children?.Core?.id));
  if (selected.length !== 1 || !isContainerControl(selected[0])) return null;
  return selected[0]._children.Core.id ?? null;
}

export function editMenuAvailability(panel, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds ?? []);
  const count = ids.size;
  const ungroupTargetId = singleSelectedContainerId(panel, ids);
  return {
    selectionCount: count,
    canDuplicate: count > 0,
    canDelete: count > 0,
    canGroup: count > 0,
    canUngroup: ungroupTargetId != null,
    ungroupTargetId,
    // Z-order moves one control just as happily as ten.
    canReorder: count > 0,
    // Tidy Grid and Arrange in Circle both bail out below two (alignment.js:715, 748) — a menu
    // item that runs and changes nothing is the quietest kind of dead item.
    canArrangeMany: count > 1,
    canSelectAll: (panel?.controls?.length ?? 0) > 0,
  };
}
