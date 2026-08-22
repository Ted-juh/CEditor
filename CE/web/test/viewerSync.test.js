// viewerSync.test.js — the Viewer sidebar stops polling.
//
// Review finding B10, third clause: `ViewerSettings` read the image viewer's zoom off a
// `setInterval(…, 100)` that ran for the whole life of the tab — ten wakeups a second so a
// number could be right the twenty-odd times a session it changes — and the eyedropper
// indicator was a `$derived` reading `void zoomDisplay` purely to borrow that heartbeat.
//
// What makes this worth a test rather than just a deletion: the replacement has to keep
// working, and "the readout froze" is the kind of regression nobody notices until they are
// mid-task. So the properties pinned here are the two that matter — a read happens after the
// events that can move the zoom, and repeated events inside one frame produce one read.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIEWER_SYNC_EVENTS,
  createViewerSync,
  readViewerState,
} from '../src/CE_Application/utils/viewerSync.js';

function fakeViewer(zoom = 100, eyedropper = false) {
  return {
    zoom,
    eyedropper,
    getZoom() { return this.zoom; },
    isEyedropper() { return this.eyedropper; },
  };
}

/** A target that records its listeners so a test can fire them by hand. */
function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type) { for (const fn of listeners.get(type) ?? []) fn({ type }); },
    count() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}

/** A scheduler a test drives, standing in for requestAnimationFrame. */
function manualScheduler() {
  const queued = [];
  const schedule = (run) => { queued.push(run); };
  schedule.flush = () => { const runs = queued.splice(0); for (const run of runs) run(); };
  schedule.pending = () => queued.length;
  return schedule;
}

test('readViewerState rounds the zoom and defaults the eyedropper off', () => {
  assert.deepEqual(readViewerState(fakeViewer(133.4, true)), { zoom: 133, eyedropper: true });
  assert.deepEqual(readViewerState(null), { zoom: null, eyedropper: false });
  assert.deepEqual(readViewerState({}), { zoom: null, eyedropper: false });
});

test('a read after the sidebar acts is immediate — no frame, no interval', () => {
  const viewer = fakeViewer(100);
  const seen = [];
  const sync = createViewerSync({ getRef: () => viewer, apply: (s) => seen.push(s.zoom) });

  assert.equal(sync.refresh(), true, 'first read establishes the value');
  viewer.zoom = 110;
  assert.equal(sync.refresh(), true);
  assert.deepEqual(seen, [100, 110]);
});

test('an unchanged read does not touch the component state', () => {
  // The poll re-assigned `zoomDisplay` ten times a second whether or not it had moved.
  const viewer = fakeViewer(100);
  let applied = 0;
  const sync = createViewerSync({ getRef: () => viewer, apply: () => { applied += 1; } });
  sync.refresh();
  sync.refresh();
  sync.refresh();
  assert.equal(applied, 1);
});

test('the eyedropper is part of the same read, not a second poll dressed as a $derived', () => {
  const viewer = fakeViewer(100, false);
  const seen = [];
  const sync = createViewerSync({ getRef: () => viewer, apply: (s) => seen.push(s.eyedropper) });
  sync.refresh();
  viewer.eyedropper = true;
  assert.equal(sync.refresh(), true, 'zoom unchanged, eyedropper changed, still a read');
  assert.deepEqual(seen, [false, true]);
});

test('wheel and pointer events over the canvas produce a read', () => {
  const viewer = fakeViewer(100);
  const target = fakeTarget();
  const schedule = manualScheduler();
  const seen = [];
  const sync = createViewerSync({ getRef: () => viewer, apply: (s) => seen.push(s.zoom), schedule });
  sync.attach(target);

  viewer.zoom = 250;              // the viewer's own wheel handler did this
  target.fire('wheel');
  assert.equal(seen.length, 0, 'not read during the event — the handler may not have run yet');
  schedule.flush();
  assert.deepEqual(seen, [250]);

  viewer.zoom = 300;
  target.fire('pointerup');
  schedule.flush();
  assert.deepEqual(seen, [250, 300]);
});

test('a burst of events inside one frame coalesces into a single read', () => {
  const viewer = fakeViewer(100);
  const target = fakeTarget();
  const schedule = manualScheduler();
  let reads = 0;
  const sync = createViewerSync({
    getRef: () => { reads += 1; return viewer; },
    apply: () => {},
    schedule,
  });
  sync.attach(target);

  for (let i = 0; i < 40; i++) target.fire('wheel');
  assert.equal(schedule.pending(), 1, 'forty wheel ticks, one scheduled read');
  schedule.flush();
  assert.equal(reads, 1);
});

test('detaching removes every listener, so a closed tab costs nothing at all', () => {
  const target = fakeTarget();
  const sync = createViewerSync({ getRef: () => fakeViewer(), apply: () => {}, schedule: manualScheduler() });
  const detach = sync.attach(target);
  assert.equal(target.count(), VIEWER_SYNC_EVENTS.length);
  detach();
  assert.equal(target.count(), 0);
});

test('reads before the viewer has mounted are harmless and are not remembered as state', () => {
  let viewer = null;
  const seen = [];
  const sync = createViewerSync({ getRef: () => viewer, apply: (s) => seen.push(s.zoom) });
  assert.equal(sync.refresh(), false);
  viewer = fakeViewer(140);
  assert.equal(sync.refresh(), true);
  assert.deepEqual(seen, [140]);
});
