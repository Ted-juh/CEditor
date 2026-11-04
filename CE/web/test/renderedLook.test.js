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
  assert.match(prep, /const looks = await bakeRenderedLooks\(controlsInTree\(panel\.controls\), \{\s*lamp: panelSet\?\.lamp \?\? null,\s*resolve: \(control\) => resolveControlForSet\(control, panelSet, sources\),/);
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

test('the Knob tab offers a plate\'s look, and a rendered plate shows only what the render draws', () => {
  const tab = readFileSync(new URL('../src/CE_Application/sections/KnobPartsEditor.svelte', import.meta.url), 'utf8');
  assert.match(tab, /\{@const rendered = String\(part\?\.look \?\? ''\) === 'rendered'\}/);
  assert.match(tab, /<PropertyCell label="Look" span=\{1\} path=\{`\$\{prefix\}\.look`\}/);
  assert.match(tab, /set\(`\$\{prefix\}\.look`, e\.target\.value === 'rendered' \? 'rendered' : ''\)/, 'Flat clears the key: the factory value');
  for (const key of ['renderProfile', 'renderCount', 'renderDepth', 'renderTaper', 'renderHeight', 'renderTop', 'renderMaterial', 'renderTopMaterial', 'renderTopColour']) {
    assert.ok(tab.includes(`path={\`\${prefix}.${key}\`}`), key);
  }
  for (const list of ['RENDERED_PROFILES', 'RENDERED_TOPS', 'RENDERED_MATERIALS']) assert.match(tab, new RegExp(`\\{#each ${list} as \\[id, label\\] \\(id\\)\\}`));
  // The flat look's fields (outline, border, finish, shadow, grooves) sit in the other branch.
  const branch = tab.slice(tab.indexOf('{#if rendered}'), tab.indexOf('{:else}', tab.indexOf('{#if rendered}')));
  assert.ok(branch.includes('label="Body Colour"') && branch.includes('label="Top Colour"'));
  for (const flat of ['label="Outline"', 'label="Grooves"', 'label="Shadow %"']) assert.ok(!branch.includes(flat), flat);
  // The defaults it shows are the ones the render uses.
  assert.match(tab, /part\?\.renderProfile === 'fluted' \? 18 : 72/);
  assert.equal(renderedLookSpec({ look: 'rendered' }, {}).count, 72);
  assert.equal(renderedLookSpec({ look: 'rendered', renderProfile: 'fluted' }, {}).count, 18);
});

test('the core imports nothing, so a bare page can draw with it', () => {
  const core = readFileSync(new URL('../src/CE_Application/utils/renderedLookCore.js', import.meta.url), 'utf8');
  assert.doesNotMatch(core, /^\s*import\s/m);
  assert.match(core, /export function createRenderedLookRenderer\(canvas\)/);
});

test('a fader cap is a block the cap\'s size, its ridges along the travel; a round cap is a turned body', async () => {
  const { renderedCapSpec, renderedFrame } = await import('../src/CE_Application/utils/renderedLookCore.js');
  const cap = (kind, props = {}) => ({ kind, look: 'rendered', ...props, _children: { Layout: { width: 22, height: 44 } } });
  // Layout.width runs along the travel and Layout.height across it, as capGeometry has it.
  const upright = renderedCapSpec(cap('block'), { vertical: true });
  assert.deepEqual([upright.shape, upright.width, upright.length, upright.axis], ['block', 1, 0.5, 'y']);
  const lying = renderedCapSpec(cap('block'), { vertical: false });
  assert.deepEqual([lying.width, lying.length, lying.axis], [0.5, 1, 'x']);
  assert.deepEqual(renderedFrame(upright), { w: 1 + 0.3, h: 0.5 + 0.3 }, 'the shadow\'s room on each side');
  assert.equal(renderedCapSpec(cap('dot')).shape, 'smooth');
  assert.equal(renderedCapSpec(cap('line')), null);
  assert.equal(renderedCapSpec(cap('ring')), null);
  // Its height and corner are its narrower side's: 60 % of 22 is 13.2 of the larger 44.
  assert.equal(upright.height, 0.3);
  assert.equal(renderedCapSpec(cap('block', { renderTop: 'ridged', renderCount: 7 })).topKind, 'ridged');
  assert.equal(renderedCapSpec(cap('block', { renderTop: 'nonsense' })).topKind, 'flat');
});

test('a button\'s part is a block its box\'s size, or a turned body when it is a circle', async () => {
  const { RENDERED_DEVICE_FRAME, renderedDevicePartSpec } = await import('../src/CE_Application/utils/renderedLookCore.js');
  const { DEVICE_FRAME } = await import('../src/CE_Application/models/buttonDeviceParts.js');
  assert.deepEqual(RENDERED_DEVICE_FRAME, { width: DEVICE_FRAME.width, height: DEVICE_FRAME.height });
  const part = (shape, w, h, radius = 0) => ({ shape, look: 'rendered', _children: { Layout: { width: w, height: h }, Background: { _children: { Corners: { radius } } } } });
  const key = renderedDevicePartSpec(part('rect', 50, 50, 8));
  assert.deepEqual([key.shape, key.width, key.length, key.axis], ['block', 1, 0.5, 'x'], 'a 80 by 40 box');
  assert.equal(key.corner, 0.1, 'its 8 corner is 40 % of its half height, 20');
  assert.equal(renderedDevicePartSpec(part('ellipse', 25, 50)).shape, 'smooth', 'a 40 by 40 circle');
  assert.equal(renderedDevicePartSpec(part('rect', 0, 50)), null);
});

test('the images a control needs: turns of a grooved plate, each cap, a key lit and unlit', async () => {
  const { renderedLookJobs } = await import('../src/CE_Application/utils/renderedLookCore.js');
  const control = (behavior, parts) => ({ _children: { Behavior: behavior, Parts: { _children: parts } } });
  const knob = control({ geometry: 'circular' }, {
    bodyCap: plate({ renderProfile: 'knurled', turns: true }),
    bodyHousing: { ...plate(), visible: false },
    pointerCurrent: { look: 'rendered', kind: 'block', _children: { Layout: { width: 10, height: 10 } } },
  });
  assert.equal(renderedLookJobs(knob).length, 8, 'eight turns of the cap; an invisible plate and a knob\'s pointer, none');
  const slider = control({ geometry: 'linear', orientation: 'horizontal' }, {
    pointerCurrent: { look: 'rendered', kind: 'console', _children: { Layout: { width: 20, height: 40 } } },
  });
  assert.deepEqual(renderedLookJobs(slider).map(({ spec, angle }) => [spec.shape, spec.axis, angle]), [['block', 'x', 0]]);
  const button = { _children: { Parts: { _children: {
    key: { look: 'rendered', shape: 'rect', activeColour: 'FFFF3300', _children: { Layout: { width: 50, height: 50 }, Background: { _children: { Fill: { colour: 'FF202020' } } } } },
    legend: { look: 'rendered' },
  } } } };
  assert.deepEqual(renderedLookJobs(button).map(({ spec }) => spec.body), ['#202020', '#FF3300']);
});

test('the export bakes each control as it is drawn, and the slider and the button draw rendered parts', async () => {
  // A colour role is resolved before the spec is made: the image the plug-in's part asks for.
  const role = { _children: { Behavior: { geometry: 'circular' }, Parts: { _children: { bodyCap: { look: 'rendered', _children: { Background: { _children: { Fill: { colour: '{control.cap}' } } } } } } } } };
  const resolved = { _children: { Behavior: { geometry: 'circular' }, Parts: { _children: { bodyCap: { look: 'rendered', _children: { Background: { _children: { Fill: { colour: 'FF112233' } } } } } } } } };
  let asked = 0;
  const baked = await bakeRenderedLooks([role], { resolve: (control) => { asked += 1; return control === role ? resolved : control; } });
  assert.equal(asked, 1);
  assert.equal(baked.plates, 1);
  const slider = read('CE_Application/editor/SliderFamilyRenderer.svelte');
  assert.match(slider, /\{@const rendered = g\.kind === 'ring' \|\| g\.kind === 'line' \? null : renderedCap\(part, point, g\)\}\s*\{#if rendered\}\s*<image data-rendered-look=\{name\}/);
  assert.match(slider, /const spec = renderedCapSpec\(part, \{\s*vertical: orientation === 'vertical',/);
  const button = read('CE_Application/editor/ButtonDeviceParts.svelte');
  assert.match(button, /rendered: renderedPart\(name, part, box, lit \? part\.activeColour : fill\.colour\),/);
  assert.match(button, /\{#if item\.rendered\}\s*<image data-rendered-look=\{item\.name\}/);
});

test('a slider with a rendered cap and a button with a rendered part are not made into layers either', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { valueLayersRefusal, buttonDeviceLayersRefusal } = await import('../src/CE_Application/utils/valueControlLayers.js');
  const slider = createControl('Slider');
  Object.assign(slider._children.Parts._children.pointerCurrent, { visible: true, kind: 'block', look: 'rendered' });
  assert.match(valueLayersRefusal(slider), /a rendered fader cap/);
  const button = createControl('Button');
  Object.assign(button._children.Parts._children.key, { visible: true, look: 'rendered' });
  assert.match(buttonDeviceLayersRefusal(button), /a rendered key/);
});
