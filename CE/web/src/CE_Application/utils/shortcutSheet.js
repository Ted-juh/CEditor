// shortcutSheet.js — the keyboard shortcuts and pointer gestures, as one list in reading order.
//
// The F1 panel (layout/ShortcutsOverlay.svelte) and the editor manual (scripts/generate-editor-
// manual.mjs) both draw from here, so the two cannot describe different keys.

import { GLOBAL_SHORTCUTS } from './globalShortcuts.js';
import { EDITOR_SHORTCUTS } from './editorShortcuts.js';

/**
 * This list is GENERATED from the binding tables the dispatchers match on.
 *
 * It used to be typed out by hand, and the review found what always happens
 * to a list typed out beside the code it describes: five of the shortcuts it
 * documented were bound nowhere, the wheel row described a behaviour the
 * canvas did not have, and Ctrl+G, Ctrl+Shift+G and Ctrl+, were missing
 * although they worked. Reading GLOBAL_SHORTCUTS and EDITOR_SHORTCUTS makes
 * that class of bug unrepresentable — a chord and its description are one
 * object, and a binding that is not in a table does not resolve either.
 */

/**
 * The rest: gestures no dispatcher owns, so nothing can generate them.
 *
 * A mouse gesture is a mousedown handler inside a component, not a row in a
 * chord table, and the same goes for the two keys that live in their own
 * components (F2 in the tree, Escape in this overlay). They are listed by
 * hand and each one was checked against its handler when it was written —
 * TabBar.svelte handleMiddleClick, CanvasControl.svelte handleDoubleClick,
 * EditorCanvas.svelte trackMeasure, ComponentTree.svelte's F2 — but they are
 * the part of this panel that can still drift, so check them if you move one.
 */
export const POINTER_GESTURES = [
  { section: 'Application', keys: 'Esc', description: 'Close this panel' },
  { section: 'Tabs', keys: 'Middle Click', description: 'Close tab' },
  { section: 'View', keys: 'Scroll', description: 'Scroll canvas' },
  { section: 'View', keys: 'Shift+Scroll', description: 'Scroll sideways' },
  { section: 'View', keys: 'Ctrl+Scroll', description: 'Zoom at cursor' },
  { section: 'Canvas', keys: 'Space+Drag', description: 'Pan canvas' },
  { section: 'Canvas', keys: 'Middle Drag', description: 'Pan canvas' },
  { section: 'Canvas', keys: 'Right Click', description: 'Context menu' },
  { section: 'Canvas', keys: 'Alt+Hover', description: 'Measure to the hovered control' },
  { section: 'Components', keys: 'Click', description: 'Select' },
  { section: 'Components', keys: 'Shift+Click', description: 'Extend selection' },
  { section: 'Components', keys: 'Ctrl+Click', description: 'Toggle multi-select' },
  { section: 'Components', keys: 'Double Click', description: 'Enter container / edit text' },
  { section: 'Components', keys: 'Shift+Marquee', description: 'Add marquee to selection' },
  { section: 'Components', keys: 'Drag', description: 'Move' },
  { section: 'Components', keys: 'Shift+Drag', description: 'Constrain to axis' },
  { section: 'Components', keys: 'Alt+Drag', description: 'Move a copy' },
  { section: 'Components', keys: 'Ctrl (hold)', description: 'Suspend snapping' },
  { section: 'Components', keys: 'Space (hold)', description: 'Keep current container' },
  { section: 'Components', keys: 'Shift+Resize', description: 'Aspect ratio lock' },
  { section: 'Components', keys: 'Alt+Resize', description: 'Resize about the centre' },
  { section: 'Components', keys: 'Esc (dragging)', description: 'Cancel drag / resize' },
  { section: 'Components', keys: 'Corner outside', description: 'Rotate' },
  { section: 'Components', keys: 'Shift+Rotate', description: 'Snap to 15\u00B0' },
  { section: 'Guides', keys: 'Drag from ruler', description: 'Create guide' },
  { section: 'Guides', keys: 'Drag guide label', description: 'Move guide' },
  { section: 'Guides', keys: 'Click guide label', description: 'Select guide' },
  { section: 'Guides', keys: 'Delete', description: 'Remove selected guide' },
  { section: 'Guides', keys: 'Right-click guide', description: 'Remove guide' },
  { section: 'Tree', keys: 'F2', description: 'Rename row' },
  { section: 'Tree', keys: 'Double Click', description: 'Rename row' },
];

// Reading order, not table order: what you do to the document before what you
// do to the view. Anything with a section not listed here still gets drawn,
// at the end, so a new section can never go missing.
export const SECTION_ORDER = [
  'Application', 'File', 'Tabs', 'Edit', 'Arrange', 'Selection',
  'View', 'Canvas', 'Components', 'Guides', 'Tree',
];

export function buildSections(bindings) {
  const byTitle = new Map();
  const seen = new Set();

  for (const binding of bindings) {
    const title = binding.section ?? 'Other';
    // Ctrl+Shift+P is a row in BOTH tables — the canvas handles it while the
    // canvas has focus and the global resolver picks it up when focus has
    // wandered. One binding, one line.
    const fingerprint = `${title}\u0000${binding.keys}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push([binding.keys, binding.description]);
  }

  const rank = (title) => {
    const index = SECTION_ORDER.indexOf(title);
    return index < 0 ? SECTION_ORDER.length : index;
  };
  return [...byTitle.entries()]
    .map(([title, shortcuts]) => ({ title, shortcuts }))
    .sort((a, b) => rank(a.title) - rank(b.title));
}

/** Every shortcut and gesture, in the sections the F1 panel and the editor manual both show. */
export function shortcutSections() {
  return buildSections([...GLOBAL_SHORTCUTS, ...EDITOR_SHORTCUTS, ...POINTER_GESTURES]);
}
