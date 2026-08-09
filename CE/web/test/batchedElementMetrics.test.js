import test from 'node:test';
import assert from 'node:assert/strict';

import {
  observeElementMetrics,
  scheduleElementMetrics,
  flushElementMetricsForTest,
  resetElementMetricsForTest,
} from '../src/CE_Application/utils/batchedElementMetrics.js';

/**
 * A ResizeObserver real enough to test the batching: it records what is observed, delivers an
 * initial callback the way the real one does, and lets a test fire a resize on demand.
 */
function installEnvironment() {
  const observed = [];
  let deliver = null;
  const frames = [];

  globalThis.ResizeObserver = class {
    constructor(callback) { deliver = (targets) => callback(targets.map((target) => ({ target }))); }
    // The real ResizeObserver keeps one observation per target, so observing twice is not two
    // entries — a fake that appended would make the shared-element teardown test lie.
    observe(el) { if (!observed.includes(el)) observed.push(el); }
    unobserve(el) { const i = observed.indexOf(el); if (i !== -1) observed.splice(i, 1); }
    disconnect() { observed.length = 0; }
  };
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = (id) => { frames[id - 1] = null; };

  return {
    observed,
    resize: (...targets) => deliver(targets),
    // The real initial delivery: observing an element calls back with it.
    deliverInitial: () => deliver([...observed]),
    pendingFrames: () => frames.filter(Boolean).length,
  };
}

const el = (name) => ({ name });

// The shared observer is created once and kept for the life of the page, so each test has to start
// from a clean one or it talks to the previous test's fake.
test.beforeEach(() => { resetElementMetricsForTest(); });
test.afterEach(() => {
  resetElementMetricsForTest();
  delete globalThis.ResizeObserver;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});

test('every measure runs before any commit', () => {
  // THE WHOLE POINT. A commit writes reactive state, which makes the framework touch the DOM, which
  // invalidates layout — so a commit landing between two measures means the second measure pays for
  // a fresh layout. With 413 controls that is 413 layouts instead of one, and it is invisible in a
  // profile because the time lands inside `offsetWidth`.
  const env = installEnvironment();
  const order = [];
  for (const name of ['a', 'b', 'c']) {
    observeElementMetrics({
      targets: el(name),
      measure: () => { order.push(`measure:${name}`); return name; },
      commit: (v) => { order.push(`commit:${v}`); },
    });
  }
  env.deliverInitial();
  flushElementMetricsForTest();

  assert.deepEqual(order, [
    'measure:a', 'measure:b', 'measure:c',
    'commit:a', 'commit:b', 'commit:c',
  ]);
});

test('many deliveries in one frame collapse to a single measurement', () => {
  // A panel mounting resizes its content on nearly every control, so the observer fires again and
  // again before the frame is drawn. The answer only has to be right once per frame.
  const env = installEnvironment();
  const target = el('viewport');
  let measured = 0;
  observeElementMetrics({ targets: target, measure: () => { measured += 1; return 1; }, commit: () => {} });

  for (let i = 0; i < 50; i += 1) env.resize(target);
  assert.equal(measured, 0, 'nothing should run until the frame');
  assert.equal(env.pendingFrames(), 1, 'fifty deliveries must not book fifty frames');
  flushElementMetricsForTest();
  assert.equal(measured, 1);
});

test('one observer is shared across every caller', () => {
  // 413 controls used to create 413 ResizeObservers. Each carries its own observation list and its
  // own delivery.
  const env = installEnvironment();
  let constructed = 0;
  const Base = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class extends Base { constructor(cb) { super(cb); constructed += 1; } };

  for (let i = 0; i < 10; i += 1) {
    observeElementMetrics({ targets: el(`e${i}`), measure: () => 1, commit: () => {} });
  }
  // The module keeps one observer for the lifetime of the page; it may already exist from an
  // earlier test, so the assertion is that THESE ten added none.
  assert.ok(constructed <= 1, `ten callers constructed ${constructed} observers`);
  assert.equal(env.observed.length, 10);
});

test('teardown stops the job and unobserves its elements', () => {
  const env = installEnvironment();
  const target = el('gone');
  let measured = 0;
  const stop = observeElementMetrics({ targets: target, measure: () => { measured += 1; return 1; }, commit: () => {} });
  assert.equal(env.observed.length, 1);

  stop();
  assert.equal(env.observed.length, 0);
  env.resize(target);
  flushElementMetricsForTest();
  assert.equal(measured, 0);
});

test('an element two jobs share stays observed until both let go', () => {
  // The observer is shared, so unobserving on the first teardown would silently stop delivering to
  // whoever else was watching.
  const env = installEnvironment();
  const shared = el('shared');
  let second = 0;
  const stopA = observeElementMetrics({ targets: shared, measure: () => 1, commit: () => {} });
  observeElementMetrics({ targets: shared, measure: () => { second += 1; return 1; }, commit: () => {} });

  stopA();
  assert.equal(env.observed.length, 1, 'the element is still wanted');
  env.resize(shared);
  flushElementMetricsForTest();
  assert.equal(second, 1);
});

test('a job that throws while measuring does not take the batch with it', () => {
  // One control whose elements went away mid-batch must not stop the other 412 from updating.
  const env = installEnvironment();
  const good = el('good');
  let committed = 0;
  observeElementMetrics({ targets: el('bad'), measure: () => { throw new Error('detached'); }, commit: () => { committed += 100; } });
  observeElementMetrics({ targets: good, measure: () => 1, commit: () => { committed += 1; } });

  env.deliverInitial();
  assert.doesNotThrow(() => flushElementMetricsForTest());
  assert.equal(committed, 1, 'the healthy job committed; the throwing one did not');
});

test('scheduleElementMetrics re-measures for changes an observer cannot see', () => {
  // Scrolling moves an element without resizing it.
  const env = installEnvironment();
  const viewport = el('viewport');
  let measured = 0;
  observeElementMetrics({ targets: viewport, measure: () => { measured += 1; return 1; }, commit: () => {} });
  env.deliverInitial();
  flushElementMetricsForTest();
  assert.equal(measured, 1);

  scheduleElementMetrics(viewport);
  flushElementMetricsForTest();
  assert.equal(measured, 2);
});

test('observing is a no-op without targets or without both halves', () => {
  installEnvironment();
  assert.equal(typeof observeElementMetrics({ targets: [], measure: () => 1, commit: () => {} }), 'function');
  assert.equal(typeof observeElementMetrics({ targets: el('x'), measure: null, commit: () => {} }), 'function');
  assert.doesNotThrow(() => observeElementMetrics({ targets: [null, undefined], measure: () => 1, commit: () => {} })());
});

test('without a ResizeObserver the first measurement still happens', () => {
  // Not every environment has one, and the initial reading is the part callers actually depend on.
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  delete globalThis.ResizeObserver;

  let committed = null;
  observeElementMetrics({ targets: el('lonely'), measure: () => 42, commit: (v) => { committed = v; } });
  flushElementMetricsForTest();
  assert.equal(committed, 42);
});
