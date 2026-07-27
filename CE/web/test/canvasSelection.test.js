import test from 'node:test';
import assert from 'node:assert/strict';

import { findControlAtPoint } from '../src/CE_Application/utils/canvasSelection.js';

// Container C at (10,10) 200x200, padding 0, with child K at local (20,20) 120x32
// → K occupies panel-space (30,30)..(150,62).
function tree() {
  const child = { _children: { Core: { id: 'K' }, Transform: { x: 20, y: 20, width: 120, height: 32 } } };
  const cont = {
    _children: {
      Core: { id: 'C' },
      Transform: { x: 10, y: 10, width: 200, height: 200 },
      Children: { _type: 'Children', padding: 0, _children: { K: child } },
    },
  };
  return [cont];
}
const hitId = (p) => p?._children?.Core?.id ?? null;

test('findControlAtPoint descends to the deepest nested hit', () => {
  assert.equal(hitId(findControlAtPoint(tree(), 90, 46)), 'K');   // inside the nested child
});

test('findControlAtPoint returns the container when the point misses its children', () => {
  assert.equal(hitId(findControlAtPoint(tree(), 15, 15)), 'C');   // inside container, outside child
});

test('findControlAtPoint returns null when nothing contains the point', () => {
  assert.equal(findControlAtPoint(tree(), 300, 300), null);
});

test('findControlAtPoint is unchanged for a flat panel (no Children)', () => {
  const flat = [
    { _children: { Core: { id: 'A' }, Transform: { x: 0, y: 0, width: 50, height: 50 } } },
    { _children: { Core: { id: 'B' }, Transform: { x: 100, y: 0, width: 50, height: 50 } } },
  ];
  assert.equal(hitId(findControlAtPoint(flat, 25, 25)), 'A');
  assert.equal(hitId(findControlAtPoint(flat, 120, 25)), 'B');
  assert.equal(findControlAtPoint(flat, 300, 300), null);
});
