// The script composition layer (spec Q6) in the preview runtime: emit() reaches on(...)
// listeners in other scripts, on(target, event, fn) fires for dispatched control events
// (including the "valueChanged" ↔ "onValueChanged" alias), and run("target.action") calls a
// named function in another script and returns its result.
//
// Uses the runtime-host seam (setRuntimeHost) the exported player uses, so no editor stores
// are needed: writes land in the host's writeValue and are asserted directly.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setRuntimeHost, runScript, dispatchInteraction } from '../src/CE_Application/scripting/panelRuntime.js';

const control = (id, name) => ({ _children: { Core: { id, name } } });

let writes;

function installHost(scripts) {
  writes = [];
  setRuntimeHost({
    panel: { id: 'test-panel', controls: [control('c-btn', 'btn'), control('c-led', 'led'), control('c-cutoff', 'cutoff')] },
    scripts,
    readValue: () => 0,
    writeValue: (ctl, modelPath, value) => { writes.push({ name: ctl._children.Core.name, modelPath, value }); },
  });
}

const settle = () => new Promise((r) => setTimeout(r, 25));

beforeEach(() => setRuntimeHost(null));

test('emit() fires an on(name, fn) listener in another script', async () => {
  installHost([
    { id: 's-listener', name: 'listener', language: 'javascript', event: 'onPanelReady', target: '*', enabled: true,
      source: 'on("ping", (data) => { set("led.value", data) })' },
    { id: 's-emitter', name: 'emitter', language: 'javascript', event: 'onClick', target: 'btn', enabled: true,
      source: 'function onClick(mouse) { emit("ping", 42) }' },
  ]);
  await runScript(
    { id: 's-emitter', name: 'emitter', language: 'javascript', event: 'onClick', target: 'btn',
      source: 'function onClick(mouse) { emit("ping", 42) }' },
    'onClick', { x: 0, y: 0 });
  await settle();
  assert.deepEqual(writes.filter((w) => w.name === 'led').at(-1)?.value, 42,
    'the listener script should have set led.value from the emitted payload');
});

test('on(target, "valueChanged", fn) fires when the runtime dispatches onValueChanged', async () => {
  installHost([
    { id: 's-watch', name: 'watch', language: 'javascript', event: 'onPanelReady', target: '*', enabled: true,
      source: 'on("btn", "valueChanged", (value) => { set("led.value", value * 2) })' },
  ]);
  dispatchInteraction('c-btn', 'onValueChanged', 21);
  await settle();
  assert.equal(writes.filter((w) => w.name === 'led').at(-1)?.value, 42,
    'the alias between "valueChanged" and "onValueChanged" should deliver the event');
});

test('run("target.action") calls the named function and returns its result', async () => {
  installHost([
    { id: 's-actions', name: 'actions', language: 'javascript', event: 'onPanelReady', target: '*', enabled: true,
      source: 'function resetAll() { set("cutoff.value", 0); return "done" }' },
    { id: 's-caller', name: 'caller', language: 'javascript', event: 'onClick', target: 'btn', enabled: true,
      source: 'function onClick(mouse) { set("led.value", run("actions.resetAll")) }' },
  ]);
  await runScript(
    { id: 's-caller', name: 'caller', language: 'javascript', event: 'onClick', target: 'btn',
      source: 'function onClick(mouse) { set("led.value", run("actions.resetAll")) }' },
    'onClick', { x: 0, y: 0 });
  await settle();
  assert.equal(writes.filter((w) => w.name === 'cutoff').at(-1)?.value, 0,
    'run() should have executed resetAll() in the actions script');
  assert.equal(writes.filter((w) => w.name === 'led').at(-1)?.value, 'done',
    'run() should return the action\'s return value synchronously for a JS target');
});
