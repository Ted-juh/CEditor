// menuBarSemantics.test.js — what the menu bar now says to a keyboard and a screen reader.
//
// Review finding D3, last clause: "No mnemonics, no Escape-to-close, no ARIA." Escape landed in
// the third round; this pins the rest. Finding D6 is the same file: the Edit menu's missing
// Duplicate / Delete / Group / Ungroup / Arrange, the missing Recent Files, the missing Window
// menu, and "Open Saved Custom Component" opening `library[0]` with no picker.
//
// The behaviour is in a browser-mounted component, so the checks here are structural: they read
// the source the way the review did, and they fail if any of those clauses is quietly undone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'src', 'CE_Application', 'layout', 'MenuBar.svelte');
const source = readFileSync(path, 'utf8');
const markup = source.slice(source.indexOf('<svelte:window'));
const script = source.slice(0, source.indexOf('<svelte:window'));

test('the component compiles with no warnings, a11y ones included', () => {
  const { warnings } = compile(source, { filename: 'MenuBar.svelte' });
  assert.deepEqual(warnings.map((w) => w.code), [], warnings.map((w) => w.message).join('\n'));
});

// --- D3: ARIA -------------------------------------------------------------------------------

test('the bar is a menubar and every top-level button is a menuitem that says it has a menu', () => {
  assert.match(markup, /role="menubar"/);
  assert.match(markup, /aria-label="Main menu"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-expanded=\{openMenu === name\}/);
  assert.match(markup, /aria-controls="menu-\{name\}"/);
});

test('each dropdown is a menu, and its rows are menuitems', () => {
  assert.match(markup, /class="dropdown"[\s\S]{0,200}role="menu"/);
  assert.match(markup, /role=\{item\.checked \? 'menuitemcheckbox' : 'menuitem'\}/);
  assert.match(markup, /aria-checked=\{item\.checked \? item\.checked\(\) : undefined\}/);
  assert.match(markup, /aria-disabled=\{disabled\}/);
});

test('greyed rows are aria-disabled, not `disabled`, so roving focus can still reach them', () => {
  // A `disabled` button is not focusable: the highlight would step onto it while the real DOM
  // focus stayed behind, and the one user who most needs to be told the command exists would
  // never be told. The click guard lives in handleItemClick instead.
  assert.ok(!/\sdisabled=\{disabled\}/.test(markup), 'no native disabled attribute on menu rows');
  assert.ok(!/\sdisabled=\{isDisabled\(subItem\)\}/.test(markup), 'nor on submenu rows');
  assert.match(markup, /class:is-disabled=\{disabled\}/);
  assert.match(script, /function handleItemClick\(item\) \{\n    if \(isDisabled\(item\)\) return;/);
});

test('separators and category captions are marked as furniture, not as commands', () => {
  assert.match(markup, /class="dropdown-separator" role="separator"/);
  assert.match(markup, /class="dropdown-header" role="presentation"/);
});

test('the menu bar is one tab stop with roving focus, not eight in the tab order', () => {
  assert.match(markup, /tabindex=\{barFocusName === name \? 0 : -1\}/);
  assert.match(markup, /tabindex=\{focusIndex === index \? 0 : -1\}/);
});

// --- D3: keyboard ---------------------------------------------------------------------------

test('arrow keys, Home and End move within a dropdown', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    assert.match(script, new RegExp(`e\\.key === '${key}'`), `${key} is handled`);
  }
  assert.match(script, /nextFocusableIndex\(items, focusIndex, 1\)/);
  assert.match(script, /nextFocusableIndex\(items, focusIndex, -1\)/);
});

test('left and right cross between menus, and right also opens a submenu', () => {
  assert.match(script, /stepMenuName\(menuNames, openMenu, 1\)/);
  assert.match(script, /stepMenuName\(menuNames, openMenu, -1\)/);
  assert.match(script, /ArrowRight[\s\S]{0,240}openSubmenuAt\(focusIndex, \{ focusFirst: true \}\)/);
});

test('Escape still closes, and now hands focus back to the button that opened the menu', () => {
  assert.match(script, /if \(e\.key === 'Escape'\)/);
  assert.match(script, /closeMenus\(\{ restoreFocus: true \}\)/);
  assert.match(script, /barEls\[name\]\?\.focus\(\)/);
});

// --- D3: mnemonics --------------------------------------------------------------------------

test('access keys are assigned once per menu and drawn as an underline', () => {
  assert.match(script, /const barMnemonics = assignMnemonics\(menuNames\)/);
  assert.match(script, /const itemMnemonics = Object\.fromEntries\(/);
  assert.match(markup, /<u>\{parts\.letter\}<\/u>/);
  assert.match(markup, /<u>\{label\.letter\}<\/u>/);
});

test('Alt+letter opens a menu, and is guarded on a text field the way every other global key is', () => {
  assert.match(script, /if \(!e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey \|\| e\.key\.length !== 1\) return;/);
  assert.match(script, /isTextEntryTarget\(e\.target\)/);
  // The native accesskey attribute would fire alongside our handler and open the menu twice.
  assert.ok(!/accesskey=/.test(markup), 'no native accesskey attribute');
});

test('typing a letter inside an open menu jumps to that item', () => {
  assert.match(script, /matchMnemonicIndex\(items, currentMnemonics, e\.key, focusIndex\)/);
  assert.match(script, /matchMnemonicIndex\(submenuItems, submenuMnemonics, e\.key, subFocusIndex\)/);
});

// --- D6: the missing Edit commands ------------------------------------------------------------

test('Edit carries Duplicate, Delete, Group, Ungroup and an Arrange group, with their shortcuts', () => {
  const edit = source.match(/Edit: \[[\s\S]*?\n    \],/)?.[0] ?? '';
  assert.ok(edit, 'the Edit menu exists');
  const rows = [
    ["'Duplicate'", "'Ctrl\\+D'"],
    ["'Delete'", "'Del'"],
    ["'Group into Container'", "'Ctrl\\+G'"],
    ["'Ungroup'", "'Ctrl\\+Shift\\+G'"],
  ];
  for (const [label, shortcut] of rows) {
    assert.match(edit, new RegExp(`label: ${label}, shortcut: ${shortcut}`), `${label} with its shortcut`);
  }
  assert.match(edit, /type: 'header', label: 'Arrange'/);
  for (const label of ['Bring to Front', 'Bring Forward', 'Send Backward', 'Send to Back', 'Tidy Grid', 'Arrange in Circle']) {
    assert.ok(edit.includes(`label: '${label}'`), `${label} is in Arrange`);
  }
});

test('every added Edit row greys out through the shared availability table', () => {
  const edit = source.match(/Edit: \[[\s\S]*?\n    \],/)?.[0] ?? '';
  assert.match(edit, /'Duplicate'[\s\S]{0,120}editAvailability\(\)\.canDuplicate/);
  assert.match(edit, /'Delete'[\s\S]{0,120}editAvailability\(\)\.canDelete/);
  assert.match(edit, /'Group into Container'[\s\S]{0,120}editAvailability\(\)\.canGroup/);
  assert.match(edit, /'Ungroup'[\s\S]{0,120}editAvailability\(\)\.canUngroup/);
  assert.match(edit, /'Tidy Grid'[\s\S]{0,120}editAvailability\(\)\.canArrangeMany/);
  assert.match(edit, /'Arrange in Circle'[\s\S]{0,120}editAvailability\(\)\.canArrangeMany/);
  // Ungroup acts on the very id the predicate found, so the greying and the command agree.
  assert.match(edit, /const id = editAvailability\(\)\.ungroupTargetId;/);
});

test('the Arrange rows advertise no shortcut, because none is bound', () => {
  const edit = source.match(/type: 'header', label: 'Arrange'[\s\S]*?\n      \{ type: 'separator' \},/)?.[0] ?? '';
  assert.ok(edit.includes("label: 'Bring to Front'"));
  assert.ok(!/shortcut:/.test(edit), 'no invented Ctrl+[ / Ctrl+] — that is D9\'s bug, not a fix');
});

// --- D6 / E6: Open Recent ---------------------------------------------------------------------

test('File offers Open Recent, off the shared store, greyed out when the list is empty', () => {
  assert.match(source, /\{ type: 'submenu', label: 'Open Recent', enabled: \(\) => recentGroups\.length > 0, items: recentSubmenuItems \}/);
  assert.match(script, /from '\.\.\/stores\/recentFiles\.js'/);
  assert.match(script, /groupRecentFiles\(\$recentFiles\)/);
});

test('the recent rows carry the path as a tooltip and can be cleared', () => {
  assert.match(script, /title: entry\.path \|\| `\$\{group\.label\}: \$\{entry\.name\}`/);
  assert.match(script, /label: 'Clear Recent'/);
  assert.match(script, /action: \(\) => openRecentFile\(entry\)/);
});

test('a submenu is a real menu with its own expanded state', () => {
  assert.match(markup, /aria-haspopup=\{item\.type === 'submenu' \? 'menu' : undefined\}/);
  assert.match(markup, /aria-expanded=\{item\.type === 'submenu' \? openSubmenuIndex === index : undefined\}/);
  assert.match(markup, /class="dropdown submenu"[\s\S]{0,160}role="menu"/);
});

// --- D6: the Window menu ------------------------------------------------------------------------

test('there is a Window menu, mirroring the three dock toggles with their checked state', () => {
  const windowMenu = source.match(/Window: \[[\s\S]*?\n    \],/)?.[0] ?? '';
  assert.ok(windowMenu, 'the Window menu exists');
  assert.match(windowMenu, /PANEL_VISIBILITY_ITEMS\.map/);
  assert.match(windowMenu, /checked: \(\) => visibilityFlags\[item\.id\] === true/);
  assert.match(windowMenu, /togglePanelVisibility\(item\.id\)/);
  assert.match(script, /let visibilityFlags = \$derived\(\{ tree: treeVisible, properties: propertiesVisible, display: displayVisible \}\)/);
});

test('the toggle state is read reactively, so a checkmark cannot go stale under the rail', () => {
  assert.match(script, /let treeVisible = \$derived\(\$showTreePanel\)/);
  assert.match(script, /let propertiesVisible = \$derived\(\$showPropertiesPanel\)/);
  assert.match(script, /let displayVisible = \$derived\(\$showDisplayPanel\)/);
});

// --- D6: the component picker ---------------------------------------------------------------

test('"Open Saved Custom Component" goes through the shared picker, not library[0]', () => {
  assert.ok(!/customComponentLibrary\)\?\.\[0\]/.test(source), 'the library[0] shortcut is gone');
  assert.match(script, /function openSavedCustomComponent\(\)[\s\S]{0,300}picker = 'component'/);
  assert.match(script, /shouldOpenDirectly\(entries\)/);
  assert.match(markup, /<WorkspacePicker/);
  assert.match(script, /import WorkspacePicker from '\.\/WorkspacePicker\.svelte'/);
});

test('the picker rows and the one-entry shortcut are the same code the tab strip runs', () => {
  assert.match(script, /componentPickerEntries|shouldOpenDirectly/);
  assert.match(script, /from '\.\.\/utils\/workspacePickerEntries\.js'/);
  const tabBar = readFileSync(join(here, '..', 'src', 'CE_Application', 'editor', 'TabBar.svelte'), 'utf8');
  assert.match(tabBar, /from '\.\.\/utils\/workspacePickerEntries\.js'/);
  assert.match(tabBar, /import WorkspacePicker from '\.\.\/layout\/WorkspacePicker\.svelte'/);
});
