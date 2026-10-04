// assetEdits.test.js — a rename moves the asset and every name that points at it; a replace
// changes the picture and every copy of it. The patches are checked by applying them with the same
// function the store uses (applyPatchObject), so what the test sees is what the document gets.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_NAME_PATTERN,
  planAssetRename,
  planAssetReplace,
  rebakeOptionsFor,
  referencePatchPath,
} from '../src/CE_Application/utils/assetEdits.js';
import { componentAssetReferences } from '../src/CE_Application/utils/assetReferences.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';

const PNG_A = 'data:image/png;base64,AAAA';
const PNG_B = 'data:image/png;base64,BBBB';
const PNG_NEW = 'data:image/png;base64,NEWW';

function component(id, sections = {}) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'CustomComponent' },
      Assets: { images: {}, filmstrips: {} },
      ...sections,
    },
  };
}

/** Apply a plan's patches to clones of the controls, the way the store does, and hand them back. */
function applied(plan, controls) {
  const out = new Map(controls.map((control) => [control._children.Core.id, deepClone(control)]));
  for (const [controlId, patch] of plan.patchesByControlId) applyPatchObject(out.get(controlId), patch);
  return out;
}

test('a rename moves the map entry in place and rewrites the generator and the path that name it', () => {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));
  control._children.Assets.filmstrips.zzz = { source: PNG_B, name: 'zzz' }; // order: knobFrames, zzz

  const plan = planAssetRename(control, 'filmstrip', 'knobFrames', 'dialFrames');
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.key, 'filmstrip:dialFrames');
  assert.equal(plan.label, 'Rename knobFrames → dialFrames');
  assert.deepEqual(plan.rewritten.map((r) => r.via).sort(), ['generator', 'path']);

  const next = applied(plan, [control]).get(control._children.Core.id);
  assert.deepEqual(Object.keys(next._children.Assets.filmstrips), ['dialFrames', 'zzz'], 'order kept, key renamed');
  assert.equal(next._children.Assets.filmstrips.dialFrames.name, 'dialFrames');
  assert.equal(next._children.Assets.filmstrips.dialFrames.source, control._children.Assets.filmstrips.knobFrames.source);
  assert.equal(next._children.Generators._children.filmstripFrame.assetName, 'dialFrames');
  assert.equal(next._children.PublishedProperties.editableProperties.filmstrip.path, 'Assets.filmstrips.dialFrames.source');
  // After the move the index sees the new name used exactly as the old one was, and nothing dangling.
  const after = componentAssetReferences(next);
  assert.deepEqual(after.byAsset.get('filmstrip:dialFrames').map((r) => r.via).sort(), ['generator', 'path']);
  assert.deepEqual(after.dangling, []);
});

test('a rename is refused for an empty, unchanged, taken or unpathable name', () => {
  const control = component('c');
  control._children.Assets.images.a = { source: PNG_A };
  control._children.Assets.images.b = { source: PNG_B };
  assert.equal(planAssetRename(control, 'image', 'a', '').ok, false);
  assert.equal(planAssetRename(control, 'image', 'a', 'a').ok, false);
  assert.match(planAssetRename(control, 'image', 'a', 'b').error, /already/);
  assert.match(planAssetRename(control, 'image', 'a', 'knob.face').error, /path segment/);
  assert.match(planAssetRename(control, 'image', 'a', 'x[0]').error, /path segment/);
  assert.equal(planAssetRename(control, 'image', 'missing', 'z').ok, false);
  assert.ok(ASSET_NAME_PATTERN.test('knob_face-2'));
  // A name an image has is free for a filmstrip: the maps are separate.
  assert.equal(planAssetRename(control, 'image', 'a', 'c').ok, true);
});

test('a rename leaves copies, duplicates and an unnamed generator\'s fallback alone', () => {
  const control = component('c', {
    Generators: { _children: { unnamed: { type: 'filmstrip-frames' } } },
    Parts: { _children: { face: { Background: { Fill: { imageSrc: PNG_A } } } } },
  });
  control._children.Assets.images.pic = { source: PNG_A };
  control._children.Assets.images.picCopy = { source: PNG_A };
  control._children.Assets.filmstrips.first = { source: PNG_B };

  const plan = planAssetRename(control, 'image', 'pic', 'picture');
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.rewritten, []);
  assert.deepEqual(Object.keys(plan.patchesByControlId.get('c')), ['Assets.images']);

  const strip = planAssetRename(control, 'filmstrip', 'first', 'only');
  assert.deepEqual(strip.rewritten, [], 'the fallback generator names nothing, so nothing is written');
  const next = applied(strip, [control]).get('c');
  assert.equal(next._children.Generators._children.unnamed.assetName, undefined);
  assert.deepEqual(componentAssetReferences(next).byAsset.get('filmstrip:only').map((r) => r.via), ['fallback']);
});

test('a rename only rewrites a path that is this asset\'s, not a longer name that starts the same', () => {
  const control = component('c', {
    Bindings: { _children: { b: { target: 'Assets.images.knob.opacity' }, c: { target: 'Assets.images.knobFace.opacity' } } },
  });
  control._children.Assets.images.knob = { source: PNG_A };
  control._children.Assets.images.knobFace = { source: PNG_B };
  const next = applied(planAssetRename(control, 'image', 'knob', 'dial'), [control]).get('c');
  assert.equal(next._children.Bindings._children.b.target, 'Assets.images.dial.opacity');
  assert.equal(next._children.Bindings._children.c.target, 'Assets.images.knobFace.opacity');
});

test('a replace writes the new picture into the asset and into every copy, across controls and the panel', () => {
  const owner = component('owner', { Parts: { _children: { face: { Background: { Fill: { imageSrc: PNG_A } } } } } });
  owner._children.Assets.images.logo = { _type: 'ImageAsset', name: 'logo', source: PNG_A, width: 10, height: 10, sourceFileName: 'old.png', package: true };
  owner._children.Assets.images.twin = { source: PNG_A };
  const other = component('other', { Parts: { _children: { p: { overlaySrc: PNG_A } } } });
  const panel = { bgImage: PNG_A, bgTexture: PNG_B, controls: [owner, other] };

  const plan = planAssetReplace(owner, 'image', 'logo', { source: PNG_NEW, width: 32, height: 16, fileName: 'new.png' }, { panel });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.label, 'Replace logo');
  assert.equal(plan.copies.length, 3);
  assert.deepEqual(plan.panelUpdates, { bgImage: PNG_NEW });
  assert.deepEqual(plan.outsideUndo, ['bgImage']);
  assert.deepEqual(plan.duplicates.map((d) => d.label), ['Assets › images › twin › source']);

  const next = applied(plan, [owner, other]);
  const logo = next.get('owner')._children.Assets.images.logo;
  assert.equal(logo.source, PNG_NEW);
  assert.deepEqual([logo.width, logo.height, logo.sourceFileName, logo.package, logo._type], [32, 16, 'new.png', true, 'ImageAsset']);
  assert.ok(logo.importedAt);
  assert.equal(next.get('owner')._children.Parts._children.face.Background.Fill.imageSrc, PNG_NEW);
  assert.equal(next.get('other')._children.Parts._children.p.overlaySrc, PNG_NEW);
  assert.equal(next.get('owner')._children.Assets.images.twin.source, PNG_A, 'a duplicate is its own asset');
});

test('a replace is refused for a missing asset, an empty source or the same picture', () => {
  const control = component('c');
  control._children.Assets.images.a = { source: PNG_A };
  assert.equal(planAssetReplace(control, 'image', 'zzz', { source: PNG_NEW }).ok, false);
  assert.equal(planAssetReplace(control, 'image', 'a', { source: '' }).ok, false);
  assert.match(planAssetReplace(control, 'image', 'a', { source: PNG_A }).error, /same picture/);
});

test('replacing a baked strip with a file makes it an imported one; other baked strips are listed as stale', () => {
  const control = component('c', {
    Generators: { _children: { frames: { type: 'filmstrip-frames', assetName: 'face' } } },
    Parts: { _children: { bg: { imageSrc: PNG_A } } },
  });
  const baked = {
    _type: 'FilmstripAsset', name: 'face', source: PNG_B, frameCount: 32, frameWidth: 96, frameHeight: 96,
    orientation: 'vertical', interpolation: 'nearest', valueSource: 'mainValue', package: true,
    generated: true, generator: 'customComponentBake', generatedAt: '2026-10-01T00:00:00.000Z',
    bake: { logicalFrameWidth: 48, logicalFrameHeight: 48, outputScale: 2, canvasWidth: 96, canvasHeight: 3072, pixelCount: 294912 },
  };
  control._children.Assets.filmstrips.face = baked;
  control._children.Assets.filmstrips.ring = { ...baked, name: 'ring' };
  control._children.Assets.images.pic = { source: PNG_A };

  // Replacing the baked strip itself: it is a file now, and the bake record goes with the bytes.
  const own = planAssetReplace(control, 'filmstrip', 'face', { source: PNG_NEW, width: 96, height: 3072, fileName: 'face.png' });
  const face = applied(own, [control]).get('c')._children.Assets.filmstrips.face;
  assert.equal(face.generated, undefined);
  assert.equal(face.bake, undefined);
  assert.equal(face.frameCount, 32, 'the frame settings stay for the tab\'s divisibility check');
  assert.deepEqual(own.staleBakes.map((s) => s.name), ['ring'], 'the other baked strip drew this one through its generator');

  // Replacing an image the parts copy: both baked strips are pictures of those parts.
  const pic = planAssetReplace(control, 'image', 'pic', { source: PNG_NEW, width: 8, height: 8, fileName: 'p.png' });
  assert.deepEqual(pic.staleBakes.map((s) => s.name), ['face', 'ring']);
  assert.deepEqual(pic.staleBakes[0].options, {
    name: 'face', frameCount: 32, frameWidth: 48, frameHeight: 48, orientation: 'vertical', outputScale: 2,
    valueSource: 'mainValue', interpolation: 'nearest',
  });

  // An asset nothing in the component uses cannot have gone into a bake.
  control._children.Assets.images.unused = { source: 'data:image/png;base64,UUUU' };
  assert.deepEqual(planAssetReplace(control, 'image', 'unused', { source: PNG_NEW }).staleBakes, []);
  assert.equal(rebakeOptionsFor({ generated: false }), null);
});

test('a reference location becomes a store path by dropping the storage hops', () => {
  assert.equal(referencePatchPath(['Generators', '_children', 'g', 'assetName']), 'Generators.g.assetName');
  assert.equal(referencePatchPath(['Animations', '_children', 'a', 'targets', '0', 'path']), 'Animations.a.targets.0.path');
});
