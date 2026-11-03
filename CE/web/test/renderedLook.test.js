// A part drawn as a rendered object (utils/renderedLook.js, docs/design/changeable-control-sets.md
// piece E): live in the editor, baked into the plug-in at export (the owner's decision, 2026-11-03).
// The images themselves need WebGL2, which node has not; browser-checks draw them. This pins the
// model, the keys a baked image is found by, and the wiring.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import {
  bakeRenderedLooks, lampDirection, loadBakedRenderedLooks, renderedBakeKey, renderedLookSpec, renderedLooks,
  renderedTurn, renderedTurns, requestRenderedLook,
} from '../src/CE_Application/utils/renderedLook.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const plate = (props = {}) => ({ look: 'rendered', ...props, _children: { Background: { _children: { Fill: { colour: 'FFC2C5CA' } } } } });

test('a plate\'s properties become what the shader draws, defaulted and bounded', () => {
  const spec = renderedLookSpec(plate({ renderProfile: 'knurled', renderMaterial: 'metal', renderTopMaterial: 'spun' }), { colour: 'FFC2C5CA' });
  assert.equal(spec.shape, 'knurled');
  assert.equal(spec.body, '#C2C5CA');
  assert.equal(spec.top, '#C2C5CA', 'the top takes the body colour unless it has its own');
  assert.equal(spec.count, 72, 'a knurled body\'s ridges');
  assert.equal(spec.depth, 0.02);
  assert.equal(spec.height, 0.4);
  assert.equal(renderedLookSpec(plate({ renderProfile: 'fluted' })).count, 18);
  assert.equal(renderedLookSpec(plate({ renderProfile: 'nonsense', renderTop: 'nonsense' })).shape, 'smooth');
  assert.equal(renderedLookSpec(plate({ renderDepth: 900 })).depth, 0.15, 'bounded');
  assert.equal(renderedLookSpec(plate({ renderTopColour: 'FF102030' })).top, '#102030');
});

test('the set\'s lamp lights it: azimuth 225 is from the top left, elevation 48 above', () => {
  const [x, y, z] = lampDirection({ azimuth: 225, elevation: 48 });
  assert.ok(x < 0 && y > 0 && z > 0.7, `${x} ${y} ${z}`);
  assert.deepEqual(lampDirection(null), lampDirection({ azimuth: 225, elevation: 48 }), 'the defaults');
});

test('a turning grooved body needs eight images through one groove\'s repeat; a smooth one, one', () => {
  const knurled = renderedLookSpec(plate({ renderProfile: 'knurled', renderCount: 40 }));
  assert.equal(renderedTurns(knurled, true).length, 8);
  assert.deepEqual(renderedTurns(knurled, false), [0]);
  assert.deepEqual(renderedTurns(renderedLookSpec(plate()), true), [0]);
  // Any turn lands on one of the eight: 360 / 40 = 9 degrees a groove.
  const steps = renderedTurns(knurled, true).map((a) => Math.round(a * 1000) / 1000);
  for (const turn of [0, 4.4, 9, 123.7, -30]) assert.ok(steps.includes(Math.round(renderedTurn(knurled, turn) * 1000) / 1000), String(turn));
});

test('an exported panel carries its images, and a part finds them without WebGL', async () => {
  // In node there is no WebGL: nothing is baked, and the count of what was not says so.
  const controls = [{ _children: { Parts: { _children: { bodyHousing: plate({ renderProfile: 'knurled', turns: true }), bodyCap: { visible: true } } } } }];
  const baked = await bakeRenderedLooks(controls, {});
  assert.equal(baked.plates, 1);
  assert.equal(Object.keys(baked.images).length, 0);
  // What the plug-in loads: found by spec and turn, whatever size the part asks for.
  const spec = renderedLookSpec(plate());
  const url = 'data:image/png;base64,AAAA';
  assert.equal(loadBakedRenderedLooks({ [renderedBakeKey(spec, 0)]: url, junk: 'nope' }), 1);
  assert.equal(requestRenderedLook(get(renderedLooks), spec, 123, 0), url);
  assert.equal(requestRenderedLook(get(renderedLooks), spec, 999, 0), url);
});

test('the knob draws a rendered plate from its image, and export bakes them', () => {
  const knob = read('CE_Application/editor/SliderFamilyRenderer.svelte');
  assert.match(knob, /\{@const rendered = renderedPlate\(part, r\)\}\s*\{#if rendered\}\s*<image data-rendered-look=\{role\} href=\{rendered\.url\}/);
  assert.match(knob, /if \(String\(part\?\.look \?\? ''\) !== 'rendered' \|\| r <= 0\) return null;/);
  const prep = read('CE_Application/stores/panelExportPreparation.js');
  assert.match(prep, /const looks = await bakeRenderedLooks\(controlsInTree\(panel\.controls\)/);
  assert.match(prep, /panel\.renderedLookImages = looks\.images/);
  assert.match(read('Player.svelte'), /loadBakedRenderedLooks\(raw\?\.renderedLookImages\)/);
});

test('a knob with a rendered plate is not made into layers that would draw it flat', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { valueLayersRefusal } = await import('../src/CE_Application/utils/valueControlLayers.js');
  const knob = createControl('Knob');
  Object.assign(knob._children.Parts._children.bodyHousing, { visible: true, look: 'rendered' });
  assert.match(valueLayersRefusal(knob), /a rendered housing/);
});
