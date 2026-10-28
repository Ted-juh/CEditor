// ce.mpe plays the same messages and says the same words in every runtime: the panel view
// (mpeCore.js), and the JavaScript, Lua and Python preludes. One list of calls
// (support/mpeScenario.mjs) runs through all four. The JavaScript prelude's copy is also checked to
// be mpeCore.js itself (tools/scripts/gen-mpe-prelude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { mpeCommands } from '../src/CE_Application/scripting/mpeCore.js';
import { CALLS } from './support/mpeScenario.mjs';
import { mpePreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-mpe-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const COMMAND_OF = Object.fromEntries(COMMANDS.map(([flat, command]) => [flat, command]));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

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
const listenLine = (role, opts) => (opts ? `listen ${role || '(every input)'} ${opts.zone} ${opts.members} ${opts.bendRange}` : `listen ${role || '(every input)'} off`);

function reference() {
  let log = [];
  const m = mpeCommands({
    say: (level, text) => log.push(`${level}: ${text}`),
    send: (bytes, role) => log.push(role && role !== 'mainSynth' ? `${role}: ${hex(bytes)}` : hex(bytes)),
    note: (v) => (typeof v === 'string' ? ({ C4: 60 })[v] : (Number.isFinite(v) && v >= 0 && v <= 127 ? Math.floor(v + 0.5) : undefined)),
    listen: (role, opts) => log.push(listenLine(role, opts)),
  });
  return CALLS.map(([flat, args]) => {
    log = [];
    const result = m[COMMAND_OF[flat]](...JSON.parse(JSON.stringify(args)));
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
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 60)}) did and said\n    ${JSON.stringify(got.log).slice(0, 600)},\n    not ${JSON.stringify(want[i].log).slice(0, 600)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the reference plays what MPE asks', () => {
  const r = reference();
  // A first note sets up a lower zone of 15: the MPE Configuration Message, then the bend ranges.
  assert.deepEqual(r[2].log.slice(0, 6), ['B0 65 00', 'B0 64 06', 'B0 06 0F', 'B0 26 00', 'B0 65 7F', 'B0 64 7F']);
  assert.deepEqual(r[2].log.slice(-4), ['E1 00 40', 'B1 4A 40', 'D1 00', '91 3C 64']);
  assert.equal(r[2].result, 1);
  // The second note starts at its own bend (1 semitone of 24), timbre and pressure, before the note.
  assert.deepEqual(r[5].log, ['E2 55 42', 'B2 4A 7F', 'D2 40', '92 3E 5A']);
  // Freed longest ago: channel 2 comes back first. All busy: the oldest note is ended, said once.
  assert.deepEqual(r[8].log.at(-1), '91 41 46');
  assert.match(r[9].log[0], /^warn: ce\.mpe\.noteOn: every member channel is busy/);
  assert.equal(r[10].log.filter((l) => l.startsWith('warn')).length, 0);
  assert.deepEqual(r[11].log, ['E1 7F 7F', 'D1 7F'], 'a bend held to the bend range, pressure to 1');
  assert.equal(r[12].result, false, 'an ended note takes nothing');
  assert.deepEqual(r[12].log, []);
  assert.deepEqual(r[26].log.at(-1), 'aux: 9E 3C 64', 'an upper zone plays from channel 15, on its device');
});

test('the JavaScript prelude runs mpeCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, mpePreludeBlock(), 'the ce.mpe block is stale: node tools/scripts/gen-mpe-prelude.mjs --write');
  let log = [];
  let routed = '';
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    sendMidi: (bytes) => log.push(routed ? `${routed}: ${hex(bytes)}` : hex(bytes)),
    routeMidi: (role, fn) => { routed = role; try { fn(); } finally { routed = ''; } },
    __deviceQuery: (kind, q) => { if (kind === 'mpeListen') log.push(listenLine(q.role, q.opts)); },
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
    const calls = CALLS.map(([flat, args], i) =>
      `do __log = {}; local r = ${flat}(${args.map(luaLiteral).join(', ')}); __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`);
    const results = await lua.doString(`
__log = {}
__routed = ""
local function say(line) __log[#__log + 1] = line end
local function hex(bytes)
  local parts = {}
  for i, b in ipairs(bytes) do parts[i] = string.format("%02X", b) end
  return table.concat(parts, " ")
end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
sendMidi = function(bytes) if __routed ~= "" then say(__routed .. ": " .. hex(bytes)) else say(hex(bytes)) end end
routeMidi = function(role, fn) __routed = role; fn(); __routed = "" end
__deviceQuery = function(kind, q)
  if kind ~= "mpeListen" then return nil end
  local who = (q.role == nil or q.role == "") and "(every input)" or q.role
  if q.opts == nil then say("listen " .. who .. " off")
  else say("listen " .. who .. " " .. q.opts.zone .. " " .. string.format("%d", q.opts.members) .. " " .. string.format("%d", q.opts.bendRange)) end
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
for name in ["log", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
log = []
routed = [""]
def hexs(data): return " ".join("%02X" % b for b in data)
def send_midi(data):
    log.append((routed[0] + ": " + hexs(data)) if routed[0] else hexs(data))
def route(role, fn):
    routed[0] = role
    try: fn()
    finally: routed[0] = ""
def query(kind, q=None):
    if kind != "mpeListen": return None
    who = q["role"] or "(every input)"
    o = q["opts"]
    log.append("listen " + who + " off" if o is None else "listen " + who + " " + o["zone"] + " " + str(int(o["members"])) + " " + str(int(o["bendRange"])))
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "sendMidi": send_midi, "routeMidi": route, "__deviceQuery": query,
})
out = []
for flat, args in payload["calls"]:
    del log[:]
    r = g[flat](*args)
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
