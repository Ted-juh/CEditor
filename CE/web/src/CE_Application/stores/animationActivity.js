/**
 * animationActivity.js — which animations just played, per control.
 *
 * The Animation tab shows a light beside each animation the moment it fires, so you can hover,
 * press and drag a control in the preview and SEE which trigger caught which change — the
 * question the editor could not answer while triggers were ignored.
 *
 * Written by CanvasControl's transition tracker and by the keyframe player; read by the tab.
 * Only the most recent firing per control is kept; `seq` increases on every note, so a reader can
 * tell the same animation firing twice in a row from it firing once.
 */
import { writable } from 'svelte/store';

export const animationActivity = writable({});

let seq = 0;

export function noteAnimationsFired(controlId, names) {
  const id = String(controlId ?? '');
  const list = (Array.isArray(names) ? names : []).map(String).filter(Boolean);
  if (!id || !list.length) return;
  seq += 1;
  const at = typeof performance !== 'undefined' ? performance.now() : Date.now();
  animationActivity.update((current) => ({ ...current, [id]: { names: list, at, seq } }));
}

export function clearAnimationActivity() {
  animationActivity.set({});
}
