import { get } from 'svelte/store';
import { keyboardNudgeSmall, keyboardNudgeLarge } from '../stores/runtimePreferences.js';
import { findParentOfControl, flatControls, isContainerControl } from './containment.js';

/**
 * Editor canvas keyboard shortcuts.
 * Pure function so the handler can be unit tested and kept out of the component.
 *
 * `ctx` bundles every store/helper the handler needs. The caller (EditorCanvas)
 * is responsible for providing them — this module has no Svelte dependencies.
 */
export function handleEditorShortcut(e, ctx) {
  const {
    panel, panelLocked, gridSize,
    selectedComponentIds,
    zoomIn, zoomOut, fitToWindow, zoomToSelection,
    selectAll, pasteSelection, copySelection, cutSelection, duplicateControl,
    removeControl, updateControlProperty, deleteSelectedGuide,
    groupSelectionIntoContainer, ungroupContainer,
  } = ctx;

  if (!panel) return;

  const mod = e.ctrlKey || e.metaKey;

  // --- Zoom shortcuts (work regardless of selection) ---
  if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomIn?.();
    return;
  }
  if (mod && e.key === '-') {
    e.preventDefault();
    zoomOut?.();
    return;
  }
  if (mod && e.key === '0') {
    e.preventDefault();
    fitToWindow();
    return;
  }
  if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
    e.preventDefault();
    zoomToSelection();
    return;
  }

  // --- Select All / Paste (work regardless of selection) ---
  // Plain paste only — Ctrl+Alt+V is the format painter, handled below.
  if (mod && e.key === 'a') { e.preventDefault(); selectAll(); return; }
  if (mod && e.key === 'v' && !e.altKey) { e.preventDefault(); pasteSelection(); return; }

  // --- Delete guide line first (falls through to component delete if none) ---
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (deleteSelectedGuide()) { e.preventDefault(); return; }
  }

  const ids = selectedComponentIds;
  if (ids.size === 0) return;

  // --- Escape: step out of the drill-down (or deselect) ---
  // The inverse of double-click-into-a-container: a single selected child
  // hands selection back to its parent; anything else deselects.
  if (e.key === 'Escape') {
    e.preventDefault();
    const firstId = [...ids][0];
    const parentId = ids.size === 1
      ? findParentOfControl(panel.controls, firstId)?._children?.Core?.id
      : null;
    if (parentId != null) ctx.selectComponent?.(parentId);
    else ctx.clearSelection?.();
    return;
  }

  const selectedCtrls = flatControls(panel.controls).filter(c => ids.has(c._children?.Core?.id));
  if (selectedCtrls.length === 0) return;

  // --- Format painter (before plain copy/paste — same letters plus Alt) ---
  if (mod && e.altKey && e.key === 'c') { e.preventDefault(); ctx.copyControlStyle?.(); return; }
  if (mod && e.altKey && e.key === 'v') { e.preventDefault(); ctx.applyStyleToSelection?.(); return; }

  // --- Clipboard / destructive ops ---
  if (mod && e.key === 'c') { e.preventDefault(); copySelection(); return; }
  if (mod && e.key === 'x') { e.preventDefault(); cutSelection(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    for (const id of [...ids]) removeControl(id);
    return;
  }
  if (mod && e.key === 'd') { e.preventDefault(); duplicateControl(ids); return; }

  // --- Group / Ungroup ---
  if (mod && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
    e.preventDefault();
    const container = selectedCtrls.find(c => isContainerControl(c));
    if (container && selectedCtrls.length === 1) ungroupContainer?.(container._children.Core.id);
    return;
  }
  if (mod && e.key === 'g') {
    e.preventDefault();
    groupSelectionIntoContainer?.();
    return;
  }

  // --- Arrow nudge (skip if panel locked or any selected is component-locked) ---
  if (panelLocked) return;
  if (selectedCtrls.some(c => c._children?.Core?.locked)) return;

  const arrowAxis = { ArrowLeft: 'x', ArrowRight: 'x', ArrowUp: 'y', ArrowDown: 'y' }[e.key];
  if (!arrowAxis) return;
  const arrowDir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
  const baseNudge = e.shiftKey
    ? Math.max(gridSize, get(keyboardNudgeLarge))
    : get(keyboardNudgeSmall);
  const nudge = baseNudge * arrowDir;

  e.preventDefault();
  for (const c of selectedCtrls) {
    const cur = c._children?.Transform?.[arrowAxis] ?? 0;
    updateControlProperty(c._children.Core.id, `Transform.${arrowAxis}`, cur + nudge);
  }
}
