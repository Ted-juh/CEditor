// What a run of real files through every import found (thousands of SVGs, PDFs, Photoshop files and
// glTF models: the resvg and pdf.js test suites, psd-tools' Photoshop files, Khronos's sample models,
// desktop icons, Illustrator and LibreOffice drawings), each kept here as the smallest file that shows
// it, fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writePsdUint8Array } from 'ag-psd';
import { planSvgComponentImport } from '../src/CE_Application/utils/svgComponentImport.js';
import { planSvgPanelImport, withoutSvgPrefix } from '../src/CE_Application/utils/svgPanelImport.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { planPsdPanelImport } from '../src/CE_Application/utils/psdPanelImport.js';
import { eightBit, readPhotoshop } from '../src/CE_Application/utils/psdRead.js';
import { readPdfArtwork } from '../src/CE_Application/utils/pdfArtwork.js';
import { readGltf } from '../src/CE_Application/utils/scene3dGltf.js';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { illustratorPdf } from './support/pdfFixture.js';
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

test('filters and a group\'s blend mode are said, not dropped silently; a shape\'s own blend mode is its layer\'s', () => {
  const plan = planSvgComponentImport(svg('<defs><filter id="blur"><feGaussianBlur stdDeviation="3"/></filter></defs>'
    + '<rect id="soft" width="40" height="40" filter="url(#blur)"/><g id="tinted" style="mix-blend-mode:screen"><rect width="10" height="10"/></g>'
    + '<rect id="shade" x="50" width="40" height="40" style="mix-blend-mode:multiply"/>'));
  assert.ok(plan.warnings.some((line) => /filters .* not drawn: soft/.test(line)), plan.warnings.join(' | '));
  assert.ok(plan.warnings.some((line) => /group's blend mode is not kept.*tinted/.test(line)));
  assert.equal(parts(plan).shade._children.Effects._children.Blend.mode, 'multiply');
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

test('Photoshop: a colour mode CEditor cannot read is named, with how to convert it', () => {
  const bytes = writePsdUint8Array({ width: 4, height: 4, children: [solid('a', 4, 4, [10, 20, 30, 255])] }, { generateThumbnail: false });
  for (const [mode, name] of [[4, 'CMYK'], [9, 'Lab'], [8, 'Duotone']]) {
    const copy = bytes.slice();
    copy[24] = 0; copy[25] = mode;
    const read = readPhotoshop(copy);
    if (read.ok) continue; // ag-psd read it after all: nothing to say
    assert.match(read.error, new RegExp(`in ${name} colour.*Image › Mode › RGB Color`));
    assert.equal(planPsdComponentImport(copy).error, read.error);
    assert.equal(planPsdPanelImport(copy).error, read.error);
  }
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

