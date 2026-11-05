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

test('scale labels, an arc and a track you can see through no longer refuse', () => {
  for (const props of [{ showScaleLabels: true }, { orientation: 'arc' }, { orientation: 'arc', segments: 12 }]) {
    assert.equal(plainMeterLayersRefusal(meter(props)), '', JSON.stringify(props));
  }
  assert.equal(plainMeterLayersRefusal(meter({ scale: 'db' })), '', 'a decibel scale: its bindings read on it');
  // Peak Hold is a marker on the held peak the value keeps (channel.<name>.peak).
  assert.equal(plainMeterLayersRefusal(meter({ peakHold: true })), '');
  // A bar on a track you can see through shows its fill through a mask as wide as the reading.
  assert.equal(plainMeterLayersRefusal(meter({ trackColour: '80141414' })), '');
  const seeThrough = plainMeterLayers({ resolved: meter({ trackColour: '80141414' }), rect: { x: 0, y: 0, width: 200, height: 40 }, channel: 'level', prefix: 'level', zIndex: 0, uniqueName: (name) => name });
  assert.ok(!named(seeThrough, 'cover'), 'no cover');
  assert.equal(seeThrough.bindings.level_fillMaskWidth?.target, 'Parts.level_fill.mask.width');
  assert.equal(plainMeterLayersRefusal(meter({ trackColour: '80141414', segments: 8 })), '', 'segments draw over the track');
  assert.equal(plainMeterLayersRefusal(meter({ trackColour: '80141414', orientation: 'arc' })), '', 'so does an arc');
});

test('a meter comes in with no reading or caption of its own: those are Labels, and its body fills its box', () => {
  const out = layersOf(meter({}));
  assert.ok(!named(out, 'readout') && !named(out, 'label'));
  const track = named(out, 'track')._children.Layout;
  assert.deepEqual([track.x, track.y, track.width, track.height], [4, 4, 192, 117], 'the body is the box less its padding');
});

test('an arc meter is its track and one fill arc in the zones\' colours whose sweep is the reading', () => {
  const out = layersOf(meter({ orientation: 'arc' }));
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
