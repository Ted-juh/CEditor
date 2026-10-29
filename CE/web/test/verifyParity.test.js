// ce.verify gives the same reports, sends the same messages and says the same words in every
// runtime: the panel view (verifyCore.js), and the JavaScript, Lua and Python preludes. One fake
// synth and one list of calls (support/verifyScenario.mjs) run through all four. The JavaScript
// prelude's copy is also checked to be verifyCore.js itself (tools/scripts/gen-verify-prelude.mjs).
//
// Every runtime's host is the same fake: the device queries answer from the scenario, requests wait
// for the scenario to answer them, after() waits for a tick, and what is sent is written to a log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { verifyCommands, verifyDumps, verifyByteWidth, verifySame } from '../src/CE_Application/scripting/verifyCore.js';
import { PARAMETERS, LAYOUT, START, CALLS } from './support/verifyScenario.mjs';
import { verifyPreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-verify-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const FLAT = Object.fromEntries(COMMANDS.map(([flat, command]) => [command, flat]));
const flatCalls = () => CALLS.map(([command, args]) => [command.startsWith('__') ? command : FLAT[command], args]);

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

/** An empty list and an empty table are the same thing in Lua, and a key holding nothing is no key. */
function normal(v) {
  if (Array.isArray(v)) return v.length === 0 ? {} : v.map(normal);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) if (v[key] !== null && v[key] !== undefined) out[key] = normal(v[key]);
    return out;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return 0;
  return v === undefined ? null : v;
}

/** The fake synth, around the panel view's core. */
function reference() {
  const out = [];
  let log = [];
  const known = { ...START };
  const pending = [];
  const queue = [];
  const reports = [];
  let connected = true;
  const host = {
    say: (level, text) => log.push(`${level}: ${text}`),
    parameters: () => PARAMETERS,
    layout: () => LAYOUT,
    read: (id) => known[id],
    write: (id, value) => { log.push(`write ${id}=${JSON.stringify(value)}`); known[id] = value; return true; },
    sendDump: (kind) => { log.push(`sendDump ${kind}`); },
    patchSection: () => null,
    connected: () => connected,
    requestDump: (kind, fn) => { log.push(`request ${kind}`); pending.push(fn); return true; },
    after: (ms, fn) => { log.push(`after ${ms}`); queue.push(fn); },
    clock: () => 0,
    emit: (report) => log.push(`emit ${report.kind}`),
  };
  const v = verifyCommands(host);
  const keep = (report) => { log.push(`fn ${report.kind}`); reports.push(JSON.parse(JSON.stringify(report))); };
  for (const [command, args] of CALLS) {
    log = [];
    let result = null;
    const a = args.map((x) => (x === '__fn' ? keep : x));
    if (command === '__reply') { const fn = pending.shift(); Object.assign(known, a[0]); fn(a[0], { ok: true }); }
    else if (command === '__silence') pending.shift()(undefined, { ok: false });
    else if (command === '__tick') while (queue.length) queue.shift()();
    else if (command === '__move') known[a[0]] = a[1];
    else if (command === '__connected') connected = a[0];
    else if (command === '__last') result = reports[reports.length - 1];
    else if (command === '__summary') result = v.summary(reports[reports.length - 1], a[0] ?? undefined);
    else result = v[command](...a);
    out.push({ result: result === undefined ? null : JSON.parse(JSON.stringify(result)), log });
  }
  return out;
}

function compare(label, results) {
  const want = reference();
  const wrong = [];
  CALLS.forEach(([command, args], i) => {
    const got = results[i] ?? { result: null, log: [] };
    if (JSON.stringify(normal(got.result)) !== JSON.stringify(normal(want[i].result))) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 70)}…) gave ${JSON.stringify(got.result)},\n    not ${JSON.stringify(want[i].result)}`);
    }
    if (JSON.stringify(got.log ?? []) !== JSON.stringify(want[i].log)) {
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 70)}…) did and said\n    ${JSON.stringify(got.log)},\n    not ${JSON.stringify(want[i].log)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('the reference answers what the design says', () => {
  const r = reference();
  const at = (command, n = 0) => {
    let seen = 0;
    for (let i = 0; i < CALLS.length; i += 1) if (CALLS[i][0] === command && seen++ === n) return r[i];
    throw new Error(`no ${command} #${n}`);
  };
  const all = at('coverage').result;
  assert.equal(all.total, 9);
  assert.equal(all.checkable, 7);
  assert.deepEqual(all.unchecked.map((u) => `${u.id}:${u.why}`), ['arpRate:noRequest', 'volume:notInDump']);
  assert.deepEqual(all.dumps.map((d) => [d.kind, d.expectedBytes, d.layoutBytes, JSON.stringify(d.unread)]),
    [['common', 17, 17, '[{"from":9,"to":9}]'], ['fx', 10, 9, '[]'], ['arp', null, 8, '[]']]);
  const checked = at('__last').result;
  assert.deepEqual(checked.matched, ['name', 'level', 'cutoff', 'tune', 'fxOn']);
  assert.deepEqual(checked.differed.map((d) => `${d.id}:${d.expected}>${d.got}`), ['wave:square>saw']);
  assert.deepEqual(checked.unchecked.map((u) => `${u.id}:${u.why}`), ['arpRate:noRequest', 'volume:notInDump', 'fxMix:moved']);
  assert.equal(checked.ok, false);
  assert.equal(at('__summary').result, '5 of 9 match, 1 differ, 3 unchecked (moved)');
  const dumped = at('__last', 1).result;
  assert.deepEqual(dumped.differed.map((d) => `${d.id}:${d.expected}>${d.got}`), ['level:100>102']);
  const probed = at('__last', 7).result;
  assert.deepEqual(probed.probes.map((p) => `${p.value}>${p.got}:${p.same}`), ['saw>saw:true', 'square>square:true', 'pulse>7:false']);
  assert.equal(probed.differed[0].raw, 7);
  assert.equal(probed.restored, true);
});

test('byte widths and dump lengths follow the encodings', () => {
  assert.equal(verifyByteWidth({ type: 'text-ascii', length: 12 }), 12);
  assert.equal(verifyByteWidth({ type: 'text-nibbled-ascii', length: 3 }), 6);
  assert.equal(verifyByteWidth({ type: 'nibbled', nibbles: 4 }), 4);
  assert.equal(verifyByteWidth({ type: 'u14-lsb-msb' }), 2);
  assert.equal(verifyByteWidth(undefined), 1);
  const [common] = verifyDumps(LAYOUT);
  assert.equal(common.request, 'requestCommon');
  assert.equal(common.retries, 1);
  assert.equal(verifySame({ type: 'float', range: { min: 0, max: 1 } }, 0.5, 0.50002), true);
  assert.equal(verifySame({ type: 'float', range: { min: 0, max: 1 } }, 0.5, 0.5001), false);
  assert.equal(verifySame({ type: 'text' }, 'INIT', 'INIT\u0000\u0000'), true);
  assert.equal(verifySame({ type: 'integer' }, 64, null), false);
});

test('the GAIA profile\'s dump lengths add up as its layout says', () => {
  const profile = JSON.parse(readFileSync(join(here, '..', '..', 'profiles', 'test', 'roland-gaia-sh01.ceditor-device.json'), 'utf8'));
  const encodings = {};
  for (const p of profile.parameters) encodings[p.id] = p.encoding;
  const dumps = verifyDumps({ dumps: profile.dumpDefinitions, requests: profile.requests, encodings });
  assert.equal(dumps.length, 26);
  for (const d of dumps) assert.equal(d.layoutBytes, d.expectedBytes, `${d.id}: the layout adds up to ${d.layoutBytes} bytes, the profile says ${d.expectedBytes}`);
});

test('the JavaScript prelude runs verifyCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, verifyPreludeBlock(), 'the ce.verify block is stale: node tools/scripts/gen-verify-prelude.mjs --write');
  let log = [];
  const known = { ...START };
  const pending = [];
  const queue = [];
  const reports = [];
  let connected = true;
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    __deviceQuery: (kind, q) => ({ parameters: PARAMETERS, dumpLayout: LAYOUT, patch: null, read: known[q?.id] })[kind],
    deviceWrite: (id, value) => { log.push(`write ${id}=${JSON.stringify(value)}`); known[id] = value; return true; },
    sendDump: (kind) => { log.push(`sendDump ${kind}`); },
    deviceConnected: () => connected,
    requestDump: (kind, fn) => { log.push(`request ${kind}`); pending.push(fn); return true; },
    after: (ms, fn) => { log.push(`after ${ms}`); queue.push(fn); },
    nowMs: () => 0,
    emit: (name, report) => log.push(`emit ${report.kind}`),
  });
  const keep = (report) => { log.push(`fn ${report.kind}`); reports.push(JSON.parse(JSON.stringify(report))); };
  const results = flatCalls().map(([flat, args]) => {
    log = [];
    let result = null;
    const a = JSON.parse(JSON.stringify(args)).map((x) => (x === '__fn' ? keep : x));
    if (flat === '__reply') { const fn = pending.shift(); Object.assign(known, a[0]); fn(a[0], { ok: true }); }
    else if (flat === '__silence') pending.shift()(undefined, { ok: false });
    else if (flat === '__tick') while (queue.length) queue.shift()();
    else if (flat === '__move') known[a[0]] = a[1];
    else if (flat === '__connected') connected = a[0];
    else if (flat === '__last') result = reports[reports.length - 1];
    else if (flat === '__summary') result = sandbox[FLAT.summary](reports[reports.length - 1], a[0] ?? undefined);
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
    for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on', '__deviceQuery', 'applyDump', 'sendDump', '__nowMs']) {
      lua.global.set(name, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    const arg = (x) => (x === '__fn' ? '__keep' : luaLiteral(x));
    const calls = flatCalls().map(([flat, args], i) => {
      const call = flat === '__summary' ? `${FLAT.summary}(__reports[#__reports], ${arg(args[0])})` : `${flat}(${args.map(arg).join(', ')})`;
      return `do __log = {}; local r = ${call}; __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`;
    });
    const results = await lua.doString(`
__PARAMS = ${luaLiteral(PARAMETERS)}
__LAYOUT = ${luaLiteral(LAYOUT)}
__KNOWN = ${luaLiteral(START)}
__pending, __queue, __reports, __connected = {}, {}, {}, true
__log = {}
local function say(line) __log[#__log + 1] = line end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
__deviceQuery = function(kind, q)
  if kind == "parameters" then return __PARAMS end
  if kind == "dumpLayout" then return __LAYOUT end
  if kind == "read" then return __KNOWN[q.id] end
  return nil
end
deviceWrite = function(id, value) say("write " .. id .. "=" .. encodeJson(value)); __KNOWN[id] = value; return true end
sendDump = function(kind) say("sendDump " .. kind) end
deviceConnected = function() return __connected end
requestDump = function(kind, fn) say("request " .. kind); __pending[#__pending + 1] = fn; return true end
after = function(ms, fn) say("after " .. string.format("%d", ms)); __queue[#__queue + 1] = fn end
nowMs = function() return 0 end
emit = function(name, report) say("emit " .. report.kind) end
__keep = function(report) say("fn " .. report.kind); __reports[#__reports + 1] = decodeJson(encodeJson(report)) end
function __reply(values) local fn = table.remove(__pending, 1); for k, v in pairs(values) do __KNOWN[k] = v end; fn(values, { ok = true }) end
function __silence() local fn = table.remove(__pending, 1); fn(nil, { ok = false }) end
function __tick() while #__queue > 0 do local fn = table.remove(__queue, 1); fn() end end
function __move(id, value) __KNOWN[id] = value end
function __connected_(on) __connected = on end
function __last() return __reports[#__reports] end
__out = {}
${calls.join('\n').replace(/__connected\(/g, '__connected_(')}
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
known = dict(payload["start"])
pending, queue, reports = [], [], []
state = {"connected": True}
def query(kind, q=None):
    if kind == "parameters": return payload["parameters"]
    if kind == "dumpLayout": return payload["layout"]
    if kind == "read": return known.get(q["id"])
    return None
def write(pid, value, role=None):
    log.append("write " + pid + "=" + json.dumps(value, separators=(",", ":")))
    known[pid] = value
    return True
def request(kind, fn, opts=None):
    log.append("request " + kind)
    pending.append(fn)
    return True
def after(ms, fn):
    log.append("after " + str(ms))
    queue.append(fn)
def keep(report):
    log.append("fn " + report["kind"])
    reports.append(json.loads(json.dumps(report)))
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "__deviceQuery": query,
    "deviceWrite": write,
    "sendDump": lambda kind: log.append("sendDump " + kind),
    "deviceConnected": lambda role=None: state["connected"],
    "requestDump": request,
    "after": after,
    "nowMs": lambda: 0,
    "emit": lambda name, report: log.append("emit " + report["kind"]),
})
out = []
for flat, args in payload["calls"]:
    del log[:]
    a = [keep if x == "__fn" else x for x in args]
    r = None
    if flat == "__reply":
        fn = pending.pop(0)
        known.update(a[0])
        fn(a[0], {"ok": True})
    elif flat == "__silence":
        pending.pop(0)(None, {"ok": False})
    elif flat == "__tick":
        while queue: queue.pop(0)()
    elif flat == "__move": known[a[0]] = a[1]
    elif flat == "__connected": state["connected"] = a[0]
    elif flat == "__last": r = reports[-1]
    elif flat == "__summary": r = g[payload["summary"]](reports[-1], a[0])
    else: r = g[flat](*a)
    out.append({"result": r, "log": list(log)})
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({
      prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), parameters: PARAMETERS, layout: LAYOUT, start: START,
      summary: FLAT.summary, calls: flatCalls(),
    }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});
