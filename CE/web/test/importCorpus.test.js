// What a run of real files through every import found (thousands of SVGs, PDFs, Photoshop files and
// glTF models: the resvg and pdf.js test suites, psd-tools' Photoshop files, Khronos's sample models,
// desktop icons, Illustrator and LibreOffice drawings), each kept here as the smallest file that shows
// it, fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { writePsdUint8Array } from 'ag-psd';
import { planSvgComponentImport } from '../src/CE_Application/utils/svgComponentImport.js';
import { planSvgPanelImport, withoutSvgPrefix } from '../src/CE_Application/utils/svgPanelImport.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { planPsdPanelImport } from '../src/CE_Application/utils/psdPanelImport.js';
import { eightBit, readPhotoshop } from '../src/CE_Application/utils/psdRead.js';
import { adjustmentFunction, hueRangeWeight } from '../src/CE_Application/utils/psdAdjustments.js';
import { compositePsd } from '../src/CE_Application/utils/psdComposite.js';
import { readPdfArtwork } from '../src/CE_Application/utils/pdfArtwork.js';
import { readGltf } from '../src/CE_Application/utils/scene3dGltf.js';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPdf, illustratorPdf } from './support/pdfFixture.js';
import { render } from 'svelte/server';
import OutlineBorder from '../src/CE_Panel/components/OutlineBorder.svelte';
import { svgGradientStops } from '../src/CE_Application/utils/gradientStops.js';

const svg = (body, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;
const parts = (plan) => plan.component._children.Parts._children;
const fillOf = (part) => part._children.Background._children.Fill;
const borderOf = (part) => part._children.Background._children.Border;

test('an outline not closed with a Z is still filled, as SVG and PDF fill it; a straight stroke has nothing to fill', () => {
  // A PDF's filled paths come through pdf.js unclosed: an Illustrator drawing came in as nothing.
  const filled = planSvgComponentImport(svg('<path id="leaf" d="M10 10 L90 10 L50 90" fill="#336633"/>'));
  assert.equal(filled.ok, true, filled.error);
  assert.equal(fillOf(parts(filled).leaf).colour, 'FF336633');
  assert.equal(parts(filled).leaf.meta.closed, true, 'drawn closed, as a fill closes it');
  // Filled and stroked: the fill closed, the stroke open, so no closing edge is drawn.
  const both = parts(planSvgComponentImport(svg('<path id="arc" d="M10 10 L90 10 L50 90" fill="#336633" stroke="#000" stroke-width="2"/>')));
  assert.deepEqual(Object.keys(both), ['arc', 'arc_2']);
  assert.deepEqual([both.arc.meta.closed, borderOf(both.arc).enabled, both.arc_2.meta.closed, fillOf(both.arc_2).colour], [true, false, false, '00000000']);
  // A straight line with SVG's default black fill: only its stroke.
  const line = parts(planSvgComponentImport(svg('<path id="rule" d="M10 70 L70 70" stroke="#ccc" stroke-width="2"/>')));
  assert.deepEqual(Object.keys(line), ['rule']);
  assert.equal(line.rule.meta.closed, false);
});

test('a <use> of what holds it is not drawn, as SVG does not draw it, and does not hang the import', () => {
  const started = Date.now();
  const plan = planSvgComponentImport(svg('<g id="g1"><use href="#g1" x="20"/><use href="#g1" y="20"/><rect id="r" x="20" y="20" width="60" height="60" fill="green"/></g>'));
  assert.ok(Date.now() - started < 2000, 'it finishes');
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(Object.keys(parts(plan)), ['r']);
  assert.ok(plan.warnings.some((line) => /loop back/.test(line)), plan.warnings.join(' | '));
});

test('a drawing of more shapes than a component holds stops with what to do, quickly, where it ran out of memory', () => {
  // A PDF page of thousands of clipped paths: every mask carried every definition in the file.
  const clips = Array.from({ length: 2100 }, (_, i) => `<clipPath id="c${i}"><rect x="${i % 100}" y="0" width="1" height="1"/></clipPath>`).join('');
  const shapes = Array.from({ length: 2100 }, (_, i) => `<g clip-path="url(#c${i})"><rect x="${i % 100}" y="0" width="2" height="2" fill="red"/></g>`).join('');
  const started = Date.now();
  const plan = planSvgComponentImport(svg(`<defs>${clips}</defs>${shapes}`));
  assert.ok(Date.now() - started < 10000, `it finishes: ${Date.now() - started} ms`);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /more than 2,000 shapes.*New Panel from Vector Artwork/);
  // Under the limit, each mask carries only the clip path it uses.
  const few = planSvgComponentImport(svg(`<defs>${clips}</defs>${shapes.split('</g>').slice(0, 3).join('</g>')}</g>`));
  const mask = Buffer.from(Object.values(parts(few))[0].mask.src.split(',')[1], 'base64').toString('utf8');
  assert.equal((mask.match(/<clipPath /g) ?? []).length, 1, 'one clip path in its mask, not 2,100');
});

test('CSS colours as SVG takes them: names, hsl() and hsla(), #rgba, rgba() alpha, currentColor', () => {
  const plan = planSvgComponentImport(svg([
    '<rect id="named" width="10" height="10" fill="RebeccaPurple"/>',
    '<rect id="hsl" x="10" width="10" height="10" fill="hsl(120, 100%, 25%)"/>',
    '<rect id="hsla" x="20" width="10" height="10" fill="hsla(0, 100%, 50%, 0.5)"/>',
    '<rect id="hexalpha" x="30" width="10" height="10" fill="#00f8"/>',
    '<rect id="rgba" x="40" width="10" height="10" fill="rgba(0, 0, 0, 0.25)" fill-opacity="0.5"/>',
    '<g color="teal"><rect id="current" x="50" width="10" height="10" fill="currentColor"/></g>',
  ].join('')));
  const colour = (name) => fillOf(parts(plan)[name]).colour;
  assert.deepEqual(['named', 'hsl', 'hsla', 'hexalpha', 'rgba', 'current'].map(colour),
    ['FF663399', 'FF008000', '80FF0000', '880000FF', '20000000', 'FF008080']);
});

test('gradient stops as SVG places them: a missing offset is 0, one before the last is moved up to it', () => {
  const plan = planSvgComponentImport(svg('<defs><linearGradient id="g"><stop stop-color="red"/><stop offset="0.6" stop-color="lime"/>'
    + '<stop offset="0.3" stop-color="blue"/><stop offset="1" stop-color="hsla(60, 100%, 50%, 0.5)"/></linearGradient></defs>'
    + '<rect id="bar" width="100" height="20" fill="url(#g)"/>'));
  const stops = fillOf(parts(plan).bar).gradient.stops;
  assert.deepEqual(stops.map((stop) => stop.position), [0, 60, 60, 100]);
  assert.equal(stops[3].color, '80FFFF00');
});

test('a font size of 0 draws no text; a negative one is not a size and the default is kept', () => {
  const plan = planSvgComponentImport(svg('<text id="none" x="10" y="50" font-size="0">A</text><text id="bad" x="10" y="80" font-size="-20">B</text>'));
  assert.deepEqual(Object.keys(parts(plan)), ['bad']);
  assert.ok(parts(plan).bad._children.Layout.height > 0);
  assert.equal(parts(plan).bad._children.Text._children.Font.size, 16);
});

test('an SVG written with its namespace as a prefix is read as plain SVG, by both imports', () => {
  const text = '<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><svg:rect id="box" width="50" height="50" fill="green"/>'
    + '<svg:g id="controls"><svg:rect id="knob-cutoff" x="60" y="60" width="20" height="20"/></svg:g></svg:svg>';
  assert.match(withoutSvgPrefix(text), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:svg=/);
  assert.equal(planSvgComponentImport(text).ok, true);
  const panel = planSvgPanelImport(text);
  assert.equal(panel.ok, true, panel.error);
  assert.equal(panel.placeholders.length, 1);
  assert.equal(withoutSvgPrefix(svg('<rect/>')), svg('<rect/>'), 'any other SVG as it is');
});

test('an element with a filter, or a group with a blend mode, is a picture of itself, as SVG draws it', () => {
  // Filters a layer's own effects cannot be (a dilation, a turbulence): pictures.
  const plan = planSvgComponentImport(svg('<defs><filter id="blur"><feMorphology operator="dilate" radius="3"/></filter>'
    + '<filter id="wide" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence baseFrequency="0.1"/></filter>'
    + '<path id="dot" d="M0 0 H6 V6 H0 Z" fill="#c00"/></defs>'
    + '<rect id="soft" x="10" y="10" width="40" height="40" filter="url(#blur)"/>'
    + '<g id="tinted" style="mix-blend-mode:screen"><rect width="10" height="10" fill="red"/><rect x="5" width="10" height="10"/></g>'
    + '<rect id="shade" x="50" width="40" height="40" style="mix-blend-mode:multiply"/>'
    + '<circle id="glow" cx="70" cy="70" r="10" filter="url(#wide)"/>'
    + '<use id="spot" href="#dot" x="80" y="10" filter="url(#blur)"/>'));
  assert.equal(plan.ok, true, plan.error);
  const layout = (name) => { const l = parts(plan)[name]._children.Layout; return [l.x, l.y, l.width, l.height]; };
  const pictureOf = (name) => atob(fillOf(parts(plan)[name]).imageSrc.split(',')[1]);
  // Its box holds the filter's region: by default a tenth of the shape past each side (and a pixel).
  assert.equal(fillOf(parts(plan).soft).imageEnabled, true);
  assert.deepEqual(layout('soft'), [5, 5, 50, 50]);
  assert.match(pictureOf('soft'), /<filter id="blur">.*filter="url\(#blur\)"/);
  assert.deepEqual(layout('glow'), [49, 49, 42, 42], 'a region of its own, half the shape past each side');
  // The group blends as one, its layer's blend mode; a shape's own blend mode stays the shape's.
  assert.equal(fillOf(parts(plan).tinted).imageEnabled, true);
  assert.equal(parts(plan).tinted._children.Effects._children.Blend.mode, 'screen');
  assert.equal(parts(plan).shade._children.Effects._children.Blend.mode, 'multiply');
  assert.notEqual(fillOf(parts(plan).shade).imageEnabled, true);
  // A <use> carries what it draws into its picture.
  assert.match(pictureOf('spot'), /<path id="dot"/);
  assert.ok(plan.warnings.some((line) => /pictures of themselves.*filters.*soft, glow, spot/.test(line)), plan.warnings.join(' | '));
  assert.ok(plan.warnings.some((line) => /blend mode.*picture of itself.*tinted/.test(line)));
  // A group of one shape blends as that shape: it stays a shape, the blend mode its own.
  const one = planSvgComponentImport(svg('<g style="mix-blend-mode:multiply"><rect id="alone" width="10" height="10" fill="red"/></g>'));
  assert.notEqual(fillOf(parts(one).alone).imageEnabled, true);
  assert.equal(parts(one).alone._children.Effects._children.Blend.mode, 'multiply');
  // A filter not in the file is no filter, as in a browser: the shape is drawn as it is.
  const missing = planSvgComponentImport(svg('<rect id="plain" width="5" height="5" filter="url(#gone)"/>'));
  assert.notEqual(fillOf(parts(missing).plain).imageEnabled, true);
  assert.ok(missing.warnings.some((line) => /filter that is not in the file: plain/.test(line)));
});

const solid = (name, w, h, rgba) => ({ name, left: 0, top: 0, right: w, bottom: h, imageData: { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => rgba[i % 4]) } });

test('Photoshop: 16- and 32-bit pixels are made 8-bit, a 32-bit file\'s colour from linear light; masks stay coverage', () => {
  const sixteen = eightBit({ width: 1, height: 1, data: Uint16Array.from([65535, 32896, 0, 65535]) });
  assert.deepEqual([...sixteen.data], [255, 128, 0, 255]);
  // 0.2159 in linear light is 128 in sRGB; its opacity 0.5 stays half.
  const thirtyTwo = eightBit({ width: 1, height: 1, data: Float32Array.from([1, 0.2159, 0, 0.5]) });
  assert.deepEqual([...thirtyTwo.data], [255, 128, 0, 128]);
  assert.deepEqual([...eightBit({ width: 1, height: 1, data: Float32Array.from([0.5, 0.5, 0.5, 1]) }, false).data], [128, 128, 128, 255]);
  const plain = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  assert.equal(eightBit(plain), plain, 'an 8-bit picture as it is');
});

test('Photoshop: Hue/Saturation\'s colour ranges (Reds, Yellows, ...) are applied, round the colour wheel', () => {
  // A range is whole between its inner bounds and fades to nothing at its outer ones, across 0°.
  assert.equal(hueRangeWeight(0, [315, 345, 15, 45]), 1);
  assert.equal(hueRangeWeight(330, [315, 345, 15, 45]), 0.5);
  assert.equal(hueRangeWeight(30, [315, 345, 15, 45]), 0.5);
  assert.equal(hueRangeWeight(120, [315, 345, 15, 45]), 0);
  const plain = { a: 0, b: 0, c: 0, d: 0, hue: 0, saturation: 0, lightness: 0 };
  const fn = adjustmentFunction({
    type: 'hue/saturation', master: { ...plain, c: 25 },
    reds: { ...plain, a: 315, b: 345, c: 15, d: 45, lightness: 100 },
    blues: { ...plain, a: 195, b: 225, c: 255, d: 285, hue: 180 },
  });
  const round = (rgb) => rgb.map((v) => Math.round(v));
  assert.deepEqual(round(fn([255, 0, 0])), [255, 255, 255], 'red lightened to white');
  assert.deepEqual(round(fn([0, 0, 255])), [255, 255, 0], 'blue turned half round, to yellow');
  assert.deepEqual(round(fn([0, 255, 0])), [0, 255, 0], 'green in neither');
  assert.deepEqual(round(fn([128, 128, 128])), [128, 128, 128], 'a grey in none');
});

test('Photoshop: a group\'s Fill opacity, and knockout, shallow and deep, drawn as Photoshop draws them', () => {
  // psd-tools' knockout files, as layers: a white Background, a red layer, and blue in a group at 50 %
  // Fill. The expected pixels are Photoshop's own pictures of those files.
  const background = { ...solid('Background', 4, 4, [255, 255, 255, 255]), transparencyProtected: true };
  const red = solid('BG', 4, 4, [255, 0, 0, 255]);
  const blue = () => solid('BLUE', 4, 4, [0, 0, 255, 255]);
  const draw = (layers) => [...compositePsd(layers, 4, 4).pixels.slice(0, 4)];
  const group = (props, children) => ({ name: 'Group', blendMode: 'normal', opacity: 1, ...props, children });
  // No knockout: the Fill on the group, blue at half over red.
  assert.deepEqual(draw([background, red, group({ fillOpacity: 128 / 255 }, [blue()])]), [127, 0, 128, 255]);
  // Deep: through to the Background, blue at half over white; the same through a Pass Through group.
  assert.deepEqual(draw([background, red, group({ fillOpacity: 128 / 255, knockoutLevel: 2 }, [blue()])]), [127, 127, 255, 255]);
  assert.deepEqual(draw([background, red, group({ blendMode: 'pass through', fillOpacity: 128 / 255, knockoutLevel: 2 }, [blue()])]), [127, 127, 255, 255]);
  // Without a Background, through to nothing.
  assert.deepEqual(draw([{ ...background, transparencyProtected: false }, red, group({ fillOpacity: 128 / 255, knockoutLevel: 2 }, [blue()])]), [0, 0, 255, 128]);
  // Inside a group drawn on its own (Normal), shallow and deep both stop at it: green gives way to its
  // clear start, and the group lies on red. Inside a Pass Through group, deep goes on to the Background.
  const nested = (outer, level) => [background, red, group({ blendMode: outer, name: 'Outer' }, [solid('GREEN', 4, 4, [0, 255, 0, 255]), group({ fillOpacity: 128 / 255, knockoutLevel: level }, [blue()])])];
  assert.deepEqual(draw(nested('normal', 1)), [127, 0, 128, 255]);
  assert.deepEqual(draw(nested('normal', 2)), [127, 0, 128, 255]);
  assert.deepEqual(draw(nested('pass through', 2)), [127, 127, 255, 255]);
});

test('Photoshop, as a component: a knockout inside a group makes it one picture; one across layers cuts them', () => {
  const layer = (name, rgba, extra = {}) => ({ ...solid(name, 8, 8, rgba), ...extra });
  const file = (children) => writePsdUint8Array({ width: 8, height: 8, children });
  const inside = planPsdComponentImport(file([
    layer('panel', [255, 0, 0, 255]),
    { name: 'cap', opacity: 1, children: [layer('ring', [0, 255, 0, 255]), layer('hole', [0, 0, 255, 255], { knockout: true, fillOpacity: 0 })] },
  ]), { fileName: 'knob.psd' });
  assert.equal(inside.ok, true, inside.error);
  assert.ok(inside.warnings.some((line) => /one layer each.*: cap/.test(line)), inside.warnings.join(" | "));
  // At the top of the file, a knockout reaches the Background, or with none, through everything: the
  // layers under it, layers of their own, are cut to its shape, as deep as its opacity.
  const half = { ...solid('hole', 4, 8, [0, 0, 255, 255]), opacity: 0.5, knockout: true, fillOpacity: 0 };
  const across = planPsdComponentImport(file([layer('panel', [255, 0, 0, 255]), half]), { fileName: 'knob.psd' });
  assert.equal(across.ok, true, across.error);
  assert.ok(!across.warnings.some((line) => /Knockout/.test(line)), across.warnings.join(' | '));
  const panel = decodePng(fillOf(parts(across).panel).imageSrc);
  assert.ok(Math.abs(panel.at(1, 1)[3] - 128) <= 1, 'cut half through where the knockout is');
  assert.equal(panel.at(6, 1)[3], 255, 'whole beside it');
});

test('Photoshop: a Multichannel file comes in as its inks overprinted; a mode no Photoshop writes is refused', () => {
  // Its picture of itself, one channel at full ink (0) and two with none: without spot colours of its
  // own, the channels are cyan, magenta and yellow in turn, so it is cyan.
  const data = new Uint8ClampedArray(4 * 4 * 4).map((_, i) => [0, 255, 255, 255][i % 4]);
  const bytes = writePsdUint8Array({ width: 4, height: 4, imageData: { width: 4, height: 4, data } }, { generateThumbnail: false });
  const copy = bytes.slice();
  copy[24] = 0; copy[25] = 7;
  const read = readPhotoshop(copy, { composite: true });
  assert.equal(read.ok, true, read.error);
  assert.equal(read.converted, 'Multichannel');
  assert.deepEqual(read.psd.children, []);
  assert.deepEqual([...read.psd.imageData.data.slice(0, 4)], [0, 174, 239, 255]);
  const plan = planPsdComponentImport(copy, { fileName: 'inks.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.ok(plan.warnings.some((line) => /Multichannel colour: it has no layers.*inks/.test(line)), plan.warnings.join(' | '));
  assert.deepEqual(decodePng(fillOf(parts(plan).Background).imageSrc).at(0, 0), [0, 174, 239, 255]);

  const odd = bytes.slice();
  odd[24] = 0; odd[25] = 6;
  const refused = readPhotoshop(odd);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /not a Photoshop file CEditor can read/);
  assert.equal(planPsdPanelImport(odd).error, refused.error);
});

test('Photoshop: a file of one Background layer (no layers, only its picture) comes in as that one layer', () => {
  const w = 6; const h = 4;
  const data = new Uint8ClampedArray(w * h * 4).map((_, i) => [200, 100, 50, 255][i % 4]);
  const bytes = writePsdUint8Array({ width: w, height: h, imageData: { width: w, height: h, data } }, { generateThumbnail: false });
  const plan = planPsdComponentImport(bytes, { fileName: 'flat.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(Object.keys(parts(plan)), ['Background']);
  assert.deepEqual(['width', 'height'].map((k) => parts(plan).Background._children.Layout[k]), [w, h]);
});

test('PDF: a file that opens and fails on its page says it could not be read, where it threw', async () => {
  const pdfjs = {
    OPS: {},
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 1, getPageLabels: async () => null, destroy() {},
      getPage: async () => ({ getOperatorList: async () => { throw new Error('Illegal character: 41'); } }),
    }) }),
  };
  const read = await readPdfArtwork(new TextEncoder().encode('%PDF-1.4\n%%EOF'), { pdfjs });
  assert.deepEqual([read.ok, read.reason], [false, 'unreadable']);
  assert.match(read.error, /could not be read: Illegal character/);
});

test('PDF: a picture is waited for, encoded once however often it is drawn, and no finer than twice its drawn size', async () => {
  // 2,000 by 10 pixels, drawn twice 100 points wide: 78 PDFs of the corpus lost their pictures, read
  // before pdf.js had them; one drew a 151-megapixel picture forty times and never finished.
  const w = 2000; const h = 10;
  const pixels = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i += 1) pixels.set([i % w < w / 2 ? 200 : 20, 80, 40], i * 3);
  const bytes = illustratorPdf({
    width: 200, height: 100,
    layers: [{ name: 'Art', content: 'q 100 0 0 1 10 10 cm /Im0 Do Q q 100 0 0 1 10 50 cm /Im0 Do Q' }],
    resources: { XObject: { Im0: { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8`, content: pixels.toString('latin1') } } },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  const images = [...read.svg.matchAll(/<image width="(\d+)" height="(\d+)"[^>]* href="([^"]+)"/g)];
  assert.equal(images.length, 2, 'both drawn');
  assert.deepEqual(images.map((m) => [Number(m[1]), Number(m[2])]), [[200, 10], [200, 10]]);
  assert.equal(new Set(images.map((m) => m[3])).size, 1, 'one picture, encoded once');
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'image'), 'none dropped');
});

test('PDF: a JPEG 2000 picture is decoded (pdf.js\'s decoder, carried with the editor), where it was dropped', async () => {
  // An 8 by 8 picture, red on the left and blue on the right, saved as JPEG 2000 (lossless).
  const jpx = Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAACAAAAAgAAwcHAAAAAAAPY29scgEAAAAAABAAAADRanAyY/9P/1EALwAAAAAACAAAAAgAAAAAAAAAAAAAAAgAAAAIAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAMEBAAB/1wADUBASEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAUAAB/5PH1AQEf8+0CAXJx9QECJ/PwAgFc4DPwAgC58faCgACiElbv4DH2goACUBdW7/H2gwAF9iXpf9/gMfaDAAXLJWl/3//2Q==', 'base64');
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: 'q 80 0 0 80 10 10 cm /Im0 Do Q' }],
    resources: { XObject: { Im0: { dict: '/Type /XObject /Subtype /Image /Width 8 /Height 8 /Filter /JPXDecode', content: jpx.toString('latin1') } } },
  });
  const wasmUrl = `${new URL('../node_modules/pdfjs-dist/wasm/', import.meta.url).pathname}`;
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy, wasmUrl });
  assert.equal(read.ok, true, read.error);
  assert.match(read.svg, /<image width="8" height="8"[^>]* href="data:image\/png/);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'image'), 'not dropped');
});

test('PDF: a mesh used as a fill\'s pattern is drawn cut to the shape, where it was its mean colour', async () => {
  const vertex = (x, y, rgb) => Buffer.from([0, x >> 8, x & 255, y >> 8, y & 255, ...rgb]);
  const data = Buffer.concat([vertex(0, 0, [255, 0, 0]), vertex(65535, 0, [0, 255, 0]), vertex(0, 65535, [0, 0, 255])]);
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/Pattern cs /P0 scn 10 10 50 50 re f' }],
    resources: {
      Pattern: { P0: '<< /PatternType 2 /Shading 5 0 R >>' },
      Shading: { Sh0: { dict: '/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 /BitsPerFlag 8 /Decode [0 100 0 100 0 1 0 1 0 1]', content: data.toString('latin1') } },
    },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'mesh-gradient'), read.svg.slice(0, 400));
  const clip = read.svg.match(/<clipPath id="(c\d+)" clipPathUnits="userSpaceOnUse"><path d="M10 90L60 90L60 40L10 40Z"\/><\/clipPath>/)?.[1];
  assert.ok(clip, read.svg.slice(0, 600));
  assert.match(read.svg, new RegExp(`<g clip-path="url\\(#${clip}\\)"><image `));
});

test('PDF: a soft mask (an opacity mask) masks what is drawn under it, where it showed unmasked', async () => {
  // Illustrator's opacity masks: what they hid came in as black boxes.
  const page = (smask) => illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/GS0 gs 1 0 0 rg 0 0 100 100 re f' }],
    resources: {
      XObject: { Fm0: { dict: '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >>', content: '1 1 1 rg 0 0 50 100 re f' } },
      ExtGState: { GS0: `<< /Type /ExtGState /SMask << /Type /Mask ${smask} /G 4 0 R >> >>` },
    },
  });
  const luminosity = await readPdfArtwork(page('/S /Luminosity'), { pdfjs: pdfjsLegacy });
  assert.equal(luminosity.ok, true, luminosity.error);
  // The mask: black where the group draws nothing (its backdrop), white where it draws white.
  assert.match(luminosity.svg, /<mask id="(m\d+)" maskUnits="userSpaceOnUse"[^>]*><rect [^>]*fill="#000000"\/><rect x="0" y="0" width="50" height="100" fill="#ffffff"\/><\/mask>/);
  const id = luminosity.svg.match(/<mask id="(m\d+)"/)[1];
  assert.match(luminosity.svg, new RegExp(`<g mask="url\\(#${id}\\)"><rect x="0" y="0" width="100" height="100" fill="#ff0000"/>`));
  assert.ok(!(luminosity.notes ?? []).some((note) => note.kind === 'opacity-mask'), 'not noted as dropped');
  // Alpha: by coverage, no backdrop.
  const alpha = await readPdfArtwork(page('/S /Alpha'), { pdfjs: pdfjsLegacy });
  assert.match(alpha.svg, /<mask id="m\d+" [^>]*style="mask-type:alpha"><rect x="0" y="0" width="50"/);
  // And through to a component: the red layer masked.
  const plan = planSvgComponentImport(luminosity.svg);
  assert.equal(plan.ok, true, plan.error);
  const masked = Object.values(parts(plan)).find((part) => fillOf(part).colour === 'FFFF0000');
  assert.equal(masked?.mask?.enabled, true);
  assert.match(atob(masked.mask.src.split(",")[1]), /<mask id="m\d+"/, "the mask carried into its picture");
});

/** A PNG data URL from utils/pngEncode.js (8-bit RGBA, filter 0 on every row) as { width, height, at(x, y) }. */
function decodePng(url) {
  const bytes = Buffer.from(url.split(',')[1], 'base64');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const chunks = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') chunks.push(bytes.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  return { width, height, at: (x, y) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 5 + x * 4)] };
}

test('PDF: a mesh shading (a gradient mesh) is drawn as a picture of itself, blended across each triangle', async () => {
  // One triangle: red at the bottom left, green at the bottom right, blue at the top left (PDF space).
  const vertex = (x, y, rgb) => Buffer.from([0, x >> 8, x & 255, y >> 8, y & 255, ...rgb]);
  const data = Buffer.concat([vertex(0, 0, [255, 0, 0]), vertex(65535, 0, [0, 255, 0]), vertex(0, 65535, [0, 0, 255])]);
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/Sh0 sh' }],
    resources: { Shading: { Sh0: { dict: '/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 /BitsPerFlag 8 /Decode [0 100 0 100 0 1 0 1 0 1]', content: data.toString('latin1') } } },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'mesh-gradient'), 'not one mean colour');
  const [, w, h, transform, href] = read.svg.match(/<image width="(\d+)" height="(\d+)" preserveAspectRatio="none" transform="matrix\(([^)]+)\)" href="([^"]+)"/);
  const picture = decodePng(href);
  assert.deepEqual([picture.width, picture.height], [Number(w), Number(h)]);
  // Its rows run up the page (PDF's y), the transform turning them over.
  assert.equal(Number(transform.split(' ')[3]) < 0, true);
  const near = (rgba, rgb) => rgb.every((v, k) => Math.abs(rgba[k] - v) < 12) && rgba[3] === 255;
  assert.ok(near(picture.at(1, 1), [255, 0, 0]), `red corner: ${picture.at(1, 1)}`);
  assert.ok(near(picture.at(picture.width - 2, 1), [0, 255, 0]), `green corner: ${picture.at(picture.width - 2, 1)}`);
  assert.ok(near(picture.at(1, picture.height - 2), [0, 0, 255]), `blue corner: ${picture.at(1, picture.height - 2)}`);
  assert.equal(picture.at(picture.width - 2, picture.height - 2)[3], 0, 'clear where no triangle is');
});

test('PDF: a soft mask set on a transparency group masks the group whole, with its opacity and blend mode', async () => {
  // Illustrator draws a masked object as a group that resets the mask inside: the mask was lost.
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/GS0 gs /Fm1 Do' }],
    resources: {
      XObject: {
        Fm0: { dict: '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >>', content: '1 1 1 rg 0 0 50 100 re f' },
        Fm1: { dict: '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency >> /Resources << /ExtGState << /GS1 << /SMask /None >> >> >>', content: '/GS1 gs 1 0 0 rg 0 0 100 100 re f' },
      },
      ExtGState: { GS0: '<< /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G 4 0 R >> /ca 0.5 /BM /Screen >>' },
    },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  const id = read.svg.match(/<mask id="(m\d+)"/)[1];
  assert.match(read.svg, new RegExp(`<g opacity="0.5" style="mix-blend-mode:screen" mask="url\\(#${id}\\)"><rect x="0" y="0" width="100" height="100" fill="#ff0000"/>`));
});

test('glTF: required KTX2 textures are read as none (objects draw in their material\'s colour); Draco is decoded in a page', async () => {
  const asset = (json) => `data:model/gltf+json;base64,${Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...json })).toString('base64')}`;
  // A model that requires KTX2: its textures left empty, the model read, where it was refused.
  const basis = await readGltf({ asset: asset({
    extensionsUsed: ['KHR_texture_basisu'], extensionsRequired: ['KHR_texture_basisu'],
    scenes: [{ nodes: [0] }], scene: 0, nodes: [{ name: 'Cap' }],
    images: [{ uri: 'data:image/ktx2;base64,AAAA' }], textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  }) });
  assert.equal(basis.children[0].name, 'Cap');
  // Draco decodes in Web Workers, which a page has and node does not: said, not attempted.
  await assert.rejects(() => readGltf({ asset: asset({ extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] }) }),
    /compressed with Draco, which is decoded in the editor/);
});

test('a radial gradient on an outline is drawn radial, its stops\' opacity kept (Inkscape\'s highlights)', () => {
  // An icon's highlight, a white-to-clear radial gradient stroke, was drawn as a straight light band.
  const plan = planSvgComponentImport(svg('<defs><radialGradient id="r" cx="0.3" cy="0.3" r="0.7"><stop offset="0" stop-color="#fff"/>'
    + '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
    + '<path id="shine" d="M20 20 H80 V80 H20 Z" fill="none" stroke="url(#r)" stroke-width="8"/>'));
  const border = borderOf(parts(plan).shine);
  assert.equal(border.gradient.type, 'radial');
  assert.deepEqual(svgGradientStops(border.gradient).map((stop) => stop.opacity), [1, 0]);
  const drawn = render(OutlineBorder, { props: { border, outline: { d: 'M4 4 H64 V64 H4 Z' }, width: 68, height: 68 } }).body;
  assert.match(drawn, /<radialGradient[^>]*gradientUnits="userSpaceOnUse"/);
  assert.doesNotMatch(drawn, /<linearGradient/);
  assert.match(drawn, /stop-opacity="0"/);
});


test('an outline\'s colour keeps its own opacity (a stroke-opacity, here handed down by a group)', () => {
  const plan = planSvgComponentImport(svg('<g stroke-opacity="0.5"><rect id="box" x="40" y="40" width="20" height="20" fill="gray" stroke="green" stroke-width="4"/></g>'));
  const border = borderOf(parts(plan).box);
  assert.equal(border.colour, '80008000');
  const drawn = render(OutlineBorder, { props: { border, outline: { d: 'M2 2 H22 V22 H2 Z' }, width: 24, height: 24 } }).body;
  assert.match(drawn, /fill="#008000" fill-opacity="0.502"/, 'drawn at half, where it was drawn solid');
});

test('gradients as SVG paints them: one stop is its colour; the paint\'s opacity fades every stop', () => {
  const plan = planSvgComponentImport(svg('<defs><linearGradient id="one"><stop offset="0.5" stop-color="green" stop-opacity="0.5"/></linearGradient>'
    + '<linearGradient id="two"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>'
    + '<rect id="solid" x="10" y="10" width="30" height="30" fill="url(#one)" stroke="url(#one)" stroke-width="4"/>'
    + '<rect id="faded" x="50" y="10" width="30" height="30" fill="url(#two)" fill-opacity="0.5"/>'));
  assert.deepEqual(plan.warnings, []);
  assert.equal(fillOf(parts(plan).solid).colour, '80008000', 'one stop: its colour, where it was no paint');
  assert.equal(borderOf(parts(plan).solid).colour, '80008000');
  assert.deepEqual(fillOf(parts(plan).faded).gradient.stops.map((stop) => stop.color), ['80FF0000', '800000FF']);
});

test('an embedded picture: its wrapped base64 joined, placed as preserveAspectRatio says', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  const wrapped = `data:image/png;base64,\n${png.slice(0, 40)}\n  ${png.slice(40)}`;
  const plan = planSvgComponentImport(svg(`<image id="meet" x="0" y="0" width="80" height="40" xlink:href="${wrapped}"/>`
    + `<image id="slice" x="0" y="50" width="80" height="40" preserveAspectRatio="xMinYMax slice" href="data:image/png;base64,${png}"/>`
    + `<image id="none" x="0" y="0" width="10" height="90" preserveAspectRatio="none" href="data:image/png;base64,${png}"/>`));
  const meet = fillOf(parts(plan).meet);
  assert.equal(meet.imageSrc, `data:image/png;base64,${png}`, 'no line breaks, which CSS does not take');
  assert.deepEqual([meet.imageFit, meet.imageAlign], ['contain', 'center']);
  assert.deepEqual([fillOf(parts(plan).slice).imageFit, fillOf(parts(plan).slice).imageAlign], ['cover', 'bottom-left']);
  assert.equal(fillOf(parts(plan).none).imageFit, 'stretch');
  // A picture that is itself an SVG fills the box and places itself, as a browser draws it.
  const inner = planSvgComponentImport(svg(`<image id="drawing" width="80" height="40" preserveAspectRatio="xMidYMid slice" href="data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"/>')}"/>`));
  assert.equal(fillOf(parts(inner).drawing).imageFit, 'stretch');
});

test('a clip in objectBoundingBox units on a turned shape clips it in the shape\'s own box', async () => {
  const file = svg('<clipPath id="c" clipPathUnits="objectBoundingBox"><rect x="0.2" y="0.2" width="0.6" height="0.6"/></clipPath>'
    + '<rect id="turned" width="100" height="100" fill="green" clip-path="url(#c)" transform="translate(50 -20) rotate(45)"/>', 'viewBox="0 0 100 100"');
  // As a mask: the clip, in the shape's own units, turned with it.
  const masked = planSvgComponentImport(file);
  const mask = atob(parts(masked).turned.mask.src.split(',')[1]);
  assert.match(mask, /<clipPath id="c-box-1" clipPathUnits="userSpaceOnUse" transform="matrix\(100 0 0 100 0 0\)">/);
  assert.match(mask, /<g transform="matrix\(0\.707107 0\.707107 -0\.707107 0\.707107 50 -20\)" clip-path="url\(#c-box-1\)">/);
  // Cut to it, with the geometry to cut with: the inner square, turned.
  const { loadGeometry } = await import('../src/CE_Application/utils/partOutlines.js');
  const cut = planSvgComponentImport(file, { geometry: await loadGeometry() });
  const layout = parts(cut).turned._children.Layout;
  assert.equal(parts(cut).turned.mask, undefined);
  // A clip turned about an origin of its own (transform-origin) is left to the browser, as it was.
  const about = planSvgComponentImport(svg('<clipPath id="c" clipPathUnits="objectBoundingBox" transform="scale(2)" transform-origin="center"><rect x="0.3" y="0.3" width="0.4" height="0.4"/></clipPath>'
    + '<rect id="box" width="100" height="100" fill="green" clip-path="url(#c)"/>'), { geometry: await loadGeometry() });
  assert.match(atob(parts(about).box.mask.src.split(',')[1]), /clip-path="url\(#c\)"/);
  // The 60 by 60 inner square turned 45°: 85 across, about its centre (50, 51).
  assert.deepEqual([layout.x, layout.y, layout.width, layout.height].map((v) => Math.round(v)), [8, 8, 85, 85]);
});

test('style rules by type, id and class, as CSS ranks them; !important read past', () => {
  const plan = planSvgComponentImport(svg('<style>/* rules */ rect { fill: red } .a, .b { fill: #00f } #x { fill: green !important } path.e { fill: #ff0 } g > rect { fill: black }</style>'
    + '<rect id="r" width="20" height="20"/><rect class="a" id="q" x="30" width="20" height="20"/><rect class="b" id="x" x="60" width="20" height="20"/><path class="e" id="p" d="M0 50h30v30h-30z"/>'));
  assert.deepEqual(['r', 'q', 'x', 'p'].map((name) => fillOf(parts(plan)[name]).colour), ['FFFF0000', 'FF0000FF', 'FF008000', 'FFFFFF00']);
});

test('PDF: an image mask (a stencil) is painted in the fill colour, where it was dropped', async () => {
  // 8 by 2 bits: the left half 1 (clear), the right half 0 (painted, PDF's default decode).
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '1 0 0 rg q 80 0 0 20 10 10 cm /Im0 Do Q' }],
    resources: { XObject: { Im0: { dict: '/Type /XObject /Subtype /Image /Width 8 /Height 2 /ImageMask true /BitsPerComponent 1', content: Buffer.from([0xf0, 0xf0]).toString('latin1') } } },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'image-mask'), 'not noted as dropped');
  const href = read.svg.match(/<image [^>]*href="([^"]+)"/)[1];
  const picture = decodePng(href);
  assert.deepEqual(picture.at(0, 0), [255, 0, 0, 0], 'clear on the left');
  assert.deepEqual(picture.at(picture.width - 1, 0), [255, 0, 0, 255], 'red on the right');
});

test('PDF: a tiling pattern is drawn as one, its cell repeated, where it was grey', async () => {
  // A 10-point cell with a red square in its lower left; and an uncoloured one painted blue.
  const page = (paint) => illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: `${paint} 0 0 100 100 re f` }],
    resources: {
      Pattern: { P0: { dict: '/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>', content: '1 0 0 rg 0 0 5 5 re f' } },
      ColorSpace: { CS0: '[/Pattern /DeviceRGB]' },
    },
  });
  const coloured = await readPdfArtwork(page('/Pattern cs /P0 scn'), { pdfjs: pdfjsLegacy });
  assert.equal(coloured.ok, true, coloured.error);
  assert.ok(!(coloured.notes ?? []).some((note) => note.kind === 'pattern-fill'), 'not noted as grey');
  const id = coloured.svg.match(/<pattern id="([^"]+)" patternUnits="userSpaceOnUse" x="0" y="0" width="10" height="10" patternTransform="matrix\(1 0 0 -1 0 100\)">/)?.[1];
  assert.ok(id, coloured.svg.slice(0, 600));
  assert.match(coloured.svg, new RegExp(`<rect x="0" y="0" width="5" height="5" fill="#ff0000"/>`));
  assert.match(coloured.svg, new RegExp(`fill="url\\(#${id}\\)"`));
  // Through to a component: the pattern drawn as the layer's picture.
  const plan = planSvgComponentImport(coloured.svg);
  assert.ok(Object.values(parts(plan)).some((part) => /<pattern/.test(atob(String(fillOf(part).picture ?? fillOf(part).imageSrc ?? '').split(',')[1] ?? ''))));
  const uncoloured = await readPdfArtwork(illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/CS0 cs 0 0 1 /P0 scn 0 0 100 100 re f' }],
    resources: {
      Pattern: { P0: { dict: '/PatternType 1 /PaintType 2 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>', content: '0 0 5 5 re f' } },
      ColorSpace: { CS0: '[/Pattern /DeviceRGB]' },
    },
  }), { pdfjs: pdfjsLegacy });
  assert.match(uncoloured.svg, /<pattern [^>]*><g [^>]*><g [^>]*><rect x="0" y="0" width="5" height="5" fill="#0000ff"\/>/);
});

test('PDF: a page turned in the file (/Rotate) comes in turned, as a viewer shows it', async () => {
  // A 200 by 100 page turned a quarter clockwise: 100 wide and 200 high, its red square, at the bottom
  // left of the page as written, at the top left (as poppler draws it); unturned it was at the bottom.
  const plain = illustratorPdf({ width: 200, height: 100, layers: [{ name: 'Art', content: '1 0 0 rg 0 0 20 20 re f' }] });
  const text = Buffer.from(plain).toString('latin1').replace('/MediaBox [0 0 200 100]', '/MediaBox [0 0 200 100] /Rotate 90');
  // The cross-reference offsets after the change move by its length; pdf.js reads past that.
  const read = await readPdfArtwork(new Uint8Array(Buffer.from(text, 'latin1')), { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  assert.deepEqual([read.width, read.height], [100, 200]);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'rotated'));
  assert.match(read.svg, /<rect x="0" y="0" width="20" height="20" fill="#ff0000"\/>/);
});

test('a stroke painted with a pattern is a picture of the stroke, over the shape\'s fill, where it was dropped', () => {
  const plan = planSvgComponentImport(svg('<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0 4L4 0" stroke="#000"/></pattern></defs>'
    + '<rect id="box" x="20" y="20" width="40" height="40" fill="#ccc" stroke="url(#hatch)" stroke-width="6" stroke-linejoin="round"/>'));
  assert.deepEqual(plan.warnings, []);
  assert.equal(fillOf(parts(plan).box).colour, 'FFCCCCCC');
  const outline = parts(plan).box_outline;
  const picture = atob(fillOf(outline).imageSrc.split(',')[1]);
  assert.match(picture, /<pattern id="hatch"/);
  assert.match(picture, /stroke="url\(#hatch\)" stroke-width="6" stroke-linejoin="round"/);
});

test('PDF: a stencil painted with a pattern is that paint masked by it; a mesh with no area draws nothing', async () => {
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'Art', content: '/Pattern cs /P0 scn q 80 0 0 20 10 10 cm /Im0 Do Q' }],
    resources: {
      Pattern: { P0: { dict: '/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>', content: '1 0 0 rg 0 0 5 5 re f' } },
      XObject: { Im0: { dict: '/Type /XObject /Subtype /Image /Width 8 /Height 2 /ImageMask true /BitsPerComponent 1', content: Buffer.from([0xf0, 0xf0]).toString('latin1') } },
    },
  });
  const read = await readPdfArtwork(bytes, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, true, read.error);
  assert.ok(!(read.notes ?? []).some((note) => note.kind === 'pattern-fill'));
  const mask = read.svg.match(/<mask id="(m\d+)"[^>]*style="mask-type:alpha"><image /)?.[1];
  assert.ok(mask, read.svg.slice(0, 500));
  assert.match(read.svg, new RegExp(`<path d="M10 90L90 90L90 70L10 70Z" fill="url\\(#pt\\d+\\)" mask="url\\(#${mask}\\)"/>`));

  // A mesh whose points all fall on one spot.
  const vertex = (x, y) => Buffer.from([0, x >> 8, x & 255, y >> 8, y & 255, 255, 0, 0]);
  const empty = await readPdfArtwork(illustratorPdf({
    width: 100, height: 100, layers: [{ name: 'Art', content: '/Sh0 sh' }],
    resources: { Shading: { Sh0: { dict: '/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 /BitsPerFlag 8 /Decode [0 100 0 100 0 1 0 1 0 1]', content: Buffer.concat([vertex(10, 10), vertex(10, 10), vertex(10, 10)]).toString('latin1') } } },
  }), { pdfjs: pdfjsLegacy });
  assert.doesNotMatch(empty.svg, /<rect|<image/, 'nothing drawn, where the page was painted in its mean colour');
});

test('a filter that is a blur or a drop shadow is the shape\'s own effect, and it stays a shape', () => {
  // Each filter's region wide enough for its effect, as Inkscape writes it: one that cuts the effect
  // off is drawn by SVG (below).
  const wide = 'x="-1" y="-1" width="3" height="3"';
  const plan = planSvgComponentImport(svg('<defs>'
    + `<filter id="soft" ${wide}><feGaussianBlur stdDeviation="2"/></filter>`
    // Inkscape's Drop Shadow.
    + `<filter id="ink" ${wide}><feFlood flood-opacity="0.5" flood-color="rgb(0,0,0)" result="flood"/><feComposite in="flood" in2="SourceGraphic" operator="in" result="c1"/>'
    + '<feGaussianBlur in="c1" stdDeviation="3" result="blur"/><feOffset dx="4" dy="5" result="offset"/><feComposite in="SourceGraphic" in2="offset" operator="over"/></filter>`
    // The older way: the alpha blurred, moved, its opacity set, merged under the shape.
    + `<filter id="classic" ${wide}><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dx="1" dy="2" result="o"/>'
    + '<feComponentTransfer in="o" result="s"><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    + `<filter id="drop" ${wide}><feDropShadow dx="2" dy="3" stdDeviation="1.5" flood-color="#f00" flood-opacity="0.6"/></filter>`
    + '</defs>'
    + '<rect id="a" x="10" y="10" width="20" height="20" fill="#00f" filter="url(#soft)"/>'
    + '<rect id="b" x="40" y="10" width="20" height="20" fill="#00f" filter="url(#ink)"/>'
    + '<g transform="scale(2)"><rect id="c" x="5" y="20" width="10" height="10" fill="#00f" filter="url(#classic)"/></g>'
    + '<circle id="d" cx="70" cy="70" r="10" fill="#00f" filter="url(#drop)"/>'));
  const effects = (name) => parts(plan)[name]._children.Effects._children;
  for (const name of ['a', 'b', 'c', 'd']) assert.notEqual(fillOf(parts(plan)[name]).imageEnabled, true, `${name} a shape`);
  assert.equal(effects('a').Filters.blur, 2);
  const shadow = (name) => { const [s] = effects(name).Shadows.items; return [s.enabled, s.type, s.offsetX, s.offsetY, s.blur, s.colour]; };
  assert.deepEqual(shadow('b'), [true, 'drop', 4, 5, 6, '80000000']);
  // Under the group's scale of two: twice the offset and the blur.
  assert.deepEqual(shadow('c'), [true, 'drop', 2, 4, 8, '66000000']);
  assert.deepEqual(shadow('d'), [true, 'drop', 2, 3, 3, '99FF0000']);
  assert.ok(plan.warnings.some((line) => /own blur, drop shadows or colour filters.*a, b, c, d/.test(line)), plan.warnings.join(' | '));
  // The default region, a tenth round the shape, cuts a large blur off; and a filter list with more
  // than the one url: both drawn by SVG, as pictures.
  const cut = planSvgComponentImport(svg('<filter id="f"><feGaussianBlur stdDeviation="4"/></filter>'
    + '<rect id="cut" x="10" y="10" width="20" height="20" filter="url(#f)"/><rect id="more" x="50" y="10" width="20" height="20" filter="url(#f) grayscale()"/>'));
  assert.equal(fillOf(parts(cut).cut).imageEnabled, true);
  assert.equal(fillOf(parts(cut).more).imageEnabled, true);
});

test('Photoshop, as a component: a Normal group whose layers blend is one picture, as Photoshop puts it together', () => {
  const layer = (name, rgba, extra = {}) => ({ ...solid(name, 8, 8, rgba), ...extra });
  const plan = planPsdComponentImport(writePsdUint8Array({ width: 8, height: 8, children: [
    layer('panel', [255, 255, 0, 255]),
    { name: 'shade', blendMode: 'normal', opacity: 1, children: [layer('tint', [128, 128, 128, 255], { blendMode: 'multiply' })] },
    { name: 'loose', blendMode: 'pass through', opacity: 1, children: [layer('dark', [128, 128, 128, 255], { blendMode: 'multiply' })] },
  ] }), { fileName: 'knob.psd' });
  assert.equal(plan.ok, true, plan.error);
  // The multiply inside the Normal group has nothing under it in the group: the grey as it is.
  assert.deepEqual(decodePng(fillOf(parts(plan).shade).imageSrc).at(2, 2), [128, 128, 128, 255]);
  // In a Pass Through group, the layer stays a layer of its own, multiplying what is under it.
  assert.equal(parts(plan).dark._children.Effects._children.Blend.mode, 'multiply');
});

/** A one-layer, 1 by 1 Photoshop file in CMYK, its channels raw, as the format lays it out. */
function cmykPsd(cmyk, name = 'ink') {
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const u32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
  const channels = [[-1, 255], [0, cmyk[0]], [1, cmyk[1]], [2, cmyk[2]], [3, cmyk[3]]];
  const nameBytes = [name.length, ...ascii(name)];
  while (nameBytes.length % 4) nameBytes.push(0);
  const record = [
    ...u32(0), ...u32(0), ...u32(1), ...u32(1), ...u16(channels.length),
    ...channels.flatMap(([id]) => [...u16(id & 0xffff), ...u32(3)]),
    ...ascii('8BIMnorm'), 255, 0, 0, 0,
    ...u32(8 + nameBytes.length), ...u32(0), ...u32(0), ...nameBytes,
  ];
  const data = channels.flatMap(([, value]) => [0, 0, value]);
  let info = [...u16(1), ...record, ...data];
  if (info.length % 2) info.push(0);
  const section = [...u32(info.length), ...info, ...u32(0)];
  return new Uint8Array([
    ...ascii('8BPS'), ...u16(1), 0, 0, 0, 0, 0, 0, ...u16(4), ...u32(1), ...u32(1), ...u16(8), ...u16(4),
    ...u32(0), ...u32(0), ...u32(section.length), ...section,
    ...u16(0), cmyk[0], cmyk[1], cmyk[2], cmyk[3],
  ]);
}

test('Photoshop: CMYK and Lab files are read, their colours converted to RGB, where they were refused', () => {
  // Stored as Photoshop stores ink (255 none): no ink is white; full cyan and full black as a press
  // shows them (U.S. Web Coated SWOP, which Photoshop draws as 0 174 239 and 35 31 32).
  for (const [cmyk, rgb] of [[[255, 255, 255, 255], [255, 255, 255]], [[0, 255, 255, 255], [0, 185, 242]], [[255, 255, 255, 0], [44, 46, 53]]]) {
    const read = readPhotoshop(cmykPsd(cmyk), { composite: true });
    assert.equal(read.ok, true, read.error);
    assert.equal(read.converted, 'CMYK');
    assert.deepEqual([...read.psd.children[0].imageData.data], [...rgb, 255], `${cmyk}`);
    assert.deepEqual([...read.psd.imageData.data], [...rgb, 255], `its picture of itself, ${cmyk}`);
  }
  const plan = planPsdComponentImport(cmykPsd([0, 255, 255, 255], 'cyan'), { fileName: 'cyan.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.ok(plan.warnings.some((line) => /CMYK colour: its colours are made RGB as a standard press profile shows them.*adjustment layers act on the RGB/.test(line)), plan.warnings.join(' | '));
  assert.deepEqual(decodePng(fillOf(parts(plan).cyan).imageSrc).at(0, 0), [0, 185, 242, 255]);

  // Lab: an RGB file's channels read as L, a and b (L 255 is white, a and b 128 neutral).
  const rgb = writePsdUint8Array({ width: 2, height: 1, children: [{ name: 'lab', left: 0, top: 0, right: 2, bottom: 1, imageData: { width: 2, height: 1, data: new Uint8ClampedArray([255, 128, 128, 255, 0, 128, 128, 255]) } }] });
  const lab = new Uint8Array(rgb);
  lab[25] = 9;
  const read = readPhotoshop(lab);
  assert.equal(read.ok, true, read.error);
  assert.equal(read.converted, 'Lab');
  assert.deepEqual([...read.psd.children[0].imageData.data], [255, 255, 255, 255, 0, 0, 0, 255]);
});

test('Photoshop: a fill layer saved without pixels is drawn from its fill and vector mask; gradient stops read 0 to 1', async () => {
  const { psdGradient } = await import('../src/CE_Application/utils/psdVectors.js');
  // ag-psd gives a gradient's stops 0..1: they were read as 0..4096, every stop at 0.
  const gradient = psdGradient({ colorStops: [{ color: { r: 255, g: 0, b: 0 }, location: 0 }, { color: { r: 0, g: 0, b: 255 }, location: 1 }], angle: 0 });
  assert.equal(gradient.stops[0].position, 0);
  assert.equal(gradient.stops.at(-1).position, 100);
  assert.equal(gradient.stops[0].color, 'FFFF0000');
  assert.equal(gradient.stops.at(-1).color, 'FF0000FF');
  // A red square, 2..6 of an 8 by 8 document, as a shape with no pixels: its vector mask's path.
  const corner = (x, y) => ({ points: [x, y, x, y, x, y] });
  const shape = { name: 'square', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } },
    vectorMask: { paths: [{ open: false, operation: 'combine', knots: [corner(2, 2), corner(6, 2), corner(6, 6), corner(2, 6)] }] } };
  const { pixels, notDrawn } = compositePsd([shape], 8, 8);
  const at = (x, y) => [...pixels.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
  assert.deepEqual(at(3, 3), [255, 0, 0, 255]);
  assert.deepEqual(at(0, 0)[3], 0);
  assert.deepEqual(at(6, 3)[3], 0, 'the square ends at 6');
  assert.deepEqual(notDrawn, { effects: [], adjustment: [] });
  // With a hole subtracted, and a fill layer of the whole document.
  const holed = { ...shape, vectorMask: { paths: [...shape.vectorMask.paths, { open: false, operation: 'subtract', knots: [corner(3, 3), corner(5, 3), corner(5, 5), corner(3, 5)] }] } };
  assert.equal(compositePsd([holed], 8, 8).pixels[(4 * 8 + 4) * 4 + 3], 0);
  const whole = { name: 'fill', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 0, g: 0, b: 255 } } };
  assert.deepEqual([...compositePsd([whole], 8, 8).pixels.slice(0, 4)], [0, 0, 255, 255]);
});

test('Photoshop: an Indexed Color file ag-psd cannot read is read through its palette', () => {
  // 2 by 1, no layers, its picture raw: palette entries 3 (red) and 7 (blue).
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const u32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const palette = new Array(768).fill(0);
  palette[3] = 255; palette[512 + 7] = 255;
  const bytes = new Uint8Array([
    ...[...'8BPS'].map((c) => c.charCodeAt(0)), ...u16(1), 0, 0, 0, 0, 0, 0, ...u16(1), ...u32(1), ...u32(2), ...u16(8), ...u16(2),
    ...u32(768), ...palette, ...u32(0), ...u32(0), ...u16(0), 3, 7,
  ]);
  const read = readPhotoshop(bytes, { composite: true });
  assert.equal(read.ok, true, read.error);
  assert.deepEqual([...read.psd.imageData.data], [255, 0, 0, 255, 0, 0, 255, 255]);
  assert.equal(planPsdComponentImport(bytes, { fileName: 'indexed.psd' }).ok, true);
});

test('PDF: what would make pdf.js run out of memory is refused with what is wrong, before pdf.js reads it', async () => {
  const { postScriptRuns, fontMapRuns, pdfHazard } = await import('../src/CE_Application/utils/pdfGuard.js');
  // PostScript calculator programs: valid ones run, an unknown operator or an empty stack does not.
  assert.equal(postScriptRuns('{ 1 exch sub }', 1), true);
  assert.equal(postScriptRuns('{ dup 0.5 gt { 1 } { 0 } ifelse exch pop }', 1), true);
  assert.equal(postScriptRuns('{ 2 copy add }', 2), true);
  assert.equal(postScriptRuns('{+}', 1), false, 'pdf.js test bug2086012');
  assert.equal(postScriptRuns('{ add }', 1), false, 'two taken from one');
  assert.equal(postScriptRuns('{ 1 add', 1), false, 'no closing brace');
  // pdf.js's bug2086012, as it is: an axial shading through `{+}`.
  const bad = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Shading << /Sh1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 12 >>\nstream\nq\n/Sh1 sh\nQ\nendstream',
    '<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 200 0] /Function 6 0 R /Extend [true true] >>',
    '<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1] /Length 3 >>\nstream\n{+}\nendstream',
  ]);
  assert.match(pdfHazard(bad), /colour function/);
  const read = await readPdfArtwork(bad, { pdfjs: pdfjsLegacy });
  assert.equal(read.ok, false);
  assert.match(read.error, /could not be read: a colour function in it is not a program that can be run/);
  // A TrueType font whose format 12 character map runs to FFFFFFFF (pdf.js's issue_cmap12).
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const u32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(10), ...u32(12), ...u16(12), ...u16(0), ...u32(28), ...u32(0), ...u32(1), ...u32(0), ...u32(0xffffffff), ...u32(1)];
  const font = new Uint8Array([...u32(0x00010000), ...u16(1), 0, 16, 0, 0, 0, 0, ...[...'cmap'].map((c) => c.charCodeAt(0)), ...u32(0), ...u32(28), ...u32(cmap.length), ...cmap]);
  assert.equal(fontMapRuns(font), false);
  const sane = font.slice();
  sane.set(u32(0x7e), 28 + 32); // the group ends at 7E
  assert.equal(fontMapRuns(sane), true, 'a map of a few codes is a map');
});

test('SVG colour filters and CSS filter functions become the layer\'s own Filters, where it draws them alike', async () => {
  const { cssFilterEffect, filterEffect } = await import('../src/CE_Application/utils/svgComponentImport.js');
  const node = (name, attributes = {}, children = []) => ({ name, attributes, children });
  const srgb = { 'color-interpolation-filters': 'sRGB' };
  // Each primitive, in sRGB, as the CSS function it is.
  const read = (...primitives) => filterEffect(node('filter', srgb, primitives));
  assert.deepEqual(read(node('feColorMatrix', { type: 'saturate', values: '0.4' })), { filters: { saturation: 40 } });
  assert.deepEqual(read(node('feColorMatrix', { type: 'hueRotate', values: '270' })), { filters: { hueRotate: -90 } });
  const grey = [0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0].join(' ');
  assert.deepEqual(read(node('feColorMatrix', { values: grey })), { filters: { grayscale: 100 } });
  assert.deepEqual(read(node('feColorMatrix', { values: '-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0' })), { filters: { invert: 100 } });
  const same = (attrs) => ['feFuncR', 'feFuncG', 'feFuncB'].map((name) => node(name, attrs));
  assert.deepEqual(read(node('feComponentTransfer', {}, same({ type: 'linear', slope: '1.5' }))), { filters: { brightness: 150 } });
  assert.deepEqual(read(node('feComponentTransfer', {}, same({ type: 'linear', slope: '2', intercept: '-0.5' }))), { filters: { contrast: 200 } });
  assert.deepEqual(read(node('feComponentTransfer', {}, same({ type: 'table', tableValues: '0.25 0.75' }))), { filters: { invert: 25 } });
  // A blur and a colour together; a drop shadow under a recoloured shape.
  assert.deepEqual(read(node('feGaussianBlur', { stdDeviation: '2' }), node('feColorMatrix', { type: 'saturate', values: '0' })), { blur: 2, filters: { saturation: 0 } });
  // In SVG's default linearRGB the colours differ from CSS's: drawn by SVG, a picture.
  assert.equal(filterEffect(node('filter', {}, [node('feColorMatrix', { type: 'saturate', values: '0.4' })])), null);
  // Out of the order the layer draws them in (invert, then brightness): a picture too.
  assert.equal(read(node('feColorMatrix', { values: '-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0' }), node('feComponentTransfer', {}, same({ type: 'linear', slope: '2' }))), null);
  // Different functions per channel: no CSS function.
  assert.equal(read(node('feComponentTransfer', {}, [node('feFuncR', { type: 'linear', slope: '2' })])), null);

  // CSS's functions.
  assert.deepEqual(cssFilterEffect('blur(3px) saturate(50%) hue-rotate(0.25turn)'), { blur: 3, filters: { saturation: 50, hueRotate: 90 } });
  assert.deepEqual(cssFilterEffect('brightness(1.2) drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))'),
    { shadows: [{ dx: 2, dy: 4, deviation: 3, colour: '000000', opacity: 0.5 }], filters: { brightness: 120 } });
  assert.deepEqual(cssFilterEffect('none'), {});
  assert.equal(cssFilterEffect('invert(1) brightness(2)'), null, 'out of order');
  assert.equal(cssFilterEffect('opacity(50%)'), null, 'not a filter the layer has');
  assert.equal(cssFilterEffect('drop-shadow(1px 1px red) grayscale(1)'), null, 'something after the shadow');

  // Through the import: the shape stays a shape with its Filters; what cannot be one is a picture.
  const plan = planSvgComponentImport(svg('<defs><filter id="desat" style="color-interpolation-filters:sRGB"><feColorMatrix type="saturate" values="0.25"/></filter></defs>'
    + '<rect id="dull" width="40" height="40" fill="red" filter="url(#desat)"/>'
    + '<rect id="css" x="50" width="40" height="40" fill="blue" style="filter: grayscale(100%) sepia(50%)"/>'
    + '<rect id="faded" y="50" width="40" height="40" fill="green" style="filter: opacity(50%)"/>'));
  assert.equal(plan.ok, true, plan.error);
  const filters = (name) => parts(plan)[name]._children.Effects?._children.Filters;
  assert.equal(filters('dull').saturation, 25);
  assert.notEqual(fillOf(parts(plan).dull).imageEnabled, true, 'still a shape');
  assert.equal(filters('css').grayscale, 100);
  assert.equal(filters('css').sepia, 50);
  assert.equal(fillOf(parts(plan).faded).imageEnabled, true, 'a CSS filter the layer has not: a picture, as the browser draws it');
  assert.ok(plan.warnings.some((line) => /colour filters.*dull, css/.test(line)), plan.warnings.join(' | '));
});

test('Photoshop: a style set to Use Global Light takes the document\'s light; one restricted channel is kept', () => {
  const data = new Uint8ClampedArray(2 * 2 * 4).fill(255);
  const bytes = writePsdUint8Array({
    width: 2, height: 2, imageResources: { globalAngle: 30, globalAltitude: 45 },
    children: [{ name: 'lit', left: 0, top: 0, right: 2, bottom: 2, imageData: { width: 2, height: 2, data }, channelBlendingRestrictions: [2],
      effects: { dropShadow: [{ enabled: true, useGlobalLight: true, angle: 120, distance: { units: 'Pixels', value: 3 }, size: { units: 'Pixels', value: 3 } }],
        bevel: { enabled: true, useGlobalLight: true, angle: 120, altitude: 30, size: { units: 'Pixels', value: 3 } } } }],
  }, { generateThumbnail: false });
  const read = readPhotoshop(bytes);
  assert.equal(read.ok, true, read.error);
  const [layer] = read.psd.children;
  assert.equal(layer.effects.dropShadow[0].angle, 30);
  assert.equal(layer.effects.bevel.angle, 30);
  assert.equal(layer.effects.bevel.altitude, 45);
  // ag-psd's own reading drops the last restricted channel, so one is none.
  assert.deepEqual(layer.channelBlendingRestrictions, [2]);
});
