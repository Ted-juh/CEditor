// ce.osc checks the same calls, sends the same values with the same types, and runs the same
// functions for a message in every runtime: the panel view (oscCore.js), and the JavaScript, Lua and
// Python preludes. One list of calls (support/oscScenario.mjs) runs through all four against one fake
// transport. The JavaScript prelude's copy is also checked to be oscCore.js itself
// (tools/scripts/gen-osc-prelude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { oscCommands, oscMatches } from '../src/CE_Application/scripting/oscCore.js';
import { CALLS, answer } from './support/oscScenario.mjs';
import { oscPreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-osc-prelude.mjs';

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
/** The line a question to the transport writes. */
const asked = (op, fields) => `ask ${op} ${JSON.stringify(normal(fields))}`;

function reference() {
  let log = [];
  const listeners = [];
  const o = oscCommands({
    say: (level, text) => log.push(`${level}: ${text}`),
    query: (op, fields) => { log.push(asked(op, fields)); return answer(op, fields); },
    listeners: () => listeners,
    call: (fn, value) => fn(value),
  });
  const fnFor = (name) => (m) => log.push(`ran ${name} ${m.address}`);
  return CALLS.map(([flat, args]) => {
    log = [];
    const real = JSON.parse(JSON.stringify(args)).map((a) => (typeof a === 'string' && a.startsWith('fn:') ? fnFor(a.slice(3)) : a));
    const result = flat === '__receive' ? o.receive(real[0]) : o[COMMAND_OF[flat]](...real);
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

test('OSC patterns match as OSC 1.0 says', () => {
  assert.ok(oscMatches('/fader/*', '/fader/12'));
  assert.ok(!oscMatches('/fader/*', '/fader/1/x'), '* stays inside one part');
  assert.ok(oscMatches('/fader/[1-4]', '/fader/3') && !oscMatches('/fader/[1-4]', '/fader/5'));
  assert.ok(oscMatches('/xy/[!0-9]', '/xy/a') && !oscMatches('/xy/[!0-9]', '/xy/1'));
  assert.ok(oscMatches('/{knob,fader}/?', '/knob/5') && !oscMatches('/{knob,fader}/?', '/slider/5'));
  assert.ok(oscMatches('/a*c/x', '/abbc/x') && oscMatches('/a', '/a') && !oscMatches('/a', '/b'));
});

test('the reference checks a call, works out the types, and runs each matching function', () => {
  const r = reference();
  assert.deepEqual(r[0].log, ['ask listen {"network":false,"nextFree":false,"port":8000}']);
  assert.match(r[2].log[0], /^error: ce\.osc\.listen: port must be/);
  assert.deepEqual(r[4], { result: false, log: ['ask listen {"network":false,"nextFree":false,"port":9999}', 'error: ce.osc.listen: port 9999 is in use by another program, so it is not listening.'] });
  assert.deepEqual(r[13].log, ['ran faders /fader/3', 'ran low /fader/3', 'ran either /fader/3'], 'every match runs, in the order made');
  assert.deepEqual(r[14].log, ['ran faders /fader/12']);
  assert.deepEqual(r[18].log, [], 'a message one part longer matches nothing');
  assert.deepEqual(r[21].log, ['ran faders /fader/3', 'ran either /fader/3'], 'after off, that function is gone');
  assert.equal(JSON.parse(r[29].log[0].slice(9)).types, 'fffTFsb'.replace('fff', 'ff'), 'numbers go as f, on/off as T and F, bytes as b');
  assert.equal(r[31].result, false);
  assert.match(r[31].log[0], /value 1 is not a whole number, as type "i" needs/);
});

test('the JavaScript prelude runs oscCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, oscPreludeBlock(), 'the ce.osc block is stale: node tools/scripts/gen-osc-prelude.mjs --write');
  let log = [];
  const listeners = {};
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    __deviceQuery: (kind, q) => { if (kind !== 'osc') return undefined; const { op, ...f } = q; log.push(asked(op, f)); return answer(op, f); },
  });
  vm.runInContext('function __testReceive(m) { __osc.receive(m); }', sandbox);
  const results = CALLS.map(([flat, args]) => {
    log = [];
    const real = JSON.parse(JSON.stringify(args)).map((a) => (typeof a === 'string' && a.startsWith('fn:')
      ? ((name) => (m) => log.push(`ran ${name} ${m.address}`))(a.slice(3)) : a));
    const result = flat === '__receive' ? sandbox.__testReceive(real[0]) : sandbox[flat](...real);
    return { result: result === undefined || result === null ? null : JSON.parse(JSON.stringify(result)), log };
  });
  compare('JavaScript prelude', results);
});

function luaLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  if (typeof v === 'string') return v.startsWith('fn:') ? `__fn(${JSON.stringify(v.slice(3))})` : JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{ ${v.map(luaLiteral).join(', ')} }`;
  return `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${luaLiteral(x)}`).join(', ')} }`;
}

test('the Lua prelude does what the panel view does', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', '__deviceQuery', 'applyDump', 'sendDump', '__nowMs', 'routeMidi']) {
      lua.global.set(name, () => {});
    }
    // The prelude registers its "__oscIn" listener with on(); kept here, to hand it messages.
    await lua.doString('__events = {}; function on(target, event, fn) __events[event] = fn end');
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    lua.global.set('__oscAnswer', (op, json) => JSON.stringify({ line: asked(op, JSON.parse(json)), value: answer(op, JSON.parse(json)) }));
    const calls = CALLS.map(([flat, args], i) => (flat === '__receive'
      ? `do __log = {}; __events["__oscIn"](${luaLiteral(args[0])}); __out[${i + 1}] = encodeJson({ log = __log }) end`
      : `do __log = {}; local r = ${flat}(${args.map(luaLiteral).join(', ')}); __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`));
    const results = await lua.doString(`
__log = {}
local function say(line) __log[#__log + 1] = line end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
function __fn(name) return function(m) say("ran " .. name .. " " .. m.address) end end
__deviceQuery = function(kind, q)
  if kind ~= "osc" then return nil end
  local op = q.op
  q.op = nil
  local a = decodeJson(__oscAnswer(op, encodeJson(q)))
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
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
events = {}
for name in ["log", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
g["on"] = lambda target, event, fn: events.__setitem__(event, fn)
exec(compile(payload["prelude"], "prelude", "exec"), g)
log = []
def normal(v):
    if isinstance(v, list): return {} if len(v) == 0 else [normal(x) for x in v]
    if isinstance(v, dict): return {k: normal(v[k]) for k in sorted(v) if v[k] is not None}
    return v
def answer(op, f):
    if op == "listen": return {"ok": False, "error": "portInUse", "why": "port 9999 is in use by another program"} if f["port"] == 9999 else {"ok": True, "port": f["port"]}
    if op == "stop": return True
    if op == "status": return {"listening": True, "waiting": False, "port": 8000, "network": False, "received": 3, "sent": 2, "dropped": 0}
    if op == "send" and f.get("to") == "refused": return {"ok": False, "error": "refusedByUser", "why": "the user said no to sending OSC to 192.0.2.7"}
    return {"ok": True}
def query(kind, q=None):
    if kind != "osc": return None
    f = {k: v for k, v in q.items() if k != "op"}
    log.append("ask " + q["op"] + " " + json.dumps(normal(f), separators=(",", ":"), ensure_ascii=False))
    return answer(q["op"], f)
def fn(name):
    return lambda m: log.append("ran " + name + " " + m["address"])
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "__deviceQuery": query,
})
out = []
for flat, args in payload["calls"]:
    del log[:]
    real = [fn(a[3:]) if isinstance(a, str) and a.startswith("fn:") else a for a in args]
    if flat == "__receive":
        g["_OSC"]["receive"](real[0])
        r = None
    else:
        r = g[flat](*real)
    out.append({"result": r, "log": list(log)})
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: CALLS }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});
