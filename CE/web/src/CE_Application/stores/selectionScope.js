// selectionScope.js — which containers the canvas selection is currently "inside".
//
// The canvas follows the Figma model: a click selects the outermost container, a double-click steps
// one level in. What it lacked was the other half of that model — once you are inside a container,
// its other children are reachable with a plain click. Without it, drilling to a knob and then
// clicking the knob beside it selected nothing at all: the sibling was not a pointer target, so the
// click fell through to the canvas. A panel built from real sections (tone → section → knob) could
// only be edited one double-click-double-click at a time.
//
// A container is OPEN when anything selected sits somewhere inside it. Its direct children are then
// click targets (see `.children-origin.scope-open` in CanvasControl). Ancestors of the selection are
// open all the way up, so clicking a control in a neighbouring section selects that section — one
// double-click from its contents — rather than jumping back out to the top.
//
// One derived store rather than a check per container: each check is a walk of the whole tree, and
// a select-all on an 800-control panel would otherwise do that walk tens of thousands of times.

import { derived } from 'svelte/store';
import { activePanel, selectedComponentIds } from './panels.js';
import { buildControlIndex } from '../utils/containment.js';

/** The ids of every container that holds a selected control, at any depth. */
export function openScopeIds(controls, selectedIds) {
  const open = new Set();
  if (!selectedIds?.size || !Array.isArray(controls)) return open;
  const index = buildControlIndex(controls);
  for (const id of selectedIds) {
    let entry = index.get(id);
    while (entry?.parent) {
      const parentId = entry.parent._children?.Core?.id;
      if (parentId == null || open.has(parentId)) break; // the rest of this chain is already open
      open.add(parentId);
      entry = index.get(parentId);
    }
  }
  return open;
}

export const selectionScopeIds = derived(
  [activePanel, selectedComponentIds],
  ([$panel, $selected]) => openScopeIds($panel?.controls, $selected),
);
