// componentTreeRender.test.js — what the component tree actually puts on screen (findings C5/C6).
//
// The maths is covered by componentTreeView.test.js. This is the other half: that ComponentTree
// is wired to it — that the list is a real ARIA tree rather than a stack of divs with the a11y
// warnings switched off, that it mounts a window instead of every row, and that the type badge
// is gone from the rows where it was only repeating the name.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render } from 'svelte/server';
import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { TREE_ROW_HEIGHT } from '../src/CE_Application/utils/componentTreeView.js';
import ComponentTree from '../src/CE_Application/panels/ComponentTree.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const treeSource = readFileSync(join(here, '..', 'src', 'CE_Application', 'panels', 'ComponentTree.svelte'), 'utf8');

function panelOf(controls) {
  const panel = { ...createPanel('Tree'), controls };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  return panel;
}

function labels(count, namer = (i) => `Label_${i}`) {
  return Array.from({ length: count }, (_, i) =>
    createControl('Label', { Core: { id: `id${i}`, name: namer(i), zIndex: i } }));
}

function renderTree() {
  return render(ComponentTree, { props: {} }).body;
}

test('a big panel mounts a window of rows, not all of them', () => {
  panelOf(labels(413));
  const html = renderTree();

  const rowCount = [...html.matchAll(/role="treeitem"/g)].length;
  assert.ok(rowCount > 0, 'the tree rendered no rows at all');
  assert.ok(rowCount < 60, `${rowCount} rows mounted for a 413-control panel — the list is not windowed`);

  // The spacer has to claim the full scroll height or the scrollbar is a lie about how much
  // list there is below the fold.
  assert.ok(
    html.includes(`height: ${413 * TREE_ROW_HEIGHT}px`),
    'the scroll spacer does not cover all 413 rows',
  );
});

test('rows are a real ARIA tree, not divs with the warnings switched off', () => {
  panelOf(labels(3));
  const html = renderTree();

  assert.match(html, /role="tree"/);
  assert.match(html, /aria-multiselectable="true"/);
  assert.match(html, /role="treeitem"/);
  assert.match(html, /aria-selected="false"/);
  assert.match(html, /aria-level="1"/);
  // Windowed lists have to state their real position: a screen reader counting rendered siblings
  // would say "2 of 25" in a panel of 413.
  assert.match(html, /aria-posinset="2"/);
  assert.match(html, /aria-setsize="3"/);
  assert.match(html, /tabindex="(0|-1)"/);

  assert.ok(
    !/svelte-ignore a11y_no_static_element_interactions/.test(treeSource),
    'a11y_no_static_element_interactions is still suppressed rather than satisfied',
  );
  assert.ok(
    !/svelte-ignore a11y_click_events_have_key_events/.test(treeSource),
    'a11y_click_events_have_key_events is still suppressed rather than satisfied',
  );
});

test('a container row reports whether it is open', () => {
  const container = createControl('Container', { Core: { id: 'grp', name: 'Rack', zIndex: 0 } });
  container._children.Children = {
    _children: { c0: createControl('Label', { Core: { id: 'in0', name: 'inner', zIndex: 0 } }) },
  };
  panelOf([container]);

  const html = renderTree();
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-level="2"/, 'the nested child must report its depth');
});

test('the type badge only appears when the name has stopped saying the type', () => {
  panelOf([
    createControl('Label', { Core: { id: 'd1', name: 'Label_12', zIndex: 0 } }),
    createControl('Label', { Core: { id: 'd2', name: 'title', zIndex: 1 } }),
  ]);

  const html = renderTree();
  const badges = [...html.matchAll(/class="item-type[^"]*"/g)].length;
  assert.equal(badges, 1, 'exactly the renamed row should carry a type badge');
});

test('the row derivation is guarded by the tree signature', () => {
  // The behaviour this protects — a canvas drag not rebuilding the rows — is a client-side
  // reactivity property, and there is no DOM in this test run to observe it in (no jsdom; the
  // Svelte hook compiles to SSR). componentTreeView.test.js proves the signature ignores a drag;
  // this proves the component is the thing asking it, and short-circuits on the answer.
  const derivation = treeSource.slice(treeSource.indexOf('let rows = $derived.by('), treeSource.indexOf('let totalCount'));

  // The signature is a derived of its own, shared with the folds (one pass per store write, not
  // two); the rows read it.
  assert.match(treeSource, /let treeSignature = \$derived\(\$activePanel \? controlTreeSignature\(\$activePanel\.controls\)/,
    'the tree signature is no longer taken from the panel\'s controls');
  assert.match(derivation, /const signature = treeSignature;/,
    'the rows derivation no longer asks whether anything the tree draws has changed');
  assert.match(derivation, /return cachedRows;/,
    'the rows derivation no longer returns the previous array by identity — Svelte will rebuild every row');
  assert.match(derivation, /collapsedIds === cachedCollapsed/, 'collapsing must still invalidate the cache');
  assert.match(derivation, /query === cachedQuery/, 'filtering must still invalidate the cache');
  assert.match(derivation, /panelId === cachedPanelId/, 'switching panels must still invalidate the cache');
});

test('the tree is wired to the behaviour its helpers implement', () => {
  // Same reasoning as above: drag auto-scroll and arrow traversal are pointer/keyboard
  // behaviours with no DOM here to exercise them in. The maths is tested; this is the wiring.
  assert.match(treeSource, /function handleDragOver[\s\S]{0,200}updateDragAutoScroll\(e\.clientY\)/,
    'dragging over a row no longer feeds the auto-scroll');
  assert.match(treeSource, /ondragover=\{\(e\) => \{ e\.preventDefault\(\); updateDragAutoScroll\(e\.clientY\); \}\}/,
    'the list itself must keep scrolling while the pointer is over a gap, not only over a row');
  assert.match(treeSource, /dragAutoScrollStep\(\{ pointerY: clientY/, 'the auto-scroll speed is no longer computed');

  assert.match(treeSource, /function handleTreeKeyDown[\s\S]{0,400}treeArrowTarget\(\{/,
    'arrow keys no longer reach the tree traversal');
  assert.match(treeSource, /onkeydown=\{handleTreeKeyDown\}/, 'no row listens for a key');

  assert.match(treeSource, /function commitRename\(\)[\s\S]{0,400}renameControl\(renamingId, renameValue\)/,
    'the inline rename is writing Core.name blind again');
  assert.ok(!/renamingId && renameValue\.trim\(\)/.test(treeSource),
    'an emptied rename field is being silently discarded again');
});

test('selection is reported on the row, not just coloured in', () => {
  panelOf(labels(2));
  selectedComponentIds.set(new Set(['id1']));

  const html = renderTree();
  assert.match(html, /aria-selected="true"/);
});

test('a tab container lists its children under its pages', () => {
  // The GAIA panel's bottom tabs were one flat list of 170 controls, with nothing saying which of
  // the four pages each one was on.
  const tabs = createControl('TabContainer', { Core: { id: 'tabs', name: 'bottom_pages', zIndex: 0 } });
  tabs._children.TabContainer = {
    ...tabs._children.TabContainer,
    pageIndex: 1,
    pages: [{ id: 'arp', label: 'Arpeggiator' }, { id: 'sys', label: 'System' }, { id: 'empty', label: 'Status' }],
  };
  tabs._children.Children = {
    _children: {
      a: createControl('Label', { Core: { id: 'a', name: 'arp_rate', zIndex: 0, tabPageId: 'arp' } }),
      b: createControl('Label', { Core: { id: 'b', name: 'midi_channel', zIndex: 1, tabPageId: 'sys' } }),
      c: createControl('Label', { Core: { id: 'c', name: 'master_tune', zIndex: 2, tabPageId: 'sys' } }),
    },
  };
  panelOf([tabs]);

  const html = renderTree();
  const order = ['bottom_pages', 'ARPEGGIATOR', 'arp_rate', 'SYSTEM', 'master_tune', 'midi_channel', 'STATUS']
    .map((text) => html.indexOf(`>${text}<`) >= 0 ? html.indexOf(`>${text}<`) : html.toUpperCase().indexOf(`>${text}<`));
  assert.ok(order.every((at) => at >= 0), `a row is missing: ${order}`);
  assert.deepEqual([...order].sort((x, y) => x - y), order, 'rows are not grouped under their pages in page order');

  assert.match(html, /aria-label="Page System, 2 components, showing"/, 'the showing page is not marked');
  assert.match(html, /aria-label="Page Status, 0 components"/, 'an empty page must still be listed');
  // Page rows sit one level under the container; its controls one level under the page.
  assert.match(html, /aria-level="2"[^>]*aria-label="Page Arpeggiator/);
  assert.match(html, /data-tree-id="a"[^>]*aria-level="3"|aria-level="3"[\s\S]{0,300}data-tree-id="a"|data-tree-id="a"[\s\S]{0,300}aria-level="3"/);
});

// --- Folding several levels at once ------------------------------------------------------------

function plates() {
  const container = (id, children) => {
    const control = createControl('Container', { Core: { id, name: id, zIndex: 0 } });
    control._children.Children = { _children: Object.fromEntries(children.map((child) => [child._children.Core.id, child])) };
    return control;
  };
  return [
    container('upper', [container('osc', [createControl('Knob', { Core: { id: 'wave', name: 'wave' } })])]),
    container('lower', [container('filter', [createControl('Knob', { Core: { id: 'cutoff', name: 'cutoff' } })])]),
  ];
}

test('a nested tree offers one button per level, and says which one it shows', () => {
  panelOf(plates());
  const html = renderTree();
  const buttons = [...html.matchAll(/<button[^>]*class="level-btn[^"]*"[^>]*>(\d+)<\/button>/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ['1', '2', '3'], 'plates, sections and knobs are three levels');
  assert.match(html, /title="Collapse all: show only the top rows"[^>]*>1</);
  assert.match(html, /title="Expand all"[^>]*>3</);
  // Everything starts open, so the tree is showing all three.
  assert.match(html, /class="level-btn[^"]* active"[^>]*aria-pressed="true"[^>]*>3</);
  assert.equal([...html.matchAll(/aria-pressed="true"/g)].length, 1, 'one level at a time');
});

test('a flat panel has no levels to offer', () => {
  panelOf(labels(3));
  assert.doesNotMatch(renderTree(), /class="level-btn/);
});

test('the levels and the branch folds are wired to the fold helpers', () => {
  // The shape is walked again only when the signature moves, so a drag does not re-walk it.
  assert.match(treeSource, /let folds = \$derived\.by\(\(\) => \{\s*treeSignature;\s*return untrack\(/,
    'the folds are no longer guarded by the tree signature');
  assert.match(treeSource, /function showLevels\(level\) \{\s*setCollapsed\(foldsForLevel\(folds, level\)\);/);
  assert.match(treeSource, /function toggleFold\(id, e\) \{[\s\S]{0,120}if \(e\.altKey\) setBranches\(\[id\], collapsedIds\.has\(id\)\);/,
    'Alt+click on an arrow no longer folds the whole branch');
  assert.equal([...treeSource.matchAll(/onclick=\{\(e\) => toggleFold\((row\.id|id), e\)\}/g)].length, 2,
    'both arrows, the container\'s and the page\'s, must fold a branch on Alt+click');
  assert.match(treeSource, /onclick=\{\(\) => ctxFold\(true\)\}>Expand All Inside/);
  assert.match(treeSource, /onclick=\{\(\) => ctxFold\(false\)\}>Collapse All Inside/);
});
