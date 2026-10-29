// ce.ci checks a script's call, sends it on and hands back the device's answers the same way in every
// runtime: the panel view (ciCore.js), and the JavaScript, Lua and Python preludes. One fake device
// layer and one list of calls (support/ciScenario.mjs) run through all four. The JavaScript prelude's
// copy is also checked to be ciCore.js itself (tools/scripts/gen-ci-prelude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { ciCommands } from '../src/CE_Application/scripting/ciCore.js';
import { CALLS, DEVICES, PROFILES, FIELD_ORDER } from './support/ciScenario.mjs';
import { ciPreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-ci-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const COMMAND_OF = Object.fromEntries(COMMANDS.map(([flat, command]) => [flat, command]));

function extractRawString(file, tag) {
  const source = readFileSync(join(scriptingDir, file), 'utf8').replace(/\r\n/g, '\n');
  const open = `R"${tag}(`;
  const start = source.indexOf(open);
  const end = source.indexOf(`)${tag}"`, start);
  return source.slice(start + open.length, end);
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

/** The fake device layer: one log line per command, and its answer. */
function fakeLayer() {
  let token = 0;
  const known = new Set();
  const line = (fields) => {
    const parts = [];
    for (const key of FIELD_ORDER) if (fields[key] !== undefined && fields[key] !== null) parts.push(`${key}=${fields[key]}`);
    if (fields.opts && typeof fields.opts === 'object') parts.push(`opts=${Object.keys(fields.opts).sort().join(',')}`);
    if (fields.body !== undefined) parts.push('body');
    return `ci ${parts.join(' ')}`;
  };
  const answer = (fields) => {
    if (fields.op === 'devices') return fields.role === 'aux' ? [] : DEVICES;
    if (fields.op === 'unsubscribe') { const had = known.has(fields.id); known.delete(fields.id); return had; }
    if (fields.muid === 999) return { ok: false, error: 'no MIDI-CI device 999 has answered' };
    if (fields.op === 'profiles' && !fields.ask) return PROFILES;
    if (fields.op === 'setProfile') return true;
    token += 1;
    if (fields.op === 'subscribe') known.add(String(token));
    return { ok: true, token };
  };
  return { line, answer };
}

function reference() {
  let log = [];
  const got = [];
  const waiters = {};
  const layer = fakeLayer();
  const query = (fields) => { log.push(layer.line(fields)); return layer.answer(fields); };
  const ci = ciCommands({
    say: (level, text) => log.push(`${level}: ${text}`), ask: query, query, waiters: () => waiters,
    call: (fn, value) => fn(value),
  });
  const keep = (value) => got.push(value === undefined ? null : JSON.parse(JSON.stringify(value)));
  return CALLS.map(([flat, args]) => {
    log = [];
    let result = null;
    const a = args.map((x) => (x === '__fn' ? keep : x));
    if (flat === '__reply') ci.receive(a[0]);
    else if (flat === '__got') result = got;
    else result = ci[COMMAND_OF[flat]](...a);
    return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), log };
  });
}

function compare(label, results) {
  const want = reference();
  const wrong = [];
  CALLS.forEach(([command, args], i) => {
    const got = results[i] ?? { result: null, log: [] };
    if (JSON.stringify(normal(got.result)) !== JSON.stringify(normal(want[i].result))) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 70)}) gave ${JSON.stringify(got.result)},\n    not ${JSON.stringify(want[i].result)}`);
    }
    if (JSON.stringify(got.log ?? []) !== JSON.stringify(want[i].log)) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 70)}) did and said\n    ${JSON.stringify(got.log)},\n    not ${JSON.stringify(want[i].log)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the reference sends what the design says, and hands back each answer once', () => {
  const r = reference();
  assert.deepEqual(r[0].log, ['ci op=discover role=mainSynth']);
  assert.deepEqual(r[1].log, ['ci op=discover role=aux timeoutMs=500']);
  assert.deepEqual(r[7].log, ['ci op=get muid=7 resource=ProgramList opts=limit,offset,resId,timeoutMs']);
  assert.equal(r[15].result, 7, 'subscribe gives its token as the id');
  assert.match(r[11].log[1], /ce\.ci\.get: no MIDI-CI device 999 has answered, so nothing was sent\./);
  assert.deepEqual(r[r.length - 1].result, [
    [{ muid: 7, model: '02 00' }], { command: 'full', body: [1, 2] }, { command: 'notify' },
    { ok: true, status: 200, body: { name: 'Init' } }, [{ id: '7E 21 09 01 00', address: 'device', enabled: false }],
  ]);
});

test('the JavaScript prelude runs ciCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, ciPreludeBlock(), 'the ce.ci block is stale: node tools/scripts/gen-ci-prelude.mjs --write');
  let log = [];
  const got = [];
  const layer = fakeLayer();
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    __deviceQuery: (kind, fields) => { log.push(layer.line(fields)); return layer.answer(fields); },
  });
  const keep = (value) => got.push(value === undefined ? null : JSON.parse(JSON.stringify(value)));
  const results = CALLS.map(([flat, args]) => {
    log = [];
    let result = null;
    const a = JSON.parse(JSON.stringify(args)).map((x) => (x === '__fn' ? keep : x));
    if (flat === '__reply') sandbox.__ci.receive(a[0]);
    else if (flat === '__got') result = got;
    else result = sandbox[flat](...a);
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
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', '__deviceQuery', 'applyDump', 'sendDump', '__nowMs']) {
      lua.global.set(name, () => {});
    }
    // on() is the host's in Lua: the prelude's "__ciReply" listener is kept here, as the event would reach it.
    await lua.doString(`__listeners = {}\non = function(target, event, fn) __listeners[event] = fn end`);
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    const arg = (x) => (x === '__fn' ? '__keep' : luaLiteral(x));
    const calls = CALLS.map(([flat, args], i) => {
      let call;
      if (flat === '__reply') call = `__listeners["__ciReply"](${luaLiteral(args[0])})`;
      else if (flat === '__got') call = '__GOT';
      else call = `${flat}(${args.map(arg).join(', ')})`;
      return `do __log = {}; local r = ${call}; __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`;
    });
    const results = await lua.doString(`
__log = {}
__GOT = {}
__token = 0
__known = {}
local ORDER = { ${FIELD_ORDER.map((k) => JSON.stringify(k)).join(', ')} }
local function say(line) __log[#__log + 1] = line end
local function show(v)
  if type(v) == "number" and v == math.floor(v) then return string.format("%d", v) end
  return tostring(v)
end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
__deviceQuery = function(kind, f)
  local parts = {}
  for _, key in ipairs(ORDER) do if f[key] ~= nil then parts[#parts + 1] = key .. "=" .. show(f[key]) end end
  if type(f.opts) == "table" then
    local keys = {}
    for k in pairs(f.opts) do keys[#keys + 1] = k end
    table.sort(keys)
    parts[#parts + 1] = "opts=" .. table.concat(keys, ",")
  end
  if f.body ~= nil then parts[#parts + 1] = "body" end
  say("ci " .. table.concat(parts, " "))
  if f.op == "devices" then if f.role == "aux" then return {} end return decodeJson(${JSON.stringify(JSON.stringify(DEVICES))}) end
  if f.op == "unsubscribe" then local had = __known[f.id] == true; __known[f.id] = nil; return had end
  if f.muid == 999 then return { ok = false, error = "no MIDI-CI device 999 has answered" } end
  if f.op == "profiles" and not f.ask then return decodeJson(${JSON.stringify(JSON.stringify(PROFILES))}) end
  if f.op == "setProfile" then return true end
  __token = __token + 1
  if f.op == "subscribe" then __known[string.format("%d", __token)] = true end
  return { ok = true, token = __token }
end
__keep = function(v) __GOT[#__GOT + 1] = decodeJson(encodeJson(v)) end
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
listeners = {}
class _Bridge:
    # on() reaches the host through the bridge: the prelude's "__ciReply" listener is kept here, as
    # the event would reach it.
    def on(self, target, event, fn=None):
        listeners[event] = fn
    def __getattr__(self, name):
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
log = []
got = []
state = {"token": 0, "known": set()}
def show(v):
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v)
def query(kind, f):
    parts = [k + "=" + show(f[k]) for k in payload["order"] if f.get(k) is not None]
    if isinstance(f.get("opts"), dict): parts.append("opts=" + ",".join(sorted(f["opts"].keys())))
    if "body" in f and f["body"] is not None: parts.append("body")
    log.append("ci " + " ".join(parts))
    if f["op"] == "devices": return [] if f.get("role") == "aux" else payload["devices"]
    if f["op"] == "unsubscribe":
        had = f["id"] in state["known"]
        state["known"].discard(f["id"])
        return had
    if f.get("muid") == 999: return {"ok": False, "error": "no MIDI-CI device 999 has answered"}
    if f["op"] == "profiles" and not f.get("ask"): return payload["profiles"]
    if f["op"] == "setProfile": return True
    state["token"] += 1
    if f["op"] == "subscribe": state["known"].add(str(state["token"]))
    return {"ok": True, "token": state["token"]}
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "__deviceQuery": query,
})
def keep(v): got.append(json.loads(json.dumps(v)))
out = []
for flat, args in payload["calls"]:
    del log[:]
    a = [keep if x == "__fn" else x for x in args]
    r = None
    if flat == "__reply": listeners["__ciReply"](a[0])
    elif flat == "__got": r = got
    else: r = g[flat](*a)
    out.append({"result": r, "log": list(log)})
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: CALLS, devices: DEVICES, profiles: PROFILES, order: FIELD_ORDER }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});
