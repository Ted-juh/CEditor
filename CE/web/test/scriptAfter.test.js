// scriptAfter.test.js — ce.time.after: a one-shot delay.
//
// Every other timer in the API repeats. Send a program change, wait for the synth to settle, then
// send the dump — written today as a repeating timer that stops itself, which every panel author
// reinvents and which has one failure mode nobody remembers: if the callback throws before it
// cancels, the "one-shot" runs forever.
//
// Built on the same timer map rather than on setTimeout, so it behaves identically to the C++
// preludes (which have no setTimeout) and so stopTimer cancels it like anything else.
// CE/tests/ScriptRuntimeTests.cpp §27 pins the same behaviour window-closed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY,
} from '../src/CE_Application/scripting/panelApi.js';

// ce.time declared explicitly. On `auto` the module set is derived from the panel's scripts, and
// this fixture has none — so without it every verb here is (correctly) a gated stub that returns
// nothing, which looks exactly like a broken timer.
const panel = {
  id: 'p', name: 'After', width: 400, height: 300, controls: [],
  scripting: { modules: ['ce.time'] },
};
const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function withApi(fn) {
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'after-script')); } finally { setRuntimeHost(null); }
}

/* -------------------------------------------------------------------------- the contract */

test('after is declared, cross-runtime, and lives in ce.time', () => {
  // A delay is not a panel-view idea. "Wait 40ms then send the dump" has to work in a DAW.
  assert.ok(MEMBER_BY_ID.after);
  assert.equal(memberPath('after'), 'ce.time.after');
  assert.equal(memberRuntime(MEMBER_BY_ID.after), RUNTIME_ANY);
});

/* ------------------------------------------------------------------------------ firing */

test('the callback runs once, after the delay, and not before', async () => {
  let calls = 0;
  const api = scriptApiForTesting('', 'after-script');
  setRuntimeHost({ panel, scripts: [] });
  try {
    api.after(30, () => { calls += 1; });
    assert.equal(calls, 0, 'after() must not run its callback synchronously');
    await wait(90);
    assert.equal(calls, 1);
    await wait(90);
    assert.equal(calls, 1, 'and it must NOT repeat — that is the whole point');
  } finally {
    setRuntimeHost(null);
  }
});

test('several one-shots do not collide', async () => {
  const seen = [];
  setRuntimeHost({ panel, scripts: [] });
  try {
    const api = scriptApiForTesting('', 'after-script');
    api.after(20, () => seen.push('a'));
    api.after(50, () => seen.push('b'));
    await wait(130);
    assert.deepEqual(seen, ['a', 'b'], 'each keeps its own id and its own callback');
  } finally {
    setRuntimeHost(null);
  }
});

test('a callback may schedule the next one — the chaining case', async () => {
  // This is what a settle-then-send sequence looks like, and it only works if the entry is cleared
  // before the callback runs. Otherwise the second after() would be cancelled by the first's stop.
  const seen = [];
  setRuntimeHost({ panel, scripts: [] });
  try {
    const api = scriptApiForTesting('', 'after-script');
    api.after(20, () => {
      seen.push(1);
      api.after(20, () => seen.push(2));
    });
    await wait(140);
    assert.deepEqual(seen, [1, 2]);
  } finally {
    setRuntimeHost(null);
  }
});

/* ---------------------------------------------------------------------------- cancelling */

test('stopTimer cancels it before it fires — no new verb needed', async () => {
  let calls = 0;
  setRuntimeHost({ panel, scripts: [] });
  try {
    const api = scriptApiForTesting('', 'after-script');
    const id = api.after(40, () => { calls += 1; });
    assert.equal(typeof id, 'string', 'after returns the id you cancel with');
    api.stopTimer(id);
    await wait(120);
    assert.equal(calls, 0);
  } finally {
    setRuntimeHost(null);
  }
});

/* ------------------------------------------------------------------- failure behaviour */

test('a callback that throws is reported, and does NOT leave the one-shot repeating', async () => {
  // The exact bug a hand-rolled self-cancelling timer has. The entry is removed and the timer
  // stopped BEFORE the callback runs, so a throw cannot resurrect it.
  let calls = 0;
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'after-script');
    api.after(20, () => { calls += 1; throw new Error('boom in the delay'); });
    await wait(140);
    assert.equal(calls, 1, 'it must not run again');
    assert.match(traced(), /boom in the delay/, 'and the failure is reported, not swallowed');
  } finally {
    setRuntimeHost(null);
  }
});

test('calling it without a function schedules nothing and says so', () => {
  withApi((api) => {
    assert.equal(api.after(20), undefined);
    assert.match(traced(), /needs a function to run/);
  });
});

/* --------------------------------------------------------------------- it is not onTimer */

test('a one-shot does not surface as onTimer', async () => {
  // A one-shot is not a timer the panel declared. If it raised onTimer, every script with an
  // onTimer handler would have to learn to filter ids it never created.
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try {
    scriptApiForTesting('', 'after-script').after(20, () => {});
    await wait(120);
    assert.doesNotMatch(traced(), /onTimer/);
  } finally {
    setRuntimeHost(null);
  }
});
