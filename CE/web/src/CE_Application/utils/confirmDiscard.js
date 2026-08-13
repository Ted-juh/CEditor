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
