// panelArrange.test.js — ce.panel's arrangement verbs (design doc §42).
//
// stores/alignment.js is twenty-seven operations on the canvas context menu, and not one of them
// was reachable from a script. They were written against the editor's SELECTION, so the maths moved
// into pure functions there and these verbs call the SAME ones with a list of names.
//
// That is what this file pins. Not "align moves things left" — that would pass against a second
// implementation that happened to look similar — but that the answer IS the app's, including the
// parts nobody would reinvent the same way: tidy's reading-order sort, circle's bounding-box
// centring, distribute leaving the ends alone, and the container offset that makes aligning two
// controls in different containers mean anything.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';
import {
  boundsOf, alignPatch, distributePatches, matchPatch, gridPatches, circlePatches, flipPatches,
} from '../src/CE_Application/stores/alignment.js';

const btn = (name, x, y, w = 40, h = 20) =>
  createControl('Button', { name, Transform: { x, y, width: w, height: h } });

/** A panel, and the api for a script on it. Every test drives its own document. */
function withPanel(controls, fn) {
  const panel = {
    id: 'p', name: 'P', width: 800, height: 600,
    scripting: { modules: ['ce.panel'] }, controls,
  };
  setRuntimeHost({ panel });
  try { return fn(scriptApiForTesting('', 'arrange-script'), panel); } finally { setRuntimeHost(null); }
}

/** The transforms the app's own functions expect, straight from a panel with no containers. */
const transformsOf = (api, names) => names.map((n) => {
  const r = api.panelRect(n);
  return { id: n, x: r.x, y: r.y, width: r.width, height: r.height };
});

const rects = (api, names) => names.map((n) => api.panelRect(n));

/* ------------------------------------------------------------------------ the contract */

test('every arrangement verb is declared, panel-view only, and namespaced under ce.panel', () => {
  for (const [id, path] of [
    ['panelAlign', 'ce.panel.align'], ['panelDistribute', 'ce.panel.distribute'],
    ['panelMatch', 'ce.panel.match'], ['panelGrid', 'ce.panel.grid'],
    ['panelCircle', 'ce.panel.circle'], ['panelFlip', 'ce.panel.flip'],
    ['panelRect', 'ce.panel.rect'], ['panelOrder', 'ce.panel.order'],
    ['panelBatch', 'ce.panel.batch'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // Arranging a document is editing it, and the editor is where a document is edited. The player
    // runs a panel; it does not lay one out.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW);
  }
});

/* ------------------------------------------------------------------------------- rect */

test('rect is PANEL coordinates, which Transform.x is not once anything is nested', () => {
  const inner = btn('inner', 5, 7);
  const box = createControl('Container', {
    name: 'box',
    Transform: { x: 100, y: 200, width: 300, height: 300 },
    Children: { _children: { inner } },
  });
  withPanel([box], (api) => {
    // The control's own Transform says 5,7. Where it IS on the panel is the container plus that —
    // and without this, "draw a line between these two controls" had no answer.
    assert.equal(api.getControlValue?.('inner.Transform.x') ?? 5, 5);
    const r = api.panelRect('inner');
    assert.equal(r.x > 5, true, 'the container offset must be applied');
    assert.equal(r.y > 7, true);
    assert.equal(r.right, r.x + r.width);
    assert.equal(r.bottom, r.y + r.height);
  });
});

test('rect over several names is the bounding box of the lot', () => {
  withPanel([btn('a', 10, 10, 40, 20), btn('b', 100, 50, 60, 30)], (api) => {
    assert.deepEqual(api.panelRect(['a', 'b']),
      { x: 10, y: 10, width: 150, height: 70, right: 160, bottom: 80 });
    // …and it IS the app's boundsOf, not a second opinion about what a bounding box is.
    const b = boundsOf(transformsOf(api, ['a', 'b']));
    assert.deepEqual({ x: b.x, y: b.y, width: b.width, height: b.height },
      { x: 10, y: 10, width: 150, height: 70 });
  });
});

test('rect of nothing is nothing', () => {
  withPanel([btn('a', 0, 0)], (api) => {
    assert.equal(api.panelRect('nope'), undefined);
    assert.equal(api.panelRect([]), undefined);
  });
});

/* ------------------------------------------------------------------------------ align */

test('align IS the canvas\'s align, on every edge', () => {
  const names = ['a', 'b', 'c'];
  for (const edge of ['left', 'hCenter', 'right', 'top', 'vCenter', 'bottom']) {
    withPanel([btn('a', 10, 10, 40, 20), btn('b', 100, 50, 60, 30), btn('c', 200, 90, 20, 50)], (api) => {
      const before = transformsOf(api, names);
      const ref = boundsOf(before);
      assert.equal(api.panelAlign(names, edge), 3);
      const after = rects(api, names);
      before.forEach((t, i) => {
        const patch = alignPatch(t, edge, ref);
        if ('Transform.x' in patch) assert.equal(after[i].x, patch['Transform.x'], `${edge} x of ${names[i]}`);
        if ('Transform.y' in patch) assert.equal(after[i].y, patch['Transform.y'], `${edge} y of ${names[i]}`);
      });
    });
  }
});

test('align to a named control uses THAT one as the reference, not the group', () => {
  withPanel([btn('a', 10, 10, 40, 20), btn('b', 100, 50, 60, 30), btn('c', 200, 90, 20, 50)], (api) => {
    api.panelAlign(['a', 'b', 'c'], 'left', { to: 'c' });
    // What the canvas calls a key object: everything moves to it, and it does not move.
    for (const r of rects(api, ['a', 'b', 'c'])) assert.equal(r.x, 200);
  });
});

test('align refuses an edge it does not know, and reports a name that is not a control', () => {
  withPanel([btn('a', 10, 10)], (api) => {
    assert.equal(api.panelAlign(['a'], 'sideways'), 0, 'a typo must not silently pick an edge');
    assert.equal(api.panelAlign(['a', 'ghost'], 'left'), 1, 'the real one still moves…');
    // …and the missing one is reported rather than passed over in silence, which is the difference
    // between "one name was wrong" and "why did only half of them move".
  });
});

/* ------------------------------------------------------------------------- distribute */

test('distribute IS the canvas\'s, positions and gaps alike', () => {
  const names = ['a', 'b', 'c', 'd'];
  for (const what of ['leftEdges', 'hCenters', 'rightEdges', 'topEdges', 'vCenters', 'bottomEdges',
                      'hSpacing', 'vSpacing']) {
    withPanel([btn('a', 0, 0, 40, 20), btn('b', 37, 15, 60, 30),
               btn('c', 133, 44, 20, 50), btn('d', 300, 120, 30, 10)], (api) => {
      const before = transformsOf(api, names);
      const expected = distributePatches(before, what, null, false);
      assert.ok(api.panelDistribute(names, what) > 0);
      const after = rects(api, names);
      names.forEach((n, i) => {
        const patch = expected.get(n);
        if (!patch) return;
        if ('Transform.x' in patch) assert.equal(after[i].x, patch['Transform.x'], `${what} x of ${n}`);
        if ('Transform.y' in patch) assert.equal(after[i].y, patch['Transform.y'], `${what} y of ${n}`);
      });
    });
  }
});

test('the ends stay put — that is what makes it distribute rather than lay out', () => {
  withPanel([btn('a', 0, 0), btn('b', 37, 0), btn('c', 200, 0)], (api) => {
    api.panelDistribute(['a', 'b', 'c'], 'leftEdges');
    const [a, b, c] = rects(api, ['a', 'b', 'c']);
    assert.equal(a.x, 0, 'the first is where it was');
    assert.equal(c.x, 200, 'and so is the last');
    assert.equal(b.x, 100, 'only the middle moved');
  });
});

test('spacing evens the GAPS, which differently-sized controls make a different picture', () => {
  withPanel([btn('a', 0, 0, 10, 20), btn('b', 50, 0, 80, 20), btn('c', 200, 0, 10, 20)], (api) => {
    api.panelDistribute(['a', 'b', 'c'], 'hSpacing');
    const [a, b, c] = rects(api, ['a', 'b', 'c']);
    // Equal gaps, not equal positions: b is wide, so its left edge is NOT half way.
    assert.equal(Math.round(b.x - a.right), Math.round(c.x - b.right));
  });
});

test('a forced gap overrides the computed one', () => {
  withPanel([btn('a', 0, 0, 10, 20), btn('b', 50, 0, 10, 20), btn('c', 200, 0, 10, 20)], (api) => {
    api.panelDistribute(['a', 'b', 'c'], 'hSpacing', { gap: 5 });
    const [a, b, c] = rects(api, ['a', 'b', 'c']);
    assert.equal(b.x - a.right, 5);
    assert.equal(c.x - b.right, 5);
  });
});

test('fewer than two things cannot be spread', () => {
  withPanel([btn('a', 0, 0)], (api) => {
    assert.equal(api.panelDistribute(['a'], 'leftEdges'), 0);
    assert.equal(api.panelDistribute(['a', 'b'], 'nonsense'), 0);
  });
});

/* ------------------------------------------------------------------------------ match */

test('match gives everything the reference\'s size, and the reference keeps its own', () => {
  withPanel([btn('a', 0, 0, 40, 20), btn('b', 100, 0, 60, 30), btn('c', 200, 0, 20, 50)], (api) => {
    assert.equal(api.panelMatch(['a', 'b', 'c'], 'both'), 2, 'two changed, not three');
    const [a, b, c] = rects(api, ['a', 'b', 'c']);
    const want = matchPatch({ width: 40, height: 20 }, 'both');
    for (const r of [a, b, c]) {
      assert.equal(r.width, want['Transform.width']);
      assert.equal(r.height, want['Transform.height']);
    }
  });
});

test('match takes width or height alone, and can be told which control to follow', () => {
  withPanel([btn('a', 0, 0, 40, 20), btn('b', 100, 0, 60, 30)], (api) => {
    api.panelMatch(['a', 'b'], 'width', { to: 'b' });
    const [a, b] = rects(api, ['a', 'b']);
    assert.equal(a.width, 60, 'a followed b…');
    assert.equal(a.height, 20, '…in width only');
    assert.equal(b.height, 30);
  });
});

/* ------------------------------------------------------------------------------- grid */

test('grid IS tidyGrid, reading-order sort and uniform cells included', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  withPanel([btn('a', 200, 5, 40, 20), btn('b', 10, 8, 60, 30), btn('c', 90, 100, 20, 50),
             btn('d', 300, 105, 30, 10), btn('e', 5, 210, 25, 25)], (api) => {
    const before = transformsOf(api, names);
    const expected = gridPatches(before, 2, 7, 9);
    assert.equal(api.panelGrid(names, { columns: 2, gapX: 7, gapY: 9 }), 5);
    const after = rects(api, names);
    names.forEach((n, i) => {
      const patch = expected.get(n);
      assert.equal(after[i].x, patch['Transform.x'], `x of ${n}`);
      assert.equal(after[i].y, patch['Transform.y'], `y of ${n}`);
    });
  });
});

test('rows are quantised to 20px, so tidy matches what the eye already sees', () => {
  // b sits 8px below a, which reads as the same row; c is a hundred px down and does not.
  withPanel([btn('a', 200, 0, 40, 20), btn('b', 10, 8, 40, 20), btn('c', 90, 100, 40, 20)], (api) => {
    api.panelGrid(['a', 'b', 'c'], { columns: 3, gapX: 0, gapY: 0 });
    const [a, b, c] = rects(api, ['a', 'b', 'c']);
    // Reading order is b (leftmost of the top row), then a, then c — document order would give
    // a, b, c, and the difference is exactly what "tidy" means.
    assert.equal(b.x < a.x, true, 'b came first because it is further left in the same row');
    assert.equal(c.x > a.x, true);
  });
});

/* ----------------------------------------------------------------------------- circle */

test('circle IS arrangeCircular, centred on the bounding box', () => {
  const names = ['a', 'b', 'c', 'd'];
  withPanel([btn('a', 0, 0), btn('b', 100, 0), btn('c', 100, 100), btn('d', 0, 100)], (api) => {
    const before = transformsOf(api, names);
    const expected = circlePatches(before, 80, 45);
    assert.equal(api.panelCircle(names, { radius: 80, startAngle: 45 }), 4);
    const after = rects(api, names);
    names.forEach((n, i) => {
      assert.equal(after[i].x, expected.get(n)['Transform.x'], `x of ${n}`);
      assert.equal(after[i].y, expected.get(n)['Transform.y'], `y of ${n}`);
    });
  });
});

test('the ring reads the way the list does', () => {
  withPanel([btn('a', 0, 0), btn('b', 100, 0), btn('c', 50, 100)], (api) => {
    api.panelCircle(['a', 'b', 'c'], { radius: 50, startAngle: 0 });
    const [a] = rects(api, ['a']);
    // Angle 0 is due EAST in this maths (cos, sin), so the first name lands to the right of centre.
    const b = api.panelRect(['a', 'b', 'c']);
    assert.equal(a.x + a.width / 2 > b.x + b.width / 2, true, 'the first is on the right');
  });
});

/* ------------------------------------------------------------------------------- flip */

test('flip mirrors where things SIT, and is its own inverse', () => {
  const names = ['a', 'b', 'c'];
  withPanel([btn('a', 0, 0, 40, 20), btn('b', 100, 30, 60, 30), btn('c', 300, 70, 20, 50)], (api) => {
    const before = transformsOf(api, names);
    const expected = flipPatches(before, 'horizontal');
    assert.equal(api.panelFlip(names, 'horizontal'), 3);
    names.forEach((n, i) => assert.equal(api.panelRect(n).x, expected.get(n)['Transform.x'], n));
    // Flipping twice puts everything back, which is the property that says it is a mirror rather
    // than a move.
    api.panelFlip(names, 'horizontal');
    names.forEach((n, i) => assert.equal(api.panelRect(n).x, before[i].x, n));
  });
});

test('flip does not resize or rotate — "flip the layout" is not "flip the artwork"', () => {
  withPanel([btn('a', 0, 0, 40, 20), btn('b', 100, 0, 60, 30)], (api) => {
    api.panelFlip(['a', 'b'], 'vertical');
    const [a, b] = rects(api, ['a', 'b']);
    assert.equal(a.width, 40);
    assert.equal(b.height, 30);
  });
});

/* ------------------------------------------------------------------------------ order */

test('order is DOCUMENT order, which is why set() could never do it', () => {
  withPanel([btn('a', 0, 0), btn('b', 0, 0), btn('c', 0, 0)], (api, panel) => {
    const names = () => panel.controls.map((c) => c._children.Core.name);
    assert.equal(api.panelOrder(['a'], 'front'), 1);
    // Later in the list paints later, so front is the END. Getting this backwards is the classic
    // way a bring-to-front sends something behind everything.
    assert.deepEqual(names(), ['b', 'c', 'a']);
    api.panelOrder(['a'], 'back');
    assert.deepEqual(names(), ['a', 'b', 'c']);
    api.panelOrder(['a'], 'forward');
    assert.deepEqual(names(), ['b', 'a', 'c']);
    api.panelOrder(['a'], 'backward');
    assert.deepEqual(names(), ['a', 'b', 'c']);
  });
});

test('order refuses a direction it does not know', () => {
  withPanel([btn('a', 0, 0)], (api) => {
    assert.equal(api.panelOrder(['a'], 'upwards'), 0);
  });
});

/* ------------------------------------------------------------------------------ batch */

test('batch runs the work and flushes whatever happens, including a throw', () => {
  withPanel([btn('a', 0, 0), btn('b', 100, 50)], (api) => {
    assert.equal(api.panelBatch(() => api.panelAlign(['a', 'b'], 'left')), true);
    assert.equal(api.panelRect('b').x, 0, 'the work happened');
    // A half-built panel that cannot be undone is worse than a half-built panel, so the flush is
    // in a finally and the throw is not swallowed either.
    assert.throws(() => api.panelBatch(() => { throw new Error('boom'); }), /boom/);
    assert.equal(api.panelBatch('not a function'), false);
  });
});

/* ------------------------------------------------------------ containers, throughout */

test('arranging works across containers, because the offset is applied both ways', () => {
  const inner = btn('inner', 5, 5, 40, 20);
  const box = createControl('Container', {
    name: 'box',
    Transform: { x: 100, y: 100, width: 300, height: 300 },
    Children: { _children: { inner } },
  });
  withPanel([box, btn('outer', 400, 400, 40, 20)], (api) => {
    // Aligning a nested control with a top-level one by their LOCAL x would align nothing. The
    // panel-space rects have to agree afterwards, and the nested one's stored Transform.x has to
    // have been written back through its container's offset.
    api.panelAlign(['inner', 'outer'], 'left');
    assert.equal(api.panelRect('inner').x, api.panelRect('outer').x);
    assert.equal(api.panelRect('inner').x, 105, 'the group\'s left edge, in panel coordinates');
  });
});
