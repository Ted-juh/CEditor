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

test('blend modes, clipping and masks are drawn from the file as Photoshop draws them', () => {
  const maskPixels = new Uint8ClampedArray(50 * 50 * 4);
  for (let i = 0; i < 50 * 50; i += 1) maskPixels.set(i % 50 < 25 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
  const file = psdFile([
    solid('Base', 0, 0, 200, 100, [0, 0, 0, 255]),
    { name: 'Group', opacity: 0.5, children: [solid('White', 0, 0, 100, 100, [255, 255, 255, 255])] },
    solid('Screen', 100, 0, 50, 50, [255, 0, 0, 255], { blendMode: 'screen' }),
    // Clipped to Screen: drawn only over it, and multiplied with it rather than with the black below.
    solid('Clipped', 100, 0, 100, 50, [255, 255, 0, 255], { clipping: true, blendMode: 'multiply' }),
    solid('Masked', 150, 50, 50, 50, [0, 0, 255, 255], {
      mask: { left: 150, top: 50, right: 200, bottom: 100, defaultColor: 0, imageData: { width: 50, height: 50, data: maskPixels } },
    }),
    solid('Shadowed', 0, 0, 10, 10, [0, 0, 0, 255], { effects: { dropShadow: [{ enabled: true }] } }),
    { name: 'controls', children: [solid('led-power', 5, 5, 8, 8, [0, 0, 0, 255])] },
  ]);
  const plan = planPsdPanelImport(file);
  assert.equal(plan.ok, true, plan.error);
  const bg = pixelsOf(plan.background.dataUrl);
  assert.deepEqual(bg.at(50, 50), [128, 128, 128, 255], 'white at half the group opacity over black');
  assert.deepEqual(bg.at(120, 10), [255, 0, 0, 255], 'red screened over black, times yellow: red');
  assert.deepEqual(bg.at(170, 10), [0, 0, 0, 255], 'the clipped layer stays inside the layer it clips to');
  assert.deepEqual(bg.at(160, 70), [0, 0, 255, 255], 'the masked layer shows where its mask is white');
  assert.deepEqual(bg.at(190, 70), [0, 0, 0, 255], 'and not where it is black');
  const warnings = plan.warnings.join('\n');
  assert.doesNotMatch(warnings, /blending|Clipped layers|masks not applied/, 'nothing drawn is reported as not drawn');
  assert.match(warnings, /Layer effects not drawn: Shadowed/);
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

// --- Update Panel from Photoshop Artwork ----------------------------------------------------------

test('a revised Photoshop file moves the controls whose layers moved and adds the new ones; bindings survive', async () => {
  const { get } = await import('svelte/store');
  const { panels, activePanelId } = await import('../src/CE_Application/stores/panels.js');
  const { importPsdPanelBytes, updatePanelFromPsdBytes } = await import('../src/CE_Application/stores/psdPanelImportActions.js');
  const layers = (knobX, extra = []) => [
    solid('Background', 0, 0, 200, 100, [20, 30, 40, 255]),
    { name: 'components', hidden: true, children: [
      solid('knob-cutoff', knobX, 10, 40, 40, [128, 128, 128, 255]),
      solid('button-play', 120, 60, 30, 20, [128, 128, 128, 255]),
      ...extra,
    ] },
  ];
  panels.set([]);
  const panel = await importPsdPanelBytes(psdFile(layers(10)), 'Voice.psd');
  assert.equal(panel.artworkImport.links.length, 2, 'the import records which layer made which control');
  activePanelId.set(panel.id);
  const cutoff = () => get(panels)[0].controls.find((c) => c._children.Core.name === 'cutoff');
  panels.update((list) => list.map((p) => ({ ...p, controls: p.controls.map((c) => (c._children.Core.name === 'cutoff'
    ? { ...c, _children: { ...c._children, DeviceBindings: { _type: 'DeviceBindings', bindings: [{ kind: 'deviceParameter', parameterId: 'vcf.cutoff' }] } } }
    : c)) })));

  let asked = '';
  const update = await updatePanelFromPsdBytes(psdFile(layers(60, [solid('slider-drive', 170, 5, 10, 90, [128, 128, 128, 255])])), 'Voice v2.psd', {
    confirm: (text) => { asked = text; return true; },
  });
  assert.match(asked, /Update "Voice" from Voice v2\.psd\?/);
  assert.deepEqual(update.moves.map((m) => m.name), ['cutoff']);
  assert.deepEqual(update.added.map((c) => c._children.Core.name), ['drive']);
  assert.equal(cutoff()._children.Transform.x, 60);
  assert.equal(cutoff()._children.DeviceBindings.bindings[0].parameterId, 'vcf.cutoff', 'its binding survives');
  assert.equal(get(panels)[0].controls.length, 3);
  panels.set([]);
});
