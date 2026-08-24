import { get } from 'svelte/store';
import { keyboardNudgeSmall, keyboardNudgeLarge } from '../stores/runtimePreferences.js';
import { bringForward, bringToFront, sendBackward, sendToBack } from '../stores/alignment.js';
import { pasteInPlace } from '../stores/clipboard.js';
import { tagNextChange } from '../stores/history.js';
import { findParentOfControl, flatControls, getChildControls, isContainerControl } from './containment.js';

const modOf = (e) => e.ctrlKey || e.metaKey;
const lowerOf = (e) => (typeof e.key === 'string' ? e.key : '').toLowerCase();

const ARROW_AXIS = { ArrowLeft: 'x', ArrowRight: 'x', ArrowUp: 'y', ArrowDown: 'y' };

/**
 * Which bracket was pressed, ignoring what Shift did to the character.
 *
 * `Ctrl+Shift+]` arrives as key `}` on a US layout and as something else again
 * on others, so the physical key (`code`) is asked first and the character is
 * only the fallback for synthetic events that carry no code. Testing `e.key`
 * alone is how Ctrl+Shift+] silently stops working the moment somebody holds
 * Shift — which is the whole binding.
 */
function bracketOf(e) {
  if (e.code === 'BracketRight') return ']';
  if (e.code === 'BracketLeft') return '[';
  if (e.key === ']' || e.key === '}') return ']';
  if (e.key === '[' || e.key === '{') return '[';
  return null;
}

/**
 * Every editor-canvas chord, in one table.
 *
 * `match` is what the dispatcher below tests; `keys` and `description` are what
 * the F1 overlay draws. They are the same object on purpose — the overlay was a
 * separate hand-written list, and it drifted into documenting five shortcuts
 * that did not exist while omitting Ctrl+G, Ctrl+Shift+G and Ctrl+,. A binding
 * that is not a row here does not resolve, and a row that exists is documented.
 *
 * The rows carry the CHORD only. Whether a chord is allowed right now — a
 * selection exists, the panel is unlocked, the control is not locked — stays in
 * the dispatcher, where the order of those guards is itself load-bearing.
 */
export const EDITOR_SHORTCUTS = [
  // --- View ---
  { id: 'zoom-in', section: 'View', keys: 'Ctrl++', description: 'Zoom In',
    match: (e) => modOf(e) && (e.key === '=' || e.key === '+') },
  { id: 'zoom-out', section: 'View', keys: 'Ctrl+-', description: 'Zoom Out',
    match: (e) => modOf(e) && e.key === '-' },
  { id: 'fit-to-window', section: 'View', keys: 'Ctrl+0', description: 'Fit to Window',
    match: (e) => modOf(e) && e.key === '0' },
  { id: 'zoom-to-selection', section: 'View', keys: 'Ctrl+Shift+P', description: 'Zoom to Selection',
    match: (e) => modOf(e) && e.shiftKey && lowerOf(e) === 'p' },

  // --- Edit ---
  { id: 'select-all', section: 'Edit', keys: 'Ctrl+A', description: 'Select All',
    match: (e) => modOf(e) && !e.altKey && !e.shiftKey && lowerOf(e) === 'a' },
  // Plain paste only — Ctrl+Alt+V is the format painter and Ctrl+Shift+V is
  // paste-in-place, so both are excluded here rather than ordered around.
  { id: 'paste', section: 'Edit', keys: 'Ctrl+V', description: 'Paste',
    match: (e) => modOf(e) && !e.altKey && !e.shiftKey && lowerOf(e) === 'v' },
  { id: 'paste-in-place', section: 'Edit', keys: 'Ctrl+Shift+V', description: 'Paste in Place',
    match: (e) => modOf(e) && e.shiftKey && !e.altKey && lowerOf(e) === 'v' },
  { id: 'copy-style', section: 'Edit', keys: 'Ctrl+Alt+C', description: 'Copy style',
    match: (e) => modOf(e) && e.altKey && !e.shiftKey && lowerOf(e) === 'c' },
  { id: 'paste-style', section: 'Edit', keys: 'Ctrl+Alt+V', description: 'Paste style',
    match: (e) => modOf(e) && e.altKey && !e.shiftKey && lowerOf(e) === 'v' },
  { id: 'copy', section: 'Edit', keys: 'Ctrl+C', description: 'Copy',
    match: (e) => modOf(e) && !e.altKey && !e.shiftKey && lowerOf(e) === 'c' },
  { id: 'cut', section: 'Edit', keys: 'Ctrl+X', description: 'Cut',
    match: (e) => modOf(e) && !e.altKey && !e.shiftKey && lowerOf(e) === 'x' },
  { id: 'delete', section: 'Edit', keys: 'Delete', description: 'Delete selected',
    match: (e) => e.key === 'Delete' || e.key === 'Backspace' },
  { id: 'duplicate', section: 'Edit', keys: 'Ctrl+D', description: 'Duplicate',
    match: (e) => modOf(e) && !e.shiftKey && !e.altKey && lowerOf(e) === 'd' },
  { id: 'ungroup', section: 'Edit', keys: 'Ctrl+Shift+G', description: 'Ungroup container',
    match: (e) => modOf(e) && e.shiftKey && lowerOf(e) === 'g' },
  { id: 'group', section: 'Edit', keys: 'Ctrl+G', description: 'Group into container',
    match: (e) => modOf(e) && !e.shiftKey && lowerOf(e) === 'g' },
  { id: 'toggle-lock', section: 'Edit', keys: 'Ctrl+L', description: 'Lock / unlock selected',
    match: (e) => modOf(e) && !e.shiftKey && !e.altKey && lowerOf(e) === 'l' },

  // --- Arrange. Ctrl+[ / Ctrl+] is the pair every layout tool uses; Shift
  // takes it all the way, which is the same convention. ---
  { id: 'bring-to-front', section: 'Arrange', keys: 'Ctrl+Shift+]', description: 'Bring to Front',
    match: (e) => modOf(e) && e.shiftKey && bracketOf(e) === ']' },
  { id: 'send-to-back', section: 'Arrange', keys: 'Ctrl+Shift+[', description: 'Send to Back',
    match: (e) => modOf(e) && e.shiftKey && bracketOf(e) === '[' },
  { id: 'bring-forward', section: 'Arrange', keys: 'Ctrl+]', description: 'Bring Forward',
    match: (e) => modOf(e) && !e.shiftKey && bracketOf(e) === ']' },
  { id: 'send-backward', section: 'Arrange', keys: 'Ctrl+[', description: 'Send Backward',
    match: (e) => modOf(e) && !e.shiftKey && bracketOf(e) === '[' },

  // --- Selection ---
  { id: 'cancel', section: 'Selection', keys: 'Esc', description: 'Cancel drag / leave container / deselect',
    match: (e) => e.key === 'Escape' },
  { id: 'next-sibling', section: 'Selection', keys: 'Tab', description: 'Select next sibling',
    match: (e) => e.key === 'Tab' && !modOf(e) && !e.altKey && !e.shiftKey },
  { id: 'previous-sibling', section: 'Selection', keys: 'Shift+Tab', description: 'Select previous sibling',
    match: (e) => e.key === 'Tab' && !modOf(e) && !e.altKey && e.shiftKey },
  { id: 'nudge-large', section: 'Selection', keys: 'Shift+Arrow', description: 'Nudge by grid size',
    match: (e) => !modOf(e) && e.shiftKey && !!ARROW_AXIS[e.key] },
  { id: 'nudge-small', section: 'Selection', keys: 'Arrow keys', description: 'Nudge 1px',
    match: (e) => !modOf(e) && !e.shiftKey && !!ARROW_AXIS[e.key] },
];

const CHORDS = new Map(EDITOR_SHORTCUTS.map(binding => [binding.id, binding]));

/** Does this event press the chord `id`? Throws on a typo rather than never matching. */
function is(id, e) {
  const binding = CHORDS.get(id);
  if (!binding) throw new Error(`Unknown editor shortcut: ${id}`);
  return binding.match(e);
}

/**
 * The controls that sit in the same frame as `id` — the children of its parent,
 * or the top-level controls when it has none. Tab cycles within one parent by
 * design: stepping out of a container by pressing Tab enough times would make
 * Tab and Escape mean the same thing, and Escape already means it.
 */
function siblingsOf(panel, id) {
  const parent = id == null ? null : findParentOfControl(panel.controls, id);
  const list = parent ? getChildControls(parent) : panel.controls;
  return list.filter(control => control?._children?.Core?.id != null);
}

/**
 * Tab / Shift+Tab: move the selection one sibling along, wrapping at the ends.
 *
 * @returns {boolean} whether the selection actually moved — the caller only
 *   swallows the key if it did. Tab is the browser's own focus key, and this
 *   handler runs from a window-level fallback that sees Tab presses from all
 *   over the app; swallowing it unconditionally would take focus navigation
 *   away from every button in the chrome. A control being selected is the
 *   signal that the user is working on the canvas and means the editor's Tab.
 */
function cycleSibling(panel, ids, step, selectComponent) {
  if (ids.size === 0) return false;
  // The LAST id added to the selection is the one the user last pointed at, so
  // that is what Tab steps from — the same control the properties panel is
  // showing after a Ctrl+click.
  const currentId = [...ids][ids.size - 1];
  const siblings = siblingsOf(panel, currentId);
  if (siblings.length === 0) return false;

  const index = siblings.findIndex(control => control._children.Core.id === currentId);
  const next = index < 0
    ? siblings[step > 0 ? 0 : siblings.length - 1]
    : siblings[(index + step + siblings.length) % siblings.length];
  if (!next) return false;
  selectComponent?.(next._children.Core.id);
  return true;
}

/**
 * Editor canvas keyboard shortcuts.
 * One function, outside any component, so every branch can be unit tested by
 * pressing a key at it.
 *
 * `ctx` bundles the stores and helpers the handler acts through, so a test can
 * hand it spies instead of the real document. Commands the two call sites do
 * not pass fall back to the store function they would have passed: the ctx is
 * assembled in BOTH EditorCanvas.svelte and App.svelte, and a binding that
 * needs a new key in both of them before it does anything is a binding that
 * gets added to one and quietly works in half the app. `ctx` still wins.
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

  // --- Zoom shortcuts (work regardless of selection) ---
  if (is('zoom-in', e)) {
    e.preventDefault();
    zoomIn?.();
    return;
  }
  if (is('zoom-out', e)) {
    e.preventDefault();
    zoomOut?.();
    return;
  }
  if (is('fit-to-window', e)) {
    e.preventDefault();
    fitToWindow();
    return;
  }
  if (is('zoom-to-selection', e)) {
    e.preventDefault();
    zoomToSelection();
    return;
  }

  // --- Select All / Paste (work regardless of selection) ---
  if (is('select-all', e)) { e.preventDefault(); selectAll(); return; }
  if (is('paste-in-place', e)) { e.preventDefault(); (ctx.pasteInPlace ?? pasteInPlace)(); return; }
  if (is('paste', e)) { e.preventDefault(); pasteSelection(); return; }

  const ids = selectedComponentIds;

  // --- Escape: cancel the gesture in flight, else step out, else deselect ---
  //
  // THE CONTRACT WITH THE CANVAS. `ctx.abortGesture()` returns true when a drag
  // or resize was in flight and has been abandoned, false/undefined when there
  // was nothing to abandon. Cancelling a move and losing the selection are two
  // different requests and the one that was asked for is the cancel, so a true
  // ends the handler here — the selection is left exactly as the aborted
  // gesture found it. EditorCanvas currently satisfies this the other way
  // round, by taking Escape on a window capture listener for the length of the
  // gesture and stopping propagation, which never lets the key reach this
  // function at all; the hook is for any caller that routes Escape through here
  // instead. Either way the rule is the same and only one of them can fire.
  //
  // The whole branch sits ABOVE the empty-selection gate below because a drag
  // can be aborted with nothing selected — a marquee, or a press that began on
  // a locked control — and the old code returned before ever reaching Escape.
  if (is('cancel', e)) {
    if (ctx.abortGesture?.()) { e.preventDefault(); return; }
    // Nothing selected and nothing dragging: Escape is not ours. Swallowing it
    // would take it away from whatever dialog, menu or popover is open.
    if (ids.size === 0) return;
    e.preventDefault();
    // The inverse of double-click-into-a-container: a single selected child
    // hands selection back to its parent; anything else deselects.
    const firstId = [...ids][0];
    const parentId = ids.size === 1
      ? findParentOfControl(panel.controls, firstId)?._children?.Core?.id
      : null;
    if (parentId != null) ctx.selectComponent?.(parentId);
    else ctx.clearSelection?.();
    return;
  }

  // --- Tab: cycle siblings. Above the empty-selection gate because cycleSibling
  // makes the "is this Tab ours?" decision itself, and only swallows the key
  // when the answer is yes. ---
  if (is('next-sibling', e)) {
    if (cycleSibling(panel, ids, 1, ctx.selectComponent)) e.preventDefault();
    return;
  }
  if (is('previous-sibling', e)) {
    if (cycleSibling(panel, ids, -1, ctx.selectComponent)) e.preventDefault();
    return;
  }

  // --- Delete guide line first (falls through to component delete if none) ---
  if (is('delete', e)) {
    if (deleteSelectedGuide()) { e.preventDefault(); return; }
  }

  if (ids.size === 0) return;

  const selectedCtrls = flatControls(panel.controls).filter(c => ids.has(c._children?.Core?.id));
  if (selectedCtrls.length === 0) return;

  // --- Format painter (before plain copy/paste — same letters plus Alt) ---
  if (is('copy-style', e)) { e.preventDefault(); ctx.copyControlStyle?.(); return; }
  if (is('paste-style', e)) { e.preventDefault(); ctx.applyStyleToSelection?.(); return; }

  // --- Clipboard / destructive ops ---
  if (is('copy', e)) { e.preventDefault(); copySelection(); return; }
  if (is('cut', e)) { e.preventDefault(); cutSelection(); return; }
  if (is('delete', e)) {
    e.preventDefault();
    for (const id of [...ids]) removeControl(id);
    return;
  }
  if (is('duplicate', e)) { e.preventDefault(); duplicateControl(ids); return; }

  // --- Group / Ungroup ---
  if (is('ungroup', e)) {
    e.preventDefault();
    const container = selectedCtrls.find(c => isContainerControl(c));
    if (container && selectedCtrls.length === 1) ungroupContainer?.(container._children.Core.id);
    return;
  }
  if (is('group', e)) {
    e.preventDefault();
    groupSelectionIntoContainer?.();
    return;
  }

  // --- Lock / unlock. One command, not two: locked when every selected control
  // is locked, so a mixed selection locks the rest rather than toggling each
  // control into the opposite of whatever it happened to be. ---
  if (is('toggle-lock', e)) {
    e.preventDefault();
    const nextLocked = !selectedCtrls.every(c => c._children?.Core?.locked === true);
    for (const c of selectedCtrls) updateControlProperty(c._children.Core.id, 'Core.locked', nextLocked);
    return;
  }

  // --- Z-order ---
  if (is('bring-to-front', e)) { e.preventDefault(); (ctx.bringToFront ?? bringToFront)(); return; }
  if (is('send-to-back', e)) { e.preventDefault(); (ctx.sendToBack ?? sendToBack)(); return; }
  if (is('bring-forward', e)) { e.preventDefault(); (ctx.bringForward ?? bringForward)(); return; }
  if (is('send-backward', e)) { e.preventDefault(); (ctx.sendBackward ?? sendBackward)(); return; }

  // --- Arrow nudge ---
  const large = is('nudge-large', e);
  if (!large && !is('nudge-small', e)) return;
  if (panelLocked) return;

  // A locked control does not move; the other nineteen still do. This used to
  // be `if (selected.some(locked)) return`, so one locked item anywhere in a
  // 20-control selection silently disabled the arrow keys for all of them —
  // and nothing on screen said which item was refusing.
  const nudgeable = selectedCtrls.filter(c => !c._children?.Core?.locked);
  if (nudgeable.length === 0) return;

  const arrowAxis = ARROW_AXIS[e.key];
  const arrowDir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
  const baseNudge = large
    ? Math.max(gridSize, get(keyboardNudgeLarge))
    : get(keyboardNudgeSmall);
  const nudge = baseNudge * arrowDir;

  e.preventDefault();
  // Tag the burst by direction and step, so history can tell two nudges apart that its derived
  // tag cannot: left-then-up inside the 400 ms window touches exactly the same control set, and
  // without this they collapse into one undo step that reverses a movement the user made in two
  // deliberate presses. A held key repeats the SAME tag, which is what keeps an autorepeat run
  // one step. The keyup flush that closes that run is in EditorCanvas/App's key handlers.
  tagNextChange(`nudge:${arrowAxis}:${arrowDir}:${baseNudge}`);
  for (const c of nudgeable) {
    const cur = c._children?.Transform?.[arrowAxis] ?? 0;
    updateControlProperty(c._children.Core.id, `Transform.${arrowAxis}`, cur + nudge);
  }
}
