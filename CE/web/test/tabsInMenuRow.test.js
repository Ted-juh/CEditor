// tabsInMenuRow.test.js — the document tabs share the menu bar's row (item 4 of the editor-space
// list).
//
// They had a row of their own under the context bar: 36 pixels of height the canvas has now, and
// only the canvas column's width, which at 1366 x 768 with the tree and properties panel open
// showed one and a half of four tabs between scroll arrows. In the menu bar's row they have the
// room between the menus and the build stamp (720 pixels there, all four in full).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';

import MenuBar from '../src/CE_Application/layout/MenuBar.svelte';
import { buildInfo } from '../src/CE_Application/buildInfo.js';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('App puts the tab strip in the menu bar\'s row, and the canvas no longer has a row for it', () => {
  const app = src('App.svelte');
  assert.match(app, /import TabBar from '\.\/CE_Application\/editor\/TabBar\.svelte';/);
  assert.match(app, /<div class="menubar-area" bind:offsetHeight=\{menuBarHeight\}>\s*<MenuBar><TabBar \/><\/MenuBar>/);
  assert.match(app, /let canvasTopInset = \$state\(0\);/, 'the rail starts under the ruler, with no tab row to clear');
  const canvas = src('CE_Application/editor/EditorCanvas.svelte');
  assert.doesNotMatch(canvas, /TabBar|tab-bar-area|tabBarHeight/);
  assert.match(canvas, /\$effect\(\(\) => \{ topInset = rulerCorner \? rulerHeight : 0; \}\);/);
});

test('the tabs sit between the menus and the stamp, outside the menubar role', () => {
  const children = createRawSnippet(() => ({ render: () => '<div class="probe-tabs" role="tablist">tabs</div>' }));
  const html = render(MenuBar, { props: { children } }).body;
  const menubarOpen = html.indexOf('role="menubar"');
  const tabs = html.indexOf('<div class="probe-tabs"');
  const stamp = html.indexOf('class="build-stamp');
  assert.ok(menubarOpen > 0 && tabs > menubarOpen && stamp > tabs, 'menus, then the tabs, then the stamp');
  assert.match(html.slice(0, tabs), /<div class="menubar-middle[^"]*">\s*$/, 'in a container of their own');
  // A menubar may own menu items only: the strip is a sibling of it, not a child. Counting the
  // divs opened and closed between the menubar's start and the tabs shows the menubar has closed.
  const between = html.slice(html.lastIndexOf('<div', menubarOpen), tabs);
  const opened = (between.match(/<div\b/g) ?? []).length;
  const closed = (between.match(/<\/div>/g) ?? []).length;
  assert.equal(opened - closed, 1, 'only the middle container is open around the tabs');
  // Without anything to put there, the row is the menus and the stamp, as before.
  assert.doesNotMatch(render(MenuBar, { props: {} }).body, /menubar-middle/);
});

test('the stamp gives the commit; the branch and the time are in its tooltip', () => {
  const html = render(MenuBar, { props: {} }).body;
  const stamp = html.slice(html.indexOf('class="build-stamp'), html.indexOf('</span>', html.indexOf('class="build-stamp')));
  assert.match(stamp, new RegExp(`title="Build ${buildInfo.sha} · ${buildInfo.branch} · ${buildInfo.time}"`));
  assert.match(stamp.replace(/<!--[\s\S]*?-->/g, ''), new RegExp(`>\\s*build ${buildInfo.sha}\\s*$`));
});

test('the strip takes the row\'s room and colour, and New / Open sit in its middle', () => {
  const bar = src('CE_Application/editor/TabBar.svelte');
  assert.match(bar, /\.tab-bar \{\s*flex: 1 1 auto;\s*min-width: 0;[^}]*background: transparent;/);
  assert.doesNotMatch(bar.slice(bar.indexOf('.tab-bar {'), bar.indexOf('}', bar.indexOf('.tab-bar {'))), /border-bottom/);
  assert.match(bar, /\.tab-create-group \{[^}]*align-self: center;/);
  const menu = src('CE_Application/layout/MenuBar.svelte');
  assert.match(menu, /\.menubar-middle \{\s*flex: 1 1 auto;\s*min-width: 0;/);
});
