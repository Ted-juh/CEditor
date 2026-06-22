import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeInteractive,
  listInteractiveArchetypes,
  CUSTOM_INTERACTIVE_ARCHETYPES,
} from '../src/CE_Application/utils/customComponentFactory.js';

test('listInteractiveArchetypes exposes every archetype', () => {
  const ids = listInteractiveArchetypes().map((a) => a.id).sort();
  assert.deepEqual(ids, Object.keys(CUSTOM_INTERACTIVE_ARCHETYPES).sort());
});

test('unknown archetype returns null', () => {
  assert.equal(makeInteractive('nope'), null);
});

test('dial scaffolds a face-tracking circular control, fully wired', () => {
  const { valueChannels, behaviors, hitZones } = makeInteractive('dial', { name: 'cutoff' });
  assert.deepEqual(Object.keys(valueChannels), ['cutoffValue']);
  assert.deepEqual(Object.keys(behaviors), ['cutoffBehavior']);
  assert.deepEqual(Object.keys(hitZones), ['cutoffZone']);

  const behavior = behaviors.cutoffBehavior;
  assert.equal(behavior.geometry, 'circular');
  assert.equal(behavior.valueChannel, 'cutoffValue');

  const zone = hitZones.cutoffZone;
  assert.equal(zone.source, 'face');
  assert.equal(zone.shape, 'circle');
  assert.equal(zone.targetBehavior, 'cutoffBehavior');
  assert.equal(zone.targetValueChannel, 'cutoffValue');
  assert.equal(zone.cursor, 'grab');
});

test('slider tracks a part with a finger-friendly minimum', () => {
  const { hitZones } = makeInteractive('slider', { name: 'gain', partName: 'gainTrack' });
  const zone = hitZones.gainZone;
  assert.equal(zone.source, 'part:gainTrack');
  assert.equal(zone.minTouch, 44);
});

test('handle inflates its grab area and drags relatively', () => {
  const { behaviors, hitZones } = makeInteractive('handle', { name: 'pos', partName: 'posHandle' });
  assert.deepEqual(hitZones.posZone.inflate, { x: 12, y: 12, unit: 'px' });
  assert.equal(hitZones.posZone.minTouch, 44);
  // relative archetypes pick a concrete drag mode so the runtime uses dragContext deltas.
  assert.equal(behaviors.posBehavior.dragMode, 'horizontal');
});

test('toggle uses a bool channel and toggleValue action', () => {
  const { valueChannels, hitZones } = makeInteractive('toggle', { name: 'bypass', partName: 'bypassBg' });
  assert.equal(valueChannels.bypassValue.type, 'bool');
  assert.equal(hitZones.bypassZone.action, 'toggleValue');
  assert.equal(hitZones.bypassZone.source, 'part:bypassBg');
});

test('xy scaffolds two channels on one face behavior', () => {
  const { valueChannels, behaviors, hitZones } = makeInteractive('xy', { name: 'pan' });
  assert.deepEqual(Object.keys(valueChannels).sort(), ['panX', 'panY']);
  assert.deepEqual(behaviors.panPad.valueChannels, ['panX', 'panY']);
  assert.equal(hitZones.panZone.source, 'face');
  assert.equal(hitZones.panZone.targetValueChannel, 'panX');
  assert.equal(hitZones.panZone.targetValueChannelY, 'panY');
});

test('range scaffolds two handles, two channels, and a pairing link', () => {
  const { valueChannels, behaviors, hitZones } = makeInteractive('range', { name: 'band' });
  assert.deepEqual(Object.keys(valueChannels).sort(), ['bandMax', 'bandMin']);
  assert.equal(valueChannels.bandMin.constraints.pairedMax, 'bandMax');
  assert.equal(valueChannels.bandMax.constraints.pairedMin, 'bandMin');
  assert.deepEqual(Object.keys(behaviors).sort(), ['bandMax', 'bandMin']);
  assert.equal(hitZones.bandMinZone.source, 'part:bandMinHandle');
  assert.equal(hitZones.bandMaxZone.source, 'part:bandMaxHandle');
});
