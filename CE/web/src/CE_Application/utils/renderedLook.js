// renderedLook.js — a part drawn as a rendered object: a turned knob body with its grooves, its top
// and its materials, lit by the set's lamp (docs/design/changeable-control-sets.md, piece E).
//
// A rendered look is a MATERIAL OF A PART, not a filmstrip. A knob plate whose `look` is 'rendered'
// is drawn from its own properties (renderProfile, renderCount, renderDepth, renderTaper,
// renderHeight, renderTop, renderMaterial, renderTopMaterial, renderTopColour, and its fill colour
// for the body) by one WebGL2 fragment shader that ray-marches the shape and lights it as a panel is
// lit: a key light from the set's lamp, a soft fill, a dim studio to reflect. The pointer, the scale,
// the arc, the labels and the readout stay ordinary parts, so they keep working and stay editable.
//
// Images are made on demand, one at a time, and kept by their properties, size and screen scale: a
// round body is one image whatever the value; a grooved one that turns gets one per position of its
// repeat (eight), so its highlights stay where the lamp is while its grooves turn. Until an image is
// ready, or where WebGL2 is not available, the part draws its plain fill.
//
// The owner's decision (2026-11-03): live in the editor, baked into the plug-in at export, so the
// plug-in needs no WebGL and Linux, whose webview has no GPU, needs no JUCE patch.
//
// The shader began as the prototype of the Blender mock-up (scratchpad, 2026-11-02). It lives in
// utils/renderedLookCore.js with the specs and the drawing, with no imports, so the export tools can
// draw the same images in a bare page; this file is the editor's side: the store, the queue, the bake.

import { writable } from 'svelte/store';
import { createRenderedLookRenderer, renderedBakeKey, renderedLookJobs, renderedLookKey } from './renderedLookCore.js';

export {
  RENDERED_BLOCK_TOPS, RENDERED_DEVICE_FRAME, RENDERED_FRAME, RENDERED_MARGIN, RENDERED_MATERIALS, RENDERED_METER_FRAME, RENDERED_PROFILES, RENDERED_TOPS,
  lampDirection, renderedBakeKey, renderedBlockSpec, renderedCapSpec, renderedDevicePartSpec, renderedFrame, renderedLookJobs, renderedMeterPartSpec,
  renderedLookKey, renderedLookSpec, renderedTurn, renderedTurns,
} from './renderedLookCore.js';

/** Made images, by key: a store, so a part redraws when its image arrives. */
export const renderedLooks = writable(new Map());

// Images baked into an exported panel (bakeRenderedLooks), by spec and turn, any size: what the
// plug-in draws, where no WebGL may be.
const baked = new Map();

/** Takes the images an exported panel carries (its `renderedLookImages`), so its parts draw them. */
export function loadBakedRenderedLooks(images) {
  if (!images || typeof images !== 'object') return 0;
  let count = 0;
  for (const [key, url] of Object.entries(images)) {
    if (typeof url === 'string' && url.startsWith('data:image/')) { baked.set(key, url); count += 1; }
  }
  if (count) renderedLooks.update((map) => new Map(map));
  return count;
}

let renderer = null;
let unavailable = false;
const queue = [];
const queued = new Set();
let working = false;

function next() {
  if (working || !queue.length) return;
  working = true;
  const job = queue.shift();
  const run = () => {
    let url = null;
    try {
      if (!renderer && !unavailable) {
        renderer = createRenderedLookRenderer(document.createElement('canvas'));
        if (!renderer) unavailable = true;
      }
      if (renderer) url = renderer(job.spec, job.size, job.angle);
    } catch (error) {
      unavailable = true;
      console.warn('[renderedLook] cannot render:', error?.message ?? error);
    }
    queued.delete(job.key);
    if (url) renderedLooks.update((map) => new Map(map).set(job.key, url));
    working = false;
    next();
  };
  // One image a frame at most, so a panel of rendered knobs fills in rather than freezing.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
}

/**
 * The image for `spec` at `size` device pixels and `angle`, or null while it is being made (or
 * where WebGL2 is not available: the part draws its plain fill). Asks for it if it is not there.
 */
export function requestRenderedLook(map, spec, size, angle = 0) {
  const px = Math.max(8, Math.min(1024, Math.round(size)));
  const key = renderedLookKey(spec, px, angle);
  const made = map?.get(key);
  if (made) return made;
  const carried = baked.get(renderedBakeKey(spec, angle));
  if (carried) return carried;
  if (unavailable || typeof document === 'undefined' || queued.has(key)) return null;
  queued.add(key);
  queue.push({ key, spec, size: px, angle });
  next();
  return null;
}

/** Whether images can be made here (false once WebGL2 has been found missing). */
export function renderedLooksAvailable() {
  return !unavailable;
}

/**
 * Bakes the rendered looks of `controls` for an exported panel: every image each rendered part needs
 * (renderedLookJobs), made here (where WebGL2 is) at `size` pixels, each distinct one once, by
 * renderedBakeKey. `resolve` gives a control as it is drawn (its set's family and colour roles), so
 * the images are the ones the plug-in's parts ask for. The plug-in loads them
 * (loadBakedRenderedLooks) and needs no WebGL; Linux's webview has none.
 * `{ images, plates, failed }`, `plates` the rendered parts: where WebGL2 is missing, nothing is
 * baked and those parts draw their plain fill in the plug-in, and `failed` says how many images.
 */
export async function bakeRenderedLooks(controls, { lamp = null, size = 320, resolve = null, resolveColour = (value) => value } = {}) {
  const images = {};
  let plates = 0;
  let failed = 0;
  for (const control of controls ?? []) {
    const drawn = resolve ? resolve(control) : control;
    const parts = Object.values(drawn?._children?.Parts?._children ?? {});
    plates += parts.filter((part) => String(part?.look ?? '') === 'rendered' && part?.visible !== false).length;
    for (const { spec, angle } of renderedLookJobs(drawn, { lamp, resolveColour })) {
      const key = renderedBakeKey(spec, angle);
      if (images[key]) continue;
      try {
        if (!renderer && !unavailable && typeof document !== 'undefined') {
          renderer = createRenderedLookRenderer(document.createElement('canvas'));
          if (!renderer) unavailable = true;
        }
        if (!renderer) { failed += 1; continue; }
        images[key] = renderer(spec, size, angle);
        // Let the page breathe between images: a software renderer takes seconds over each.
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        failed += 1;
        console.warn('[renderedLook] cannot bake:', error?.message ?? error);
      }
    }
  }
  return { images, plates, failed };
}
