import { get } from 'svelte/store';
import { panels, activePanelId, selectedComponentIds, selectComponent, clearSelection } from './panels.js';
import { removeControl } from './controls.js';

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

  const panel = get(panels).find(p => p.id === get(activePanelId));
  if (!panel) return;

  buffer = panel.controls
    .filter(c => ids.has(c._children?.Core?.id))
    .map(c => JSON.parse(JSON.stringify(c)));
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

  const panelId = get(activePanelId);
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
        const clone = JSON.parse(JSON.stringify(src));
        const newId = `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        clone._children.Core.id = newId;
        clone._children.Core.name = clone._children.Core.name.replace(/_copy$/, '') + '_copy';

        if (clone._children.Transform) {
          clone._children.Transform.x += offsetX;
          clone._children.Transform.y += offsetY;
        }

        newIds.push(newId);
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
  const panel = get(panels).find(p => p.id === get(activePanelId));
  if (!panel) return;

  const ids = new Set();
  for (const ctrl of panel.controls) {
    const id = ctrl._children?.Core?.id;
    if (id) ids.add(id);
  }
  selectedComponentIds.set(ids);
}
