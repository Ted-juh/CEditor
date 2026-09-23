// Viewer and colour-picker work crosses browser callbacks that may finish after the user switches
// image, panel, or colour target. The Node suite has no DOM image decoder/native EyeDropper, so
// these tests pin the ownership and generation checks around those asynchronous boundaries.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, '..', 'src', relative), 'utf8');

const editor = read('CE_Application/components/ViewerEditor.svelte');
const tab = read('CE_Application/panels/ViewerTab.svelte');
const chooser = read('CE_Application/components/ColorChooser.svelte');

test('viewer pan and zoom state follows image identity instead of a shifting array index', () => {
  assert.match(editor, /const viewStates = new WeakMap\(\)/);
  assert.match(editor, /const image = images\[idx\]/);
  assert.match(editor, /viewStates\.has\(image\)/);
  assert.match(editor, /viewStates\.get\(image\)/);
  assert.match(editor, /viewStates\.delete\(closingImage\)/);
  assert.doesNotMatch(editor, /viewStates\.delete\(index\)/,
    'closing an earlier tab must not leave every later image carrying the previous index state');
});

test('viewer mutations carry and validate the panel source that initiated them', () => {
  assert.match(editor, /sourceId = null/);
  assert.match(editor, /sourceGeneration = 0/);
  assert.equal(
    (editor.match(/if \(!isCurrentSource\(requestSource\)\) return;/g) ?? []).length,
    2,
    'both FileReader and Image callbacks must refuse a stale panel source',
  );
  assert.match(editor, /onchange\?\.\(nextImages, \{[\s\S]*?sourceId: source\.id,[\s\S]*?sourceGeneration: source\.generation/);

  assert.match(tab, /const panelId = source\?\.sourceId;/);
  assert.match(tab, /const panel = \$activePanel/);
  assert.match(tab, /panelId !== panel\?\.id \|\| source\?\.sourceGeneration !== resetKey/);
  assert.match(tab, /updatePanel\(panelId,/,
    'the write uses the validated captured id instead of looking the active panel up again');
  assert.match(tab, /sourceId=\{\$activePanel\.id\}/);
  assert.match(tab, /sourceGeneration=\{resetKey\}/);
  assert.match(tab, /const panel = untrack\(\(\) => \$activePanel\)/,
    'writing viewer state must not make the reset effect replace every image object');
});

test('switching viewer tabs persists navigation without dirtying the panel', () => {
  const switchTab = editor.slice(editor.indexOf('function switchTab'), editor.indexOf('export function addImage'));
  assert.match(switchTab, /emitChange\(images, index, sourceSnapshot\(\), false\)/);
  assert.match(editor, /documentChanged = true/);
  assert.match(tab, /withViewerActiveIndex\(entry, source\.activeImageIndex\)/,
    'workspace navigation bypasses updatePanel, which always marks a panel modified');
});

test('viewer async work and settings actions stay owned by the mounted viewer instance', () => {
  assert.match(editor, /import \{ onDestroy \} from 'svelte'/);
  assert.match(editor, /let disposed = false/);
  assert.match(editor, /!disposed && source\?\.id === sourceId/);
  assert.match(editor, /onDestroy\(\(\) => \{[\s\S]*?disposed = true;[\s\S]*?pixelRequestGeneration \+= 1;/);
  assert.match(editor, /export function addImage\(\)/);

  const settings = read('CE_Application/components/ViewerSettings.svelte');
  assert.match(settings, /getViewerRef\?\.\(\)\?\.addImage\?\.\(\)/);
  assert.doesNotMatch(settings, /document\.querySelector/,
    'a settings panel must not click an add button belonging to another viewer instance');
});

test('pixel sampling is rebuilt on image/source changes and late decodes cannot publish', () => {
  const effect = editor.slice(editor.indexOf('// Rebuild whenever the selected image'));
  assert.match(effect, /const img = images\[activeImageIndex\]/);
  assert.match(effect, /const requestSource = sourceSnapshot\(\)/);
  assert.match(effect, /const request = \+\+pixelRequestGeneration/);
  assert.match(effect, /request !== pixelRequestGeneration \|\| !isCurrentSource\(requestSource\)/);
  assert.match(effect, /images\[activeImageIndex\] !== img/);
  assert.match(effect, /pixelCanvasFor = \{[\s\S]*?image: img,[\s\S]*?sourceGeneration:/);
  assert.match(effect, /return \(\) => \{[\s\S]*?pixelRequestGeneration \+= 1;[\s\S]*?el\.onload = null/);
});

test('ColorChooser suppresses only an exact prop echo and rejects a stale eyedropper result', () => {
  assert.match(chooser, /let expectedPropEcho = null/);
  assert.match(chooser, /if \(expectedPropEcho === propEcho\)/);
  assert.match(chooser, /expectedPropEcho = null;[\s\S]*?syncFromHex\(c\)/,
    'a nonmatching external value clears the expectation and is applied');
  assert.doesNotMatch(chooser, /ignoreNextPropChange/);

  const picker = chooser.slice(chooser.indexOf('async function handleEyedropper'));
  assert.match(picker, /const request = \+\+eyedropperRequest/);
  assert.match(picker, /const targetColor =/);
  assert.match(picker, /const targetAlpha =/);
  assert.match(picker, /const targetChange = onchange/);
  assert.match(picker, /if \(request !== eyedropperRequest\) return/);
  assert.match(picker, /targetChange !== onchange/);
  assert.match(picker, /targetColor !== String\(color/);
  assert.match(picker, /targetAlpha !== alphaToHex\(propAlpha\)/);
  assert.match(chooser, /onDestroy\(\(\) => \{ eyedropperRequest \+= 1; \}\)/);
});
