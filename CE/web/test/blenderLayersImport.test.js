// blenderLayersImport.test.js — a knob made in Blender, written by the CEditor Layers add-on
// (tools/blender/ceditor_layers.py), brought in by New Component from Photoshop Artwork.
//
// The fixture is the add-on's own file for the knob tools/blender/test_ceditor_layers.py builds (a
// panel, a skirt, a metal cap, a pointer, a lamp beside it, a sun), 96 px square, written by
//
//   blender -b --factory-startup --python tools/blender/test_ceditor_layers.py -- <out-dir> --fixture
//
// That script checks the layers against Blender's own render of the knob; this checks that CEditor
// reads them as the add-on means them: what turns, about where, in which blend modes, and that
// CEditor's compositor draws them as the add-on composed them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPsd } from 'ag-psd';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { compositePsd } from '../src/CE_Application/utils/psdComposite.js';
import { describeArtworkComponent } from '../src/CE_Application/utils/artworkComponent.js';
import { applyCustomBindings } from '../src/CE_Application/utils/interactionRuntime.js';
import { imageFrameLayers } from '../src/CE_Application/utils/imageFrames.js';
import { hasLinearEdges, mixEdgesInLinearLight } from '../src/CE_Application/utils/linearEdges.js';
import { inflateSync } from 'node:zlib';

/** A PNG's pixels (8-bit RGBA, not interlaced, as CEditor's encoder writes them). */
function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y ? pixels[(y - 1) * stride + x - 4] : 0;
      const paeth = () => { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; };
      const predicted = [0, left, up, (left + up) >> 1, paeth()][filter];
      pixels[y * stride + x] = (value + predicted) & 255;
    }
  }
  return { width, height, pixels };
}

const bytes = new Uint8Array(readFileSync(new URL('./fixtures/blender-knob.psd', import.meta.url)));
const SIZE = 96;

test('a Blender knob comes in as a dial: the pointer, its shadow and its reflection turn about its axis, each a part of frames', () => {
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.deepEqual([plan.width, plan.height], [SIZE, SIZE]);
  assert.deepEqual(plan.warnings, []);
  const parts = plan.component._children.Parts._children;
  assert.deepEqual(Object.keys(parts), [
    'shadow', 'bounce', 'bounce_shine', 'lamp_glow', 'lamp_glow_shine', 'lens', 'lens_highlights', 'lamp_lit',
    'skirt', 'skirt_shading', 'skirt_highlights', 'cap', 'cap_shading', 'cap_highlights',
    'pointer_shadow', 'pointer_reflection', 'pointer', 'pivot', 'pointer_shadow_pivot',
  ]);
  // A colour layer is drawn as it is; its light is multiplied into it or added to it; the light on the
  // panel brightens it in proportion (colour dodge), the panel's shine reflecting it added.
  const blend = (name) => parts[name]._children.Effects?._children?.Blend?.mode ?? 'normal';
  for (const name of ['shadow', 'lens', 'skirt', 'cap', 'pointer_shadow', 'pointer']) assert.equal(blend(name), 'normal', name);
  for (const name of ['skirt_shading', 'cap_shading']) assert.equal(blend(name), 'multiply', name);
  for (const name of ['bounce', 'lamp_glow']) assert.equal(blend(name), 'color-dodge', name);
  for (const name of ['bounce_shine', 'lamp_glow_shine', 'lens_highlights', 'lamp_lit', 'skirt_highlights', 'cap_highlights', 'pointer_reflection']) {
    assert.equal(blend(name), 'plus-lighter', name);
  }
  // The parts that stay put have their edge mixed for the panel under them.
  assert.deepEqual(Object.keys(parts).filter((name) => hasLinearEdges(parts[name])), ['lens', 'skirt', 'cap']);
  // The pointer, its shadow and its reflection were rendered every 27 degrees: each one part of
  // frames, its frame following the value, and turning with it.
  const framed = ['pointer_shadow', 'pointer_reflection', 'pointer'];
  for (const name of framed) {
    const image = parts[name]._children.Image;
    assert.equal(image.mode, 'frames', name);
    assert.equal(image.frames.length, 11, name);
    assert.ok(image.frames.every((frame) => frame.source), `${name}: a picture at every angle`);
    assert.equal(image.frameIndex, 5, `${name}: as imported, the frame at rest`);
  }
  const bindings = Object.values(plan.component._children.Bindings._children);
  const turning = bindings.filter((b) => b.target.endsWith('.rotation'));
  assert.deepEqual(turning.map((b) => b.target).sort(), framed.map((n) => `Parts.${n}.Layout.rotation`).sort());
  for (const binding of turning) assert.deepEqual([binding.outputMin, binding.outputMax], [-135, 135]);
  const frameAt = (degrees) => {
    const control = structuredClone(plan.component);
    applyCustomBindings(control, { customChannels: { 'channel.mainValue.normalized': (degrees + 135) / 270, 'channel.lamp.normalized': 1 } });
    return framed.map((name) => Math.round(control._children.Parts._children[name]._children.Image.frameIndex * 100) / 100);
  };
  assert.deepEqual(frameAt(0), [5, 5, 5]);
  assert.deepEqual(frameAt(-135), [0, 0, 0]);
  assert.deepEqual(frameAt(121.5), [9.5, 9.5, 9.5], 'half way between the frames at 108 and 135');
  const mixed = imageFrameLayers({ ...parts.pointer._children.Image, frameIndex: 9.5 });
  assert.deepEqual(mixed.map(({ opacity }) => opacity), [0.5, 0.5], 'half each');
  // About where: the pointer and its reflection about the knob's axis, the middle of the picture; its
  // shadow about its own point beside it, towards where it falls, so it stays on the side away from
  // the light.
  const about = (name) => {
    const { x, y, width, height, pivotX, pivotY } = parts[name]._children.Layout;
    return [x + (pivotX / 100) * width, y + (pivotY / 100) * height];
  };
  const centre = (name) => { const { x, y, width, height } = parts[name]._children.Layout; return [x + width / 2, y + height / 2]; };
  for (const name of ['pointer', 'pointer_reflection']) {
    assert.ok(Math.hypot(about(name)[0] - SIZE / 2, about(name)[1] - SIZE / 2) < 0.05, `${name}: turns about ${about(name)}`);
  }
  const own = about('pointer_shadow');
  assert.ok(Math.hypot(own[0] - centre('pointer_shadow_pivot')[0], own[1] - centre('pointer_shadow_pivot')[1]) < 0.05, `the shadow's own pivot: ${own}`);
  const reach = Math.hypot(own[0] - SIZE / 2, own[1] - SIZE / 2);
  assert.ok(reach > 0.5 && reach < 4, `beside the axis, not on it: ${reach} px`);
  // The pointer was modelled pointing up, and comes in pointing up: its frame at rest above the axis.
  const rest = parts.pointer._children.Image.frames[5];
  const layout = parts.pointer._children.Layout;
  assert.ok(layout.y + ((rest.y + rest.height) / 100) * layout.height <= SIZE / 2 + 0.5, 'above the axis');
  for (const name of ['pivot', 'pointer_shadow_pivot']) assert.equal(parts[name].visible, false, `${name} is a mark, not a picture`);
  // The lamp lights with a value of its own, lit as the file shows it.
  const lamp = plan.component._children.ValueChannels._children.lamp;
  assert.deepEqual([lamp.type, lamp.defaultValue], ['bool', true]);
  assert.deepEqual(bindings.filter((b) => b.source === 'channel.lamp.normalized').map((b) => b.target).sort(),
    ['Parts.lamp_glow.opacity', 'Parts.lamp_glow_shine.opacity', 'Parts.lamp_lit.opacity']);
  assert.match(describeArtworkComponent(plan, plan.layers), /^A dial of \d+ layers: pointer shadow, pointer reflection, pointer turn with the value\. .* with a value of their own, Lamp\.$/);
});

test('CEditor draws the layers as the add-on composed them', () => {
  const psd = readPsd(bytes.buffer, { useImageData: true, skipThumbnail: true });
  const { pixels } = compositePsd(psd.children, SIZE, SIZE);
  // The picture of them all, as the file keeps it: read back off its white, which the add-on laid
  // it on as Photoshop does (writing it without, its edges came back black).
  const merged = psd.imageData.data;
  // Light laid over what is part clear (the light on the panel, the lit lamp's edge) is light on
  // nothing: CSS adds or dodges it as it does, Photoshop otherwise, and in CEditor there is always a
  // panel under it. Everywhere else the two agree.
  const isLight = (layer) => layer.blendMode === 'linear dodge' || layer.blendMode === 'color dodge';
  const under = compositePsd(psd.children, SIZE, SIZE, { skip: isLight }).pixels;
  const lightOverClear = new Uint8Array(SIZE * SIZE);
  for (const layer of psd.children) {
    if (!isLight(layer) || layer.hidden) continue;
    const w = layer.right - layer.left;
    for (let y = layer.top; y < layer.bottom; y += 1) {
      for (let x = layer.left; x < layer.right; x += 1) {
        const i = (y * SIZE + x);
        if (layer.imageData.data[((y - layer.top) * w + (x - layer.left)) * 4 + 3] > 0 && under[i * 4 + 3] < 250) lightOverClear[i] = 1;
      }
    }
  }
  let worst = 0;
  let compared = 0;
  for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
    if (lightOverClear[i / 4]) continue;
    worst = Math.max(worst, Math.abs(pixels[i + 3] - merged[i + 3]));
    // Where the picture is mostly there, its colour; a nearly clear pixel's colour hardly shows.
    if (merged[i + 3] < 128) continue;
    compared += 1;
    for (let c = 0; c < 3; c += 1) worst = Math.max(worst, Math.abs(pixels[i + c] - merged[i + c]));
  }
  assert.ok(compared > SIZE * SIZE * 0.4, `${compared} pixels compared`);
  assert.ok(worst <= 2, `at most 2 levels apart, ${worst} found`);
});

test('CEditor mixes the outline of the parts that stay put for the panel under them', () => {
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  const parts = Object.values(plan.component._children.Parts._children).filter((part) => part._children.Background?._children?.Fill?.imageEnabled);
  const decode = (src) => decodePng(Buffer.from(src.split(',')[1], 'base64'));
  const layers = parts.map((part) => {
    const { width, height, pixels } = decode(part._children.Background._children.Fill.imageSrc);
    return { width, height, pixels, x: part._children.Layout.x, y: part._children.Layout.y, opacity: part.opacity ?? 1,
      visible: part.visible !== false, blend: part._children.Effects?._children?.Blend?.mode ?? 'normal', linear: hasLinearEdges(part) };
  });
  const skirt = parts.findIndex((part) => part.name === 'skirt');
  const edge = (pixels) => [...pixels].filter((_, i) => i % 4 === 3 && pixels[i] > 0 && pixels[i] < 255);
  const opacityOn = (backdrop) => {
    const mixed = mixEdgesInLinearLight(layers, backdrop).get(skirt);
    const alphas = edge(mixed ?? layers[skirt].pixels);
    return alphas.reduce((sum, a) => sum + a, 0) / alphas.length;
  };
  const asWritten = edge(layers[skirt].pixels).reduce((sum, a) => sum + a, 0) / edge(layers[skirt].pixels).length;
  // The pale skirt's edge, mixed in linear light: over a near-black panel it shows more of the skirt
  // than an sRGB mix of the same coverage would.
  const overBlack = opacityOn([0.03, 0.03, 0.03]);
  assert.ok(overBlack > asWritten + 10, `over black: ${overBlack} against ${asWritten}`);
});

test('the add-on reads names with CEditor\'s words, in CEditor\'s order, and the installer ships it', () => {
  const text = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
  const addon = text('../../../tools/blender/ceditor_layers.py');
  const importer = text('../src/CE_Application/utils/artworkComponent.js');
  // The add-on keeps a copy of the words, to show in Blender what each object will do. The first role
  // whose word is in a name wins, so the order is part of it.
  const table = (source, start, entry, word) => {
    const from = source.indexOf(start);
    const block = source.slice(from, source.indexOf('\n]', from));
    return [...block.matchAll(entry)].map(([, role, words]) => [role, [...words.matchAll(word)].map((m) => m[1])]);
  };
  const python = table(addon, 'ROLE_WORDS = [', /\("(\w+)", \(([^)]*)\)\)/g, /"(\w+)"/g);
  const js = table(importer, 'const ROLE_WORDS = [', /\['(\w+)', \[([^\]]*)\]\]/g, /'(\w+)'/g);
  assert.equal(js.length, 7);
  assert.deepEqual(python, js);
  assert.match(text('../../../tools/scripts/package-installer.ps1'), /Copy-Item -LiteralPath \(Join-Path \$toolsSrc "blender\\ceditor_layers\.py"\)/);
});
