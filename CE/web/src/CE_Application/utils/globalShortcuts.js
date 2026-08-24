import { get } from 'svelte/store';
import { activeEditorTab, editorTabs, resolvedActivePanelId, setActiveEditorTab } from '../stores/panels.js';
import { togglePreviewMode } from '../stores/interactionPreview.js';

/**
 * Application-wide keyboard chords, resolved in one place.
 *
 * Two classes of chord, split by how they interact with text editing:
 *  - Application chords (save, open, new, close, help, settings, tab
 *    switching, preview) fire even while an input has focus — they never
 *    conflict with typing.
 *  - Document chords (undo/redo, zoom-to-selection) are suppressed while the
 *    target is editable, so native text-field undo keeps working and a typo
 *    fix never reverts a whole panel.
 *
 * The chords live in one exported TABLE rather than a ladder of ifs, because
 * the F1 overlay draws from the same rows the resolver matches on. The overlay
 * used to be a hand-written list and it documented five shortcuts that did not
 * exist, mis-described the wheel, and omitted half of the ones that did — a
 * list maintained by hand next to the code it describes will always drift.
 * Here it cannot: a chord with no row does not resolve.
 *
 * Pure resolver *for the chords the caller executes* — see the note on
 * `run` below for the two that this module carries out itself.
 */

/**
 * Alias in this module's vocabulary for the one shared "is the user typing?" test.
 * The implementation lives in textEntry.js so that every global key handler — this
 * resolver, the editor canvas, the panic-layout bindings — agrees on the answer.
 */
export { isTextEntryTarget as isEditableTarget } from './textEntry.js';

const modOf = (e) => e.ctrlKey || e.metaKey;
const lowerOf = (e) => (typeof e.key === 'string' ? e.key : '').toLowerCase();

/**
 * Switch to the tab `step` places along the tab strip, wrapping at both ends.
 *
 * `editorTabs` is the strip as drawn — panels, settings, device profiles,
 * components, scripts, screens in that order — so Ctrl+Tab walks exactly what
 * the user can see, in the order they see it, whichever workspace is in front.
 */
export function cycleEditorTab(step) {
  const tabs = get(editorTabs);
  if (tabs.length < 2) return;

  const current = get(activeEditorTab);
  // The strip's descriptor is { id, tabType }; the active-tab store's is
  // { id, type }. Ids are unique across document kinds, so the id is the match
  // and the kind is only a tie-break.
  let index = tabs.findIndex(tab => tab.id === current?.id && tab.tabType === current?.type);
  if (index < 0) index = tabs.findIndex(tab => tab.id === current?.id);
  if (index < 0) index = 0;

  const next = tabs[(index + step + tabs.length) % tabs.length];
  if (next) setActiveEditorTab(next);
}

/** Ctrl+1…9: jump straight to the nth tab. Out of range does nothing. */
export function selectEditorTabByIndex(oneBased) {
  const tab = get(editorTabs)[oneBased - 1];
  if (tab) setActiveEditorTab(tab);
}

/**
 * Preview had exactly one entry point — a button inside a panel that the app
 * itself force-hides below 920px, along with the toggle that would bring it
 * back. Off a panel tab there is nothing to preview, so the chord is swallowed
 * (F5 must never reach the host and reload the WebView) but does nothing.
 */
function togglePreview() {
  if (get(resolvedActivePanelId) == null) return;
  togglePreviewMode();
}

const liveActions = { cycleEditorTab, selectEditorTabByIndex, togglePreview };

/**
 * One row per chord.
 *
 *   id           what `resolveGlobalShortcut` returns; the caller's switch key
 *   scope        'application' fires while typing, 'document' does not
 *   section/keys/description   what the F1 overlay draws
 *   match(e)     the chord test — the single source of truth for the binding
 *   run(actions, e)  present only on chords this module carries out itself
 *
 * WHY SOME ROWS RUN THEMSELVES. The dispatcher that consumes this lives in
 * App.svelte and switches on the returned id, doing nothing at all for an id it
 * does not know — so a new row that only returned an id would be silently
 * swallowed. Tab switching and preview need nothing from App.svelte's scope
 * (the tab strip and the preview flag are module singletons), so they act here
 * and return null. Null, not the id: had they returned their id and App.svelte
 * later grown a case for it, the command would run twice, and a tab switch that
 * skips two tabs is a bug nobody would think to look for here. `preventDefault`
 * is called on the way out, which is also how App.svelte's editor-shortcut
 * fallback knows the key is spoken for.
 */
export const GLOBAL_SHORTCUTS = [
  {
    id: 'toggle-shortcuts', scope: 'application', section: 'Application',
    keys: 'F1', description: 'Keyboard shortcuts',
    match: (e) => e.key === 'F1',
  },
  {
    id: 'save-as', scope: 'application', section: 'File',
    keys: 'Ctrl+Shift+S', description: 'Save As',
    match: (e) => modOf(e) && e.shiftKey && lowerOf(e) === 's',
  },
  {
    id: 'save', scope: 'application', section: 'File',
    keys: 'Ctrl+S', description: 'Save',
    match: (e) => modOf(e) && lowerOf(e) === 's',
  },
  {
    id: 'new-panel', scope: 'application', section: 'File',
    keys: 'Ctrl+N', description: 'New Panel',
    match: (e) => modOf(e) && lowerOf(e) === 'n',
  },
  {
    id: 'open-panel', scope: 'application', section: 'File',
    keys: 'Ctrl+O', description: 'Open Panel',
    match: (e) => modOf(e) && lowerOf(e) === 'o',
  },
  {
    id: 'close-tab', scope: 'application', section: 'File',
    keys: 'Ctrl+W', description: 'Close Tab',
    match: (e) => modOf(e) && lowerOf(e) === 'w',
  },
  {
    id: 'open-settings', scope: 'application', section: 'File',
    keys: 'Ctrl+,', description: 'Settings',
    match: (e) => modOf(e) && e.key === ',',
  },
  // --- Panels. The three toggles the Window menu offers, which had no accelerator at all: the
  // display dock in particular was hidden by default and reachable only by finding one button on
  // the rail, which is the whole of review finding B9. DOCUMENT scope, not application — nobody
  // toggles a panel mid-word, and document scope is what keeps Ctrl+J off a script editor that
  // may want it. Chords follow VS Code, which is where this muscle memory comes from: Ctrl+J for
  // the bottom panel, Ctrl+Shift+E for the tree.
  {
    id: 'toggle-display-panel', scope: 'document', section: 'Panels',
    keys: 'Ctrl+J', description: 'Show / hide the display dock',
    match: (e) => modOf(e) && !e.shiftKey && !e.altKey && lowerOf(e) === 'j',
  },
  {
    id: 'toggle-tree-panel', scope: 'document', section: 'Panels',
    keys: 'Ctrl+Shift+E', description: 'Show / hide the component tree',
    match: (e) => modOf(e) && e.shiftKey && !e.altKey && lowerOf(e) === 'e',
  },
  {
    id: 'toggle-properties-panel', scope: 'document', section: 'Panels',
    keys: 'Ctrl+Shift+D', description: 'Show / hide the properties panel',
    match: (e) => modOf(e) && e.shiftKey && !e.altKey && lowerOf(e) === 'd',
  },
  // --- Tabs. Application chords: Ctrl+Tab in a script editor must move to the
  // next document, not indent a line, and Ctrl+digit types nothing anywhere,
  // so neither can collide with the user's hands being in a text field. They
  // are also the two chords that MUST work off a panel tab — a script or a
  // device profile in front is precisely when you want to get back.
  {
    id: 'next-tab', scope: 'application', section: 'Tabs',
    keys: 'Ctrl+Tab', description: 'Next tab',
    match: (e) => modOf(e) && !e.shiftKey && e.key === 'Tab',
    run: (actions) => actions.cycleEditorTab(1),
  },
  {
    id: 'previous-tab', scope: 'application', section: 'Tabs',
    keys: 'Ctrl+Shift+Tab', description: 'Previous tab',
    match: (e) => modOf(e) && e.shiftKey && e.key === 'Tab',
    run: (actions) => actions.cycleEditorTab(-1),
  },
  {
    id: 'select-tab', scope: 'application', section: 'Tabs',
    keys: 'Ctrl+1…9', description: 'Go to tab 1-9',
    match: (e) => modOf(e) && !e.shiftKey && !e.altKey
      && typeof e.key === 'string' && e.key.length === 1 && e.key >= '1' && e.key <= '9',
    run: (actions, e) => actions.selectEditorTabByIndex(Number(e.key)),
  },
  // F5 rather than a letter chord: preview is "run it", the key every tool
  // spells that way, and a function key cannot be typed into a text field —
  // which is what lets this stay an application chord.
  {
    id: 'toggle-preview', scope: 'application', section: 'View',
    keys: 'F5', description: 'Toggle preview mode',
    match: (e) => e.key === 'F5',
    run: (actions) => actions.togglePreview(),
  },
  {
    id: 'zoom-to-selection', scope: 'document', section: 'View',
    keys: 'Ctrl+Shift+P', description: 'Zoom to Selection',
    match: (e) => modOf(e) && e.shiftKey && lowerOf(e) === 'p',
  },
  {
    id: 'undo', scope: 'document', section: 'Edit',
    keys: 'Ctrl+Z', description: 'Undo',
    match: (e) => modOf(e) && !e.shiftKey && lowerOf(e) === 'z',
  },
  {
    id: 'redo', scope: 'document', section: 'Edit',
    keys: 'Ctrl+Y', description: 'Redo',
    match: (e) => modOf(e) && (lowerOf(e) === 'y' || (e.shiftKey && lowerOf(e) === 'z')),
  },
];

export function resolveGlobalShortcut(e, { editableTarget = false, actions = liveActions } = {}) {
  for (const binding of GLOBAL_SHORTCUTS) {
    if (editableTarget && binding.scope !== 'application') continue;
    if (!binding.match(e)) continue;
    if (!binding.run) return binding.id;
    e.preventDefault?.();
    binding.run(actions, e);
    return null;
  }
  return null;
}
