import test from 'node:test';
import assert from 'node:assert/strict';

import { findAlignmentSnap } from '../src/CE_Application/utils/canvasSnapping.js';

const getSection = (ctrl, name) => ctrl?._children?.[name];

test('snaps a control to the panel centre and tags the guide as centre', () => {
  // Panel 400x300 → centre (200,150). A 40x20 box whose centre is near (200,150).
  const rect = { x: 182, y: 141, w: 40, h: 20 }; // centre ~ (202,151), 2px off
  const result = findAlignmentSnap(rect, 'self', [], { horizontal: [], vertical: [] }, getSection, { width: 400, height: 300 });
  // Centre should snap so the box centre lands on 200 / 150.
  assert.equal(result.x + rect.w / 2, 200);
  assert.equal(result.y + rect.h / 2, 150);
  const vGuide = result.guides.find((g) => g.type === 'vertical');
  const hGuide = result.guides.find((g) => g.type === 'horizontal');
  assert.equal(vGuide.pos, 200);
  assert.equal(vGuide.center, true);
  assert.equal(hGuide.pos, 150);
  assert.equal(hGuide.center, true);
});

test('snaps a control edge to the panel edge (not tagged centre)', () => {
  const rect = { x: 3, y: 100, w: 40, h: 20 };
  const result = findAlignmentSnap(rect, 'self', [], { horizontal: [], vertical: [] }, getSection, { width: 400, height: 300 });
  assert.equal(result.x, 0); // left edge snaps to panel left
  const vGuide = result.guides.find((g) => g.type === 'vertical');
  assert.equal(vGuide.pos, 0);
  assert.equal(vGuide.center, false);
});

test('no panel snapping when panelSize is omitted (backward compatible)', () => {
  const rect = { x: 182, y: 141, w: 40, h: 20 };
  const result = findAlignmentSnap(rect, 'self', [], { horizontal: [], vertical: [] }, getSection);
  assert.deepEqual(result.guides, []);
  assert.equal(result.x, 182);
  assert.equal(result.y, 141);
});

test('control-to-control alignment still works and is never tagged panel-centre', () => {
  const other = {
    _children: { Core: { id: 'other' }, Transform: { x: 100, y: 100, width: 40, height: 40 } },
  };
  // Box left edge near the other control's left edge → aligns to it.
  const rect = { x: 102, y: 102, w: 40, h: 40 };
  const result = findAlignmentSnap(rect, 'self', [other], { horizontal: [], vertical: [] }, getSection, { width: 800, height: 600 });
  const vGuide = result.guides.find((g) => g.type === 'vertical');
  assert.equal(result.x, 100); // left edges aligned
  assert.equal(vGuide.center, false); // a control alignment, not the panel centre
});

test('threshold parameter widens and narrows the sticky zone (zoom compensation)', () => {
  // 8 units off the panel-left edge: outside the default 5-unit threshold...
  const rect = { x: 8, y: 100, w: 40, h: 20 };
  const noSnap = findAlignmentSnap(rect, 'self', [], { horizontal: [], vertical: [] }, getSection, { width: 400, height: 300 });
  assert.equal(noSnap.x, 8);

  // ...but inside a widened threshold (5 screen px at 50% zoom = 10 panel units).
  const zoomedOut = findAlignmentSnap(rect, 'self', [], { horizontal: [], vertical: [] }, getSection, { width: 400, height: 300 }, 10);
  assert.equal(zoomedOut.x, 0);

  // A narrowed threshold (zoomed in) refuses what the default would take.
  const near = { x: 4, y: 100, w: 40, h: 20 };
  const zoomedIn = findAlignmentSnap(near, 'self', [], { horizontal: [], vertical: [] }, getSection, { width: 400, height: 300 }, 1.25);
  assert.equal(zoomedIn.x, 4);
});
