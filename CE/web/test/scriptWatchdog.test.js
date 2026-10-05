// scriptWatchdog.test.js — release audit C-57.
//
// Preview scripts run on the page's thread, and nothing stopped one that never returned: a single
// `while (true) {}` hung the editor for good (reproduced in the running app; the WebKit process sat at
// 91 % CPU with no recovery). Every preview engine now has a bound — QuickJS's interrupt deadline for
// JavaScript, Wasmoon's timeout for Lua, the shared budget for the C++/C#/Java interpreters, and the
// loop guard (scriptWatchdog.js) for Python, which has no bound of its own. These run the real runtime
// over an endless loop in every language, so no engine can be left unbounded by a later change.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { setRuntimeHost, runScript, dispatchInteraction, pyodideLoader } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { setScriptTimeLimitForTests } from '../src/CE_Application/scripting/scriptWatchdog.js';

const LOOPS = {
  javascript: 'function onCustom() { let i = 0; while (true) { i++; } }',
  lua: 'function onCustom() local i = 0 while true do i = i + 1 end end',
  cpp: 'void onCustom(CeContext& ctx, const CeEvent& event) { int i = 0; while (true) { i++; } }',
  java: 'void onCustom(CeContext ctx, CeEvent e) { int i = 0; while (true) { i++; } }',
  csharp: 'void OnCustom(CeContext ctx, CeEvent e) { int i = 0; while (true) { i++; } }',
  python: 'def onCustom(event=None):\n    i = 0\n    while True:\n        i += 1\n',
};

// Pyodide is not a dependency of this repo — the editor fetches it from a CDN at run time. Point
// CE_PYODIDE_DIR at an unpacked Pyodide 0.26.4 (the directory holding pyodide.mjs) to run the Python
// cases; without it they are skipped, and a skip is not coverage.
const PYODIDE_DIR = process.env.CE_PYODIDE_DIR;
const havePyodide = Boolean(PYODIDE_DIR && existsSync(`${PYODIDE_DIR}/pyodide.mjs`));
if (havePyodide) {
  // Loaded NOW, before the first script runs: the sandbox locks this realm down then, and Pyodide
  // cannot load into a locked realm. The app gives Pyodide a realm of its own (an iframe); a test
  // process has none, so it loads first and hands the runtime the finished engine.
  const { loadPyodide } = await import(pathToFileURL(`${PYODIDE_DIR}/pyodide.mjs`).href);
  const engine = await loadPyodide({ indexURL: `${PYODIDE_DIR}/`, jsglobals: Object.create(null) });
  globalThis.loadPyodide = async () => engine;
}

const errors = () => get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message);

for (const [language, source] of Object.entries(LOOPS)) {
  const skip = language === 'python' && !havePyodide ? 'set CE_PYODIDE_DIR to run the Python preview' : false;
  test(`an endless loop in a ${language} handler stops instead of hanging`, { skip }, async () => {
    const restore = setScriptTimeLimitForTests(150);
    // The runtime loads Lua's wasm by a path relative to the working directory, which is
    // node_modules under the test loader (in the app it is a bundled URL).
    const cwd = process.cwd();
    if (language === 'lua') process.chdir(fileURLToPath(new URL('../node_modules/', import.meta.url)));
    try {
      clearScriptTrace();
      const event = language === 'csharp' ? 'OnCustom' : 'onCustom';
      const script = { id: `loop_${language}`, name: 'loop', language, event, target: 'loop', source, enabled: true };
      setRuntimeHost({ panel: { id: 'p', name: 'Loop', width: 400, height: 300, controls: [] }, scripts: [script] });
      const started = Date.now();
      await runScript(script, event);
      const took = Date.now() - started;
      assert.ok(took < 5000, `the handler took ${took} ms`);
      assert.ok(errors().some((m) => /limit exceeded|script stopped|timeout/i.test(m)),
        `no stop reported: ${JSON.stringify(get(scriptTrace)).slice(0, 400)}`);
    } finally {
      restore();
      process.chdir(cwd);
    }
  });
}

test('a Python loop that finishes is untouched, and its error lines are the source\'s own', { skip: havePyodide ? false : 'set CE_PYODIDE_DIR to run the Python preview' }, async () => {
  clearScriptTrace();
  const script = { id: 'sum', name: 'sum', language: 'python', event: 'onCustom', target: 'sum', enabled: true,
    source: 'def onCustom(event=None):\n    s = 0\n    for i in range(200000):\n        s += i\n    log("sum " + str(s))\n    raise ValueError("line six")\n' };
  setRuntimeHost({ panel: { id: 'p', name: 'Sum', width: 400, height: 300, controls: [] }, scripts: [script] });
  await runScript(script, 'onCustom');
  const trace = JSON.stringify(get(scriptTrace));
  assert.ok(trace.includes('sum 19999900000'), trace.slice(0, 400));
  assert.ok(/line 6/.test(trace), `the guard moved the error line: ${trace.slice(0, 600)}`);
  assert.ok(!errors().some((m) => m.includes('script stopped')));
});

test('a stopped Python script stays stopped for events until it is edited; Run tries again', { skip: havePyodide ? false : 'set CE_PYODIDE_DIR to run the Python preview' }, async () => {
  const restore = setScriptTimeLimitForTests(150);
  try {
    const knob = createControl('Knob', { Core: { name: 'K' } });
    const controlId = knob._children.Core.id;
    const source = 'def onDoubleClick(event):\n    while True:\n        pass\n';
    const script = { id: 'stuck', name: 'stuck', language: 'python', scope: 'component', target: 'K', event: 'onDoubleClick', source, enabled: true };
    setRuntimeHost({ panel: { id: 'p', name: 'P', width: 400, height: 300, controls: [knob] }, scripts: [script] });
    const stops = () => errors().filter((m) => m.includes('script stopped')).length;
    clearScriptTrace();

    await dispatchInteraction(controlId, 'onDoubleClick', { x: 1, y: 1 });
    assert.equal(stops(), 1, 'the first event should trip the watchdog');

    const started = Date.now();
    await dispatchInteraction(controlId, 'onDoubleClick', { x: 1, y: 1 });
    assert.ok(Date.now() - started < 100, 'a stopped script must not stall the next event');
    assert.equal(stops(), 1, 'a stopped script must not run again on the next event');

    await runScript(script, 'onDoubleClick');
    assert.equal(stops(), 2, 'Run is a request to try again');

    const edited = { ...script, source: 'def onDoubleClick(event):\n    log("fixed")\n' };
    setRuntimeHost({ panel: { id: 'p', name: 'P', width: 400, height: 300, controls: [knob] }, scripts: [edited] });
    await dispatchInteraction(controlId, 'onDoubleClick', { x: 1, y: 1 });
    assert.ok(JSON.stringify(get(scriptTrace)).includes('fixed'), 'an edited script runs again');
  } finally {
    restore();
  }
});

test('in the page, Pyodide loads into a realm of its own, never the locked page realm', async () => {
  // The sandbox locks the page's realm before any script runs, and Pyodide cannot load into a locked
  // realm: Python preview failed outright from the security pass on ("Cannot add property sig, object
  // is not extensible", confirmed in the browser). The loader must come from the iframe's window.
  const pageLoader = () => { throw new Error('loaded into the page realm'); };
  const realmLoader = () => 'realm';
  const appended = [];
  const realm = {
    loadPyodide: realmLoader,
    document: {
      createElement: () => ({}),
      head: { appendChild: (script) => { appended.push(script.src); queueMicrotask(() => script.onload()); } },
    },
  };
  const saved = { document: globalThis.document, loadPyodide: globalThis.loadPyodide };
  globalThis.loadPyodide = pageLoader;
  globalThis.document = {
    createElement: () => ({ setAttribute() {}, style: {}, contentWindow: realm }),
    body: { appendChild() {} },
  };
  try {
    const loader = await pyodideLoader('https://cdn.example/');
    assert.equal(loader, realmLoader);
    assert.deepEqual(appended, ['https://cdn.example/pyodide.js'], 'pyodide.js must be added to the iframe, not the page');
  } finally {
    globalThis.document = saved.document;
    globalThis.loadPyodide = saved.loadPyodide;
  }
});
