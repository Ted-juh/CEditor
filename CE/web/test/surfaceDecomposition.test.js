// surfaceDecomposition.test.js — the §5 decomposition of the custom-component design surface,
// and the three pieces of logic the 2026-07-12 workspace review asked to have under test.
//
// That review's argument for splitting the file is worth restating, because it is an argument
// about regressions and not about tidiness: it found that a rebuild of the surface chrome had
// silently dropped shipped features — smart guides, align/distribute, measurement readouts, and a
// Make Interactive tool that rendered but did nothing — and concluded that every one of them
// happened because CustomDesignSurfaceEditor.svelte was too large to edit without rewriting a
// region wholesale. Hence §5: "Decompose as part of the restoration, not after ... Add cheap smoke
// tests alongside: tool activation, snap/guide math, zoom clamp."
//
// The structural tests below are the cheap half. They cannot prove the surface works, but they
// fail if the file grows back or a component quietly reabsorbs into it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..', 'src', 'CE_Application');
const read = (rel) => readFileSync(resolve(APP, rel), 'utf8');

// --- Structure ---------------------------------------------------------------------------------

const EXTRACTED = [
  'SurfaceLookBar',     // the look bar across the top
  'SurfacePalette',     // the Shapes palette down the left
  'SurfaceBottomBar',   // snapping/view options and the zoom cluster
  'SurfaceToolStrip',   // the floating tool strip over the canvas
  'SurfaceDockLayers',    // the dock's Layers tab
  'SurfaceDockInspector', // the dock's Object / Display / Behavior / States tabs
  'SurfaceContextMenu',   // the right-click menu
  'SurfaceHelpOverlay',   // the ? cheatsheet, extracted before this round
];

test('the surface is assembled from components, not written as one file', () => {
  const parent = read('sections/CustomDesignSurfaceEditor.svelte');
  for (const name of EXTRACTED) {
    assert.match(parent, new RegExp(`import ${name} from './${name}.svelte'`), `${name} must be imported`);
    assert.match(parent, new RegExp(`<${name}\\b`), `${name} must be rendered`);
  }
});

test('the surface editor stays under the size that caused the regressions', () => {
  const lines = read('sections/CustomDesignSurfaceEditor.svelte').split('\n').length;
  // 8,325 when the decomposition started; ~5,500 now, across eight components. The ceiling sits
  // above the current size, not at it: this is a ratchet against growing back, not a style rule to
  // satisfy by moving code somewhere worse. Extract another region before raising it — the canvas
  // viewport is the one still in here, and it is the most entangled of them.
  assert.ok(lines < 5800, `CustomDesignSurfaceEditor is ${lines} lines; extract a region rather than raising this`);
});

test('every extracted component brought its own styles', () => {
  // The failure mode this catches: markup moves, its scoped CSS does not, and the component
  // renders unstyled. Nothing errors — Svelte has no opinion about a class with no rule.
  for (const name of EXTRACTED) {
    const src = read(`sections/${name}.svelte`);
    assert.match(src, /<style>/, `${name} has no styles of its own — did its CSS get left behind?`);
  }
});

test('the shared glyph vocabulary is defined once, in the parent', () => {
  const parent = read('sections/CustomDesignSurfaceEditor.svelte');
  // `.tool-icon` is drawn by the tool strip, the palette and the dock's add strip. One definition
  // reaches all three through :global under the shell; the alternative is three copies that drift.
  assert.match(parent, /\.surface-shell :global\(\.tool-icon\)/);
  assert.ok(
    !/\n\s*\.tool-icon[^{]*\{/.test(parent),
    'a scoped .tool-icon rule in the parent styles nothing — the elements live in the children now',
  );
  for (const name of ['SurfaceToolStrip', 'SurfacePalette', 'SurfaceDockLayers']) {
    assert.ok(
      !/\n\s*\.tool-icon\b[^{]*\{/.test(read(`sections/${name}.svelte`)),
      `${name} must not carry its own copy of the tool glyphs`,
    );
  }
});

// --- The logic the review named ------------------------------------------------------------------

test('zoom clamps to the usable range', async () => {
  const { clampSurfaceZoom, SURFACE_ZOOM_MIN, SURFACE_ZOOM_MAX } =
    await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.equal(clampSurfaceZoom(1), 1);
  assert.equal(clampSurfaceZoom(0.01), SURFACE_ZOOM_MIN, 'below the floor parts become unhittable');
  assert.equal(clampSurfaceZoom(500), SURFACE_ZOOM_MAX);
  assert.equal(clampSurfaceZoom(SURFACE_ZOOM_MIN), SURFACE_ZOOM_MIN, 'the bounds are inclusive');
  assert.equal(clampSurfaceZoom(SURFACE_ZOOM_MAX), SURFACE_ZOOM_MAX);
  // A NaN here used to propagate into a CSS transform and blank the canvas.
  assert.equal(clampSurfaceZoom('nonsense'), 1);
  assert.equal(clampSurfaceZoom(undefined), 1);
  // Infinity takes the same path as NaN rather than clamping to the ceiling, and that is the
  // coherent reading: a non-finite zoom is not "very zoomed in", it is the absence of a usable
  // number, and 1:1 is the answer to that everywhere else in this function.
  assert.equal(clampSurfaceZoom(Infinity), 1);
  assert.equal(clampSurfaceZoom(-Infinity), 1);
});

test('the zoom increment refuses nonsense instead of adopting it', async () => {
  const { clampZoomIncrement } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.equal(clampZoomIncrement(10), 10);
  assert.equal(clampZoomIncrement('25'), 25);
  assert.equal(clampZoomIncrement(1000), 100, 'capped');
  // null means "leave it alone" — a zero or negative step would freeze or invert the buttons.
  assert.equal(clampZoomIncrement(0), null);
  assert.equal(clampZoomIncrement(-5), null);
  assert.equal(clampZoomIncrement('abc'), null);
});

test('the grid size stays inside the range the ruler can draw', async () => {
  const { clampSnapSize } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.equal(clampSnapSize(10), 10);
  assert.equal(clampSnapSize(0), 1);
  assert.equal(clampSnapSize(-3), 1);
  assert.equal(clampSnapSize(999), 64);
  assert.equal(clampSnapSize(7.6), 8, 'rounded, because a fractional grid is not a grid');
  assert.equal(clampSnapSize('x'), 10);
});

test('snapping quantises, and Alt bypasses it', async () => {
  const { snapToGrid } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.equal(snapToGrid(13, { size: 10 }), 10);
  assert.equal(snapToGrid(16, { size: 10 }), 20);
  assert.equal(snapToGrid(-13, { size: 10 }), -10, 'negative coordinates snap the same way');
  assert.equal(snapToGrid(13, { size: 10, enabled: false }), 13, 'off means off');
  // Alt is the documented bypass and is checked in one place, because a dozen call sites means
  // one of them forgets — and the one that forgets is the one that feels broken.
  assert.equal(snapToGrid(13, { size: 10, bypass: true }), 13);
  assert.equal(snapToGrid(13, { size: 0 }), 10, 'a zero grid would divide by zero');
});

test('snapping a frame never collapses it to nothing', async () => {
  const { snapFrameToGrid } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  const frame = { left: 13, top: 27, width: 4, height: 46 };
  assert.deepEqual(snapFrameToGrid(frame, { size: 10 }), { left: 10, top: 30, width: 1, height: 50 });
  //                                                                         ^ not 0
  assert.deepEqual(snapFrameToGrid(frame, { size: 10, bypass: true }), frame);
  assert.deepEqual(snapFrameToGrid(frame, { size: 10, enabled: false }), frame);
  assert.equal(snapFrameToGrid(null, { size: 10 }), null);
  // Fields the surface carries alongside the box survive the round trip.
  const tagged = { ...frame, name: 'dialFace' };
  assert.equal(snapFrameToGrid(tagged, { size: 10 }).name, 'dialFace');
});

test('tool activation only accepts tools that exist', async () => {
  // The review's first named smoke test, and the one that would have caught the dead Make
  // Interactive: the tool id has to be in the catalogue or nothing happens. The catalogue and the
  // guard live in the component, so this asserts the guard is still written.
  const src = read('sections/CustomDesignSurfaceEditor.svelte');
  const fn = src.slice(src.indexOf('function setActiveTool'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /DRAW_TOOLS\.some\(\(tool\) => tool\.id === id\)/, 'unknown tool ids must be refused');
  assert.match(body, /return;/);
  // And the strip that drives it must be able to reach every tool in the catalogue.
  assert.match(src, /shapeTools=\{SHAPE_TOOLS\}/);
  assert.match(src, /interactiveArchetypes=\{INTERACTIVE_ARCHETYPES\}/);
});

// =================================================================================================
// Tier 1 of the workspace review: the three gestures the surface did not have.
// =================================================================================================

test('a marquee catches what it overlaps, not only what it encloses', async () => {
  const g = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  const frames = {
    plate:  { left: -20, top: -20, width: 300, height: 300 },  // runs past the band both ways
    knob:   { left: 40, top: 40, width: 30, height: 30 },
    offside:{ left: 500, top: 500, width: 10, height: 10 },
    locked: { left: 45, top: 45, width: 10, height: 10 },
    hidden: { left: 46, top: 46, width: 10, height: 10 },
  };
  const entries = [
    ['plate', {}], ['knob', {}], ['offside', {}],
    ['locked', { locked: true }], ['hidden', { visible: false }],
  ];
  const rect = g.marqueeRect({ x: 30, y: 30 }, { x: 90, y: 90 });
  const hits = g.partsInMarquee(entries, rect, (p) => frames[Object.keys(frames)[entries.findIndex(([, q]) => q === p)]]);
  // Containment-only would miss the plate, and reaching for a background plate is the commonest
  // use of a rubber band.
  assert.ok(hits.includes('plate'));
  assert.ok(hits.includes('knob'));
  assert.ok(!hits.includes('offside'));
  // Selecting something you cannot see or move is a puzzle, not a selection.
  assert.ok(!hits.includes('locked'));
  assert.ok(!hits.includes('hidden'));
});

test('a marquee normalises whichever way it is dragged', async () => {
  const { marqueeRect } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  const forward = marqueeRect({ x: 10, y: 20 }, { x: 50, y: 80 });
  const backward = marqueeRect({ x: 50, y: 80 }, { x: 10, y: 20 });
  assert.deepEqual(forward, { left: 10, top: 20, width: 40, height: 60 });
  assert.deepEqual(backward, forward, 'dragging up-left is the same band as down-right');
});

test('a click is not a marquee', async () => {
  const { marqueeRect, isMarqueeDrag } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.equal(isMarqueeDrag(marqueeRect({ x: 10, y: 10 }, { x: 10, y: 10 })), false);
  assert.equal(isMarqueeDrag(marqueeRect({ x: 10, y: 10 }, { x: 12, y: 11 })), false, 'a shaky click');
  assert.equal(isMarqueeDrag(marqueeRect({ x: 10, y: 10 }, { x: 40, y: 11 })), true, 'a thin band is still a band');
});

test('shift extends the selection instead of replacing it', async () => {
  const { mergeMarqueeSelection } = await import('../src/CE_Application/utils/customDesignSurfaceGeometry.js');
  assert.deepEqual(mergeMarqueeSelection(['a'], ['b', 'c'], false), ['b', 'c']);
  assert.deepEqual(mergeMarqueeSelection(['a'], ['b', 'c'], true), ['a', 'b', 'c']);
  assert.deepEqual(mergeMarqueeSelection(['a', 'b'], ['b', 'c'], true), ['a', 'b', 'c'], 'no duplicates');
});

test('the surface has its own context menu, not the panel editor’s', () => {
  const menu = read('sections/SurfaceContextMenu.svelte');
  // Every action the review named.
  for (const label of ['Duplicate', 'Bring to front', 'Send to back', 'Lock / unlock',
                       'Show / hide', 'Make interactive', 'Jump to generator', 'Delete']) {
    assert.ok(menu.includes(label), `the menu is missing "${label}"`);
  }
  // It shares the placement helper with the panel menu — a menu opened near a window edge has to
  // be measured before it is placed, and that problem is the same on both surfaces.
  assert.match(menu, /import \{ placeMenu \} from '\.\.\/utils\/menuPlacement\.js'/);
  // But not the panel model: none of this reaches a part inside a component document. Checked
  // against the code with the doc comment stripped, since that comment names them to explain why.
  const code = menu.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/selectedComponentIds|removeControl|flatControls/.test(code));

  const surface = read('sections/CustomDesignSurfaceEditor.svelte');
  assert.match(surface, /oncontextmenu=\{\(event\) => openSurfaceContextMenu\(event\)\}/, 'empty canvas');
  assert.match(surface, /oncontextmenu=\{\(event\) => openSurfaceContextMenu\(event, name, part\)\}/, 'a part');
  // Right-clicking an unselected part must select it first, or the menu acts on something else.
  const fn = surface.slice(surface.indexOf('function openSurfaceContextMenu'));
  assert.match(fn.slice(0, fn.indexOf('\n  }')), /if \(name && !isLayerSelected\(name\)\) selectLayer/);
});

test('styling fans out over a multi-selection, geometry does not', () => {
  const s = read('sections/CustomDesignSurfaceEditor.svelte');

  // "Make these three 4px-cornered" has one meaning, so it reaches all three.
  const style = s.slice(s.indexOf('function setLayerProperty('));
  assert.match(style.slice(0, style.indexOf('\n  }')),
    /multiSelectionActive[\s\S]*for \(const name of selectedLayerNames\) setLayerPropertyFor/);

  // "Make these three 200 wide" has several, so it is refused rather than guessed.
  const size = s.slice(s.indexOf('function setSelectionFrameSize'));
  assert.match(size.slice(0, size.indexOf('\n  }')), /if \(multiSelectionActive\) return;/);
  // The field that has to say so lives in the extracted inspector now.
  assert.match(read('sections/SurfaceDockInspector.svelte'), /disabled=\{multiSelectionActive \|\|/);

  // Position does have one meaning: translate the group by the delta.
  const pos = s.slice(s.indexOf('function setSelectionFramePosition'));
  assert.match(pos.slice(0, pos.indexOf('\n  }')), /moveSelectedLayersBy/);
});

test('a swatch reveals the editor it just targeted', () => {
  const s = read('sections/CustomDesignSurfaceEditor.svelte');
  const fn = s.slice(s.indexOf('function revealDisplayDock'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  // Both halves: un-hiding without the tab lands on whatever was open; the tab without un-hiding
  // switches a panel nobody can see.
  assert.match(body, /displayDockHidden = false/);
  assert.match(body, /displayTabRequest\.set\(\{ tab \}\)/);
  assert.match(s, /revealDisplayDock\('colors'\)/);
  assert.match(s, /revealDisplayDock\('gradient'\)/);
});

test('the dead canvas strips are gone, rule and all', () => {
  const s = read('sections/CustomDesignSurfaceEditor.svelte');
  for (const cls of ['layer-action-strip', 'precision-strip', 'arc-strip']) {
    assert.ok(!s.includes(cls), `${cls} was built and then display:none'd — it should not be back`);
  }
  assert.ok(!s.includes('Assets are edited in the inspector for now'), 'the dead Assets tab');
});
