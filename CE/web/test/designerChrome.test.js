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
  assert.match(designer, /if \(!id \|\| !surfaceScrollEl \|\| id === fittedComponentId\) return;\s*fittedComponentId = id;\s*requestAnimationFrame\(fitArtboardToView\);/);
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
