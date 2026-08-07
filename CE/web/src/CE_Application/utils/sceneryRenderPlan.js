// sceneryRenderPlan.js — what a panel surface actually paints, layer by layer.
//
// Both surfaces — the editor's and the preview's — used to do the same three lines: sort by layer,
// drop the hidden ones, render each control. Scenery adds a fourth possibility (a whole layer
// collapsing into one image) and the two surfaces must agree about it exactly, or the picture
// changes when you press Preview. So the decision moves here, once, and the components render
// whatever list they are handed.
//
// The plan is a FLAT list in paint order, mixing images and controls, because that is what the DOM
// wants: the surface stacks by document order, so a scenery image has to appear in the sequence at
// the depth its layer occupies rather than being drawn first and z-indexed into place.

import { sortControlsForRender } from './controlOrder.js';
import { layerNames, normalizeLayerName, normalizePanelLayers } from './panelLayers.js';
import { compileScenery, sceneryLayerIsCompiled } from './sceneryCompile.js';

/**
 * @param panel the panel document
 * @param preview true in preview/export, where scenery compiles whether or not the layer is locked
 * @returns {{ items: Array, scenery: Map }} items are `{ type: 'scenery' | 'control', ... }`;
 *          `scenery` maps layer name -> { folded, refusals } for the dock to report.
 */
export function buildSceneryRenderPlan(panel, { preview = false } = {}) {
  const layers = normalizePanelLayers(panel?.layers, panel?.controls ?? []);
  const names = layerNames(layers);
  const ordered = sortControlsForRender(panel?.controls ?? [], names);

  // Grouped in one pass, keeping the sorted order inside each layer — that order is the z-order
  // within the layer, and re-sorting per layer would be the same work done once per layer.
  const byLayer = new Map(names.map((name) => [name, []]));
  for (const control of ordered) {
    const name = normalizeLayerName(control?._children?.Core?.layer);
    if (byLayer.has(name)) byLayer.get(name).push(control);
    else byLayer.set(name, [control]);
  }

  const items = [];
  const scenery = new Map();

  for (const layer of layers) {
    if (layer.visible === false) continue;
    const controls = byLayer.get(layer.name) ?? [];
    if (controls.length === 0) continue;

    if (!sceneryLayerIsCompiled(layer, { preview })) {
      for (const control of controls) items.push({ type: 'control', control });
      continue;
    }

    const result = compileScenery(controls, panel?.width ?? 0, panel?.height ?? 0);
    scenery.set(layer.name, { folded: result.folded, refusals: result.refusals });
    if (result.url) items.push({ type: 'scenery', layer: layer.name, url: result.url });
    // Whatever the compiler refused still renders, in its own order, on top of the image it could
    // not join. Their z-order relative to each other is preserved; relative to the folded ones it
    // is not, which is the one thing declaring a layer scenery buys at a cost.
    for (const control of result.live) items.push({ type: 'control', control });
  }

  return { items, scenery };
}

/** Every layer name in the plan that compiled, for a caller that only needs the summary. */
export const compiledSceneryLayers = (plan) => [...(plan?.scenery?.keys() ?? [])];
