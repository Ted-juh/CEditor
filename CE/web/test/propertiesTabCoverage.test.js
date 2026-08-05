// propertiesTabCoverage.test.js — every properties tab must have an editor behind it.
//
// This is the test that would have caught the Mouse tab. `allComponentTabs` in
// PropertiesPanel declared a Mouse tab; `sectionEditorLoaders` never registered
// one; SectionRenderer fell through to its `Component: {label}` placeholder;
// and the tab sat in the icon rail for months looking exactly like the other
// forty, opening onto nothing. The Scripts tab had already been removed for
// the same reason — the comment recording that is still in PropertiesPanel —
// so it had happened twice before anything failed.
//
// Nothing detects it at runtime: the placeholder is a legitimate branch, not
// an error, and a tab with no editor renders as calmly as one with. The only
// place the two halves can be compared is here, by reading both files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(join(here, '..', 'src', 'CE_Application', ...parts), 'utf8');

const panelSource = read('panels', 'PropertiesPanel.svelte');
const loaderSource = read('panels', 'sectionEditorLoaders.js');

function componentTabIds() {
  const start = panelSource.indexOf('const allComponentTabs = [');
  assert.notEqual(start, -1, 'allComponentTabs is gone or renamed — this test cannot see the tabs');
  const block = panelSource.slice(start, panelSource.indexOf('\n  ];', start));
  return [...block.matchAll(/\{\s*id:\s*'([a-zA-Z]+)'/g)].map((match) => match[1]);
}

function registeredEditorIds() {
  // Both registries: eager `key: Component,` and lazy `key: () => import(...)`.
  const eager = [...loaderSource.matchAll(/^ {2}([a-zA-Z]+):\s*\w+,/gm)].map((m) => m[1]);
  const lazy = [...loaderSource.matchAll(/^ {2}([a-zA-Z]+):\s*\(\)\s*=>/gm)].map((m) => m[1]);
  return new Set([...eager, ...lazy]);
}

test('every component tab has a section editor registered', () => {
  const tabs = componentTabIds();
  const registered = registeredEditorIds();

  assert.ok(tabs.length > 20, `only found ${tabs.length} tabs — the parse is probably wrong`);

  const orphans = tabs.filter((id) => !registered.has(id));
  assert.deepEqual(orphans, [],
    `these tabs open onto SectionRenderer's "Component: …" placeholder: ${orphans.join(', ')}. `
    + 'Either register an editor in sectionEditorLoaders.js or remove the tab — a tab with '
    + 'nothing behind it reads as a broken feature, not as an absent one.');
});

test('the mouse tab in particular is wired', () => {
  // Named explicitly because it is the one that was broken, and because a
  // future refactor that drops it should have to delete this line and think.
  assert.ok(componentTabIds().includes('mouse'), 'the Mouse tab is gone from PropertiesPanel');
  assert.ok(registeredEditorIds().has('mouse'), 'the Mouse tab has no editor again');
});
