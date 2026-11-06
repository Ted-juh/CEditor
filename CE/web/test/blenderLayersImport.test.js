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
import { deriveInteractClusters, describeValueUse } from '../src/CE_Application/utils/customComponentClusters.js';
import { imageFrameLayers } from '../src/CE_Application/utils/imageFrames.js';
import { hasLinearEdges, mixEdgesInLinearLight } from '../src/CE_Application/utils/linearEdges.js';
import { colourRgb, decodeLight, litLayerOf, pictureColour, pictureLayerKind, recolourBouncePixels, recolourGroupPixels, rethrownPixels, withColourFollows } from '../src/CE_Application/utils/pictureRecolour.js';
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
  // In the Interact card the panel sets it, and it is no fault: nothing is listed as not wired up.
  const wiring = deriveInteractClusters(plan.component);
  assert.deepEqual(wiring.setByPanel, ['lamp']);
  assert.deepEqual(wiring.orphans, { channels: [], behaviors: [], zones: [] });
  const use = describeValueUse(plan.component, 'lamp');
  assert.deepEqual([use.parts.sort(), use.shows], [['lamp_glow', 'lamp_glow_shine', 'lamp_lit'], true]);
  // The notice counts the component's layers as the designer lists them, not the file's 116: the 33
  // layers of the pointer, its shadow and its reflection at their angles are three, and the 67 hidden
  // ones of the light on the parts, on the panel and in the pointer's reflection are not layers at all.
  assert.equal(readPsd(bytes.buffer, { skipLayerImageData: true, skipThumbnail: true, skipCompositeImageData: true }).children.length, 116);
  assert.equal(plan.layers, Object.keys(parts).length);
  assert.match(describeArtworkComponent(plan, plan.layers), /^A dial of 19 layers: pointer shadow, pointer reflection, pointer turn with the value\. .* with a value of their own, Lamp\.$/);
});

test('a Blender part comes in with the light on it, its gloss, its light layers and whether it is metal', () => {
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  const parts = plan.component._children.Parts._children;
  const fill = (name) => parts[name]._children.Background._children.Fill;
  // Each colour layer the colour it was drawn in, and the light on it and its gloss beside it.
  assert.deepEqual(colourRgb(fill('skirt').imageColourDrawn).map((v) => Math.abs(v - 193) <= 6), [true, true, true], fill('skirt').imageColourDrawn);
  for (const name of ['skirt', 'cap', 'lens']) {
    assert.match(fill(name).imageColourLighting ?? '', /^data:image\/png;base64,/, `${name}: the light on it`);
    assert.match(fill(name).imageColourGloss ?? '', /^data:image\/png;base64,/, `${name}: its gloss`);
  }
  assert.deepEqual(['skirt', 'cap', 'lens'].map((name) => fill(name).imageColourMetal === true), [false, true, false], 'the cap is metal');
  const pointer = parts.pointer._children.Image;
  assert.ok(colourRgb(pointer.colourDrawn)[0] > colourRgb(pointer.colourDrawn)[2] + 60, `the pointer is orange: ${pointer.colourDrawn}`);
  assert.equal(pointer.frames.filter((frame) => frame.source && frame.lighting && frame.gloss).length, pointer.frames.filter((frame) => frame.source).length, 'its light at each angle drawn');
  const kinds = Object.fromEntries(Object.keys(parts).map((name) => [name, pictureLayerKind(parts[name], name)]));
  assert.deepEqual(Object.keys(kinds).filter((name) => kinds[name] === 'light').sort(), [
    'bounce', 'bounce_shine', 'cap_highlights', 'cap_shading', 'lamp_glow', 'lamp_glow_shine', 'lamp_lit', 'lens_highlights',
    'pointer_reflection', 'pointer_shadow', 'shadow', 'skirt_highlights', 'skirt_shading',
  ]);
  assert.deepEqual(['skirt_shading', 'cap_highlights', 'pointer_shadow', 'lens_highlights'].map((name) => litLayerOf(name, parts)), ['skirt', 'cap', 'pointer', 'lens']);
  // Its shading and highlights go with it; the pointer's reflection in the metal cap follows the cap.
  const role = (name) => [fill(name).imageColourFollows, fill(name).imageColourRole];
  assert.deepEqual([role('skirt_shading'), role('skirt_highlights'), role('cap_highlights'), role('lens_highlights')],
    [['skirt', 'shading'], ['skirt', 'highlights'], ['cap', 'highlights'], ['lens', 'highlights']]);
  assert.deepEqual([parts.pointer_reflection._children.Image.colourFollows, parts.pointer_reflection._children.Image.colourRole], ['cap', undefined]);
  // The light each part throws on the others, and the share of the panel's light off each, beside them;
  // the panel's shine and the shadow go with its bounce.
  assert.deepEqual(Object.keys(fill('skirt').imageColourBounce).sort(), ['cap', 'lens']);
  assert.match(fill('skirt').imageColourBounce.cap.lighting, /^data:image\/png;base64,/);
  assert.match(fill('skirt').imageColourBounce.cap.gloss, /^data:image\/png;base64,/);
  // The lens sits on the cap and throws nothing on the panel, so the file has no map of it there.
  assert.deepEqual(Object.keys(fill('bounce').imageColourBounce).sort(), ['cap', 'skirt']);
  assert.ok(fill('bounce').imageColourBase && fill('bounce').imageColourBounce.skirt.light && fill('bounce').imageColourBounce.skirt.shine);
  assert.deepEqual([role('bounce_shine'), role('shadow')], [['bounce', 'shine'], ['bounce', 'shadow']]);
  fill('cap').imageColour = 'FFCDA046';
  const followed = Object.fromEntries(withColourFollows(Object.entries(parts)));
  assert.deepEqual(['cap', 'cap_shading', 'cap_highlights'].map((name) => followed[name]._colourGroup?.role), ['colour', 'shading', 'highlights']);
  // The skirt, as drawn, is lit by the cap in its new colour; so is the panel.
  assert.deepEqual(followed.skirt._colourGroup.bounce.map((each) => each.from), ['cap']);
  assert.equal(pictureColour(followed.skirt).kind, 'group');
  assert.deepEqual(['bounce', 'bounce_shine', 'shadow'].map((name) => pictureColour(followed[name])?.role), ['bounce', 'shine', 'shadow']);
  assert.deepEqual(pictureColour(followed.cap_highlights).colour, [205, 160, 70]);
  assert.deepEqual(pictureColour(followed.pointer_reflection).kind, 'frames', 'the reflection changed in proportion');
});

test('in another colour a Blender part is as Blender renders it, where it covers the pixel: the skirt red, the metal cap brass', () => {
  const references = JSON.parse(readFileSync(new URL('./fixtures/blender-knob-recoloured.json', import.meta.url), 'utf8'));
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  const parts = plan.component._children.Parts._children;
  const decode = (src) => decodePng(Buffer.from(src.split(',')[1], 'base64'));
  const boxOf = (part) => { const { x, y, width, height } = part._children.Layout; return { x, y, width, height }; };
  const fillOf = (name) => parts[name]._children.Background._children.Fill;
  /** Where a part covers the artwork (alpha > 0), a frame of frames at rest. */
  const covers = (name) => {
    const part = parts[name];
    const image = part._children.Image;
    let picture;
    let box = boxOf(part);
    if (image?.mode === 'frames') {
      const frame = image.frames[Math.round(image.frameIndex)];
      picture = decode(frame.source);
      box = { x: Math.round(box.x + (frame.x / 100) * box.width), y: Math.round(box.y + (frame.y / 100) * box.height), width: picture.width, height: picture.height };
    } else picture = decode(fillOf(name).imageSrc);
    const out = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < picture.height; y += 1) for (let x = 0; x < picture.width; x += 1) {
      if (picture.pixels[(y * picture.width + x) * 4 + 3] && y + box.y < SIZE && x + box.x < SIZE) out[(y + box.y) * SIZE + x + box.x] = 1;
    }
    return out;
  };
  const grown = (mask) => mask.map((_, i) => {
    const x = i % SIZE; const y = Math.floor(i / SIZE);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (mask[(y + dy) * SIZE + x + dx] && x + dx >= 0 && x + dx < SIZE) return 1;
    return 0;
  });
  for (const [name, over] of [['skirt', ['cap', 'pointer', 'pointer_shadow']], ['cap', ['pointer', 'pointer_shadow']]]) {
    const reference = Buffer.from(references[name].rgb, 'base64');
    const colour = colourRgb(references[name].colour);
    const sheet = (part) => ({ pixels: decode(fillOf(part).imageSrc).pixels, box: boxOf(parts[part]) });
    const result = recolourGroupPixels({
      colour, drawn: colourRgb(fillOf(name).imageColourDrawn), metal: fillOf(name).imageColourMetal === true,
      layer: sheet(name), lighting: decode(fillOf(name).imageColourLighting).pixels, gloss: decode(fillOf(name).imageColourGloss).pixels,
      shading: parts[`${name}_shading`] ? sheet(`${name}_shading`) : null, highlights: sheet(`${name}_highlights`),
    });
    // Where it covers the pixel (its highlights over it), the parts over it left out: what the browser
    // shows is the colour layer, times the shading as it covers it, plus the highlights as they do.
    const hidden = over.map(covers).reduce((a, b) => a.map((v, i) => v | b[i])).map((v) => v);
    const hiddenGrown = grown(hidden);
    const at = (picture, box, x, y) => ((y - box.y) * box.width + (x - box.x)) * 4;
    const colourBox = boxOf(parts[name]);
    const shadingBox = parts[`${name}_shading`] ? boxOf(parts[`${name}_shading`]) : null;
    const highlightsBox = boxOf(parts[`${name}_highlights`]);
    const inBox = (box, x, y) => box && x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
    const diffs = [];
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
      if (hiddenGrown[y * SIZE + x] || !inBox(highlightsBox, x, y) || !inBox(colourBox, x, y)) continue;
      const h = at(result.highlights, highlightsBox, x, y);
      const hA = result.highlights[h + 3] / 255;
      const v = at(result.colour, colourBox, x, y);
      if (!hA || result.colour[v + 3] < 255) continue;
      const s = shadingBox && inBox(shadingBox, x, y) ? at(result.shading, shadingBox, x, y) : -1;
      const sA = s >= 0 ? result.shading[s + 3] / 255 : 0;
      let worst = 0;
      for (let k = 0; k < 3; k += 1) {
        const shownNow = Math.min(255, result.colour[v + k] * (1 - sA + sA * (s >= 0 ? result.shading[s + k] / 255 : 1)) + hA * result.highlights[h + k]);
        worst = Math.max(worst, Math.abs(Math.round(shownNow) - reference[(y * SIZE + x) * 3 + k]));
      }
      diffs.push(worst);
    }
    diffs.sort((a, b) => a - b);
    const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const p99 = diffs[Math.floor(diffs.length * 0.99)];
    assert.ok(diffs.length > 300, `${name}: ${diffs.length} pixels compared`);
    assert.ok(mean < 2 && p99 < 6, `${name} in ${references[name].colour}: mean ${mean.toFixed(2)}, 99th percentile ${p99} levels against Blender`);
  }
});

test('what a part lights beside it is lit in its new colour: the panel by the red skirt, the skirt by the brass cap', () => {
  const references = JSON.parse(readFileSync(new URL('./fixtures/blender-knob-recoloured.json', import.meta.url), 'utf8'));
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  const parts = plan.component._children.Parts._children;
  const decode = (src) => decodePng(Buffer.from(src.split(',')[1], 'base64'));
  const fillOf = (name) => parts[name]._children.Background._children.Fill;
  const boxOf = (name) => { const { x, y, width, height } = parts[name]._children.Layout; return { x, y, width, height }; };
  const sheet = (name) => ({ pixels: decode(fillOf(name).imageSrc).pixels, box: boxOf(name) });
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const toSrgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.max(0, x) ** (1 / 2.4) - 0.055);
  const ratioOf = (name) => {
    const picked = colourRgb(references[name].colour);
    const drawn = colourRgb(fillOf(name).imageColourDrawn);
    return picked.map((v, c) => toLin(v / 255) / toLin(drawn[c] / 255));
  };
  /** Where a part covers the artwork (a frame of frames at rest), as a mask. */
  const covers = (name) => {
    const image = parts[name]._children.Image;
    let picture;
    let box = boxOf(name);
    if (image?.mode === 'frames') {
      const frame = image.frames[Math.round(image.frameIndex)];
      picture = decode(frame.source);
      box = { x: Math.round(box.x + (frame.x / 100) * box.width), y: Math.round(box.y + (frame.y / 100) * box.height), width: picture.width, height: picture.height };
    } else picture = decode(fillOf(name).imageSrc);
    const out = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < picture.height; y += 1) for (let x = 0; x < picture.width; x += 1) {
      if (picture.pixels[(y * picture.width + x) * 4 + 3] && y + box.y < SIZE && x + box.x < SIZE) out[(y + box.y) * SIZE + x + box.x] = 1;
    }
    return out;
  };
  const grown = (mask, steps) => {
    let m = mask;
    for (let s = 0; s < steps; s += 1) {
      m = m.map((_, i) => {
        const x = i % SIZE; const y = Math.floor(i / SIZE);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && m[yy * SIZE + xx]) return 1;
        }
        return 0;
      });
    }
    return m;
  };
  const inBox = (box, x, y) => box && x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
  const at = (box, x, y) => ((y - box.y) * box.width + (x - box.x)) * 4;
  const others = grown(covers('pointer').map((v, i) => v | covers('pointer_shadow')[i] | covers('lamp_glow')[i]), 2);
  const summary = (diffs) => ({ mean: diffs.reduce((a, b) => a + b, 0) / diffs.length, n: diffs.length });

  // The red skirt: the panel just beside it, lit by its new colour (its shadow a multiply, its bounce and shine).
  {
    const reference = Buffer.from(references.skirt.rgb, 'base64');
    const box = boxOf('bounce');
    const result = recolourBouncePixels({
      base: decode(fillOf('bounce').imageColourBase).pixels, bounce: sheet('bounce'), shine: sheet('bounce_shine'), shadow: sheet('shadow'),
      emitters: [{ ratio: ratioOf('skirt'), light: decode(fillOf('bounce').imageColourBounce.skirt.light).pixels, shine: decode(fillOf('bounce').imageColourBounce.skirt.shine).pixels }],
    });
    const base = decode(fillOf('bounce').imageColourBase).pixels;
    const skirt = covers('skirt');
    const beside = grown(skirt, 3).map((v, i) => v & !skirt[i] & !others[i]);
    const diffs = [];
    const shadowBox = boxOf('shadow');
    const shineBox = boxOf('bounce_shine');
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
      if (!beside[y * SIZE + x] || !inBox(box, x, y)) continue;
      const i = at(box, x, y);
      if (!base[i + 3]) continue;
      let worst = 0;
      for (let c = 0; c < 3; c += 1) {
        const shown = toSrgb(decodeLight(base[i + c]));
        const multiply = inBox(shadowBox, x, y) ? result.shadow[at(shadowBox, x, y) + c] / 255 : 1;
        const multiple = 1 / Math.max(1 - result.bounce[i + c] / 255, 1e-6);
        const s = inBox(shineBox, x, y) ? at(shineBox, x, y) : -1;
        const added = s >= 0 ? (result.shine[s + c] / 255) * (result.shine[s + 3] / 255) : 0;
        const now = Math.min(255, (shown * multiply * multiple + added) * 255);
        worst = Math.max(worst, Math.abs(Math.round(now) - reference[(y * SIZE + x) * 3 + c]));
      }
      diffs.push(worst);
    }
    const { mean, n } = summary(diffs);
    assert.ok(n > 200 && mean < 2.5, `the panel beside the red skirt: ${n} pixels, mean ${mean.toFixed(2)} levels against Blender`);
  }

  // The brass cap: the skirt just beside it, lit by the cap's new colour.
  {
    const reference = Buffer.from(references.cap.rgb, 'base64');
    const drawn = colourRgb(fillOf('skirt').imageColourDrawn);
    const thrown = fillOf('skirt').imageColourBounce.cap;
    const result = recolourGroupPixels({
      colour: drawn, drawn, layer: sheet('skirt'), lighting: decode(fillOf('skirt').imageColourLighting).pixels, gloss: decode(fillOf('skirt').imageColourGloss).pixels,
      shading: parts.skirt_shading ? sheet('skirt_shading') : null, highlights: sheet('skirt_highlights'),
      bounce: [{ ratio: ratioOf('cap'), lighting: decode(thrown.lighting).pixels, gloss: decode(thrown.gloss).pixels }],
    });
    const cap = covers('cap');
    const beside = grown(cap, 3).map((v, i) => v & !cap[i] & !others[i]);
    const colourBox = boxOf('skirt');
    const highlightsBox = boxOf('skirt_highlights');
    const shadingBox = parts.skirt_shading ? boxOf('skirt_shading') : null;
    const diffs = [];
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
      if (!beside[y * SIZE + x] || !inBox(colourBox, x, y) || !inBox(highlightsBox, x, y)) continue;
      const v = at(colourBox, x, y);
      const h = at(highlightsBox, x, y);
      const hA = result.highlights[h + 3] / 255;
      if (result.colour[v + 3] < 255 || !hA) continue;
      const sIdx = shadingBox && inBox(shadingBox, x, y) ? at(shadingBox, x, y) : -1;
      const sA = sIdx >= 0 ? result.shading[sIdx + 3] / 255 : 0;
      let worst = 0;
      for (let c = 0; c < 3; c += 1) {
        const now = Math.min(255, result.colour[v + c] * (1 - sA + sA * (sIdx >= 0 ? result.shading[sIdx + c] / 255 : 1)) + hA * result.highlights[h + c]);
        worst = Math.max(worst, Math.abs(Math.round(now) - reference[(y * SIZE + x) * 3 + c]));
      }
      diffs.push(worst);
    }
    const { mean, n } = summary(diffs);
    assert.ok(n > 100 && mean < 2.5, `the skirt beside the brass cap: ${n} pixels, mean ${mean.toFixed(2)} levels against Blender`);
  }
});

test('a recoloured pointer\'s reflection in the cap takes its colour, as Blender renders the pointer blue', () => {
  const references = JSON.parse(readFileSync(new URL('./fixtures/blender-knob-recoloured.json', import.meta.url), 'utf8'));
  const plan = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' });
  const parts = plan.component._children.Parts._children;
  const decode = (src) => decodePng(Buffer.from(src.split(',')[1], 'base64'));
  const toSrgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.min(1, Math.max(0, x)) ** (1 / 2.4) - 0.055);
  const image = parts.pointer_reflection._children.Image;
  // Each frame carries the look under it and the share of it off the pointer's colour, keyed by the
  // pointer's part (its layers were "pointer at <angle>").
  assert.ok(image.frames.every((frame) => frame.under && frame.thrown?.pointer), 'every angle has its maps');
  assert.equal(image.colourFollows, 'cap', 'and it still follows the metal it is in');
  // Through the designer's path: the pointer in its new colour, the reflection worked out again.
  const recoloured = { ...parts.pointer, _children: { ...parts.pointer._children, Image: { ...parts.pointer._children.Image, colour: references.pointer.colour } } };
  const entries = withColourFollows([['pointer_reflection', parts.pointer_reflection]], { ...parts, pointer: recoloured });
  const wanted = pictureColour(entries[0][1]);
  assert.equal(wanted.kind, 'frames');
  assert.deepEqual(wanted.thrown.emitters.map((each) => each.from), ['pointer']);
  // On pixels, at rest: the cap under it, the pointer's shadow over that, the reflection added; against
  // Blender's render where the reflection is and the pointer is not.
  const reference = Buffer.from(references.pointer.rgb, 'base64');
  const [ratio] = wanted.thrown.emitters.map((each) => each.ratio);
  const frameBox = (part, frame, picture) => {
    const { x, y, width, height } = part._children.Layout;
    return { x: Math.round(x + (frame.x / 100) * width), y: Math.round(y + (frame.y / 100) * height), width: picture.width, height: picture.height };
  };
  const rest = image.frames[image.frameIndex];
  const layer = decode(rest.source);
  const box = frameBox(parts.pointer_reflection, rest, layer);
  const under = decode(rest.under).pixels;
  const light = decode(rest.thrown.pointer).pixels;
  const shadowFrame = parts.pointer_shadow._children.Image.frames[parts.pointer_shadow._children.Image.frameIndex];
  const shadow = decode(shadowFrame.source);
  const shadowBox = frameBox(parts.pointer_shadow, shadowFrame, shadow);
  const pointerFrame = parts.pointer._children.Image.frames[parts.pointer._children.Image.frameIndex];
  const pointer = decode(pointerFrame.source);
  const pointerBox = frameBox(parts.pointer, pointerFrame, pointer);
  const alphaIn = (picture, b, x, y) => (x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height ? picture.pixels[((y - b.y) * b.width + (x - b.x)) * 4 + 3] : 0);
  const near = (x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => alphaIn(pointer, pointerBox, x + dx, y + dy) > 0));
  const shown = (pixels, i, x, y) => [0, 1, 2].map((c) => {
    const below = toSrgb(decodeLight(under[i + c])) * (1 - alphaIn(shadow, shadowBox, x, y) / 255);
    return Math.min(255, Math.round((below + (pixels[i + c] / 255) * (pixels[i + 3] / 255)) * 255));
  });
  const now = rethrownPixels({ pixels: layer.pixels, under, emitters: [{ ratio, light }] });
  const errors = { now: [], drawn: [] };
  for (let y = 0; y < box.height; y += 1) for (let x = 0; x < box.width; x += 1) {
    const i = (y * box.width + x) * 4;
    const [ax, ay] = [x + box.x, y + box.y];
    if (!layer.pixels[i + 3] || !under[i + 3] || near(ax, ay)) continue;
    const want = [0, 1, 2].map((c) => reference[(ay * SIZE + ax) * 3 + c]);
    const worst = (pixels) => Math.max(...shown(pixels, i, ax, ay).map((v, c) => Math.abs(v - want[c])));
    errors.now.push(worst(now));
    errors.drawn.push(worst(layer.pixels));
  }
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  assert.ok(errors.now.length >= 15, `${errors.now.length} pixels compared`);
  // At the fixture's 96 pixels the reflection is a small streak: 1.1 levels, at most 2, measured here;
  // 1.9 and 4 in the pointer's drawn colour.
  assert.ok(mean(errors.now) < 1.5 && Math.max(...errors.now) <= 3 && mean(errors.now) < mean(errors.drawn),
    `the reflection in the blue pointer's colour: mean ${mean(errors.now).toFixed(2)}, at most ${Math.max(...errors.now)} levels against Blender; `
    + `${mean(errors.drawn).toFixed(2)} and ${Math.max(...errors.drawn)} in its drawn colour`);
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
