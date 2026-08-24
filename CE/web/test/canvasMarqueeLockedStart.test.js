// canvasMarqueeLockedStart.test.js — a rubber band can be started on top of a locked control.
//
// Review finding A10, second clause: "you can't start a marquee on top of one". The marquee
// controller only accepted a press whose target was the surface itself (or one of its two
// full-bleed decorations), and a locked control is a real element that takes the press and stops
// it propagating — so locking a background plate, the single most common thing anyone locks,
// removed rubber-band selection from most of the panel.
//
// The companion CSS fix (CanvasControl's .lock-click-through) makes a control locked ON ITS OWN
// click-through, which handles that case by making the surface the target again. This is the
// other half: the whole-PANEL lock deliberately keeps its controls pointer-active so the canvas
// does not go inert, and selection is not mutation, so the marquee has to work there too.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMarqueeController, startsMarquee } from '../src/CE_Application/utils/canvasInteractions.js';

/** A DOM stand-in: a selector list it matches, plus a parent chain for closest(). */
function el(matches = [], parent = null) {
  const node = {
    parent,
    classList: { contains: (c) => matches.includes(`.${c}`) },
    closest(selector) {
      let n = node;
      while (n) {
        if (n.matches.includes(selector)) return n;
        n = n.parent;
      }
      return null;
    },
    matches,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  };
  return node;
}

function withWindow(run) {
  const listeners = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  try {
    return run(listeners);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

const surface = () => el(['.panel-surface']);

test('startsMarquee accepts the surface and its full-bleed decorations', () => {
  const s = surface();
  assert.equal(startsMarquee(s, s), true);
  assert.equal(startsMarquee(el(['.grid-overlay'], s), s), true);
  assert.equal(startsMarquee(el(['.bg-layer'], s), s), true);
});

test('startsMarquee still refuses an ordinary control — a press there is a drag', () => {
  const s = surface();
  const control = el(['.canvas-control'], s);
  assert.equal(startsMarquee(control, s), false);
  assert.equal(startsMarquee(el(['.control-body'], control), s), false);
});

test('startsMarquee accepts a locked control, and anything drawn inside one', () => {
  const s = surface();
  const locked = el(['.canvas-control', '.canvas-control.locked'], s);
  assert.equal(startsMarquee(locked, s), true, 'the locked control itself');
  assert.equal(startsMarquee(el(['.control-body'], locked), s), true, 'a child of it');
});

function controller(state, surfaceEl, seen, alsoStartsOn = null) {
  return createMarqueeController(state, {
    getSurface: () => surfaceEl,
    getScale: () => 1,
    isBlocked: () => false,
    alsoStartsOn,
    onSelect: (rect, e, info) => seen.push({ rect, info }),
  });
}

test('a press on a locked control really does begin a marquee, and reports where it began', () => {
  withWindow((listeners) => {
    const s = surface();
    const locked = el(['.canvas-control', '.canvas-control.locked'], s);
    const state = { isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    const seen = [];
    const ctrl = controller(state, s, seen);

    ctrl.handleMouseDown({ button: 0, target: locked, clientX: 10, clientY: 10, preventDefault() {} });
    assert.equal(state.isActive, true, 'the marquee started on top of the locked control');

    listeners.get('mousemove')({ clientX: 90, clientY: 70 });
    assert.deepEqual(ctrl.getRect(), { x: 10, y: 10, w: 80, h: 60 });

    listeners.get('mouseup')({ shiftKey: false });
    assert.equal(state.isActive, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].info.onLocked, true,
      'the consumer is told, so a click-sized sweep does not clear the selection the press just made');
  });
});

test('a press on an unlocked control begins nothing — that press is the control\'s drag', () => {
  withWindow(() => {
    const s = surface();
    const state = { isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    const ctrl = controller(state, s, []);
    ctrl.handleMouseDown({ button: 0, target: el(['.canvas-control'], s), clientX: 10, clientY: 10, preventDefault() {} });
    assert.equal(state.isActive, false);
  });
});

test('the same press arriving twice (capture then bubble) starts one marquee, not two', () => {
  withWindow((listeners) => {
    const s = surface();
    const state = { isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    const seen = [];
    const ctrl = controller(state, s, seen);
    const press = { button: 0, target: s, clientX: 30, clientY: 40, preventDefault() {} };

    ctrl.handleMouseDown(press);
    ctrl.handleMouseDown({ ...press, clientX: 999, clientY: 999 });   // the bubble copy
    assert.deepEqual(state.start, { x: 30, y: 40 }, 'the second arrival must not move the anchor');

    listeners.get('mouseup')({});
    assert.equal(seen.length, 1);
  });
});

test('onLocked is false for an ordinary surface sweep, and resets between gestures', () => {
  withWindow((listeners) => {
    const s = surface();
    const locked = el(['.canvas-control', '.canvas-control.locked'], s);
    const state = { isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    const seen = [];
    const ctrl = controller(state, s, seen);

    ctrl.handleMouseDown({ button: 0, target: locked, clientX: 0, clientY: 0, preventDefault() {} });
    listeners.get('mouseup')({});
    ctrl.handleMouseDown({ button: 0, target: s, clientX: 0, clientY: 0, preventDefault() {} });
    listeners.get('mouseup')({});

    assert.deepEqual(seen.map((s2) => s2.info.onLocked), [true, false]);
  });
});

test('alsoStartsOn lets the consumer open the one case only it can judge', () => {
  // The editor uses this for the body of a container the user has drilled into: inside a group,
  // a drag over its empty space is a rubber band over the children, not a drag of the group.
  // Without it the only place a scoped marquee could begin was the bare panel around the
  // container — and a container that fills the panel left nowhere at all.
  withWindow(() => {
    const s = surface();
    const container = el(['.canvas-control'], s);
    const state = { isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    const ctrl = controller(state, s, [], (target) => target === container);

    ctrl.handleMouseDown({ button: 0, target: el(['.canvas-control'], s), clientX: 5, clientY: 5, preventDefault() {} });
    assert.equal(state.isActive, false, 'some other control is still its own drag');

    ctrl.handleMouseDown({ button: 0, target: container, clientX: 5, clientY: 5, preventDefault() {} });
    assert.equal(state.isActive, true);
  });
});
