// ce.format gives the same text in every runtime: the panel view (formatCore.js), and the Lua,
// JavaScript and Python preludes. One table of calls (support/formatCases.mjs) runs through all four;
// the JavaScript prelude's copy is also checked to be formatCore.js itself
// (tools/scripts/gen-format-prelude.mjs), and a rejected call is checked to say the same words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { FORMAT_CASES } from './support/formatCases.mjs';
import { formatPreludeBlock, BEGIN, END } from '../../../tools/scripts/gen-format-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');

function extractRawString(file, tag) {
  const source = readFileSync(join(scriptingDir, file), 'utf8').replace(/\r\n/g, '\n');
  const open = `R"${tag}(`;
  const start = source.indexOf(open);
  const end = source.indexOf(`)${tag}"`, start);
  assert.ok(start >= 0 && end > start, `no ${tag} prelude in ${file}`);
  return source.slice(start + open.length, end);
}
function findPython3() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return cmd;
  }
  return null;
}
const same = (got, want) => (typeof want === 'number'
  ? typeof got === 'number' && Math.abs(got - want) < 1e-9
  : (got ?? null) === want);
function compare(label, results) {
  const wrong = FORMAT_CASES
    .map(([fn, args, want], i) => [fn, args, want, results[i]])
    .filter(([, , want, got]) => !same(got, want))
    .map(([fn, args, want, got]) => `${fn}(${JSON.stringify(args).slice(1, -1)}) gave ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the panel view gives the table\'s text, through both spellings', () => {
  const api = scriptApiForTesting();
  compare('panel view', FORMAT_CASES.map(([fn, args]) => api[fn](...args)));
  assert.equal(api.ce.format.hz(1250), '1.25 kHz');
  assert.equal(api.ce.format.parse('1.2k'), 1200);
});

test('the JavaScript prelude runs formatCore.js itself, and gives the table\'s text', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, formatPreludeBlock(), 'the ce.format block is stale: node tools/scripts/gen-format-prelude.mjs --write');
  const said = [];
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: (t) => said.push(t), logWarn: (t) => said.push(t) };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  sandbox.logError = (t) => said.push(t);
  sandbox.logWarn = (t) => said.push(t);
  compare('JavaScript prelude', FORMAT_CASES.map(([fn, args]) => sandbox[fn](...args)));
});

// Arguments as Lua source, so the Lua side sees its own tables (read from 1) rather than a bridge's.
function luaLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  if (typeof v === 'string') return JSON.stringify(v).replace(/\\u([0-9a-fA-F]{4})/g, '\\u{$1}');
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{ ${v.map(luaLiteral).join(', ')} }`;
  return `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${luaLiteral(x)}`).join(', ')} }`;
}

test('the Lua prelude gives the table\'s text', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on', '__deviceQuery']) {
      lua.global.set(name, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    // One chunk for the whole table: wasmoon's heap does not survive a hundred separate doString
    // calls (it fails with "memory access out of bounds" part-way). A nil answer comes back as false.
    const calls = FORMAT_CASES.map(([fn, args], i) =>
      `do local r = ${fn}(${args.map(luaLiteral).join(', ')}); if r == nil then r = false end; __out[${i + 1}] = r end`);
    const results = await lua.doString(`__out = {}\n${calls.join('\n')}\nreturn __out`);
    const list = Array.isArray(results) ? results : Object.keys(results).sort((a, b) => a - b).map((k) => results[k]);
    compare('Lua prelude', list.map((r) => (r === false ? null : r)));
  } finally {
    lua.global.close();
  }
});

test('the Python prelude gives the table\'s text', (t) => {
  const python = findPython3();
  if (!python) { t.diagnostic('Python 3 is not on this machine: its text was not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "logWarn", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
out = []
for fn, args in payload["cases"]:
    out.append(g[fn](*args))
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: FORMAT_CASES.map(([fn, args]) => [fn, args]) }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});

test('a rejected argument says the same words in the panel view', () => {
  const api = scriptApiForTesting();
  clearScriptTrace();
  assert.equal(api.formatHz(-5), '--');
  assert.equal(api.formatTable(9, ['a']), '--');
  const lines = get(scriptTrace).filter((e) => e.kind === 'error' || e.kind === 'warn').map((e) => `${e.kind}: ${e.message}`);
  assert.deepEqual(lines, [
    'error: ce.format.hz: a frequency below 0 is not one, so "--" is shown.',
    'warn: ce.format.table: 9 is past the end of the table, so "--" is shown.',
  ]);
});

test('an option a command does not take refuses the call, as every command\'s options do', () => {
  const api = scriptApiForTesting();
  clearScriptTrace();
  assert.equal(api.formatHz(440, { flats: true }), undefined);
  assert.ok(get(scriptTrace).some((e) => e.kind === 'error' && /flats/.test(e.message)));
});
