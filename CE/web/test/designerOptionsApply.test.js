// The Component Designer review, item 14: options offered where they don't apply. "Rotate around
// arc centre" beside "No arc found" on a rectangle; a Corners field on an ellipse, which is always
// drawn round; a Fill on a line, which has no inside; Display and Behavior tabs that opened on one
// line of text. Each is offered now only where it draws or does something.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layerPaintFields, partShape } from '../src/CE_Application/utils/partShape.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');

const ALL = { fill: true, gradient: true, stroke: true, corners: true };
const ROUND = { fill: true, gradient: true, stroke: true, corners: false };
const STROKE_ONLY = { fill: false, gradient: false, stroke: true, corners: false };
const NONE = { fill: false, gradient: false, stroke: false, corners: false };
const background = { Background: { _type: 'Background', _children: {} } };
const layer = (kind, meta = {}) => ({ kind, meta, _children: background });

test('the look bar offers the paint fields that draw on each kind of layer', () => {
  assert.deepEqual(layerPaintFields(layer('rectangle')), ALL, 'a box takes every field');
  assert.deepEqual(layerPaintFields(layer('roundedRectangle')), ALL);
  for (const kind of ['circle', 'ring', 'capsule']) {
    assert.deepEqual(layerPaintFields(layer(kind)), ROUND, `${kind}: always drawn fully round`);
  }
  assert.deepEqual(layerPaintFields(layer('triangle')), ROUND, 'a polygon has no corners');
  assert.deepEqual(layerPaintFields(layer('line')), STROKE_ONLY, 'a line has no inside');
  assert.deepEqual(layerPaintFields(layer('path', { closed: false, vectorPoints: [[0, 0], [1, 1]] })), STROKE_ONLY, 'nor has an open path');
  assert.deepEqual(layerPaintFields(layer('path', { closed: true, vectorPoints: [[0, 0], [1, 0], [0, 1]] })), ROUND);
  assert.deepEqual(layerPaintFields(layer('arcTrack', { renderer: 'arcTrack', arcTrack: { colour: 'FF5B9BD5' } })), NONE,
    'an arc is drawn from its own Arc settings, on the Display tab');
  assert.deepEqual(layerPaintFields(null), ALL, 'nothing selected: nothing is taken away');
});

test('an arc draws only its arc, not its box as well', () => {
  // The Arc pen gave every arc a Background with a 4px border at radius 999 in the arc's colour, and
  // the renderer drew it: a full ring under the arc, so its gap never showed (Three Ring Macro too).
  assert.equal(partShape(layer('arcTrack', { renderer: 'arcTrack' })).rendersArcTrack, true);
  const renderer = source('editor/InteractivePartRenderer.svelte');
  assert.match(renderer, /\{:else if background && !shape\.rendersVectorShape && !shape\.rendersArcTrack\}\s*(<!--[\s\S]*?-->\s*)?<BackgroundRenderer/);
  assert.match(renderer, /!shape\.rendersOutline && !shape\.rendersArcTrack\s*\? plainFillCSS/);
  assert.match(renderer, /import \{ partShape \} from '\.\.\/utils\/partShape\.js';/, 'the renderer and the look bar read one set of rules');
  assert.doesNotMatch(renderer, /function partShape\(/);
});

test('the look bar shows each paint field only where it applies', () => {
  const bar = source('sections/SurfaceLookBar.svelte');
  assert.match(bar, /let paint = \$derived\(layerPaintFields\(selectedAuthoredPart \?\? selectedPart\)\);/);
  assert.match(bar, /\{#if paint\.fill\}\s*<label class="paint-swatch">\s*<span>Fill<\/span>/);
  assert.match(bar, /\{#if paint\.gradient\}\s*<label class="paint-swatch">\s*<span>Gradient<\/span>/);
  assert.match(bar, /\{#if paint\.stroke\}\s*<label class="paint-swatch">\s*<span>Stroke<\/span>/);
  assert.match(bar, /\{#if paint\.corners\}\s*<label class="paint-number" title="Corner radius, in pixels">/);
});

test('Rotate around arc centre is offered only when there is an arc to turn around', () => {
  const inspector = source('sections/SurfaceDockInspector.svelte');
  assert.match(inspector, /\{#if activeSelectionKind === 'layer' && selectedArcPivotTarget\}\s*<div class="dock-section-subtitle">Rotation Pivot<\/div>/);
  assert.doesNotMatch(inspector, /: 'No arc found'/, 'the label it showed beside the button');
});

test('an inspector tab that holds nothing for the selection is not offered', () => {
  const designer = source('sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /display: \(activeSelectionKind === 'layer' && selectedIsArc\) \|\| \(activeSelectionKind === 'hitZone' && !!selectedZone\),/);
  assert.match(designer, /behavior: activeSelectionKind === 'hitZone' && !!selectedZone,/);
  assert.match(designer, /let shownInspectorTab = \$derived\(inspectorTabHas\[inspectorTab\] \? inspectorTab : 'object'\);/,
    'the chosen tab is kept, and Object shows meanwhile');
  assert.match(designer, /disabled=\{!inspectorTabHas\[tab\.id\]\}\s*title=\{inspectorTabHas\[tab\.id\] \? undefined : tab\.empty\}/);
  assert.match(designer, /inspectorTab=\{shownInspectorTab\}/);
  const inspector = source('sections/SurfaceDockInspector.svelte');
  assert.doesNotMatch(inspector, /Use hit zones to make artwork interactive/, 'the one line the Behavior tab had for a layer');
  assert.doesNotMatch(inspector, /Select a layer to edit its styling/);
});

test('the generated-names and hit-zone view toggles show only when there is something to draw', () => {
  const designer = source('sections/CustomDesignSurfaceEditor.svelte');
  assert.match(designer, /let hasGeneratedLayers = \$derived\(Object\.values\(parts\?\._children \?\? \{\}\)\.some\(\(part\) => isGeneratedPart\(part\)\)\);/);
  assert.match(designer, /let hasHitZones = \$derived\(Object\.keys\(hitZones\?\._children \?\? \{\}\)\.length > 0\);/);
  const inspector = source('sections/SurfaceDockInspector.svelte');
  assert.match(inspector, /\{#if hasGeneratedLayers\}\s*<span class="dock-field">\s*<span>Gen Names<\/span>/);
  assert.match(inspector, /\{#if hasHitZones\}\s*<span class="dock-field">\s*<span>Zones<\/span>/);
});

test('a round shape and a polygon draw their gradient, over their solid colour, as a box does', () => {
  const renderer = source('editor/InteractivePartRenderer.svelte');
  assert.match(renderer, /return `background: \$\{gradientToCSS\(fill\.gradient\)\}; opacity: \$\{\(numberOr\(fill\.gradientOpacity, 100\) \/ 100\)\.toFixed\(3\)\}; mix-blend-mode: \$\{fill\.gradientBlend \?\? 'normal'\};`;/);
  assert.match(renderer, /<div class="interactive-simple-background ce-colour-anim" style=\{simpleBackgroundStyle\}>\s*\{#if gradientLayerStyle\}<div class="interactive-gradient-layer"/);
  // The polygon's fill is a box clipped to the SVG polygon's own points; the SVG keeps the stroke.
  assert.match(renderer, /return `clip-path: polygon\(\$\{corners\.join\(', '\)\}\); background: \$\{solid\};`;/);
  assert.match(renderer, /fill=\{polygonFillStyle \? 'none' : vectorShapeSvg\.fill\}/);
});
