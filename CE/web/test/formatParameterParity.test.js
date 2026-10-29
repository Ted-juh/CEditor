// ce.format.parameter writes a parameter as its device profile describes it, the same in every
// runtime. One table (support/formatParameterCases.mjs) runs through the panel view's
// formatDescribed and through formatParameter in the JavaScript, Lua and Python preludes, with the
// host's parameter query (__deviceQuery) answering from the table's descriptions. The panel view's
// own lookup is checked separately, through a parameter a script declares.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { get } from 'svelte/store';

import { formatDescribed } from '../src/CE_Application/scripting/formatCore.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { PARAMETERS, PARAMETER_CASES } from './support/formatParameterCases.mjs';

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
function compare(label, results) {
  const wrong = PARAMETER_CASES
    .map(([id, v, opts, want], i) => [id, v, opts, want, results[i]])
    .filter(([, , , want, got]) => got !== want)
    .map(([id, v, opts, want, got]) => `parameter(${JSON.stringify(id)}, ${JSON.stringify(v)}${opts ? `, ${JSON.stringify(opts)}` : ''}) gave ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}
const lookup = (id) => PARAMETERS[id] ?? null;

test('the panel view writes each parameter as the table says', () => {
  const said = [];
  compare('panel view', PARAMETER_CASES.map(([id, v, opts]) => {
    const desc = lookup(id);
    return desc ? formatDescribed(desc, v, opts ?? undefined, (level, text) => said.push(`${level}: ${text}`)) : '--';
  }));
  assert.ok(said.includes('warn: ce.format.table: 9 is past the end of the table, so "--" is shown.'));
});

test('the panel view looks the parameter up, and says when the profile has none', () => {
  const api = scriptApiForTesting();
  clearScriptTrace();
  api.ce.device.defineParameter('fmtLevel', { name: 'Level', cc: 7, min: 0, max: 127 });
  assert.equal(api.ce.format.parameter('fmtLevel', 64), '64');
  assert.equal(api.ce.format.parameter('noSuchThing', 1), '--');
  const errors = get(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);
  assert.ok(errors.includes('ce.format.parameter: the device profile has no parameter "noSuchThing", so "--" is shown.'), errors.join('\n'));
});

test('the JavaScript prelude writes each parameter as the table says', () => {
  const said = [];
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: (t) => said.push(t), logWarn: (t) => said.push(t) };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  sandbox.logError = (t) => said.push(t);
  sandbox.logWarn = (t) => said.push(t);
  sandbox.__deviceQuery = (kind, payload) => (kind === 'parameter' ? lookup(payload.id) : null);
  compare('JavaScript prelude', PARAMETER_CASES.map(([id, v, opts]) => sandbox.formatParameter(id, v, opts ?? undefined)));
  assert.ok(said.includes('ce.format.parameter: the device profile has no parameter "missing", so "--" is shown.'), said.join('\n'));
});

function luaLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{ ${v.map(luaLiteral).join(', ')} }`;
  return `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${luaLiteral(x)}`).join(', ')} }`;
}

test('the Lua prelude writes each parameter as the table says', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    const said = [];
    for (const name of ['log', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on', '__deviceQuery']) {
      lua.global.set(name, () => {});
    }
    lua.global.set('logError', (t) => { said.push(t); });
    lua.global.set('logWarn', (t) => { said.push(t); });
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    // The descriptions as Lua tables, so the prelude reads them as a real host's answer would arrive.
    const calls = PARAMETER_CASES.map(([id, v, opts], i) =>
      `do local r = formatParameter(${luaLiteral(id)}, ${luaLiteral(v)}, ${luaLiteral(opts)}); if r == nil then r = false end; __out[${i + 1}] = r end`);
    const results = await lua.doString(`__DESCS = ${luaLiteral(PARAMETERS)}
__deviceQuery = function(kind, p) if kind == "parameter" then return __DESCS[p.id] end return nil end
__out = {}
${calls.join('\n')}
return __out`);
    const list = Array.isArray(results) ? results : Object.keys(results).sort((a, b) => a - b).map((k) => results[k]);
    compare('Lua prelude', list.map((r) => (r === false ? null : r)));
    assert.ok(said.includes('ce.format.parameter: the device profile has no parameter "missing", so "--" is shown.'), said.join('\n'));
  } finally {
    lua.global.close();
  }
});

test('the Python prelude writes each parameter as the table says', (t) => {
  const python = findPython3();
  if (!python) { t.diagnostic('Python 3 is not on this machine: its text was not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
said = []
g = {"__name__": "prelude"}
for name in ["log", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
g["logError"] = lambda t: said.append(t)
g["logWarn"] = lambda t: said.append(t)
descs = payload["parameters"]
g["__deviceQuery"] = lambda kind, p=None: descs.get(p["id"]) if kind == "parameter" else None
out = []
for pid, v, opts in payload["cases"]:
    out.append(g["formatParameter"](pid, v, opts))
sys.stdout.write(json.dumps({"out": out, "said": said}))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), parameters: PARAMETERS, cases: PARAMETER_CASES.map(([id, v, opts]) => [id, v, opts]) }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  const { out, said } = JSON.parse(run.stdout);
  compare('Python prelude', out);
  assert.ok(said.includes('ce.format.parameter: the device profile has no parameter "missing", so "--" is shown.'), said.join('\n'));
});
