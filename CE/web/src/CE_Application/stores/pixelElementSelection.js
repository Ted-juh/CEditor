import { writable } from 'svelte/store';
import { resolvedActivePanelId } from './panels.js';
import { setLcdDesignLayout } from './lcdDesignLayout.js';

// Editor-only selection, shared by the Content table and the main canvas.
// Element IDs survive reordering; layout IDs prevent selecting another page's row.
export const pixelElementSelection = writable(new Map());
export const pixelSelectionKey = (controlId, layoutId = '') => JSON.stringify([controlId, String(layoutId ?? '')]);
export const pixelElementId = (element, index) => String(element?.id ?? `@index:${index}`);
export function selectPixelElement(controlId, layoutId, elementId) {
  if (!controlId) return;
  if (layoutId) setLcdDesignLayout(controlId, layoutId);
  const key = pixelSelectionKey(controlId, layoutId);
  pixelElementSelection.update((current) => {
    if (current.get(key) === elementId) return current;
    const next = new Map(current);
    if (elementId == null) next.delete(key);
    else next.set(key, elementId);
    return next;
  });
}
resolvedActivePanelId.subscribe(() => pixelElementSelection.set(new Map()));
