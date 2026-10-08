// pythonApiBoundary.test.js — release audit C-96, C-97, C-98, C-99.
//
// Pyodide passes a Python dict, list or callable to a JavaScript function as a BORROWED proxy and
// destroys it when the call returns. The panel API kept them: a dict saved with saveSetting() made
// the panel impossible to save (serializePanel threw on the dead proxy), every callback given to
// after()/on()/watch()/intercept() was dead when it fired, and options dicts and lists read as empty.
// And py.toPy(api) converted the whole API deeply, so `ce` became a dict and `ce.midi.sendCC` raised
// AttributeError. All reproduced in the running editor with Pyodide 0.26.4 before the fix.
//
// apiForPython converts at the boundary. This drives it with a stand-in for Pyodide's PyProxy that
// behaves like the real one: a borrowed proxy dies after the call, toJs() converts, copy() survives.

import test from 'node:test';
import assert from 'node:assert/strict';

import { apiForPython } from '../src/CE_Application/scripting/panelRuntime.js';

class FakePyProxy {
  constructor(value) { this.value = value; this.alive = true; }
  toJs({ dict_converter } = {}) {
    if (!this.alive) throw new Error('This borrowed proxy was automatically destroyed at the end of a function call');
    const convert = (v) => (v instanceof Map ? dict_converter([...v].map(([k, x]) => [k, convert(x)])) : Array.isArray(v) ? v.map(convert) : v);
    return convert(this.value);
  }
}
function pyCallable(fn) {
  const proxy = function borrowed(...args) {
    if (!proxy.alive) throw new Error('This borrowed proxy was automatically destroyed at the end of a function call');
    return fn(...args);
  };
  Object.setPrototypeOf(proxy, FakePyProxy.prototype);
  proxy.alive = true;
  proxy.copy = () => pyCallable(fn);
  return proxy;
}
/** Call `fn` the way Pyodide calls a JS function from Python: proxies are borrowed for the call. */
function callFromPython(fn, ...args) {
  try { return fn(...args); } finally { for (const a of args) if (a instanceof FakePyProxy) a.alive = false; }
}

test('a dict argument arrives as a plain object that outlives the call', () => {
  let stored;
  const api = apiForPython({ saveSetting: (key, value) => { stored = value; } }, FakePyProxy);
  callFromPython(api.saveSetting, 'lastPatch', new FakePyProxy(new Map([['name', 'Bass'], ['cutoff', 64]])));
  assert.deepEqual(stored, { name: 'Bass', cutoff: 64 });
  assert.equal(JSON.stringify(stored), '{"name":"Bass","cutoff":64}', 'the stored value must serialise after the call');
});

test('lists and nested containers arrive as arrays and objects', () => {
  let got;
  const api = apiForPython({ sendSysex: (bytes) => { got = bytes; }, panelCreate: (type, opts) => opts }, FakePyProxy);
  callFromPython(api.sendSysex, new FakePyProxy([0xf0, 0x41, 0xf7]));
  assert.deepEqual(got, [0xf0, 0x41, 0xf7]);
  const opts = callFromPython(api.panelCreate, 'Knob', new FakePyProxy(new Map([['name', 'osc1'], ['at', [10, 20]]])));
  assert.deepEqual(opts, { name: 'osc1', at: [10, 20] });
});

test('a callback handed to the API can still be called after the registering call returned', () => {
  const pending = [];
  const api = apiForPython({ after: (ms, fn) => { pending.push(fn); } }, FakePyProxy);
  let fired = 0;
  callFromPython(api.after, 80, pyCallable(() => { fired += 1; }));
  pending[0]();
  assert.equal(fired, 1);
});

test('the ce namespace stays an object whose members are wrapped too', () => {
  let sent;
  const api = apiForPython({ ce: { version: 3, midi: { sendCC: (ch, cc, v) => { sent = [ch, cc, v]; } }, storage: { save: (k, v) => v } } }, FakePyProxy);
  assert.equal(api.ce.version, 3);
  callFromPython(api.ce.midi.sendCC, 1, 74, 64);
  assert.deepEqual(sent, [1, 74, 64]);
  assert.deepEqual(callFromPython(api.ce.storage.save, 'k', new FakePyProxy(new Map([['a', 1]]))), { a: 1 });
});

test('plain JavaScript values pass through untouched, and without Pyodide nothing is converted', () => {
  const api = apiForPython({ echo: (x) => x }, FakePyProxy);
  const obj = { a: 1 };
  assert.equal(api.echo(obj), obj);
  assert.equal(apiForPython({ echo: (x) => x }, undefined).echo(5), 5);
});
