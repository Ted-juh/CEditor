// ce.file's byte commands give the same answers and say the same words in every runtime: the panel
// view (fileCore.js), and the JavaScript, Lua and Python preludes. One list of calls
// (support/fileScenario.mjs) runs through all four. The JavaScript prelude's copy is also checked to
// be fileCore.js itself (tools/scripts/gen-file-prelude.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

import { fileCommands } from '../src/CE_Application/scripting/fileCore.js';
import { CALLS, CLOCK, SONG_FILE } from './support/fileScenario.mjs';
import { filePreludeBlock, BEGIN, END, COMMANDS } from '../../../tools/scripts/gen-file-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
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
/** An empty list and an empty table are the same thing in Lua, and a key holding nothing is no key. */
function normal(v) {
  if (Array.isArray(v)) return v.length === 0 ? {} : v.map(normal);
  if (v && typeof v === 'object') {
    const out = {};
    for (const key of Object.keys(v).sort()) if (v[key] !== null && v[key] !== undefined) out[key] = normal(v[key]);
    return out;
  }
  return v === undefined ? null : v;
}

function reference() {
  let log = [];
  const f = fileCommands({ say: (level, text) => log.push(`${level}: ${text}`), clock: () => CLOCK });
  return CALLS.map(([command, args]) => {
    log = [];
    const result = f[command](...JSON.parse(JSON.stringify(args)));
    return { result: result === undefined ? null : result, log };
  });
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
      wrong.push(`#${i} ${command}(${JSON.stringify(args).slice(1, 70)}…) said\n    ${JSON.stringify(got.log)},\n    not ${JSON.stringify(want[i].log)}`);
    }
  });
  assert.deepEqual(wrong, [], `${label}:\n${wrong.join('\n')}`);
}

test('a file read is what was built, and what is written reads back the same', () => {
  const said = [];
  const f = fileCommands({ say: (level, text) => said.push(text), clock: () => CLOCK });
  const song = f.midiRead(SONG_FILE);
  assert.equal(song.tempo, 120);
  assert.deepEqual(song.tempos, [{ beat: 0, bpm: 120 }, { beat: 2, bpm: 100 }]);
  assert.deepEqual(song.timeSignature, [3, 4]);
  assert.deepEqual(song.tracks.map((t) => t.name), ['', 'Bass', 'Bäss', 'Bäss']);
  assert.deepEqual(song.tracks[1].notes, [
    { beat: 0, note: 36, velocity: 100, length: 1, channel: 1 },
    { beat: 0.5, note: 60, velocity: 80, length: 0.5, channel: 1 },
    { beat: 1.5, note: 48, velocity: 112, length: 0.5, channel: 2 },
  ]);
  assert.deepEqual(song.tracks[1].events, [
    { beat: 0, bytes: [0xC0, 5] }, { beat: 1.25, bytes: [0xB0, 7, 100] }, { beat: 1.25, bytes: [0xF0, 0x41, 0x10, 0xF7] },
  ]);
  assert.equal(said.length, 1, 'the note that never ends is named');
  // Written and read again: the same notes, events, tempos, time signature and names.
  const again = f.midiRead(f.midiWrite(song));
  assert.deepEqual(again.tracks.map((t) => [t.name, t.notes, t.events]), song.tracks.map((t) => [t.name, t.notes, t.events]));
  assert.deepEqual([again.tempo, again.tempos, again.timeSignature, again.ticksPerBeat], [song.tempo, song.tempos, song.timeSignature, song.ticksPerBeat]);
  // A recorder's take: places in the loop become beats at its bars.
  const take = f.midiRead(f.midiWrite({ bars: 1, channel: 3, take: { events: [{ t: 0.5, note: 62, velocity: 90, dur: 0.125 }] } }));
  assert.deepEqual(take.tracks[0].notes, [{ beat: 2, note: 62, velocity: 90, length: 0.5, channel: 3 }]);
  assert.deepEqual(f.syxJoin(f.syxSplit([0xF0, 1, 0xF7, 0xF0, 2, 0xF7])), [0xF0, 1, 0xF7, 0xF0, 2, 0xF7]);
});

test('the JavaScript prelude runs fileCore.js itself, and does what the panel view does', () => {
  const engine = readFileSync(join(scriptingDir, 'JsScriptEngine.cpp'), 'utf8').replace(/\r\n/g, '\n');
  const block = engine.slice(engine.indexOf(BEGIN), engine.indexOf(END) + END.length);
  assert.equal(block, filePreludeBlock(), 'the ce.file block is stale: node tools/scripts/gen-file-prelude.mjs --write');
  let log = [];
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  Object.assign(sandbox, {
    logError: (t) => log.push(`error: ${t}`),
    logWarn: (t) => log.push(`warn: ${t}`),
    tempo: () => CLOCK.tempo,
    transportInfo: () => ({ beatsPerBar: CLOCK.beatsPerBar }),
  });
  const results = CALLS.map(([command, args]) => {
    log = [];
    const result = sandbox[FLAT[command]](...JSON.parse(JSON.stringify(args)));
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
    const calls = CALLS.map(([command, args], i) =>
      `do __log = {}; local r = ${FLAT[command]}(${args.map(luaLiteral).join(', ')}); __out[${i + 1}] = encodeJson({ result = r, log = __log }) end`);
    const results = await lua.doString(`
__log = {}
local function say(line) __log[#__log + 1] = line end
logError = function(t) say("error: " .. t) end
logWarn = function(t) say("warn: " .. t) end
tempo = function() return nil end
transportInfo = function() return { beatsPerBar = ${CLOCK.beatsPerBar} } end
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
g.update({
    "logError": lambda t: log.append("error: " + t),
    "logWarn": lambda t: log.append("warn: " + t),
    "tempo": lambda: None,
    "transportInfo": lambda: {"beatsPerBar": payload["beatsPerBar"]},
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
      prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), beatsPerBar: CLOCK.beatsPerBar,
      calls: CALLS.map(([command, args]) => [FLAT[command], args]),
    }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  compare('Python prelude', JSON.parse(run.stdout));
});
