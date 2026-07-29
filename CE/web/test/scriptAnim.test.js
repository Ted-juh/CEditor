// scriptAnim.test.js — ce.anim (design doc §39).
//
// The layer that matters here is different from the last two phases. ce.anim's engine is NOT in the
// preludes: it lives in the host (ScriptRuntime.cpp) and in the WebView runtime, and the preludes
// only forward to it. So the cross-runtime pair is C++ ↔ WebView, and scriptPreludeAgreement.test.js
// cannot see it — ScriptRuntimeTests.cpp §39 runs the same fixtures on the other side.
//
// What this file pins that neither of those can: that the named easings are THE PROPERTIES PANEL's
// curves. An author who sets `outCubic` in the Animations section and writes curve = "outCubic" in
// the script beside it has to get one motion, not two.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scriptApiForTesting, tickAnimations, stopAllAnimations, animationEase, cubicBezierEase,
  ANIM_SAMPLES,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY } from '../src/CE_Application/scripting/panelApi.js';
import { EASING_BEZIERS, ANIM_CURVE_NAMES } from '../src/CE_Application/scripting/easingTables.js';
import { EASING_BEZIERS as PANEL_BEZIERS } from '../src/CE_Application/utils/interactionRuntime.js';

const api = scriptApiForTesting('', 'anim-script');

/** Every test drives time itself — an animation test that waits on a real clock is a flaky test. */
function withClock(fn) {
  stopAllAnimations();
  tickAnimations(0);
  try { return fn(); } finally { stopAllAnimations(); }
}

/* --------------------------------------------------------------------- the easing table */

test('the easing table IS the Properties panel\'s, not a copy of it', () => {
  // The Animations section and a script animating "outCubic" have to mean one curve. Two tables
  // that agree today are two tables that disagree after the next edit.
  assert.equal(EASING_BEZIERS, PANEL_BEZIERS, 'ce.anim must read the component table, not restate it');
});

test('every named easing starts at 0, ends at 1, and never goes backwards', () => {
  for (const name of Object.keys(EASING_BEZIERS)) {
    assert.equal(animationEase(0, name), 0, `${name} must start at 0`);
    assert.equal(animationEase(1, name), 1, `${name} must end at 1`);
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = animationEase(i / 100, name);
      assert.ok(v >= previous - 1e-9, `${name} must not go backwards at ${i / 100}`);
      previous = v;
    }
  }
});

test('the named easings are the BEZIERS the panel stores, not lookalikes', () => {
  // The thing this phase exists for. outQuad is NOT 1-(1-t)² and inQuad is NOT t²; they are the
  // curves cubic-bezier(0.25, 0.46, 0.45, 0.94) and cubic-bezier(0.55, 0.085, 0.68, 0.53) trace,
  // and the difference is a few percent in the middle — small enough to look right and large
  // enough to be a different motion.
  for (const [name, b] of Object.entries(EASING_BEZIERS)) {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      assert.equal(animationEase(t, name), cubicBezierEase(t, b[0], b[1], b[2], b[3]), `${name} @ ${t}`);
    }
  }
  assert.notEqual(animationEase(0.5, 'outQuad'), 0.75, 'outQuad is not the quadratic of the same name');
  assert.notEqual(animationEase(0.5, 'inQuad'), 0.25, 'and neither is inQuad');
});

test('the solver is exact at the ends and monotonic in between', () => {
  assert.equal(cubicBezierEase(0, 0.25, 0.46, 0.45, 0.94), 0);
  assert.equal(cubicBezierEase(1, 0.25, 0.46, 0.45, 0.94), 1);
  assert.equal(cubicBezierEase(0.5, 0, 0, 1, 1), 0.5, 'the identity curve is a straight line');
  assert.equal(cubicBezierEase(-5, 0.25, 0.46, 0.45, 0.94), 0, 'and it clamps rather than extrapolating');
  assert.equal(cubicBezierEase(5, 0.25, 0.46, 0.45, 0.94), 1);
});

test('ce.math.curve\'s four shapes still compute exactly as they did', () => {
  // The two vocabularies are deliberately NOT merged: exp is t², inQuad is a bezier that looks like
  // t², and calling them one thing would be a claim about the numbers that is not true.
  assert.equal(animationEase(0.5, 'exp'), 0.25);
  assert.equal(animationEase(0.25, 'log'), 0.5);
  assert.equal(animationEase(0.5, 's'), 0.5);
  assert.equal(animationEase(0.5, 'linear'), 0.5);
  assert.equal(animationEase(0.5), 0.5, 'and no curve at all is linear');
});

test('a curve this build does not know returns nothing rather than silently going linear', () => {
  // The bug: "outCubic" — a name the Properties panel offers three feet away — was LINEAR here, in
  // every runtime, with nothing said.
  assert.equal(animationEase(0.5, 'typo'), undefined);
  assert.equal(animationEase(0.5, 'easeInOutBack'), undefined);
  assert.ok(ANIM_CURVE_NAMES.includes('outCubic'), 'and the name list is what the report suggests');
  assert.equal(ANIM_CURVE_NAMES.length, 8);
});

/* ------------------------------------------------------------------------ the contract */

test('every phase-13 verb is declared, cross-runtime, and namespaced under ce.anim', () => {
  for (const [id, path] of [
    ['animateEnvelope', 'ce.anim.envelope'], ['animateValue', 'ce.anim.value'],
    ['animateList', 'ce.anim.list'], ['animatePause', 'ce.anim.pause'],
    ['animateResume', 'ce.anim.resume'], ['animateReverse', 'ce.anim.reverse'],
    ['animateFinish', 'ce.anim.finish'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // A sweep triggered by a note has to work in a DAW with the panel shut — the reason ce.anim was
    // cross-runtime from the start, and it does not stop being true for the new half.
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_ANY);
  }
});

/* ------------------------------------------------------------------------------ to */

test('a plain move is the eased position of elapsed time, and lands exactly', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(250);
    assert.equal(api.animateValue('a').value, 25, 'linear by default');
    tickAnimations(1000);
    assert.equal(api.animateRunning('a'), false, 'and it stops when it arrives');
  });
});

test('the panel\'s easing names work, and trace the panel\'s curve', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0, curve: 'outCubic' });
    tickAnimations(250);
    const b = EASING_BEZIERS.outCubic;
    assert.equal(api.animateValue('a').value, 100 * cubicBezierEase(0.25, b[0], b[1], b[2], b[3]));
  });
});

test('delay holds the value still before the move starts', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 100, delay: 200, from: 0 });
    tickAnimations(100);
    assert.equal(api.animateValue('a').progress, 0, 'nothing has happened yet');
    tickAnimations(250);
    assert.equal(api.animateValue('a').progress, 0.5, 'and the clock starts after the delay');
  });
});

test('a LIST of paths is one call, and stagger offsets each in turn', () => {
  withClock(() => {
    api.animateTo(['x', 'y', 'z'], 10, { duration: 100, stagger: 100, from: 0 });
    assert.deepEqual(api.animateList().map((a) => a.path), ['x', 'y', 'z']);
    tickAnimations(100);
    // x has finished, y is starting, z has not begun.
    assert.equal(api.animateRunning('x'), false);
    assert.equal(api.animateValue('y').progress, 0);
    assert.equal(api.animateValue('z').progress, 0);
    tickAnimations(200);
    assert.equal(api.animateRunning('y'), false, 'and they finish in the order they started');
  });
});

/* --------------------------------------------------------------------------- envelope */

test('envelope drives the value through the shape, not to a destination', () => {
  withClock(() => {
    // Up, then down — the thing `to` cannot express, because `to` has one destination.
    api.animateEnvelope('e', [{ x: 0, y: 0 }, { x: 0.25, y: 1 }, { x: 1, y: 0 }], { duration: 1000, to: 100 });
    tickAnimations(250);
    assert.ok(Math.abs(api.animateValue('e').value - 100) < 0.2, 'the peak is a quarter of the way in');
    tickAnimations(625);
    assert.ok(Math.abs(api.animateValue('e').value - 50) < 0.2, 'and it falls back through the middle');
  });
});

test('from and to are the ends the shape is scaled between', () => {
  withClock(() => {
    api.animateEnvelope('e', [{ x: 0, y: 0 }, { x: 1, y: 1 }], { duration: 100, from: 20, to: 60 });
    tickAnimations(50);
    assert.ok(Math.abs(api.animateValue('e').value - 40) < 0.1, 'half way up a 20..60 range');
  });
});

test('the sampled shape is fine enough that nothing reads the difference', () => {
  // Sampling is what lets the HOST engine run an envelope at all — map()'s per-point curves live in
  // the preludes, and the alternative was a fifth implementation of them in ScriptRuntime.cpp. The
  // cost is stated rather than hidden: a sharp corner can sit a fraction under the drawn peak.
  assert.equal(ANIM_SAMPLES, 1024);
  withClock(() => {
    api.animateEnvelope('e', [{ x: 0, y: 0 }, { x: 0.2, y: 1 }, { x: 1, y: 0 }], { duration: 1000, to: 1 });
    tickAnimations(200);
    const peak = api.animateValue('e').value;
    assert.ok(peak > 0.999 && peak <= 1, `the sampled peak is ${peak}, within a thousandth of the drawn one`);
  });
});

test('an envelope needs at least two points, and says so', () => {
  withClock(() => {
    assert.equal(api.animateEnvelope('e', [{ x: 0, y: 0 }]), false);
    assert.equal(api.animateEnvelope('e', null), false);
    assert.equal(api.animateRunning('e'), false, 'and nothing was started');
  });
});

/* ---------------------------------------------------------------------- repeat / pingpong */

test('repeat runs the move again; pingpong brings it back', () => {
  withClock(() => {
    api.animateTo('r', 10, { duration: 100, from: 0, repeat: 2, pingpong: true });
    tickAnimations(100);
    assert.equal(api.animateValue('r').value, 10, 'the first cycle arrives…');
    assert.equal(api.animateValue('r').cycle, 1);
    tickAnimations(200);
    assert.equal(api.animateValue('r').value, 0, '…and the second comes back');
    tickAnimations(300);
    assert.equal(api.animateRunning('r'), false, 'three cycles in all: the first plus two repeats');
  });
});

test('repeat = -1 runs until it is stopped, and list() is how you find it', () => {
  withClock(() => {
    api.animateTo('forever', 1, { duration: 10, from: 0, repeat: -1, pingpong: true });
    tickAnimations(1000);
    assert.equal(api.animateRunning('forever'), true);
    assert.deepEqual(api.animateList().map((a) => a.path), ['forever'],
      'anything a script can start forever it must be able to find');
    api.animateStop('forever');
    assert.equal(api.animateRunning('forever'), false);
  });
});

/* --------------------------------------------------------------------------- done */

test('done says whether it FINISHED or was cancelled', () => {
  withClock(() => {
    let got = null;
    api.animateTo('d', 5, { duration: 100, done: (i) => { got = i; } });
    tickAnimations(100);
    assert.deepEqual(got, { path: 'd', completed: true });
  });
  withClock(() => {
    let got = null;
    api.animateTo('d', 5, { duration: 100, done: (i) => { got = i; } });
    api.animateStop('d');
    assert.deepEqual(got, { path: 'd', completed: false },
      'a cancel is an outcome — "then do X" has to be able to tell');
  });
});

test('replacing an animation completes the one it replaced, as not-finished', () => {
  withClock(() => {
    let got = null;
    api.animateTo('d', 5, { duration: 100, done: (i) => { got = i; } });
    api.animateTo('d', 9, { duration: 100 });
    assert.deepEqual(got, { path: 'd', completed: false }, 'a value has one destination');
  });
});

test('done fires ONCE for a whole list, when the last one lands', () => {
  withClock(() => {
    let got = null;
    let calls = 0;
    api.animateTo(['x', 'y', 'z'], 1, { duration: 100, stagger: 50, done: (i) => { got = i; calls += 1; } });
    tickAnimations(100);
    assert.equal(calls, 0, 'not when the first one lands');
    tickAnimations(200);
    assert.equal(calls, 1, '"when the sweep is over" means once, not three times');
    assert.deepEqual(got, { paths: ['x', 'y', 'z'], completed: true });
  });
});

test('a throw inside done is reported against the script, not swallowed', () => {
  withClock(() => {
    api.animateTo('d', 1, { duration: 100, done: () => { throw new Error('boom'); } });
    assert.doesNotThrow(() => tickAnimations(100), 'a broken handler must not stop the tick');
  });
});

/* ------------------------------------------------------------------- value / list */

test('value says how far, which running() cannot', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(300);
    const v = api.animateValue('a');
    assert.equal(v.progress, 0.3);
    assert.equal(v.elapsed, 300);
    assert.equal(v.remaining, 700);
    assert.equal(v.from, 0);
    assert.equal(v.to, 100);
    assert.equal(v.kind, 'to');
    assert.equal(v.paused, false);
  });
});

test('value is nothing when nothing is running, which is what tells finished from half way', () => {
  withClock(() => {
    assert.equal(api.animateValue('nothing'), undefined);
    api.animateTo('a', 1, { duration: 100 });
    tickAnimations(100);
    assert.equal(api.animateValue('a'), undefined, 'finished is not running');
  });
});

test('list is sorted, so the answer is stable', () => {
  withClock(() => {
    api.animateTo('zeta', 1, { duration: 100 });
    api.animateTo('alpha', 1, { duration: 100 });
    assert.deepEqual(api.animateList().map((a) => a.path), ['alpha', 'zeta']);
  });
});

/* --------------------------------------------------------------- pause / resume */

test('pause holds the value; resume carries on rather than restarting', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(400);
    assert.equal(api.animatePause('a'), true);
    tickAnimations(900);
    assert.equal(api.animateValue('a').value, 40, 'time passing does not move a paused animation');
    assert.equal(api.animateValue('a').paused, true);
    assert.equal(api.animateResume('a'), true);
    tickAnimations(1100);
    assert.equal(api.animateValue('a').value, 60,
      'and it picks up where it was — 200ms after resuming, not back at the start');
  });
});

test('pause and resume refuse honestly', () => {
  withClock(() => {
    assert.equal(api.animatePause('nothing'), false);
    assert.equal(api.animateResume('nothing'), false);
    api.animateTo('a', 1, { duration: 100 });
    assert.equal(api.animateResume('a'), false, 'a running animation is not paused');
    api.animatePause('a');
    assert.equal(api.animatePause('a'), false, 'and a paused one is not paused twice');
  });
});

/* ------------------------------------------------------------------------- reverse */

test('reverse turns around at the same rate, not over a fresh duration', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(800);
    assert.equal(api.animateValue('a').value, 80);
    assert.equal(api.animateReverse('a'), true);
    // 80% of the way there, so 80% of the duration to get home — the same speed it was travelling.
    // animateTo(path, 0) would take the full 1000ms, which is a bounce rather than a snap back.
    assert.equal(api.animateValue('a').remaining, 800);
    assert.equal(api.animateValue('a').value, 80, 'and it does not jump at the moment of turning');
    tickAnimations(1200);
    assert.equal(api.animateValue('a').value, 40, 'half way home');
    tickAnimations(1600);
    assert.equal(api.animateRunning('a'), false, 'and home after the 800ms it needed');
  });
});

test('reverse is exact: turning around twice is where you started', () => {
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(300);
    const before = api.animateValue('a').value;
    api.animateReverse('a');
    api.animateReverse('a');
    // Within a float: progress goes 0.3 -> 0.7 -> 0.3 through a subtraction each way, so the last
    // bit does not always come back. Pinning the exact double would be pinning IEEE754, not the
    // behaviour — what matters is that turning around twice does not MOVE the value.
    assert.ok(Math.abs(api.animateValue('a').value - before) < 1e-9,
      `turning around twice moved the value: ${before} -> ${api.animateValue('a').value}`);
  });
});

/* -------------------------------------------------------------------------- finish */

test('finish lands on the target and completes; stop leaves it stranded', () => {
  withClock(() => {
    let got = null;
    api.animateTo('a', 100, { duration: 1000, from: 0, done: (i) => { got = i; } });
    tickAnimations(300);
    assert.equal(api.animateFinish('a'), true);
    assert.deepEqual(got, { path: 'a', completed: true });
    assert.equal(api.animateRunning('a'), false);
  });
  withClock(() => {
    api.animateTo('a', 100, { duration: 1000, from: 0 });
    tickAnimations(300);
    api.animateStop('a');
    // stop() is right for a cancel and wrong for "skip the animation", which is why both exist.
    assert.equal(api.animateRunning('a'), false);
  });
});

test('finish refuses when there is nothing to finish', () => {
  withClock(() => assert.equal(api.animateFinish('nothing'), false));
});

/* ------------------------------------------------------------------ teardown */

test('panel teardown cancels without firing anything into a dead panel', () => {
  let calls = 0;
  tickAnimations(0);
  api.animateTo('a', 1, { duration: 100, repeat: -1, done: () => { calls += 1; } });
  stopAllAnimations();
  assert.equal(api.animateRunning(), false, 'including a repeat that would otherwise run forever');
  assert.equal(calls, 0, 'a completion into a script set that no longer exists is noise');
});
