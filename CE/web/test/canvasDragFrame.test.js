// canvasDragFrame.test.js — a nested control has to snap, measure and multi-drag in ITS OWN
// coordinate space.
//
// The bug this pins (review finding A5) is a units mismatch that had been live since containers
// shipped. A nested control's Transform.x/y is measured from its container's content origin;
// CanvasControl handed every descendant the panel's TOP-LEVEL control list and the panel's own
// size, so a child compared parent-relative numbers against panel-space numbers. Three symptoms,
// all of them here:
//
//   1. snapping inside a container snapped to positions unrelated to the guide drawn for them;
//   2. the distance labels shown inside a container were arithmetic across two coordinate systems;
//   3. a co-selected SIBLING nested in the same container was not in the top-level list at all, so
//      the multi-drag commit never patched it — it followed the drag on screen and jumped back the
//      instant the mouse came up.
//
// And the second half of A12(a): Ctrl+A selects a container together with everything inside it,
// and the container CARRIES its children (it translates, the DOM nesting takes them along). A
// child that also applied the broadcast delta moved twice, on screen and on commit.
//
// The tests below exercise the pure module CanvasControl delegates to, plus the composition it
// actually performs — the frame math feeding the real snapping utils — and finish with the wiring
// assertions that stop the component quietly going back to the panel list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  framedGuides, hasSelectedAncestor, multiDragPatches, toPanelDistances, toPanelGuides,
} from '../src/CE_Application/utils/canvasDragFrame.js';
import { findAlignmentSnap, computeDistances } from '../src/CE_Application/utils/canvasSnapping.js';

const getSection = (control, name) => control?._children?.[name] ?? null;

/** Minimal control node: the tree helpers only ever read Core, Transform and Children. */
function ctrl(id, x, y, w = 40, h = 20, children = null) {
  const node = {
    _children: {
      Core: { id, name: id },
      Transform: { x, y, width: w, height: h },
    },
  };
  if (children) {
    node._children.Children = {
      padding: 0,
      _children: Object.fromEntries(children.map((child) => [child._children.Core.id, child])),
    };
  }
  return node;
}

// ---------------------------------------------------------------------------
// Frame conversions
// ---------------------------------------------------------------------------

test('ruler guides come into the frame by the frame origin, and top level is left untouched', () => {
  const stored = { horizontal: [100, 260], vertical: [50, 300] };

  // Top level: same object back, so the derived that reads it does not churn every tick.
  assert.equal(framedGuides(stored, { x: 0, y: 0 }), stored);
  assert.equal(framedGuides(stored, undefined), stored);

  // A control inside a container whose content origin sits at panel (200, 80): the guide drawn at
  // panel x=300 is at local x=100 for it, and snapping to "300" would have put it 200 units away.
  const framed = framedGuides(stored, { x: 200, y: 80 });
  assert.deepEqual(framed.vertical, [-150, 100]);
  assert.deepEqual(framed.horizontal, [20, 180]);
});

test('snap guides and distance labels go back OUT to panel space for the overlay', () => {
  const offset = { x: 200, y: 80 };

  const guides = toPanelGuides(
    [{ type: 'vertical', pos: 100, center: false }, { type: 'horizontal', pos: 20, center: true }],
    offset,
  );
  assert.deepEqual(guides, [
    { type: 'vertical', pos: 300, center: false },
    { type: 'horizontal', pos: 100, center: true },
  ]);

  // Only the anchor point moves. A gap is a length and a length is the same in every frame.
  const labels = toPanelDistances([{ axis: 'h', side: 'left', dist: 12, x: 10, y: 30, length: 12 }], offset);
  assert.deepEqual(labels, [{ axis: 'h', side: 'left', dist: 12, x: 210, y: 110, length: 12 }]);

  // Top level is a no-op on both, which is what keeps un-nested behaviour bit-identical.
  const flat = [{ type: 'vertical', pos: 100, center: false }];
  assert.equal(toPanelGuides(flat, { x: 0, y: 0 }), flat);
});

// ---------------------------------------------------------------------------
// A5 (1) and (2): snapping and measuring against siblings, in the frame
// ---------------------------------------------------------------------------

test('a child snaps to its SIBLING, not to a top-level control that happens to share a number', () => {
  // The container sits at panel (200, 80) with no padding, so a child's local x is panel x - 200.
  const sibling = ctrl('sibling', 100, 0);           // local 100 → panel 300
  const dragged = ctrl('dragged', 97, 40);           // local 97, three units short of its sibling
  const topLevelDecoy = ctrl('decoy', 97, 400);      // panel 97 — exactly where the OLD code looked

  // What the component now does: frame controls, frame bounds, frame-space ruler guides.
  const frameSize = { width: 400, height: 300 };
  const snapped = findAlignmentSnap(
    { x: 97, y: 40, w: 40, h: 20 }, 'dragged',
    [sibling, dragged], framedGuides({ horizontal: [], vertical: [] }, { x: 200, y: 80 }),
    getSection, frameSize, 5,
  );
  assert.equal(snapped.x, 100, 'should have snapped its left edge to the sibling three units away');
  assert.deepEqual(toPanelGuides(snapped.guides, { x: 200, y: 80 }).filter((g) => g.type === 'vertical'),
    [{ type: 'vertical', pos: 300, center: false }],
    'and the guide must be drawn in PANEL space, where the overlay and the rulers live');

  // The regression, stated the other way round: fed the top-level list the old way, the same drag
  // finds the decoy and reports a guide at panel 97 — a line nowhere near either control.
  const wrong = findAlignmentSnap(
    { x: 97, y: 40, w: 40, h: 20 }, 'dragged', [topLevelDecoy], { horizontal: [], vertical: [] },
    getSection, { width: 800, height: 600 }, 5,
  );
  assert.equal(wrong.x, 97);
  assert.notDeepEqual(wrong.guides, snapped.guides);
});

test('a child measures its gaps against the container content box, not the panel', () => {
  // Local x 20, width 40 → 20 units of clearance on the left inside a 200-wide content box, and
  // 140 on the right. Measured against a 900-wide PANEL the right-hand label would read 840.
  const labels = computeDistances(
    { x: 20, y: 10, w: 40, h: 20 }, 'dragged', new Set(['dragged']),
    [ctrl('dragged', 20, 10)], { width: 200, height: 100 }, getSection,
  );
  const byside = Object.fromEntries(labels.map((l) => [l.side, l.dist]));
  assert.equal(byside.left, 20);
  assert.equal(byside.right, 140);
  assert.equal(byside.top, 10);
  assert.equal(byside.bottom, 70);
});

// ---------------------------------------------------------------------------
// hasSelectedAncestor
// ---------------------------------------------------------------------------

test('a control knows whether one of its own ancestors is in the selection', () => {
  assert.equal(hasSelectedAncestor(['group'], new Set(['group', 'child'])), true);
  assert.equal(hasSelectedAncestor(['outer', 'inner'], new Set(['outer'])), true,
    'a grandparent counts — it carries the whole subtree');
  assert.equal(hasSelectedAncestor(['group'], new Set(['child'])), false);
  assert.equal(hasSelectedAncestor([], new Set(['child'])), false, 'top level has no ancestors');
});

// ---------------------------------------------------------------------------
// A5 (3) and A12(a): what a finished drag commits
// ---------------------------------------------------------------------------

test('a single-selection drag commits the dragged control and nothing else', () => {
  const tree = [ctrl('a', 10, 10), ctrl('b', 90, 10)];
  const patches = multiDragPatches({
    tree, selectedIds: new Set(['a']), draggedId: 'a', draggedAncestorIds: [],
    dx: 7, dy: 3, draggedX: 17, draggedY: 13, multi: false, getSection,
  });
  assert.deepEqual([...patches.keys()], ['a']);
  assert.deepEqual(patches.get('a'), { 'Transform.x': 17, 'Transform.y': 13 });
});

test('top-level multi-drag still moves every selected control by the delta', () => {
  const tree = [ctrl('a', 10, 10), ctrl('b', 90, 10), ctrl('c', 300, 10)];
  const patches = multiDragPatches({
    tree, selectedIds: new Set(['a', 'b']), draggedId: 'a', draggedAncestorIds: [],
    dx: 5, dy: -2, draggedX: 15, draggedY: 8, multi: true, getSection,
  });
  assert.deepEqual([...patches.keys()].sort(), ['a', 'b']);
  // The dragged one commits its SNAPPED position; the followers commit start + delta.
  assert.deepEqual(patches.get('a'), { 'Transform.x': 15, 'Transform.y': 8 });
  assert.deepEqual(patches.get('b'), { 'Transform.x': 95, 'Transform.y': 8 });
  assert.equal(patches.has('c'), false);
});

test('A5(3): a co-selected sibling INSIDE a container is patched — it used to snap back', () => {
  const kidA = ctrl('kidA', 10, 10);
  const kidB = ctrl('kidB', 80, 10);
  const tree = [ctrl('group', 200, 80, 300, 200, [kidA, kidB]), ctrl('outside', 600, 400)];

  const patches = multiDragPatches({
    tree, selectedIds: new Set(['kidA', 'kidB']), draggedId: 'kidA', draggedAncestorIds: ['group'],
    dx: 6, dy: 4, draggedX: 16, draggedY: 14, multi: true, getSection,
  });

  assert.deepEqual([...patches.keys()].sort(), ['kidA', 'kidB']);
  assert.deepEqual(patches.get('kidA'), { 'Transform.x': 16, 'Transform.y': 14 });
  // The whole point: kidB is nowhere in the panel's top-level list, which is what the old loop
  // walked, so it got no patch at all and the drag visibly undid itself on mouseup.
  assert.deepEqual(patches.get('kidB'), { 'Transform.x': 86, 'Transform.y': 14 });
  // …and the container it lives in must not move: it is not selected.
  assert.equal(patches.has('group'), false);
});

test('a multi-drag spanning two different containers moves both, in their own frames', () => {
  const left = ctrl('left', 5, 5);
  const right = ctrl('right', 7, 9);
  const tree = [
    ctrl('groupL', 0, 0, 200, 200, [left]),
    ctrl('groupR', 400, 300, 200, 200, [right]),
  ];
  const patches = multiDragPatches({
    tree, selectedIds: new Set(['left', 'right']), draggedId: 'left', draggedAncestorIds: ['groupL'],
    dx: 10, dy: 10, draggedX: 15, draggedY: 15, multi: true, getSection,
  });
  // A delta is frame-independent — frames differ only by a translation — so the same dx/dy is the
  // right answer for a control in a container 400 units away.
  assert.deepEqual(patches.get('left'), { 'Transform.x': 15, 'Transform.y': 15 });
  assert.deepEqual(patches.get('right'), { 'Transform.x': 17, 'Transform.y': 19 });
});

test('A12(a): a child carried by a selected container is NOT patched a second time', () => {
  const kid = ctrl('kid', 10, 10);
  const tree = [ctrl('group', 200, 80, 300, 200, [kid])];

  // Ctrl+A then drag the container. The container moves; the child rides along because it is
  // nested inside it. Patching the child too would move it by the delta again, relative to a
  // container that has already moved — it slides out of its own parent.
  const dragContainer = multiDragPatches({
    tree, selectedIds: new Set(['group', 'kid']), draggedId: 'group', draggedAncestorIds: [],
    dx: 12, dy: 0, draggedX: 212, draggedY: 80, multi: true, getSection,
  });
  assert.deepEqual([...dragContainer.keys()], ['group']);
  assert.deepEqual(dragContainer.get('group'), { 'Transform.x': 212, 'Transform.y': 80 });

  // The same double from the other end: with both selected, grabbing the CHILD must move the
  // container (the selection root) and leave the child's own Transform alone.
  const dragChild = multiDragPatches({
    tree, selectedIds: new Set(['group', 'kid']), draggedId: 'kid', draggedAncestorIds: ['group'],
    dx: 12, dy: 0, draggedX: 22, draggedY: 10, multi: true, getSection,
  });
  assert.deepEqual([...dragChild.keys()], ['group']);
  assert.deepEqual(dragChild.get('group'), { 'Transform.x': 212, 'Transform.y': 80 });
});

test('a grandchild is carried too — selection roots go all the way up', () => {
  const grandchild = ctrl('gc', 5, 5);
  const tree = [ctrl('outer', 0, 0, 400, 400, [ctrl('inner', 20, 20, 200, 200, [grandchild])])];
  const patches = multiDragPatches({
    tree, selectedIds: new Set(['outer', 'inner', 'gc']), draggedId: 'outer', draggedAncestorIds: [],
    dx: 9, dy: 9, draggedX: 9, draggedY: 9, multi: true, getSection,
  });
  assert.deepEqual([...patches.keys()], ['outer'],
    'only the outermost selected container moves under its own power');
});

// ---------------------------------------------------------------------------
// The wiring. The math above is worthless if CanvasControl stops calling it.
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const canvasControl = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'CanvasControl.svelte'), 'utf8',
);
const panelSurface = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'PanelSurface.svelte'), 'utf8',
);

test('CanvasControl snaps and measures against its frame, never against allControls', () => {
  const alignSnap = canvasControl.slice(canvasControl.indexOf('function alignSnap('));
  const alignBody = alignSnap.slice(0, alignSnap.indexOf('\n  }'));
  assert.match(alignBody, /mySiblings/, 'alignSnap no longer uses the frame control list');
  assert.match(alignBody, /myFrameGuides/, 'alignSnap is back on panel-space ruler guides');
  assert.match(alignBody, /myFrameSize/, 'alignSnap is back on the panel size for a nested control');
  assert.doesNotMatch(alignBody, /\ballControls\b/);

  const distances = canvasControl.slice(canvasControl.indexOf('function distancesFor('));
  const distancesBody = distances.slice(0, distances.indexOf('\n  }'));
  assert.match(distancesBody, /mySiblings/);
  assert.match(distancesBody, /myFrameSize/);
  assert.doesNotMatch(distancesBody, /\ballControls\b/);
});

test('a container hands each child its own frame', () => {
  assert.match(canvasControl, /frameControls=\{childControls\}/,
    'nested controls are not being given their siblings — they are back on the panel list');
  assert.match(canvasControl, /frameSize=\{childFrameSize\}/,
    'nested controls are not being given the container content box to snap against');
  // childFrameSize must be the CONTENT box: a child's 0,0 is the content origin, so measuring to
  // the border box would report the padding as free space on every side.
  assert.match(canvasControl,
    /childFrameSize = \$derived\(\{[\s\S]*?displayW - childrenPad\.left - childrenPad\.right[\s\S]*?displayH - childrenPad\.top - childrenPad\.bottom/);
});

test('the commit goes through multiDragPatches, not a walk of the top-level list', () => {
  assert.match(canvasControl, /const patches = multiDragPatches\(\{/);
  assert.doesNotMatch(canvasControl, /for \(const other of allControls\)/,
    'the top-level multi-drag loop is back — nested siblings will snap back on mouseup again');
});

test('the broadcast delta is refused by a control an ancestor is already carrying', () => {
  assert.match(canvasControl,
    /carriedByAncestor = \$derived\(isSelected && hasSelectedAncestor\(parentChainIds, \$selectedComponentIds\)\)/);
  for (const axis of ['X', 'Y']) {
    assert.match(canvasControl,
      new RegExp(`multiDragOffset${axis} = \\$derived\\(!isDragging && isSelected && !carriedByAncestor`),
      `multiDragOffset${axis} applies to a carried child again — Ctrl+A then drag double-moves it`);
  }
});

test('a carried control cannot reparent — the ancestor holding it decides where it lives', () => {
  // The pointer is inside the moving ancestor, and buildDropCandidates excludes a moving root's
  // whole subtree, so asking "which container is under the pointer" returns something outside the
  // container the control has not left. Left unguarded, a Ctrl+A drag of one nested child tore its
  // container out of its own parent.
  assert.match(canvasControl,
    /const carriedNow = isMultiDrag && hasSelectedAncestor\(parentChainIds, ids\)/);
  assert.match(canvasControl, /if \(moved && !dragSpaceHeld && !carriedNow\) \{/);
  assert.match(canvasControl,
    /const canReparent = !dragSpaceHeld && !\(ids\.size > 1 && hasSelectedAncestor\(parentChainIds, ids\)\)/,
    'the live drop-target highlight still lights a container a carried control cannot move into');
});

test('the immediate parent is the LAST id in the chain, not the first', () => {
  // parentChainIds is built outermost-first. Reading [0] named the grandparent at depth 2, and a
  // drag that stayed inside its container looked like a reparent out of the grandparent.
  assert.match(canvasControl, /myParentId = \$derived\(parentChainIds\.length \? parentChainIds\[parentChainIds\.length - 1\] : null\)/);
  assert.doesNotMatch(canvasControl, /parentChainIds\[0\]/);
});

test('the panel surface is the top-level frame, and says so', () => {
  // No frameControls at the top: the absence is the statement. If one ever appears here it must be
  // orderedControls, because those are the controls whose x/y is measured from the panel origin.
  const surfaceProps = panelSurface.slice(panelSurface.indexOf('<CanvasControl'));
  assert.doesNotMatch(surfaceProps.slice(0, surfaceProps.indexOf('/>')), /frameControls|frameSize/);
  assert.match(panelSurface, /allControls=\{orderedControls\}/);
});
