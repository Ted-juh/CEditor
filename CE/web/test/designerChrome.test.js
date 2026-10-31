// designerChrome.test.js — controls in and around the Component Designer that pointed nowhere or
// sat on top of each other.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

test('the properties panel offers to open the designer only when it is not open', () => {
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panel, /\{#if \$componentWorkspaceMode !== 'surface'\}\s*<button[\s\S]{0,200}data-testid="properties-component-designer-launch"/);
});

test('the layer quick bar says what its buttons do with icons, not letters, and stays off the tool strip', () => {
  const source = src('CE_Application/sections/SurfaceQuickbar.svelte');
  const bar = source.match(/<div\s+class="selection-quickbar"[\s\S]*?\n<\/div>/)?.[0] ?? '';
  assert.ok(bar, 'the quick bar has its markup');
  assert.match(src('CE_Application/sections/CustomDesignSurfaceEditor.svelte'), /<SurfaceQuickbar\b/, 'and the designer draws it');
  // C, P, F and B were Copy, Paste, Bring to front and Send to back.
  assert.doesNotMatch(bar, />\s*[CPFB]\s*</, 'no single-letter buttons');
  for (const icon of ['CopyPlus', 'Copy', 'ClipboardPaste', 'BringToFront', 'SendToBack']) {
    assert.match(bar, new RegExp(`<${icon} size=\\{13\\}`), icon);
  }
  // It floated over the canvas: at the bottom right it covered the tool strip, at the top the
  // selection's name and the alignment bar above a selection. It is drawn in the look bar now.
  const style = source.match(/\.selection-quickbar \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.doesNotMatch(style, /position: absolute/);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /\{#snippet actions\(\)\}\s*\{#if activeSelectionFrame[^}]*\}\s*<SurfaceQuickbar/);
  assert.match(designer, /\{#snippet notice\(\)\}\s*\{#if !readinessNudgeDismissed && readinessNudgeSteps\.length\}\s*<div class="readiness-nudge"/);
  const lookBar = src('CE_Application/sections/SurfaceLookBar.svelte');
  assert.match(lookBar, /<div class="lookbar-middle">\s*\{@render notice\?\.\(\)\}\s*\{@render actions\?\.\(\)\}/);
  // Nothing of the two is placed over the canvas any more.
  assert.doesNotMatch(designer, /\.readiness-nudge \{[^}]*position: absolute/);
});

test('the header counts say "1 hit zone" and "1 layer"', () => {
  const canvas = src('CE_Application/editor/EditorCanvas.svelte');
  assert.match(canvas, /\{\$componentDesignerStatus\.zoneCount === 1 \? 'hit zone' : 'hit zones'\}/);
  assert.match(canvas, /\{\$componentDesignerStatus\.layerCount === 1 \? 'layer' : 'layers'\}/);
});

test('the designer\'s Preview draws no hit-zone names over the component unless Zones is on', () => {
  // The knob in Preview carried a "grab" label; Preview is meant to look like the panel.
  const surface = src('CE_Application/components/InteractiveTestSurface.svelte');
  assert.match(surface, /\{#if showHitZones && isCustomComponent && customHitZoneOverlayEntries\.length\}/);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const uses = designer.match(/<InteractiveTestSurface[\s\S]*?\/>/g) ?? [];
  assert.equal(uses.length, 2);
  assert.match(uses[0], /\{showHitZones\}/, 'the stage follows the Zones toggle, which Preview turns off');
  assert.match(uses[1], /showHitZones=\{false\}/, 'the dock\'s live preview never draws them');
});

test('a component opens fitted to the surface, and the names above it stay their size at any zoom', () => {
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /if \(!id \|\| !surfaceScrollEl \|\| !shellHeight \|\| id === fittedComponentId\) return;\s*fittedComponentId = id;[\s\S]{0,400}?untrack\(clearSurfaceSelection\);\s*requestAnimationFrame\(fitArtboardToView\);/);
  // The fit keeps clear of the tool strip along the bottom and leaves room above for the name tray.
  assert.match(designer, /const bottom = Math\.max\(48, strip \+ 16\);/);
  assert.match(designer, /const heightFit = \(surfaceScrollEl\.clientHeight - top - bottom\) \/ Math\.max\(1, artboardHeight\);/);
  assert.match(designer, /--surface-unzoom:\$\{1 \/ surfaceZoom\};/);
  const tray = designer.slice(designer.indexOf('  .surface-name-tray {')).match(/\{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(tray, /transform: scale\(var\(--surface-unzoom, 1\)\) translateY\(calc\(-100% - 8px\)\);/, 'the name tray');
  assert.match(designer, /transform: scale\(var\(--surface-unzoom, 1\)\) translateY\(calc\(-100% - 12px\)\);/, 'the layer and zone labels');
});

test('the Simple Interact card has each behaviour\'s Pointer, Keyboard, Wheel and Snap', () => {
  const interact = src('CE_Application/sections/CustomInteractEditor.svelte');
  assert.match(interact, /<FlagStrip flags=\{inputFlags\(behavior\)\} ontoggle=\{\(key, next\) => setBehaviorField\(behaviorName, `interaction\.\$\{key\}`, next\)\} \/>/);
  // Read as behaviorTakesInput reads them: Wheel off unless on, the rest on unless off.
  assert.match(interact, /on: interaction\.wheel === true/);
  for (const key of ['pointer', 'keyboard', 'snap']) assert.match(interact, new RegExp(`on: interaction\\.${key} !== false`));
});

test('a library copy\'s Contract says the contract is its package\'s, and suggests colours before ticks', () => {
  const contract = src('CE_Application/sections/CustomPublishedPropertiesEditor.svelte');
  assert.match(contract, /\{#if sourcePackage\}\s*<!--[\s\S]*?-->\s*<div class="copy-contract-note" role="note">/);
  assert.match(contract, /its contract is the package's\. A change here is a design edit of this copy/);
  // Sections live under _children; part.Background found none, so no colour was ever suggested.
  assert.match(contract, /const sections = part\?\._children \?\? part \?\? \{\};/);
  assert.match(contract, /if \(runParts\.has\(name\)\) continue;/);
  assert.match(contract, /const SUGGESTION_ORDER = \{ Colour: 0, Text: 1, Visible: 2, Opacity: 3 \};/);
});

test('the layer list is one line a row and folds a numbered run of five or more', () => {
  const layers = src('CE_Application/sections/SurfaceDockLayers.svelte');
  assert.match(layers, /const RUN_MIN = 5;/);
  assert.match(layers, /const runPrefix = \(name\) => \/\^\(\.\*\?\)\\d\+\$\/\.exec\(name\)\?\.\[1\] \?\? null;/);
  // Open while a layer in it is selected; a click decides until one is next selected.
  assert.match(layers, /\{@const open = runOpenState\.has\(row\.id\) \? runOpenState\.get\(row\.id\) : row\.entries\.some\(\(\[member\]\) => isLayerSelected\(member\)\)\}/);
  assert.match(layers, /if \(key && key !== selectedInRun\.get\(row\.id\)\) changed\.push\(row\.id\);/);
  // A filter lists every match, run or not.
  assert.match(layers, /const prefix = filtering \? null : runPrefix\(shownParts\[i\]\[0\]\);/);
  const rowRule = layers.match(/\/\* One line a row[^*]*\*\/\s*\.list-row \{[^}]*\}/)?.[0] ?? '';
  assert.match(rowRule, /min-height: 34px;/);
});

test('the Shapes palette draws; a layer is styled in the look bar and the dock, not in the palette as well', () => {
  const palette = src('CE_Application/sections/SurfacePalette.svelte');
  const groups = [...palette.matchAll(/<section class="palette-group">\s*<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['Basic', 'Lines &amp; Polygons', 'Value Controls', 'Pen']);
  for (const gone of ['setLayerProperty', 'openLayerColour', 'openLayerGradient', 'toggleFillGradient', 'duplicateSelectedLayer', 'palette-stepper']) {
    assert.ok(!palette.includes(gone), `${gone} is not the palette's any more`);
  }
  // Everything it styled, the look bar styles.
  const lookBar = src('CE_Application/sections/SurfaceLookBar.svelte');
  for (const path of ['Background.Fill.colour', 'Background.Border.colour', 'Background.Border.thickness', 'Background.Corners.radius']) {
    assert.ok(lookBar.includes(path), path);
  }
  assert.match(lookBar, /setLayerProperty\('opacity'/);
  assert.match(lookBar, /onclick=\{toggleFillGradient\}/);
});

test('selection handles keep their size at any zoom', () => {
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const rule = (selector) => designer.slice(designer.indexOf(`  ${selector} {`)).match(/\{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(rule('.part-bound > .resize-handle,\n  .hit-zone > .resize-handle'), /transform: scale\(var\(--surface-unzoom, 1\)\);/);
  // Its own rule, the one that places it 30px above the part (it also opens a shared one earlier).
  assert.match(designer, /\.part-bound > \.rotate-handle \{\s*left: calc\(50% - 5px\);\s*top: -30px;[\s\S]{0,160}transform-origin: 5px 30px;\s*transform: scale\(var\(--surface-unzoom, 1\)\);/);
  assert.match(rule('.part-bound > .arc-handle'), /transform: scale\(var\(--surface-unzoom, 1\)\);/);
});

test('a layer thumbnail keeps the part\'s shape: the artboard is fitted whole and centred, not stretched', async () => {
  const { thumbPlacement, layerThumbPartStyle, zoneThumbPartStyle, LAYER_THUMB_ASPECT } =
    await import('../src/CE_Application/utils/customDesignSurfaceHelpers.js');
  // The box is 30 × 22 with a 1px border, sized border-box: 28 × 20 inside, where the percentages land.
  const layers = src('CE_Application/sections/SurfaceDockLayers.svelte');
  assert.match(layers, /\.layer-thumb \{\s*position: relative;\s*width: 30px;\s*height: 22px;/);
  assert.equal(LAYER_THUMB_ASPECT, 28 / 20);
  const px = (place, boxW = 28, boxH = 20) => [place.width * boxW / 100, place.height * boxH / 100];

  // The SH-201 knob: a 50 × 50 artboard, its face a 28 × 28 circle at 11, 11. Round, not an oval.
  const face = thumbPlacement({ left: 11, top: 11, width: 28, height: 28 }, 50, 50);
  const [w, h] = px(face);
  assert.ok(Math.abs(w - h) < 1e-9, `face drawn ${w} × ${h}`);
  assert.ok(Math.abs(face.left + face.width / 2 - 50) < 1e-9, 'the square artboard sits in the middle of the wider box');
  assert.equal(face.top, 22);

  // A wide artboard fills the width and is centred top to bottom; its own shape is kept too.
  const wide = thumbPlacement({ left: 0, top: 0, width: 200, height: 50 }, 200, 50);
  assert.equal(wide.width, 100);
  const [ww, wh] = px(wide);
  assert.ok(Math.abs(ww / wh - 4) < 1e-9, 'a 4:1 part stays 4:1');
  assert.ok(Math.abs(wide.top - (100 - wide.height) / 2) < 1e-9);

  for (const style of [layerThumbPartStyle({ left: 11, top: 11, width: 28, height: 28 }, {}, 50, 50),
    zoneThumbPartStyle({ left: 11, top: 11, width: 28, height: 28 }, {}, 50, 50)]) {
    const width = Number(/width:([\d.]+)%/.exec(style)[1]);
    const height = Number(/height:([\d.]+)%/.exec(style)[1]);
    assert.ok(Math.abs(width * 28 - height * 20) < 1e-6, style);
  }
});

test('a knob carried by a component is drawn and timed the way the panel draws and times it', () => {
  const part = src('CE_Application/editor/InteractivePartRenderer.svelte');
  const canvas = src('CE_Application/editor/CanvasControl.svelte');
  // The panel draws a knob with a form through ControlAnatomy and every other one through
  // SliderFamilyRenderer; the part used SliderFamilyRenderer for both, so a converted knob with a form
  // came out smaller with a larger readout.
  assert.match(canvas, /let hasAnatomy = \$derived\(!!anatomyForm\(core\?\.controlType, core\?\.controlForm\)\);/);
  assert.match(part, /let sliderAnatomy = \$derived\(sliderResolved\s*\? anatomyForm\(sliderResolved\.control\?\._children\?\.Core\?\.controlType, sliderResolved\.control\?\._children\?\.Core\?\.controlForm\)/);
  assert.match(part, /\{#if sliderResolved && sliderAnatomy\}\s*<ControlAnatomy/);
  // Its transitions go through the same tracker CanvasControl runs, not the runtime's whole catalogue.
  assert.match(canvas, /transitionTracker\.next\(interactionRuntime, \{ reducedMotion: \$systemReducedMotion \}\)/);
  assert.match(part, /sliderTracker\.next\(sliderResolved\.runtime, \{ reducedMotion: \$systemReducedMotion \}\)/);
  assert.match(part, /partTransitions=\{sliderTransitions\?\.partTransitions \?\? null\}/);
  assert.doesNotMatch(part, /partTransitions=\{sliderResolved\.runtime\?\.transitions\?\.partTransitions/);
});

test('the designer opens with nothing selected, and selecting a layer is not a colour edit', () => {
  // A new component carried a layer to start on, so the designer opened with one selected and the
  // Colors tab showing Cancel and Done over an edit nobody had started.
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const onOpen = designer.match(/let fittedComponentId = null;[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
  assert.match(onOpen, /untrack\(clearSurfaceSelection\);/);
  const dock = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(dock, /let colorTargetDirty = \$state\(false\);/);
  assert.match(dock, /\(!!\$colorTarget && \(!\$colorTarget\._designerFill \|\| colorTargetDirty\)\)/);
});

test('Preview fits the component to the canvas it has, and Edit gets its own view back', () => {
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const effect = designer.match(/let editView = null;\s*\$effect\(\(\) => \{[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
  assert.ok(effect, 'the preview effect is there');
  assert.match(effect, /const previewing = designerPreviewing;/);
  assert.match(effect, /editView = \{ zoom: surfaceZoom, left: surfaceScrollEl\.scrollLeft, top: surfaceScrollEl\.scrollTop \};\s*requestAnimationFrame\(fitArtboardToView\);/);
  assert.match(effect, /setZoom\(back\.zoom\);/);
});

test("the designer's columns are shares of its own width, so the dock is never under the inspector", () => {
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  const shell = designer.match(/\n {2}\.surface-shell \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(shell, /grid-template-columns: var\(--palette-w, clamp\(150px, 20%, 220px\)\) minmax\(0, 1fr\) var\(--dock-w, clamp\(260px, 33%, 430px\)\);/);
  assert.doesNotMatch(designer, /--dock-w: \d+px;/, 'no window-width rule fixes the dock');
  assert.doesNotMatch(designer, /\b\d+vw\b.*grid-template-columns|grid-template-columns[^;]*\bvw\b/);
});

test('the look bar is one row at one height, so selecting a layer does not move the canvas', () => {
  // It wrapped: with a layer selected beside the "Not reusable yet" notice, Scripts went to a second
  // row and the canvas dropped 34px under the pointer.
  const bar = src('CE_Application/sections/SurfaceLookBar.svelte');
  const rule = (name) => bar.match(new RegExp(`\\n {2}${name.replace('.', '\\.')} \\{\\n[\\s\\S]*?\\n {2}\\}`))?.[0] ?? '';
  assert.match(rule('.surface-lookbar'), /flex-wrap: nowrap;/);
  assert.doesNotMatch(rule('.lookbar-middle'), /flex-wrap: wrap/);
  const quick = src('CE_Application/sections/SurfaceQuickbar.svelte').match(/\.selection-quickbar \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(quick, /flex-wrap: nowrap;\s*flex-shrink: 0;/);
  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /\.readiness-nudge \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow: hidden;/);
  assert.match(designer, /<span class="nudge-text">\{step\.label\} — \{step\.detail\}<\/span>/);
});

test("the colour dock takes a share of the designer's height, and never leaves the canvas without room", async () => {
  // On a 1366×768 laptop it was 340px of a 648px designer, and the canvas had 138.
  const { displayDockHeightFor, statesStartFolded, DESIGNER_CANVAS_KEEP, DISPLAY_DOCK_MIN } = await import('../src/CE_Application/utils/customDesignSurfaceHelpers.js');
  assert.equal(displayDockHeightFor(0, 648), 233, 'a laptop gets about a third');
  assert.equal(displayDockHeightFor(0, 960), 340, 'a full-HD window keeps the 340 it always had');
  assert.equal(displayDockHeightFor(0, 0), 340, 'before the designer is measured');
  assert.equal(displayDockHeightFor(400, 960), 400, 'a height the author dragged is kept');
  assert.equal(displayDockHeightFor(500, 648), 648 - DESIGNER_CANVAS_KEEP, 'but not over the canvas');
  assert.equal(displayDockHeightFor(0, 300), DISPLAY_DOCK_MIN);
  assert.equal(statesStartFolded(648), true);
  assert.equal(statesStartFolded(960), false);
  assert.equal(statesStartFolded(0), false, 'not before it is measured');

  const designer = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /let displayDockHeight = \$derived\(displayDockHeightFor\(displayDockChosen, shellHeight\)\);/);
  assert.match(designer, /let filmstripCollapsed = \$derived\(filmstripCollapsedChoice \?\? statesStartFolded\(shellHeight\)\);/);
  assert.match(designer, /bind:clientHeight=\{shellHeight\}/);
  assert.match(designer, /ondblclick=\{\(\) => \{ displayDockChosen = 0; removeStoredValue\('ce\.surface\.displayDockHeight'\); \}\}/, 'a double-click goes back to the share');
});

test('the tool strip is one row, with smaller buttons on a narrow designer', () => {
  const strip = src('CE_Application/sections/SurfaceToolStrip.svelte');
  const rule = strip.match(/\n {2}\.tool-strip \{\n[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(rule, /flex-wrap: nowrap;/);
  // After the rule that sizes the buttons, or it loses to it.
  const sizes = strip.indexOf('.tool-flyout-host > button {');
  const narrow = strip.indexOf('@container (max-width: 900px)');
  assert.ok(sizes > 0 && narrow > sizes, 'the narrow sizes come after the normal ones');
  assert.match(strip.slice(narrow), /\.tool-strip > button,\s*\.tool-flyout-host > button \{ width: 30px; height: 30px; \}/);
  assert.match(src('CE_Application/sections/CustomDesignSurfaceEditor.svelte'), /\.surface-shell \{[\s\S]*?container-type: inline-size;/);
});

test("the designer's header keeps the component's name on a narrow designer", () => {
  const canvas = src('CE_Application/editor/EditorCanvas.svelte');
  assert.match(canvas, /\.component-workspace \{[\s\S]*?container-type: inline-size;/);
  assert.match(canvas, /@container \(max-width: 900px\) \{\s*\.component-workspace-title span \{ display: none; \}/);
  assert.match(canvas, /\.component-workspace-header button,\s*\.component-workspace-launch \{\s*white-space: nowrap;/);
});

test('with nothing to colour in the designer, the Colors tab says how to give it something', () => {
  // The picker colours nothing then (applyColor returns), and a full picker sat there doing nothing.
  const dock = src('CE_Application/panels/DisplayPanel.svelte');
  assert.match(dock, /let colorsIdle = \$derived\(designerOpen && !\$colorTarget && editingGradientStop === null && !pickingNotepadColor\);/);
  assert.match(dock, /\{#if colorsIdle\}\s*<p class="colors-idle">Select a layer on the canvas and its fill opens here\./);
});

test("a layer's look is styled in the look bar, and the inspector beside the canvas does not copy it", () => {
  const inspector = src('CE_Application/sections/SurfaceDockInspector.svelte');
  const display = inspector.slice(inspector.indexOf("{:else if inspectorTab === 'display'}"), inspector.indexOf("{:else if inspectorTab === 'behavior'}"));
  assert.ok(display, 'the Display tab is there');
  assert.doesNotMatch(display, /Paint<\/div>|openLayerColour|'Background\.Corners\.radius'|'Text\.Font\.size'|'Text\.content'/, 'no second copy of the look bar');
  assert.match(display, /in the bar above the canvas/);
  assert.match(display, /\{#if selectedIsArc\}/, 'what only an arc has stays');
  const bar = src('CE_Application/sections/SurfaceLookBar.svelte');
  for (const label of ['Fill', 'Stroke', 'Opacity', 'Content']) assert.match(bar, new RegExp(`<span>${label}</span>`), label);
});

test('in the designer the properties panel says it edits the whole component', () => {
  const panel = src('CE_Application/panels/PropertiesPanel.svelte');
  assert.match(panel, /let componentOwnerName = \$derived\(\$componentWorkspaceMode === 'surface' \? `Component: \$\{componentName\}` : componentName\);/);
  assert.match(panel, /ownerName=\{componentOwnerName\}/);
});

test('undo and redo are on screen once in the designer', () => {
  // The properties panel's toolbar has them, and in the designer that panel is always shown.
  const canvas = src('CE_Application/editor/EditorCanvas.svelte');
  const header = canvas.match(/<header class="component-workspace-header">[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.ok(header, 'the designer header is there');
  assert.doesNotMatch(header, /aria-label="Undo"|aria-label="Redo"/);
  const toolbar = src('CE_Application/panels/PropertiesToolbar.svelte');
  assert.match(toolbar, /aria-label="Undo" onclick=\{undo\}/);
  // The header's pair gave the shortcut; the pair that stays gives it too.
  assert.match(toolbar, /title=\{`\$\{undoTip\} \(Ctrl\+Z\)`\} aria-label="Undo"/);
  assert.match(toolbar, /title=\{`\$\{redoTip\} \(Ctrl\+Y\)`\} aria-label="Redo"/);
  assert.match(src('CE_Application/utils/workspaceChrome.js'), /showPropertiesPanel: workspaceKind === 'component'\s*\? true/);
});

test("zoom is the status bar's; the strip under the canvas keeps what only it has", () => {
  // It had a second −, value, +, 100% and Fit, which took the room its toggles needed: Measure,
  // Bounds and Zones scrolled out of sight.
  const strip = src('CE_Application/sections/SurfaceBottomBar.svelte');
  assert.doesNotMatch(strip, /title="Zoom out"|title="Zoom in"|title="Fit to window"|title="Reset to 100%"|szb-zoom-value/);
  assert.match(strip, /<span>Zoom step<\/span>/);
  assert.match(strip, /label="Rulers"/);
  for (const label of ['Snap', 'Smart', 'Measure', 'Bounds', 'Hit zones']) assert.match(strip, new RegExp(`label="${label}"`), label);
  const bar = src('CE_Application/layout/StatusBar.svelte');
  for (const title of ['Zoom out', 'Zoom in', 'Reset to 100%']) assert.match(bar, new RegExp(`title="${title}"`), title);
  assert.doesNotMatch(src('CE_Application/sections/CustomDesignSurfaceEditor.svelte'), /zoomEditing|commitZoomEdit/);
});

test("the Dial, the scales and the arpeggiator are added from the palette, not from the strip as well", () => {
  // The strip had Dial, H Scale, V Scale and Arp Kit, the same four functions as the palette's
  // Value Controls, and they too pushed the toggles out of sight.
  const strip = src('CE_Application/sections/SurfaceBottomBar.svelte');
  assert.doesNotMatch(strip, /addDialKit|addHorizontalScaleKit|addVerticalScaleKit|addArpeggiatorKit/);
  const palette = src('CE_Application/sections/SurfacePalette.svelte');
  for (const kit of ['addDialKit', 'addHorizontalScaleKit', 'addVerticalScaleKit', 'addArpeggiatorKit']) {
    assert.match(palette, new RegExp(`onclick=\\{${kit}\\}`), kit);
  }
});

test('the options strip holds snapping, View and ?, and wraps rather than hiding anything', () => {
  // It is as wide as the canvas column (300 pixels at 1366) and scrolled sideways: at 1366
  // everything after Snap was out of sight. What the canvas shows, and the zoom step, are in the
  // View list, and the strip takes a second row when even that does not fit.
  const strip = src('CE_Application/sections/SurfaceBottomBar.svelte');
  const markup = strip.slice(strip.indexOf('</script>'), strip.indexOf('<style>'));
  const list = markup.slice(markup.indexOf('<div class="view-list"'), markup.indexOf('{/if}', markup.indexOf('<div class="view-list"')));
  for (const label of ['Measure', 'Bounds', 'Generated names', 'Hit zones', 'Rulers']) {
    assert.match(list, new RegExp(`label="${label}"`), `${label} is in the View list`);
  }
  assert.match(list, /aria-label="Which hit zones are drawn"/);
  assert.match(list, /<span>Zoom step<\/span>/);
  const outside = markup.replace(list, '');
  for (const label of ['Snap', 'Smart']) assert.match(outside, new RegExp(`label="${label}"`), `${label} stays on the strip`);
  assert.match(outside, />View ▾<\/button>/);
  assert.match(outside, /title="Shortcuts &amp; glossary \(\?\)">\?<\/button>/);
  const css = strip.slice(strip.indexOf('<style>'));
  assert.match(css, /\.surface-options-strip \{[^}]*flex-wrap: wrap;/);
  assert.doesNotMatch(css, /overflow-x: auto/, 'nothing scrolls out of sight');
  // The list closes on a click anywhere else and on Escape, and Escape stops there: the designer's
  // own Escape would also drop the selection.
  assert.match(strip, /if \(!viewHost\?\.contains\(event\.target\)\) viewOpen = false;/);
  assert.match(strip, /event\.key !== 'Escape'\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*viewOpen = false;/);
  assert.match(strip, /document\.addEventListener\('keydown', onKey\);/, 'bubbling, so a field in the list keeps its own Escape');
});

test('Blank canvas is the first entry of the Starters menu, and a starter asks before it replaces anything', () => {
  const tools = src('CE_Application/sections/SurfaceToolStrip.svelte');
  const menu = tools.slice(tools.indexOf('aria-label="Starter components"'));
  assert.ok(menu.indexOf('Blank canvas') > 0 && menu.indexOf('Blank canvas') < menu.indexOf('{#each CUSTOM_COMPONENT_STARTERS'),
    'first: the list is taller than the menu, and its end is out of sight');
  assert.match(menu, /class="danger" title="Clear this component to an empty canvas" onclick=\{blankCanvasFromFlyout\}/);
  assert.doesNotMatch(src('CE_Application/sections/SurfaceBottomBar.svelte'), /resetToBlankCanvas|>Blank</);
  const surface = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(surface, /function blankCanvasFromFlyout\(event\) \{\s*event\?\.stopPropagation\?\.\(\);\s*starterFlyoutOpen = false;\s*resetToBlankCanvas\(\);/);
  // resetToBlankCanvas asked first; a starter, which replaces far more, did not.
  const apply = surface.slice(surface.indexOf('function applyStarterFromFlyout'), surface.indexOf('function blankCanvasFromFlyout'));
  assert.ok(apply.indexOf('confirmDestructive(') > 0 && apply.indexOf('confirmDestructive(') < apply.indexOf('applyControlPatch('));
});

test("the tool strip's menus close on a click anywhere else and on Escape", () => {
  // Starters, Assistant and Make Interactive stayed open until their own button was pressed again;
  // Escape closed only the Shape menu.
  const surface = src('CE_Application/sections/CustomDesignSurfaceEditor.svelte');
  assert.match(surface, /let toolFlyoutOpen = \$derived\(shapeFlyoutOpen \|\| interactiveFlyoutOpen \|\| starterFlyoutOpen \|\| assistantFlyoutOpen\);/);
  assert.match(surface, /if \(!event\.target\?\.closest\?\.\('\.tool-flyout-host'\)\) close\(\);/);
  assert.match(surface, /document\.addEventListener\('pointerdown', onDown, true\);\s*document\.addEventListener\('keydown', onKey\);/);
});
