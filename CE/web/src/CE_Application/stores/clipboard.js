import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentIds } from './panels.js';
import { removeControl } from './controls.js';
import {
  collectControlNames,
  controlPanelRect,
  findControlById,
  findParentOfControl,
  flatControls,
  insertControlIntoTree,
  remintControlIds,
  selectionRoots,
  uniqueCopyName,
} from '../utils/containment.js';

/**
 * Internal clipboard buffer. Each entry keeps the control with its ORIGINAL
 * local coordinates plus enough context to paste like duplicate does:
 *   control  — deep clone, Transform still parent-relative
 *   parentId — the container it lived in (null = top level)
 *   panelX/Y — its panel-space position, for pasting where the parent is gone
 * Not a Svelte store; nothing reads it reactively.
 */
let buffer = [];

/**
 * Copy all currently selected controls into the clipboard buffer.
 */
export function copySelection() {
  const ids = get(selectedComponentIds);
  if (ids.size === 0) return;

  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  if (!panel) return;

  // Copy selection roots only (a selected child inside a selected container
  // rides along in the subtree).
  buffer = selectionRoots(panel.controls, ids)
    .map(id => {
      const source = findControlById(panel.controls, id);
      if (!source) return null;
      const rect = controlPanelRect(panel.controls, id);
      const parent = findParentOfControl(panel.controls, id);
      return {
        control: JSON.parse(JSON.stringify(source)),
        parentId: parent?._children?.Core?.id ?? null,
        panelX: rect?.x ?? source._children?.Transform?.x ?? 0,
        panelY: rect?.y ?? source._children?.Transform?.y ?? 0,
      };
    })
    .filter(Boolean);
}

/**
 * Cut = copy + delete. Deletes the selection ROOTS, mirroring what copy
 * captured — a selected child of a selected container is one subtree
 * operation, not two removals.
 */
export function cutSelection() {
  copySelection();
  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  const ids = get(selectedComponentIds);
  const roots = panel ? selectionRoots(panel.controls, ids) : [...ids];
  for (const id of roots) removeControl(id);
}

/**
 * Paste clipboard buffer into the active panel.
 *
 * Same structural semantics as duplicate: a control copied out of a container
 * pastes back INTO that container (when it still exists in the target panel),
 * offset +20/+20 in its local frame. When the container is gone — cross-panel
 * paste, deleted parent — it lands at top level at its old panel-space spot.
 * An explicit position ("Paste Here") always pastes at top level centred on
 * the point; the click location is the intent.
 *
 * @param {{ x: number, y: number } | null} position
 */
export function pasteSelection(position = null) {
  if (buffer.length === 0) return;

  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  const newIds = [];

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      // When pasting at a specific position, compute the offset needed to centre
      // the bounding box of all buffered controls on that point.
      let offsetX = 20;
      let offsetY = 20;

      if (position) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const entry of buffer) {
          const t = entry.control._children?.Transform;
          if (!t) continue;
          minX = Math.min(minX, entry.panelX);
          minY = Math.min(minY, entry.panelY);
          maxX = Math.max(maxX, entry.panelX + (t.width || 0));
          maxY = Math.max(maxY, entry.panelY + (t.height || 0));
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        offsetX = position.x - cx;
        offsetY = position.y - cy;
      }

      let controls = p.controls;
      const existingNames = collectControlNames(controls);
      const nextBuffer = [];

      for (const entry of buffer) {
        // Fresh ids for the control and its whole subtree
        const clone = remintControlIds(entry.control);
        const name = uniqueCopyName(existingNames, clone._children.Core.name);
        clone._children.Core.name = name;
        existingNames.add(name);

        const parentAlive = !position && entry.parentId != null && !!findControlById(controls, entry.parentId);
        if (clone._children.Transform) {
          if (parentAlive) {
            // Local coords are already in the clone — just stagger.
            clone._children.Transform.x += offsetX;
            clone._children.Transform.y += offsetY;
          } else {
            clone._children.Transform.x = entry.panelX + offsetX;
            clone._children.Transform.y = entry.panelY + offsetY;
          }
        }

        controls = parentAlive
          ? insertControlIntoTree(controls, entry.parentId, clone)
          : [...controls, clone];

        newIds.push(clone._children.Core.id);

        // Successive pastes keep staggering from the last paste.
        nextBuffer.push({
          ...entry,
          control: JSON.parse(JSON.stringify(clone)),
          panelX: entry.panelX + offsetX,
          panelY: entry.panelY + offsetY,
        });
      }

      buffer = nextBuffer;
      return { ...p, controls, modified: true };
    })
  );

  // Select all pasted controls
  selectedComponentIds.set(new Set(newIds));
}

/**
 * @returns {boolean} Whether the clipboard has content to paste.
 */
export function hasClipboardContent() {
  return buffer.length > 0;
}

/**
 * Select all controls in the active panel.
 */
export function selectAll() {
  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  if (!panel) return;

  const ids = new Set();
  for (const ctrl of flatControls(panel.controls)) {
    const id = ctrl._children?.Core?.id;
    if (id) ids.add(id);
  }
  selectedComponentIds.set(ids);
}