// editorChromeSurfaces.test.js — the chrome clauses that live in markup and CSS.
//
// Source assertions, because that is where these particular findings live: a tab that should
// not ship, a stylesheet rule that hides half a toolset, a button that does not exist. There
// is no DOM in this suite to render into, and rendering would not tell you more than the
// source does about whether a placeholder tab was deleted.
//
// Findings covered, clause by clause:
//   S5  — "No selection" rendered twice at once (ContextBar + StatusBar)
//   S3  — the alignment panel scrolled Order/Size/Layout off screen; the colour context bar
//         offered Done and no Cancel
//   S4  — preview had exactly one entry point, inside a panel the app force-hides below 920px
//   B8  — the dock overrode a height the user dragged, and persisted the override
//   B9  — one unlabelled icon toggle for a nine-tab dock; the auto-open height ambush
//   B10 — the Effects tab was a shipped placeholder; ViewerSettings polled on a 100ms timer

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...parts) => join(here, '..', 'src', ...parts);
const read = (path) => readFileSync(path, 'utf8');

const FILES = {
  app: src('App.svelte'),
  contextBar: src('CE_Application', 'layout', 'ContextBar.svelte'),
  statusBar: src('CE_Application', 'layout', 'StatusBar.svelte'),
  iconPanel: src('CE_Application', 'layout', 'IconPanel.svelte'),
  displayPanel: src('CE_Application', 'panels', 'DisplayPanel.svelte'),
  alignment: src('CE_Application', 'components', 'AlignmentPanel.svelte'),
  viewerSettings: src('CE_Application', 'components', 'ViewerSettings.svelte'),
  notepadEditor: src('CE_Application', 'components', 'NotepadEditor.svelte'),
  notepadTab: src('CE_Application', 'panels', 'NotepadTab.svelte'),
};

const source = Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, read(path)]));
const stylesOf = (text) => text.slice(text.lastIndexOf('<style'));

/**
 * The same file with its comments removed.
 *
 * Needed because this repo's comments deliberately quote the thing they replaced — "this was
 * `document.execCommand`", "the placeholder said full editing coming soon" — and that history
 * is worth keeping. An "is it gone?" assertion has to look at the code, or it fails on the
 * note explaining why the code is gone.
 */
function codeOf(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

const code = Object.fromEntries(Object.entries(source).map(([key, text]) => [key, codeOf(text)]));

test('every component touched here still compiles clean', () => {
  for (const [key, path] of Object.entries(FILES)) {
    if (!path.endsWith('.svelte')) continue;
    const { warnings } = compile(source[key], { filename: path });
    const real = warnings.filter((w) => !w.code.startsWith('a11y'));
    assert.deepEqual(real.map((w) => w.code), [], `${key}: ${real.map((w) => w.message).join('\n')}`);
  }
});

// --- S5 ------------------------------------------------------------------------

test('"No selection" is said once, by the status bar', () => {
  // It was said three times simultaneously (AppearanceBar, FunctionBar, StatusBar), then
  // two (ContextBar, StatusBar). The status bar is the one that states facts about the
  // document; the selection toolbar has nothing to state when there is no selection.
  assert.ok(source.statusBar.includes('No selection'), 'the status bar keeps it');
  assert.ok(!code.contextBar.includes('No selection'), 'the context bar no longer repeats it');
});

test('the context bar says something useful in its place', () => {
  const empty = source.contextBar.match(/\{:else if !hasSelection\}[\s\S]*?\{:else\}/)?.[0] ?? '';
  assert.ok(empty, 'the empty branch is still there');
  assert.match(empty, /empty-state/);
  assert.match(empty, /Select a component/, 'it tells the user what to do');
  assert.match(empty, /rail/, 'and where components come from');
});

// --- B10: the Effects placeholder ------------------------------------------------

test('the Effects tab is gone, not merely emptied', () => {
  assert.ok(!/coming soon/i.test(code.displayPanel), 'no "coming soon" placeholder ships');
  assert.ok(!/id: 'effects'/.test(code.displayPanel), 'and no tab in the strip');
  assert.ok(!/activeTab === 'effects'/.test(code.displayPanel), 'and no branch to reach');
});

test('a stored "effects" tab falls back instead of rendering nothing', () => {
  // The sanitiser is the reason removing a tab id is safe: an install whose last tab was
  // Effects would otherwise open on a branch that no longer exists.
  const ids = source.displayPanel.match(/const DISPLAY_TAB_IDS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
  assert.ok(ids, 'the id set is still there');
  assert.ok(!ids.includes("'effects'"), 'effects is not a valid stored tab');
  assert.ok(ids.includes("'layers'"), 'layers is, since it ships as a tab');
  assert.match(source.displayPanel, /if \(!DISPLAY_TAB_IDS\.has\(normalized\)\) return DEFAULT_DISPLAY_TAB;/);
});

// --- B10: the viewer poll --------------------------------------------------------

test('ViewerSettings no longer runs a timer', () => {
  assert.ok(!/setInterval/.test(code.viewerSettings), 'the 100ms poll is gone');
  assert.ok(!/void zoomDisplay/.test(code.viewerSettings), 'and so is the $derived that rode on it');
  assert.match(source.viewerSettings, /createViewerSync\(/, 'reads are event-driven now');
  assert.match(source.viewerSettings, /viewerSync\.attach\(window\)/);
});

// --- B10 / D2: the notepad -------------------------------------------------------

test('the notepad has no execCommand left in it', () => {
  assert.ok(!/execCommand/.test(code.notepadEditor), 'NotepadEditor');
  assert.ok(!/execCommand/.test(code.notepadTab), 'NotepadTab');
  assert.match(source.notepadEditor, /applyInlineStyle\(/);
  assert.match(source.notepadEditor, /insertPlainText\(/);
  assert.match(source.notepadTab, /applyTextColour\(/);
});

test('every programmatic notepad edit is saved, since it raises no input event', () => {
  // execCommand did not fire `input` either — that half of the bug was simply never noticed,
  // because the next keystroke happened to save the DOM anyway.
  const keydown = source.notepadEditor.match(/function handleKeyDown[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.ok(keydown, 'the keydown handler is still there');
  assert.equal((keydown.match(/saveCurrentContent\(\)/g) ?? []).length, 2, 'format and Tab both save');
  assert.match(source.notepadTab, /if \(applied\) editorRef\?\.commitDomEdit\?\.\(\)/);
});

test('the notepad re-syncs on external change, not only on a note switch', () => {
  // D2 exactly: `idx !== lastSyncedIndex` was the whole condition.
  assert.ok(!/idx !== lastSyncedIndex/.test(code.notepadEditor), 'the index-only guard is gone');
  assert.match(source.notepadEditor, /resolveNotepadSync\(\{/);
  assert.match(source.notepadEditor, /domHtml: editorEl\.innerHTML/, 'the DOM is part of the comparison');
  assert.match(source.notepadEditor, /readCaretOffset\(editorEl/, 'the caret is measured before the reload');
  assert.match(source.notepadEditor, /restoreCaretOffset\(editorEl/, 'and put back after it');
});

test('composition is reported to the sync decision, not guessed at', () => {
  assert.match(source.notepadEditor, /oncompositionstart=/);
  assert.match(source.notepadEditor, /oncompositionend=/);
  assert.match(source.notepadEditor, /composing,/);
});

// --- B8: the dock height ----------------------------------------------------------

test('the unconditional per-tab height table is gone from App.svelte', () => {
  assert.ok(!/tabDefaultHeights/.test(code.app), 'no local table');
  assert.ok(!/0\.44/.test(code.app), 'no 44%-of-viewport ceiling');
  assert.match(source.app, /resolveDockHeight\(\{/, 'the policy lives in displayDock.js');
  assert.match(source.app, /userSized: displayHeightUserSized/);
});

test('dragging the splitter marks the height as the user\'s, and that survives a restart', () => {
  assert.match(source.app, /onDragStart: \(\) => \{ isResizingDisplay = true; displayHeightUserSized = true; \}/);
  assert.match(source.app, /displayPanelHeightUserSized: 'ce\.ui\.displayPanelHeightUserSized'/);
  assert.match(source.app, /writeStoredJson\(UI_STORAGE_KEYS\.displayPanelHeightUserSized, displayHeightUserSized\)/);
});

test('a window resize clamps the rendered dock without rewriting the preference', () => {
  const resize = source.app.match(/function handleWindowResize\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.ok(resize, 'the resize handler is still there');
  assert.ok(!/displayPanelHeight =/.test(resize), 'it no longer shrinks the stored height');
  assert.match(source.app, /displayPanelBasis = \$derived\(`\$\{clampDockHeight\(/, 'clamping happens at render');
});

// --- B9: discoverability ------------------------------------------------------------

test('the dock toggle is labelled and says what is in there', () => {
  const toggles = source.iconPanel.match(/<div class="panel-toggles">[\s\S]*?<\/div>\n<\/div>/)?.[0]
    ?? source.iconPanel.slice(source.iconPanel.indexOf('<div class="panel-toggles">'));
  assert.match(toggles, /<span class="btn-label">Dock<\/span>/);
  assert.match(toggles, /<span class="btn-label">Tree<\/span>/);
  assert.match(toggles, /<span class="btn-label">Props<\/span>/);
  assert.match(toggles, /colours, gradients, align, device, console/, 'the tooltip lists what the dock holds');
  assert.match(toggles, /aria-pressed=/, 'and the toggles report their state');
});

test('an action opens the dock on the tab it implies, and tells the parent', () => {
  assert.match(source.displayPanel, /function openTabForAction\(tabId\)/);
  assert.match(source.displayPanel, /openTabForAction\(impliedDockTab\(\{ colorTarget: t/);
  assert.match(source.displayPanel, /openTabForAction\(impliedDockTab\(\{ gradientTarget: t/);
  assert.match(source.displayPanel, /impliedDockTab\(\{ tabRequest: req/);
});

// --- S4: preview's second entry point --------------------------------------------

test('preview is reachable from the icon rail, which is never hidden', () => {
  assert.match(source.iconPanel, /preview-section/);
  assert.match(source.iconPanel, /togglePreviewMode\(\)/);
  assert.match(source.iconPanel, /<span class="btn-label">\{\$previewModeEnabled \? 'Stop' : 'Preview'\}<\/span>/);
});

test('the preview button does not depend on the panel toggles the app disables below 920px', () => {
  // The whole point: `togglesEnabled` goes false in compact and owned-chrome workspaces, and
  // that is what used to take the only route to preview down with it.
  const button = source.iconPanel.match(/<div class="rail-section preview-section">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.ok(button, 'the preview section exists');
  assert.ok(!/togglesEnabled/.test(button), 'it is gated on canPreview, not on the panel toggles');
  assert.match(source.iconPanel, /let canPreview = \$derived\(previewEnabled && !!\$activePanel\)/);
  assert.match(source.app, /previewEnabled=\{workspaceChrome\.workspaceKind === 'panel'\}/);
});

// --- S3: the alignment strip and the missing Cancel --------------------------------

test('the alignment panel wraps instead of scrolling its sections off screen', () => {
  const styles = stylesOf(source.alignment);
  const panel = styles.match(/\.align-panel \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.ok(panel, '.align-panel is still styled here');
  assert.match(panel, /flex-wrap: wrap/);
  assert.ok(!/overflow-x: auto/.test(panel), 'the horizontal scroll strip is gone');
  assert.match(panel, /overflow-y: auto/, 'it scrolls on the axis the dock already has a handle for');
  assert.match(panel, /align-content: flex-start/);
});

test('every alignment section is still present to be wrapped', () => {
  // Wrapping is only a fix if nothing was quietly dropped to make it fit.
  for (const label of ['Align To', 'Align', 'Distribute', 'Spacing', 'Order', 'Size', 'Layout']) {
    assert.ok(source.alignment.includes(`>${label}<`), `the ${label} section is still there`);
  }
});

test('the colour context bar offers a real Cancel, not just Done', () => {
  assert.match(source.displayPanel, /class="context-cancel"[\s\S]{0,120}onclick=\{handleColorCancel\}/);
  const cancel = source.displayPanel.match(/function handleColorCancel\(\)[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.ok(cancel, 'handleColorCancel exists');
  assert.match(cancel, /_initialColor/, 'it restores the value captured when the target was armed');
  assert.match(cancel, /applyColorToTarget\(/, 'and writes it back — clearing the target would not');
  assert.match(cancel, /clearColorTarget\(\)/);
});

test('cancelling a deferred colour mode refuses to commit rather than reverting after the fact', () => {
  const cancel = source.displayPanel.match(/function handleColorCancel\(\)[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.match(cancel, /editingGradientStop = null/, 'the stop edit is dropped, not committed');
  assert.ok(!/commitStopColor\(\)/.test(cancel), 'and commitStopColor is not called on this path');
  assert.match(cancel, /pickingNotepadColor = false/);
});

test('the gradient half got the same exit', () => {
  assert.match(source.displayPanel, /class="context-cancel"[\s\S]{0,140}onclick=\{handleGradientCancel\}/);
  const cancel = source.displayPanel.match(/function handleGradientCancel\(\)[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.match(cancel, /_initialGradient/);
  assert.match(cancel, /applyGradientToTarget\(/);
});
