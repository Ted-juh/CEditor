import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, '..', 'src', 'CE_Application', 'editor', name), 'utf8');

test('parameter status drag closes its transaction on target changes and teardown', () => {
  const source = read('ParameterStatusEditor.svelte');
  assert.match(source, /import \{ onDestroy \} from 'svelte'/);
  assert.match(source, /if \(selected\?\.id !== previousId\) \{\s*end\(true\)/);
  assert.match(source, /onDestroy\(\(\) => end\(true\)\)/);
  assert.match(source, /onlostpointercapture=\{\(\)=>end\(true\)\}/);
  assert.match(source, /releasePointerCapture\(finishing\.pointerId\)/);
});

test('SVG renderers include component instance identity in local definition ids', () => {
  const ribbon = read('RibbonRenderer.svelte');
  const slider = read('SliderFamilyRenderer.svelte');
  const draw = read('ScriptDrawOverlay.svelte');

  assert.match(ribbon, /const instanceId = \$props\.id\(\)/);
  assert.match(ribbon, /`rib-\$\{instanceId\}-/);
  assert.match(slider, /const sliderInstanceId = \$props\.id\(\)/);
  assert.match(slider, /safeSvgId\(`\$\{control\?\._children\?\.Core\?\.id \?\? 'slider'\}-\$\{sliderInstanceId\}`\)/);
  assert.match(draw, /const instanceId = \$props\.id\(\)/);
  assert.match(draw, /id=\{definitionId\(g\.id\)\}/);
  assert.match(draw, /clip-path=\{`url\(#\$\{boundsClipId\}\)`\}/);
  assert.doesNotMatch(draw, /id=\{g\.id\}/);
});

test('panic feedback timers are owned and cleared by the preview surface', () => {
  const source = read('PanelPreviewSurface.svelte');
  assert.match(source, /const panicFlashTimers = new Map\(\)/);
  assert.match(source, /if \(!surfaceDestroyed\) patchControlSession\(controlId, \{ panicFlash: undefined \}\)/);
  assert.match(source, /for \(const timer of panicFlashTimers\.values\(\)\) clearTimeout\(timer\)/);
});

test('preview teardown stops clocks it started and owns delayed flam timers by pad', () => {
  const source = read('PanelPreviewSurface.svelte');
  assert.match(source, /if \(transportStartedBySurface\) \{[\s\S]*?stopTransport\(\)/);
  assert.match(source, /transportStartedBySurface = true;\s*startTransportWithCountIn/);
  assert.match(source, /const drumTimers = \{\};\s*\/\/ id -> Map\(padId/);
  assert.match(source, /const pendingFlams = drumTimers\[id\]\?\.get\(padId\)/);
  assert.match(source, /clearTimeout\(pending\.timer\)/);
});

test('native preview TextInput owns semantics, focus, and bubbled keys', () => {
  const source = read('PanelPreviewSurface.svelte');
  assert.match(source, /function handleTextFieldKeyDown\(control, event\) \{\s*[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(source, /if \(isTextInputControl\(control\)\) return ''/);
  assert.match(source, /function previewTabIndexFor\(control\)[\s\S]*?if \(isTextInputControl\(control\)\) return undefined/);
});
