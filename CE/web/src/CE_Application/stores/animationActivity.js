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

/**
 * Requests to play a keyframe animation now, per control: `{ [controlId]: { [name]: seq } }`.
 *
 * Written by ce.anim.play and by the Animation tab's Play; read by each control's keyframe player
 * (utils/keyframeAnimation.js), which plays an animation whose seq moved since its last frame. A
 * seq rather than a flag, so asking twice plays twice.
 */
export const animationPlays = writable({});

let playSeq = 0;

export function requestAnimationPlay(controlId, name) {
  const id = String(controlId ?? '');
  const animation = String(name ?? '');
  if (!id || !animation) return false;
  playSeq += 1;
  animationPlays.update((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [animation]: playSeq } }));
  return true;
}
