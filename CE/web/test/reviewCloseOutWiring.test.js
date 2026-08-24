// reviewCloseOutWiring.test.js — the cross-file joins made when the 2026-08-13 GUI review was
// closed out.
//
// Each package of that work was implemented against files it owned, which left a handful of
// seams that no single package could test: a store exports the mechanism, and a component in
// somebody else's file is the only thing that calls it. Those calls are exactly the kind that
// get quietly dropped in a later refactor and are never noticed, because nothing fails loudly —
// the arrow-nudge tail just silently stops closing its own undo step again.
//
// Two of these are asserted against component source rather than by driving a real event: the
// node suite compiles Svelte to SSR and has no DOM, so a keyup cannot be dispatched. That is a
// weaker test than a behavioural one and is only used where the alternative is no test at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

// --- E1/S6: the held-arrow-key flush -----------------------------------------------------------
// history.js commits a debounced step 400 ms after the LAST change, so an autorepeating arrow key
// leaves its final nudge uncommitted until something unrelated pushes it out. Releasing the key
// is the real end of that gesture. There are two key paths — the canvas wrapper's own handler and
// App's window-level fallback for when focus has wandered — and BOTH have to flush or the bug
// comes back for exactly the cases the fallback exists to cover.

test('the canvas keyup handler flushes history for the arrow keys', () => {
  const s = src('CE_Application/editor/EditorCanvas.svelte');
  assert.match(s, /import \{[^}]*\bflushHistory\b[^}]*\} from '\.\.\/stores\/history\.js'/);
  const handler = s.slice(s.indexOf('function handleEditorKeyUp'));
  const body = handler.slice(0, handler.indexOf('\n  }'));
  assert.match(body, /ARROW_KEYS\.has\(e\.key\)/, 'keyup must test for an arrow key');
  assert.match(body, /flushHistory\(\)/, 'keyup must flush the pending nudge step');
});

test('the window-level fallback flushes too, and not while typing', () => {
  const s = src('App.svelte');
  assert.match(s, /onkeyup=\{handleGlobalKeyUp\}/, 'the window needs a keyup binding at all');
  const handler = s.slice(s.indexOf('function handleGlobalKeyUp'));
  const body = handler.slice(0, handler.indexOf('\n  }'));
  assert.match(body, /isEditableTarget\(e\.target\)/, 'an arrow inside a text field is not a nudge');
  assert.match(body, /flushHistory\(\)/);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.ok(body.includes(key), `${key} must be covered by the fallback flush`);
  }
});

test('the nudge tags its burst so two directions inside the window stay two steps', async () => {
  const s = src('CE_Application/utils/editorShortcuts.js');
  assert.match(s, /import \{ tagNextChange \} from '\.\.\/stores\/history\.js'/);
  // The tag must vary with direction AND step size — history's derived tag cannot tell a left
  // nudge from an up nudge, because both touch exactly the same set of controls.
  const tagLine = s.match(/tagNextChange\(`([^`]+)`\)/);
  assert.ok(tagLine, 'the nudge must tag its change');
  assert.match(tagLine[1], /\$\{arrowAxis\}/);
  assert.match(tagLine[1], /\$\{arrowDir\}/);
  // and it must be tagged BEFORE the writes it is meant to label
  assert.ok(
    s.indexOf('tagNextChange(') < s.indexOf('for (const c of nudgeable)'),
    'the tag has to be set before the store writes it labels',
  );
});

// --- A8: Alt resizes about the centre, on single controls too ----------------------------------
// The group box got `fromCenter` when the maths landed; the single-control call site is in a file
// the geometry package did not own, so it was left unwired and Alt did nothing on one control.

test('single-control resize passes fromCenter and suspends positional snapping for it', () => {
  const s = src('CE_Application/editor/CanvasControl.svelte');
  assert.match(s, /const fromCenter = e\.altKey === true;/);
  assert.match(s, /const resizeOpts = \{\s*\n\s*fromCenter,/, 'resizeOpts must carry the flag');
  // A grid/align snap moves x/y, which walks the centre off the point Alt is pinning.
  assert.match(s, /const snapSuspended = e\.ctrlKey \|\| e\.metaKey \|\| fromCenter;/);
});

// --- D9: the F1 overlay must not describe gestures the app no longer has -----------------------

test('the shortcuts overlay does not advertise right-drag panning any more', () => {
  const overlay = src('CE_Application/layout/ShortcutsOverlay.svelte');
  assert.ok(
    !/Right Drag/.test(overlay),
    'right-drag no longer pans (canvasInteractions dropped it), so the row must be gone',
  );
  const interactions = src('CE_Application/utils/canvasInteractions.js');
  assert.ok(
    !/button === 2[\s\S]{0,80}startPan/.test(interactions),
    'and the overlay is only right if the handler really is gone',
  );
  // The gestures that replaced it are documented.
  assert.match(overlay, /Alt\+Resize/);
  assert.match(overlay, /Esc \(dragging\)/);
});

// --- D6/E6: Open Recent is empty unless the open/save paths record into it ---------------------

test('panels record themselves in the recent-files store on save and on open', () => {
  const s = src('CE_Application/stores/panels.js');
  assert.match(s, /import \{ rememberRecentFile \} from '\.\/recentFiles\.js'/);
  const calls = s.match(/rememberRecentFile\(\{ kind: 'panel'/g) ?? [];
  assert.equal(calls.length, 2, 'both the saved and the opened path must record');
});

test('script workspaces record themselves too', () => {
  const s = src('CE_Application/stores/scriptWorkspace.js');
  assert.match(s, /import \{ rememberRecentFile \} from '\.\/recentFiles\.js'/);
  const calls = s.match(/rememberRecentFile\(\{ kind: 'script'/g) ?? [];
  assert.equal(calls.length, 2, 'both the saved and the opened path must record');
});

test('panels.js does not import history.js — that would close an import cycle', () => {
  // history.js imports panels.js. The saved-state marker is therefore adopted by history's own
  // subscription rather than pushed from here; if someone later "tidies" that into a direct
  // markContextSaved() call, this fails and explains why.
  const s = src('CE_Application/stores/panels.js');
  assert.ok(!/from '\.\/history\.js'/.test(s));
  assert.match(src('CE_Application/stores/history.js'), /from '\.\/panels\.js'/);
});

// --- E1/S6: a registered context can clear its own stack ---------------------------------------

test('clearHistory takes a {kind,id} form for registered contexts', async () => {
  const { clearHistory } = await import('../src/CE_Application/stores/history.js');
  // Both shapes have to be callable without throwing; the bare-id form is the old panel/component
  // path and must keep working untouched.
  assert.doesNotThrow(() => clearHistory(41));
  assert.doesNotThrow(() => clearHistory({ kind: 'deviceProfile', id: 'dp-1' }));
  // A malformed target must not silently wipe the panel keys.
  assert.doesNotThrow(() => clearHistory({ id: 'no-kind' }));
});

test('the device profile designer clears its stack through that form', () => {
  const s = src('CE_Application/editor/dpd/dpdHistory.js');
  assert.match(s, /clearHistory\(\{ kind: DPD_HISTORY_KIND, id \}\)/);
  assert.match(s, /import \{[\s\S]*?\bclearHistory\b[\s\S]*?\} from '\.\.\/\.\.\/stores\/history\.js'/);
});

// --- B5: abandonment means the same thing in both in-flight colour modes -----------------------

test('an abandoned notepad colour pick commits, exactly as a gradient stop edit does', () => {
  const s = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(s, /function commitNotepadPick\(\)/);
  // Three callers: the explicit Back button, tab-away, and dock-close. Before this, tab-away and
  // dock-close threw the pick away while the neighbouring stop edit committed.
  const calls = s.match(/commitNotepadPick\(\)/g) ?? [];
  assert.equal(calls.length, 4, 'one definition plus three call sites');
  assert.ok(
    !/Leaving colors without going back — discard the pick/.test(s),
    'the discarding branch must be gone, not merely bypassed',
  );
});

// --- B7: one gradient, one proxy shape ---------------------------------------------------------

test('the mini preview derives its shape from the real target, like the editor', () => {
  const s = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(s, /proxyShapeKind\(deriveProxyGeometry\(\$gradientTarget, \$activePanel\)\)/);
  assert.match(s, /\$gradientShapeOverride \?\?/, 'a manual override still wins');
  assert.ok(
    !/let gradientShape = \$state\(/.test(s),
    'the hand-held rectangle default is what B7 was about; it must not survive as local state',
  );
});

// --- D8: the reveal command is not a dead menu row ---------------------------------------------

test('revealFile has a native listener, so the menu row is not inert', () => {
  const cpp = readFileSync(resolve(here, '..', '..', 'src', 'ValueTreeBridgeHandlers.cpp'), 'utf8');
  assert.match(cpp, /\.withEventListener \("revealFile"/);
  assert.match(cpp, /revealToUser\(\)/);
  // A path that has since moved should still get the user somewhere useful.
  assert.match(cpp, /getParentDirectory\(\)\.revealToUser\(\)/);
  const js = src('CE_Application/bridge/revealFile.js');
  assert.match(js, /emitEvent\('revealFile'/);
  assert.ok(!/NATIVE HALF STILL OUTSTANDING/.test(js), 'the JS comment must not still claim it is missing');
});

// --- E3: card presets travel, without churning every existing document -------------------------

test('an empty cardPresets list is omitted from the serialised document', async () => {
  const { createPanel, serializePanel, deserializePanel } =
    await import('../src/CE_Application/stores/panelModel.js');

  const plain = JSON.parse(serializePanel(createPanel('Plain')));
  assert.ok(!('cardPresets' in plain), 'a panel with no presets writes no key');

  const withPresets = createPanel('Styled');
  withPresets.cardPresets = [{ id: 'p1', name: 'Chrome' }];
  const written = JSON.parse(serializePanel(withPresets));
  assert.deepEqual(written.cardPresets, [{ id: 'p1', name: 'Chrome' }]);

  // And it survives the round trip.
  const back = deserializePanel(serializePanel(withPresets), '', 'Styled');
  assert.deepEqual(back.cardPresets, [{ id: 'p1', name: 'Chrome' }]);

  // Junk is dropped rather than carried forward for ever.
  const junk = createPanel('Junk');
  junk.cardPresets = ['nope', null, { noId: true }, { id: 'ok' }, { id: 'ok' }];
  assert.deepEqual(JSON.parse(serializePanel(junk)).cardPresets, [{ id: 'ok' }]);
});

// --- E6: the new-panel dialog offers a way back to recent work ---------------------------------

test('the new panel dialog lists recent panels', () => {
  const s = src('CE_Application/layout/NewPanelDialog.svelte');
  assert.match(s, /import \{ recentFiles, recentFileKey, recentFileLabel \} from '\.\.\/stores\/recentFiles\.js'/);
  assert.match(s, /entry\.kind === 'panel'/, 'only panels — this dialog makes panels');
  assert.match(s, /openRecentFile\(entry\)/);
  assert.match(s, /closeNewPanelDialog\(\);/);
});
