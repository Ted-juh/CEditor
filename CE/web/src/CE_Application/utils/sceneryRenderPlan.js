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

// THE ITEM WRAPPERS ARE REUSED, and this is a performance contract rather than tidiness.
//
// The plan feeds a keyed `{#each}`. Svelte matches items by key — the control id, which is stable
// — and then writes each matched item's value signal, skipping the write when the value is
// unchanged. Minting `{ type: 'control', control }` afresh every rebuild defeats that skip: every
// wrapper is a new object, so every one of the 413 items counts as changed and every write walks
// the reaction graph. Measured on the GAIA panel, one drag commit did 840 such writes; only one
// control had actually moved.
//
// Controls are immutable — an edit replaces the control rather than mutating it — so identity is
// exactly the right key. A WeakMap means an unchanged control hands back the same wrapper and a
// replaced one gets a fresh wrapper, with no bookkeeping and nothing to clean up.
const controlItems = new WeakMap();

function controlItem(control) {
  let item = controlItems.get(control);
  if (item === undefined) {
    item = { type: 'control', control };
    controlItems.set(control, item);
  }
  return item;
}

// Same idea for a compiled layer, keyed by layer name because that is what identifies it across
// rebuilds; the entry is replaced when the image changes. Bounded by the number of layers.
const sceneryItems = new Map();

function sceneryItem(layer, url) {
  const previous = sceneryItems.get(layer);
  if (previous !== undefined && previous.url === url) return previous;
  const item = { type: 'scenery', layer, url };
  sceneryItems.set(layer, item);
  return item;
}

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
      for (const control of controls) items.push(controlItem(control));
      continue;
    }

    const result = compileScenery(controls, panel?.width ?? 0, panel?.height ?? 0);
    scenery.set(layer.name, { folded: result.folded, refusals: result.refusals });
    if (result.url) items.push(sceneryItem(layer.name, result.url));
    // Whatever the compiler refused still renders, in its own order, on top of the image it could
    // not join. Their z-order relative to each other is preserved; relative to the folded ones it
    // is not, which is the one thing declaring a layer scenery buys at a cost.
    for (const control of result.live) items.push(controlItem(control));
  }

  return { items, scenery };
}

/** Every layer name in the plan that compiled, for a caller that only needs the summary. */
export const compiledSceneryLayers = (plan) => [...(plan?.scenery?.keys() ?? [])];
