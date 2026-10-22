// apiContractRuntimes.test.js — four contract entries that every runtime disagreed with.
//
// The contract is what the manual, the help, the API explorer and the editor's completions are built
// from, so an entry that says one thing while every runtime does another is a bug a script author
// follows faithfully. For two of them the runtimes changed, by the owner's decision; for the other
// two the contract did:
//
//  · ce.anim `repeat`: the contract said "default 1, how many times, 0 or less forever". Every
//    runtime ran 0 as once and n as n MORE times, so repeat = 1 ran twice. The runtimes now count
//    the runs in all, as it said.
//  · ce.anim `done`: the contract said done(completed). Every runtime passed ONE table,
//    { path, completed } or { paths, completed }, so `if completed then` was always true and a
//    cancelled move read as done. The runtimes now pass the boolean alone.
//  · ce.panel.distribute `opts.align`: typed text, sampled "top", "the same words as ce.panel.align".
//    The runtime acts on true alone, and every edge name did nothing. The contract says so now.
//  · ce.panel.circle `opts.startAngle`: "clockwise from twelve o'clock" where the member's own
//    summary, and the maths, put 0 at three o'clock. The contract says so now.
//
// Each test pins the entry AND the runtime behaviour it describes, so the two cannot drift apart
// again without one of them failing. ScriptRuntimeTests.cpp (§39b), PlayerScriptIntegrationTests.cpp
// and PythonScriptEngineTests.cpp count the same runs and read the same done() in the C++ engine
// and through the Lua, JavaScript and Python preludes.

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
const ANIMATING = ['animateTo', 'animateSpring', 'animateEnvelope'];

function withClock(fn) {
  stopAllAnimations();
  tickAnimations(0);
  try { return fn(); } finally { stopAllAnimations(); }
}

/** How many 100 ms runs a move makes before it ends: Infinity when it is still going after
 *  `limit`. Each tick lands exactly on the end of a run, and a run ends one cycle per tick. */
function runsOf(opts, limit = 12) {
  return withClock(() => {
    api.animateTo('count', 100, { duration: 100, from: 0, ...opts });
    for (let i = 1; i <= limit; i += 1) {
      tickAnimations(i * 100);
      if (!api.animateRunning('count')) return i;
    }
    api.animateStop('count');
    assert.equal(api.animateRunning('count'), false, 'a move that runs until stopped can be stopped');
    return Infinity;
  });
}

test('repeat is the number of runs in all: 1 once, 3 three times, 0 or less until stopped', () => {
  for (const id of ANIMATING) {
    assert.equal(field(id, 'repeat').default, '1', `${id}: the default is a single run`);
    // One rule per line (docs/design/api-descriptions-handoff.md): the count, and what 0 or less means.
    assert.match(field(id, 'repeat').summary, /^Number of runs\.\n/);
    assert.match(field(id, 'repeat').summary, /\n≤ 0: repeats until stopped\.\n/);
  }
  assert.equal(runsOf({}), 1, 'left out: once');
  assert.equal(runsOf({ repeat: 1 }), 1, 'repeat = 1: once, not twice');
  assert.equal(runsOf({ repeat: 2 }), 2);
  assert.equal(runsOf({ repeat: 3 }), 3, 'repeat = 3: three times, not four');
  assert.equal(runsOf({ repeat: 0 }), Infinity, 'repeat = 0: until stopped, not once');
  assert.equal(runsOf({ repeat: -1 }), Infinity, 'a negative number: until stopped');
  assert.equal(runsOf({ repeat: -5 }), Infinity);
});

test('repeat rounds a fraction, reads text that is a number, and runs anything else once', () => {
  assert.equal(runsOf({ repeat: 2.6 }), 3);
  assert.equal(runsOf({ repeat: 2.5 }), 3, 'a half rounds up, as llround does in the C++ engine');
  assert.equal(runsOf({ repeat: 0.4 }), Infinity, 'rounds to 0, which is until stopped');
  assert.equal(runsOf({ repeat: '3' }), 3, 'text that is a number is read as one');
  // Not numbers: each runs once, as all but true did before. Number() would read null, false and ""
  // as 0, which is now until stopped.
  for (const notANumber of ['three', '', null, undefined, false, true, NaN, Infinity, {}, [3]]) {
    assert.equal(runsOf({ repeat: notANumber }), 1, `repeat = ${JSON.stringify(notANumber) ?? String(notANumber)}`);
  }
});

test('pingpong and stagger count their runs the same way', () => {
  withClock(() => {
    api.animateTo('pp', 10, { duration: 100, from: 0, repeat: 2, pingpong: true });
    tickAnimations(100);
    assert.equal(api.animateValue('pp').value, 10, 'the first run arrives');
    tickAnimations(200);
    assert.equal(api.animateRunning('pp'), false, 'repeat = 2 is there and back, and no more');
  });
  withClock(() => {
    api.animateTo('pp3', 10, { duration: 100, from: 0, repeat: 3, pingpong: true });
    tickAnimations(100);
    tickAnimations(200);
    assert.equal(api.animateValue('pp3').cycle, 2, 'repeat = 3: two runs done, there and back…');
    tickAnimations(250);
    assert.equal(api.animateValue('pp3').value, 5, '…and the third goes out again');
    tickAnimations(300);
    assert.equal(api.animateRunning('pp3'), false, '…and is the last');
  });
  withClock(() => {
    const seen = [];
    api.animateTo(['x', 'y'], 1, { duration: 100, from: 0, stagger: 50, repeat: 2, done: (...args) => seen.push(args) });
    tickAnimations(100);
    tickAnimations(150);
    tickAnimations(200);
    assert.equal(api.animateRunning('x'), false, 'x: two runs, from 0 to 200');
    assert.equal(api.animateRunning('y'), true, 'y starts 50 later, so it is still on its second');
    assert.deepEqual(seen, [], 'and done waits for the last of them');
    tickAnimations(250);
    assert.equal(api.animateRunning('y'), false, 'y: two runs, from 50 to 250');
    assert.deepEqual(seen, [[true]], 'then done(true), once');
  });
});

test('done is called with one argument, completed, exactly true or false', () => {
  for (const id of ANIMATING) {
    assert.match(field(id, 'done').summary, /^Callback at the end: done\(completed\)\.\n/);
    assert.doesNotMatch(field(id, 'done').summary, /table|info\.completed/);
  }
  withClock(() => {
    const seen = [];
    const record = (name) => (...args) => seen.push([name, ...args]);
    api.animateTo('a', 100, { duration: 100, from: 0, done: record('a') });
    api.animateTo('b', 100, { duration: 100, from: 0, done: record('b') });
    api.animateTo('c', 100, { duration: 100, from: 0, done: record('c') });
    api.animateTo('d', 100, { duration: 100, from: 0, done: record('d') });
    api.animateTo(['e', 'f'], 100, { duration: 100, from: 0, done: record('e,f') });
    api.animateTo(['g', 'h'], 100, { duration: 100, from: 0, done: record('g,h') });
    api.animateStop('b');                                // stopped
    api.animateTo('c', 50, { duration: 100 });           // replaced
    api.animateFinish('d');                              // ended on purpose
    api.animateStop('g');                                // one of a list stopped: false, but not yet
    assert.deepEqual(seen, [['b', false], ['c', false], ['d', true]]);
    tickAnimations(100);
    assert.deepEqual(seen, [
      ['b', false], ['c', false], ['d', true],
      ['a', true],                                       // arrived
      ['e,f', true],                                     // a list, every one arrived: once
      ['g,h', false],                                    // a list, one stopped: once, after the last
    ]);
    for (const [, completed] of seen) assert.equal(typeof completed, 'boolean');
  });
});

test('done(completed) reaches a Lua function in the WebView as a Lua boolean', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  const lines = [];
  try {
    lua.global.set('animateTo', api.animateTo);
    lua.global.set('animateStop', api.animateStop);
    lua.global.set('log', (line) => lines.push(line));
    withClock(() => {
      lua.doStringSync(`
        animateTo("la", 1, { duration = 100, from = 0, done = function(c, extra)
          log("la " .. type(c) .. " " .. tostring(c) .. " " .. tostring(extra)) end })
        animateTo("lb", 1, { duration = 100, from = 0, done = function(c)
          log("lb " .. type(c) .. " " .. tostring(c)) end })
        animateTo({ "lc", "ld" }, 1, { duration = 100, from = 0, ["repeat"] = 2, done = function(c)
          log("lc,ld " .. type(c) .. " " .. tostring(c)) end })
        animateStop("lb")`);
      tickAnimations(100);
      tickAnimations(200);
    });
    assert.deepEqual(lines, ['lb boolean false', 'la boolean true nil', 'lc,ld boolean true']);
  } finally {
    lua.global.close();
  }
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
