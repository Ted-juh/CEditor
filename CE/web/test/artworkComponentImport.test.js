// SVG and Photoshop drawings made components of layers (docs/design/changeable-control-sets.md,
// "Bringing designs in"; the owner: "make it easy to import ... into a customisable component in
// layers"). Every shape or layer is a layer to change; the names say what moves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { writePsdUint8Array } from 'ag-psd';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { planSvgComponentImport } from '../src/CE_Application/utils/svgComponentImport.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { artworkRole, describeArtworkComponent, nameWords } from '../src/CE_Application/utils/artworkComponent.js';
import { parsePathData, modelBounds } from '../src/CE_Application/utils/bezierPath.js';

const parts = (plan) => plan.component._children.Parts._children;
const bindings = (plan) => Object.values(plan.component._children.Bindings._children);

const KNOB = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180" viewBox="0 0 80 90">
<defs>
 <radialGradient id="cap" cx="40%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#333" stop-opacity="0.5"/></radialGradient>
 <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#888"/><stop offset="1" stop-color="#111"/></linearGradient>
 <style>.edge{stroke:#000;stroke-width:1}.ink{fill:#E33}</style>
</defs>
<g id="Shadow" opacity="0.5"><circle cx="41" cy="43" r="28" fill="#000"/></g>
<circle id="skirt" cx="40" cy="40" r="28" fill="url(#fade)" class="edge"/>
<circle id="cap" cx="40" cy="40" r="20" fill="url(#cap)"/>
<g id="pointer"><rect x="38.5" y="20" width="3" height="14" rx="1.5" class="ink"/></g>
<path d="M10 70 L70 70" stroke="#ccc" stroke-width="2"/>
<text x="40" y="86" text-anchor="middle" font-size="7" font-weight="bold" fill="#eee" font-family="DM Sans, sans-serif">CUTOFF</text>
</svg>`;

test('names: whole words, in the layer or its groups, the layer\'s own first', () => {
  assert.deepEqual(nameWords('pointerShadow copy-2'), ['pointer', 'shadow', 'copy', '2']);
  assert.equal(artworkRole(['Pointer copy 2']), 'turns');
  assert.equal(artworkRole(['spotlight']), '', 'not "light" inside another word');
  assert.equal(artworkRole(['body', 'knob/pointer']), 'turns', 'from a group');
  assert.equal(artworkRole(['LED on']), 'on');
  assert.equal(artworkRole(['cap']), '', 'a cap stays still: its highlight would swing round');
  assert.equal(artworkRole(['cap turns']), 'turns');
  assert.equal(artworkRole(['Fader thumb']), 'moves');
  assert.equal(artworkRole(['track']), 'track');
});

test('an SVG knob: every shape a vector layer, the gradients, strokes and text kept, the pointer wired to turn', () => {
  const plan = planSvgComponentImport(KNOB, { fileName: 'Cutoff Knob.svg' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.equal(plan.name, 'Cutoff Knob');
  // Its size in pixels, from width and height, the viewBox scaled into them.
  assert.equal(plan.component._children.Transform.width, 160);
  assert.equal(plan.component._children.Transform.height, 180);
  const p = parts(plan);
  assert.deepEqual(Object.keys(p), ['Shadow', 'skirt', 'cap', 'pointer', 'path', 'CUTOFF']);
  for (const name of ['Shadow', 'skirt', 'cap', 'pointer', 'path']) {
    assert.equal(p[name].kind, 'path', name);
    assert.ok(p[name].meta.pathData.startsWith('M'), name);
  }
  // A circle's outline in 0..1 of its box, the box in pixels: 2 × its radius, plus the stroke.
  assert.equal(p.cap._children.Layout.width, 80);
  assert.equal(p.cap._children.Layout.x, 40);
  const outline = modelBounds(parsePathData(p.cap.meta.pathData));
  assert.ok(Math.abs(outline.width - 1) < 1e-3 && Math.abs(outline.x) < 1e-3, 'the outline fills its box');
  assert.equal(p.skirt._children.Layout.width, 114, 'the stroke is inside the box: 112 + 2');
  assert.equal(p.skirt._children.Background._children.Border.enabled, true);
  assert.equal(p.skirt._children.Background._children.Border.thickness, 2, 'the stroke scaled with the drawing');
  assert.equal(p.skirt._children.Background._children.Border.colour, 'FF000000', 'from the class rule');
  // Gradients, re-expressed in the layer's box.
  const linear = p.skirt._children.Background._children.Fill.gradient;
  assert.equal(linear.type, 'linear');
  assert.equal(linear.angle, 180, 'top to bottom');
  const radial = p.cap._children.Background._children.Fill.gradient;
  assert.equal(radial.type, 'radial');
  assert.deepEqual([radial.centerX, radial.centerY], [40, 30]);
  assert.equal(radial.stops[1].color, '80333333', 'the stop\'s opacity');
  // Fill from a class, the group's opacity, an open line stroked.
  assert.equal(p.pointer._children.Background._children.Fill.colour, 'FFEE3333');
  assert.equal(p.Shadow.opacity, 0.5);
  assert.equal(p.path.meta.closed, false);
  // Text, as text.
  assert.equal(p.CUTOFF.kind, 'text');
  assert.equal(p.CUTOFF._children.Text.content, 'CUTOFF');
  assert.equal(p.CUTOFF._children.Text._children.Font.size, 14);
  assert.equal(p.CUTOFF._children.Text._children.Font.family, 'DM Sans');
  assert.equal(p.CUTOFF._children.Text._children.Font.weightValue, 700);
  // The pointer turns about the knob's centre (the cap's, the topmost large layer it sits on).
  const [turn] = bindings(plan);
  assert.equal(turn.target, 'Parts.pointer.Layout.rotation');
  assert.deepEqual([turn.outputMin, turn.outputMax], [-135, 135]);
  const layout = p.pointer._children.Layout;
  assert.ok(Math.abs(layout.x + (layout.pivotX / 100) * layout.width - 80) < 0.01, 'pivot x at the centre');
  assert.ok(Math.abs(layout.y + (layout.pivotY / 100) * layout.height - 80) < 0.01, 'pivot y at the centre');
  assert.ok(plan.component._children.HitZones._children.mainZone, 'a grab area');
  assert.equal(plan.component._children.ValueChannels._children.mainValue.defaultValue, 0.5);
  assert.match(describeArtworkComponent(plan, plan.layers), /^A dial of 6 layers: pointer turns/);
});

test('an SVG fader and a switch, wired by their names', () => {
  const fader = planSvgComponentImport(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="200">
    <rect id="track" x="17" y="10" width="6" height="180" fill="#222"/>
    <rect id="fader cap" x="5" y="90" width="30" height="20" fill="#ddd"/></svg>`);
  assert.equal(fader.kind, 'fader');
  const [move] = bindings(fader);
  assert.equal(move.target, 'Parts.fader_cap.Layout.offsetY');
  // At 0 the cap sits at the track's foot, at 1 at its head.
  assert.deepEqual([move.outputMin, move.outputMax], [80, -80]);

  const toggle = planSvgComponentImport(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30">
    <rect id="body" width="60" height="30" rx="15" fill="#333"/>
    <circle id="lamp" cx="45" cy="15" r="6" fill="#f40"/>
    <circle id="off" cx="15" cy="15" r="6" fill="#555"/></svg>`, { fileName: 'switch.svg' });
  assert.equal(toggle.kind, 'switch');
  const byTarget = Object.fromEntries(bindings(toggle).map((b) => [b.target, [b.outputMin, b.outputMax]]));
  assert.deepEqual(byTarget['Parts.lamp.opacity'], [0, 1]);
  assert.deepEqual(byTarget['Parts.off.opacity'], [1, 0]);
  assert.equal(toggle.component._children.ValueChannels._children.mainValue.type, 'bool');

  const button = planSvgComponentImport(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30">
    <rect id="key" width="60" height="30" fill="#333"/><rect id="pressed" width="60" height="30" fill="#111"/></svg>`, { fileName: 'Play Button.svg' });
  assert.equal(button.kind, 'button');
  assert.equal(parts(button).pressed.visible, false, 'hidden until held');
  assert.deepEqual(button.component._children.States._children.pressedLook.patches.parts, { pressed: { visible: true } });

  const still = planSvgComponentImport('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123"/></svg>');
  assert.equal(still.kind, 'artwork', 'nothing named to move: a picture of layers');
  assert.deepEqual(still.component._children.Bindings._children, {});
});

test('an SVG that cannot be read says why, and what could not be read is reported', () => {
  assert.match(planSvgComponentImport('not xml').error, /not an SVG file/);
  assert.match(planSvgComponentImport('<svg xmlns="http://www.w3.org/2000/svg"></svg>').error, /no size/);
  assert.match(planSvgComponentImport('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>').error, /no shapes/);
  const plan = planSvgComponentImport(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
    <rect id="a" width="20" height="20" fill="#123" clip-path="url(#nowhere)"/>
    <image id="photo" href="file.png" width="10" height="10"/></svg>`);
  assert.equal(plan.ok, true);
  assert.ok(plan.warnings.some((line) => /not in the file/.test(line) && /\ba\b/.test(line)));
  assert.ok(plan.warnings.some((line) => /Linked pictures/.test(line) && /photo/.test(line)), 'not beside the file: not read');
});

function solid(name, left, top, w, h, rgba, extra = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set(rgba, i * 4);
  return { name, left, top, right: left + w, bottom: top + h, imageData: { width: w, height: h, data }, ...extra };
}

test('a Photoshop knob: every layer a picture layer, its blend mode, opacity and visibility kept, the pointer wired', () => {
  const bytes = writePsdUint8Array({
    width: 100,
    height: 100,
    children: [
      solid('Backdrop', 0, 0, 100, 100, [30, 30, 30, 255]),
      { name: 'knob', children: [
        solid('body', 10, 10, 80, 80, [120, 120, 120, 255]),
        solid('shade', 10, 50, 80, 40, [0, 0, 0, 255], { blendMode: 'multiply', opacity: 0.5 }),
        solid('Pointer', 47, 14, 6, 30, [230, 60, 60, 255]),
      ] },
      solid('glint', 20, 20, 10, 10, [255, 255, 255, 255], { blendMode: 'vivid light' }),
      solid('lamp on', 80, 4, 10, 10, [255, 200, 0, 255], { hidden: true }),
    ],
  }, { noBackground: true, generateThumbnail: false });
  const plan = planPsdComponentImport(bytes, { fileName: 'Drive Knob.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  const p = parts(plan);
  assert.deepEqual(Object.keys(p), ['Backdrop', 'body', 'shade', 'Pointer', 'glint', 'lamp_on']);
  // Cropped to its pixels, in place.
  assert.deepEqual(['x', 'y', 'width', 'height'].map((k) => p.Pointer._children.Layout[k]), [47, 14, 6, 30]);
  assert.match(p.Pointer._children.Background._children.Fill.imageSrc, /^data:image\/png;base64,/);
  assert.equal(p.Pointer._children.Background._children.Fill.imageFit, 'stretch');
  // Mode and opacity are the layer's, not baked into its pixels.
  assert.equal(p.shade._children.Effects._children.Blend.mode, 'multiply');
  assert.equal(p.shade.opacity, 0.502);
  assert.equal(p.glint._children.Effects._children.Blend.mode, 'overlay', 'the nearest mode the editor has');
  assert.ok(plan.warnings.some((line) => /nearest/.test(line) && /glint/.test(line)));
  assert.equal(p.lamp_on.visible, false, 'hidden in Photoshop, hidden here');
  // The pointer turns about the body's centre, not the backdrop's.
  const layout = p.Pointer._children.Layout;
  assert.ok(Math.abs(layout.x + (layout.pivotX / 100) * layout.width - 50) < 0.01);
  assert.ok(Math.abs(layout.y + (layout.pivotY / 100) * layout.height - 50) < 0.01);
  assert.equal(bindings(plan)[0].target, 'Parts.Pointer.Layout.rotation');
});

test('a Photoshop layer\'s mask is its own; its clipped layers are in its picture; its styles drawn', () => {
  const mask = solid('', 0, 0, 20, 20, [0, 0, 0, 255]);
  for (let y = 0; y < 20; y += 1) for (let x = 10; x < 20; x += 1) mask.imageData.data[(y * 20 + x) * 4] = 255;
  const bytes = writePsdUint8Array({
    width: 20,
    height: 20,
    children: [
      solid('base', 0, 0, 20, 20, [200, 200, 200, 255], { mask: { left: 0, top: 0, right: 20, bottom: 20, imageData: mask.imageData, defaultColor: 0 } }),
      solid('tint', 0, 0, 20, 20, [255, 0, 0, 255], { clipping: true }),
      solid('glow', 0, 0, 4, 4, [255, 255, 255, 255], { effects: { dropShadow: [{ enabled: true, size: { units: 'Pixels', value: 3 }, distance: { units: 'Pixels', value: 2 } }] } }),
    ],
  }, { noBackground: true, generateThumbnail: false });
  const plan = planPsdComponentImport(bytes);
  assert.equal(plan.ok, true, plan.error);
  const p = parts(plan);
  assert.deepEqual(Object.keys(p), ['base', 'glow'], 'the clipped layer is in its base');
  // The whole layer, and its mask beside it: the right half shows.
  assert.deepEqual(['x', 'width'].map((k) => p.base._children.Layout[k]), [0, 20]);
  assert.equal(p.base.mask.enabled, true);
  assert.match(p.base.mask.src, /^data:image\/png;base64,/);
  // The drop shadow is the layer's own, from its pixels.
  assert.equal(p.glow._children.Effects._children.Shadows.items[0].type, 'drop');
  assert.ok(plan.kept.includes('Drop Shadow'));
  assert.match(planPsdComponentImport(new Uint8Array([1, 2, 3])).error, /not a Photoshop file/);
});

test('the commands are in the File menu and open the component in the Component Designer', () => {
  const menu = readFileSync(new URL('../src/CE_Application/layout/MenuBar.svelte', import.meta.url), 'utf8');
  assert.match(menu, /label: 'New Component from SVG Artwork\.\.\.', action: \(\) => newComponentFromSvgArtwork\(\)/);
  assert.match(menu, /label: 'New Component from Photoshop Artwork\.\.\.', action: \(\) => newComponentFromPsdArtwork\(\)/);
  const actions = readFileSync(new URL('../src/CE_Application/stores/artworkComponentActions.js', import.meta.url), 'utf8');
  assert.match(actions, /createComponentDocument\(\{ control: plan\.component, name: plan\.name \}\)/);
  assert.match(actions, /setActiveEditorTab\(\{ type: 'component', id: document\.id \}\)/);
});

test('SVG clip paths cut a plain shape and stay one vector; masks, clipped text and stroked shapes get a real mask', async () => {
  const { loadGeometry } = await import('../src/CE_Application/utils/partOutlines.js');
  const geometry = await loadGeometry();
  const plan = planSvgComponentImport(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
   <clipPath id="half"><rect x="0" y="0" width="50" height="100"/></clipPath>
   <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
   <mask id="soft"><rect width="100" height="100" fill="url(#fade)"/></mask>
   <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2" fill="#f00"/></pattern>
   <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eee"/><stop offset="1" stop-color="#333"/></linearGradient>
  </defs>
  <circle id="cut" cx="50" cy="50" r="40" fill="#08f" clip-path="url(#half)"/>
  <circle id="cutEdge" cx="50" cy="50" r="40" fill="#08f" stroke="#000" clip-path="url(#half)"/>
  <rect id="faded" x="10" y="10" width="80" height="80" fill="#0f0" mask="url(#soft)"/>
  <rect id="dotted" x="20" y="20" width="60" height="60" fill="url(#dots)"/>
  <circle id="ring" cx="50" cy="50" r="30" fill="none" stroke="url(#rim)" stroke-width="4"/>
  <g clip-path="url(#half)"><text id="label" x="50" y="95" font-size="10">CUT</text></g>
  <image id="photo" href="photo.png" x="0" y="0" width="10" height="10"/>
  </svg>`, { geometry, files: { 'photo.png': 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(plan.warnings, []);
  const p = parts(plan);
  // Cut to its left half, a vector without a mask.
  assert.deepEqual(['x', 'width'].map((k) => p.cut._children.Layout[k]), [10, 40]);
  assert.equal(p.cut.mask, undefined);
  // Stroked: whole, and masked, so the stroke is cut where SVG cuts it.
  assert.equal(p.cutEdge._children.Layout.width, 81);
  assert.match(svgOf(p.cutEdge.mask.src), /clip-path="url\(#half\)"/);
  assert.match(svgOf(p.faded.mask.src), /mask="url\(#soft\)"/);
  assert.match(svgOf(p.faded.mask.src), /<mask id="soft">/, 'the file\'s definitions travel with the mask');
  assert.ok(p.label.mask, 'text under a clipped group is masked');
  // A pattern, as the shape's picture.
  const dotted = p.dotted._children.Background._children.Fill;
  assert.equal(dotted.imageEnabled, true);
  assert.match(svgOf(dotted.imageSrc), /fill="url\(#dots\)"/);
  // A gradient outline.
  const rim = p.ring._children.Background._children.Border;
  assert.equal(rim.fillGradient, true);
  assert.equal(rim.gradient.angle, 180);
  // A linked picture, read from beside the file.
  assert.equal(p.photo._children.Background._children.Fill.imageSrc, 'data:image/png;base64,iVBORw0KGgo=');
});

function svgOf(dataUrl) {
  return Buffer.from(String(dataUrl).split(',')[1], 'base64').toString('utf8');
}

test('Photoshop shape layers are vectors, adjustments change what is under them, styles are kept or drawn', async () => {
  const { loadGeometry } = await import('../src/CE_Application/utils/partOutlines.js');
  const geometry = await loadGeometry();
  const knot = (x, y) => ({ linked: true, points: [x, y, x, y, x, y] });
  const rect = (x0, y0, x1, y1, operation = 'combine') => ({ open: false, operation, fillRule: 'non-zero', knots: [knot(x0, y0), knot(x1, y0), knot(x1, y1), knot(x0, y1)] });
  const bytes = writePsdUint8Array({
    width: 40,
    height: 40,
    children: [
      solid('base', 0, 0, 40, 40, [100, 150, 200, 255]),
      { name: 'frame', left: 0, top: 0, right: 40, bottom: 40, imageData: { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4) },
        vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } },
        vectorMask: { paths: [rect(5, 5, 35, 35), rect(15, 15, 25, 25, 'subtract')] },
        vectorStroke: { strokeEnabled: true, fillEnabled: true, lineWidth: { units: 'Pixels', value: 2 }, content: { type: 'color', color: { r: 0, g: 0, b: 255 } } },
        effects: { innerShadow: [{ enabled: true, size: { units: 'Pixels', value: 4 }, distance: { units: 'Pixels', value: 2 }, angle: 90, color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }] } },
      { name: 'Invert', adjustment: { type: 'invert' } },
      solid('styled', 10, 10, 10, 10, [255, 255, 255, 255], { effects: {
        stroke: [{ enabled: true, size: { units: 'Pixels', value: 3 }, position: 'outside', color: { r: 0, g: 255, b: 0 }, opacity: 1 }],
        solidFill: [{ enabled: true, color: { r: 255, g: 0, b: 255 }, opacity: 1, blendMode: 'normal' }],
      } }),
      solid('cutout', 0, 0, 40, 40, [10, 10, 10, 255], { vectorMask: { paths: [rect(0, 0, 20, 40)], disable: true } }),
    ],
  }, { noBackground: true, generateThumbnail: false });
  const plan = planPsdComponentImport(bytes, { geometry });
  assert.equal(plan.ok, true, plan.error);
  const p = parts(plan);
  // A vector layer, its hole cut by the subtracting path, its stroke its outline.
  assert.equal(p.frame.kind, 'path');
  assert.equal((p.frame.meta.pathData.match(/M/g) ?? []).length, 2, 'the outline and the hole');
  assert.deepEqual(['x', 'width'].map((k) => p.frame._children.Layout[k]), [4, 32], 'the stroke inside the box');
  // Inverted by the adjustment layer above it, as a colour; the base picture too.
  assert.equal(p.frame._children.Background._children.Fill.colour, 'FF00FFFF');
  assert.equal(p.frame._children.Background._children.Border.colour, 'FFFFFF00');
  const basePixel = pixelsOf(p.base._children.Background._children.Fill.imageSrc);
  assert.deepEqual([...basePixel.slice(0, 3)], [155, 105, 55], 'the base picture, inverted');
  // On a vector, an inner shadow is its own setting.
  assert.equal(p.frame._children.Effects._children.Shadows.items.find((item) => item.type === 'inner').blur, 4);
  // On a picture: drawn in, above the adjustment so not inverted; the outside stroke grows its box.
  assert.deepEqual(['x', 'width'].map((k) => p.styled._children.Layout[k]), [7, 16]);
  const styled = pixelsOf(p.styled._children.Background._children.Fill.imageSrc, 16);
  assert.deepEqual([...styled.pixel(8, 8).slice(0, 3)], [255, 0, 255], 'the colour overlay');
  assert.deepEqual([...styled.pixel(1, 8).slice(0, 3)], [0, 255, 0], 'the stroke');
  // A vector mask kept as the layer's mask, disabled as it was in Photoshop.
  assert.equal(p.cutout.mask.enabled, false);
  assert.match(svgOf(p.cutout.mask.src), /<path d="/);
  assert.ok(plan.warnings.some((line) => /drawn into the pictures/.test(line) && /Stroke/.test(line)));
});

function pixelsOf(dataUrl, width = 0) {
  const png = Buffer.from(String(dataUrl).split(',')[1], 'base64');
  let off = 8; let w = width; const idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') w = png.readUInt32BE(off + 8);
    if (type === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = w * 4 + 1;
  const out = Uint8Array.from(raw.subarray(1, 1 + w * 4));
  out.pixel = (x, y) => raw.subarray(y * row + 1 + x * 4, y * row + 1 + x * 4 + 4);
  return out;
}


test('a layer mask is drawn with CSS masking, inverted on request, and keeps a masked layer live', async () => {
  const { partMaskCSS, pictureShadowFilters, isPictureLayer } = await import('../src/CE_Application/utils/partMask.js');
  const css = partMaskCSS({ src: 'data:image/png;base64,AA', x: 10, y: 0, width: 50, height: 100 }, 200, 100);
  assert.match(css, /-webkit-mask-image:url\("data:image\/png;base64,AA"\)/);
  assert.match(css, /mask-size:100px 100px/);
  assert.match(css, /mask-position:20px 0px/);
  assert.equal(partMaskCSS({ src: 'x', enabled: false }, 10, 10), '', 'a disabled mask is not drawn');
  assert.match(partMaskCSS({ src: 'x', invert: true }, 10, 10), /mask-composite:exclude/);
  // A picture's shadows follow its pixels.
  const effects = { _children: { Shadows: { items: [{ enabled: true, type: 'drop', offsetX: 2, offsetY: 3, blur: 4, colour: '80000000' }, { enabled: true, type: 'inner', blur: 2 }] } } };
  assert.equal(pictureShadowFilters(effects), 'drop-shadow(2px 3px 4px rgba(0, 0, 0, 0.502))');
  assert.equal(isPictureLayer({ _children: { Fill: { imageEnabled: true, imageSrc: 'data:x', solidEnabled: false } } }), true);
  const { whyNotBakeable } = await import('../src/CE_Application/utils/partsToSvg.js');
  assert.equal(whyNotBakeable({ kind: 'rectangle', mask: { src: 'x' }, _children: {} }), 'a mask');
  const renderer = readFileSync(new URL('../src/CE_Application/editor/InteractivePartRenderer.svelte', import.meta.url), 'utf8');
  // Linked: on the part's own box. Not linked: on a wrapper the artboard's size, so the part moves under it.
  assert.match(renderer, /let maskCSS = \$derived\(maskFixed \? '' : partMaskCSS\(part\?\.mask, frame\.width, frame\.height\)\)/);
  assert.match(renderer, /partMaskCSS\(part\?\.mask, parentWidth, parentHeight\)/);
  assert.match(renderer, /class="interactive-part-fixed-mask"/);
  assert.match(renderer, /pictureLayer \? pictureShadowFilters\(effects\) : ''/);
});
