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

const COLOURS = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255], Y: [255, 255, 0] };
const nameOf = (px) => {
  if (!px || px[3] < 20) return 'transparent';
  for (const [name, c] of Object.entries(COLOURS)) {
    if (Math.abs(px[0] - c[0]) < 60 && Math.abs(px[1] - c[1]) < 60 && Math.abs(px[2] - c[2]) < 60) return name;
  }
  return `rgb(${px[0]},${px[1]},${px[2]})`;
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
    for (const [k, v] of Object.entries({ imageEnabled: true, imageSrc, imageFit: 'fill',
      imageAlign: 'center', imageOpacity: 100, solidEnabled: false, gradientEnabled: false,
      overlayEnabled: false })) {
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
  // left and right identify WHICH part of the image is on screen; top catches letterboxing; edge
  // catches an image drawn smaller than the frame. `top` deliberately avoids x=0.5, which is a
  // colour boundary in two of the five modes and would make the answer depend on rounding.
  const P = { left: [0.125, 0.5], right: [0.875, 0.5], top: [0.3, 0.05], edge: [0.03, 0.5] };
  const probe = async (fit) => {
    await setFit(fit);
    const css = await liveCss();
    const px = await bakedSamples([P.left, P.right, P.top, P.edge]);
    return { css, baked: px.map(nameOf) };
  };

  // --- stretch: both sides agree already, which is the control for the rest -----------------------
  {
    const r = await probe('stretch');
    led.check('imageFit', "'stretch' (live)", 'the live layer squashes the image to the frame',
      '100% 100%', r.css?.size);
    led.check('imageFit', "'stretch' (baked)", 'and the bake squashes it the same way, so all four columns are across the frame',
      ['R', 'Y', 'G', 'R'], r.baked);
  }

  // --- fill: the one root flagged ------------------------------------------------------------------
  {
    const r = await probe('fill');
    led.check('imageFit', "'fill' (live)", 'the live layer COVERS the frame — aspect kept, sides cropped',
      'cover', r.css?.size);
    // Cover scales 80×20 by 5 to 400×100 and centres it, so the visible window is image x 30..50:
    // green at the left eighth and blue at the right, not red and yellow.
    // Cover scales 80×20 by 5 to 400×100 and centres it, so the visible window is image x 30..50:
    // green and blue, never the red and yellow that a stretch shows at the same two points.
    led.check('imageFit', "'fill' (baked matches live)", 'the bake must cover too, or an exported component is not the one on screen',
      ['G', 'B', 'G', 'G'], r.baked);
  }

  // --- fit / contain --------------------------------------------------------------------------------
  {
    const r = await probe('fit');
    led.check('imageFit', "'fit' (live)", 'the live layer contains the image inside the frame', 'contain', r.css?.size);
    led.check('imageFit', "'fit' (baked matches live)", 'the bake letterboxes it the same way, so the top of the frame is empty',
      ['R', 'Y', 'transparent', 'R'], r.baked);
  }

  // --- original -------------------------------------------------------------------------------------
  {
    const r = await probe('original');
    led.check('imageFit', "'original' (live)", 'the live layer draws it at its natural size', 'auto', r.css?.size);
    led.check('imageFit', "'original' (baked matches live)", 'the bake draws it at natural size too, leaving the frame edges empty',
      ['R', 'Y', 'transparent', 'transparent'], r.baked);
  }

  // --- tile -------------------------------------------------------------------------------------------
  {
    const r = await probe('tile');
    led.check('imageFit', "'tile' (live)", 'the live layer repeats the image across the frame',
      'repeat', r.css?.repeat);
    led.check('imageFit', "'tile' (baked repeats)", 'the bake repeats it too rather than covering once',
      true, r.baked.every((c) => c !== 'transparent'));
    // A repeat is only a repeat if the pattern comes back round: at 25% of the frame per tile, two
    // points one whole tile apart must land on the same colour.
    const pair = await bakedSamples([[0.05, 0.5], [0.30, 0.5]]);
    led.check('imageFit', "'tile' (the pattern repeats)", 'two points one tile apart show the same colour',
      nameOf(pair[0]), nameOf(pair[1]));
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
