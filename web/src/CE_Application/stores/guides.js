import { writable, derived, get } from 'svelte/store';
import { activePanelId } from './panels.js';

// Map of panelId → { horizontal: number[], vertical: number[] }
const allGuides = writable({});

/** Currently selected guide: { orientation, index } | null */
export const selectedGuide = writable(null);

/** Guide being dragged: { orientation, index, pos } | null — shared so rulers + lines stay in sync */
export const draggingGuide = writable(null);

export function deleteSelectedGuide() {
  const sel = get(selectedGuide);
  if (!sel) return false;
  removeGuide(sel.orientation, sel.index);
  selectedGuide.set(null);
  return true;
}

export const guides = derived([allGuides, activePanelId], ([$all, $id]) => {
  return $all[$id] ?? { horizontal: [], vertical: [] };
});

export function addGuide(orientation, position) {
  const panelId = get(activePanelId);
  if (panelId == null) return;
  allGuides.update(g => {
    const pg = { ...(g[panelId] ?? { horizontal: [], vertical: [] }) };
    pg[orientation] = [...pg[orientation], Math.round(position)];
    return { ...g, [panelId]: pg };
  });
}

export function removeGuide(orientation, index) {
  const panelId = get(activePanelId);
  if (panelId == null) return;
  allGuides.update(g => {
    const pg = { ...(g[panelId] ?? { horizontal: [], vertical: [] }) };
    pg[orientation] = pg[orientation].filter((_, i) => i !== index);
    return { ...g, [panelId]: pg };
  });
}

export function clearGuides() {
  const panelId = get(activePanelId);
  if (panelId == null) return;
  allGuides.update(g => ({ ...g, [panelId]: { horizontal: [], vertical: [] } }));
}

export function updateGuide(orientation, index, newPosition) {
  const panelId = get(activePanelId);
  if (panelId == null) return;
  allGuides.update(g => {
    const pg = { ...(g[panelId] ?? { horizontal: [], vertical: [] }) };
    pg[orientation] = pg[orientation].map((v, i) => i === index ? Math.round(newPosition) : v);
    return { ...g, [panelId]: pg };
  });
}
