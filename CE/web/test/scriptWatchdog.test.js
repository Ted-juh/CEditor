// scriptWatchdog.test.js — release audit C-57.
//
// Preview scripts run on the page's thread, and nothing stopped one that never returned: a single
// `while (true) {}` hung the editor for good (reproduced in the running app; the WebKit process sat at
// 91 % CPU with no recovery). The exported plug-in's engines already stop a stuck script after two
// seconds. The preview now instruments every loop body with a guard, and the interpreters call it
// from their statement loop. These run the real runtime with a short limit so the suite stays fast.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { fileURLToPath } from 'node:url';

import { setRuntimeHost, runScript, dispatchInteraction } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { instrumentJs, instrumentLua, setScriptTimeLimitForTests, GUARD_NAME } from '../src/CE_Application/scripting/scriptWatchdog.js';

const LOOPS = {
  javascript: 'function onCustom() { let i = 0; while (true) { i++; } }',
  lua: 'function onCustom() local i = 0 while true do i = i + 1 end end',
  cpp: 'void onCustom(CeContext& ctx, const CeEvent& event) { int i = 0; while (true) { i++; } }',
  java: 'void onCustom(CeContext ctx, CeEvent e) { int i = 0; while (true) { i++; } }',
  csharp: 'void OnCustom(CeContext ctx, CeEvent e) { int i = 0; while (true) { i++; } }',
};

const errors = () => get(scriptTrace).filter((t) => t.k === 'error' || t.kind === 'error' || t.level === 'error').map((t) => t.m ?? t.message ?? t.text ?? JSON.stringify(t));

for (const [language, source] of Object.entries(LOOPS)) {
  test(`an endless loop in a ${language} handler stops instead of hanging`, async () => {
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
      assert.ok(errors().some((m) => m.includes('script stopped')), `no stop reported: ${JSON.stringify(get(scriptTrace)).slice(0, 400)}`);
    } finally {
      restore();
      process.chdir(cwd);
    }
  });
}

test('a loop that finishes is untouched, and runs at full speed', async () => {
  clearScriptTrace();
  const script = { id: 'sum', name: 'sum', language: 'javascript', event: 'onCustom', target: 'sum',
    source: 'function onCustom() { let s = 0; for (let i = 0; i < 2e6; i++) s += i; log("sum " + s); }', enabled: true };
  setRuntimeHost({ panel: { id: 'p', name: 'Sum', width: 400, height: 300, controls: [] }, scripts: [script] });
  await runScript(script, 'onCustom');
  assert.ok(JSON.stringify(get(scriptTrace)).includes('sum 1999999000000'));
  assert.equal(errors().length, 0);
});

test('instrumentation keeps line numbers and leaves unparseable source alone', () => {
  const js = 'let a = 1;\nwhile (a) a--;\nfor (const x of [1]) {\n  log(x);\n}';
  const out = instrumentJs(js);
  assert.equal(out.split('\n').length, js.split('\n').length);
  assert.equal((out.match(new RegExp(GUARD_NAME, 'g')) ?? []).length, 2);
  assert.equal(instrumentJs('while (('), 'while ((');
  const lua = 'local i = 0\nwhile i < 3 do\n  i = i + 1\nend\nrepeat until true\nfor k, v in pairs({}) do end';
  const luaOut = instrumentLua(lua);
  assert.equal(luaOut.split('\n').length, lua.split('\n').length);
  assert.equal((luaOut.match(new RegExp(GUARD_NAME, 'g')) ?? []).length, 3);
});

test('a stopped script stays stopped for events until it is edited; Run tries again', async () => {
  const restore = setScriptTimeLimitForTests(150);
  try {
    const knob = createControl('Knob', { Core: { name: 'K' } });
    const controlId = knob._children.Core.id;
    const source = 'function onDoubleClick() { let i = 0; while (true) { i++; } }';
    const script = { id: 'stuck', name: 'stuck', language: 'javascript', scope: 'component', target: 'K', event: 'onDoubleClick', source, enabled: true };
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

    const edited = { ...script, source: 'function onDoubleClick() { log("fixed"); }' };
    setRuntimeHost({ panel: { id: 'p', name: 'P', width: 400, height: 300, controls: [knob] }, scripts: [edited] });
    await dispatchInteraction(controlId, 'onDoubleClick', { x: 1, y: 1 });
    assert.ok(JSON.stringify(get(scriptTrace)).includes('fixed'), 'an edited script runs again');
  } finally {
    restore();
  }
});
