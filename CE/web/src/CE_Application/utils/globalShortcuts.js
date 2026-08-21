/**
 * Application-wide keyboard chords, resolved in one place.
 *
 * Two classes of chord, split by how they interact with text editing:
 *  - Application chords (save, open, new, close, help, settings) fire even
 *    while an input has focus — they never conflict with typing.
 *  - Document chords (undo/redo, zoom-to-selection) are suppressed while the
 *    target is editable, so native text-field undo keeps working and a typo
 *    fix never reverts a whole panel.
 *
 * Pure resolver so it can be unit tested; the caller acts on the returned
 * command name.
 */

/**
 * Alias in this module's vocabulary for the one shared "is the user typing?" test.
 * The implementation lives in textEntry.js so that every global key handler — this
 * resolver, the editor canvas, the panic-layout bindings — agrees on the answer.
 */
export { isTextEntryTarget as isEditableTarget } from './textEntry.js';

export function resolveGlobalShortcut(e, { editableTarget = false } = {}) {
  const mod = e.ctrlKey || e.metaKey;
  const key = typeof e.key === 'string' ? e.key : '';
  const lower = key.toLowerCase();

  if (key === 'F1') return 'toggle-shortcuts';

  if (mod && e.shiftKey && lower === 's') return 'save-as';
  if (mod && lower === 's') return 'save';
  if (mod && lower === 'n') return 'new-panel';
  if (mod && lower === 'o') return 'open-panel';
  if (mod && lower === 'w') return 'close-tab';
  if (mod && key === ',') return 'open-settings';

  if (editableTarget) return null;

  if (mod && e.shiftKey && lower === 'p') return 'zoom-to-selection';
  if (mod && !e.shiftKey && lower === 'z') return 'undo';
  if (mod && (lower === 'y' || (e.shiftKey && lower === 'z'))) return 'redo';

  return null;
}
