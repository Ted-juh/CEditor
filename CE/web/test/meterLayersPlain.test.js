// A plain meter (editor/MeterRenderer.svelte) made into layers by Create Component from Selection:
// its readout, its label, its scale's labels and the arc meter came in "in a later step" and were
// refused until then. browser-checks/knobLayers.mjs compares the pictures (CE_KNOB_LAYERS_TYPE=Meter,
// with CE_KNOB_LAYERS_PROPS for each of these); this checks what the layers are.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { plainMeterLayers, plainMeterLayersRefusal } from '../src/CE_Application/utils/valueControlLayers.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

function meter(props = {}) {
  const control = createControl('Meter');
  Object.assign(control._children.Meter, props);
  return control;
}

function layersOf(control, rect = { x: 0, y: 0, width: 200, height: 125 }) {
  const taken = new Set();
  return plainMeterLayers({
    resolved: control, rect, channel: 'level', prefix: 'level', zIndex: 1,
    uniqueName: (wanted) => { let name = wanted; let i = 2; while (taken.has(name)) name = `${wanted}${i++}`; taken.add(name); return name; },
  });
}

const named = (out, suffix) => out.parts.find((part) => part.name === `level_${suffix}`);

test('a readout, a label, scale labels and an arc no longer refuse; what a layer cannot follow still does', () => {
  for (const props of [{ showValue: true }, { label: 'LEVEL', labelPosition: 'above' }, { showScaleLabels: true }, { orientation: 'arc' }, { orientation: 'arc', segments: 12 }]) {
    assert.equal(plainMeterLayersRefusal(meter(props)), '', JSON.stringify(props));
  }
  assert.match(plainMeterLayersRefusal(meter({ scale: 'db' })), /decibel/);
  // Peak Hold is a marker on the held peak the value keeps (channel.<name>.peak).
  assert.equal(plainMeterLayersRefusal(meter({ peakHold: true })), '');
  assert.match(plainMeterLayersRefusal(meter({ trackColour: '80141414' })), /see through/, 'a bar covers its fill with the track');
  assert.equal(plainMeterLayersRefusal(meter({ trackColour: '80141414', segments: 8 })), '', 'segments draw over the track');
  assert.equal(plainMeterLayersRefusal(meter({ trackColour: '80141414', orientation: 'arc' })), '', 'so does an arc');
});

test('the readout prints the channel as the meter printed its value, at the body\'s right', () => {
  const out = layersOf(meter({ showValue: true }));
  const readout = named(out, 'readout');
  assert.ok(readout, 'a readout layer');
  assert.equal(out.bindings.level_readoutText.source, 'channel.level.display');
  assert.equal(out.bindings.level_readoutText.target, 'Parts.level_readout.Text.content');
  assert.equal(readout._children.Text._children.Position.justification, 'right');
  assert.equal(readout._children.Text._children.Effects.shadowEnabled, true, 'its shadow, 0 1px 2px');
  // Its right edge 5 px in from the body's (4 px in from the box): the box runs 8 px further for its padding.
  const layout = readout._children.Layout;
  assert.equal(Math.round(layout.x + layout.width), 200 - 4 - 5 + 8);
});

test('a label above takes its line and a gap of 3 from the body', () => {
  const plain = layersOf(meter({}));
  const labelled = layersOf(meter({ label: 'LEVEL', labelPosition: 'above' }));
  assert.equal(named(labelled, 'label')._children.Text.content, 'LEVEL');
  const trackY = (out) => named(out, 'track')._children.Layout.y;
  const trackH = (out) => named(out, 'track')._children.Layout.height;
  assert.ok(trackY(labelled) > trackY(plain) + 3, 'the body starts below the label');
  assert.ok(Math.abs((trackH(plain) - trackH(labelled)) - (trackY(labelled) - trackY(plain))) < 0.01, 'and is that much shorter');
});

test('an arc meter is its track, one fill arc in the zones\' colours whose sweep is the reading, and its readout under it', () => {
  const out = layersOf(meter({ orientation: 'arc', showValue: true }));
  const track = named(out, 'track');
  const fill = named(out, 'fill');
  assert.equal(track.kind, 'arcTrack');
  assert.equal(track.meta.arcTrack.cap, 'round');
  assert.equal(track.meta.arcTrack.startAngle, 225, 'the meter\'s 135 (from 3 o\'clock) is a layer\'s 225 (from 12)');
  assert.equal(track.meta.arcTrack.sweepAngle, 270);
  assert.equal(fill.meta.arcTrack.cap, 'butt');
  assert.deepEqual(fill.meta.arcTrack.zones.map((zone) => zone.from), [0, 0.7, 0.9]);
  assert.equal(fill.meta.arcTrack.zoneSweep, 270);
  assert.equal(fill.meta.arcTrack.blend, true);
  const sweep = out.bindings.level_fillSweep;
  assert.equal(sweep.target, 'Parts.level_fill.meta.arcTrack.sweepAngle');
  assert.ok(named(out, 'readout'), 'the readout');
  // Hard zones keep their edges; segments are arcs of their own, each lit by the reading.
  assert.equal(named(layersOf(meter({ orientation: 'arc', gradient: false })), 'fill').meta.arcTrack.blend, false);
  const segmented = layersOf(meter({ orientation: 'arc', segments: 6 }));
  assert.equal(segmented.parts.filter((part) => /^level_segment\dlit$/.test(part.name)).length, 6);
  assert.ok(segmented.bindings.level_segment0litLit);
});

test('the layers draw what the meter draws: zone colours on an arc, text shadows and outlines', () => {
  const renderer = source('editor/InteractivePartRenderer.svelte');
  assert.match(renderer, /background:conic-gradient\(from \$\{arc\.renderedStartAngle\}deg, \$\{stops\.join\(', '\)\}\)/);
  assert.match(renderer, /\{(?:#if|:else if) arcZoneStyle\}\s*<div class="interactive-arc-zones" style=\{arcZoneStyle\}><\/div>\s*\{:else if arcSvgData\}/);
  assert.match(renderer, /const shadow = buildTextShadowValue\(effects\);/);
  assert.match(renderer, /-webkit-text-stroke:\$\{width\}px/);
  // The meter's blended arc had a seam at each of its 128 joins; each span now runs into the next.
  assert.match(source('editor/MeterRenderer.svelte'), /const overlap = cfg\.gradient === false \? 0 : 0\.5 \/ 128;/);
});
