// psdPanelImport.test.js — Photoshop artwork to a panel, from files written by ag-psd itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writePsdUint8Array } from 'ag-psd';
import { unzlibSync } from 'fflate';

import { dominantColour, planPsdPanelImport } from '../src/CE_Application/utils/psdPanelImport.js';
import { buildSvgImportControls, describeSvgImport } from '../src/CE_Application/utils/svgPanelImport.js';
import { encodePng } from '../src/CE_Application/utils/pngEncode.js';

/** A solid layer: `rgba` over a w × h box at (left, top). */
function solid(name, left, top, w, h, rgba, extra = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { name, left, top, right: left + w, bottom: top + h, imageData: { width: w, height: h, data }, ...extra };
}

function psdFile(children, width = 200, height = 100) {
  const composite = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  return writePsdUint8Array({ width, height, children, imageData: composite }, { noBackground: true });
}

/** The background PNG's pixels, decoded (8-bit RGBA, filter 0, as pngEncode writes it). */
function pixelsOf(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let offset = 8;
  const idat = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = unzlibSync(Uint8Array.from(idat.flatMap((part) => [...part])));
  const at = (x, y) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 1 + x * 4 + 4)];
  return { width, height, at };
}

test('placeholders become controls by name and by colour; the rest becomes the background', () => {
  const file = psdFile([
    solid('Background', 0, 0, 200, 100, [20, 30, 40, 255]),
    solid('Logo', 150, 10, 20, 10, [250, 250, 250, 255]),
    { name: 'components', hidden: true, children: [
      solid('knob-cutoff', 10, 10, 40, 40, [128, 128, 128, 255]),
      solid('Layer 7', 60, 10, 12, 80, [230, 20, 20, 255]),        // red, long: a slider, vertical
      solid('Layer 8', 80, 60, 30, 20, [20, 200, 30, 255]),        // green: a button
      solid('mystery', 120, 60, 10, 10, [128, 128, 128, 255]),     // no name, no colour: skipped
    ] },
  ]);
  const plan = planPsdPanelImport(file);
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.width, 200);
  assert.equal(plan.layer, 'components');
  assert.deepEqual(plan.placeholders.map((p) => [p.role, p.name, p.x, p.y, p.width, p.height]), [
    ['knob', 'cutoff', 10, 10, 40, 40],
    ['slider', 'Layer_7', 60, 10, 12, 80],
    ['button', 'Layer_8', 80, 60, 30, 20],
  ]);
  assert.equal(plan.placeholders[1].orientation, 'vertical');
  assert.deepEqual(plan.skipped.map((s) => s.source), ['"mystery"']);

  // The placeholders are cut out of the artwork; the art layers are in it.
  const bg = pixelsOf(plan.background.dataUrl);
  assert.deepEqual(bg.at(20, 20), [20, 30, 40, 255], 'under the knob placeholder: the background, not grey');
  assert.deepEqual(bg.at(155, 15), [250, 250, 250, 255], 'the logo');

  const controls = buildSvgImportControls(plan);
  assert.deepEqual(controls.map((c) => [c._children.Core.controlType, c._children.Core.name]), [['Knob', 'cutoff'], ['Slider', 'Layer_7'], ['Button', 'Layer_8']]);
  assert.match(describeSvgImport(plan)[0], /3 control\(s\) from the "components" layer on a 200×100 panel/);
});

test('opacity and group opacity are applied; blend modes, masks and clipping are reported, not guessed', () => {
  const file = psdFile([
    solid('Base', 0, 0, 200, 100, [0, 0, 0, 255]),
    { name: 'Group', opacity: 0.5, children: [solid('White', 0, 0, 100, 100, [255, 255, 255, 255])] },
    solid('Screen', 100, 0, 50, 50, [255, 0, 0, 255], { blendMode: 'screen' }),
    solid('Clipped', 150, 0, 50, 50, [0, 255, 0, 255], { clipping: true }),
    { name: 'controls', children: [solid('led-power', 5, 5, 8, 8, [0, 0, 0, 255])] },
  ]);
  const plan = planPsdPanelImport(file);
  assert.equal(plan.ok, true, plan.error);
  const bg = pixelsOf(plan.background.dataUrl);
  assert.deepEqual(bg.at(50, 50), [128, 128, 128, 255], 'white at half the group opacity over black');
  assert.deepEqual(bg.at(170, 10), [0, 0, 0, 255], 'the clipped layer is left out');
  const warnings = plan.warnings.join('\n');
  assert.match(warnings, /normal blending instead of their own mode: Screen \(screen\)/);
  assert.match(warnings, /Clipped layers left out: Clipped/);
  assert.equal(plan.placeholders[0].role, 'led');
});

test('a file with no components group, or not a Photoshop file at all, says what to do', () => {
  const noGroup = planPsdPanelImport(psdFile([solid('Background', 0, 0, 200, 100, [0, 0, 0, 255])]));
  assert.equal(noGroup.ok, false);
  assert.match(noGroup.error, /No layer group named "components"/);
  const garbage = planPsdPanelImport(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(garbage.ok, false);
  assert.match(garbage.error, /not a Photoshop file/);
});

test('dominant colour ignores transparent pixels', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);
  assert.equal(dominantColour({ data }), 'FF0000');
  assert.equal(dominantColour({ data: new Uint8ClampedArray([1, 2, 3, 0]) }), '');
});

test('the PNG encoder is deterministic and decodes back to its pixels', () => {
  const rgba = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => (i * 37) % 256);
  const a = encodePng(3, 2, rgba);
  assert.deepEqual(encodePng(3, 2, rgba), a);
  assert.deepEqual([...a.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  let binary = '';
  for (const byte of a) binary += String.fromCharCode(byte);
  const back = pixelsOf(`data:image/png;base64,${btoa(binary)}`);
  assert.deepEqual(back.at(2, 1), [...rgba.subarray(20, 24)]);
  assert.throws(() => encodePng(2, 2, new Uint8Array(3)), /needs 16 bytes/);
});
