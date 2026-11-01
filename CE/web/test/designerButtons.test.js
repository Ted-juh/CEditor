// designerButtons.test.js — buttons the designer showed as letters and arrows (item 12 of the review).
//
//   - A state card had H, P and D: the hover, pressed and disabled conditions, named only by
//     tooltips. They took the room Copy and Del needed, and both were cut off by the card's edge.
//     Edit opens the States editor, which has the three by name; the card has Edit, Copy and Del.
//   - The card's badge said "No trigger" for a state whose condition names a zone, as every state a
//     converted knob has does.
//   - The look bar had "W" for the stroke's width (W is the layer's width everywhere else) and "R"
//     for the corner radius.
//   - The Publish tab's External links were two arrow icons.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { stateTriggerLabel } from '../src/CE_Application/utils/customDesignSurfaceHelpers.js';
import CustomPublishedPropertiesEditor from '../src/CE_Application/sections/CustomPublishedPropertiesEditor.svelte';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('a state card has Edit, Copy and Del, and no lettered conditions', () => {
  const card = src('sections/CustomStateFilmstrip.svelte');
  assert.doesNotMatch(card, /\['hover','H'\]|when-toggles|setFilmstripStateWhen/);
  assert.match(card, /title="Edit state">\s*Edit/);
  assert.match(card, /title="Delete state">\s*Del/);
  // From the card's left edge, not indented under the thumbnail: Del did not fit in what was left.
  assert.match(card, /\.state-actions \{[^}]*padding: 0 7px 6px;/);
  // The name has the top row: the count is at the end of the actions, and the condition is in the
  // card's tooltip. Beside the name they left it 23 pixels ("Cu…"), and with the condition in
  // words, none.
  assert.match(card, /\.state-main \{[^}]*grid-template-columns: 48px minmax\(0, 1fr\);/);
  assert.doesNotMatch(card, /state-trigger-badge|state-count-trigger/);
  const actions = card.slice(card.indexOf('<div class="state-actions"'), card.indexOf('</div>', card.indexOf('<div class="state-actions"')));
  assert.match(actions, /\{#if entry\.base\}<span class="state-count">BASE<\/span>\{\/if\}/);
  assert.match(card, /When: \$\{stateTriggerLabel\(entry\.state, entry\.base\)\}\\n\$\{statePatchCount\(entry\.state\)\} patch/);
  // The conditions are in the States editor, by name.
  assert.match(src('sections/StatesEditor.svelte'), /\{ key: 'hover', label: 'Hover' \}/);
  assert.doesNotMatch(src('sections/CustomDesignSurfaceEditor.svelte'), /setFilmstripStateWhen/);
});

test('the card\'s condition is said in words, and "No trigger" only when there is none', () => {
  assert.equal(stateTriggerLabel({ when: { hoveredCustomHitZone: 'CutoffZone' } }), 'pointer over CutoffZone');
  assert.equal(stateTriggerLabel({ when: { activeCustomHitZone: 'CutoffZone', dragging: true } }), 'CutoffZone pressed, dragging');
  assert.equal(stateTriggerLabel({ when: { focusedCustomHitZones: 'CutoffZone' } }), 'CutoffZone focused');
  assert.equal(stateTriggerLabel({ when: { hover: true } }), 'Hover', 'a flag reads as it did');
  assert.equal(stateTriggerLabel({ when: {} }), 'No trigger');
  assert.equal(stateTriggerLabel({ when: { hover: false, hoveredCustomHitZone: '' } }), 'No trigger');
  assert.equal(stateTriggerLabel({ when: { hover: true } }, true), '', 'the base state has no badge');
});

test('the look bar names the corner radius and puts the stroke width beside the stroke', () => {
  const bar = src('sections/SurfaceLookBar.svelte');
  assert.doesNotMatch(bar, /<span>W<\/span>|<span>R<\/span>/);
  assert.match(bar, /<label class="paint-number stroke-width" title="Stroke width, in pixels">/);
  assert.match(bar, /ariaLabel="Stroke width"/);
  assert.match(bar, /<label class="paint-number" title="Corner radius, in pixels">\s*<span>Corners<\/span>/);
  // The stroke width follows the stroke's colour, before Corners.
  assert.ok(bar.indexOf('title="Pick stroke colour"') < bar.indexOf('stroke-width') && bar.indexOf('stroke-width') < bar.indexOf('<span>Corners</span>'));
});

test('External links are two switches by name, Inputs and Outputs', () => {
  const component = createControl('CustomComponent');
  component._children.ExternalAPI = { ...component._children.ExternalAPI, acceptsExternalLinks: true, emitsExternalLinks: false };
  const html = render(CustomPublishedPropertiesEditor, { props: { control: component } }).body;
  assert.match(text(html), /External links Inputs Outputs/);
  const cell = html.slice(html.indexOf('class="external-links'), html.indexOf('</div>', html.indexOf('class="external-links')));
  assert.match(cell, /role="switch" aria-checked="true"[^>]*>\s*Inputs/);
  assert.match(cell, /role="switch" aria-checked="false"[^>]*>\s*Outputs/);
  assert.doesNotMatch(src('sections/CustomPublishedPropertiesEditor.svelte'), /ArrowRightToLine|ArrowRightFromLine|FlagStrip/);
});

test('the inspector\'s tab rail names each tab under its icon, and keeps the title the checks find it by', async () => {
  const { default: TabIconBar } = await import('../src/CE_Application/panels/TabIconBar.svelte');
  const { default: Cpu } = await import('lucide-svelte/icons/cpu');
  const html = render(TabIconBar, { props: { tabs: [{ id: 'core', icon: Cpu, label: 'Core' }, { id: 'test', icon: Cpu, label: 'Test Bench' }], isActive: (id) => id === 'core' } }).body;
  assert.match(html, /title="Core"[\s\S]*?<span class="tab-label[^"]*">Core<\/span>/);
  assert.match(html, /title="Test Bench"[\s\S]*?<span class="tab-label[^"]*">Test Bench<\/span>/);
  const css = src('panels/TabIconBar.svelte');
  assert.match(css, /\.icon-tabs \{[^}]*width: 64px;/);
});
