// panelSharing.test.js — the editor half of packaging, which is where the format meets the bridge.
//
// `panelPackage.js` is filesystem-free and tested on its own. This is the part that supplies its
// `readAsset`/`writeAsset`, and the interesting thing about it is how little it needed: reading is
// `fileCache`, which already turns a path into a data URL for the WebView, and writing turns out not
// to be needed at all because the renderer accepts `data:` URLs wherever it accepts a path.
//
// So the tests here are about the seams, not the format: that packaging waits for asynchronous
// assets instead of racing them, that a file the backend never answers for times out into `missing`
// rather than hanging the export, and that an opened panel is genuinely self-contained.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fileCache } from '../src/CE_Application/stores/fileCache.js';
import {
  openSharedPanel,
  packagePanelForSharing,
  panelPackageFile,
} from '../src/CE_Application/stores/panelSharing.js';

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/CE_Application/stores/panelSharing.js'), 'utf8');

function panelWith(paths) {
  return {
    name: 'Shared',
    bgImage: paths.bg ?? '',
    controls: [{
      _children: {
        Core: { id: 'k1', name: 'k1' },
        Background: { _children: { Fill: { imageSrc: paths.knob ?? '' } } },
      },
    }],
  };
}

test('a panel whose assets are already cached packages in one pass', async () => {
  // The common case: the panel has been on screen, so fileCache already holds every image.
  fileCache.set({
    'C:/pics/bg.png': 'data:image/png;base64,Ymc=',
    'C:/pics/knob.png': 'data:image/png;base64,aw==',
  });

  const result = await packagePanelForSharing(panelWith({ bg: 'C:/pics/bg.png', knob: 'C:/pics/knob.png' }),
    { name: 'My Panel', author: 'Ted' });

  assert.ok(result.ok, JSON.stringify(result.issues));
  assert.equal(result.assetCount, 2);
  assert.deepEqual(result.missing, []);
  assert.equal(result.envelope.metadata.name, 'My Panel');
  assert.equal(result.envelope.metadata.author, 'Ted');
  assert.match(result.envelope.panel.bgImage, /^asset:/, 'the path must be replaced by a package reference');
});

test('an asset the backend never answers for times out into missing, not into a hang', async () => {
  // Without the timeout this awaits forever and the export never returns — the failure mode where a
  // user concludes the app is broken rather than that one file is.
  fileCache.set({});
  const result = await packagePanelForSharing(panelWith({ bg: 'C:/pics/gone.png' }));
  assert.ok(result.ok, 'one unreadable asset must not fail the whole package');
  assert.deepEqual(result.missing, ['C:/pics/gone.png']);
  assert.equal(result.envelope.panel.bgImage, 'C:/pics/gone.png', 'the original path is left alone');
});

test('the dev-mode path fallback is never mistaken for image bytes', async () => {
  // Found by the timeout test above failing for the wrong reason, and worth its own case because it
  // is silent: with no JUCE backend, fileCache.loadFile stores the PATH under the path so a view can
  // try it as a URL. Packaging read that back and embedded the string "C:/pics/x.png" as if it were
  // the image — a package that validates, opens, and shows nothing at all.
  fileCache.set({ 'C:/pics/bg.png': 'C:/pics/bg.png' });
  const result = await packagePanelForSharing(panelWith({ bg: 'C:/pics/bg.png' }));
  assert.equal(result.assetCount, 0, 'a path is not bytes and must not be embedded as if it were');
  assert.deepEqual(result.missing, ['C:/pics/bg.png']);
});

test('package then open: the panel comes back self-contained', async () => {
  fileCache.set({ 'C:/pics/bg.png': 'data:image/png;base64,Ymc=' });
  const { envelope } = await packagePanelForSharing(panelWith({ bg: 'C:/pics/bg.png' }));

  const opened = await openSharedPanel(envelope);
  assert.ok(opened.ok);
  assert.deepEqual(opened.unresolved, []);
  assert.equal(opened.panel.bgImage, 'data:image/png;base64,Ymc=',
    'the asset should come back inline, so the panel needs no companion folder');
  assert.ok(!opened.panel.bgImage.includes('C:/'), 'and must not point at the original machine');
});

test('opening something that is not a package is refused with reasons', async () => {
  const opened = await openSharedPanel({ format: 'nope' });
  assert.equal(opened.ok, false);
  assert.equal(opened.panel, null);
  assert.match(opened.issues.join(' '), /Not a panel package/);
});

test('the saved file has a sensible name and is readable JSON', async () => {
  fileCache.set({});
  const { envelope } = await packagePanelForSharing(panelWith({}), { name: 'GAIA: Filter/Bank' });
  const file = panelPackageFile(envelope);
  assert.equal(file.fileName, 'GAIA_ Filter_Bank.cepanelpkg', 'path-illegal characters must be replaced');
  assert.doesNotThrow(() => JSON.parse(file.text));
  assert.ok(file.text.endsWith('\n'), 'a text file should end with a newline');
});

test('reading goes through fileCache rather than a second reader', () => {
  // Two readers would mean two caches and two answers for "what is at this path". The bridge call
  // itself is deliberately not made here.
  assert.ok(SOURCE.includes("from './fileCache.js'"), 'packaging should reuse the existing file cache');
  assert.ok(!SOURCE.includes('requestFileData'), 'it should not talk to the bridge directly');
});

test('opening writes nothing to disk', () => {
  // The design choice worth pinning: writeAsset returns the data URL unchanged. If someone later
  // makes it write temp files, an opened panel starts depending on a folder again — which is the
  // defect this whole format exists to remove.
  assert.match(SOURCE, /writeAsset: async \(id, data\) => data \?\? null/,
    'openSharedPanel must return the embedded data as-is, not write it out');
});
