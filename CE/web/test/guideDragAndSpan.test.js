// guideDragAndSpan.test.js — the two halves of review finding A11 that outlived the move of guides
// into the panel document.
//
//   - Dragging a NEW guide out of a ruler had no live preview at all. `EditorRuler.svelte` carried
//     `const createDragMove = () => {};` — an empty function — so the guide first existed on
//     mouseup and the whole gesture was performed blind. It now publishes the pending guide to the
//     `draggingGuide` store on every move, which is the same store the move-drag uses, so the
//     ruler marker and the canvas line are one value read twice instead of two guesses. Dragging
//     back over the ruler has to cancel: no guide, and no ghost left behind.
//   - A guide could not live in the pasteboard. It was rendered `left:0; right:0` inside an
//     `inset: 0` wrapper, so it spanned the panel box exactly and hovered uselessly over the
//     pasteboard that `.panel-surface { overflow: visible }` had opened up. Guides now stretch by
//     the measured overhang of the visible canvas, in panel units, so the S1 zoom compensation
//     survives.
//
// The measurement itself needs a laid-out browser, so the geometry lives in a pure module and is
// tested against fabricated rects; the components are then rendered server-side to prove they
// actually route through it and that the store drives the preview markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from 'svelte/server';

import {
  guideLineStyle,
  pasteboardExtent,
  pendingGuideFor,
  pendingGuideOf,
  rulerCreateDrag,
  sameExtent,
  NO_PASTEBOARD,
  PENDING_GUIDE_INDEX,
} from '../src/CE_Application/utils/guideGeometry.js';

import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addGuide, draggingGuide, selectedGuide } from '../src/CE_Application/stores/guides.js';
import GuideLines from '../src/CE_Application/editor/GuideLines.svelte';
import EditorRuler from '../src/CE_Application/editor/EditorRuler.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...parts) => readFileSync(join(here, '..', 'src', 'CE_Application', ...parts), 'utf8');

function rect(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function freshPanel(name) {
  const panel = createPanel(name);
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedGuide.set(null);
  draggingGuide.set(null);
  return panel;
}

// --- Pulling a new guide out of a ruler ---------------------------------------------------------

test('a create-drag inside the ruler previews nothing and commits nothing', () => {
  // Horizontal ruler occupying y 0..20; the panel surface starts at y 60.
  const ruler = rect(20, 0, 800, 20);
  const surface = rect(60, 60, 660, 460);

  const still = rulerCreateDrag('horizontal', { clientX: 300, clientY: 12 }, ruler, surface, 1);
  assert.equal(still.outside, false, 'pointer is still over the ruler');
  assert.equal(pendingGuideOf(still), null, 'nothing to preview, so the store is cleared');

  // The exact boundary belongs to the ruler — the commit path has always used `> rect.bottom`,
  // and preview and commit must not disagree by a pixel about where the cancel zone ends.
  const edge = rulerCreateDrag('horizontal', { clientX: 300, clientY: 20 }, ruler, surface, 1);
  assert.equal(edge.outside, false);
  assert.equal(
    rulerCreateDrag('horizontal', { clientX: 300, clientY: 21 }, ruler, surface, 1).outside,
    true,
  );
});

test('a create-drag past the ruler previews the guide it is going to create', () => {
  const ruler = rect(20, 0, 800, 20);
  const surface = rect(60, 60, 660, 460);

  const drag = rulerCreateDrag('horizontal', { clientX: 300, clientY: 200 }, ruler, surface, 1);
  assert.equal(drag.outside, true);
  assert.equal(drag.pos, 140, '(200 - 60) / 1');

  assert.deepEqual(pendingGuideOf(drag), {
    orientation: 'horizontal',
    index: PENDING_GUIDE_INDEX,
    pos: 140,
    creating: true,
  });

  // The pending index must never collide with a real guide's index, or the guide lines would
  // treat an existing guide as the one being dragged.
  assert.ok(PENDING_GUIDE_INDEX < 0);
});

test('the create-drag preview is zoom-compensated and rounded like the store', () => {
  const surface = rect(100, 100, 500, 400);

  // At 200% zoom, 250 screen px below the surface top is 75 panel units, not 150.
  const zoomed = rulerCreateDrag(
    'vertical', { clientX: 350, clientY: 300 }, rect(0, 0, 20, 600), surface, 2,
  );
  assert.equal(zoomed.pos, 125, '(350 - 100) / 2');

  // Guides are stored rounded (addGuide/updateGuide both round), so the preview rounds too —
  // otherwise the line jumps a fraction of a unit at the moment of release.
  const fractional = rulerCreateDrag(
    'vertical', { clientX: 351, clientY: 300 }, rect(0, 0, 20, 600), surface, 2,
  );
  assert.equal(fractional.pos, 126, '125.5 rounds the way the store would round it');

  // A zero scale would divide into infinity; the guard keeps the preview on screen.
  assert.equal(
    rulerCreateDrag('vertical', { clientX: 350, clientY: 300 }, rect(0, 0, 20, 600), surface, 0).pos,
    250,
  );
  // No surface on the page at all (the custom design surface has no panel) — no preview.
  assert.equal(rulerCreateDrag('vertical', { clientX: 1 }, rect(0, 0, 20, 60), null, 1), null);
  assert.equal(pendingGuideOf(null), null);
});

test('a pending guide is claimed by exactly one axis, and never by a move-drag', () => {
  const pending = pendingGuideOf(
    rulerCreateDrag('horizontal', { clientX: 0, clientY: 300 }, rect(0, 0, 800, 20), rect(0, 40, 600, 440), 1),
  );
  assert.equal(pendingGuideFor(pending, 'horizontal'), pending);
  assert.equal(pendingGuideFor(pending, 'vertical'), null);

  // Moving an EXISTING guide publishes to the same store without `creating`, and must not be
  // drawn a second time as a preview on top of itself.
  assert.equal(pendingGuideFor({ orientation: 'horizontal', index: 2, pos: 40 }, 'horizontal'), null);
  assert.equal(pendingGuideFor(null, 'horizontal'), null);
});

test('the ruler no longer ships an empty create-drag move handler', () => {
  const ruler = src('editor', 'EditorRuler.svelte');
  assert.equal(
    /createDragMove\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/.test(ruler), false,
    'the empty function the review cited is gone',
  );
  assert.match(ruler, /createDragMove\s*=\s*\(ev\)\s*=>/);
  // The preview goes through the shared store, not through local component state.
  assert.match(ruler, /draggingGuide\.set\(pendingGuideOf\(measure\(ev\)\)\)/);
  // …and the commit path clears it before every early return, so no ghost can survive mouseup.
  const end = ruler.slice(ruler.indexOf('const createDragEnd'));
  assert.ok(
    end.indexOf('draggingGuide.set(null)') < end.indexOf('if (!drag?.outside) return'),
    'the preview is cleared before the cancel path returns',
  );
});

test('the pending guide is drawn on the ruler for its own axis only', () => {
  freshPanel('Ruler Preview');
  draggingGuide.set(pendingGuideOf({ orientation: 'horizontal', outside: true, pos: 90 }));

  // Horizontal guides are marked on the VERTICAL ruler — that is the ruler whose axis they cross.
  const vertical = render(EditorRuler, {
    props: { orientation: 'vertical', length: 400, scrollOffset: 0, contentOffset: 40, scale: 1 },
  }).body;
  assert.match(vertical, /guide-marker[^"]*pending/);
  assert.match(vertical, /top:130px/, '90 panel units + 40 content offset');

  const horizontal = render(EditorRuler, {
    props: { orientation: 'horizontal', length: 400, scrollOffset: 0, contentOffset: 40, scale: 1 },
  }).body;
  assert.doesNotMatch(horizontal, /pending/, 'the ruler the drag came from does not mark it');

  // Zoom and scroll move the marker with the canvas.
  const zoomed = render(EditorRuler, {
    props: { orientation: 'vertical', length: 400, scrollOffset: 25, contentOffset: 40, scale: 2 },
  }).body;
  assert.match(zoomed, /top:195px/, '90 * 2 - 25 + 40');

  draggingGuide.set(null);
  assert.doesNotMatch(
    render(EditorRuler, {
      props: { orientation: 'vertical', length: 400, scrollOffset: 0, contentOffset: 40, scale: 1 },
    }).body,
    /pending/,
    'clearing the store clears the marker',
  );
});

test('the pending guide is drawn on the canvas as a full line with a live readout', () => {
  freshPanel('Canvas Preview');
  draggingGuide.set(pendingGuideOf({ orientation: 'vertical', outside: true, pos: 210 }));

  const body = render(GuideLines, { props: { scale: 1, panelWidth: 600, panelHeight: 400 } }).body;
  assert.match(body, /guide-line guide-v pending/);
  assert.match(body, /left:210px/);
  assert.match(body, />210</, 'the label reads out where releasing would put the guide');

  // No hit zone: the guide has no index in the document, so there is nothing to grab or remove.
  const preview = body.slice(body.indexOf('guide-v pending'));
  assert.doesNotMatch(preview, /guide-hit-zone/);

  draggingGuide.set(null);
  assert.doesNotMatch(
    render(GuideLines, { props: { scale: 1, panelWidth: 600, panelHeight: 400 } }).body,
    /pending/,
  );
});

// --- Guides across the pasteboard ---------------------------------------------------------------

test('the pasteboard extent is the visible overhang, in panel units', () => {
  // 600x400 panel drawn at 1:1, centred in an 1000x700 viewport.
  const surface = rect(200, 150, 800, 550);
  const view = rect(0, 0, 1000, 700);

  const e = pasteboardExtent(surface, view, 1);
  // One screen pixel is held back on every side: overflow to the right/bottom would otherwise
  // grow the scroll area of the `overflow: auto` viewport by a rounding error per measurement.
  assert.deepEqual(e, { left: 199, top: 149, right: 199, bottom: 149 });

  // Same screen geometry at 200% zoom is half as many PANEL units — the guide element lives
  // inside the scaled surface, so its offsets must be panel units (review S1).
  assert.deepEqual(pasteboardExtent(surface, view, 2), {
    left: 99.5, top: 74.5, right: 99.5, bottom: 74.5,
  });

  // A panel larger than the viewport has no pasteboard showing: the guide stops at the panel edge
  // rather than being dragged backwards into negative overhang.
  assert.deepEqual(pasteboardExtent(rect(-100, -50, 1200, 900), view, 1), NO_PASTEBOARD);
  assert.deepEqual(pasteboardExtent(null, view, 1), NO_PASTEBOARD);
});

test('an extent change smaller than half a pixel is not worth a redraw', () => {
  assert.equal(sameExtent(NO_PASTEBOARD, NO_PASTEBOARD), true);
  assert.equal(sameExtent({ left: 10, top: 10, right: 10, bottom: 10 },
                          { left: 10.2, top: 10, right: 9.9, bottom: 10 }), true);
  assert.equal(sameExtent({ left: 10, top: 10, right: 10, bottom: 10 },
                          { left: 10, top: 10, right: 12, bottom: 10 }), false);
  assert.equal(sameExtent(null, NO_PASTEBOARD), false);
});

test('a guide line stretches over the pasteboard while staying in panel coordinates', () => {
  const extent = { left: 199, top: 149, right: 199, bottom: 149 };

  const h = guideLineStyle('horizontal', 120, extent, 1);
  assert.match(h, /top:120px/, 'the position is still the panel coordinate');
  assert.match(h, /left:-199px/);
  assert.match(h, /right:-199px/);
  assert.match(h, /border-top-width:1px/);

  const v = guideLineStyle('vertical', 300, extent, 0.25);
  assert.match(v, /left:300px/);
  assert.match(v, /top:-149px/);
  assert.match(v, /bottom:-149px/);
  assert.match(v, /border-left-width:0.25px/, 'the 1/scale line width is untouched');

  // No pasteboard showing → exactly the old behaviour, panel edge to panel edge.
  assert.equal(guideLineStyle('horizontal', 40, NO_PASTEBOARD, 1),
               'top:40px; left:0px; right:0px; border-top-width:1px;');
  assert.equal(guideLineStyle('vertical', 40, undefined, 1),
               'left:40px; top:0px; bottom:0px; border-left-width:1px;');
});

test('GuideLines renders real guides through the pasteboard-aware style', () => {
  freshPanel('Span Panel');
  addGuide('horizontal', 120);
  addGuide('vertical', 300);

  const body = render(GuideLines, { props: { scale: 0.5, panelWidth: 600, panelHeight: 400 } }).body;
  // Server-side nothing is laid out, so the measured extent is still the zero one — but every
  // guide's style must come out of the same function byte for byte, because that function is the
  // only thing that will be carrying the measured extent in the browser.
  const styles = [...body.matchAll(/class="guide-line guide-[hv][^"]*" style="([^"]*)"/g)]
    .map((m) => m[1]);
  assert.deepEqual(styles, [
    guideLineStyle('horizontal', 120, NO_PASTEBOARD, 2),
    guideLineStyle('vertical', 300, NO_PASTEBOARD, 2),
  ]);

  // The hardcoded panel-width span the review cited is gone, and the measured extent is what the
  // markup is handed — the plumbing between the two halves of this fix.
  const source = src('editor', 'GuideLines.svelte');
  assert.match(source, /style=\{guideLineStyle\('horizontal', guidePos\('horizontal', i, pos\), extent, lineWidth\)\}/);
  assert.match(source, /style=\{guideLineStyle\('vertical', guidePos\('vertical', i, pos\), extent, lineWidth\)\}/);
  assert.match(source, /extent = pasteboardExtent\(|extent = next/, 'the extent is measured, not assumed');

  // The zoom compensation the whole S1 fix rested on must still be here.
  assert.match(source, /lineWidth = \$derived\(1 \/ scale\)/);
  assert.match(source, /hitZone = \$derived\(Math\.max\(3, 8 \/ scale\)\)/);

  panels.set([]);
  activeEditorTab.set({ type: 'panel', id: null });
  draggingGuide.set(null);
});
