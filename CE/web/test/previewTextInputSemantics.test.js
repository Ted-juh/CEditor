import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';

const textInput = {
  _children: {
    Core: { id: 'preview-text', controlType: 'TextInput', name: 'Patch name' },
    Transform: { x: 0, y: 0, width: 140, height: 30, zIndex: 0 },
    Behavior: { family: 'text', defaultValue: 'Warm pad', keyboardEnabled: true, focusable: true },
    Text: { content: 'Name' },
  },
};

test('preview TextInput exposes one native tab stop without an interactive wrapper role', () => {
  const panel = { id: 'text-panel', width: 200, height: 80, controls: [textInput], layers: [] };
  const body = render(PanelPreviewSurface, {
    props: { panel, scale: 1, bgLayers: {}, gridStyle: '' },
  }).body;
  const wrapper = body.match(/<div[^>]*class="[^"]*canvas-control[^"]*"[^>]*data-control-id="preview-text"[^>]*>/)?.[0];

  assert.ok(wrapper, 'TextInput wrapper was not rendered');
  assert.doesNotMatch(wrapper, /\srole=/, 'wrapper must not nest a button role around the textbox');
  assert.match(wrapper, /tabindex="-1"/, 'wrapper must be skipped by sequential keyboard focus');
  assert.match(body, /<input[^>]*class="[^"]*canvas-text-input[^"]*"[^>]*tabindex="0"/,
    'the native textbox owns the only keyboard tab stop');
});
