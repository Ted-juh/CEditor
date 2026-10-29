// ce.patch gives the same answers, sends the same messages and says the same words in every runtime:
// the panel view (patchCore.js), and the JavaScript, Lua and Python preludes. One fake synth and one
// list of calls (support/patchScenario.mjs) run through all four. The JavaScript prelude's copy is
// also checked to be patchCore.js itself (tools/scripts/gen-patch-prelude.mjs).
//
// Every runtime's host is the same fake: the device queries answer from the scenario's profile, and
// the sends (write, fill, sendDump, setVariable, requestDump) are written to a log, with a value map
// written key by key in sorted order so a Lua table's own order cannot show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { patchCommands } from '../src/CE_Application/scripting/patchCore.js';
import { PROFILE, PARAMETERS, KNOWN, PATCH_SECTION, CALLS } from './support/patchScenario.mjs';
import { patchPreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-patch-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const NOW = '2026-10-27T20:00:00Z';
const FLAT = Object.fromEntries(COMMANDS.map(([flat, command]) => [command, flat]));

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
const valuesText = (values) => Object.keys(values ?? {}).sort().map((k) => `${k}=${JSON.stringify(values[k])}`).join(' ');

/** An empty list and an empty table are the same thing in Lua, so they compare as one. */
function normal(v) {
  if (Array.isArray(v)) return v.length === 0 ? {} : v.map(normal);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = normal(v[key]);
    return out;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return 0;
  return v === undefined ? null : v;
}

/** The reference: the panel view's core over a host that records what it is asked to do. */
function reference() {
  const out = [];
  let log = [];
  const store = {};
  const host = {
    say: (level, text) => log.push(`${level}: ${text}`),
    profile: () => PROFILE,
    parameters: () => PARAMETERS,
    read: (id) => KNOWN[id],
    write: (id, value) => { log.push(`write ${id}=${JSON.stringify(value)}`); return true; },
    fill: (values) => { log.push(`fill ${valuesText(values)}`); return 0; },
    snapshot: () => ({}),
    restore: () => 0,
    requestDump: (kind, fn) => { log.push(`request ${kind}`); fn({}, { ok: true }); return true; },
    sendDump: (kind) => { log.push(`sendDump ${kind}`); },
    setVariable: (name, value) => { log.push(`var ${name}=${JSON.stringify(value)}`); return true; },
    patchSection: () => PATCH_SECTION,
    random: () => 0.5,
    now: () => NOW,
    store: { get: (k) => store[k], set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; }, keys: () => Object.keys(store), remove: (k) => { delete store[k]; return true; } },
  };
  const p = patchCommands(host);
  for (const [command, args] of CALLS) {
    log = [];
    const result = p[command](...args);
    out.push({ result: result === undefined ? null : result, log });
  }
  return out;
}

function compare(label, results) {
  const want = reference();
  const wrong = [];
  CALLS.forEach(([command, args], i) => {
    const got = results[i] ?? { result: null, log: [] };
    if (JSON.stringify(normal(got.result)) !== JSON.stringify(normal(want[i].result))) {
      wrong.push(`${command}(${JSON.stringify(args).slice(1, 70)}…) gave ${JSON.stringify(got.result)},\n    not ${JSON.stringify(want[i].result)}`);
    }
    if (JSON.stringify(got.log ?? []) !== JSON.stringify(want[i].log)) {
      wrong.push(`${command}(${JSON.stringify(args).slice(1, 70)}…) did and said\n    ${JSON.stringify(got.log)},\n    not ${JSON.stringify(want[i].log)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the JavaScript prelude runs patchCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, patchPreludeBlock(), 'the ce.patch block is stale: node tools/scripts/gen-patch-prelude.mjs --write');
  let log = [];
  const store = {};
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    __deviceQuery: (kind, q) => ({ profile: PROFILE, parameters: PARAMETERS, patch: PATCH_SECTION, now: NOW, read: KNOWN[q?.id] })[kind],
    deviceWrite: (id, value) => { log.push(`write ${id}=${JSON.stringify(value)}`); return true; },
    applyDump: (values) => { log.push(`fill ${valuesText(values)}`); return 0; },
    panelSnapshot: () => ({}),
    panelRestore: () => 0,
    requestDump: (kind, fn) => { log.push(`request ${kind}`); fn({}, { ok: true }); return true; },
    sendDump: (kind) => { log.push(`sendDump ${kind}`); },
    deviceSetVariable: (name, value) => { log.push(`var ${name}=${JSON.stringify(value)}`); return true; },
    random: () => 0.5,
    loadSetting: (k) => store[k],
    saveSetting: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; },
    listSettings: () => Object.keys(store),
    forgetSetting: (k) => { delete store[k]; return true; },
  });
  const results = CALLS.map(([command, args]) => {
    log = [];
    const result = sandbox[FLAT[command]](...JSON.parse(JSON.stringify(args)));
    return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), log };
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
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on', '__deviceQuery', 'applyDump', 'sendDump']) {
      lua.global.set(name, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    const calls = CALLS.map(([command, args], i) =>
      `do __log = {}; local r = ${FLAT[command]}(${args.map(luaLiteral).join(', ')}); __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`);
    const results = await lua.doString(`
__PROFILE = ${luaLiteral(PROFILE)}
__PARAMS = ${luaLiteral(PARAMETERS)}
__KNOWN = ${luaLiteral(KNOWN)}
__SECTION = ${luaLiteral(PATCH_SECTION)}
__STORE = {}
__log = {}
local function say(line) __log[#__log + 1] = line end
local function sortedValues(values)
  local keys = {}
  for k in pairs(values or {}) do keys[#keys + 1] = k end
  table.sort(keys)
  local parts = {}
  for i, k in ipairs(keys) do parts[i] = k .. "=" .. encodeJson(values[k]) end
  return table.concat(parts, " ")
end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
__deviceQuery = function(kind, q)
  if kind == "profile" then return __PROFILE end
  if kind == "parameters" then return __PARAMS end
  if kind == "patch" then return __SECTION end
  if kind == "now" then return "${NOW}" end
  if kind == "read" then return __KNOWN[q.id] end
  return nil
end
deviceWrite = function(id, value) say("write " .. id .. "=" .. encodeJson(value)); return true end
applyDump = function(values) say("fill " .. sortedValues(values)); return 0 end
panelSnapshot = function() return {} end
panelRestore = function() return 0 end
requestDump = function(kind, fn) say("request " .. kind); fn({}, { ok = true }); return true end
sendDump = function(kind) say("sendDump " .. kind) end
deviceSetVariable = function(name, value) say("var " .. name .. "=" .. encodeJson(value)); return true end
random = function() return 0.5 end
loadSetting = function(k) return __STORE[k] end
saveSetting = function(k, v) __STORE[k] = decodeJson(encodeJson(v)); return true end
listSettings = function() local keys = {} for k in pairs(__STORE) do keys[#keys + 1] = k end table.sort(keys) return keys end
forgetSetting = function(k) __STORE[k] = nil; return true end
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
store = {}
def values_text(values):
    return " ".join(k + "=" + json.dumps(values[k], separators=(",", ":")) for k in sorted((values or {}).keys()))
def query(kind, q=None):
    if kind == "profile": return payload["profile"]
    if kind == "parameters": return payload["parameters"]
    if kind == "patch": return payload["section"]
    if kind == "now": return payload["now"]
    if kind == "read": return payload["known"].get(q["id"])
    return None
def request(kind, fn, opts=None):
    log.append("request " + kind)
    fn({}, {"ok": True})
    return True
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "__deviceQuery": query,
    "deviceWrite": lambda pid, value, role=None: (log.append("write " + pid + "=" + json.dumps(value, separators=(",", ":"))), True)[1],
    "applyDump": lambda values: (log.append("fill " + values_text(values)), 0)[1],
    "panelSnapshot": lambda: {},
    "panelRestore": lambda values: 0,
    "requestDump": request,
    "sendDump": lambda kind: log.append("sendDump " + kind),
    "deviceSetVariable": lambda name, value, role=None: (log.append("var " + name + "=" + json.dumps(value)), True)[1],
    "random": lambda: 0.5,
    "loadSetting": lambda k: store.get(k),
    "saveSetting": lambda k, v: (store.__setitem__(k, json.loads(json.dumps(v))), True)[1],
    "listSettings": lambda: sorted(store.keys()),
    "forgetSetting": lambda k: (store.pop(k, None), True)[1],
})
out = []
for flat, args in payload["calls"]:
    del log[:]
    r = g[flat](*args)
    out.append({"result": r, "log": list(log)})
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({
      prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), profile: PROFILE, parameters: PARAMETERS, known: KNOWN,
      section: PATCH_SECTION, now: NOW, calls: CALLS.map(([command, args]) => [FLAT[command], args]),
    }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});

test('the same seed draws the same patch, and a call can be made again from its answer', () => {
  const p = patchCommands({
    say: () => {}, profile: () => PROFILE, parameters: () => PARAMETERS, read: (id) => KNOWN[id], write: () => true,
    fill: () => 0, snapshot: () => ({}), restore: () => 0, requestDump: () => false, sendDump: () => {}, setVariable: () => true,
    patchSection: () => PATCH_SECTION, random: () => 0.25, now: () => NOW, store: { get: () => undefined, set: () => true, keys: () => [], remove: () => true },
  });
  assert.deepEqual(p.random({ seed: 42 }), p.random({ seed: 42 }));
  assert.notDeepEqual(p.random({ seed: 42 }).values, p.random({ seed: 43 }).values);
  const morphed = p.morph(p.current(), p.random({ seed: 5 }), 0.5);
  assert.equal(p.equal(morphed, p.morph(p.current(), p.random({ seed: 5 }), 0.5)), true);
});

/* ------------------------------------------------------------------ the profile's patch section */

import { validateProfile } from '../src/CE_Application/generated/dpd/validate.mjs';
import { buildLegacyProfile } from '../src/CE_Application/generated/dpd/emit-legacy-core.mjs';

const DPD = {
  schemaVersion: 1, id: 'probe.patch', version: '1.0.0', kind: 'model', manufacturerId: '7D', deviceId: '10',
  scopes: { patch: { kind: 'patch', parameters: [{ id: 'cutoff', valueType: 'continuous', address: '20' }] } },
  patch: { scopes: [{ id: 'voice', name: 'Voice', dumps: ['common'] }], deliver: 'dump', write: { via: 'dump', dump: 'userVoice' } },
};

test('a profile\'s patch section is checked, and reaches the profile the runtimes read', () => {
  assert.deepEqual(validateProfile(DPD).errors, []);
  const bad = structuredClone(DPD);
  bad.patch = { scopes: [{ id: 'voice' }, { id: 'voice', dumps: 'common' }, {}], deliver: 'sideways', write: { via: 'dump' } };
  const errors = validateProfile(bad).errors.join('\n');
  assert.match(errors, /patch.scopes\[1\]: "voice" is there twice/);
  assert.match(errors, /patch.scopes\[1\].dumps: must be a list of names/);
  assert.match(errors, /patch.scopes\[2\]: needs an id/);
  assert.match(errors, /patch.deliver: bad value sideways/);
  assert.match(errors, /patch.write: via "dump" needs the dump to send/);
  assert.deepEqual(buildLegacyProfile(DPD).patch, DPD.patch);
});
