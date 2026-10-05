import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LuaFactory } from 'wasmoon';
import { runBoundedLuaSource } from '../src/CE_Application/scripting/boundedLua.js';
import { compileCpp, invokeCpp } from '../src/CE_Application/scripting/cppPreview.js';
import { compileCsharp, invokeCsharp } from '../src/CE_Application/scripting/csharpPreview.js';
import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';

for (const [name, compile, invoke] of [['C++', compileCpp, invokeCpp], ['C#', compileCsharp, invokeCsharp], ['Java', compileJava, invokeJava]]) {
  test(`${name} preview interrupts loops and recursion, then accepts a normal handler`, () => {
    for (const source of ['void run() { while (true) {} }', 'void run() { run(); }']) {
      const { handlers, diagnostics } = compile(source);
      assert.deepEqual(diagnostics, []);
      assert.throws(() => invoke(handlers.get('run')), /limit exceeded/);
    }
    const { handlers } = compile('int run() { return 7; }');
    assert.equal(invoke(handlers.get('run')), 7);
  });
}
test('Lua load and retained callbacks time out; later calls receive fresh deadlines', async () => {
  const require = createRequire(import.meta.url);
  const lua = await new LuaFactory(require.resolve('wasmoon/dist/glue.wasm')).createEngine({ functionTimeout: 30, traceAllocations: true });
  lua.global.setMemoryMax(2 * 1024 * 1024);
  try {
    assert.throws(() => runBoundedLuaSource(lua, 'while true do end', 30), /timeout/);
    const handlers = runBoundedLuaSource(lua, 'return { run = function() while true do end end, ok = function() return 7 end }');
    assert.throws(handlers.run, /timeout/);
    assert.equal(handlers.ok(), 7);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(handlers.ok(), 7);
    assert.throws(() => runBoundedLuaSource(lua, 'local a = {}; while true do a[#a+1] = string.rep("x", 65536) end', 1000), /memory/);
  } finally { lua.global.close(); }
});
test('preview array allocations are checked before allocating host memory', () => {
  for (const [compile, invoke, source] of [
    [compileCpp, invokeCpp, 'void run() { int values[1000000000]; }'],
    [compileCsharp, invokeCsharp, 'void run() { new int[1000000000]; }'],
    [compileJava, invokeJava, 'void run() { new int[1000000000]; }'],
  ]) {
    const { handlers, diagnostics } = compile(source);
    assert.deepEqual(diagnostics, []);
    assert.throws(() => invoke(handlers.get('run')), /allocation limit exceeded/);
  }
});
test('delayed preview lambdas receive a fresh budget, including after a previous timeout', async () => {
  const callbacks = [];
  for (const [compile, invoke, lambda] of [
    [compileCpp, invokeCpp, '[]()'], [compileCsharp, invokeCsharp, '() =>'], [compileJava, invokeJava, '() ->'],
  ]) {
    let callback;
    const api = { after: (_ms, fn) => { callback = fn; } };
    const build = body => compile(`void run(Context ctx) { ctx.after(1, ${lambda} { ${body} }); }`);
    let parsed = build('while (true) {}');
    assert.deepEqual(parsed.diagnostics, []);
    invoke(parsed.handlers.get('run'), [api]);
    assert.throws(callback, /limit exceeded/);
    parsed = build('for (int i = 0; i < 1000; i++) {}');
    assert.deepEqual(parsed.diagnostics, []);
    invoke(parsed.handlers.get('run'), [api]);
    callbacks.push(callback);
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  callbacks.forEach(fn => assert.doesNotThrow(fn));
});
