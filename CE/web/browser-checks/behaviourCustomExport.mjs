/**
 * behaviourCustomExport.mjs — does the BAKED filmstrip look like the LIVE part?
 *
 * Baking a custom component to a filmstrip is an export path: the picture the canvas draws has to
 * be the picture the panel was showing. Two separate implementations decide how an image fills a
 * part — `plainFillCSS.imageLayerStyle` → `backgroundCSS.buildLayerStyle` → `fitToCSS` for the live
 * one, and `customComponentFilmstripBaker.imageFitRect` for the baked one — and two functions meant
 * to agree do not stay agreeing, which is a lesson already written down in plainFillCSS's own
 * header comment.
 *
 * The test image is deliberately asymmetric: 80×20, four equal columns — red, green, blue, yellow —
 * in a square 100×100 frame. Every fit mode then puts a different colour under the same sample
 * point, so the modes cannot be confused with one another:
 *
 *   stretch   the whole image squashed to the frame          → red at the left eighth
 *   fill      cover: scaled to fill, sides cropped off       → GREEN at the left eighth
 *   fit       contain: letterboxed                           → transparent at the top
 *   original  natural size, centred                          → transparent at the left edge
 *   tile      repeated                                       → the pattern comes back round
 *
 * Run: node browser-checks/behaviourCustomExport.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('custom export');

const COLOURS = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255], Y: [255, 255, 0], W: [255, 255, 255] };
/**
 * NEAREST of the five known colours, not "within a tolerance of one of them".
 *
 * A probe can land on the seam between two tiles — the tiles here are about six pixels tall — and
 * the compositor and the canvas do not have to round that seam the same way. A threshold then has
 * to be widened until it stops rejecting blends, at which point it is an arbitrary number that
 * quietly accepts other things too. Nearest-colour needs no number: a blend resolves to whichever
 * side it is closer to, and a genuinely wrong colour still lands somewhere else. A real mismatch
 * moves several probes at once, which is what the tile phase did before it was fixed.
 */
const nameOf = (px) => {
  if (!px || px[3] < 20) return 'transparent';
  let best = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(COLOURS)) {
    const d = (px[0] - c[0]) ** 2 + (px[1] - c[1]) ** 2 + (px[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
};

try {
  await kit.fresh();

  // The asymmetric test image, built in the page so it needs no fixture on disk.
  const imageSrc = await kit.page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 80; c.height = 20;
    const x = c.getContext('2d');
    const cols = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 20, 0, 20, 20); });
    return c.toDataURL('image/png');
  });

  // A REAL STARTER PART, not a hand-built one. A part assembled here by hand bakes to an empty
  // frame — the baker clips every fill to the part's own path, and a part missing the corner and
  // shape data a starter carries produces an empty path that clips the whole thing away. That is a
  // property of my fixture, not of the exporter, so the fixture is a shipped part with its image
  // fill swapped.
  const id = await kit.make('CustomComponent', {});
  const partName = await kit.page.evaluate(async ({ id, imageSrc }) => {
    const { createCustomComponentStarterPatch } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch, updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, createCustomComponentStarterPatch('starter.labelledTwoStateButton'));
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
    const first = Object.keys(c._children.Parts._children)[0];
    // One part only, spanning the whole component, so the frame is square and the maths is plain.
    for (const other of Object.keys(c._children.Parts._children)) {
      if (other !== first) updateControlProperty(id, `Parts.${other}.visible`, false);
    }
    updateControlProperty(id, 'Transform.width', 100);
    updateControlProperty(id, 'Transform.height', 100);
    for (const [k, v] of Object.entries({ x: 50, y: 50, width: 100, height: 100,
      widthUnit: 'percent', heightUnit: 'percent' })) {
      updateControlProperty(id, `Parts.${first}.Layout.${k}`, v);
    }
    // AN OPAQUE UNDERLAY, on purpose. The live side is a screenshot — everything is composited over
    // whatever is behind it — while the baked side is a PNG with real alpha, so any area the image
    // does not cover reads as the backdrop in one and as transparent in the other, and the two can
    // never agree there however correct the exporter is. A white solid fill beneath the image is
    // drawn by both paths, so both sides composite the same way and a difference means a difference.
    for (const [k, v] of Object.entries({ imageEnabled: true, imageSrc, imageFit: 'fill',
      imageAlign: 'center', imageOpacity: 100, solidEnabled: true, colour: 'FFFFFFFF',
      gradientEnabled: false, overlayEnabled: false })) {
      updateControlProperty(id, `Parts.${first}.Background.Fill.${k}`, v);
    }
    return first;
  }, { id, imageSrc });
  await kit.settle(360);

  const setFit = async (fit) => {
    await kit.page.evaluate(async ({ id, fit, partName }) => {
      const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
      updateControlProperty(id, `Parts.${partName}.Background.Fill.imageFit`, fit);
    }, { id, fit, partName });
    await kit.settle(240);
  };

  /** What the LIVE part resolved to, straight off the rendered element. */
  const liveCss = () => kit.page.evaluate((i) => {
    const el = document.querySelector(`[data-control-id="${i}"]`);
    const layers = [...el.querySelectorAll('*')].filter((n) => {
      const cs = getComputedStyle(n);
      return cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage);
    });
    const n = layers[layers.length - 1];
    if (!n) return null;
    const cs = getComputedStyle(n);
    return { size: cs.backgroundSize, repeat: cs.backgroundRepeat, position: cs.backgroundPosition };
  }, id);

  /** Bake one frame and sample it, in the baked image's own pixels. */
  const bakedSamples = async (points) => kit.page.evaluate(async ({ id, points }) => {
    const { bakeCustomComponentFilmstrip } = await import('/src/CE_Application/utils/customComponentFilmstripBaker.js');
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
    const asset = await bakeCustomComponentFilmstrip(c, { frameCount: 1, scale: 1 });
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('bake did not load')); img.src = asset.source; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0);
    return points.map(([fx, fy]) => {
      const d = cx.getImageData(
        Math.min(cv.width - 1, Math.round(asset.frameWidth * fx)),
        Math.min(cv.height - 1, Math.round(asset.frameHeight * fy)), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    });
  }, { id, points });

  // Sample points chosen so each mode answers differently.
  // EVERY COMPARISON BELOW IS PIXELS AGAINST PIXELS. An earlier version of this file read the live
  // CSS string and compared it to baked pixels, which tests this file's reading of what
  // `background-size: cover` means rather than what the browser painted — a fair hit in review. The
  // live side is now a real screenshot of the element, decoded in the page; the baked side is the
  // exported PNG, decoded the same way. The two are sampled at the same fractions of the frame.
  // Kept off the outer 5%: the live screenshot includes the control's own border, which the baked
  // frame has no reason to carry, and a probe sitting on it compares chrome rather than the image.
  const P = [[0.125, 0.5], [0.875, 0.5], [0.3, 0.08], [0.07, 0.5], [0.5, 0.92], [0.7, 0.3]];
  const compare = async (label, promise) => {
    const live = (await kit.livePixels(id, P)).map(nameOf);
    const baked = (await bakedSamples(P)).map(nameOf);
    led.check('imageFit', label, promise, live, baked);
    return { live, baked };
  };

  const setFill = async (patch) => {
    await kit.page.evaluate(async ({ id, patch, partName }) => {
      const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
      for (const [k, v] of Object.entries(patch)) {
        updateControlProperty(id, `Parts.${partName}.Background.Fill.${k}`, v);
      }
    }, { id, patch, partName });
    await kit.settle(260);
  };

  // --- the five fit modes, live pixels against baked pixels -----------------------------------------
  for (const fit of ['stretch', 'fill', 'fit', 'original', 'tile']) {
    await setFill({ imageFit: fit, imageAlign: 'center', imageOffsetX: 0, imageOffsetY: 0,
      imageRotation: 0, imageFlipH: false, imageFlipV: false, imageOpacity: 100, imageTileScale: 1 });
    await compare(`'${fit}' — live pixels vs baked pixels`,
      'the exported filmstrip paints what the component paints');
  }

  // --- imageAlign: the property the baker ignored entirely --------------------------------------------
  // Each alignment puts a different part of the image under the same probe, so an implementation
  // that centres everything regardless cannot pass more than one of these.
  for (const fit of ['fit', 'original', 'fill']) {
    for (const align of ['top-left', 'center', 'bottom-right']) {
      await setFill({ imageFit: fit, imageAlign: align, imageOffsetX: 0, imageOffsetY: 0 });
      await compare(`'${fit}' aligned ${align}`,
        'the bake honours the alignment the live layer is using');
    }
  }

  // --- tile alignment and scale ------------------------------------------------------------------------
  for (const align of ['top-left', 'center']) {
    for (const tileScale of [1, 2]) {
      await setFill({ imageFit: 'tile', imageAlign: align, imageTileScale: tileScale });
      await compare(`'tile' aligned ${align} at scale ${tileScale}`,
        'the repeat starts where the live layer starts it, at the same tile size');
    }
  }

  // --- the transform properties the Fill already exposes ------------------------------------------------
  await setFill({ imageFit: 'fill', imageAlign: 'center', imageTileScale: 1 });
  for (const [label, patch] of [
    ['offset', { imageOffsetX: 12, imageOffsetY: -8 }],
    ['flipH', { imageOffsetX: 0, imageOffsetY: 0, imageFlipH: true }],
    ['flipV', { imageFlipH: false, imageFlipV: true }],
    ['rotation 90', { imageFlipV: false, imageRotation: 90 }],
    ['rotation 135', { imageRotation: 135 }],
    ['opacity 40', { imageRotation: 0, imageOpacity: 40 }],
  ]) {
    await setFill(patch);
    await compare(`'fill' with ${label}`, 'the bake applies the same transform the live layer does');
  }
  await setFill({ imageOpacity: 100 });

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
