import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render } from 'svelte/server';

import PixelDisplayRenderer from '../src/CE_Application/editor/PixelDisplayRenderer.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, '..', 'src', 'CE_Application', 'editor', 'PixelDisplayRenderer.svelte'), 'utf8',
);

const control = {
  _children: {
    Core: { id: 'pixel-display', controlType: 'PixelDisplay' },
    Pixel: { pixelsW: 32, pixelsH: 16, elements: [] },
  },
};

test('PixelDisplayRenderer has a server lifecycle path', () => {
  const html = render(PixelDisplayRenderer, {
    props: { control, allControls: [control], width: 160, height: 80 },
  }).body;
  assert.match(html, /class="pixel-surface\b/);
});

test('source controls are indexed once instead of rescanned for every pixel element field', () => {
  assert.match(source, /let controlsById = \$derived\.by\(\(\) => \{/);
  assert.match(source, /index\.set\(id, candidate\)/);
  assert.match(source, /const ctrl = controlsById\.get\(id\)/);
  assert.doesNotMatch(source, /Array\.isArray\(allControls\)[\s\S]{0,100}\.find\(/);
});

test('drag and resize listeners share blur, destroy, and SSR-safe cleanup paths', () => {
  assert.match(source, /window\.addEventListener\('blur', endElementDrag\)/);
  assert.match(source, /window\.addEventListener\('blur', endElementResize\)/);
  assert.match(source, /function endElementDrag\(\) \{[\s\S]*?typeof window !== 'undefined'/);
  assert.match(source, /function endElementResize\(\) \{[\s\S]*?typeof window !== 'undefined'/);
  assert.match(source, /onDestroy\(\(\) => \{ endElementDrag\(\); endElementResize\(\); \}\)/);
});

test('discrete display changes do not redraw the dot canvas at refresh rate', () => {
  assert.match(source, /let continuousMotion = \$derived\(animActive \|\| widgetMotion\)/);
  assert.match(source, /const runDiscrete = clockActive \|\| \(!reduced && discreteMotion\)/);
  assert.match(source, /const timer = setInterval\(\(\) => \{ frameTime = Date\.now\(\) - origin; \}, 100\)/);
  assert.match(source, /return \(\) => clearInterval\(timer\)/);
});

test('blink-off keeps animation caches and continuous widget motion alive', () => {
  const animBlock = source.slice(source.indexOf('let animElements'), source.indexOf('// Layout transition'));
  assert.match(animBlock, /visibleNow: el\?\.blink !== true \|\| blinkPhase/);
  assert.doesNotMatch(animBlock, /blink.*continue/);

  const motionBlock = source.slice(source.indexOf('let widgetMotion'), source.indexOf('let editActive'));
  assert.match(motionBlock, /elements\.some/);
  assert.match(motionBlock, /kind === 'wave' \|\| kind === 'scope'/);
  assert.doesNotMatch(motionBlock, /pixelWidgets\.some/);
});
