// psdLayerStyles.test.js — Photoshop's layer styles as measured on its own pictures, the readers that
// feed them, and a CMYK file's own colour profile.
//
// The shapes of the shadows, glows, bevels and satins were fitted to psd-tools' layer_effects.psd (a
// Gaussian whose deviation is 0.42 of the Size, cut off at the Size); these tests pin the readings
// that fit, on shapes small enough to work out on paper.
import test from 'node:test';
import assert from 'node:assert/strict';

import { castShadows, drawLayerStyles, stylesExtent } from '../src/CE_Application/utils/psdLayerStyles.js';
import { blendChannel, blendIf, compositePsd } from '../src/CE_Application/utils/psdComposite.js';
import { contourTable } from '../src/CE_Application/utils/psdAdjustments.js';
import { effectsFromDescriptor } from '../src/CE_Application/utils/psdEffects.js';
import { iccCmykToRgb } from '../src/CE_Application/utils/iccProfile.js';

/** A w × h shape: 1 inside the box [x0, x1) × [y0, y1), 0 elsewhere. */
function square(w, h, x0, y0, x1, y1) {
  const shape = new Float32Array(w * h);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) shape[y * w + x] = 1;
  return shape;
}
const px = (value) => ({ units: 'Pixels', value });

test('a drop shadow is the shape blurred over its Size and no further: half on the edge, nothing past it', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 30, 30, 50, 50);
  const [cast] = castShadows(shape, w, h, { dropShadow: [{ enabled: true, opacity: 1, distance: px(0), size: px(10), choke: px(0), angle: 90, layerConceals: false }] });
  const alpha = (x, y) => cast.alpha[(y - cast.y) * cast.width + (x - cast.x)];
  // The edge runs between 49 and 50: the pixels either side of it hold about half.
  assert.ok(Math.abs((alpha(49, 40) + alpha(50, 40)) / 2 - 0.5) < 0.05, `${alpha(49, 40)} ${alpha(50, 40)}`);
  // One deviation (4.2 px) out, a sixth; past the Size, nothing at all.
  assert.ok(Math.abs(alpha(54, 40) - 0.15) < 0.04, `${alpha(54, 40)}`);
  assert.equal(alpha(61, 40), 0);
  assert.equal(stylesExtent({ dropShadow: [{ enabled: true, size: px(10), distance: px(5) }] }), 17);
});

test('an outer glow is full on the edge at the default Range of 50%, and half at 100%', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 20, 20, 60, 60);
  const glow = (range) => {
    const [cast] = castShadows(shape, w, h, { outerGlow: { enabled: true, opacity: 1, size: px(10), choke: px(0), range, color: { r: 255, g: 255, b: 255 } } });
    return cast.alpha[(40 - cast.y) * cast.width + (60 - cast.x)];
  };
  // (60 is the first pixel outside; a blur gives a little under half there.)
  assert.ok(glow(0.5) > 0.8, `${glow(0.5)}`);
  assert.ok(Math.abs(glow(1) - glow(0.5) / 2) < 0.03, `${glow(1)} ${glow(0.5)}`);
});

test('an inner glow lights the inside of the edge and fades by the Size; an inner shadow falls from the offset side', () => {
  const w = 60; const h = 60;
  const shape = square(w, h, 10, 10, 50, 50);
  const draw = (effects) => {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([0, 0, 0, 255], i * 4);
    drawLayerStyles(pixels, shape, w, h, effects);
    return (x, y) => pixels[(y * w + x) * 4];
  };
  const glow = draw({ innerGlow: { enabled: true, opacity: 1, blendMode: 'normal', size: px(8), choke: px(0), range: 0.5, color: { r: 255, g: 255, b: 255 }, source: 'edge' } });
  assert.ok(glow(10, 30) > 200, `edge ${glow(10, 30)}`);
  assert.equal(glow(30, 30), 0);
  // Light from above (90°), the shadow 6 px down from the top edge: dark at the top, none at the bottom.
  const shadow = draw({ innerShadow: [{ enabled: true, opacity: 1, blendMode: 'normal', size: px(4), choke: px(0), distance: px(6), angle: 90, color: { r: 255, g: 255, b: 255 } }] });
  assert.ok(shadow(30, 12) > 200, `top ${shadow(30, 12)}`);
  assert.equal(shadow(30, 47), 0);
});

test('Bevel and Emboss: lit from its angle, the highlight on the side toward the light; an outer bevel lies outside the shape', () => {
  const w = 60; const h = 60;
  const shape = square(w, h, 15, 15, 45, 45);
  const bevel = { enabled: true, style: 'inner bevel', technique: 'smooth', strength: 1, size: px(8), angle: 90, altitude: 30, direction: 'up',
    highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 1, highlightBlendMode: 'normal',
    shadowColor: { r: 0, g: 0, b: 0 }, shadowOpacity: 1, shadowBlendMode: 'normal' };
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([128, 128, 128, 255], i * 4);
  assert.deepEqual(drawLayerStyles(pixels, shape, w, h, { bevel }), ['Bevel & Emboss']);
  const at = (x, y) => pixels[(y * w + x) * 4];
  assert.ok(at(30, 16) > 160, `top edge ${at(30, 16)}`);
  assert.ok(at(30, 43) < 96, `bottom edge ${at(30, 43)}`);
  assert.equal(at(30, 30), 128);
  // An Outer Bevel: nothing drawn inside; its light and shade cast around the shape.
  const outer = { ...bevel, style: 'outer bevel' };
  const inside = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) inside.set([128, 128, 128, 255], i * 4);
  drawLayerStyles(inside, shape, w, h, { bevel: outer });
  assert.equal(inside[(16 * w + 30) * 4], 128);
  const casts = castShadows(shape, w, h, { bevel: outer });
  assert.deepEqual(casts.map((c) => c.name), ['Bevel & Emboss', 'Bevel & Emboss']);
  const [lo, hi] = casts;
  const a = (cast, x, y) => cast.alpha[(y - cast.y) * cast.width + (x - cast.x)];
  // Outside, the ground rises to the shape: above it, it faces the light; below, away.
  assert.ok(a(hi, 30, 12) > 0.3 && a(lo, 30, 47) > 0.3, `${a(hi, 30, 12)} ${a(lo, 30, 47)}`);
  assert.equal(a(hi, 30, 47) + a(lo, 30, 12), 0);
  assert.equal(a(hi, 30, 30) + a(lo, 30, 30), 0);
});

test('Satin, inverted, is full where the two moved copies agree, in the middle of a broad shape', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 10, 10, 70, 70);
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([255, 255, 255, 255], i * 4);
  drawLayerStyles(pixels, shape, w, h, { satin: { enabled: true, opacity: 1, blendMode: 'normal', invert: true, angle: 19, distance: px(5), size: px(5), color: { r: 0, g: 0, b: 0 } } });
  assert.equal(pixels[(40 * w + 40) * 4], 0);
});

test('a stroke outside a see-through edge goes under the layer: the layer\'s own colour stays on top', () => {
  // An opaque red square with a column at 40% to its right, an outside green stroke of 1 px, on white.
  const w = 10; const h = 10;
  const data = new Uint8ClampedArray(5 * 4 * 4);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 5; x += 1) data.set([255, 0, 0, x === 4 ? 102 : 255], (y * 5 + x) * 4);
  const background = { name: 'bg', left: 0, top: 0, imageData: { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) } };
  const layer = { name: 'red', left: 2, top: 2, imageData: { width: 5, height: 4, data }, effects: { stroke: [{ enabled: true, position: 'outside', fillType: 'color', size: px(1), opacity: 1, blendMode: 'normal', color: { r: 0, g: 255, b: 0 } }] } };
  const { pixels } = compositePsd([background, layer], w, h, { styles: { cast: castShadows, draw: drawLayerStyles, reach: () => 3 } });
  const at = (x, y) => [...pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
  // 0.4 of red over the band, which fills the 0.6 left beside it: 102 red, 153 green.
  const [r, g, b, a] = at(6, 3);
  assert.ok(Math.abs(r - 102) <= 2 && Math.abs(g - 153) <= 2 && b === 0 && a === 255, `${[r, g, b, a]}`);
});

test('a contour is drawn through the spline Curves uses; Linear leaves the style alone', () => {
  assert.equal(contourTable({ curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }), null);
  const gaussian = contourTable({ curve: [{ x: 0, y: 0 }, { x: 32, y: 7 }, { x: 64, y: 38 }, { x: 96, y: 101 }, { x: 128, y: 166 }, { x: 159, y: 209 }, { x: 191, y: 235 }, { x: 223, y: 248 }, { x: 255, y: 255 }] });
  assert.ok(Math.abs(gaussian[128] - 166) < 0.5 && gaussian[0] === 0 && gaussian[255] === 255);
});

test('the style reader keeps a bevel\'s style, technique and Depth (a fraction), and a gradient\'s offset as a fraction', () => {
  const effects = effectsFromDescriptor({
    ebbl: { enab: true, bvlS: { value: 'OtrB' }, bvlT: { value: 'PrBL' }, srgR: { units: '#Prc', value: 250 }, blur: { units: '#Pxl', value: 7 }, Sftn: { units: '#Pxl', value: 2 },
      TrnS: { Nm: 'Linear', Crv: [{ Hrzn: 0, Vrtc: 0 }, { Hrzn: 255, Vrtc: 255 }] } },
    GrFl: { enab: true, Md: { value: 'Nrml' }, Opct: { units: '#Prc', value: 100 }, Type: { value: 'Lnr' }, Angl: { units: '#Ang', value: 90 },
      Ofst: { Hrzn: { units: '#Prc', value: 10 }, Vrtc: { units: '#Prc', value: -20 } } },
    OrGl: { enab: true, GlwT: { value: 'PrBL' }, Inpr: { units: '#Prc', value: 43 }, Nose: { units: '#Prc', value: 0 } },
  });
  assert.equal(effects.bevel.style, 'outer bevel');
  assert.equal(effects.bevel.technique, 'chisel hard');
  assert.equal(effects.bevel.strength, 2.5);
  assert.equal(effects.bevel.soften.value, 2);
  assert.equal(effects.bevel.contour.curve.length, 2);
  assert.deepEqual(effects.gradientOverlay[0].offset, { x: 0.1, y: -0.2 });
  assert.equal(effects.outerGlow.technique, 'precise');
  assert.equal(effects.outerGlow.range, 0.43);
});

test('Advanced Blending: a channel left out keeps what was below; Blend If lets through by ranges', () => {
  const white = { name: 'bg', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
  const black = { name: 'k', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) } };
  const pixel = (layers) => [...compositePsd(layers, 1, 1).pixels.slice(0, 4)];
  assert.deepEqual(pixel([white, { ...black, channelBlendingRestrictions: [2] }]), [0, 0, 255, 255]);
  // Underlying Layer's grey 0..100 shows it, 100..150 fades it out, above 150 nothing.
  const ranges = { compositeGrayBlendSource: [0, 0, 255, 255], compositeGraphBlendDestinationRange: [0, 0, 100, 150], ranges: [] };
  const weigh = blendIf({ blendingRanges: ranges });
  assert.equal(weigh(0, 0, 0, 50 / 255, 50 / 255, 50 / 255), 1);
  assert.ok(Math.abs(weigh(0, 0, 0, 125 / 255, 125 / 255, 125 / 255) - 0.5) < 1e-6);
  assert.equal(weigh(0, 0, 0, 1, 1, 1), 0);
  assert.equal(blendIf({ blendingRanges: { compositeGrayBlendSource: [0, 0, 255, 255], compositeGraphBlendDestinationRange: [0, 0, 255, 255], ranges: [] } }), null);
  assert.deepEqual(pixel([white, { ...black, blendingRanges: ranges }]), [255, 255, 255, 255]);
});

test('a backdrop within half a level of black stays black under Divide and Color Dodge', () => {
  assert.equal(blendChannel('divide', 1e-6, 0), 0);
  assert.equal(blendChannel('color dodge', 1e-6, 0.5), 0);
  assert.equal(blendChannel('divide', 0.5, 0), 1);
});

test('an artboard lays its background colour under its layers, Pass Through as Photoshop makes it', () => {
  const board = { name: 'Artboard', blendMode: 'pass through', artboard: { rect: { left: 0, top: 0, right: 2, bottom: 1 }, color: { r: 18, g: 108, b: 200 }, backgroundType: 4 }, children: [] };
  const { pixels } = compositePsd([board], 3, 1);
  assert.deepEqual([...pixels.slice(0, 4)], [18, 108, 200, 255]);
  assert.equal(pixels[11], 0);
});

test('masks: a shape\'s vector mask below full Density shows its fill past the path; a user mask kept apart from the path multiplies it', () => {
  const corner = (x, y) => ({ points: [x, y, x, y, x, y] });
  const half = { paths: [{ open: false, operation: 'combine', knots: [corner(2, 0), corner(4, 0), corner(4, 1), corner(2, 1)] }] };
  // A red shape over the right half, its vector mask at 75%: a quarter of it on the left.
  const shape = { name: 'shape', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } }, vectorMask: half,
    mask: { vectorMaskDensity: 0.75, fromVectorData: true, defaultColor: 0 }, left: 2, top: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]) } };
  const soft = compositePsd([shape], 4, 1).pixels;
  assert.equal(soft[3], 64);
  assert.equal(soft[15], 255);
  // Pixels with both masks, the user mask (hiding all) at 50% and the path at 50%.
  const solid = { width: 4, height: 1, data: new Uint8ClampedArray(16).fill(255) };
  const both = { name: 'both', blendMode: 'normal', opacity: 1, left: 0, top: 0, imageData: solid, vectorMask: half,
    mask: { fromVectorData: true, userMaskDensity: 0.5, vectorMaskDensity: 0.5, defaultColor: 0, left: 2, top: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray(8).fill(255) } },
    realMask: { defaultColor: 0, left: 0, top: 0, imageData: { width: 4, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) } } };
  const masked = compositePsd([both], 4, 1).pixels;
  assert.equal(masked[3], 64);
  assert.equal(masked[15], 128);
});

/** A tiny ICC version 2 CMYK profile: A2B1 (mft2) from inks to Lab, B2A0 (mft1) from Lab to inks. */
function cmykProfile({ darkest = 0 } = {}) {
  const writer = () => {
    const bytes = [];
    const w = {
      bytes,
      u8: (v) => bytes.push(v & 255),
      u16: (v) => { w.u8(v >> 8); w.u8(v); },
      u32: (v) => { w.u16(v >>> 16); w.u16(v & 0xffff); },
      ascii: (s) => [...s].forEach((c) => w.u8(c.charCodeAt(0))),
      zeros: (n) => { for (let i = 0; i < n; i += 1) w.u8(0); },
    };
    return w;
  };
  // A2B1: four inks, three outputs, a 2-point grid; L* falls 25 for each ink, to `darkest` at full.
  const a2b = writer();
  a2b.ascii('mft2'); a2b.zeros(4); a2b.u8(4); a2b.u8(3); a2b.u8(2); a2b.u8(0);
  for (let i = 0; i < 9; i += 1) a2b.u32(i % 4 === 0 ? 65536 : 0);
  a2b.u16(2); a2b.u16(2);
  for (let c = 0; c < 4; c += 1) { a2b.u16(0); a2b.u16(65535); }
  for (let i = 0; i < 16; i += 1) {
    const inks = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1];
    const L = inks.every(Boolean) ? darkest : 100 - 25 * inks.reduce((sum, v) => sum + v, 0);
    a2b.u16(Math.round((L / 100) * 65280)); a2b.u16(0x8000); a2b.u16(0x8000);
  }
  for (let c = 0; c < 3; c += 1) { a2b.u16(0); a2b.u16(65535); }
  // B2A0: Lab to inks, full ink at L* 0, none at 100.
  const b2a = writer();
  b2a.ascii('mft1'); b2a.zeros(4); b2a.u8(3); b2a.u8(4); b2a.u8(2); b2a.u8(0);
  for (let i = 0; i < 9; i += 1) b2a.u32(i % 4 === 0 ? 65536 : 0);
  for (let c = 0; c < 3; c += 1) for (let v = 0; v < 256; v += 1) b2a.u8(v);
  for (let i = 0; i < 8; i += 1) { const v = (i >> 2) & 1 ? 0 : 255; for (let k = 0; k < 4; k += 1) b2a.u8(v); }
  for (let c = 0; c < 4; c += 1) for (let v = 0; v < 256; v += 1) b2a.u8(v);
  // Header and tag table, then the two tables.
  const out = writer();
  const start = 128 + 4 + 2 * 12;
  out.u32(start + a2b.bytes.length + b2a.bytes.length); out.zeros(4); out.u32(0x02100000);
  out.ascii('prtr'); out.ascii('CMYK'); out.ascii('Lab ');
  out.zeros(128 - out.bytes.length);
  out.u32(2);
  out.ascii('A2B1'); out.u32(start); out.u32(a2b.bytes.length);
  out.ascii('B2A0'); out.u32(start + a2b.bytes.length); out.u32(b2a.bytes.length);
  return new Uint8Array([...out.bytes, ...a2b.bytes, ...b2a.bytes]);
}

test('a CMYK profile: inks through its A2B1 table to Lab, its black point to sRGB\'s black, paper to white', () => {
  const plain = iccCmykToRgb(cmykProfile());
  assert.ok(plain);
  assert.deepEqual(plain(0, 0, 0, 0).map(Math.round), [255, 255, 255]);
  // Black ink alone: L* 75, neutral; sRGB's grey of that lightness.
  const Y = ((75 + 16) / 116) ** 3;
  const grey = 255 * (1.055 * Y ** (1 / 2.4) - 0.055);
  plain(0, 0, 0, 1).forEach((v) => assert.ok(Math.abs(v - grey) < 1, `${v} vs ${grey}`));
  // A profile whose darkest is L* 20: compensated, full ink is sRGB's black, and a mid ink lighter than
  // it would be without.
  const deep = iccCmykToRgb(cmykProfile({ darkest: 20 }));
  deep(1, 1, 1, 1).forEach((v) => assert.ok(v < 1, `${v}`));
  assert.ok(deep(0, 0, 0, 1)[0] < grey);
  assert.equal(iccCmykToRgb(new Uint8Array(200)), null);
});

test('what is drawn as measured is not reported; what is only close says why', () => {
  const layer = (effects) => ({ name: 'l', left: 2, top: 2, imageData: { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) }, effects });
  const styles = { cast: castShadows, draw: drawLayerStyles, reach: () => 3 };
  const plain = compositePsd([layer({ outerGlow: { enabled: true, size: px(3), technique: 'softer' }, bevel: { enabled: true, size: px(2) } })], 8, 8, { styles });
  assert.deepEqual(plain.closeTo.styles, []);
  assert.deepEqual(plain.styles.sort(), ['Bevel & Emboss', 'Outer Glow']);
  const close = compositePsd([layer({ outerGlow: { enabled: true, size: px(3), technique: 'precise', noise: 0.2 }, bevel: { enabled: true, size: px(2), technique: 'chisel hard' } })], 8, 8, { styles });
  assert.deepEqual(close.closeTo.styles.sort(), ['Bevel & Emboss (Chisel)', 'Outer Glow (Precise, its Noise not drawn)']);
});
