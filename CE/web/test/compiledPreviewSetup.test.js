// compiledPreviewSetup.test.js — `on()` registration in the C++, C# and Java previews.
//
// THE GAP. Lua and JS register listeners by running top-level code: the source calls
// `on("self", "valueChanged", fn)` at load and the runtime keeps it. The three compiled previews
// could not, and `scripting-runtime-gaps.md` carried it as "named handlers only" — a real asymmetry,
// because a script reacting to a custom event had no way to say so in three of the seven languages.
//
// WHY NOT "run top-level statements". That was the recorded plan, copied from how `loadHandlersJs`
// works, and it is wrong for these three: a bare statement at file scope is illegal in C++, C# and
// Java, so there is no top-level code to execute. What a person writes is a function. Hence a
// `setup` (or `Setup`) entry point, called once at load with the same ctx the handlers get.
//
// The tests below drive the interpreters directly rather than the runtime, because the thing worth
// pinning is that the pieces compose: a named function referenced as a VALUE has to survive being
// passed through the interpreter to a host callback as something JavaScript can actually call. If
// that stopped working, `on()` would register something uncallable and fail at fire time — far from
// here, and long after.

import test from 'node:test';
import assert from 'node:assert/strict';

import { compileCpp, invokeCpp } from '../src/CE_Application/scripting/cppPreview.js';
import { compileCsharp, invokeCsharp } from '../src/CE_Application/scripting/csharpPreview.js';
import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';

/** A ctx that records what a script did to it, with a working `on`. */
function recordingCtx() {
  const calls = [];
  const listeners = [];
  return {
    calls,
    listeners,
    ctx: {
      log: (s) => calls.push(['log', String(s)]),
      Log: (s) => calls.push(['log', String(s)]),
      on: (target, event, fn) => listeners.push({ target, event, fn }),
    },
  };
}

const CASES = [
  {
    lang: 'C++',
    compile: compileCpp,
    invoke: invokeCpp,
    entry: 'setup',
    source: `
void myHandler(Ctx ctx, Event e) { ctx.log("fired"); }
void setup(Ctx ctx) { ctx.on("self", "valueChanged", myHandler); }
`,
  },
  {
    lang: 'C#',
    compile: compileCsharp,
    invoke: invokeCsharp,
    entry: 'Setup',
    source: `
public static class Panel {
  public static void MyHandler(dynamic ctx, dynamic e) { ctx.Log("fired"); }
  public static void Setup(dynamic ctx) { ctx.on("self", "valueChanged", MyHandler); }
}
`,
  },
  {
    lang: 'Java',
    compile: compileJava,
    invoke: invokeJava,
    entry: 'setup',
    source: `
public class Panel {
  public static void myHandler(Ctx ctx, Event e) { ctx.log("fired"); }
  public static void setup(Ctx ctx) { ctx.on("self", "valueChanged", myHandler); }
}
`,
  },
];

for (const c of CASES) {
  test(`${c.lang}: a setup entry point can register a listener with on()`, () => {
    const { handlers, diagnostics } = c.compile(c.source);
    assert.deepEqual(diagnostics, [], `${c.lang} source did not compile cleanly`);
    assert.ok(handlers.has(c.entry), `${c.lang}: no ${c.entry} handler was parsed`);

    const { ctx, listeners } = recordingCtx();
    c.invoke(handlers.get(c.entry), [ctx, {}], { print: () => {} });

    assert.equal(listeners.length, 1, `${c.lang}: setup did not register a listener`);
    assert.equal(listeners[0].event, 'valueChanged');
    assert.equal(listeners[0].target, 'self');
  });

  test(`${c.lang}: the registered handler is a callable that reaches the script body`, () => {
    // The half that would fail silently. A registration whose third argument is not really callable
    // looks fine at load and throws at fire time, in a different file, much later.
    const { handlers } = c.compile(c.source);
    const { ctx, listeners, calls } = recordingCtx();
    c.invoke(handlers.get(c.entry), [ctx, {}], { print: () => {} });

    const fn = listeners[0]?.fn;
    assert.equal(typeof fn, 'function', `${c.lang}: on() was handed a ${typeof fn}, not a function`);

    fn(ctx, { value: 1 });
    assert.deepEqual(calls, [['log', 'fired']],
      `${c.lang}: calling the registered handler did not run the script's body`);
  });
}

test('a source with no setup is unaffected', () => {
  // The overwhelmingly common case: handlers by name and nothing else. Adding an entry point must
  // not change what those scripts do.
  const { handlers, diagnostics } = compileCpp(`
void onValueChanged(Ctx ctx, Event e) { ctx.log("v"); }
`);
  assert.deepEqual(diagnostics, []);
  assert.ok(handlers.has('onValueChanged'));
  assert.ok(!handlers.has('setup'), 'no setup should be invented');
});
