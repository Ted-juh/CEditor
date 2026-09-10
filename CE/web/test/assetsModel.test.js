// assetsModel.test.js — the Assets tab's model.
//
// The tab's reason to exist is a defect the application ships and never checks: a filmstrip whose
// length along the frame axis does not divide evenly by its frame count renders frames that drift,
// because `InteractivePartRenderer` positions them proportionally rather than in pixels. So the
// headline tests here are the arithmetic ones — the division check, the repair it offers, and a
// guard that the preview's CSS is still the same CSS the renderer emits. A preview that computed
// tidy pixel offsets would show a clean strip and ship a broken one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ASSET_KINDS,
  ASSET_MAP_BY_KIND,
  ASSET_FIELD_GROUPS,
  PACKAGE_POLICY_FIELDS,
  assetKey,
  parseAssetKey,
  assetPath,
  listAssets,
  findAsset,
  describeAsset,
  clampFrameIndex,
  stepFrame,
  framePage,
  frameGrid,
  frameBackground,
  frameDivision,
  divisorsOf,
  suggestFrameCounts,
  frameCountPatch,
  imageSizeCheck,
  assetSizePatch,
  assetFieldGroups,
  allAssetFieldLabels,
  estimateSourceBytes,
  formatBytes,
  sourceLabel,
  guessFrameCount,
  importedAsset,
  safeAssetFileName,
  dataUrlExtension,
  assetFileName,
} from '../src/CE_Application/utils/assetsModel.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const RENDERER = fileURLToPath(new URL('../src/CE_Application/editor/InteractivePartRenderer.svelte', import.meta.url));

const filmstrip = (over = {}) => ({
  _type: 'FilmstripAsset',
  name: 'knobStrip',
  source: 'data:image/png;base64,AAAA',
  frameCount: 128,
  frameWidth: 34,
  frameHeight: 7,
  orientation: 'vertical',
  interpolation: 'nearest',
  valueSource: 'mainValue',
  package: true,
  ...over,
});

const image = (over = {}) => ({
  _type: 'ImageAsset',
  name: 'knobFace',
  source: 'data:image/png;base64,AAAA',
  width: 64,
  height: 64,
  package: true,
  ...over,
});

// --- The renderer mirror ----------------------------------------------------

test('frameBackground still matches the CSS InteractivePartRenderer emits', () => {
  const source = readFileSync(RENDERER, 'utf8');
  // If either of these stops matching, the renderer changed how it slices and the preview is now
  // lying about what the canvas will do. Fix frameBackground, do not delete the assertion.
  assert.ok(source.includes('background-size:${frameCount * 100}% 100%'), 'horizontal size rule');
  assert.ok(source.includes('background-size:100% ${frameCount * 100}%'), 'vertical size rule');
  assert.ok(
    source.includes('(frameIndex / (frameCount - 1)) * 100'),
    'proportional frame offset — the whole reason the divisibility check exists'
  );
});

test('frameBackground positions a vertical strip proportionally', () => {
  assert.deepEqual(frameBackground({ frameCount: 4, frameIndex: 0 }), {
    backgroundSize: '100% 400%',
    backgroundPosition: '0% 0%',
  });
  assert.deepEqual(frameBackground({ frameCount: 4, frameIndex: 3 }), {
    backgroundSize: '100% 400%',
    backgroundPosition: '0% 100%',
  });
});

test('frameBackground swaps the axes for a horizontal strip', () => {
  const css = frameBackground({ frameCount: 5, frameIndex: 2, orientation: 'horizontal' });
  assert.equal(css.backgroundSize, '500% 100%');
  assert.equal(css.backgroundPosition, '50% 0%');
});

test('a one-frame strip does not divide by zero', () => {
  assert.deepEqual(frameBackground({ frameCount: 1, frameIndex: 0 }), {
    backgroundSize: '100% 100%',
    backgroundPosition: '0% 0%',
  });
});

// --- The check --------------------------------------------------------------

test('frameDivision reports a clean strip', () => {
  const check = frameDivision({ width: 34, height: 896, frameCount: 128 });
  assert.equal(check.axis, 'height');
  assert.equal(check.total, 896);
  assert.equal(check.framePixels, 7);
  assert.equal(check.remainder, 0);
  assert.equal(check.divides, true);
  assert.equal(check.known, true);
});

test('frameDivision catches the drift', () => {
  const check = frameDivision({ width: 34, height: 900, frameCount: 128 });
  assert.equal(check.divides, false);
  assert.equal(check.remainder, 900 % 128);
  assert.ok(Math.abs(check.framePixels - 7.03125) < 1e-9);
});

test('frameDivision measures the other axis for a horizontal strip', () => {
  const check = frameDivision({ width: 900, height: 34, frameCount: 128, orientation: 'horizontal' });
  assert.equal(check.axis, 'width');
  assert.equal(check.total, 900);
  assert.equal(check.divides, false);
});

test('an unmeasured strip reports unknown rather than passing', () => {
  const check = frameDivision({ width: 0, height: 0, frameCount: 128 });
  assert.equal(check.known, false);
  assert.equal(check.divides, false, 'not measured is not the same as not broken');
});

test('more frames than pixels is called out separately', () => {
  const check = frameDivision({ width: 10, height: 64, frameCount: 128 });
  assert.equal(check.overSliced, true);
  assert.equal(check.divides, false);
});

// --- The repair -------------------------------------------------------------

test('divisorsOf enumerates in order and includes both ends', () => {
  assert.deepEqual(divisorsOf(36), [1, 2, 3, 4, 6, 9, 12, 18, 36]);
  assert.deepEqual(divisorsOf(1), [1]);
  assert.deepEqual(divisorsOf(0), []);
  assert.deepEqual(divisorsOf(-4), []);
});

test('divisorsOf handles a perfect square without repeating the root', () => {
  assert.deepEqual(divisorsOf(49), [1, 7, 49]);
});

test('suggestFrameCounts offers the nearest counts that actually divide', () => {
  const offers = suggestFrameCounts(900, 128, 3);
  assert.deepEqual(offers, [150, 100, 90]);
  for (const offer of offers) assert.equal(900 % offer, 0);
});

test('suggestFrameCounts never offers the count already in use', () => {
  assert.ok(!suggestFrameCounts(896, 128, 5).includes(128));
});

test('the true count is the first offer when the count was simply mistyped', () => {
  // A 32-frame strip of 96px squares with 30 typed in. 32 is both the nearest divisor and correct.
  assert.equal(suggestFrameCounts(3072, 30, 3)[0], 32);
});

test('an absurd divisor is not offered, however near it is', () => {
  // 3076 = 2^2 x 769. Its divisors are 1, 2, 4, 769, 1538, 3076: "use 4" would turn a 32-frame
  // knob into a four-frame one on one click, which is arithmetic rather than a repair.
  assert.deepEqual(suggestFrameCounts(3076, 32, 3), []);
});

test('a prime-length strip has nothing to offer at all', () => {
  assert.deepEqual(suggestFrameCounts(907, 128, 3), []);
});

test('frameCountPatch moves the frame sizes with the count', () => {
  const patch = frameCountPatch({ name: 'knobStrip', frameCount: 100, width: 34, height: 900 });
  assert.equal(patch['Assets.filmstrips.knobStrip.frameCount'], 100);
  assert.equal(patch['Assets.filmstrips.knobStrip.frameHeight'], 9);
  assert.equal(patch['Assets.filmstrips.knobStrip.frameWidth'], 34);
});

test('frameCountPatch records the strip size the exporter reads and nothing writes', () => {
  const patch = frameCountPatch({ name: 'knobStrip', frameCount: 100, width: 34, height: 900 });
  assert.equal(patch['Assets.filmstrips.knobStrip.width'], 34);
  assert.equal(patch['Assets.filmstrips.knobStrip.height'], 900);
});

test('frameCountPatch divides the other axis for a horizontal strip', () => {
  const patch = frameCountPatch({ name: 's', frameCount: 10, width: 900, height: 34, orientation: 'horizontal' });
  assert.equal(patch['Assets.filmstrips.s.frameWidth'], 90);
  assert.equal(patch['Assets.filmstrips.s.frameHeight'], 34);
});

test('frameCountPatch leaves the sizes alone when nothing was measured', () => {
  const patch = frameCountPatch({ name: 's', frameCount: 10 });
  assert.deepEqual(Object.keys(patch), ['Assets.filmstrips.s.frameCount']);
});

test('frameCountPatch refuses an image', () => {
  assert.deepEqual(frameCountPatch({ kind: 'image', name: 'x', frameCount: 4 }), {});
});

// --- The stage page ---------------------------------------------------------

test('framePage shows the page the current frame falls in', () => {
  const page = framePage({ frameCount: 128, frameIndex: 41, capacity: 16 });
  assert.equal(page.start, 32);
  assert.equal(page.indices.length, 16);
  assert.ok(page.indices.includes(41));
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 8);
});

test('framePage holds still while you step inside it', () => {
  const a = framePage({ frameCount: 128, frameIndex: 32, capacity: 16 });
  const b = framePage({ frameCount: 128, frameIndex: 47, capacity: 16 });
  assert.equal(a.start, b.start, 'stepping within a page must not reshuffle the grid');
  assert.equal(framePage({ frameCount: 128, frameIndex: 48, capacity: 16 }).start, 48);
});

test('framePage stops at both ends instead of running off', () => {
  const first = framePage({ frameCount: 128, frameIndex: 0, capacity: 16 });
  assert.equal(first.start, 0);
  assert.equal(first.atStart, true);
  const last = framePage({ frameCount: 130, frameIndex: 129, capacity: 16 });
  assert.equal(last.indices.at(-1), 129);
  assert.equal(last.indices.length, 2, 'a short last page is short, not padded');
  assert.equal(last.atEnd, true);
});

test('framePage never asks for more frames than exist', () => {
  const page = framePage({ frameCount: 3, frameIndex: 1, capacity: 16 });
  assert.deepEqual(page.indices, [0, 1, 2]);
  assert.equal(page.pageCount, 1);
});

// --- The stage grid ---------------------------------------------------------

test('frameGrid tiles the stage instead of leaving a short row in it', () => {
  // The shape a knob strip actually has, and a strip too long to show whole: one row of 132px boxes
  // shows five and wastes most of the width, so two rows of ten wins.
  const grid = frameGrid({ width: 710, height: 132, aspect: 1, want: 24 });
  assert.equal(grid.rows, 2);
  assert.equal(grid.boxHeight, 64);
  assert.equal(grid.capacity, 20);
  assert.ok(grid.rows * (grid.boxHeight + 3) - 3 <= 132, 'the rows must fit the stage');
  assert.ok(grid.cols * (grid.boxWidth + 3) - 3 <= 710, 'the columns must fit the stage');
});

test('a short strip gets big frames rather than small ones in a corner', () => {
  const four = frameGrid({ width: 710, height: 132, aspect: 1, want: 4 });
  assert.equal(four.boxHeight, 132, 'four frames should fill the height');
  assert.ok(four.capacity >= 4);
  const eight = frameGrid({ width: 710, height: 132, aspect: 1, want: 8 });
  assert.ok(eight.capacity >= 8, 'all eight should be on screen');
  assert.ok(eight.boxHeight >= 48, `and still readable: ${eight.boxHeight}px`);
});

test('frameGrid keeps a wide frame wide instead of stretching it', () => {
  const grid = frameGrid({ width: 710, height: 132, aspect: 34 / 7, want: 24 });
  assert.ok(grid.rows > 1, 'a wide frame should wrap into rows rather than fill one');
  assert.ok(Math.abs(grid.boxWidth / grid.boxHeight - 34 / 7) < 0.25, 'the aspect must survive');
  assert.ok(grid.cols * (grid.boxWidth + 3) - 3 <= 710);
});

test('frameGrid gives a tall frame one big row', () => {
  const grid = frameGrid({ width: 710, height: 132, aspect: 0.5, want: 24 });
  assert.equal(grid.rows, 1);
  assert.equal(grid.boxHeight, 132);
});

test('frameGrid rejects boxes too small to be a picture', () => {
  const grid = frameGrid({ width: 710, height: 132, aspect: 1, want: 200, minArea: 2400 });
  assert.ok(grid.boxWidth * grid.boxHeight >= 2400, `${grid.boxWidth}x${grid.boxHeight} is a swatch, not a frame`);
});

test('frameGrid still shows something when a frame cannot fit at its true shape', () => {
  const grid = frameGrid({ width: 120, height: 132, aspect: 40, want: 24 });
  assert.equal(grid.capacity, 1);
  assert.ok(grid.boxWidth <= 120);
  assert.ok(grid.boxHeight >= 20);
});

test('frameGrid never returns a box below the floor', () => {
  for (const aspect of [0.05, 0.5, 1, 3, 20]) {
    const grid = frameGrid({ width: 300, height: 90, aspect, want: 24, min: 20 });
    assert.ok(grid.boxWidth >= 20 && grid.boxHeight >= 20, `aspect ${aspect} produced ${grid.boxWidth}x${grid.boxHeight}`);
  }
});

test('clampFrameIndex and stepFrame stay inside the strip', () => {
  assert.equal(clampFrameIndex(-4, 10), 0);
  assert.equal(clampFrameIndex(99, 10), 9);
  assert.equal(stepFrame(9, 1, 10), 9);
  assert.equal(stepFrame(0, -1, 10), 0);
  assert.equal(stepFrame(4, 3, 10), 7);
});

// --- The library ------------------------------------------------------------

test('listAssets flattens both maps into one sorted library', () => {
  const assets = {
    images: { track: image({ name: 'track' }), knobFace: image() },
    filmstrips: { knobStrip: filmstrip() },
  };
  assert.deepEqual(listAssets(assets).map((entry) => entry.name), ['knobFace', 'knobStrip', 'track']);
  assert.deepEqual(listAssets(assets).map((entry) => entry.kind), ['image', 'filmstrip', 'image']);
});

test('an image and a filmstrip of the same name stay separable', () => {
  const assets = { images: { knob: image({ name: 'knob' }) }, filmstrips: { knob: filmstrip({ name: 'knob' }) } };
  const keys = listAssets(assets).map((entry) => entry.key);
  assert.equal(new Set(keys).size, 2);
  assert.equal(findAsset(assets, 'image:knob').kind, 'image');
  assert.equal(findAsset(assets, 'filmstrip:knob').kind, 'filmstrip');
});

test('a key round-trips even when the name contains a colon', () => {
  assert.deepEqual(parseAssetKey(assetKey('image', 'odd:name')), { kind: 'image', name: 'odd:name' });
  assert.equal(parseAssetKey('nonsense'), null);
  assert.equal(parseAssetKey('fonts:x'), null);
});

test('assetPath writes where the editor writes', () => {
  assert.equal(assetPath('filmstrip', 'knobStrip', 'frameCount'), 'Assets.filmstrips.knobStrip.frameCount');
  assert.equal(assetPath('image', 'knobFace'), 'Assets.images.knobFace');
  assert.equal(assetPath('fonts', 'x', 'y'), '');
});

test('listAssets ignores entries that are not assets', () => {
  assert.deepEqual(listAssets({ images: { broken: null, gone: 'nope' }, filmstrips: {} }), []);
  assert.deepEqual(listAssets(null), []);
});

// --- Descriptors and fields -------------------------------------------------

test('every field the settings column draws is read back by the descriptor', () => {
  const samples = { image: image(), filmstrip: filmstrip() };
  for (const kind of ASSET_KINDS) {
    const described = describeAsset(kind, 'sample', samples[kind]);
    for (const group of assetFieldGroups(kind)) {
      for (const field of group.fields) {
        assert.notEqual(
          described[field.key],
          undefined,
          `${kind}.${field.key} is drawn by the tab but not read by describeAsset`
        );
      }
    }
  }
});

test('the package policy fields are the ones the section actually has', () => {
  const policy = SECTION_DEFAULTS.Assets.packagePolicy;
  for (const field of PACKAGE_POLICY_FIELDS) {
    assert.ok(Object.hasOwn(policy, field.key), `packagePolicy.${field.key} does not exist`);
  }
  assert.equal(PACKAGE_POLICY_FIELDS.length, Object.keys(policy).length, 'a policy setting has no row');
});

test('the two asset maps this tab edits are the ones the section defines', () => {
  for (const kind of ASSET_KINDS) {
    assert.ok(Object.hasOwn(SECTION_DEFAULTS.Assets, ASSET_MAP_BY_KIND[kind]));
  }
});

test('field labels are collected for the day the panel rows come out', () => {
  const labels = allAssetFieldLabels();
  assert.ok(labels.includes('Count'));
  assert.ok(labels.includes('Axis'));
  assert.ok(labels.includes('Embed assets'));
  assert.equal(new Set(labels).size, labels.length, 'duplicate labels would double a search hit');
});

test('every field group carries a hint', () => {
  for (const kind of ASSET_KINDS) {
    for (const group of ASSET_FIELD_GROUPS[kind]) {
      assert.ok(group.title, 'a group without a title has no header to sit under');
      for (const field of group.fields) assert.ok(field.hint, `${kind}.${field.key} has no hint`);
    }
  }
});

test('describeAsset defaults a filmstrip that stores almost nothing', () => {
  const described = describeAsset('filmstrip', 's', { _type: 'FilmstripAsset' });
  assert.equal(described.frameCount, 1);
  assert.equal(described.orientation, 'vertical');
  assert.equal(described.interpolation, 'nearest');
  assert.equal(described.valueSource, 'mainValue');
  assert.equal(described.package, true, 'package defaults on, as the editor writes it');
  assert.equal(described.hasSource, false);
});

// --- Image size -------------------------------------------------------------

test('imageSizeCheck notices a stored size that no longer matches', () => {
  const check = imageSizeCheck({ stored: { width: 64, height: 64 }, measured: { width: 512, height: 512 } });
  assert.equal(check.known, true);
  assert.equal(check.recorded, true);
  assert.equal(check.matches, false);
});

test('imageSizeCheck does not claim agreement before it has measured', () => {
  const check = imageSizeCheck({ stored: { width: 64, height: 64 }, measured: { width: 0, height: 0 } });
  assert.equal(check.known, false);
  assert.equal(check.matches, false);
});

test('assetSizePatch writes both dimensions or nothing', () => {
  assert.deepEqual(assetSizePatch({ kind: 'image', name: 'a', width: 12, height: 8 }), {
    'Assets.images.a.width': 12,
    'Assets.images.a.height': 8,
  });
  assert.deepEqual(assetSizePatch({ kind: 'image', name: 'a', width: 0, height: 8 }), {});
});

// --- Sizes ------------------------------------------------------------------

test('estimateSourceBytes reads the base64 length and ignores anything else', () => {
  assert.equal(estimateSourceBytes('data:image/png;base64,AAAAAAAA'), 6);
  assert.equal(estimateSourceBytes('https://example.invalid/x.png'), 0);
  assert.equal(estimateSourceBytes(null), 0);
});

test('formatBytes stays readable at both ends', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(200), '200 B', 'a small asset must not read as 0 KB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(200 * 1024 * 1024), '200 MB');
});

test('sourceLabel says where the picture came from', () => {
  assert.equal(sourceLabel(describeAsset('image', 'a', image({ sourceFileName: 'knob.png' }))), 'knob.png');
  assert.equal(sourceLabel(describeAsset('filmstrip', 'a', filmstrip({ generated: true }))), 'baked');
  assert.equal(sourceLabel(describeAsset('image', 'a', image())), 'png data');
  assert.equal(sourceLabel(describeAsset('image', 'a', image({ source: '' }))), 'no source');
});

// --- Import -----------------------------------------------------------------

test('guessFrameCount reads square frames off the picture', () => {
  assert.equal(guessFrameCount({ width: 128, height: 128 * 31 }), 31);
  assert.equal(guessFrameCount({ width: 64 * 12, height: 64, orientation: 'horizontal' }), 12);
});

test('guessFrameCount rounds rather than refusing, because the check bar is right underneath', () => {
  assert.equal(guessFrameCount({ width: 34, height: 900 }), 26);
  assert.equal(frameDivision({ width: 34, height: 900, frameCount: 26 }).divides, false);
});

test('guessFrameCount says one frame for something that is not a strip', () => {
  assert.equal(guessFrameCount({ width: 128, height: 128 }), 1);
  assert.equal(guessFrameCount({ width: 0, height: 0 }), 1);
});

test('an imported filmstrip is the record the editor already writes', () => {
  const asset = importedAsset({
    kind: 'filmstrip', name: 'knobStrip', source: 'data:image/png;base64,AA',
    width: 128, height: 128 * 31, fileName: 'knob_31.png',
  });
  assert.equal(asset._type, 'FilmstripAsset');
  assert.equal(asset.frameCount, 31);
  assert.equal(asset.frameWidth, 128);
  assert.equal(asset.frameHeight, 128);
  assert.equal(asset.orientation, 'vertical');
  assert.equal(asset.package, true);
  assert.equal(asset.sourceFileName, 'knob_31.png');
});

test('an imported image records its size and nothing about frames', () => {
  const asset = importedAsset({ kind: 'image', name: 'face', source: 'data:image/png;base64,AA', width: 64, height: 32 });
  assert.equal(asset._type, 'ImageAsset');
  assert.equal(asset.width, 64);
  assert.equal(asset.height, 32);
  assert.equal(asset.frameCount, undefined);
});

test('file names survive the trip to disk', () => {
  assert.equal(safeAssetFileName('Knob Strip 128!'), 'knob-strip-128');
  assert.equal(safeAssetFileName('   '), 'asset');
  assert.equal(dataUrlExtension('data:image/jpeg;base64,AA'), 'jpg');
  assert.equal(dataUrlExtension('nothing'), 'png');
  assert.equal(assetFileName(describeAsset('filmstrip', 'Knob Strip', filmstrip())), 'knob-strip.png');
});
