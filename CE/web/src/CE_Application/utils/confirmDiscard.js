/**
 * One wording for every "close something with unsaved changes" prompt.
 * Returns true when closing may proceed. Headless (tests, node) has no
 * window.confirm and proceeds unprompted, matching the old behaviour there.
 */
export function confirmDiscardUnsaved(name) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const label = name ? `"${name}"` : 'This tab';
  return window.confirm(`${label} has unsaved changes. Close it anyway?`);
}

/**
 * Confirm an action that throws work away with no save behind it.
 *
 * Same shape and same SSR rule as the function above: no `window.confirm` means proceed, because
 * refusing would make the action unreachable in a context where nothing can be lost anyway.
 *
 * Used by the design surface's "Blank" command, which replaces a component's Parts, HitZones and
 * Generators wholesale. Undo covers it, but a one-click wipe of everything on the canvas should
 * not depend on the user knowing that.
 */
export function confirmDestructive(message) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm(message);
}
