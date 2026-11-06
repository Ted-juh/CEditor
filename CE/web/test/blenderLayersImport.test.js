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

const bytes = new Uint8Array(readFileSync(new URL('./fixtures/blender-knob.psd', import.meta.url)));
const SIZE = 96;

test('a Blender knob comes in as a dial: the pointer, its shadow and its reflection turn about its axis', () => {
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.deepEqual([plan.width, plan.height], [SIZE, SIZE]);
  assert.deepEqual(plan.warnings, []);
  const parts = plan.component._children.Parts._children;
  // The pointer's reflection in the metal cap, rendered every 27 degrees the pointer turns.
  const angles = [-135, -108, -81, -54, -27, 0, 27, 54, 81, 108, 135];
  const reflections = angles.map((angle) => `pointer_reflection_at_${angle < 0 ? `minus_${-angle}` : angle}`);
  assert.deepEqual(Object.keys(parts), [
    'shadow', 'bounce', 'lamp_glow', 'lens', 'lens_highlights', 'lamp_lit', 'skirt', 'skirt_shading', 'skirt_highlights',
    'cap', 'cap_shading', 'cap_highlights', 'pointer_shadow', ...reflections, 'pointer', 'pivot', 'pointer_shadow_pivot',
  ]);
  // A colour layer is drawn as it is; its light is multiplied into it or added to it, and the light
  // on the panel (the cap's glare, the lamp's) added to the panel.
  const blend = (name) => parts[name]._children.Effects?._children?.Blend?.mode ?? 'normal';
  for (const name of ['shadow', 'lens', 'skirt', 'cap', 'pointer_shadow', 'pointer']) assert.equal(blend(name), 'normal', name);
  for (const name of ['skirt_shading', 'cap_shading']) assert.equal(blend(name), 'multiply', name);
  for (const name of ['bounce', 'lamp_glow', 'lens_highlights', 'lamp_lit', 'skirt_highlights', 'cap_highlights', ...reflections]) {
    assert.equal(blend(name), 'plus-lighter', name);
  }
  // What turns, with the value: the pointer and its reflection about the knob's axis, the middle of the
  // picture; its shadow about its own point beside it, towards where it falls, so it stays on the side
  // away from the light.
  const turning = Object.values(plan.component._children.Bindings._children).filter((b) => b.target.endsWith('.rotation'));
  assert.deepEqual(turning.map((b) => b.target).sort(), ['pointer', ...reflections, 'pointer_shadow'].map((n) => `Parts.${n}.Layout.rotation`).sort());
  for (const binding of turning) assert.deepEqual([binding.outputMin, binding.outputMax], [-135, 135]);
  // Which reflection shows, as the pointer turns: the one rendered nearest, the two either side mixed
  // between them.
  const opacityAt = (degrees) => {
    const control = structuredClone(plan.component);
    applyCustomBindings(control, { customChannels: { 'channel.mainValue.normalized': (degrees + 135) / 270 } });
    return reflections.map((name) => Math.round(control._children.Parts._children[name].opacity * 100) / 100);
  };
  const only = (index, weight = 1) => reflections.map((_, i) => (i === index ? weight : 0));
  assert.deepEqual(reflections.map((name) => parts[name].opacity), only(5), 'as imported: the one at rest');
  assert.deepEqual(opacityAt(0), only(5));
  assert.deepEqual(opacityAt(-135), only(0));
  assert.deepEqual(opacityAt(108), only(9));
  assert.deepEqual(opacityAt(121.5), reflections.map((_, i) => (i === 9 || i === 10 ? 0.5 : 0)), 'half way, half each');
  const about = (name) => {
    const { x, y, width, height, pivotX, pivotY } = parts[name]._children.Layout;
    return [x + (pivotX / 100) * width, y + (pivotY / 100) * height];
  };
  const centre = (name) => { const { x, y, width, height } = parts[name]._children.Layout; return [x + width / 2, y + height / 2]; };
  for (const name of ['pointer', ...reflections]) {
    assert.ok(Math.hypot(about(name)[0] - SIZE / 2, about(name)[1] - SIZE / 2) < 0.05, `${name}: turns about ${about(name)}`);
  }
  const own = about('pointer_shadow');
  assert.ok(Math.hypot(own[0] - centre('pointer_shadow_pivot')[0], own[1] - centre('pointer_shadow_pivot')[1]) < 0.05, `the shadow's own pivot: ${own}`);
  const reach = Math.hypot(own[0] - SIZE / 2, own[1] - SIZE / 2);
  assert.ok(reach > 0.5 && reach < 4, `beside the axis, not on it: ${reach} px`);
  // The pointer was modelled pointing up, and comes in pointing up.
  assert.ok(parts.pointer._children.Layout.y + parts.pointer._children.Layout.height <= SIZE / 2, 'above the axis');
  for (const name of ['pivot', 'pointer_shadow_pivot']) assert.equal(parts[name].visible, false, `${name} is a mark, not a picture`);
  assert.match(describeArtworkComponent(plan, plan.layers), /^A dial of 27 layers: pointer shadow, pointer reflection at -135, /);
});

test('CEditor draws the layers as the add-on composed them', () => {
  const psd = readPsd(bytes.buffer, { useImageData: true, skipThumbnail: true });
  const { pixels } = compositePsd(psd.children, SIZE, SIZE);
  // The picture of them all, as the file keeps it: read back off its white, which the add-on laid
  // it on as Photoshop does (writing it without, its edges came back black).
  const merged = psd.imageData.data;
  // Where a layer of light lies over what is part clear (the lamp's light on the panel, the cap's glare
  // on it, the lit lamp's edge), CEditor adds it as CSS does (plus-lighter adds the opacities too) and
  // Photoshop's Linear Dodge lays its colour over; the add-on's picture is CEditor's. Everywhere else
  // the two agree.
  // What is under the light: the layers that are not light.
  const under = compositePsd(psd.children, SIZE, SIZE, { skip: (layer) => layer.blendMode === 'linear dodge' }).pixels;
  const lightOverClear = new Uint8Array(SIZE * SIZE);
  for (const layer of psd.children) {
    if (layer.blendMode !== 'linear dodge') continue;
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
