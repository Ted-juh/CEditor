import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoundedJavascript as evaluate, disposeJavascriptSandboxes, initialiseJavascriptSandbox } from '../src/CE_Application/scripting/boundedJavascript.js';
await initialiseJavascriptSandbox();

afterEach(() => disposeJavascriptSandboxes());
test('interrupts top-level loops, recursion, callback loops and microtask floods', () => {
  for (const source of ['while (true) {}', 'function recurse() { recurse(); } recurse();',
    'Promise.resolve().then(function spin() { Promise.resolve().then(spin); });']) {
    assert.throws(() => evaluate(source, {}, [], { milliseconds: 30 }), /limit exceeded|stack overflow/);
  }
  const script = evaluate('function onClick() { while (true) {} }', {}, ['onClick'], { milliseconds: 30 });
  assert.throws(script.onClick, /limit exceeded/);
  assert.throws(script.onClick, /stopped/);
  assert.equal(evaluate('function ok() { return 42; }', {}, ['ok']).ok(), 42);
});
test('memory allocation is limited and the next script can still run', () => {
  assert.throws(() => evaluate('const a = []; while (true) a.push(new Uint8Array(1024 * 1024));', {}, [],
    { memoryBytes: 2 * 1024 * 1024, milliseconds: 1000 }), /memory|limit exceeded/);
  assert.equal(evaluate('function ok() { return 42; }', {}, ['ok']).ok(), 42);
});
test('host callbacks and state work without sharing host object references', () => {
  let timer;
  const calls = [];
  const data = { nested: { value: 4 } };
  const script = evaluate(`
    after(10, () => log('timer'));
    function click(payload) { state.count = (state.count || 0) + 1;
      return batch(() => ({ count: state.count, payload, result: add(2, 3) })); }
    function change() { const item = read(); item.nested.value = 99; }
  `, { state: {}, after: (_ms, fn) => { timer = fn; }, log: text => calls.push(text),
    batch: fn => fn(), add: (a, b) => a + b, read: () => data }, ['click', 'change']);
  assert.deepEqual(script.click({ hello: 'world' }), { count: 1, payload: { hello: 'world' }, result: 5 });
  assert.equal(script.click(null).count, 2);
  timer(); assert.deepEqual(calls, ['timer']);
  script.change(); assert.equal(data.nested.value, 4);
  disposeJavascriptSandboxes();
  assert.throws(timer, /stopped/);
});
test('async handlers settle and a retained runaway callback is interrupted', async () => {
  const script = evaluate('async function run() { await Promise.resolve(); return 7; }', {}, ['run']);
  assert.equal(await script.run(), 7);
  const hostAsync = evaluate('async function run() { return (await read()) + 1; }',
    { read: async () => 8 }, ['run']);
  assert.equal(await hostAsync.run(), 9);
  let timer;
  evaluate('after(10, () => { while (true) {} });', { after: (_ms, fn) => { timer = fn; } }, [], { milliseconds: 30 });
  assert.throws(timer, /limit exceeded/);
});
test('API floods and oversized data cannot grow host resources without a limit', () => {
  let count = 0;
  assert.throws(() => evaluate('while (true) send();', { send: () => { count++; } }, [], { milliseconds: 1000 }), /limit exceeded/);
  assert.ok(count <= 4096);
  assert.throws(() => evaluate('send("x".repeat(2 * 1024 * 1024));', { send() {} }, []), /limit exceeded/);
});
