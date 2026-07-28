// scriptFinishers.test.js — the last six candidates off the review list (design doc §24).
//
//   ce.math.random / .seed          a seeded PRNG, identical in every runtime
//   ce.midi.sendRPN / .sendSongPosition
//   ce.core.warn / .error           the levels the console already renders
//   ce.panel.each                   iterate every control
//   ce.storage.settings / .forget   list and delete
//   ce.draw.arc                     the shape path() could not express
//
// CE/tests/ScriptRuntimeTests.cpp §30 and §31 pin the same behaviour window-closed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setRuntimeHost, drawCommandsFor } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY } from '../src/CE_Application/scripting/panelApi.js';

const ALL = ['ce.math', 'ce.midi', 'ce.core', 'ce.panel', 'ce.storage', 'ce.draw'];
const panelWith = (controls = []) => ({
  id: 'p', name: 'Last', width: 400, height: 300, controls, scripting: { modules: ALL },
});

function withApi(panel, fn) {
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'last-script')); } finally { setRuntimeHost(null); }
}

const traced = () => get(scriptTrace);
const messages = () => traced().map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------------ ce.math.random */

test('the same seed replays the same sequence', () => {
  // Seeded is the whole point: the language's own Math.random cannot promise this across five
  // runtimes, so a "random" patch could not be reproduced.
  withApi(panelWith(), (api) => {
    api.randomSeed(12345);
    const a = [api.random(1, 6), api.random(1, 6), api.random(1, 6), api.random(1, 6)];
    api.randomSeed(12345);
    const b = [api.random(1, 6), api.random(1, 6), api.random(1, 6), api.random(1, 6)];
    assert.deepEqual(a, b);
    assert.ok(a.some((x, i) => i && x !== a[0]), 'and it is not a constant');
  });
});

test('no arguments give a float in [0, 1); two give a whole number in [lo, hi] inclusive', () => {
  withApi(panelWith(), (api) => {
    api.randomSeed(7);
    for (let i = 0; i < 200; i += 1) {
      const f = api.random();
      assert.ok(f >= 0 && f < 1, `float out of range: ${f}`);
    }
    api.randomSeed(7);
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) {
      const n = api.random(1, 6);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 6, `int out of range: ${n}`);
      seen.add(n);
    }
    // Both ends must actually be reachable — an off-by-one in the inclusive range would show as a
    // 6 that never appears, which no single sample would catch.
    assert.ok(seen.has(1) && seen.has(6), 'both ends of the range are reachable');
  });
});

test('seeding with 0 falls back to the default rather than to a dead generator', () => {
  // 0 is a fixed point for xorshift: seeded with it, it returns zero forever.
  withApi(panelWith(), (api) => {
    api.randomSeed(0);
    assert.ok(api.random() > 0);
    assert.ok(api.random() > 0);
  });
});

test('lo and hi may be given the wrong way round', () => {
  withApi(panelWith(), (api) => {
    api.randomSeed(3);
    for (let i = 0; i < 50; i += 1) {
      const n = api.random(6, 1);
      assert.ok(n >= 1 && n <= 6);
    }
  });
});

/* ---------------------------------------------------------------------------- ce.midi */

test('sendRPN uses CC 101/100, where sendNRPN uses 99/98', () => {
  // The difference between the two is exactly those two CC numbers, and getting it wrong sends a
  // perfectly valid message to the wrong parameter — silent, and audible only later.
  withApi(panelWith(), (api) => {
    api.sendRPN(1, 0, 0, 2);          // pitch-bend range, 2 semitones
    const midi = traced().filter((t) => t.kind === 'midi').map((t) => t.message).join('\n');
    assert.match(midi, /B0 65 00/, 'CC 101 = 0x65 carries the msb');
    assert.match(midi, /B0 64 00/, 'CC 100 = 0x64 carries the lsb');
    assert.match(midi, /B0 06 00 B0 26 02/, 'and the value splits into data entry msb/lsb');
  });
});

test('sendSongPosition puts the LSB first — the one place in MIDI that it goes there', () => {
  withApi(panelWith(), (api) => {
    api.sendSongPosition(16);
    const midi = traced().filter((t) => t.kind === 'midi').map((t) => t.message).join('\n');
    assert.match(midi, /F2 10 00/, '16 beats = lsb 0x10, msb 0x00');
  });
});

/* ------------------------------------------------------------------ ce.core.warn / error */

test('warn and error reach the console at their own levels', () => {
  withApi(panelWith(), (api) => {
    api.log('plain');
    api.logWarn('careful');
    api.logError('nope');
    const kinds = traced().map((t) => t.kind);
    assert.ok(kinds.includes('log') && kinds.includes('warn') && kinds.includes('error'));
  });
});

test('error PRINTS — it does not throw', () => {
  // A verb called error() that stopped the handler would be a very different thing, and the flat
  // name is logError precisely so nobody expects Lua's builtin behaviour.
  withApi(panelWith(), (api) => {
    api.logError('nope');
    api.log('after');
    assert.match(messages(), /after/);
  });
});

test('the flat names are defensive: error() as a global would shadow Lua\'s builtin', () => {
  // The namespaced spellings read well; the flat ones must never collide with a language builtin.
  assert.equal(memberPath('logWarn'), 'ce.core.warn');
  assert.equal(memberPath('logError'), 'ce.core.error');
  assert.ok(MEMBER_BY_ID.logError, 'the member id is logError, not error');
  assert.equal(MEMBER_BY_ID.error, undefined, 'nothing is declared under the bare name `error`');
});

/* -------------------------------------------------------------------------- ce.panel.each */

test('each visits every control, containers included, and counts them', () => {
  const a = createControl('Knob', 10, 10); a._children.Core.name = 'A';
  const inner = createControl('Knob', 0, 0); inner._children.Core.name = 'B';
  const group = createControl('Container', 0, 0); group._children.Core.name = 'Grp';
  group._children.Children = { _children: { [inner._children.Core.id]: inner } };

  withApi(panelWith([a, group]), (api) => {
    const seen = [];
    assert.equal(api.panelEach((name) => seen.push(name)), 3);
    assert.deepEqual(seen, ['A', 'Grp', 'B'], 'document order, depth first');
  });
});

test('each without a function walks nothing and says so', () => {
  withApi(panelWith(), (api) => {
    assert.equal(api.panelEach(null), 0);
    assert.match(messages(), /needs a function/);
  });
});

test('a callback that throws is reported and stops the walk', () => {
  const a = createControl('Knob', 10, 10); a._children.Core.name = 'A';
  const b = createControl('Knob', 20, 10); b._children.Core.name = 'B';
  withApi(panelWith([a, b]), (api) => {
    let calls = 0;
    api.panelEach(() => { calls += 1; throw new Error('walk blew up'); });
    assert.equal(calls, 1, 'it does not keep calling a callback that is failing');
    assert.match(messages(), /walk blew up/);
  });
});

/* ------------------------------------------------------------------------- ce.storage */

test('settings lists what was saved, and forget deletes it', () => {
  withApi(panelWith(), (api) => {
    api.saveSetting('a', 1);
    api.saveSetting('b', 2);
    assert.deepEqual(api.listSettings().sort(), ['a', 'b']);
    assert.equal(api.forgetSetting('a'), true, 'there was one to delete');
    // "Cleaned up" has to read differently from "there was nothing there".
    assert.equal(api.forgetSetting('a'), false, 'and the second time there is not');
    assert.deepEqual(api.listSettings(), ['b']);
    assert.equal(api.loadSetting('a', 'none'), 'none');
  });
});

test('a panel that has saved nothing lists nothing, rather than failing', () => {
  withApi(panelWith(), (api) => {
    assert.deepEqual(api.listSettings(), []);
    assert.equal(api.forgetSetting('never'), false);
  });
});

/* --------------------------------------------------------------------------- ce.draw.arc */

test('arc records a command with the angles it was given', () => {
  const bg = createControl('Background', 0, 0); bg._children.Core.name = 'Face';
  // Built with an OWNER: a draw verb paints on the control its script is attached to, so an api
  // with no owner has nothing to target — which is what the first run of this test found.
  setRuntimeHost({ panel: panelWith([bg]), scripts: [] });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('Face', 'last-script');
    api.drawClear('Face');
    api.drawStroke('#5B9BD5', 2);
    api.drawArc(30, 30, 24, 135, 405);
    const cmds = drawCommandsFor('Face');
    const arc = cmds.find((c) => c.op === 'arc');
    assert.ok(arc, 'an arc command was recorded');
    assert.deepEqual(
      { cx: arc.cx, cy: arc.cy, r: arc.r, from: arc.from, to: arc.to },
      { cx: 30, cy: 30, r: 24, from: 135, to: 405 },
    );
    assert.equal(arc.strokeWidth, 2, 'and it carries the style in force when it was issued');
  } finally {
    setRuntimeHost(null);
  }
});

test('arc is declared panel-view only, like the rest of ce.draw', () => {
  assert.equal(memberPath('drawArc'), 'ce.draw.arc');
  assert.notEqual(memberRuntime(MEMBER_BY_ID.drawArc), RUNTIME_ANY, 'drawing needs a surface');
});
