import { writable } from 'svelte/store';

// The alignment snap guides for the control being dragged/resized RIGHT NOW,
// in panel coordinates: [{ type: 'vertical'|'horizontal', pos, center }].
// A CanvasControl publishes here during a drag/resize so the panel rulers
// (rendered separately in EditorCanvas) can show matching tick markers — the
// same live-guide-in-the-ruler behaviour the component editor has. Cleared on
// drag/resize end.
export const activePanelSnapGuides = writable([]);

export function setActivePanelSnapGuides(guides) {
  activePanelSnapGuides.set(Array.isArray(guides) ? guides : []);
}

export function clearActivePanelSnapGuides() {
  activePanelSnapGuides.set([]);
}
