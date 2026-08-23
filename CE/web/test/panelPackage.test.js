// panelPackage.test.js — a panel you can hand to somebody else.
//
// THE DEFECT. A `.cepanel` holds ABSOLUTE PATHS to its images, so sending one to another person
// sends a panel with no pictures. It looks perfect on the author's disk, which is exactly why it
// survived this long: the failure only exists on the second computer, and the author is the one
// person who never sees it.
//
// The round trip below is the whole contract — package a panel, open it somewhere else, and get the
// same panel with working references. Everything else here is a way that round trip can be quietly
// wrong: an image referenced twice stored twice, a dangling `asset:` that renders blank, a package
// from a newer build half-opening.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PANEL_PACKAGE_FORMAT,
  PANEL_PACKAGE_VERSION,
  assetIdFor,
  collectPanelAssetRefs,
  createPanelPackage,
  openPanelPackage,
  panelAssetPaths,
  validatePanelPackage,
} from '../src/CE_Application/utils/panelPackage.js';

/** A panel with all three kinds of outside reference. */
function panelWithAssets() {
  const control = (id, imageSrc, fontPath) => ({
    _children: {
      Core: { id, name: id },
      Background: { _children: { Fill: { imageSrc: imageSrc ?? '' } } },
      Text: { path: fontPath ?? '' },
    },
  });
  return {
    name: 'Shareable',
    bgImage: 'C:/Users/ted/pics/backdrop.png',
    controls: [
      control('knob1', 'C:/Users/ted/pics/knob.png', ''),
      control('knob2', 'C:/Users/ted/pics/knob.png', ''),   // the SAME image, twice
      control('label1', '', 'C:/Windows/Fonts/custom.ttf'),
      control('plain', '', ''),
    ],
  };
}

const FILES = {
  'C:/Users/ted/pics/backdrop.png': 'YmFja2Ryb3AtYnl0ZXM=',
  'C:/Users/ted/pics/knob.png': 'a25vYi1ieXRlcw==',
  'C:/Windows/Fonts/custom.ttf': 'Zm9udC1ieXRlcw==',
};
const readAsset = async (path) => FILES[path] ?? null;

test('every outside reference a panel can hold is found', () => {
  // One collector, because a new image field added to a section would otherwise be embedded by the
  // packager and missed by the opener — a package that works until it doesn't.
  const refs = collectPanelAssetRefs(panelWithAssets());
  assert.deepEqual(refs.map((r) => r.kind).sort(),
    ['controlFont', 'controlImage', 'controlImage', 'panelBackground']);
  assert.deepEqual(panelAssetPaths(panelWithAssets()).sort(), Object.keys(FILES).sort());
});

test('a panel with no assets collects nothing', () => {
  assert.deepEqual(collectPanelAssetRefs({ controls: [{ _children: { Core: { id: 'a' } } }] }), []);
  assert.deepEqual(collectPanelAssetRefs({}), []);
});

test('package then open: the panel arrives with working references', async () => {
  // THE CONTRACT. Everything else in this file is a way this can be subtly wrong.
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset, now: '2026-08-23T00:00:00Z' });
  assert.equal(pkg.format, PANEL_PACKAGE_FORMAT);
  assert.deepEqual(pkg.missing, []);
  assert.ok(validatePanelPackage(pkg).ok, JSON.stringify(validatePanelPackage(pkg).issues));

  // Open it somewhere the original paths do not exist — the whole point.
  const written = [];
  const opened = await openPanelPackage(pkg, {
    writeAsset: async (id, data) => { written.push([id, data]); return `/other/machine/${id}`; },
  });

  assert.ok(opened.ok);
  assert.deepEqual(opened.unresolved, []);
  assert.match(opened.panel.bgImage, /^\/other\/machine\//);
  const [k1, k2] = opened.panel.controls;
  assert.match(k1._children.Background._children.Fill.imageSrc, /^\/other\/machine\//);
  assert.equal(k1._children.Background._children.Fill.imageSrc,
    k2._children.Background._children.Fill.imageSrc,
    'two controls sharing an image must still share it after a round trip');
  assert.match(opened.panel.controls[2]._children.Text.path, /^\/other\/machine\//);
});

test('an image used twice is stored once', async () => {
  // Content-addressed, so a panel with forty copies of one background is not forty copies of it.
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset });
  assert.equal(Object.keys(pkg.assets).length, 3, 'three distinct files, four references');
});

test('the same panel packages to the same asset ids twice', async () => {
  // Otherwise two packages of an unchanged panel do not diff, and nobody can review a change to one.
  const a = await createPanelPackage(panelWithAssets(), { readAsset, now: 'fixed' });
  const b = await createPanelPackage(panelWithAssets(), { readAsset, now: 'fixed' });
  assert.deepEqual(Object.keys(a.assets).sort(), Object.keys(b.assets).sort());
  assert.equal(JSON.stringify(a.panel), JSON.stringify(b.panel));
});

test('asset ids keep the extension, because a reader has to know what the bytes are', () => {
  assert.match(assetIdFor('x', 'thing.png'), /\.png$/);
  assert.match(assetIdFor('x', 'C:/a/b/FONT.TTF'), /\.ttf$/);
  assert.ok(!assetIdFor('x', 'no-extension').includes('.'));
  assert.notEqual(assetIdFor('one', 'a.png'), assetIdFor('two', 'a.png'), 'different bytes, different id');
});

test('the source panel is not mutated by packaging it', async () => {
  // A packager that rewrote the live document would replace the author's real paths with `asset:`
  // ids in the panel they are still editing.
  const original = panelWithAssets();
  const before = JSON.stringify(original);
  await createPanelPackage(original, { readAsset });
  assert.equal(JSON.stringify(original), before);
});

test('a file that cannot be read is reported, not fatal', async () => {
  // An author who moved one image should still get a package. Refusing would mean a single stale
  // path blocks sharing an otherwise complete panel — and they are the one person who can find it.
  const pkg = await createPanelPackage(panelWithAssets(), {
    readAsset: async (p) => (p.endsWith('knob.png') ? null : FILES[p] ?? null),
  });
  assert.deepEqual(pkg.missing, ['C:/Users/ted/pics/knob.png']);
  assert.equal(pkg.panel.controls[0]._children.Background._children.Fill.imageSrc,
    'C:/Users/ted/pics/knob.png', 'an unreadable asset keeps its original path');
  const v = validatePanelPackage(pkg);
  assert.ok(v.ok, 'a missing asset is a warning, not a refusal');
  assert.ok(v.warnings.some((w) => w.includes('knob.png')));
});

test('a dangling asset reference is refused', async () => {
  // The failure this format exists to prevent, so it fails at open rather than rendering blank.
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset });
  delete pkg.assets[Object.keys(pkg.assets)[0]];
  const v = validatePanelPackage(pkg);
  assert.equal(v.ok, false);
  assert.match(v.issues.join(' '), /not in the package/);
});

test('a package from a newer build is refused, not half-opened', async () => {
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset });
  pkg.formatVersion = PANEL_PACKAGE_VERSION + 1;
  const v = validatePanelPackage(pkg);
  assert.equal(v.ok, false);
  assert.match(v.issues.join(' '), /newer than this build/);
});

test('something that is not a panel package is rejected by format, first', async () => {
  for (const junk of [null, {}, { format: 'ceditor-component', formatVersion: 1 }]) {
    const v = validatePanelPackage(junk);
    assert.equal(v.ok, false);
    assert.match(v.issues[0], /Not a panel package/);
  }
});

test('an asset the opener cannot write leaves a visible gap, not a silent one', async () => {
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset });
  const opened = await openPanelPackage(pkg, { writeAsset: async () => null });
  assert.ok(opened.ok, 'the panel should still open');
  assert.equal(opened.unresolved.length, 3);
  assert.match(opened.panel.bgImage, /^asset:/,
    'an unresolved reference keeps its asset: form, so the gap is legible rather than blank');
});

test('an unreferenced asset is a warning — a package should not carry dead weight', async () => {
  const pkg = await createPanelPackage(panelWithAssets(), { readAsset });
  pkg.assets['aDEADBEEF.png'] = { id: 'aDEADBEEF.png', data: 'eA==', originalPath: '', bytes: 1 };
  const v = validatePanelPackage(pkg);
  assert.ok(v.ok, 'still openable');
  assert.match(v.warnings.join(' '), /nothing references/);
});
