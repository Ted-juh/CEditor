// tabStripTabWidth.test.js — a Tab Container's tabs can take a fixed width and leave the rest of
// the strip free.
//
// The strip used to share its whole width between the tabs, four words across 1500px. With
// TabContainer.tabWidth they sit left-aligned at that width, the rest of the strip is the page's
// to use (the GAIA's bank pages put READ / STOP / CHECK there), and a click on that free part is
// not a tab click.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { tabAtPoint, tabGeometry, tabRect } from '../src/CE_Application/utils/tabContainerLayout.js';

function tabs(extra = {}) {
  const c = createControl('TabContainer', { Core: { id: 't' } });
  Object.assign(c._children.TabContainer, {
    stripSize: 20, pages: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }], ...extra,
  });
  return c;
}

test('without tabWidth the strip is shared out equally, as before', () => {
  const geom = tabGeometry(800, 200, tabs());
  assert.deepEqual([0, 1, 2, 3].map((i) => tabRect(geom, i, 4).x), [0, 200, 400, 600]);
  assert.equal(tabAtPoint(geom, 700, 10, 4), 3);
});

test('with tabWidth the tabs sit left-aligned at that width', () => {
  const geom = tabGeometry(800, 200, tabs({ tabWidth: 120 }));
  assert.deepEqual([0, 1, 2, 3].map((i) => tabRect(geom, i, 4)), [0, 1, 2, 3].map((i) => ({ x: i * 120, y: 0, w: 120, h: 20 })));
});

test('a click on the free part of the strip is not a tab click', () => {
  const geom = tabGeometry(800, 200, tabs({ tabWidth: 120 }));
  assert.equal(tabAtPoint(geom, 130, 10, 4), 1, 'the second tab');
  assert.equal(tabAtPoint(geom, 470, 10, 4), 3, 'the last tab');
  assert.equal(tabAtPoint(geom, 700, 10, 4), null, 'the free strip belongs to the page');
});

test('a tabWidth wider than an equal share falls back to the equal share', () => {
  const geom = tabGeometry(400, 200, tabs({ tabWidth: 300 }));
  assert.equal(tabRect(geom, 3, 4).x, 300);
  assert.equal(tabRect(geom, 3, 4).w, 100);
});
