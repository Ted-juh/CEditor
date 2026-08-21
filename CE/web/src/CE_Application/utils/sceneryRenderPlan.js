// sceneryRenderPlan.js — what a panel surface actually paints, layer by layer.
//
// Both surfaces — the editor's and the preview's — used to do the same three lines: sort by layer,
// drop the hidden ones, render each control. Scenery adds two more possibilities and the two
// surfaces must agree about them exactly, or the picture changes when you press Preview. So the
// decision moves here, once, and the components render whatever list they are handed.
//
// TWO WAYS TO FOLD, AND THEY ARE NOT ALTERNATIVES. This is the thing to understand about this file.
//
//   - compileScenery draws a layer as one <img>. Cheapest by far — one element for any number of
//     controls — but an image document cannot see the page's fonts, so it REFUSES every control
//     carrying text (see the header of sceneryCompile.js).
//   - SceneryGround freezes the real rendered markup. Text survives, because CanvasControl is still
//     the only thing that ever drew it; the cost is a DOM subtree rather than one element.
//
// On a real panel the refusals are the bulk of it: the GAIA's 409 controls are 189 Labels and 27
// Backgrounds. Compiling its scenery layer folds the 27 and hands back the 189. Running the two in
// sequence — image first, then a frozen ground over whatever the image could not take — folds both.
// Gating one on the other, which is what an earlier version of this did, meant declaring a scenery
// layer could make a panel SLOWER: it traded a fold of 189 labels for an image of 27 boxes.
//
// WHAT DECIDES WHICH CONTROLS. The compiler takes a layer the author declared (`kind: 'scenery'`)
// and locked. The ground takes what the component model proves inert — a Label has no section it
// could change through — and needs nothing declared, so it applies to the refusals above and to
// every ordinary layer. `fold` turns the second one off; the first is the author's call either way.
//
// The plan is a FLAT list in paint order, mixing images, grounds and controls, because that is what
// the DOM wants: the surface stacks by document order, so each of them has to appear in the
// sequence at the depth its layer occupies rather than being drawn first and z-indexed into place.

import { sortControlsForRender } from './controlOrder.js';
import { layerNames, normalizeLayerName, normalizePanelLayers } from './panelLayers.js';
import { compileScenery, sceneryLayerIsCompiled } from './sceneryCompile.js';
import { planSceneryFold } from './sceneryModel.js';

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

export function controlItem(control) {
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

// And once more for a frozen ground, which is identified by its layer and defined by its control
// list. Compared element-wise rather than by array identity because planSceneryFold builds a fresh
// array every time it runs, while the controls inside it are the same objects until one is edited —
// so this hands back the same item across a rebuild that changed nothing, and SceneryGround's own
// content-keyed bake cache is never even consulted.
const groundItems = new Map();

function groundItem(layer, controls) {
  const previous = groundItems.get(layer);
  if (previous !== undefined
    && previous.controls.length === controls.length
    && previous.controls.every((control, i) => control === controls[i])) return previous;
  const item = { type: 'ground', layer, controls };
  groundItems.set(layer, item);
  return item;
}

/**
 * A layer's remaining controls, with the inert ones folded into a ground.
 *
 * `controls` is whatever is still live at this point — a whole ordinary layer, or the controls the
 * image compiler refused. Either way the ground goes in FIRST and the live ones follow, which is
 * the order planSceneryFold's rule is stated against: it folds a control only when nothing already
 * live overlaps it, so everything left live belongs on top of everything folded.
 */
function pushLayerControls(items, layerName, controls, folding, neverFold) {
  if (!folding) {
    for (const control of controls) items.push(controlItem(control));
    return;
  }
  const { ground, live } = planSceneryFold(controls, neverFold);
  if (ground.length > 0) items.push(groundItem(layerName, ground));
  for (const control of live) items.push(controlItem(control));
}

/**
 * @param panel the panel document
 * @param preview true in preview/export, where scenery compiles whether or not the layer is locked
 * @param fold whether to fold inert controls into a frozen ground (the editor's runtime preference;
 *        preview passes true)
 * @param neverFold ids that must stay live whatever the component model says — the controls a
 *        script has written to. See stores/scriptTouchedControls.js.
 * @returns {{ items: Array, scenery: Map }} items are
 *          `{ type: 'scenery' | 'ground' | 'control', ... }`;
 *          `scenery` maps layer name -> { folded, refusals } for the dock to report.
 */
export function buildSceneryRenderPlan(panel, { preview = false, fold = false, neverFold = null } = {}) {
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
      pushLayerControls(items, layer.name, controls, fold, neverFold);
      continue;
    }

    const result = compileScenery(controls, panel?.width ?? 0, panel?.height ?? 0);
    scenery.set(layer.name, { folded: result.folded, refusals: result.refusals });
    if (result.url) items.push(sceneryItem(layer.name, result.url));
    // Whatever the compiler refused still renders, in its own order, on top of the image it could
    // not join. Their z-order relative to each other is preserved; relative to the folded ones it
    // is not, which is the one thing declaring a layer scenery buys at a cost.
    //
    // And it goes through the SAME fold as an ordinary layer, which is the point of doing it here:
    // the refusals are mostly captions, captions are what the ground was built for, and refusing
    // them from the image is not a reason to render 189 of them as components.
    pushLayerControls(items, layer.name, result.live, fold, neverFold);
  }

  return { items, scenery };
}

/** Every layer name in the plan that compiled, for a caller that only needs the summary. */
export const compiledSceneryLayers = (plan) => [...(plan?.scenery?.keys() ?? [])];
