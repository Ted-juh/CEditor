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

export function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

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
