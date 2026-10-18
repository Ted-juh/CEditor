// apiContractRuntimes.test.js — four contract entries that every runtime disagreed with.
//
// The contract is what the manual, the help, the API explorer and the editor's completions are built
// from, so an entry that says one thing while every runtime does another is a bug a script author
// follows faithfully. These were:
//
//  · ce.anim `repeat`: "default 1, how many times, 0 or less forever". Every runtime runs 0 as once,
//    n as n MORE times and a negative number until stopped, so repeat = 1 ran twice.
//  · ce.anim `done`: "done(completed)". Every runtime passes ONE table, { path, completed } or
//    { paths, completed }, so `if completed then` was always true and a cancelled move read as done.
//  · ce.panel.distribute `opts.align`: typed text, sampled "top", "the same words as ce.panel.align".
//    The runtime acts on true alone, and every edge name did nothing.
//  · ce.panel.circle `opts.startAngle`: "clockwise from twelve o'clock" where the member's own
//    summary, and the maths, put 0 at three o'clock.
//
// Each test pins the entry AND the runtime behaviour it describes, so the two cannot drift apart
// again without one of them failing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scriptApiForTesting, setRuntimeHost, tickAnimations, stopAllAnimations,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const api = scriptApiForTesting('', 'contract-probe');
const field = (memberId, name) => MEMBER_BY_ID[memberId].params
  .find((p) => p.fields)?.fields.find((f) => f.name === name);

function withClock(fn) {
  stopAllAnimations();
  tickAnimations(0);
  try { return fn(); } finally { stopAllAnimations(); }
}

test('repeat: 0 runs once, n runs n more times, a negative number until stopped', () => {
  for (const id of ['animateTo', 'animateSpring', 'animateEnvelope']) {
    assert.equal(field(id, 'repeat').default, '0', `${id}: the default is a single run`);
    assert.match(field(id, 'repeat').summary, /How many more times to run it after the first/);
  }
  withClock(() => {
    api.animateTo('once', 100, { duration: 100, from: 0 });
    api.animateTo('twice', 100, { duration: 100, from: 0, repeat: 1 });
    api.animateTo('ever', 100, { duration: 100, from: 0, repeat: -1 });
    tickAnimations(100);
    assert.equal(api.animateRunning('once'), false, 'repeat left out: one run, then done');
    assert.equal(api.animateRunning('twice'), true, 'repeat = 1: one MORE run');
    tickAnimations(200);
    assert.equal(api.animateRunning('twice'), false, '…and then done');
    tickAnimations(5000);
    assert.equal(api.animateRunning('ever'), true, 'a negative number runs until it is stopped');
  });
});

test('done is called with one table, whose completed says whether the move got there', () => {
  for (const id of ['animateTo', 'animateSpring', 'animateEnvelope']) {
    assert.match(field(id, 'done').summary, /with one table: `path` and `completed`/);
    assert.doesNotMatch(field(id, 'done').summary, /done\(completed\)/);
  }
  withClock(() => {
    const seen = [];
    api.animateTo('a', 100, { duration: 100, from: 0, done: (info) => seen.push(info) });
    api.animateTo('b', 100, { duration: 100, from: 0, done: (info) => seen.push(info) });
    api.animateTo(['c', 'd'], 100, { duration: 100, from: 0, done: (info) => seen.push(info) });
    api.animateStop('b');
    tickAnimations(100);
    assert.deepEqual(seen.map((x) => JSON.parse(JSON.stringify(x))), [
      { path: 'b', completed: false },
      { path: 'a', completed: true },
      { paths: ['c', 'd'], completed: true },
    ]);
  });
});

/** A panel of buttons, and the api for a script on it. */
function withButtons(specs, fn) {
  const controls = specs.map(([name, x, y, width, height]) =>
    createControl('Button', { name, Transform: { x, y, width, height } }));
  setRuntimeHost({ panel: { id: 'p', name: 'P', controls, scripting: { modules: ['ce.panel'] } } });
  try { return fn(scriptApiForTesting('', 'contract-panel')); } finally { setRuntimeHost(null); }
}

test('distribute\'s align is true or false, and true levels the row on the leftmost control', () => {
  const align = field('panelDistribute', 'align');
  assert.equal(align.type, 'true or false');
  assert.equal(align.default, 'false');
  assert.equal(align.sample, undefined, 'no edge name as the example');
  const row = [['a', 0, 10, 20, 20], ['b', 50, 40, 20, 20], ['c', 100, 70, 20, 20]];
  withButtons(row, (panel) => {
    panel.panelDistribute(['a', 'b', 'c'], 'hSpacing', { align: 'top' });
    assert.deepEqual(['a', 'b', 'c'].map((n) => panel.panelRect(n).y), [10, 40, 70], '"top" does nothing');
    panel.panelDistribute(['a', 'b', 'c'], 'hSpacing', { align: true });
    assert.deepEqual(['a', 'b', 'c'].map((n) => panel.panelRect(n).y), [10, 10, 10], 'true: the leftmost control\'s top');
  });
});

test('circle\'s startAngle 0 is three o\'clock, as the member says', () => {
  assert.match(field('panelCircle', 'startAngle').summary, /clockwise from three o'clock/);
  withButtons([['a', 0, 0, 20, 20], ['b', 200, 0, 20, 20], ['c', 100, 200, 20, 20], ['d', 100, -200, 20, 20]], (panel) => {
    panel.panelCircle(['a', 'b', 'c', 'd'], { radius: 100, startAngle: 0 });
    const r = ['a', 'b', 'c', 'd'].map((n) => panel.panelRect(n));
    const cx = (r[0].x + r[2].x) / 2;
    assert.ok(r[0].x > r[2].x && r[0].x > cx, 'the first control is right of centre, at three o\'clock');
    assert.ok(r[1].y > r[0].y, 'and the second follows clockwise, below it');
  });
});
