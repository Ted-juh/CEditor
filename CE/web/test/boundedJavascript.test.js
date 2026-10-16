import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoundedJavascript as evaluate, disposeJavascriptSandboxes, initialiseJavascriptSandbox,
  sandboxCountForTesting, sharedRuntimeAliveForTesting, allocationCounterForTesting,
  SCRIPT_LIMITS } from '../src/CE_Application/scripting/boundedJavascript.js';
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
test('a panel holds as many scripts as its memory allows, not a fixed count', () => {
  // There was a cap of 32 sandboxes, and the GAIA panel has 232 scripts: the 33rd onward never
  // loaded. Three hundred small ones, all live at once, each still answering.
  const scripts = [];
  for (let i = 0; i < 300; i++) scripts.push(evaluate(`function id() { return ${i}; }`, {}, ['id']));
  assert.equal(sandboxCountForTesting(), 300);
  scripts.forEach((script, i) => assert.equal(script.id(), i));
});

// One runtime for the panel, a context per script (boundedJavascript.js says why). What a script had
// to itself with a runtime of its own, and now shares, is what these are about.
test('the panel\'s scripts share one runtime, made with the first and freed with the last', () => {
  assert.equal(sharedRuntimeAliveForTesting(), false);
  const a = evaluate('var x = "a"; function name() { return x; }', {}, ['name']);
  const b = evaluate('var x = "b"; function name() { return x; }', {}, ['name']);
  assert.equal(sharedRuntimeAliveForTesting(), true);
  assert.deepEqual([a.name(), b.name()], ['a', 'b'], 'each script still has globals of its own');
  disposeJavascriptSandboxes();
  assert.equal(sharedRuntimeAliveForTesting(), false);
});
test('a runaway promise chain goes with the call that ran out of time, not on into the next script\'s', async () => {
  assert.throws(() => evaluate('Promise.resolve().then(function spin() { Promise.resolve().then(spin); });', {}, [],
    { milliseconds: 30 }), /limit exceeded/);
  // Had the chain been left queued, this call would run it, and be stopped by its time limit.
  const next = evaluate('async function later() { await null; await null; return 5; }', {}, ['later'], { milliseconds: 30 });
  assert.equal(await next.later(), 5);
});
test('what a script queues while another script calls it runs before that call returns', () => {
  const log = [];
  let callB;
  evaluate('register(() => { Promise.resolve().then(() => say("b, later")); say("b"); });',
    { register: (fn) => { callB = fn; }, say: (text) => log.push(text) }, []);
  const a = evaluate('function go() { poke(); return "a"; }', { poke: () => callB() }, ['go']);
  assert.equal(a.go(), 'a');
  assert.deepEqual(log, ['b', 'b, later']);
});
test('a script stopped during another script\'s call is freed when the call ends, and what it queued reaches nothing', async () => {
  const sent = [];
  let callB;
  evaluate('register(() => { Promise.resolve().then(() => send("late")); });',
    { register: (fn) => { callB = fn; }, send: (text) => sent.push(text) }, [], { owner: 'b' });
  const a = evaluate('function go() { poke(); stop(); return "a"; } async function again() { await null; return "again"; }',
    { poke: () => callB(), stop: () => disposeJavascriptSandboxes('b') }, ['go', 'again'], { owner: 'a' });
  assert.equal(a.go(), 'a');
  assert.deepEqual(sent, [], 'its job ran in the call that stopped it, and its panel API refused it');
  assert.equal(sandboxCountForTesting(), 1);
  assert.throws(callB, /stopped/);
  assert.equal(await a.again(), 'again', 'the runtime is sound after freeing a context mid-call');
});
test('a call may not make one allocation larger than its memory budget', () => {
  const mb = SCRIPT_LIMITS.memoryBytes / (1024 * 1024);
  const script = evaluate(`function take(mb) { return new Uint8Array(mb * 1024 * 1024).length; }`, {}, ['take']);
  assert.equal(script.take(mb / 2), SCRIPT_LIMITS.memoryBytes / 2);
  assert.throws(() => script.take(mb * 2), /memory limit exceeded|out of memory/);
  assert.throws(() => script.take(1), /stopped/);
  assert.equal(evaluate('function ok() { return 1; }', {}, ['ok']).ok(), 1);
});
test('the runtime\'s allocation counter is read from where QuickJS keeps it', () => {
  evaluate('globalThis.many = Array.from({ length: 5000 }, (_, i) => ({ i }));', {}, []);
  const { count, size, reported } = allocationCounterForTesting();
  // A few allocations apart: reporting the usage allocates the object it reports in.
  assert.ok(Math.abs(count - reported.malloc_count) < 64, `${count} counted here, ${reported.malloc_count} reported`);
  // Eight bytes an allocation, whatever its size: why the budget is a per-allocation cap and not a
  // ceiling on what a script keeps. A QuickJS build that counts bytes would fail this, and could
  // give each script a real ceiling.
  assert.equal(size, count * 8);
});
test('scripts are not given FinalizationRegistry, whose callbacks the collector queues outside any call', () => {
  assert.deepEqual(evaluate('function kinds() { return [typeof FinalizationRegistry, typeof WeakRef]; }', {}, ['kinds']).kinds(),
    ['undefined', 'function']);
});
