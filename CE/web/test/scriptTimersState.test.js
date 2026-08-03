// Preview timers (startTimer/stopTimer/onTimer, { once }) and the script key/value state
// (stateSet/stateGet), through the same runtime-host seam the exported player uses.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setRuntimeHost, runScript } from '../src/CE_Application/scripting/panelRuntime.js';

const control = (id, name) => ({ _children: { Core: { id, name } } });

let writes;

function installHost(scripts) {
  writes = [];
  setRuntimeHost({
    panel: { id: 'test-panel', controls: [control('c-led', 'led')] },
    scripts,
    readValue: () => 0,
    writeValue: (ctl, modelPath, value) => { writes.push({ name: ctl._children.Core.name, value }); },
  });
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (script, hook, payload) => runScript(script, hook, payload);

beforeEach(() => setRuntimeHost(null));

test('startTimer repeats and fires onTimer handlers; stopTimer ends it', async () => {
  const ticker = {
    id: 's-tick', name: 'tick', language: 'javascript', event: 'onTimer', target: '*', enabled: true,
    source: 'function onTimer(info) { if (info.id === "pulse") set("led.value", info.id) }',
  };
  const starter = {
    id: 's-start', name: 'start', language: 'javascript', event: 'onClick', target: '*', enabled: true,
    source: 'function onClick(m) { startTimer("pulse", 30) }',
  };
  installHost([ticker, starter]);
  await run(starter, 'onClick', {});
  await settle(110);
  const fired = writes.filter((w) => w.value === 'pulse').length;
  assert.ok(fired >= 2, `a 30ms repeating timer should fire repeatedly in 110ms (got ${fired})`);

  await run({ ...starter, id: 's-stop', source: 'function onClick(m) { stopTimer("pulse") }' }, 'onClick', {});
  const after = writes.length;
  await settle(80);
  assert.equal(writes.length, after, 'no fires after stopTimer');
});

test('startTimer(id, { ms, once }) fires exactly once', async () => {
  const ticker = {
    id: 's-tick1', name: 'tick1', language: 'javascript', event: 'onTimer', target: '*', enabled: true,
    source: 'function onTimer(info) { set("led.value", "once-" + info.id) }',
  };
  const starter = {
    id: 's-once', name: 'once', language: 'javascript', event: 'onClick', target: '*', enabled: true,
    source: 'function onClick(m) { startTimer("shot", { ms: 30, once: true }) }',
  };
  installHost([ticker, starter]);
  await run(starter, 'onClick', {});
  await settle(140);
  assert.equal(writes.filter((w) => w.value === 'once-shot').length, 1,
    'a { once } timer fires a single time and removes itself');
});

test('stateSet/stateGet round-trip across separate script runs; fallback when unset', async () => {
  const writer = {
    id: 's-w', name: 'w', language: 'javascript', event: 'onClick', target: '*', enabled: true,
    source: 'function onClick(m) { stateSet("count", (stateGet("count", 0)) + 1) }',
  };
  const reader = {
    id: 's-r', name: 'r', language: 'javascript', event: 'onClick', target: '*', enabled: true,
    source: 'function onClick(m) { set("led.value", stateGet("count", -1)) }',
  };
  installHost([writer, reader]);
  await run(reader, 'onClick', {});
  assert.equal(writes.at(-1)?.value, -1, 'unset key returns the fallback');
  await run(writer, 'onClick', {});
  await run(writer, 'onClick', {});
  await run(reader, 'onClick', {});
  assert.equal(writes.at(-1)?.value, 2, 'state persists across separate script executions');
});
