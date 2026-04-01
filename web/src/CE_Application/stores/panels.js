import { writable, derived } from 'svelte/store';

/**
 * Panel data model.
 * Each panel has: id, name, width, height, modified, controls (empty for now).
 */

let nextId = 1;

/** Create a new panel object with defaults */
export function createPanel(name = null) {
  const id = nextId++;
  return {
    id,
    name: name ?? `Untitled ${id}`,
    width: 600,
    height: 400,
    bgColour: '333333',
    bgMode: 'solid',
    gridEnabled: true,
    gridSize: 10,
    snapToGrid: true,
    modified: false,
    controls: [],
  };
}

/** Currently selected component id (null = panel itself is selected) */
export const selectedComponentId = writable(null);

/** All open panels */
export const panels = writable([]);

/** ID of the active (visible) panel */
export const activePanelId = writable(null);

/** The active panel object (derived) */
export const activePanel = derived(
  [panels, activePanelId],
  ([$panels, $activePanelId]) => $panels.find(p => p.id === $activePanelId) ?? null
);

/** Add a new panel and make it active */
export function addPanel(panel = null) {
  const p = panel ?? createPanel();
  panels.update(list => [...list, p]);
  activePanelId.set(p.id);
  return p;
}

/** Close a panel by id */
export function closePanel(id) {
  panels.update(list => {
    const idx = list.findIndex(p => p.id === id);
    const newList = list.filter(p => p.id !== id);

    // If we closed the active tab, activate an adjacent one
    activePanelId.update(activeId => {
      if (activeId !== id) return activeId;
      if (newList.length === 0) return null;
      // Prefer the tab to the left, or the first remaining
      const newIdx = Math.min(idx, newList.length - 1);
      return newList[newIdx].id;
    });

    return newList;
  });
}

/** Switch to a panel by id */
export function setActivePanel(id) {
  activePanelId.set(id);
}

/** Update a panel's properties */
export function updatePanel(id, updates) {
  panels.update(list =>
    list.map(p => p.id === id ? { ...p, ...updates } : p)
  );
}
