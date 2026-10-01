// assetReferences.test.js — what uses each asset of a custom component.
//
// The first test runs over the real filmstrip-knob starter, so the index is checked against what the
// app builds and not only against fixtures written to suit it. The rest are small hand-built
// controls, one per kind of reference, so a failure names the rule that broke.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  componentAssetReferences,
  dependentReferences,
  describeReference,
  ownedAssets,
  referenceLabel,
} from '../src/CE_Application/utils/assetReferences.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';

const PNG_A = 'data:image/png;base64,AAAA';
const PNG_B = 'data:image/png;base64,BBBB';

/** A custom component reduced to what the index reads. */
function component(id, sections = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'CustomComponent' },
      Assets: { images: {}, filmstrips: {} },
      ...sections,
    },
  };
}

const vias = (references) => references.map((reference) => reference.via).sort();

test('the filmstrip knob starter: its strip is used by its generator and its published property', () => {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));

  assert.deepEqual(ownedAssets(control).map((asset) => asset.key), ['filmstrip:knobFrames']);
  const { byAsset, dangling } = componentAssetReferences(control);
  const uses = byAsset.get('filmstrip:knobFrames');
  assert.deepEqual(vias(uses), ['generator', 'path']);
  assert.deepEqual(uses.map((use) => use.label).sort(), [
    'Generators › filmstripFrame › assetName',
    'PublishedProperties › editableProperties › filmstrip › path',
  ]);
  assert.deepEqual(dangling, []);
  // Designer.selectedAsset names it too, and is the editor's cursor, not a use.
  assert.equal(control._children.Designer.selectedAsset, 'knobFrames');
  assert.ok(!uses.some((use) => use.location[0] === 'Designer'));
});

test('every asset gets an entry, so "unused" is an answer', () => {
  const control = component('c1');
  control._children.Assets.images.logo = { source: PNG_A };
  control._children.Assets.filmstrips.strip = { source: PNG_B };
  const { byAsset } = componentAssetReferences(control);
  assert.deepEqual([...byAsset.keys()].sort(), ['filmstrip:strip', 'image:logo']);
  assert.deepEqual(byAsset.get('image:logo'), []);
});

test('a generator with no name, or a missing one, draws the first filmstrip, and that is a use', () => {
  const control = component('c1', {
    Generators: {
      _children: {
        unnamed: { type: 'filmstrip-frames' },
        stale: { type: 'filmstrip', assetName: 'gone', enabled: false },
        ticks: { type: 'ticks', assetName: 'first' }, // not a filmstrip generator: not a use
      },
    },
  });
  control._children.Assets.filmstrips.first = { source: PNG_A };
  control._children.Assets.filmstrips.second = { source: PNG_B };

  const { byAsset, dangling } = componentAssetReferences(control);
  assert.deepEqual(vias(byAsset.get('filmstrip:first')), ['fallback', 'fallback']);
  assert.deepEqual(byAsset.get('filmstrip:second'), []);
  // The stale name is reported as pointing at nothing, and keeps its disabled flag.
  assert.equal(dangling.length, 1);
  assert.equal(dangling[0].key, 'filmstrip:gone');
  assert.equal(dangling[0].enabled, false);
  assert.equal(describeReference(byAsset.get('filmstrip:first').find((use) => !use.enabled)), 'generator stale, as the first filmstrip (disabled)');
  assert.equal(describeReference(byAsset.get('filmstrip:first').find((use) => use.enabled)), 'generator unnamed, as the first filmstrip');
});

test('paths are found by shape wherever they are, and only whole asset paths count', () => {
  const control = component('c1', {
    Bindings: { _children: { b: { target: 'Assets.images.logo.opacity', source: 'channel.v.normalized' } } },
    Animations: { _children: { a: { targets: [{ path: 'Assets.filmstrips.strip' }, { path: 'Parts.knob.Layout.x' }] } } },
    Notes: { text: 'see Assets.images.logo.source for details', other: 'Assets.imagesX.logo' },
  });
  control._children.Assets.images.logo = { source: PNG_A };
  control._children.Assets.filmstrips.strip = { source: PNG_B };

  const { byAsset, dangling } = componentAssetReferences(control);
  assert.deepEqual(byAsset.get('image:logo').map((use) => use.label), ['Bindings › b › target']);
  assert.deepEqual(byAsset.get('filmstrip:strip').map((use) => use.label), ['Animations › a › targets › 0 › path']);
  assert.deepEqual(dangling, []);

  control._children.Bindings._children.b.target = 'Assets.images.missing[0]';
  assert.deepEqual(componentAssetReferences(control).dangling.map((use) => use.key), ['image:missing']);
});

test('a source copied into a part is a use; the same bytes in another asset is a duplicate', () => {
  const control = component('c1', {
    Parts: { _children: { face: { Background: { Fill: { imageSrc: PNG_A, overlaySrc: PNG_B } } } } },
  });
  control._children.Assets.images.logo = { source: PNG_A };
  control._children.Assets.images.logoCopy = { source: PNG_A };

  const { byAsset } = componentAssetReferences(control);
  assert.deepEqual(vias(byAsset.get('image:logo')), ['copy', 'duplicate']);
  assert.equal(byAsset.get('image:logo').find((use) => use.via === 'copy').label, 'Parts › face › Background › Fill › imageSrc');
  assert.equal(byAsset.get('image:logo').find((use) => use.via === 'duplicate').label, 'Assets › images › logoCopy › source');
  // A duplicate does not break when the asset is removed; a copy is what a replace must follow.
  assert.deepEqual(vias(dependentReferences(byAsset.get('image:logo'))), ['copy']);
});

test('with a panel, copies on other controls, nested ones and the background are found and attributed', () => {
  const owner = component('owner');
  owner._children.Assets.images.logo = { source: PNG_A };
  const nested = component('nested', { Parts: { _children: { p: { imageSrc: PNG_A } } } });
  const container = component('box', { Children: { _children: { nested } } });
  const elsewhere = component('elsewhere');
  elsewhere._children.Assets.images.sameLogo = { source: PNG_A };
  const panel = { bgImage: PNG_A, controls: [owner, container, elsewhere] };

  // Without the panel only the owner is searched.
  assert.deepEqual(componentAssetReferences(owner).byAsset.get('image:logo'), []);

  const uses = componentAssetReferences(owner, { panel }).byAsset.get('image:logo');
  const summary = uses.map((use) => [use.via, use.controlId, use.label]).sort();
  assert.deepEqual(summary, [
    ['copy', null, 'bgImage'],
    ['copy', 'nested', 'Parts › p › imageSrc'], // reported against the member, not twice via its container
    ['duplicate', 'elsewhere', 'Assets › images › sameLogo › source'],
  ]);
  assert.ok(uses.every((use) => use.external));
  assert.equal(describeReference(uses.find((use) => use.controlId === null)), 'copy — Panel: bgImage');
  assert.equal(describeReference(uses.find((use) => use.controlId === 'nested')), 'copy — nested: Parts › p › imageSrc');
});

test('an asset with no source has no copies to find, and labels drop the storage hops', () => {
  const control = component('c1', { Parts: { _children: { p: { imageSrc: '' } } } });
  control._children.Assets.images.empty = { source: '' };
  assert.deepEqual(componentAssetReferences(control).byAsset.get('image:empty'), []);
  assert.equal(referenceLabel(['Generators', '_children', 'g', 'assetName']), 'Generators › g › assetName');
});
