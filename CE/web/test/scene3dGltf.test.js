// A glTF model as a 3D part (utils/scene3dGltf.js; docs/design/import-formats.md, 4): the add-on test's
// knob, exported by Blender's own glTF exporter (test/fixtures/blender-knob.glb, written by
// `blender -b --factory-startup --python tools/blender/test_ceditor_layers.py -- --gltf`), read into a
// recipe and into meshes for the renderer. browser-checks/scene3d.mjs renders it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gltfMeshes, gltfRecipe, gltfSiblings, readGltf } from '../src/CE_Application/utils/scene3dGltf.js';
import { describeModel } from '../src/CE_Application/stores/scene3dActions.js';
import { layerNameOf } from '../src/CE_Application/utils/scene3dModel.js';

const bytes = new Uint8Array(readFileSync(new URL('./fixtures/blender-knob.glb', import.meta.url)));
const asset = `data:model/gltf-binary;base64,${Buffer.from(bytes).toString('base64')}`;

test('a Blender knob\'s objects come in by their names: the pointer turns, the lamp lights, the panel is the panel', async () => {
  const scene = await readGltf({ asset });
  const { recipe, report } = gltfRecipe(scene, { fileName: 'blender-knob.glb', source: { asset } });
  assert.deepEqual(recipe.objects.map((o) => [o.name, o.motion, o.shape.kind]), [
    ['skirt', 'stays', 'mesh'], ['cap', 'stays', 'mesh'], ['pointer', 'turns', 'mesh'], ['lamp', 'lamp', 'mesh'],
  ]);
  assert.deepEqual(report.panel, ['panel']);
  assert.deepEqual(report.unnamed, []);
  const cap = recipe.objects[1].material;
  assert.deepEqual([cap.finish, cap.metalness, cap.roughness], ['metal', 100, 32], 'the cap metal, as Blender has it');
  assert.equal(recipe.objects[0].material.colour, 'FFC4C4BF', 'the skirt\'s base colour, in sRGB');
  assert.equal(recipe.objects[2].shape.triangles, 2208);
  assert.equal(recipe.source.fileName, 'blender-knob.glb');
  assert.ok(recipe.source.asset.startsWith('data:model/gltf-binary;base64,'));
  assert.deepEqual(recipe.objects.map(layerNameOf), ['skirt', 'cap', 'pointer', 'lens lamp']);
});

test('the meshes, turned z up, the knob\'s axis at the origin, fitted so the farthest point across or down is 1', async () => {
  const scene = await readGltf({ asset });
  const { recipe } = gltfRecipe(scene, { source: { asset } });
  const meshes = await gltfMeshes(scene, recipe);
  assert.deepEqual(Object.keys(meshes).sort(), ['cap', 'lamp', 'pointer', 'skirt']);
  const bounds = (group) => {
    const out = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
    group.updateMatrixWorld(true);
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 1) {
        const v = { x: p.getX(i), y: p.getY(i), z: p.getZ(i) };
        const e = mesh.matrixWorld.elements;
        const w = { x: e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], y: e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], z: e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14] };
        for (const k of ['x', 'y', 'z']) { out[k][0] = Math.min(out[k][0], w[k]); out[k][1] = Math.max(out[k][1], w[k]); }
      }
    });
    return out;
  };
  const skirt = bounds(meshes.skirt);
  // The skirt, 1 across in Blender about the axis, and the lamp beside it at (1, -1), 0.11 across:
  // fitted, the lamp's far edge is 1 and the skirt 1 / 1.11.
  assert.ok(Math.abs(skirt.x[1] - 1 / 1.11) < 0.01 && Math.abs(skirt.x[0] + 1 / 1.11) < 0.01, `skirt across ${skirt.x}`);
  assert.ok(skirt.z[0] > -1e-3 && skirt.z[1] > 0.1, `standing on the panel, upward: ${skirt.z}`);
  const lamp = bounds(meshes.lamp);
  assert.ok(Math.abs(lamp.x[1] - 1) < 0.01 && Math.abs(lamp.y[0] + 1) < 0.01, `the lamp at the corner, down and to the right: ${JSON.stringify(lamp)}`);
  const pointer = bounds(meshes.pointer);
  assert.ok(pointer.y[1] > 0.3 && pointer.y[0] > -0.05, 'the pointer points up from the axis');
});

test('a .gltf names the files beside it: read through the app, or a reason to export .glb', async () => {
  const gltf = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'knob.bin', byteLength: 4 }], images: [{ uri: 'data:image/png;base64,AAAA' }] }));
  const asked = [];
  const siblings = await gltfSiblings(gltf, async (uri) => { asked.push(uri); return 'data:application/octet-stream;base64,AAAAAA=='; });
  assert.deepEqual(asked, ['knob.bin']);
  assert.deepEqual(Object.keys(siblings), ['knob.bin']);
  await assert.rejects(() => gltfSiblings(gltf, null), /knob\.bin.*glTF Binary \(\.glb\)/);
  assert.deepEqual(await gltfSiblings(bytes, null), {}, 'a .glb carries everything');
});

test('what the import says: the objects and what they do, the panel, names it cannot read, and what it does not use', () => {
  const lines = describeModel({
    objects: [{ name: 'pointer', motion: 'turns' }, { name: 'cap', motion: 'stays' }, { name: 'skirt', motion: 'stays' }, { name: 'lamp', motion: 'lamp' }],
    panel: ['panel'], unnamed: ['Cylinder.002'], textures: true,
  }, 'Chicken head.glb');
  assert.deepEqual(lines, [
    'A 3D part of 4 objects from Chicken head.glb: pointer (turns with the value); cap and skirt (stays put); lamp (lights with the Lamp value).',
    'panel, the surface it stands on, is the panel the control is placed on.',
    'Cylinder.002 has no name CEditor reads, and stays put; rename it in the 3D tab.',
    'Its textures are not drawn: each object takes its material\'s colour.',
    'The file\'s camera and lights are not used: CEditor looks straight down and lights with the set\'s lamp.',
  ]);
});
