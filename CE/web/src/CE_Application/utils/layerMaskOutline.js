// layerMaskOutline.js — Mask With Layer: another layer's outline as this layer's mask.
//
// Figma's "Use as mask" and Photoshop's clipping mask, in this model's terms: the source layer's
// outline (utils/partOutlines.js, the same one Combine Shapes uses) filled white in an SVG, placed
// where that outline sits. Linked, it is placed in the masked layer's own box, so the two move
// together from here on; not linked, on the artboard, so the masked layer can move under it. The
// source layer is left as it is: hide it when it should only mask.
//
// Async, because the outline is Paper.js, loaded on first use.

import { isBooleanGroup, loadGeometry, partOutline } from './partOutlines.js';
import { computeBooleanShape } from './booleanGroups.js';
import { partFrame } from './customDesignSurfaceGeometry.js';
import { svgToDataUrl } from './partsToSvg.js';
import { numberOr } from './primitives.js';

const round2 = (value) => Math.round(value * 100) / 100;

async function outlineOnArtboard(geo, part, width, height) {
  if (isBooleanGroup(part)) {
    // A combined shape: its outline comes back in its own box, placed at `bounds`.
    const shape = await computeBooleanShape(part, width, height);
    if (!shape || shape.empty || !shape.pathData) return null;
    const item = new geo.scope.CompoundPath({ pathData: shape.pathData, insert: false });
    item.translate(new geo.scope.Point(shape.bounds.x, shape.bounds.y));
    return item;
  }
  return partOutline(geo, part, width, height);
}

/**
 * The mask that shows `target` only inside `source`'s outline, or null when `source` has no outline
 * with area. `width` × `height` is the artboard. Resolves to `{ src, x, y, width, height, linked }`
 * in the mask model's terms (utils/partMask.js).
 */
export async function layerOutlineMask(source, target, width, height, { linked = true } = {}) {
  if (!source || !target || !(width > 0) || !(height > 0)) return null;
  const geo = await loadGeometry();
  const item = await outlineOnArtboard(geo, source, width, height);
  if (!item || item.isEmpty()) return null;
  let ref = { left: 0, top: 0, width, height };
  if (linked) {
    // Into the target's own box: undo its turn and scale about its pivot, as its CSS applies them.
    const frame = partFrame(target, width, height);
    if (!(frame.width > 0) || !(frame.height > 0)) return null;
    const layout = target?._children?.Layout ?? {};
    const pivot = new geo.scope.Point(
      frame.left + frame.width * numberOr(layout.pivotX, 50) / 100,
      frame.top + frame.height * numberOr(layout.pivotY, 50) / 100,
    );
    const rotation = numberOr(layout.rotation, 0);
    if (Math.abs(rotation) > 1e-6) item.rotate(-rotation, pivot);
    const scale = Math.max(0.01, numberOr(layout.scale, 1));
    if (Math.abs(scale - 1) > 1e-6) item.scale(1 / scale, pivot);
    ref = frame;
  }
  const bounds = item.bounds;
  if (!(bounds.width > 0.01) || !(bounds.height > 0.01)) return null;
  const bx = bounds.x;
  const by = bounds.y;
  const bw = round2(bounds.width);
  const bh = round2(bounds.height);
  item.translate(new geo.scope.Point(-bx, -by));
  const d = item.getPathData(null, 3);
  if (!d) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}" preserveAspectRatio="none">`
    + `<path fill="#fff" fill-rule="evenodd" d="${d}"/></svg>`;
  return {
    src: svgToDataUrl(svg),
    x: round2((bx - ref.left) / ref.width * 100),
    y: round2((by - ref.top) / ref.height * 100),
    width: round2(bounds.width / ref.width * 100),
    height: round2(bounds.height / ref.height * 100),
    linked: !!linked,
  };
}
