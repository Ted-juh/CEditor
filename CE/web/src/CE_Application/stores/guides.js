import { writable, derived, get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentIds, updatePanel } from './panels.js';

/**
 * Ruler guides, backed by the PANEL DOCUMENT (panel.guides). Because they
 * live on the panel they are undoable (history snapshots the panel), saved
 * into .cepanel files, and restored by session persistence — the old
 * session-only store lost every guide on reload and every deletion was
 * unrecoverable.
 *
 * Shape stays { horizontal: number[], vertical: number[] } — consumers
 * (rulers, guide lines, alignment snapping) read plain position arrays.
 */

const EMPTY_GUIDES = { horizontal: [], vertical: [] };

function normalizeAxis(list) {
  return Array.isArray(list) ? list.filter((v) => Number.isFinite(v)) : [];
}

/** Currently selected guide: { orientation, index } | null */
export const selectedGuide = writable(null);

/** Guide being dragged: { orientation, index, pos } | null — shared so rulers + lines stay in sync */
export const draggingGuide = writable(null);

export const guides = derived([panels, resolvedActivePanelId], ([$panels, $id]) => {
  const panel = $panels.find((p) => p.id === $id);
  const stored = panel?.guides;
  if (!stored) return EMPTY_GUIDES;
  return {
    horizontal: normalizeAxis(stored.horizontal),
    vertical: normalizeAxis(stored.vertical),
  };
});

function writeGuides(mutate) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;
  const panel = get(panels).find((p) => p.id === panelId);
  const current = panel?.guides ?? EMPTY_GUIDES;
  const draft = {
    horizontal: [...normalizeAxis(current.horizontal)],
    vertical: [...normalizeAxis(current.vertical)],
  };
  const next = mutate(draft);
  if (!next) return;
  updatePanel(panelId, { guides: next, modified: true });
}

export function addGuide(orientation, position) {
  writeGuides((g) => {
    if (!g[orientation]) return null;
    g[orientation].push(Math.round(position));
    return g;
  });
}

export function updateGuide(orientation, index, newPosition) {
  writeGuides((g) => {
    if (g[orientation]?.[index] == null) return null;
    g[orientation][index] = Math.round(newPosition);
    return g;
  });
}

export function removeGuide(orientation, index) {
  writeGuides((g) => {
    if (g[orientation]?.[index] == null) return null;
    g[orientation].splice(index, 1);
    return g;
  });
  // Guides are index-addressed: after a removal the selection must keep
  // pointing at the SAME guide (or nothing) — previously it silently slid
  // onto a neighbour, and the next Delete removed the wrong guide.
  selectedGuide.update((sel) => {
    if (!sel || sel.orientation !== orientation) return sel;
    if (sel.index === index) return null;
    return sel.index > index ? { ...sel, index: sel.index - 1 } : sel;
  });
  draggingGuide.set(null);
}

export function clearGuides() {
  writeGuides(() => ({ horizontal: [], vertical: [] }));
  selectedGuide.set(null);
  draggingGuide.set(null);
}

export function deleteSelectedGuide() {
  const sel = get(selectedGuide);
  if (!sel) return false;
  removeGuide(sel.orientation, sel.index);
  selectedGuide.set(null);
  return true;
}

// A selected guide owns the Delete key: `deleteSelectedGuide()` runs ahead of the control-delete
// branch in editorShortcuts, which is right while the guide is what the user last touched and
// wrong the moment it is not. Clicking a control cleared it and clicking bare canvas cleared it,
// but every OTHER route into a selection did not — Ctrl+A, Tab sibling-cycling, a marquee (whose
// mouseup swallows the click that would have cleared it) and any click in the component tree.
// So: select a guide, press Ctrl+A, press Delete, and the guide dies while all twenty selected
// controls survive.
//
// Same shape of bug as the stale colour target, and the same answer — see stores/colorTarget.js,
// which this deliberately mirrors: a selection change means the user has moved on, so the guide
// stops being the thing Delete is aimed at. The first notification is the subscribe-time replay
// and is skipped, or the guide would be cleared before anyone could select one.
let guideSelectionSeen = false;
selectedComponentIds.subscribe(() => {
  if (!guideSelectionSeen) { guideSelectionSeen = true; return; }
  if (get(selectedGuide)) selectedGuide.set(null);
});
