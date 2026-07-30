// nestedControlReach.test.js — the panel is a TREE, and six places walked it as a list.
//
// `panel.controls` holds top-level controls only; anything dropped into a Group or Container lives
// under it. findControlByName learned that some time ago and carries a comment saying so. Six other
// places did not, and each one failed the same way: correct for a flat panel, silently wrong the
// moment an author grouped anything.
//
//   1. snapshotValues        — no baseline for a nested control, so nothing could be seen to change
//   2. onPanelsChanged       — the value diff never visited it, so onValueChange never fired
//   3. controlNameById       — events addressed by RAW ID, matching no listener registered by name
//   4. session map rebuild   — a nested control's preview session deleted on every sync, MID-PRESS
//   5. eleven id lookups     — "which control is this?" answered null in the preview surface
//   6. the active-pointer $effect — "does the control I am tracking still exist?" always answered
//                              NO for a nested control, so it dropped the pointer state and tore
//                              off the window listeners; the release was then never handled
//
// Six was worth a test file. What makes them one bug rather than six is the shape — a `.find` or a
// `for…of` over `panel.controls` where the question is about ANY control — so this file asserts
// that shape is gone from the sources, and asserts the behaviour where the runtime can be driven
// directly. The Svelte halves are source assertions on purpose: they live in effects and DOM event
// handlers that a node test cannot raise, and a source check that would have caught all six beats
// no check at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, syncPanelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, '..', 'src', 'CE_Application', ...p), 'utf8');

/** A Group with a Button inside it — the shape every one of these got wrong. */
function nestedPanel() {
  const group = createControl('Group', { name: 'Bay' });
  const button = createControl('Button', { name: 'Engage' });
  group._children.Children = group._children.Children ?? { _type: 'Children', _children: {} };
  group._children.Children._children[button._children.Core.id] = button;
  return { group, button };
}

test('the tree helper actually descends — the premise everything below rests on', () => {
  const { group, button } = nestedPanel();
  assert.deepEqual(
    flatControls([group]).map((c) => c._children.Core.name),
    ['Bay', 'Engage'],
    'flatControls no longer returns children; every fix in this file is built on it',
  );
  assert.equal([group].length, 1, 'and the raw array is exactly what made the bug invisible');
});

test('a nested control is reachable by name, and its rect is absolute', () => {
  const { group, button } = nestedPanel();
  panels.set([{ id: 'p', name: 'P', controls: [group], scripting: { modules: MODULES.map((m) => m.id) } }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'nested');
    assert.ok(api.panelInfo('Engage'), 'panelInfo cannot see a control inside a Group');
    assert.equal(api.panelInfo('Engage').parent, 'Bay');
    assert.ok(api.panelRect('Engage'), 'panelRect cannot see a control inside a Group');
  } finally { panels.set([]); }
});

test('a nested control keeps its preview session when the map is rebuilt', () => {
  // This is the one that broke a gesture in half: the session was deleted while the pointer was
  // still down, so the runtime had no `pressed: true` left to diff a release against.
  const { group, button } = nestedPanel();
  panels.set([{ id: 'p', name: 'P', controls: [group] }]);
  activePanelId.set('p');
  try {
    syncPanelPreviewSessions([group]);
    const ids = Object.keys(get(panelPreviewSessions));
    assert.ok(ids.includes(button._children.Core.id),
      'the nested control has no preview session — it cannot be pressed, hovered or released');
    assert.equal(ids.length, 2, 'the container keeps its own session too');
  } finally { panels.set([]); }
});

/* ------------------------------------------------------ the shape, in the sources */

test('the runtime asks the whole tree, never the top-level array', () => {
  const runtime = src('scripting', 'panelRuntime.js');
  for (const [what, pattern] of [
    ['controlNameById', /function controlNameById\(id\)[\s\S]{0,400}?flatControls\(/],
    ['snapshotValues', /function snapshotValues\(\)[\s\S]{0,400}?flatControls\(/],
    ['the value diff', /function onPreviewSessionsChanged|for \(const c of flatControls\(panel\.controls/],
  ]) {
    assert.match(runtime, pattern, `${what} walks panel.controls flat again`);
  }
  assert.doesNotMatch(runtime, /for \(const c of panel\.controls\)/,
    'a bare walk over panel.controls is back — it cannot see anything inside a Group');
});

test('the preview surface looks a control up by id across the tree', () => {
  const surface = src('editor', 'PanelPreviewSurface.svelte');
  assert.match(surface, /controlsById = \$derived\(new Map\(flatControls\(/,
    'the id lookup is no longer built from the whole tree');
  assert.doesNotMatch(surface, /orderedControls\.find\(/,
    'orderedControls is RENDER order and top-level only; using it as a lookup returns null for '
    + 'every control inside a Group');
});

test('"is the control I am tracking still there?" is asked of the tree', () => {
  // The specific one that dropped the window pointer listeners mid-press, so a held pad was never
  // released and anything it started ran for ever.
  const surface = src('editor', 'PanelPreviewSurface.svelte');
  assert.match(surface, /if \(pointerActiveControlId && !controlsById\.has\(pointerActiveControlId\)\)/,
    'the active-pointer guard is back on a top-level list, which answers NO for a nested control');
});

test('the session map is built from the tree, whatever a caller passes in', () => {
  const store = src('stores', 'interactionPreview.js');
  assert.match(store, /const allControls = \(controls\) => flatControls\(/,
    'the session map no longer flattens what it is given');
  for (const fn of ['createPreviewSessionsMap', 'syncPanelPreviewSessions']) {
    const at = store.indexOf(`function ${fn}(`);
    assert.ok(at > 0, `${fn} is gone`);
    assert.match(store.slice(at, at + 200), /allControls\(controls\)/,
      `${fn} builds its list without flattening — nested controls get dropped from the map`);
  }
});
