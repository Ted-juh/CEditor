// A PDF, or the PDF part of an Illustrator file, read as the SVG the artwork importers take
// (utils/pdfArtwork.js). The files are written here as Illustrator lays its PDF part out
// (test/support/pdfFixture.js): each top-level layer a PDF layer marked round its content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { artworkFileKind, readPdfArtwork } from '../src/CE_Application/utils/pdfArtwork.js';
import { planSvgComponentImport } from '../src/CE_Application/utils/svgComponentImport.js';
import { planSvgPanelImport } from '../src/CE_Application/utils/svgPanelImport.js';
import { circle, illustratorPdf } from './support/pdfFixture.js';

const read = (bytes, options = {}) => readPdfArtwork(bytes, { pdfjs, ...options });
const ascii = (text) => new Uint8Array(Buffer.from(text, 'latin1'));
/** The SVG's elements of one name, each as { attributes, text }. */
const elements = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b([^>]*?)(/?)>([^<]*)`, 'g'))]
  .map(([, attrs, closed, text]) => ({ attributes: Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])), text: closed ? '' : text }));
const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
/** The drawn shapes in order, whatever element each is, with its element's name as `tag`. */
const shapes = (svg) => [...svg.matchAll(/<(rect|circle|ellipse|path)\b([^>]*?)\/>/g)]
  .filter(([, , attrs]) => !/^\s*d="[^"]*"\s*(clip-rule="[^"]*")?\s*$/.test(attrs))
  .map(([, tag, attrs]) => ({ tag, ...Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])) }));

test('each top-level Illustrator layer is a group named after it; one switched off is hidden', async () => {
  const bytes = illustratorPdf({
    width: 200, height: 100,
    layers: [
      { name: 'skirt', content: '0.5 g 10 10 50 20 re f' },
      { name: 'lamp on', hidden: true, content: '1 0 0 rg 100 10 20 20 re f' },
    ],
  });
  const result = await read(bytes);
  assert.equal(result.ok, true);
  assert.equal(result.illustrator, true);
  assert.equal(result.pages, 1);
  assert.deepEqual(result.layers, [{ name: 'skirt', visible: true }, { name: 'lamp on', visible: false }]);
  const groups = elements(result.svg.replace(/<g\b([^>]*)>/g, '<g$1/>'), 'g').map((g) => g.attributes);
  assert.deepEqual(groups.map((g) => [g.id, g['data-name'], g.display ?? '']), [['skirt', 'skirt', ''], ['lamp on', 'lamp on', 'none']]);
  assert.equal(groups[1]['data-ceditor-hidden'], 'true');
  assert.match(result.svg, /^<svg [^>]*width="200" height="100" viewBox="0 0 200 100"/);
});

test('a path keeps its place on the page, y down, with its fill, stroke, width, caps, joins and dashes', async () => {
  const bytes = illustratorPdf({
    width: 200, height: 100,
    layers: [{ name: 'art', content: [
      '0.2 0.4 0.6 rg 10 10 50 20 re f',
      'q 2 0 0 2 0 0 cm 1 0 0 RG 4 w 1 J 1 j [6 3] 0 d 10 10 m 40 10 l S Q',
      `0 0 1 rg ${circle(150, 50, 20)} ${circle(150, 50, 10)} f*`,
    ].join('\n') }],
  });
  const { svg } = await read(bytes);
  const [rect, line, ring] = shapes(svg);
  assert.equal(rect.fill, '#336699');
  assert.deepEqual([rect.tag, rect.x, rect.y, rect.width, rect.height], ['rect', '10', '70', '50', '20'], 'a rectangle, 10..60 across and 70..90 down');
  assert.equal(line.fill, 'none');
  assert.equal(line.stroke, '#ff0000');
  assert.deepEqual([line['stroke-width'], line['stroke-linecap'], line['stroke-linejoin'], line['stroke-dasharray']], ['8', 'round', 'round', '12 6'], 'scaled with the transform');
  assert.equal(numbers(line.d)[1], 80, 'y 10, doubled, from the top of a 100 high page');
  assert.equal(ring.tag, 'path', 'two circles in one path stay a path');
  assert.equal(ring['fill-rule'], 'evenodd');
});

test('a closed run of four Béziers through the ends of its axes, as Illustrator draws an ellipse, is an ellipse or a circle', async () => {
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'art', content: `q 2 0 0 1 0 0 cm 0 g ${circle(20, 50, 10)} f Q
0 g ${circle(70, 30, 15)} f
0 g 10 10 m 30 10 l 30 20 l h f` }],
  });
  const { svg } = await read(bytes);
  const [oval, round, triangle] = shapes(svg);
  assert.deepEqual([oval.tag, oval.cx, oval.cy, oval.rx, oval.ry], ['ellipse', '40', '50', '20', '10']);
  assert.deepEqual([round.tag, round.cx, round.cy, round.r], ['circle', '70', '70', '15']);
  assert.equal(triangle.tag, 'path');
});

test('a gradient fill, written as Illustrator writes it (the shape a clip, then the shading), is the shape filled with the gradient', async () => {
  const bytes = illustratorPdf({
    width: 200, height: 100,
    layers: [{ name: 'cap', content: `q ${circle(50, 50, 30)} W n /Sh0 sh Q\nq /Pattern cs /P0 scn 120 20 60 60 re f Q` }],
    resources: {
      Shading: { Sh0: '<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [20 0 80 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> /Extend [true true] >>' },
      Pattern: { P0: '<< /PatternType 2 /Matrix [1 0 0 1 120 20] /Shading << /ShadingType 3 /ColorSpace /DeviceRGB /Coords [30 30 0 30 30 30] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [0 0 0] /N 1 >> >> >>' },
    },
  });
  const { svg } = await read(bytes);
  assert.doesNotMatch(svg, /clip-path=/, 'the clip became the shape');
  const [disc, square] = shapes(svg);
  assert.deepEqual([disc.tag, square.tag], ['circle', 'rect']);
  const linear = elements(svg, 'linearGradient')[0].attributes;
  assert.equal(disc.fill, `url(#${linear.id})`);
  assert.deepEqual([linear.x1, linear.x2, linear.gradientUnits], ['20', '80', 'userSpaceOnUse']);
  assert.equal(linear.gradientTransform, 'matrix(1 0 0 -1 0 100)');
  assert.match(svg, /<stop offset="0" stop-color="#ff0000"\/>.*<stop offset="1" stop-color="#0000ff"\/>/);
  const radial = elements(svg, 'radialGradient')[0].attributes;
  assert.equal(square.fill, `url(#${radial.id})`);
  assert.deepEqual([radial.cx, radial.r, radial.gradientTransform], ['30', '30', 'matrix(1 0 0 -1 120 80)'], 'in pattern space, moved by its matrix');
});

test('opacity, blend modes and a transparency group', async () => {
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'shadow', content: 'q /GS0 gs 0 g 0 0 20 20 re f Q\nq /GS1 gs 2 0 0 2 10 10 cm /Fm0 Do Q' }],
    resources: {
      ExtGState: { GS0: '<< /ca 0.5 /BM /Multiply >>', GS1: '<< /ca 0.4 >>' },
      XObject: { Fm0: { dict: '/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Group << /S /Transparency /I true >>', content: '0 0 1 rg 1 1 5 5 re f' } },
    },
  });
  const { svg } = await read(bytes);
  const [shadow, inForm] = shapes(svg);
  assert.equal(shadow['fill-opacity'], '0.5');
  assert.equal(shadow.style, 'mix-blend-mode:multiply');
  assert.match(svg, /<g opacity="0.4">.*<rect [^>]*fill="#0000ff"/, 'the group at the opacity it was painted with, its content at full');
  assert.equal(inForm['fill-opacity'], undefined);
  assert.deepEqual([inForm.x, inForm.width], ['12', '10'], 'the form\'s content placed by its transform');
});

test('text comes in as text, in its font, size and colour', async () => {
  const bytes = illustratorPdf({
    width: 200, height: 100,
    layers: [{ name: 'label', content: 'BT /F1 12 Tf 1 0 0 rg 1 0 0 1 30 40 Tm (Cutoff) Tj ET\nBT /F2 9 Tf 0 1 -1 0 150 20 Tm (Mix) Tj ET' }],
    resources: { Font: {
      F1: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      F2: '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
    } },
  });
  const { svg } = await read(bytes);
  const [cutoff, mix] = elements(svg, 'text');
  assert.equal(cutoff.text, 'Cutoff');
  assert.deepEqual([cutoff.attributes.x, cutoff.attributes.y, cutoff.attributes['font-size'], cutoff.attributes.fill, cutoff.attributes['font-weight']], ['30', '60', '12', '#ff0000', 'bold']);
  assert.match(cutoff.attributes['font-family'], /^Helvetica/);
  assert.equal(mix.text, 'Mix');
  assert.equal(mix.attributes.transform, 'matrix(0 -1 1 0 150 80)', 'turned a quarter, as set');
  assert.equal(mix.attributes['font-size'], '9');
});

test('an embedded image is a picture with its pixels, where the page places it', async () => {
  const pixels = Buffer.from([255, 0, 0, 0, 0, 255]).toString('latin1');
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [{ name: 'photo', content: 'q 40 0 0 20 10 30 cm /Im0 Do Q' }],
    resources: { XObject: { Im0: { dict: '/Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8', content: pixels } } },
  });
  const { svg } = await read(bytes);
  const [picture] = elements(svg, 'image').map((i) => i.attributes);
  assert.match(picture.href, /^data:image\/png;base64,/);
  assert.deepEqual([picture.width, picture.height], ['2', '1']);
  // Its 2 by 1 pixels onto 40 by 20 at (10, 30) from the bottom: 10..50 across, 50..70 down.
  assert.equal(picture.transform, 'matrix(20 0 0 20 10 50)');
});

test('an Illustrator file saved without PDF compatibility, and a file that is not a PDF, are refused with the reason', async () => {
  const oldAi = ascii('%!PS-Adobe-3.0 \n%%Creator: Adobe Illustrator(R) 8.0\n%%BoundingBox: 0 0 100 100\n');
  assert.equal(artworkFileKind(oldAi), 'ai');
  const refused = await read(oldAi);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'ai-without-pdf');
  assert.match(refused.error, /Create PDF Compatible File/);
  const notPdf = await read(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  assert.deepEqual([notPdf.ok, notPdf.reason], [false, 'not-pdf']);
});

test('a file with several artboards reads the page asked for, and says how many there are', async () => {
  const bytes = illustratorPdf({ width: 100, height: 100, pages: 3, layers: [{ name: 'art', content: '0 g 0 0 10 10 re f' }] });
  const result = await read(bytes, { page: 2 });
  assert.deepEqual([result.pages, result.page], [3, 2]);
});

test('an .ai knob comes in as a dial, its parts named by its top-level layers', async () => {
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [
      { name: 'skirt', content: `0.3 g ${circle(50, 50, 40)} f` },
      { name: 'cap', content: `q ${circle(50, 50, 28)} W n /Sh0 sh Q` },
      { name: 'pointer', content: '1 0.5 0 rg 48 60 4 22 re f' },
    ],
    resources: { Shading: { Sh0: '<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [22 0 78 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [0.9 0.9 0.9] /C1 [0.5 0.5 0.5] /N 1 >> >>' } },
  });
  const { svg } = await read(bytes);
  const plan = planSvgComponentImport(svg, { fileName: 'Knob.ai' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.deepEqual(plan.report.turns, ['pointer']);
  assert.deepEqual(Object.keys(plan.component._children.Parts._children), ['skirt', 'cap', 'pointer']);
});

test('a layer switched off in Illustrator comes into a component hidden, as a hidden Photoshop layer does: a switch\'s lit look', async () => {
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [
      { name: 'switch', content: `0.3 g ${circle(50, 50, 30)} f` },
      { name: 'lamp on', hidden: true, content: `1 0 0 rg ${circle(50, 50, 8)} f` },
      { name: 'lamp off', content: `0.2 0 0 rg ${circle(50, 50, 8)} f` },
    ],
  });
  const { svg } = await read(bytes);
  const plan = planSvgComponentImport(svg, { fileName: 'Switch.ai' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'switch');
  const parts = plan.component._children.Parts._children;
  assert.deepEqual(Object.keys(parts), ['switch', 'lamp_on', 'lamp_off']);
  assert.equal(parts.lamp_on.visible, false, 'hidden at rest, shown when on');
  assert.deepEqual(plan.report.on, ['lamp on']);
});

test('a PDF panel: the components layer\'s coloured shapes are its controls, the rest its background', async () => {
  const bytes = illustratorPdf({
    width: 300, height: 120,
    layers: [
      { name: 'artwork', content: '0.15 g 0 0 300 120 re f' },
      { name: 'components', content: `1 0 0 rg ${circle(40, 60, 20)} f\n1 0 0 rg 100 20 16 80 re f` },
    ],
  });
  const { svg } = await read(bytes);
  const plan = planSvgPanelImport(svg);
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(plan.placeholders.map((p) => p.role).sort(), ['knob', 'slider']);
  assert.deepEqual([plan.width, plan.height], [300, 120]);
});
