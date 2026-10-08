// iconLayout.test.js — a chosen icon is drawn (utils/iconLayout.js).
//
// Buttons and labels start out text-only, a layout in which the renderer draws no icon, so an icon
// chosen in the editor was stored and never seen. The pickers (sections/IconEditor.svelte,
// layout/ContextBar.svelte) and ce.image.icon now pick a layout that shows it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { layoutModeForIcon } from '../src/CE_Application/utils/iconLayout.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

test('a text-only control gets the icon beside its text, or alone when it has none', () => {
  const toggle = createControl('ToggleButton');
  assert.equal(toggle._children.ContentLayout.mode, 'text_only', 'the default this is about');
  assert.equal(layoutModeForIcon(toggle), 'icon_left_text_right');
  toggle._children.Text.content = '   ';
  assert.equal(layoutModeForIcon(toggle), 'icon_only');
});

test('a layout the author chose is left alone, and a control without one is not touched', () => {
  const label = createControl('Label');
  label._children.ContentLayout.mode = 'text_above_icon_below';
  assert.equal(layoutModeForIcon(label), null);
  assert.equal(layoutModeForIcon(createControl('Knob')), null);
  assert.equal(layoutModeForIcon(null), null);
});

test("while a state is edited, that state's own layout counts first", () => {
  const toggle = createControl('ToggleButton');
  toggle._children.States._children.checked = { patches: { component: { 'ContentLayout.mode': 'icon_only' } } };
  assert.equal(layoutModeForIcon(toggle, 'checked'), null, 'the checked state already shows an icon');
  assert.equal(layoutModeForIcon(toggle, 'hover'), 'icon_left_text_right', 'hover has no layout of its own');
  assert.equal(layoutModeForIcon(toggle), 'icon_left_text_right');
});

test('both icon pickers apply it, to each selected control', () => {
  for (const file of ['sections/IconEditor.svelte', 'layout/ContextBar.svelte']) {
    const source = readFileSync(new URL(`../src/CE_Application/${file}`, import.meta.url), 'utf8');
    assert.match(source, /layoutModeForIcon\(target/, `${file} asks for the layout per control`);
    assert.match(source, /\$selectedControls/, `${file} goes through the whole selection`);
  }
});
