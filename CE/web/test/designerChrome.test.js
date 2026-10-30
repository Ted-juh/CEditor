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
  // The tool strip is centred along the bottom of the canvas; on a narrow canvas the bar, at the
  // bottom right, covered half of it.
  const style = source.match(/\.selection-quickbar \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(style, /top: 10px;/);
  assert.match(style, /bottom: auto;/);
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
