import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentIds, selectComponent, clearSelection } from './panels.js';
import { removeControl } from './controls.js';
import { controlPanelRect, findControlById, flatControls, remintControlIds, selectionRoots } from '../utils/containment.js';

/**
 * Internal clipboard buffer — array of serialised control objects.
 * Not using a Svelte store since nothing needs to reactively read it.
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
  // rides along in the subtree). Positions are captured in panel space so a
  // nested child pastes where it visually was.
  buffer = selectionRoots(panel.controls, ids)
    .map(id => {
      const source = findControlById(panel.controls, id);
      if (!source) return null;
      const clone = JSON.parse(JSON.stringify(source));
      const rect = controlPanelRect(panel.controls, id);
      if (clone._children?.Transform && rect) {
        clone._children.Transform.x = rect.x;
        clone._children.Transform.y = rect.y;
      }
      return clone;
    })
    .filter(Boolean);
}

/**
 * Cut = copy + delete.
 */
export function cutSelection() {
  copySelection();
  const ids = [...get(selectedComponentIds)];
  for (const id of ids) removeControl(id);
}

/**
 * Paste clipboard buffer into the active panel.
 * @param {{ x: number, y: number } | null} position — if provided, paste centred on
 *   this panel-space coordinate; otherwise offset +20px from the copied position.
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
        for (const src of buffer) {
          const t = src._children?.Transform;
          if (!t) continue;
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + (t.width || 0));
          maxY = Math.max(maxY, t.y + (t.height || 0));
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        offsetX = position.x - cx;
        offsetY = position.y - cy;
      }

      const clones = buffer.map(src => {
        // Fresh ids for the control and its whole subtree
        const clone = remintControlIds(src);
        clone._children.Core.name = clone._children.Core.name.replace(/_copy$/, '') + '_copy';

        if (clone._children.Transform) {
          clone._children.Transform.x += offsetX;
          clone._children.Transform.y += offsetY;
        }

        newIds.push(clone._children.Core.id);
        return clone;
      });

      // Update buffer positions so successive pastes keep staggering
      buffer = clones.map(c => JSON.parse(JSON.stringify(c)));

      return { ...p, controls: [...p.controls, ...clones], modified: true };
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
