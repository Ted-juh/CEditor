// directionDeviceParts.test.js — the synth sets' buttons, switches and meters drawn with their own
// parts (models/directionDeviceParts.js; docs/design/changeable-control-sets.md, piece B).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { readControlPath, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { EDITOR_PATHS } from '../src/CE_Application/models/controlSetDesigns.js';
import { DIRECTION_DEVICE_FORMS, directionDeviceParts } from '../src/CE_Application/models/directionDeviceParts.js';
import { buttonFormFamily } from '../src/CE_Application/models/buttonFormParts.js';
import { meterFormFamily } from '../src/CE_Application/models/meterFormParts.js';
import { PHYSICAL_DIRECTIONS } from '../src/CE_Application/models/physicalControlSets.js';
import { deviceShapePath, DEVICE_SHAPES } from '../src/CE_Application/utils/deviceShapes.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const drawn = (type, id) => resolveControlForSet(createControl(type), getControlSet(id));
const parts = (type, id) => drawn(type, id)._children.Parts._children;
const CLASSIC = ['atlas', 'kiln', 'arcade', 'spool', 'tessera', 'bellows', 'helix', 'iris', 'balance', 'satellite', 'fan', 'crown'];

test("the 36 synth sets' buttons, switches and meters are parts; the twelve classic designs' stay forms", () => {
  assert.equal(DIRECTION_DEVICE_FORMS.length, 36);
  for (const d of PHYSICAL_DIRECTIONS) {
    for (const type of ['Button', 'MomentaryButton', 'ToggleButton', 'Meter']) {
      const control = drawn(type, d.id);
      assert.equal(control._children.Core.controlForm || '', '', `${d.id} ${type}: no form`);
      assert.ok(Object.values(control._children.Parts._children).some((part) => part.visible === true), `${d.id} ${type}: parts drawn`);
    }
  }
  for (const id of CLASSIC) {
    for (const type of ['Button', 'ToggleButton', 'Meter']) assert.equal(drawn(type, id)._children.Core.controlForm, `new-${id}`, `${id} ${type}`);
    assert.equal(directionDeviceParts('Button', `new-${id}`), null);
  }
  assert.equal(directionDeviceParts('Knob', 'new-brassworks'), null, 'a knob is not a device');
});

test('every recipe writes only what a set may write, and lands on a factory control', () => {
  for (const form of DIRECTION_DEVICE_FORMS) {
    for (const type of ['Button', 'ToggleButton', 'Meter']) {
      const family = type === 'Meter' ? meterFormFamily(type, form, { face: 'FF4A4D51', housing: 'FF24262A' }) : buttonFormFamily(type, form, { face: 'FF4A4D51', housing: 'FF24262A' });
      assert.ok(family, `${form} ${type}`);
      for (const [name, patch] of Object.entries(family.parts)) {
        for (const path of Object.keys(patch)) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form} ${type}: ${name}.${path}`);
      }
      const control = resolveControlForSet(createControl(type), { ...getControlSet('graphite'), id: `test-${form}`, families: { [type]: family } });
      for (const [name, patch] of Object.entries(family.parts)) {
        for (const path of Object.keys(patch)) {
          if (patch[path] == null) continue;
          assert.notEqual(readControlPath(control, `Parts.${name}.${path}`), undefined, `${form} ${type}: ${name}.${path} lands`);
        }
      }
    }
  }
});

test('the keys go down and light, the rockers tip, the side lamp rises', () => {
  const key = parts('Button', 'hi-fi');
  assert.ok(key.key.travelY > 0, 'the key goes down');
  assert.equal(key.indicator.follows, 'key');
  assert.match(key.indicator.activeColour, /^[0-9A-F]{8}$/, 'its bar lights in the accent');
  const rocker = parts('ToggleButton', 'brassworks');
  assert.ok(rocker.key._children.Layout.rotation > 0 && rocker.key.swing < 0, 'it tips the other way when on');
  assert.equal(parts('Button', 'heritage').key.shape, 'bevel', "Heritage's piano key");
  assert.ok(parts('ToggleButton', 'dual-scale').indicator.travelY < 0, 'the status lamp rises');
  const sculpted = parts('Button', 'valve-console').housing;
  assert.ok(sculpted.shadowOffset > 0 && sculpted.shadowBlur > 0, 'the sculpted case on its drop shadow');
});

test('the meters: a needle swings on its paper, two on a console, a bar fills, a ladder lights', () => {
  const vu = parts('Meter', 'brassworks');
  assert.equal(vu.indicator.motion, 'swing');
  assert.equal(vu.track.shape, 'bow', 'the scale curve');
  assert.equal(vu.scale.pattern, 'arc');
  const pair = parts('Meter', 'hi-fi');
  assert.equal(pair.face.pattern, 'columns');
  assert.equal(pair.marker.motion, 'swing', 'the right needle is the marker');
  assert.equal(parts('Meter', 'diesel').indicator.motion, 'fill');
  assert.equal(parts('Meter', 'bakelite').indicator.motion, 'light');
  assert.equal(parts('Meter', 'bakelite').indicator.patternCount, 18);
  assert.equal(parts('Meter', 'turret-stack').marker.motion, 'light', 'the split ladder: the low cells are the marker');
  assert.equal(drawn('Meter', 'brassworks')._children.Text._children.Font.family, 'JetBrains Mono', 'the readout monospaced');
});

test("a device gradient's clear stops fade through their neighbours' colours, not black", () => {
  for (const form of DIRECTION_DEVICE_FORMS) {
    for (const type of ['Button', 'ToggleButton', 'Meter']) {
      for (const part of Object.values(directionDeviceParts(type, form))) {
        const stops = part['Background.Fill.gradient']?.stops ?? [];
        stops.forEach((stop, i) => {
          if (stop.color !== '00000000') return;
          const near = [stops[i - 1], stops[i + 1]].filter(Boolean).filter((s) => !/^00/.test(s.color));
          assert.ok(near.every((s) => s.color.slice(-6) === '000000'), `${form} ${type}: a clear black stop beside ${near.map((s) => s.color)}`);
        });
      }
    }
  }
});

test('the bow, the bevelled key and the octagon are shapes in their box', () => {
  for (const kind of ['bow', 'bevel', 'octagon']) assert.ok(DEVICE_SHAPES.includes(kind), kind);
  const bow = deviceShapePath('bow', 0, 0, 100, 20, { depth: 10 });
  assert.match(bow, /^M0 18 Q50 -18 100 18 L100 20 Q50 -16 0 20 Z$/, 'peaks at the top in the middle, 2 thick');
  const bevel = deviceShapePath('bevel', 0, 0, 100, 50, { depth: 30 });
  assert.match(bevel, /M0 0 L100 0 L100 35 L94 50 L6 50 L0 35 Z/, '15 up, 6 in');
  assert.match(deviceShapePath('octagon', 0, 0, 100, 40, { depth: 25 }), /^M10 0 L90 0 L100 10/);
});

test('the renderers draw a part\'s drop shadow and a button pattern\'s cell size; the tabs edit them', () => {
  for (const file of ['editor/ButtonDeviceParts.svelte', 'editor/MeterDeviceParts.svelte']) {
    const renderer = source(file);
    assert.match(renderer, /function shadowOf\(part\)/, file);
    assert.match(renderer, /data-part-shadow=\{item\.name\}/, file);
  }
  assert.match(source('editor/ButtonDeviceParts.svelte'), /cellWidth: part\?\.cellWidth, cellHeight: part\?\.cellHeight/);
  // A linear gradient runs as CSS runs it, in the drawing's units across the part's box, so a part,
  // the Gradient dock and a layer made from it agree at any angle on any box.
  for (const file of ['editor/ButtonDeviceParts.svelte', 'editor/MeterDeviceParts.svelte']) {
    const renderer = source(file);
    assert.match(renderer, /const half = \(Math\.abs\(box\.w \* dx\) \+ Math\.abs\(box\.h \* dy\)\) \/ 2;/, file);
    assert.match(renderer, /gradientUnits=\{item\.gradient\.user \? 'userSpaceOnUse' : undefined\}/, file);
  }
  for (const file of ['sections/ButtonPartsEditor.svelte', 'sections/MeterPartsEditor.svelte']) {
    const tab = source(file);
    for (const words of ['label="Shadow %"', 'label="Softness %"', "bow: 'Bow', bevel: 'Bevelled Key', octagon: 'Octagon'"]) assert.ok(tab.includes(words), `${file}: ${words}`);
  }
  // Every control that exists keeps its look: no part has a shadow unless it asks.
  for (const type of ['Button', 'ToggleButton', 'Meter']) {
    for (const part of Object.values(createControl(type)._children.Parts._children)) assert.ok(!(Number(part.shadowOffset) > 0), type);
  }
});
