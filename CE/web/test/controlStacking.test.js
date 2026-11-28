// controlStacking.test.js — which controls are a stacking context of their own (CanvasControl's
// `.stacks-alone`, effectsCSS.js blendsThroughControl). One that is keeps the layers inside it —
// its words at z-index 2, a part's frames — under every later control drawn over it; before, a
// Label's words showed through a Label laid over them. One with a layer inside that blends is not,
// so the layer still blends with what is behind the control, as a Photoshop knob's dodge layers must.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl, COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';
import { blendsThroughControl } from '../src/CE_Application/utils/effectsCSS.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import { planPsdComponentImport } from '../src/CE_Application/utils/psdComponentImport.js';
import { FILMS, filmPanel } from '../scripts/filmFestivalPanels.js';

const typeNames = () => (Array.isArray(COMPONENT_TYPES) ? COMPONENT_TYPES : Object.keys(COMPONENT_TYPES)).map((t) => (typeof t === 'string' ? t : t.type ?? t.id ?? t.name));

test('every control as it is made stacks as one: nothing in it blends', () => {
  const names = typeNames();
  assert.ok(names.length > 40, `the control types: ${names.length}`);
  for (const name of names) assert.equal(blendsThroughControl(createControl(name)), false, name);
});

test('a layer inside that blends keeps the control out of a stacking context of its own', () => {
  const label = createControl('Label');
  assert.equal(blendsThroughControl(label), false);

  const ownBlend = createControl('Label');
  ownBlend._children.Effects._children.Blend = { ...ownBlend._children.Effects._children.Blend, mode: 'screen' };
  assert.equal(blendsThroughControl(ownBlend), false, 'the control\'s own blend is on its root, and blends outward either way');

  const gradient = createControl('Label');
  gradient._children.Background._children.Fill = { ...gradient._children.Background._children.Fill, gradientBlend: 'multiply' };
  assert.equal(blendsThroughControl(gradient), true, 'a fill\'s gradient that multiplies');

  const patterned = createControl('Label');
  const { patch } = addPatternPatch(patterned._children.Background, 'Background', { blend: 'overlay' });
  const key = Object.keys(patch)[0];
  if (key.endsWith('.Patterns')) patterned._children.Background._children.Patterns = patch[key];
  else patterned._children.Background._children.Patterns._children[key.split('.').pop()] = patch[key];
  assert.equal(blendsThroughControl(patterned), true, 'a pattern laid over in overlay');

  const stated = createControl('Label');
  stated._children.States = { ...stated._children.States, hover: { 'Background.Fill.imageBlend': 'screen' } };
  assert.equal(blendsThroughControl(stated), true, 'a blend a state sets counts too');
});

test('a knob made in Blender and imported from its PSD blends through: its light layers reach the panel', () => {
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/blender-knob.psd', import.meta.url)));
  const knob = planPsdComponentImport(bytes, { fileName: 'blender-knob.psd' }).component;
  assert.equal(blendsThroughControl(knob), true);
});

test('every control in the Film Festival stacks as one, so a cut to black covers the title under it', () => {
  for (const [id] of FILMS) {
    for (const control of filmPanel(id).controls) assert.equal(blendsThroughControl(control), false, `${id}: ${control._children.Core.name}`);
  }
});
