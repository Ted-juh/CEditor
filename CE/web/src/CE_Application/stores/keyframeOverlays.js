// keyframeOverlays.js — what a running keyframe animation is doing to a control, right now.
//
// A keyframe animation (utils/keyframePlayer.js) does not touch the document and does not write
// the preview session sixty times a second. It writes here: one patch map per control, path to
// value, which `resolveInteractiveControl` applies after the state patches and before scaling, so
// an animated rotation or colour lands exactly where a state's would. The Animation tab's scrub
// writes the same store, which is why dragging the playhead poses the control on the canvas in
// design view, with no preview session at all.
//
// Null for a control means nothing is running. A control that is unmounted clears its entry.
import { writable } from 'svelte/store';

export const keyframeOverlays = writable({});

/** Replace a control's overlay (a path → value map), or clear it with null. */
export function setKeyframeOverlay(controlId, overlay) {
  const id = String(controlId ?? '');
  if (!id) return;
  keyframeOverlays.update((all) => {
    if (!overlay || Object.keys(overlay).length === 0) {
      if (!(id in all)) return all;
      const next = { ...all };
      delete next[id];
      return next;
    }
    return { ...all, [id]: overlay };
  });
}

export function clearKeyframeOverlays() {
  keyframeOverlays.set({});
}
