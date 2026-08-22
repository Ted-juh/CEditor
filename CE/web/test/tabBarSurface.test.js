// tabBarSurface.test.js — the five things the tab strip did not do.
//
// Review finding D8: "TabBar: a modal 'New' toggle silently re-purposes the Panel/Component/
// Device buttons between create and open (Script ignores the mode); no tab reorder, no overflow
// UI, no per-tab context menu, no file-path tooltip." The review's downsize note is the shape of
// the first fix: "collapse the two 'new/open' models (menu vs TabBar's modal New toggle) into
// one."
//
// The strip is a browser-mounted component, so these read the source the way the review did. The
// logic underneath is unit-tested in tabStrip.test.js; what is pinned here is that the component
// actually calls it — a helper nobody calls is the same bug with extra files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'src', 'CE_Application', 'editor', 'TabBar.svelte');
const source = readFileSync(path, 'utf8');
const markup = source.slice(source.indexOf('<svelte:window'), source.lastIndexOf('<style'));
const script = source.slice(0, source.indexOf('<svelte:window'));

test('the component compiles with no warnings, a11y ones included', () => {
  const { warnings } = compile(source, { filename: 'TabBar.svelte' });
  assert.deepEqual(warnings.map((w) => w.code), [], warnings.map((w) => w.message).join('\n'));
});

// --- Clause 1: the modal New toggle -----------------------------------------------------------

test('the hidden create/open mode is gone entirely', () => {
  assert.ok(!/createMode/.test(source), 'no createMode state left');
  assert.ok(!/new-mode-btn/.test(source), 'no mode toggle button left');
  assert.ok(!/aria-pressed/.test(source), 'nothing is a toggle any more');
});

test('New and Open are two named menus, each row saying what it does', () => {
  assert.match(markup, /aria-label="New document"/);
  assert.match(markup, /aria-label="Open document"/);
  for (const label of ['Custom Component', 'Device Profile Designer', 'Script Workspace']) {
    assert.ok(markup.includes(`>${label}<`), `New lists ${label} plainly`);
  }
  for (const label of ['Saved Custom Component', 'Device Profile', 'Import Device Profile']) {
    assert.ok(markup.includes(label), `Open lists ${label}`);
  }
});

test('Script is no longer the odd one out — it sits in New with the other three', () => {
  const newTray = markup.match(/aria-label="New document"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(newTray, /createScriptTab/);
  assert.match(newTray, /openNewPanelDialog/);
  assert.match(newTray, /createComponentTab/);
  assert.match(newTray, /createDeviceProfileTab/);
});

test('both trays say they open a menu, so the state is announced rather than implied by a highlight', () => {
  assert.match(markup, /aria-haspopup="menu"[\s\S]{0,120}aria-expanded=\{tray === 'new'\}/);
  assert.match(markup, /aria-haspopup="menu"[\s\S]{0,120}aria-expanded=\{tray === 'open'\}/);
});

// --- Clause 2: reorder --------------------------------------------------------------------------

test('tabs are draggable and reorder through the tested helper', () => {
  assert.match(markup, /draggable="true"/);
  for (const handler of ['ondragstart', 'ondragover', 'ondrop', 'ondragend', 'ondragleave']) {
    assert.ok(markup.includes(handler), `${handler} is wired`);
  }
  assert.match(script, /seedTabOrder\(orderedTabs, tabOrder\)/);
  assert.match(script, /moveTabKey\(seeded, draggingKey, tabKey\(tab\)\)/);
  assert.match(script, /applyTabOrder\(\$editorTabs, tabOrder\)/);
});

test('the order the user chose is persisted, and bounded so it cannot grow forever', () => {
  assert.match(script, /const TAB_ORDER_STORAGE_KEY = 'ce\.ui\.tabOrder'/);
  assert.match(script, /writeStoredJson\(TAB_ORDER_STORAGE_KEY, tabOrder\)/);
  assert.match(script, /pruneTabOrder\(tabOrder, \$editorTabs\)/);
});

test('the drop target is drawn as an insertion point, not as a selection', () => {
  assert.match(markup, /class:drop-target=\{dropTargetKey === tabKey\(tab\) && draggingKey !== tabKey\(tab\)\}/);
  assert.match(source, /\.tab\.drop-target \{[\s\S]{0,120}box-shadow: inset 3px 0 0/);
});

// --- Clause 3: overflow ---------------------------------------------------------------------

test('overflow is measured, not assumed, and only then are the chevrons drawn', () => {
  assert.match(script, /tabOverflowState\(\{/);
  assert.match(script, /new ResizeObserver\(measureOverflow\)/);
  assert.match(markup, /onscroll=\{measureOverflow\}/);
  assert.match(markup, /\{#if overflow\.overflowing\}/);
});

test('each chevron disables itself at its end of the strip', () => {
  assert.match(markup, /aria-label="Scroll tabs left"[\s\S]{0,160}disabled=\{overflow\.atStart\}/);
  assert.match(markup, /aria-label="Scroll tabs right"[\s\S]{0,160}disabled=\{overflow\.atEnd\}/);
});

test('there is a list of every open tab, so a tab scrolled off the end is still reachable', () => {
  assert.match(markup, /title="All open tabs \(\{orderedTabs\.length\}\)"/);
  assert.match(markup, /title="Open Tabs"/);
  assert.match(markup, /onPick=\{\(row\) => \{ picker = ''; setActiveEditorTab\(row\.tab\); \}\}/);
});

test('activating a tab from elsewhere scrolls it back into view', () => {
  assert.match(script, /scrollIntoView\?\.\(\{ block: 'nearest', inline: 'nearest' \}\)/);
});

// --- Clause 4: the per-tab context menu -------------------------------------------------------

test('right-clicking a tab opens a menu with all five commands', () => {
  assert.match(markup, /oncontextmenu=\{\(e\) => openTabMenu\(e, tab, index\)\}/);
  const menu = markup.match(/class="tab-context-menu"[\s\S]*?\n  <\/div>/)?.[0] ?? '';
  assert.ok(menu, 'the context menu is in the markup');
  for (const label of ['Close', 'Close Others', 'Close to the Right', 'Copy Path', 'Reveal in File Browser']) {
    assert.ok(menu.includes(`>${label}<`), `the menu offers ${label}`);
  }
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
});

test('the menu greys out what it cannot do, including Reveal outside the desktop app', () => {
  const menu = markup.match(/class="tab-context-menu"[\s\S]*?\n  <\/div>/)?.[0] ?? '';
  assert.match(menu, /disabled=\{!tabMenuAvailability\.canCloseOthers\}/);
  assert.match(menu, /disabled=\{!tabMenuAvailability\.canCloseToRight\}/);
  assert.match(menu, /disabled=\{!tabMenuAvailability\.canCopyPath\}/);
  assert.match(menu, /disabled=\{!tabMenuAvailability\.canReveal \|\| !canRevealFiles\(\)\}/);
  assert.match(menu, /Only available in the desktop app/);
  assert.match(script, /tabContextAvailability\(orderedTabs, tabMenu\.index, tabMenu\.tab\)/);
});

test('the menu is placed by measuring first, so a right-click on the last tab stays on screen', () => {
  assert.match(script, /placeMenu\(at\.x, at\.y, \{ width: rect\.width, height: rect\.height \}, viewportSize\(\)\)/);
  assert.match(markup, /visibility:\{tabMenuPlaced \? 'visible' : 'hidden'\}/);
});

test('closing many tabs goes through the tested helper rather than a second loop', () => {
  assert.match(script, /tabsToClose\(orderedTabs, tabMenu\.index, mode\)/);
});

test('Escape and a click elsewhere close the menu and the trays', () => {
  assert.match(script, /function handleWindowKeydown\(event\)[\s\S]{0,220}closeTabMenu\(\)/);
  assert.match(script, /!event\.target\.closest\('\.tab-context-menu'\)/);
});

// --- Clause 5: the tooltip ---------------------------------------------------------------------

test('every tab has a tooltip naming its kind and its file', () => {
  assert.match(markup, /title=\{tabTooltip\(tab\)\}/);
  assert.match(script, /function tabTooltip\(tab\)/);
  assert.match(script, /'Not saved to a file yet'/);
  assert.match(script, /Unsaved changes/);
});

test('the path is joined from the owning store, because editorTabs does not carry one', () => {
  assert.match(script, /function pathForTab\(tab\)/);
  assert.match(script, /\$panels\.find\(\(panel\) => panel\.id === tab\.id\)\?\.filePath/);
  assert.match(script, /\$scriptDocuments\.find\(\(doc\) => doc\.id === tab\.id\)\?\.filePath/);
});

// --- D6 / E6 spillover -------------------------------------------------------------------------

test('the Open tray lists recent documents, off the same store the File menu uses', () => {
  assert.match(script, /from '\.\.\/stores\/recentFiles\.js'/);
  assert.match(markup, /Recent<\/div>/);
  assert.match(markup, /onclick=\{\(\) => handleRecent\(entry\)\}/);
});

test('opening a saved component or profile is the shared action, and records the recent entry', () => {
  assert.match(script, /from '\.\.\/stores\/recentFileActions\.js'/);
  assert.match(script, /openComponentLibraryEntry\(componentLibraryEntries\[0\]\.entry\)/);
  assert.match(script, /openDeviceProfileEntry\(deviceProfileEntries\[0\]\.entry\)/);
  const actions = readFileSync(join(here, '..', 'src', 'CE_Application', 'stores', 'recentFileActions.js'), 'utf8');
  assert.match(actions, /rememberRecentFile\(\{ kind: 'component'/);
  assert.match(actions, /rememberRecentFile\(\{ kind: 'deviceProfile'/);
});
