import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  CUSTOM_COMPONENT_STARTERS,
  createCustomComponentStarterPatch,
  createBehaviorModule,
  createHitZone,
  createValueChannel,
  makeInteractive,
} from '../src/CE_Application/utils/customComponentFactory.js';
import { deriveInteractClusters } from '../src/CE_Application/utils/customComponentClusters.js';

function blankControl() {
  return createControl('CustomComponent');
}

function withGraph({ channels = {}, behaviors = {}, zones = {} } = {}) {
  const control = blankControl();
  const patch = {};
  // Reset the blank-canvas scaffold so tests control the whole graph.
  control._children.ValueChannels._children = {};
  control._children.Behaviors._children = {};
  control._children.HitZones._children = {};
  for (const [name, value] of Object.entries(channels)) patch[`ValueChannels.${name}`] = value;
  for (const [name, value] of Object.entries(behaviors)) patch[`Behaviors.${name}`] = value;
  for (const [name, value] of Object.entries(zones)) patch[`HitZones.${name}`] = value;
  applyPatchObject(control, patch);
  return control;
}

test('single dial wiring forms one channel-keyed cluster', () => {
  const wired = makeInteractive('dial', { name: 'cutoff' });
  const control = withGraph({
    channels: wired.valueChannels,
    behaviors: wired.behaviors,
    zones: wired.hitZones,
  });
  const { clusters, orphans } = deriveInteractClusters(control);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].kind, 'channel');
  assert.deepEqual(clusters[0].channels, ['cutoffValue']);
  assert.deepEqual(clusters[0].behaviors, ['cutoffBehavior']);
  assert.deepEqual(clusters[0].zones.map((z) => z.name), ['cutoffZone']);
  assert.deepEqual(orphans, { channels: [], behaviors: [], zones: [] });
});

test('xy behavior with two channels forms one behavior-keyed cluster', () => {
  const wired = makeInteractive('xy', { name: 'pan' });
  const control = withGraph({
    channels: wired.valueChannels,
    behaviors: wired.behaviors,
    zones: wired.hitZones,
  });
  const { clusters, orphans } = deriveInteractClusters(control);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].kind, 'behavior');
  assert.deepEqual(clusters[0].channels.sort(), ['panX', 'panY']);
  assert.deepEqual(clusters[0].zones.map((z) => z.name), ['panZone']);
  assert.equal(orphans.channels.length, 0);
});

test('range scaffolds two clusters, one per paired channel', () => {
  const wired = makeInteractive('range', { name: 'band' });
  const control = withGraph({
    channels: wired.valueChannels,
    behaviors: wired.behaviors,
    zones: wired.hitZones,
  });
  const { clusters } = deriveInteractClusters(control);
  assert.equal(clusters.length, 2);
  const labels = clusters.map((c) => c.label).sort();
  assert.deepEqual(labels, ['bandMax', 'bandMin']);
  for (const cluster of clusters) {
    assert.equal(cluster.zones.length, 1);
  }
});

test('orphan buckets: channel without behavior, behavior without channel, dangling zone', () => {
  const control = withGraph({
    channels: { lonely: createValueChannel('lonely', {}) },
    behaviors: { headless: createBehaviorModule('headless', { type: 'slider', valueChannel: 'missing' }) },
    zones: { dangling: createHitZone('dangling', { targetBehavior: 'nope', targetValueChannel: 'alsoNope' }) },
  });
  const { clusters, orphans } = deriveInteractClusters(control);
  assert.equal(clusters.length, 0);
  assert.deepEqual(orphans.channels, ['lonely']);
  assert.deepEqual(orphans.behaviors, ['headless']);
  assert.deepEqual(orphans.zones, ['dangling']);
});

test('zone reaching two clusters appears in both, tagged shared', () => {
  const control = withGraph({
    channels: {
      a: createValueChannel('a', {}),
      b: createValueChannel('b', {}),
    },
    behaviors: {
      dragA: createBehaviorModule('dragA', { type: 'slider', valueChannel: 'a' }),
      dragB: createBehaviorModule('dragB', { type: 'slider', valueChannel: 'b' }),
    },
    zones: {
      crossWired: createHitZone('crossWired', { targetBehavior: 'dragA', targetValueChannel: 'b' }),
    },
  });
  const { clusters } = deriveInteractClusters(control);
  const withZone = clusters.filter((c) => c.zones.some((z) => z.name === 'crossWired'));
  assert.equal(withZone.length, 2);
  assert.ok(withZone.every((c) => c.zones.find((z) => z.name === 'crossWired').shared));
});

test('generated zones from an override map keep their generated tag', () => {
  const wired = makeInteractive('dial', { name: 'cutoff' });
  const control = withGraph({
    channels: wired.valueChannels,
    behaviors: wired.behaviors,
    zones: wired.hitZones,
  });
  const { clusters } = deriveInteractClusters(control, {
    hitZones: {
      ...control._children.HitZones._children,
      gen1: { ...createHitZone('gen1', { targetValueChannel: 'cutoffValue' }), generated: true },
    },
  });
  const zone = clusters[0].zones.find((z) => z.name === 'gen1');
  assert.ok(zone);
  assert.equal(zone.generated, true);
});

test('every starter derives without dangling zones and clusters every behavior', () => {
  for (const starter of CUSTOM_COMPONENT_STARTERS) {
    const control = blankControl();
    applyPatchObject(control, createCustomComponentStarterPatch(starter.id));
    const { clusters, orphans } = deriveInteractClusters(control);
    assert.deepEqual(orphans.zones, [], `${starter.id} has dangling zones`);
    assert.deepEqual(orphans.behaviors, [], `${starter.id} has channel-less behaviors`);
    const clustered = new Set(clusters.flatMap((c) => c.behaviors));
    const authored = Object.keys(control._children.Behaviors._children ?? {});
    assert.deepEqual([...clustered].sort(), authored.sort(), `${starter.id} behaviors clustered`);
  }
});
