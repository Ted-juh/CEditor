import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

function functionBody(source, name, next = '\n  function ') {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(next, start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

test('asset imports and bakes reject a result after their target control changes', () => {
  const dock = src('CE_Application/components/AssetsTab.svelte');
  for (const name of ['importAsset', 'runBake']) {
    const body = functionBody(dock, name);
    assert.match(body, /const targetId = controlId/);
    assert.match(body, /controlId !== targetId/);
    assert.match(body, /applyControlPatch\(targetId/);
  }

  const editor = src('CE_Application/sections/CustomAssetsEditor.svelte');
  for (const name of ['importFilmstripFile', 'importImageFile', 'bakeFilmstrip']) {
    const body = functionBody(editor, name);
    assert.match(body, /const targetId = core\.id/);
    assert.match(body, /core\?\.id !== targetId/);
    assert.match(body, /applyControlPatch\(targetId/);
  }
  const filmstripImport = functionBody(editor, 'importFilmstripFile');
  assert.match(filmstripImport, /const targetSelection = selectedFilmstrip/);
  assert.match(filmstripImport, /const targetFilmstrip = filmstrip \?/);
  assert.match(filmstripImport, /if \(selectedFilmstrip === targetSelection\)/);
  const imageImport = functionBody(editor, 'importImageFile');
  assert.match(imageImport, /const targetSelection = selectedImage/);
  assert.match(imageImport, /if \(selectedImage === targetSelection\)/);
});

test('file-reader callbacks never resolve through the newly selected control', () => {
  const cases = [
    ['CE_Application/sections/CustomPublicPropertiesEditor.svelte', 'setPropertyFile'],
    ['CE_Application/sections/DisplayEditor.svelte', 'onPickImage'],
    ['CE_Application/sections/DisplayEditor.svelte', 'onPickAnim'],
    ['CE_Application/sections/PixelDisplayEditor.svelte', 'onPickImage'],
    ['CE_Application/sections/PixelDisplayEditor.svelte', 'onPickAnim'],
    ['CE_Application/sections/PixelDisplayEditor.svelte', 'onPickCustomFont'],
    ['CE_Application/sections/PixelDisplayEditor.svelte', 'onPickElementAnim'],
  ];
  for (const [file, name] of cases) {
    const body = functionBody(src(file), name);
    assert.match(body, /const targetId = core\.id/, `${file}:${name} captures its target`);
    assert.match(body, /core\?\.id !== targetId/, `${file}:${name} abandons a stale callback`);
  }
});

test('the section editor loader reports failures, retries, and gates stale components by tab', () => {
  const source = src('CE_Application/panels/SectionRenderer.svelte');
  assert.match(source, /\.catch\(\(error\) =>/);
  assert.match(source, /editorComponentKey === `\$\{contextMode\}:\$\{tabId\}`/);
  assert.match(source, />Retry<\/button>/);
  assert.match(source, /retryKey \+= 1/);
});

test('gradient document drags share teardown and stop on window blur or unmount', () => {
  const source = src('CE_Application/components/GradientEditor.svelte');
  assert.match(source, /function startDocumentDrag/);
  assert.match(source, /window\.addEventListener\('blur', finish\)/);
  assert.match(source, /window\.removeEventListener\('blur', finish\)/);
  assert.match(source, /onDestroy\(\(\) => \{[\s\S]*clearActiveDragListeners\?\.\(\)/);
  assert.equal((source.match(/startDocumentDrag\(onMove, onUp\)/g) ?? []).length, 3);
});

test('interactive surfaces cancel pointer sessions on cancellation and lost focus', () => {
  for (const file of [
    'CE_Application/components/InteractiveSelectGroupSurface.svelte',
    'CE_Application/components/InteractiveTestSurface.svelte',
  ]) {
    const source = src(file);
    assert.match(source, /addEventListener\('pointercancel'/, `${file} listens for cancellation`);
    assert.match(source, /removeEventListener\('pointercancel'/, `${file} removes the cancellation listener`);
    assert.match(source, /addEventListener\('blur'/, `${file} resets on lost focus`);
    assert.match(source, /removeEventListener\('blur'/, `${file} removes the blur listener`);
  }
});

test('the layer rename field is not nested in its row button', () => {
  const source = src('CE_Application/sections/SurfaceDockLayers.svelte');
  const renameBranch = source.slice(source.indexOf('{#if renamingLayer === name}'), source.indexOf('{:else}', source.indexOf('{#if renamingLayer === name}')));
  assert.match(renameBranch, /<div class="row-main rename-main">/);
  assert.match(renameBranch, /<input/);
  assert.ok(!/<button[^>]*class="row-main"/.test(renameBranch));
});

test('nested text line colour targets stay inside their configured text path', () => {
  const source = src('CE_Application/sections/TextEditor.svelte');
  const body = functionBody(source, 'handleLineColorSwatch');
  assert.match(body, /path: scopeTextPath\(`Text\.Font\.\$\{name\}`\)/);
  assert.doesNotMatch(body, /path: `Text\.Font\.\$\{name\}`/);
});

test('segment shell colour callbacks stay bound to the captured control and scope', () => {
  const source = src('CE_Application/sections/SegmentsEditor.svelte');
  const capture = functionBody(source, 'captureWholeShellTarget');
  assert.match(capture, /const controlId = core\?\.id/);
  assert.match(capture, /core\?\.id !== controlId/);
  assert.match(capture, /const inheritedValues = new Map/);
  assert.match(capture, /\{ controlId, targetIds, stateName, inheritedValues \}/);

  const write = functionBody(source, 'writeWholeShellValue');
  assert.match(write, /updateControlProperty\(controlId/);
  assert.doesNotMatch(write, /updateControlProperty\(core\.id/);
});

test('performance hold actions release on tab changes, blur, and unmount', () => {
  const source = src('CE_Application/sections/PerformancePanel.svelte');
  assert.match(source, /function releaseHeldPerformanceActions/);
  assert.match(source, /window\.addEventListener\('blur', releaseHeldPerformanceActions\)/);
  assert.match(source, /onDestroy\(releaseHeldPerformanceActions\)/);
  assert.match(source, /if \(tab !== 'clips' && heldFillClipIds\.size > 0\)/);
  assert.match(source, /if \(tab !== 'envelopes' && heldEnvelopeIds\.size > 0\)/);
  assert.match(source, /onpointerdown=\{\(\) => setEnvelopeAuditionHeld/);
  assert.match(source, /setFillHeld\(clip\.clipId, true\)/);
});

test('context bar multi-selection colours stay bound to the original panel and controls', () => {
  const source = src('CE_Application/layout/ContextBar.svelte');
  const body = functionBody(source, 'openColour');
  assert.match(body, /const targetIds = \[\.\.\.\$selectedComponentIds\]/);
  assert.match(body, /const targetPanelId = \$resolvedActivePanelId/);
  assert.match(body, /applyControlPatchesById\(/);
  assert.match(body, /targetPanelId/);
  assert.doesNotMatch(body, /apply: \(hex\) => updateSelectedProperty/);
});

test('design surface multi-layer colours stay bound to the selection that opened the swatch', () => {
  const source = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const body = functionBody(source, 'openLayerColour');
  assert.match(body, /const controlId = core\.id/);
  assert.match(body, /const targetLayerNames = selectedLayerNames\.filter/);
  assert.match(body, /for \(const name of targetLayerNames\)/);
  assert.match(body, /updateControlProperty\(controlId/);
  assert.doesNotMatch(body, /for \(const name of selectedLayerNames\)/);
});

test('script notification expiry sleeps while there are no toasts', () => {
  const source = src('CE_Application/layout/ScriptNotifications.svelte');
  assert.match(source, /\$effect\(\(\) => \{/);
  assert.match(source, /if \(\$scriptNotifications\.length === 0\) return;/);
  assert.match(source, /return \(\) => clearInterval\(handle\)/);
  assert.doesNotMatch(source, /onMount/);
});

test('display dock deferred edits keep their original destination and lazy failures can retry', () => {
  const source = src('CE_Application/panels/DisplayPanel.svelte');
  const openStop = functionBody(source, 'handleEditStopColor');
  const commitStop = functionBody(source, 'commitStopColor');
  assert.match(openStop, /editingGradientStopDestination = gradientDestinationIdentity\(\)/);
  assert.match(openStop, /openTabForAction\('colors'\)/);
  assert.match(commitStop, /editingGradientStopDestination !== gradientDestinationIdentity\(\)/);
  assert.match(source, /function retryActiveTab\(\)/);
  assert.match(source, /onclick=\{retryActiveTab\}>Retry<\/button>/);
});

test('notepad colour return preserves newer markup and active note changes are persisted', () => {
  const display = src('CE_Application/panels/DisplayPanel.svelte');
  const commit = functionBody(display, 'commitNotepadPick');
  assert.match(commit, /scratch\.innerHTML = sanitizeNotepadHtml\(sourceNote\.content/);
  assert.match(commit, /scratch\.textContent !== snapshotScratch\.textContent/);

  const tab = src('CE_Application/panels/NotepadTab.svelte');
  assert.match(tab, /function handleActiveIndexChange\(index\)/);
  assert.match(tab, /onactivechange=\{handleActiveIndexChange\}/);
  assert.match(tab, /JSON\.stringify\(notes\) !== JSON\.stringify\(nextNotes\)/);
  assert.match(tab, /if \(activeIndex !== nextIndex\) activeIndex = nextIndex/);
});

test('display child tabs reset after a panel closes and the same id reopens', () => {
  const source = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(source, /const nextPanelId = panel\?\.id \?\? null/);
  assert.match(source, /lastPanelId = nextPanelId/);
  assert.match(source, /panelResetKey\+\+;\s*\n\s*if \(!panel\)/);
});

test('custom fonts materialise the optional Pixel font object before setting its source', () => {
  const source = src('CE_Application/sections/PixelDisplayEditor.svelte');
  const body = functionBody(source, 'onPickCustomFont');
  assert.match(body, /withPixelCustomFontSource\(pixel\?\.customFont, reader\.result\)/);
  assert.doesNotMatch(body, /Pixel\.customFont\.src/);
});

test('gradient gestures refuse to commit after their target changes', () => {
  const source = src('CE_Application/components/GradientEditor.svelte');
  assert.match(source, /stopEditOwner = gradientEditOwner\(\)/);
  assert.match(source, /gradientEditOwner\(\) !== stopEditOwner/);
  assert.equal((source.match(/if \(gradientEditOwner\(\) !== owner\) return;/g) ?? []).length, 3);
});

test('surface shortcuts leave focused interactive controls alone', () => {
  const source = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const body = functionBody(source, 'surfaceKeyEventAllowed');
  assert.match(body, /isSurfaceEditorShortcutAllowed\(event\)/,
    'the surface uses the key-specific gate covered by editorShortcutFocus tests');
});

test('dock tabs expose keyboard tab semantics and icon buttons have accessible names', () => {
  const tabs = src('CE_Application/panels/TabIconBar.svelte');
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{isActive\(tab\.id\)\}/);
  assert.match(tabs, /event\.key === 'ArrowUp'/);
  assert.match(tabs, /event\.key === 'Home'/);
  const keyHandler = tabs.slice(tabs.indexOf('function handleTabKeydown'), tabs.indexOf('</script>'));
  assert.doesNotMatch(keyHandler, /onclick\?\.\(/,
    'arrow-key navigation should move focus without toggling the open tab selection');
  assert.match(tabs, /focusedTabId = tabs\[next\]\.id/);
  assert.match(tabs, /tabindex=\{focusedTabId \?/,
    'manual activation still needs a roving tab stop on the focused tab');

  const toolbar = src('CE_Application/panels/PropertiesToolbar.svelte');
  const buttons = [...toolbar.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]);
  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.match(button, /aria-label=/, `icon-only toolbar button needs a name: ${button.slice(0, 90)}`);
  }
});

test('document colour scans and MIDI test fallbacks release their timers', () => {
  const display = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(display, /documentColourTimer = setTimeout\(scan, 80\)/);
  assert.match(display, /onDestroy\(\(\) => \{[\s\S]*clearTimeout\(documentColourTimer\)/);

  const midi = src('CE_Application/settings/MidiSettings.svelte');
  assert.match(midi, /const testTimers = new Map\(\)/);
  assert.match(midi, /if \(testTimers\.has\(row\.role\)\) clearTimeout/);
  assert.match(midi, /onDestroy\(\(\) => \{[\s\S]*testTimers\.clear\(\)/);
});

test('component tree collapse state is bounded', () => {
  const source = src('CE_Application/panels/ComponentTree.svelte');
  assert.match(source, /while \(collapsedByPanel\.size > 64\)/);
  assert.match(source, /collapsedByPanel\.delete\(collapsedByPanel\.keys\(\)\.next\(\)\.value\)/);
  assert.match(source, /onDestroy\(\(\) => \{[\s\S]*clearTimeout\(renameNoticeTimer\)[\s\S]*stopDragAutoScroll\(\)/);
});

test('panel metadata and background browse results stay with their originating panel', () => {
  const source = src('CE_Application/panels/PanelCardContent.svelte');
  assert.match(source, /result\?\.filePath === panel\?\.filePath/);
  assert.match(source, /pendingBackgroundBrowse = \{ requestId, panelId: panel\.id, prop \}/);
  assert.match(source, /updatePanel\(pending\.panelId, \{ \[pending\.prop\]: result\.filePath \}\)/);
  assert.match(source, /onDestroy\(\(\) => \{[\s\S]*removeFileInfoListener\?\.\(\)[\s\S]*removeImageBrowsedListener\?\.\(\)/);
});

test('text image browsing removes its native event listener on unmount', () => {
  const source = src('CE_Application/sections/TextEditor.svelte');
  assert.match(source, /const removeImageBrowsedListener = onImageBrowsed/);
  assert.match(source, /onDestroy\(removeImageBrowsedListener\)/);
});

test('timbre capture availability reacts to live preview sessions', () => {
  const source = src('CE_Application/sections/TimbreEditor.svelte');
  assert.match(source, /const sessions = \$panelPreviewSessions \?\? \{\}/);
  assert.doesNotMatch(source, /get\(panelPreviewSessions\)/);
});

test('parameter browser has one owner for initial and profile-change refreshes', () => {
  const source = src('CE_Application/components/ParameterBrowserTab.svelte');
  const mount = source.slice(source.indexOf('onMount(() => {'), source.indexOf('\n  });', source.indexOf('onMount(() => {')));
  const change = functionBody(source, 'handleProfileChange');
  assert.doesNotMatch(mount, /refreshProfileParameters/);
  assert.doesNotMatch(change, /refreshProfileParameters/);
  assert.match(source, /lastParameterRefreshProfileId = selectedProfileId;\s*refreshProfileParameters\(selectedProfileId\)/);
});

test('parameter browser ignores stale clipboard completions after a newer request or unmount', () => {
  const source = src('CE_Application/components/ParameterBrowserTab.svelte');
  const copy = functionBody(source, 'copyMonitorDetail');
  assert.match(source, /onDestroy\(\(\) => \{\s*disposed = true;\s*monitorCopyGeneration \+= 1;/);
  assert.match(copy, /const generation = \+\+monitorCopyGeneration/);
  assert.match(copy, /if \(disposed \|\| generation !== monitorCopyGeneration\) return;/);
});

test('screen preview rejection does not update state after teardown', () => {
  const source = src('CE_Application/sections/ScreenBuilderEditor.svelte');
  assert.match(source, /\.catch\(\(err\) => \{\s*if \(!disposed\) previewError =/);
});

test('phrase cell selection follows a grid that shrinks', () => {
  const source = src('CE_Application/sections/PhraseEditor.svelte');
  assert.match(source, /const lastStep = Math\.max\(0, steps - 1\)/);
  assert.match(source, /if \(selStep > lastStep\) selStep = lastStep/);
  assert.match(source, /if \(selRow > lastRow\) selRow = lastRow/);
});

test('setlist capture evaluates the panel snapshot once', () => {
  const source = src('CE_Application/sections/SetlistEditor.svelte');
  const capture = functionBody(source, 'capture');
  assert.equal((capture.match(/captureScene\(/g) ?? []).length, 1);
});

test('surface mode groups expose their selected radio state', () => {
  const source = src('CE_Application/sections/SurfaceBottomBar.svelte');
  assert.match(source, /role="radio" aria-checked=\{\$creatorMode === 'simple'\}/);
  assert.match(source, /role="radiogroup" aria-label="Zone display mode"/);
  assert.match(source, /role="radio" aria-checked=\{zoneDisplayMode === 'all'\}/);
});

test('generated-source editing is delegated to the surface owner', () => {
  const layers = src('CE_Application/sections/SurfaceDockLayers.svelte');
  const surface = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(layers, /editGeneratedSource = \(\) => \{\}/);
  assert.match(layers, /onclick=\{\(event\) => editGeneratedSource\(source\.source, event\)\}/);
  assert.doesNotMatch(layers, /dockTab\s*=/);
  assert.match(surface, /function editGeneratedSource\(source, event = null\)/);
  assert.match(surface, /\{editKitParts\} \{editGeneratedSource\} \{editGeneratorForLayer\}/);
});

test('filmstrip bake busy state cannot be cleared by an older control request', () => {
  const source = src('CE_Application/sections/CustomAssetsEditor.svelte');
  const bake = functionBody(source, 'bakeFilmstrip');
  assert.match(source, /if \(nextControlId === bakeControlId\) return;[\s\S]*bakeGeneration \+= 1;[\s\S]*bakeBusy = false;/);
  assert.match(bake, /const generation = \+\+bakeGeneration/);
  assert.match(bake, /if \(core\?\.id === targetId && generation === bakeGeneration\) bakeBusy = false/);

  const dock = src('CE_Application/components/AssetsTab.svelte');
  const dockBake = functionBody(dock, 'runBake');
  assert.match(dock, /if \(nextControlId === bakeControlId\) return;[\s\S]*bakeGeneration \+= 1;[\s\S]*bakeBusy = false;/);
  assert.match(dockBake, /const generation = \+\+bakeGeneration/);
  assert.match(dockBake, /if \(controlId === targetId && generation === bakeGeneration\) bakeBusy = false/);
});
