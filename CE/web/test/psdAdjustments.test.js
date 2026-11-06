// Photoshop's Selective Color and Color Lookup adjustment layers, applied by the Photoshop component
// import to the layers under them (utils/psdAdjustments.js). Selective Color moves each colour by
// how far it is in each range; Color Lookup reads the .cube, .3dl or .look file the layer carries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writePsdUint8Array } from 'ag-psd';
import { inflateSync } from 'node:zlib';
import { adjustmentFunction, readLookupTable, unappliedAdjustment } from '../src/CE_Application/utils/psdAdjustments.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';

const near = (actual, expected, tolerance, message) => {
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${message}: ${actual.map((x) => x.toFixed(1))} against ${expected}`));
};
const zero = { c: 0, m: 0, y: 0, k: 0 };
const selective = (mode, ranges) => ({ type: 'selective color', mode, reds: zero, yellows: zero, greens: zero, cyans: zero, blues: zero, magentas: zero, whites: zero, neutrals: zero, blacks: zero, ...ranges });

test('Selective Color: a range moves the colours in it, by how far they are in it, and nothing else', () => {
  const report = new Set();
  const lessCyanInReds = adjustmentFunction(selective('relative', { reds: { c: -100, m: 0, y: 0, k: 0 } }), report);
  assert.deepEqual([...report], ['Selective Color'], 'listed as close to Photoshop\'s');
  // A dull red is 0.63 in reds (red over the next channel): its red goes 0.63 of the way to full.
  const [r, g, b] = lessCyanInReds([200, 40, 40]);
  near([r, g, b], [200 + (255 - 200) * (160 / 255), 40, 40], 0.5, 'the red lifted, green and blue kept');
  near(lessCyanInReds([40, 60, 220]), [40, 60, 220], 0, 'a blue is not in reds');
  near(lessCyanInReds([255, 0, 0]), [255, 0, 0], 0, 'a full red has no cyan to take away');
  near(lessCyanInReds([128, 128, 128]), [128, 128, 128], 0, 'a grey is in no colour range');
});

test('Selective Color: Relative scales by the ink already there, so it cannot tint white; Absolute can', () => {
  const cyanInWhites = { whites: { c: 50, m: 0, y: 0, k: 0 } };
  near(adjustmentFunction(selective('relative', cyanInWhites))([255, 255, 255]), [255, 255, 255], 0, 'relative leaves white');
  near(adjustmentFunction(selective('absolute', cyanInWhites))([255, 255, 255]), [127.5, 255, 255], 0.5, 'absolute adds half the cyan ink');
  // Black in neutrals darkens a mid grey, weighted 1 there and 0 at black and white.
  const darker = adjustmentFunction(selective('absolute', { neutrals: { c: 0, m: 0, y: 0, k: 20 } }));
  near(darker([128, 128, 128]), [128 - 51 * 0.996, 128 - 51 * 0.996, 128 - 51 * 0.996], 0.5, 'the grey, darker by a fifth');
  near(darker([255, 255, 255]), [255, 255, 255], 0, 'white is not neutral');
  near(darker([0, 0, 0]), [0, 0, 0], 0, 'nor is black');
  // Relative black in blacks: the ink there (0.8) grows by half, -0.4, which is held at -0.2 (no
  // channel goes below black), then weighted by how far the colour is in blacks, 0.6.
  const deeper = adjustmentFunction(selective('relative', { blacks: { c: 0, m: 0, y: 0, k: 50 } }));
  near(deeper([51, 51, 51]), [20.4, 20.4, 20.4], 0.5, 'a fifth-grey, 0.6 in blacks');
  near(deeper([153, 153, 153]), [153, 153, 153], 0, 'a light grey is not in blacks');
});

const cube = (lines, size, extra = '') => `TITLE "test"\n# a comment\n${extra}LUT_3D_SIZE ${size}\n${lines.join('\n')}\n`;
/** Size-2 table entries, red fastest, from `f([r, g, b]) => [r, g, b]` over 0..1. */
const corners = (f, order = 'red') => {
  const out = [];
  for (let a = 0; a < 2; a += 1) for (let b = 0; b < 2; b += 1) for (let c = 0; c < 2; c += 1) out.push(f(order === 'red' ? [c, b, a] : [a, b, c]));
  return out;
};

test('Color Lookup: a .cube table, interpolated between its points, over its domain', () => {
  const invert = adjustmentFunction({ type: 'color lookup', lookupType: '3dlut', lutFormat: 'cube', lut3DFileData: new TextEncoder().encode(cube(corners(([r, g, b]) => [1 - r, 1 - g, 1 - b]).map((v) => v.join(' ')), 2)) });
  near(invert([0, 128, 255]), [255, 127, 0], 0.01, 'inverted, in between too');
  // Red and blue swapped: the order of the table matters.
  const swap = adjustmentFunction({ type: 'color lookup', lut3DFileData: new TextEncoder().encode(cube(corners(([r, g, b]) => [b, g, r]).map((v) => v.join(' ')), 2)) });
  near(swap([255, 100, 0]), [0, 100, 255], 0.01, 'red and blue swapped');
  // A domain wider than 0..1: the input is placed in it first.
  const half = readLookupTable(cube(corners(([r, g, b]) => [r, g, b]).map((v) => v.join(' ')), 2, 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n'));
  assert.deepEqual([half.lo, half.hi], [[0, 0, 0], [2, 2, 2]]);
  const lifted = adjustmentFunction({ type: 'color lookup', lut3DFileData: new TextEncoder().encode(cube(corners(([r, g, b]) => [r, g, b]).map((v) => v.join(' ')), 2, 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n')) });
  near(lifted([255, 128, 0]), [127.5, 64, 0], 0.01, 'halved, as the domain says');
  // A 1D table: each channel its own curve.
  const gamma = adjustmentFunction({ type: 'color lookup', lut3DFileData: new TextEncoder().encode('LUT_1D_SIZE 3\n0 0 0\n0.25 0.5 0.75\n1 1 1\n') });
  near(gamma([128, 128, 128]), [64, 128, 191], 1, 'the middle point of each');
});

test('Color Lookup: a .3dl table, blue fastest and twelve-bit, and an Iridas .look, little-endian floats in hex', () => {
  const lines = ['3DMESH', 'Mesh 1 12', '0 1023', ...corners(([r, g, b]) => [b, g, r].map((v) => v * 4095), 'blue').map((v) => v.join(' ')), 'LUT8', 'gamma 1.0'];
  const fromThreeDl = adjustmentFunction({ type: 'color lookup', lutFormat: '3dl', lut3DFileData: new TextEncoder().encode(lines.join('\n')) });
  near(fromThreeDl([255, 100, 0]), [0, 100, 255], 0.01, 'red and blue swapped, from the .3dl');
  const floats = Buffer.alloc(8 * 3 * 4);
  corners(([r, g, b]) => [b, g, r]).flat().forEach((v, i) => floats.writeFloatLE(v, i * 4));
  const look = `<?xml version="1.0" encoding="UTF-8"?>\n<look>\n  <LUT>\n    <size>"2"</size>\n    <data>"\n      ${floats.toString('hex').toUpperCase()}\n    "</data>\n  </LUT>\n</look>\n`;
  const fromLook = adjustmentFunction({ type: 'color lookup', lutFormat: 'look', lut3DFileData: new TextEncoder().encode(look) });
  near(fromLook([255, 100, 0]), [0, 100, 255], 0.01, 'red and blue swapped, from the .look');
});

test('Color Lookup through an ICC profile, or with a table it cannot read, is not applied and says which', () => {
  const profile = { type: 'color lookup', lookupType: 'abstractProfile', profile: new Uint8Array(8) };
  assert.equal(adjustmentFunction(profile), null);
  assert.equal(unappliedAdjustment(profile), 'Color Lookup through an ICC profile');
  const broken = { type: 'color lookup', lookupType: '3dlut', lutFormat: 'cube', lut3DFileName: 'Teal.cube', lut3DFileData: new TextEncoder().encode('LUT_3D_SIZE 4\n0 0 0\n') };
  assert.equal(adjustmentFunction(broken), null);
  assert.equal(unappliedAdjustment(broken), 'Color Lookup, its table (Teal.cube) not readable');
  assert.equal(unappliedAdjustment({ type: 'curves' }), 'curves');
});

function solid(name, left, top, w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set(rgba, i * 4);
  return { name, left, top, right: left + w, bottom: top + h, imageData: { width: w, height: h, data } };
}

function firstPixel(dataUrl) {
  const png = Buffer.from(String(dataUrl).split(',')[1], 'base64');
  let off = 8; const idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return [...inflateSync(Buffer.concat(idat)).subarray(1, 4)];
}

test('in a Photoshop file: the two layers change the pictures under them, as the file stores them', () => {
  const swapCube = new TextEncoder().encode(cube(corners(([r, g, b]) => [b, g, r]).map((v) => v.join(' ')), 2));
  const bytes = writePsdUint8Array({
    width: 20,
    height: 20,
    children: [
      solid('base', 0, 0, 20, 20, [200, 40, 40, 255]),
      { name: 'Reds', adjustment: selective('relative', { reds: { c: -100, m: 0, y: 0, k: 0 } }) },
      solid('swapped', 5, 5, 10, 10, [255, 100, 0, 255]),
      { name: 'Teal', adjustment: { type: 'color lookup', lookupType: '3dlut', name: 'Teal', lutFormat: 'cube', lut3DFileName: 'Teal.cube', lut3DFileData: swapCube } },
      { name: 'Look', adjustment: { type: 'color lookup', lookupType: 'abstractProfile', name: 'Look', profile: new Uint8Array(16) } },
    ],
  }, { noBackground: true, generateThumbnail: false });
  const plan = planPsdComponentImport(bytes);
  assert.equal(plan.ok, true, plan.error);
  const p = plan.component._children.Parts._children;
  // The base under both: its red lifted by Selective Color, then red and blue swapped.
  near(firstPixel(p.base._children.Background._children.Fill.imageSrc), [40, 40, 235], 1, 'the base');
  // Above Selective Color, under the lookup: only swapped.
  near(firstPixel(p.swapped._children.Background._children.Fill.imageSrc), [0, 100, 255], 1, 'the square');
  assert.ok(plan.warnings.some((line) => /close to Photoshop's: .*Selective Color/.test(line)), plan.warnings.join('\n'));
  assert.ok(plan.warnings.some((line) => /not applied: Look \(Color Lookup through an ICC profile\)/.test(line)), plan.warnings.join('\n'));
  assert.ok(!plan.warnings.some((line) => /Teal/.test(line)), 'the table is applied, not listed');
});
