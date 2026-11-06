// A 3D part (utils/scene3dModel.js, scene3dLayers.js, scene3dMerge.js): its recipe, its render passes
// made into the Blender add-on's layers, those read by the Photoshop component import, and the result
// merged into the component the 3D part is in. The passes here are made up, so that it runs without a
// renderer; browser-checks/scene3d.mjs renders with three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/CE_Application/utils/psdPanelImport.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { decodeLight, recolourGroupPixels } from '../src/CE_Application/utils/pictureRecolour.js';
import { describeObject, layerNameOf, normalizeScene3d, starterKnob } from '../src/CE_Application/utils/scene3dModel.js';
import { buildSceneLayers, lightCode, linear, scenePsdBytes, srgb, turnImage, TURN_ANGLES } from '../src/CE_Application/utils/scene3dLayers.js';
import { createScene3dPart, mergeScene3d, withoutScene3d } from '../src/CE_Application/utils/scene3dMerge.js';

const W = 48; const H = 48; const N = W * H;

/** Passes for a disc of radius `r` about the middle: covered whole inside, partly at its edge. */
function disc(r, { colour = [0.2, 0.2, 0.22], light = 0.8, gloss = 0.02, cx = 24, cy = 24, glow = null } = {}) {
  const alpha = new Float32Array(N);
  const c = new Float32Array(N * 3); const l = new Float32Array(N * 3); const g = new Float32Array(N * 3);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const p = y * W + x;
    const a = Math.min(1, Math.max(0, r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
    alpha[p] = a;
    if (!a) continue;
    for (let k = 0; k < 3; k += 1) {
      c[p * 3 + k] = colour[k];
      // The light falls off towards the bottom right: a shade to keep.
      l[p * 3 + k] = light * (1.1 - (x + y) / (W + H) * 0.6);
      g[p * 3 + k] = gloss * (x < cx && y < cy ? 4 : 1);
    }
  }
  return { alpha, colour: c, light: l, gloss: g, glow: glow ? Float32Array.from(c, (v) => v * glow) : null };
}

/** A bar from the middle upward: a pointer. */
function bar() {
  const passes = disc(0);
  for (let y = 8; y < 22; y += 1) for (let x = 23; x < 25; x += 1) {
    const p = y * W + x;
    passes.alpha[p] = 1;
    for (let k = 0; k < 3; k += 1) { passes.colour[p * 3 + k] = [0.9, 0.3, 0.05][k]; passes.light[p * 3 + k] = 0.9; passes.gloss[p * 3 + k] = 0.05; }
  }
  return passes;
}

function scene() {
  const shadow = new Float32Array(N).map((_, p) => (Math.hypot((p % W) - 27, Math.floor(p / W) - 27) < 20 ? 0.4 : 0));
  const pointer = bar();
  const at = Object.fromEntries(TURN_ANGLES.filter((a) => a).map((angle) => {
    const back = turnImage(pointer.colour, pointer.alpha, W, H, 0, [24, 24]);
    return [angle, { ...pointer, alpha: back.alpha }];
  }));
  return buildSceneLayers({
    width: W, height: H, axis: [24, 24], shadowPivot: [26, 26],
    objects: [
      { name: 'skirt', motion: 'stays', metal: false, passes: disc(22) },
      { name: 'top rotor', motion: 'rotor', metal: true, passes: disc(14, { colour: [0.6, 0.62, 0.65], light: 1.2, gloss: 0 }) },
      { name: 'pointer', motion: 'turns', metal: false, passes: pointer, at },
    ],
    shadow,
    turnShadows: Object.fromEntries(TURN_ANGLES.map((angle) => [angle, new Float32Array(N).fill(0.1)])),
  });
}

test('a recipe: a knob to start from, defaulted and bounded, and each object named for what it does', () => {
  const knob = starterKnob();
  assert.deepEqual(knob.objects.map((o) => [o.name, o.shape.kind, o.motion]), [
    ['skirt', 'turned', 'stays'], ['body', 'turned', 'turns'], ['top', 'turned', 'turns'], ['pointer', 'pointer', 'turns'],
  ]);
  assert.deepEqual(knob.objects.map(layerNameOf), ['skirt', 'body rotor', 'top rotor', 'pointer']);
  assert.deepEqual(knob.objects.map(describeObject), ['stays', 'turns · round', 'turns · round', 'turns']);
  const odd = normalizeScene3d({ objects: [
    { name: 'cap', shape: { kind: 'turned', diameter: 400, ridges: 2 }, motion: 'fly' },
    { name: 'cap', shape: { kind: 'block' }, motion: 'turns' },
    { name: 'lamp', shape: { kind: 'turned' }, motion: 'lamp' },
    { name: 'off light', shape: { kind: 'block' }, motion: 'stays' },
  ] });
  assert.deepEqual([odd.objects[0].shape.diameter, odd.objects[0].shape.ridges, odd.objects[0].motion], [100, 3, 'stays']);
  assert.equal(odd.objects[1].name, 'cap 2', 'names kept apart');
  assert.deepEqual(odd.objects.slice(1).map(layerNameOf), ['cap 2 turns', 'lens lamp', 'part'], 'a block that turns says so; a word that would move it is dropped from what stays');
});

test('the passes become the add-on\'s layers: names, modes, hidden light, a turning part at every angle, and the XMP', () => {
  const built = scene();
  const names = built.layers.map((l) => l.name);
  assert.equal(names[0], 'shadow');
  for (const name of ['skirt', 'skirt lighting', 'skirt gloss', 'skirt shading', 'skirt highlights', 'top rotor', 'top shading', 'top highlights', 'pointer at 0', 'pointer at 27', 'pointer lighting at -135', 'pointer highlights at 135', 'pointer shadow at 0', 'pivot', 'pointer shadow pivot']) {
    assert.ok(names.includes(name), name);
  }
  const by = Object.fromEntries(built.layers.map((l) => [l.name, l]));
  assert.deepEqual([by['skirt shading'].blend, by['skirt highlights'].blend, by['skirt lighting'].hidden, by['pointer at 27'].hidden, by['pointer at 0'].hidden], ['multiply', 'linear dodge', true, true, false]);
  assert.ok(names.indexOf('pointer shadow at 0') > names.indexOf('top highlights') && names.indexOf('pointer shadow at 0') < names.indexOf('pointer at 0'), 'the pointer\'s shadow falls on what stays put, under the pointer');
  assert.deepEqual(built.colourOf.slice(0, 4), [['skirt shading', 'skirt'], ['skirt highlights', 'skirt'], ['top shading', 'top rotor'], ['top highlights', 'top rotor']]);
  assert.deepEqual(built.metal, ['top rotor']);
  assert.deepEqual(built.linearEdges, ['skirt']);
  // Light is written as the add-on's code, a sixteenth of a doubling a step.
  for (const x of [0.01, 0.5, 1, 3.7, 200]) assert.ok(Math.abs(decodeLight(lightCode(x)) / x - 1) < 0.03, `${x}`);
});

test('worked out again in the colour it was drawn in, a part is its layers as written, within 3 levels', () => {
  const built = scene();
  const by = Object.fromEntries(built.layers.map((l) => [l.name, l]));
  const sheet = (name) => ({ pixels: by[name].rgba, box: { x: 0, y: 0, width: W, height: H } });
  for (const name of ['skirt', 'top rotor']) {
    const still = name === 'top rotor' ? 'top' : name;
    const layer = by[name].rgba;
    const top = Math.max(...Array.from({ length: N }, (_, p) => layer[p * 4 + 3]));
    const picked = [[], [], []];
    for (let p = 0; p < N; p += 1) if (layer[p * 4 + 3] >= top - 2) for (let c = 0; c < 3; c += 1) picked[c].push(layer[p * 4 + c]);
    const drawn = picked.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
    const again = recolourGroupPixels({
      colour: drawn, drawn, metal: name === 'top rotor', layer: sheet(name),
      lighting: by[`${name} lighting`].rgba, gloss: by[`${name} gloss`].rgba,
      shading: by[`${still} shading`] ? sheet(`${still} shading`) : null, highlights: sheet(`${still} highlights`),
    });
    let worst = 0;
    for (let p = 0; p < N; p += 1) {
      if (layer[p * 4 + 3] < 255) continue;
      for (let c = 0; c < 3; c += 1) worst = Math.max(worst, Math.abs(again.colour[p * 4 + c] - layer[p * 4 + c]));
    }
    assert.ok(worst <= 3, `${name}: ${worst} levels`);
  }
  assert.ok(Math.abs(srgb(linear(0.5)) - 0.5) < 1e-6);
});

test('the layers read by the Photoshop import: a dial, the rotor and the pointer turning, the light going with its colour', () => {
  const built = scene();
  const plan = planPsdComponentImport(scenePsdBytes({ width: W, height: H, ...built }), { fileName: 'knob.psd' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.ok(plan.report.turns.includes('top rotor') && plan.report.turns.includes('pointer'), JSON.stringify(plan.report.turns));
  const parts = plan.component._children.Parts._children;
  assert.equal(parts.top_shading._children.Background._children.Fill.imageColourFollows, 'top_rotor');
  assert.equal(parts.top_rotor._children.Background._children.Fill.imageColourMetal, true);
  assert.equal(parts.pointer._children.Image.mode, 'frames');
  assert.equal(parts.pointer._children.Image.frames.length, TURN_ANGLES.length);
});

test('merged into a component: named after the 3D part, placed in its box, wired to the component\'s value, and replaced whole by the next render', () => {
  const built = scene();
  const rendered = planPsdComponentImport(scenePsdBytes({ width: W, height: H, ...built }), { fileName: 'knob.psd' }).component;
  const control = {
    _type: 'Control',
    _children: {
      Core: { id: 'c1', controlType: 'CustomComponent' },
      Transform: { width: 200, height: 120 },
      Parts: { _type: 'Parts', _children: {
        plate: createPartNode('plate'),
        knob: createScene3dPart('knob', { x: 100, y: 30, width: 24, height: 24 }),
        label: createPartNode('label'),
      } },
      ValueChannels: { _type: 'ValueChannels', _children: {} },
      Behaviors: { _type: 'Behaviors', _children: {} },
      HitZones: { _type: 'HitZones', _children: {} },
      Bindings: { _type: 'Bindings', _children: {} },
      States: { _type: 'States', _children: {} },
    },
  };
  const options = { frame: { x: 100, y: 30, width: 24, height: 24 }, scale: 2, artboard: { width: 200, height: 120 } };
  const merged = mergeScene3d(control, 'knob', rendered, options);
  const names = Object.keys(merged._children.Parts._children);
  assert.equal(names[0], 'plate');
  assert.equal(names[1], 'knob');
  assert.equal(names.at(-1), 'label', 'what it made is kept just after it');
  assert.ok(names.includes('knob__pointer') && names.includes('knob__top_rotor'));
  const pointer = merged._children.Parts._children.knob__pointer;
  assert.equal(pointer.meta.scene3dOf, 'knob');
  assert.ok(pointer._children.Layout.x >= 100 && pointer._children.Layout.x < 124, `placed in the box: ${pointer._children.Layout.x}`);
  assert.equal(merged._children.Parts._children.knob__top_shading._children.Background._children.Fill.imageColourFollows, 'knob__top_rotor');
  const bindings = merged._children.Bindings._children;
  assert.ok(Object.keys(bindings).every((name) => name.startsWith('knob__')));
  assert.ok(Object.values(bindings).every((b) => b.target.startsWith('Parts.knob__') && b.source === 'channel.mainValue.normalized'));
  assert.deepEqual(Object.keys(merged._children.ValueChannels._children), ['mainValue']);
  assert.deepEqual(merged._children.HitZones._children.mainZone.bounds, { x: 50, y: 25, width: 12, height: 20, unit: 'percent' });
  assert.deepEqual(merged._children.Parts._children.knob.meta.scene3dWired, { channels: ['mainValue'], behaviors: ['mainBehavior'], hitZones: ['mainZone'] });

  const again = mergeScene3d(merged, 'knob', rendered, options);
  assert.deepEqual(Object.keys(again._children.Parts._children), names, 'the next render replaces, it does not add');
  assert.deepEqual(Object.keys(again._children.Bindings._children), Object.keys(bindings));
  const gone = withoutScene3d(again, 'knob');
  assert.deepEqual(Object.keys(gone._children.Parts._children), ['plate', 'knob', 'label']);
  assert.deepEqual([Object.keys(gone._children.Bindings._children).length, Object.keys(gone._children.ValueChannels._children).length, Object.keys(gone._children.HitZones._children).length], [0, 0, 0]);

  // A component with a value of its own keeps it, and what the 3D part made follows it.
  const own = structuredClone(control);
  own._children.ValueChannels._children.cutoff = { name: 'cutoff', type: 'float' };
  const onOwn = mergeScene3d(own, 'knob', rendered, options);
  assert.deepEqual(Object.keys(onOwn._children.ValueChannels._children), ['cutoff']);
  assert.ok(Object.values(onOwn._children.Bindings._children).every((b) => b.source === 'channel.cutoff.normalized'));
  assert.deepEqual(onOwn._children.Parts._children.knob.meta.scene3dWired, { channels: [], behaviors: [], hitZones: [] });
});
