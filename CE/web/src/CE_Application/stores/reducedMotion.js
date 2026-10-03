/**
 * reducedMotion.js — the operating system's "reduce motion" setting, as a store.
 *
 * The LCD and pixel renderers already read `prefers-reduced-motion` once when they start a
 * scroll. Panel animations did not read it at all; only the slider renderer looked at the
 * preview's own Reduced motion switch, and nothing else did. This store follows the OS setting
 * live, so turning it on stops panel animations without reopening anything.
 */
import { readable } from 'svelte/store';

const QUERY = '(prefers-reduced-motion: reduce)';

export const systemReducedMotion = readable(false, (set) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  let media;
  try { media = window.matchMedia(QUERY); } catch { return undefined; }
  set(media.matches === true);
  const onChange = (event) => set(event.matches === true);
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
});
