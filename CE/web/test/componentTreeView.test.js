// componentTreeView.test.js — the maths behind the windowed component tree (finding C5), the
// drag auto-scroll and the ARIA arrow traversal (C6).
//
// The tree used to render one row per control with no windowing: 413 rows and ~1,200 inline icons
// for the GAIA panel, rebuilt from a full walk of the control tree on every write to the panel
// store — sixty times a second while a control is dragged on the canvas. Everything the fix
// depends on is arithmetic, so it lives in utils/componentTreeView.js and is tested here rather
// than being asserted through a rendered DOM that node --test cannot scroll.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TREE_ROW_HEIGHT,
  controlTreeSignature,
  dragAutoScrollStep,
  scrollTopForRow,
  treeArrowTarget,
  treeWindow,
  typeBadgeAddsInformation,
} from '../src/CE_Application/utils/componentTreeView.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

// --- Windowing -------------------------------------------------------------------------------

test('a 413-row panel mounts a screenful, not 413 rows', () => {
  const { start, end, padTop, padBottom } = treeWindow({
    scrollTop: 0,
    viewportHeight: 400,
    rowCount: 413,
    rowHeight: TREE_ROW_HEIGHT,
  });

  assert.equal(start, 0);
  assert.ok(end - start < 30, `mounted ${end - start} rows for a 400px viewport`);
  assert.equal(padTop, 0);
  // The spacers plus the mounted rows must add up to the full scroll height, or the scrollbar
  // lies about how much list there is.
  assert.equal(padTop + (end - start) * TREE_ROW_HEIGHT + padBottom, 413 * TREE_ROW_HEIGHT);
});

test('scrolling moves the window and keeps the total height exact', () => {
  const rowCount = 413;
  const w = treeWindow({ scrollTop: 3200, viewportHeight: 400, rowCount, rowHeight: TREE_ROW_HEIGHT });

  assert.ok(w.start > 90 && w.start <= 100, `window starts at ${w.start} for scrollTop 3200`);
  assert.equal(w.padTop, w.start * TREE_ROW_HEIGHT);
  assert.equal(w.padTop + (w.end - w.start) * TREE_ROW_HEIGHT + w.padBottom, rowCount * TREE_ROW_HEIGHT);
  // Overscan: the row at the top of the viewport is not the first row mounted.
  assert.ok(w.start < Math.floor(3200 / TREE_ROW_HEIGHT), 'no overscan above the fold');
});

test('an unmeasured viewport still renders rows', () => {
  // First frame: `bind:clientHeight` has not fired yet. Rendering nothing here would leave the
  // list permanently blank, because nothing would ever scroll it to wake it up.
  const w = treeWindow({ scrollTop: 0, viewportHeight: 0, rowCount: 50 });
  assert.ok(w.end > 0, 'an unmeasured list rendered nothing');
});

test('an empty tree windows to nothing', () => {
  assert.deepEqual(treeWindow({ rowCount: 0, viewportHeight: 400 }), { start: 0, end: 0, padTop: 0, padBottom: 0 });
});

// --- Reveal ----------------------------------------------------------------------------------

test('revealing a row scrolls only when the row is off screen', () => {
  const common = { scrollTop: 320, viewportHeight: 320, rowHeight: 32, rowCount: 413 };

  // Row 12 spans 384–416, inside 320–640: leave the scroll alone.
  assert.equal(scrollTopForRow({ ...common, index: 12 }), 320);
  // Row 2 is above the fold: bring its top to the top.
  assert.equal(scrollTopForRow({ ...common, index: 2 }), 64);
  // Row 40 is below: bring its bottom to the bottom.
  assert.equal(scrollTopForRow({ ...common, index: 40 }), 41 * 32 - 320);
});

test('revealing a row that is not in the list changes nothing', () => {
  assert.equal(scrollTopForRow({ index: -1, scrollTop: 96, viewportHeight: 320, rowCount: 10 }), 96);
});

// --- Drag auto-scroll ------------------------------------------------------------------------

test('dragging to the edge of the list scrolls it, and faster the closer you get', () => {
  const rect = { top: 100, bottom: 500 };

  assert.equal(dragAutoScrollStep({ pointerY: 300, ...rect }), 0, 'the middle must not scroll');

  const nearTop = dragAutoScrollStep({ pointerY: 112, ...rect });
  const atTop = dragAutoScrollStep({ pointerY: 100, ...rect });
  assert.ok(nearTop < 0 && atTop < 0, 'the top edge must scroll up');
  assert.ok(atTop < nearTop, `pinned to the edge (${atTop}) should beat merely near it (${nearTop})`);

  const nearBottom = dragAutoScrollStep({ pointerY: 488, ...rect });
  const atBottom = dragAutoScrollStep({ pointerY: 500, ...rect });
  assert.ok(nearBottom > 0 && atBottom > 0, 'the bottom edge must scroll down');
  assert.ok(atBottom > nearBottom);
});

test('a list shorter than two scroll zones still has a dead middle', () => {
  // Zone clamping: without it a 30px-tall list would be entirely inside both zones and the top
  // test would win everywhere, so the list could only ever scroll up.
  const rect = { top: 0, bottom: 30 };
  assert.ok(dragAutoScrollStep({ pointerY: 2, ...rect }) < 0);
  assert.ok(dragAutoScrollStep({ pointerY: 28, ...rect }) > 0);
});

// --- Type badge ------------------------------------------------------------------------------

test('the type badge is hidden when the name already says the type', () => {
  assert.equal(typeBadgeAddsInformation('MomentaryButton_12', 'MomentaryButton'), false);
  assert.equal(typeBadgeAddsInformation('MomentaryButton', 'MomentaryButton'), false);
  assert.equal(typeBadgeAddsInformation('momentarybutton_3', 'MomentaryButton'), false, 'case is not information');
  assert.equal(typeBadgeAddsInformation('Label 4', 'Label'), false);
});

test('the type badge stays when the author has named the control', () => {
  assert.equal(typeBadgeAddsInformation('cutoff', 'MomentaryButton'), true);
  assert.equal(typeBadgeAddsInformation('MomentaryButtonBank', 'MomentaryButton'), true, 'a longer name is a real name');
  assert.equal(typeBadgeAddsInformation('', 'Label'), true, 'a nameless row needs the type');
  assert.equal(typeBadgeAddsInformation('anything', ''), false, 'no type, nothing to show');
});

// --- Structure signature (the "does a canvas drag re-walk the tree" test) ---------------------

function panelControls() {
  const container = createControl('Container', { Core: { id: 'c1', name: 'Group', zIndex: 0 } });
  const child = createControl('Label', { Core: { id: 'c2', name: 'Caption', zIndex: 0 } });
  container._children.Children = { _children: { child0: child } };
  const knob = createControl('Knob', { Core: { id: 'k1', name: 'cutoff', zIndex: 1 } });
  return [container, knob];
}

/** What the canvas does on a drag frame: replace one control with a moved copy. */
function moveControl(controls, id, dx) {
  return controls.map((control) => {
    if (control._children.Core.id !== id) return control;
    return {
      ...control,
      _children: {
        ...control._children,
        Transform: { ...control._children.Transform, x: (control._children.Transform.x ?? 0) + dx },
      },
    };
  });
}

test('a canvas drag does not change the tree signature', () => {
  const before = panelControls();
  const signature = controlTreeSignature(before);

  let after = before;
  for (let frame = 0; frame < 60; frame++) after = moveControl(after, 'k1', 1);

  assert.equal(controlTreeSignature(after), signature,
    'moving a control changed the tree signature — the tree will rebuild 413 rows per drag frame again');
});

test('everything a row shows does change the signature', () => {
  const base = panelControls();
  const signature = controlTreeSignature(base);

  const withRename = base.map((c) => (c._children.Core.id === 'k1'
    ? { ...c, _children: { ...c._children, Core: { ...c._children.Core, name: 'resonance' } } }
    : c));
  assert.notEqual(controlTreeSignature(withRename), signature, 'a rename must reach the tree');

  const withHide = base.map((c) => (c._children.Core.id === 'k1'
    ? { ...c, _children: { ...c._children, Core: { ...c._children.Core, visible: false } } }
    : c));
  assert.notEqual(controlTreeSignature(withHide), signature, 'hiding must reach the tree');

  const withLock = base.map((c) => (c._children.Core.id === 'k1'
    ? { ...c, _children: { ...c._children, Core: { ...c._children.Core, locked: true } } }
    : c));
  assert.notEqual(controlTreeSignature(withLock), signature, 'locking must reach the tree');

  const withZ = base.map((c) => (c._children.Core.id === 'k1'
    ? { ...c, _children: { ...c._children, Core: { ...c._children.Core, zIndex: 99 } } }
    : c));
  assert.notEqual(controlTreeSignature(withZ), signature, 'a z-order change must reach the tree');

  assert.notEqual(controlTreeSignature(base.slice(0, 1)), signature, 'a deletion must reach the tree');

  // Reparenting: the child leaves the container for the root list.
  const [container, knob] = base;
  const child = container._children.Children._children.child0;
  const emptied = { ...container, _children: { ...container._children, Children: { _children: {} } } };
  assert.notEqual(controlTreeSignature([emptied, knob, child]), signature, 'a reparent must reach the tree');
});

// --- Arrow-key traversal ---------------------------------------------------------------------

const arrowRows = [
  { id: 'a', depth: 0, container: false },
  { id: 'g', depth: 0, container: true },
  { id: 'g1', depth: 1, container: false },
  { id: 'g2', depth: 1, container: false },
  { id: 'z', depth: 0, container: false },
];

test('Up/Down/Home/End walk the visible rows', () => {
  const rows = arrowRows;
  assert.deepEqual(treeArrowTarget({ rows, index: 0, key: 'ArrowDown' }), { type: 'move', index: 1 });
  assert.deepEqual(treeArrowTarget({ rows, index: 4, key: 'ArrowDown' }), { type: 'move', index: 4 }, 'the end is a wall, not a wrap');
  assert.deepEqual(treeArrowTarget({ rows, index: 2, key: 'ArrowUp' }), { type: 'move', index: 1 });
  assert.deepEqual(treeArrowTarget({ rows, index: 0, key: 'ArrowUp' }), { type: 'move', index: 0 });
  assert.deepEqual(treeArrowTarget({ rows, index: 3, key: 'Home' }), { type: 'move', index: 0 });
  assert.deepEqual(treeArrowTarget({ rows, index: 0, key: 'End' }), { type: 'move', index: 4 });
});

test('Right opens a collapsed container, then steps into it', () => {
  const collapsed = [arrowRows[0], arrowRows[1], arrowRows[4]];
  assert.deepEqual(
    treeArrowTarget({ rows: collapsed, index: 1, key: 'ArrowRight', expanded: () => false }),
    { type: 'expand', id: 'g' },
  );
  assert.deepEqual(
    treeArrowTarget({ rows: arrowRows, index: 1, key: 'ArrowRight', expanded: () => true }),
    { type: 'move', index: 2 },
  );
  assert.equal(treeArrowTarget({ rows: arrowRows, index: 4, key: 'ArrowRight' }), null, 'a leaf has nowhere to go');
});

test('Left closes an open container, then steps out to the parent', () => {
  assert.deepEqual(
    treeArrowTarget({ rows: arrowRows, index: 1, key: 'ArrowLeft', expanded: () => true }),
    { type: 'collapse', id: 'g' },
  );
  assert.deepEqual(
    treeArrowTarget({ rows: arrowRows, index: 3, key: 'ArrowLeft', expanded: () => true }),
    { type: 'move', index: 1 },
    'from a child, Left goes to the container that holds it',
  );
  assert.equal(treeArrowTarget({ rows: arrowRows, index: 0, key: 'ArrowLeft' }), null, 'a root leaf has no parent');
});

test('keys the tree does not own are left alone', () => {
  assert.equal(treeArrowTarget({ rows: arrowRows, index: 0, key: 'a' }), null);
  assert.equal(treeArrowTarget({ rows: [], index: -1, key: 'ArrowDown' }), null);
});
