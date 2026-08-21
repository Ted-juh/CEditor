/**
 * Is the user typing into something?
 *
 * A keyboard shortcut and a keystroke are the same event; only where the focus is tells them apart.
 * Every global key handler in this app therefore has to ask this before acting, and the ones that
 * did not caused a real bug: the editor's shortcut handler sits on the wrapper that also contains
 * the Settings view, so Backspace in a settings text box never reached the box — and, if a control
 * happened to be selected, deleted it instead. Ctrl+Z in a text field undid a panel edit rather than
 * the typing.
 *
 * Deliberately generous about what counts as typing. Over-guarding costs a shortcut that does not
 * fire while a field has focus, which the user can see and work around. Under-guarding costs a
 * control they did not mean to delete, which they may not notice until later.
 *
 * Checkboxes, radios and buttons are excluded because nothing is being typed into them — a shortcut
 * pressed while a checkbox has focus is a shortcut, not a keystroke.
 */

/** Input types that hold no text, so a key pressed over them is a shortcut rather than typing. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset']);

export function isTextEntryTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable === true) return true;

  const tag = String(target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;

  return !NON_TEXT_INPUTS.has(String(target.type ?? 'text').toLowerCase());
}
