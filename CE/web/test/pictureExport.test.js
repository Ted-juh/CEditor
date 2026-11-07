// pictureExport.test.js — File → Export Picture: the parts that are rules rather than pixels.
//
// The pixels are held to Chromium's own screenshot by browser-checks/pictureExport.mjs (at 1× the
// picture and the screen do not differ by a level anywhere it matters). This covers what that check
// cannot reach cheaply: which CSS a picture carries, the density written into the PNG, the names
// and sizes the window shows, and what each frame of a filmstrip is.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

import {
  cssUrls, fontFamilies, referencedIds, replaceCssUrls, splitSelectorList, staticSelector, subjectClasses,
} from '../src/CE_Application/utils/domPicture.js';
import { encodePng, pngWithDensity } from '../src/CE_Application/utils/pngEncode.js';
import { pictureFileName, pictureSize, PICTURE_MAX_SIDE } from '../src/CE_Application/stores/pictureExport.js';
import { filmstripFrames } from '../src/CE_Application/utils/filmstripFrames.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

// --- The CSS a picture carries ---------------------------------------------------------------------

test('font families are read unquoted and in lower case', () => {
  assert.deepEqual(fontFamilies('"Roboto Condensed", Inter, \'Noto Sans\', sans-serif'), ['roboto condensed', 'inter', 'noto sans', 'sans-serif']);
  assert.deepEqual(fontFamilies(''), []);
});

test('a selector is matched without what a still picture never is', () => {
  assert.equal(staticSelector('.knob:hover::after'), '.knob');
  assert.equal(staticSelector('.a.svelte-x1:focus-visible > .b'), '.a.svelte-x1 > .b');
  assert.equal(staticSelector('::selection'), '*');
  assert.equal(staticSelector('.row:nth-child(2)'), '.row:nth-child(2)', 'structure stays: it is part of the look');
});

test('the subject\'s classes rule a selector out fast, and :not() is not a requirement', () => {
  assert.deepEqual(subjectClasses('.panel .canvas-control.selected.svelte-abc'), ['canvas-control', 'selected', 'svelte-abc']);
  assert.deepEqual(subjectClasses('.canvas-control:hover:not(.locked)'), ['canvas-control']);
  assert.deepEqual(subjectClasses('.a > div'), []);
});

test('a selector list splits at its own commas only', () => {
  assert.deepEqual(splitSelectorList('.a, .b:is(.c, .d), [data-x="1,2"]'), ['.a', '.b:is(.c, .d)', '[data-x="1,2"]']);
});

test('files named by url() are found and replaced; fragments and data are left alone', () => {
  const css = 'background: url("a.png"), url(#grain); mask: url(b.svg); src: url(data:font/woff2;base64,AA)';
  assert.deepEqual(cssUrls(css), ['a.png', 'b.svg']);
  const replaced = replaceCssUrls(css, new Map([['a.png', 'data:image/png;base64,QQ'], ['b.svg', 'data:image/svg+xml,x']]));
  assert.match(replaced, /url\("data:image\/png;base64,QQ"\)/);
  assert.match(replaced, /url\(#grain\)/);
  assert.match(replaced, /url\("data:image\/svg\+xml,x"\)/);
});

test('the SVG definitions a copy refers to are named', () => {
  assert.deepEqual([...referencedIds('filter: url(#panel-material-1); fill: url("#grad")')], ['panel-material-1', 'grad']);
});

// --- The PNG ---------------------------------------------------------------------------------------

function chunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    out.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return out;
}

test('a 2× picture says 192 dots per inch, so it lands at the panel\'s size in a document', () => {
  const rgba = new Uint8Array(2 * 2 * 4).fill(200);
  const plain = encodePng(2, 2, rgba);
  const dense = pngWithDensity(plain, 2);
  const list = chunks(dense);
  assert.deepEqual(list.map((chunk) => chunk.type), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const phys = new DataView(list[1].data.buffer, list[1].data.byteOffset, 9);
  assert.equal(phys.getUint32(0), Math.round(192 / 0.0254));
  assert.equal(phys.getUint32(4), Math.round(192 / 0.0254));
  assert.equal(list[1].data[8], 1, 'per metre');
  // The pixels are the same pixels.
  assert.deepEqual(inflateSync(list[2].data), inflateSync(chunks(plain)[1].data));
  // Said twice, it is there once, with the second density.
  const again = chunks(pngWithDensity(dense, 1));
  assert.equal(again.filter((chunk) => chunk.type === 'pHYs').length, 1);
  assert.equal(new DataView(again[1].data.buffer, again[1].data.byteOffset, 9).getUint32(0), Math.round(96 / 0.0254));
});

// --- The window ------------------------------------------------------------------------------------

test('a file name keeps the panel\'s name and loses what no file system takes', () => {
  assert.equal(pictureFileName('Roland GAIA SH-01', ' @2x'), 'Roland GAIA SH-01 @2x.png');
  assert.equal(pictureFileName('Filter: A/B?', ''), 'Filter A B.png');
  assert.equal(pictureFileName('   ', ''), 'Panel.png');
});

test('the size the window shows, and when a picture is too large to draw', () => {
  assert.deepEqual(pictureSize(1920, 1000, 2), { pixelWidth: 3840, pixelHeight: 2000, tooLarge: false });
  assert.equal(pictureSize(PICTURE_MAX_SIDE / 2 + 1, 100, 2).tooLarge, true);
  assert.equal(pictureSize(10000, 10000, 2).tooLarge, true, 'more pixels than a canvas will encode');
});

// --- Filmstrips ------------------------------------------------------------------------------------

test('a knob: frames across its whole range, end to end, drawn without its step', () => {
  const knob = createControl('Knob');
  Object.assign(knob._children.Behavior, { min: 0, max: 127, step: 1, snapToStep: true });
  const plan = filmstripFrames(knob, 5);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'range');
  assert.deepEqual(plan.frames.map((frame) => frame.session.valueOverride), [0, 31.75, 63.5, 95.25, 127]);
  assert.ok(plan.frames.every((frame) => frame.session.valueOverrideEnabled === true));
  assert.equal(plan.control._children.Behavior.snapToStep, false, 'the strip steps, not the knob');
  assert.equal(knob._children.Behavior.snapToStep, true, 'the document is not touched');
});

test('a switch is off and on; a button is up and pressed', () => {
  const toggle = filmstripFrames(createControl('ToggleButton'), 64);
  assert.equal(toggle.ok, true);
  assert.deepEqual(toggle.frames.map((frame) => frame.session.checked), [false, true]);
  const button = filmstripFrames(createControl('Button'), 64);
  assert.equal(button.ok, true);
  assert.deepEqual(button.frames.map((frame) => frame.session.pressed), [false, true]);
});

test('a component steps through its main value; a list one frame an entry, on/off two', () => {
  const component = createControl('CustomComponent');
  const main = component._children.ValueChannels._children.mainValue;
  Object.assign(main, { min: -1, max: 1 });
  const range = filmstripFrames(component, 3, { customValues: { other: 4 } });
  assert.equal(range.ok, true);
  assert.deepEqual(range.frames.map((frame) => frame.session.customValues.mainValue), [-1, 0, 1]);
  assert.deepEqual(range.frames.map((frame) => frame.session.customNormalizedValue), [0, 0.5, 1]);
  assert.equal(range.frames[0].session.customValues.other, 4, 'the other values are the control\'s own');

  Object.assign(main, { type: 'enum', values: ['sine', 'saw', 'square'] });
  const list = filmstripFrames(component, 64);
  assert.equal(list.kind, 'list');
  assert.deepEqual(list.frames.map((frame) => frame.session.valueOverride), ['sine', 'saw', 'square']);

  Object.assign(main, { type: 'bool' });
  assert.deepEqual(filmstripFrames(component, 64).frames.map((frame) => frame.session.valueOverride), [false, true]);

  Object.assign(main, { type: 'array' });
  assert.equal(filmstripFrames(component, 64).ok, false);
});

test('a control with nothing to step through is refused, with the reason', () => {
  const plan = filmstripFrames(createControl('Label'), 64);
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /a label has no values to step through/);
});
