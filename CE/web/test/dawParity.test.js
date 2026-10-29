// ce.daw asks the same questions and says the same words in every runtime: the panel view
// (dawCore.js), and the JavaScript, Lua and Python preludes. One list of calls
// (support/dawScenario.mjs) runs through all four against one fake plug-in. The JavaScript prelude's
// copy is also checked to be dawCore.js itself (tools/scripts/gen-daw-prelude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { dawCommands } from '../src/CE_Application/scripting/dawCore.js';
import { CALLS, ANSWERS } from './support/dawScenario.mjs';
import { dawPreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-daw-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const COMMAND_OF = Object.fromEntries(COMMANDS.map(([flat, command]) => [flat, command]));

function extractRawString(file, tag) {
  const source = readFileSync(join(scriptingDir, file), 'utf8').replace(/\r\n/g, '\n');
  const open = `R"${tag}(`;
  const start = source.indexOf(open);
  return source.slice(start + open.length, source.indexOf(`)${tag}"`, start));
}
function findPython3() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return cmd;
  }
  return null;
}
function normal(v) {
  if (Array.isArray(v)) return v.length === 0 ? {} : v.map(normal);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) if (v[key] !== null && v[key] !== undefined) out[key] = normal(v[key]);
    return out;
  }
  return v === undefined ? null : v;
}
/** What the fake plug-in answers, and the line the question writes to the log. */
function answer(fields) {
  const { op, ...rest } = fields;
  const keys = Object.keys(rest).sort().filter((k) => rest[k] !== undefined && rest[k] !== null);
  const line = `ask ${op}${keys.map((k) => ` ${k}=${JSON.stringify(rest[k])}`).join('')}`;
  const a = ANSWERS[op];
  return { line, value: typeof a === 'function' ? a(rest) : JSON.parse(JSON.stringify(a ?? null)) };
}

function reference() {
  let log = [];
  const d = dawCommands({
    say: (level, text) => log.push(`${level}: ${text}`),
    query: (op, fields) => { const a = answer({ ...fields, op }); log.push(a.line); return a.value; },
  });
  return CALLS.map(([flat, args]) => {
    log = [];
    const result = d[COMMAND_OF[flat]](...JSON.parse(JSON.stringify(args)));
    return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), log };
  });
}

function compare(label, results) {
  const want = reference();
  const wrong = [];
  CALLS.forEach(([command, args], i) => {
    const got = results[i] ?? { result: null, log: [] };
    if (JSON.stringify(normal(got.result)) !== JSON.stringify(normal(want[i].result))) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 60)}) gave ${JSON.stringify(got.result)},\n    not ${JSON.stringify(want[i].result)}`);
    }
    if (JSON.stringify(got.log ?? []) !== JSON.stringify(want[i].log)) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 60)}) did and said\n    ${JSON.stringify(got.log)},\n    not ${JSON.stringify(want[i].log)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the reference asks the plug-in, and checks what a script gives it first', () => {
  const r = reference();
  assert.equal(r[0].result.name, 'Bitwig Studio');
  assert.equal(r[2].result.group, 'Osc');
  assert.equal(r[3].result, null, 'a control that is not a DAW parameter: nothing');
  assert.match(r[4].log[0], /^error: ce\.daw\.parameter: path must be/);
  assert.deepEqual(r[7], { result: true, log: ['ask beginGesture path="Cutoff.value"'] });
  assert.deepEqual(r[13].log, ['ask rename name="" path="Cutoff.value"'], 'no name: back to the exported one');
  assert.deepEqual(r[14].log.length, 1, 'a name that is not text is refused before asking');
  assert.deepEqual(r[18].log, ['ask assign name="" path="" slot=1'], 'no path empties the slot');
  for (const i of [20, 21, 22, 23, 24, 25]) assert.equal(r[i].result, false, `#${i} is refused`);
});

test('the JavaScript prelude runs dawCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, dawPreludeBlock(), 'the ce.daw block is stale: node tools/scripts/gen-daw-prelude.mjs --write');
  let log = [];
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    __deviceQuery: (kind, q) => { if (kind !== 'daw') return undefined; const a = answer(q); log.push(a.line); return a.value; },
  });
  const results = CALLS.map(([flat, args]) => {
    log = [];
    const result = sandbox[flat](...JSON.parse(JSON.stringify(args)));
    return { result: result === undefined || result === null ? null : JSON.parse(JSON.stringify(result)), log };
  });
  compare('JavaScript prelude', results);
});

function luaLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{ ${v.map(luaLiteral).join(', ')} }`;
  return `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${luaLiteral(x)}`).join(', ')} }`;
}

test('the Lua prelude does what the panel view does', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on', '__deviceQuery', 'applyDump', 'sendDump', '__nowMs', 'routeMidi']) {
      lua.global.set(name, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    // The fake plug-in answers in JavaScript, as JSON both ways, so its answers are the reference's.
    lua.global.set('__dawAnswer', (json) => JSON.stringify(answer(JSON.parse(json))));
    const calls = CALLS.map(([flat, args], i) =>
      `do __log = {}; local r = ${flat}(${args.map(luaLiteral).join(', ')}); __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`);
    const results = await lua.doString(`
__log = {}
local function say(line) __log[#__log + 1] = line end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
__deviceQuery = function(kind, q)
  if kind ~= "daw" then return nil end
  local a = decodeJson(__dawAnswer(encodeJson(q)))
  say(a.line)
  return a.value
end
__out = {}
${calls.join('\n')}
return __out`);
    const list = Array.isArray(results) ? results : Object.keys(results).sort((a, b) => a - b).map((k) => results[k]);
    compare('Lua prelude', list.map((text) => JSON.parse(text)));
  } finally {
    lua.global.close();
  }
});

test('the Python prelude does what the panel view does', (t) => {
  const python = findPython3();
  if (!python) { t.diagnostic('Python 3 is not on this machine: its answers were not compared'); return; }
  // The fake plug-in's answers to every question the scenario asks, worked out here and handed over.
  const asked = new Map();
  reference();
  const d = dawCommands({ say: () => {}, query: (op, fields) => { const a = answer({ ...fields, op }); asked.set(a.line, a.value); return a.value; } });
  CALLS.forEach(([flat, args]) => d[COMMAND_OF[flat]](...JSON.parse(JSON.stringify(args))));
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
log = []
answers = payload["answers"]
def query(kind, q=None):
    if kind != "daw": return None
    rest = {k: v for k, v in q.items() if k != "op" and v is not None}
    line = "ask " + q["op"] + "".join(" " + k + "=" + json.dumps(rest[k], separators=(",", ":"), ensure_ascii=False) for k in sorted(rest))
    log.append(line)
    return answers.get(line)
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "__deviceQuery": query,
})
out = []
for flat, args in payload["calls"]:
    del log[:]
    r = g[flat](*args)
    out.append({"result": r, "log": list(log)})
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: CALLS, answers: Object.fromEntries(asked) }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});
