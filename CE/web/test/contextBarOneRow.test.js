// contextBarOneRow.test.js — the bar above the panel canvas is one row that wraps, and holds what an
// author changes while laying out a panel (item 1 of the editor-space list).
//
// It was two fixed rows beside a Device block and a Scripts block two rows tall each, which kept
// their width. At 1366 x 768, with the tree and the properties panel open, the canvas column is 502
// pixels wide: the rows had about 140 of it, and X Y W H ran under the Device block (ten overlapping
// items for a knob). The bar was 229 pixels tall for a knob and 459 for a button; it is 60 and 86
// now, and one row (34) at 1920 for a knob. Measured in the browser; this pins what makes it so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setFacet } from '../src/CE_Application/stores/editorFacet.js';
import { setStateEditScopeBase } from '../src/CE_Application/stores/stateEditScope.js';
import ContextBar from '../src/CE_Application/layout/ContextBar.svelte';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function barFor(type, sections = {}) {
  const control = createControl(type, { Core: { id: 'c1', name: 'Cutoff', zIndex: 0 }, ...sections });
  const panel = { ...createPanel('Bar'), controls: [control] };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  setStateEditScopeBase();
  selectedComponentIds.set(new Set(['c1']));
  return render(ContextBar, { props: {} }).body;
}

test('one row: name, type, facets, Device and Scripts, then the facet\'s fields and State', () => {
  setFacet('box');
  const html = barFor('Knob');
  assert.equal([...html.matchAll(/class="ctx-row/g)].length, 1, 'one row, which wraps');
  const order = ['class="name-field', 'class="type-badge', 'class="facet-tabs', 'class="ctx-ends', 'dev-chip-btn', 's-jump', '>X<', '>H<', 'state-select'];
  const at = order.map((needle) => html.indexOf(needle));
  assert.ok(at.every((index) => index >= 0), `all present: ${order.filter((_, i) => at[i] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in that order: Device and Scripts follow the facets, so they share the name\'s line on a narrow bar');
});

test('the Box facet is X Y W H; rotation and opacity are in the Transform tab', () => {
  setFacet('box');
  const html = barFor('Knob');
  for (const title of ['X position', 'Y position', 'Width', 'Height']) assert.match(html, new RegExp(`title="${title}"`));
  assert.doesNotMatch(html, /title="Rotation \(degrees\)"|title="Opacity"/);
});

test('the type is said once, in words, and the Input switches and subtype are in their tabs', () => {
  setFacet('text');
  const html = barFor('MomentaryButton');
  assert.match(html, /<span class="type-badge[^"]*" title="Control type">Momentary Button<\/span>/);
  assert.equal([...html.matchAll(/class="type-badge/g)].length, 1);
  assert.doesNotMatch(html, /type-badge ghost|title="Behavior subtype"/);
  // Wheel and Reverse are in the Mouse tab, Keys in the Behavior tab.
  assert.doesNotMatch(html, />Wheel<|>Reverse<|>Keys</);
  assert.match(src('sections/MouseEditor.svelte'), /setBehavior\('wheelEnabled'/);
  assert.match(src('sections/MouseEditor.svelte'), /setBehavior\('reverseMouseDirection'/);
  assert.match(src('sections/BehaviorEditor.svelte'), /set\('keyboardEnabled'/);
  assert.match(src('sections/BehaviorEditor.svelte'), /set\('subtype'/);
});

test('State is one list, with a dot on each state that has its own changes', () => {
  setFacet('box');
  const html = barFor('MomentaryButton');
  const list = html.slice(html.indexOf('<select class="state-select'), html.indexOf('</select>', html.indexOf('<select class="state-select')));
  assert.ok(list.length > 0, 'the list is there');
  assert.match(text(list), /^ ?Base /);
  assert.match(text(list), /Hover •/);
  assert.doesNotMatch(html, /class="state-target/, 'no button per state');
  // Segments are several picks at once, so they stay chips; they wrap instead of scrolling
  // behind a hidden scrollbar.
  const toolbar = src('components/DisplayToolbar.svelte');
  assert.match(toolbar, /\.segment-targets \{[^}]*flex-wrap: wrap;/);
  assert.doesNotMatch(toolbar, /scrollbar-width: none/);
});

test('Device and Scripts are one button each, with the details in the tooltip', () => {
  setFacet('box');
  let html = barFor('Knob');
  assert.match(text(html), /Device Unbound ▾ Scripts none/);
  assert.match(html, /title="Not bound to a device parameter\. Accepts [^"]+\. Click to bind one\."/);
  assert.match(html, /class="s-jump[^"]*" title="No logic attached\. Open the Script Editor\."/);

  html = barFor('Knob', { DeviceBindings: { _type: 'DeviceBindings', enabled: true, bindings: [
    { kind: 'deviceParameter', port: 'value', deviceRole: 'synth', parameterId: 'filter.cutoff', parameterType: 'int' },
  ] } });
  assert.match(text(html), /Device filter\.cutoff/);
  assert.match(html, /title="[^"]*filter\.cutoff[^"]*\. Click for the binding, Properties and DPD\."/);
  assert.doesNotMatch(html, /\.\. Click/, 'one full stop where a warning ends in one');
  // The address line and the two jumps are in the panel the button opens.
  const device = src('layout/DeviceInsight.svelte');
  const details = device.slice(device.indexOf('{#if detailsOpen'), device.indexOf('{/if}\n\n    {#if pickerOpen}'));
  assert.match(details, /class="dev-addr"/);
  assert.match(details, />Properties</);
  assert.match(details, />DPD</);
  // Escape closes the list or the panel, and stops there, as the designer's menus do.
  assert.match(device, /event\.key !== 'Escape'[\s\S]*?event\.stopPropagation\(\)/);
});

test('the bar goes by its own width: Device and Scripts at the end when it is wide, facet names folded when narrow', () => {
  const bar = src('layout/ContextBar.svelte');
  assert.match(bar, /\.context-bar \{[^}]*container: ctxbar \/ inline-size;/);
  assert.match(bar, /@container ctxbar \(min-width: 900px\) \{\s*\.ctx-ends \{\s*order: 99;\s*margin-left: auto;/);
  assert.match(bar, /@container ctxbar \(max-width: 699px\) \{\s*\.facet-tab:not\(\.active\) span \{\s*display: none;/);
  // A folded facet keeps its name for the tooltip and for a screen reader.
  assert.match(bar, /title=\{meta\.label\}\s*aria-label=\{meta\.label\}/);
});
