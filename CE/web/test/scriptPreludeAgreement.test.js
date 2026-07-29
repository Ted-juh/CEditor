// scriptPreludeAgreement.test.js — the C++ engines' preludes and the WebView runtime have to
// compute the SAME numbers, not merely define the same names.
//
// Name parity (panelApiParity.test.js) would still pass if to7bit packed msb-first in one runtime
// and lsb-first in another, or if checksum used a different polynomial — and a script that packs a
// SysEx value in the editor and unpacks it in the shipped plugin would quietly corrupt the patch.
// So this extracts each prelude from its .cpp source and RUNS it: Lua under wasmoon (the same Lua
// 5.4 the runtime embeds), JavaScript under node:vm, Python under python3 when the machine has one.
//
// Python was checked by NAME only until phase 12, on the grounds that CPython is not guaranteed in
// a node test run. The grounds were real; the conclusion was too weak. Where python3 IS present the
// prelude runs for free, and the first run of it found quantizeNote raising TypeError on every
// call. So it runs when it can and skips with a reason when it cannot, and
// PythonScriptEngineTests.cpp still covers the engine where CPython definitely exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');

function extractRawString(file, tag) {
  const source = readFileSync(join(scriptingDir, file), 'utf8');
  const open = `R"${tag}(`;
  const start = source.indexOf(open);
  assert.notEqual(start, -1, `could not find the ${tag} prelude in ${file}`);
  const end = source.indexOf(`)${tag}"`, start);
  assert.notEqual(end, -1, `unterminated ${tag} prelude in ${file}`);
  return source.slice(start + open.length, end);
}

const web = scriptApiForTesting();

// The cases every runtime must agree on. Each is [helper, args] and gets compared against what the
// WebView runtime returns, since that is the one the editor shows the author.
const CASES = [
  ['clamp', [5, 0, 3]], ['clamp', [-1, 0, 3]], ['clamp', [2, 0, 3]],
  ['round', [2.5]], ['round', [2.4]], ['round', [-2.5]],
  ['scale', [64, 0, 127, 0, 1000]], ['scale', [5, 0, 0, 9, 10]],
  ['snap', [7, 5]], ['snap', [7, 0]],
  ['lerp', [0, 10, 0.25]],
  ['curve', [0.5, 'exp']], ['curve', [0.25, 'log']], ['curve', [0.5, 's']], ['curve', [0.5, 'linear']],
  ['noteName', [60]], ['noteName', [61]], ['noteName', [0]],
  // The panel's spelling, selected by the second argument being PRESENT — so all three states
  // (absent, true, false) are cases, not just the two values.
  ['noteName', [63, true]], ['noteName', [61, false]], ['noteName', [63, false]], ['noteName', [-1, true]],
  ['noteNumber', ['C3']], ['noteNumber', ['A#4']], ['noteNumber', ['nonsense']],
  // Every accidental spelling the panel can print, plus the two that must be REFUSED. "Eb4"
  // returning 0 rather than nothing is how a misspelling used to play C-1 in silence.
  ['noteNumber', ['C♯4']], ['noteNumber', ['Eb4']], ['noteNumber', ['E♭4']],
  ['noteNumber', ['Db-1']], ['noteNumber', ['Cb3']], ['noteNumber', ['Fb4']],
  ['noteNumber', ['B#3']], ['noteNumber', ['H4']], ['noteNumber', ['C']],
  ['noteNumber', [60]],
  ['noteSpelling', [60, 'major']], ['noteSpelling', [60, 'minor']], ['noteSpelling', ['F4', 'major']],
  ['noteSpelling', ['A4', 'minor']], ['noteSpelling', [60]], ['noteSpelling', [60, 'bogus']],
  ['inScale', [62, 60, 'major']], ['inScale', [61, 60, 'major']], ['inScale', [61, 60]],
  ['inScale', [75, 60, 'minor']], ['inScale', [61, 60, 'bogus']],
  ['scaleDegree', [60, 60, 'major']], ['scaleDegree', [67, 60, 'major']],
  ['scaleDegree', [61, 60, 'major']], ['scaleDegree', [70, 60, 'minor']],
  ['scaleDegree', [67, 60, 'bogus']],
  ['chordQuality', [[60, 64, 67]]], ['chordQuality', [[60, 63, 67]]], ['chordQuality', [[60, 63, 70]]],
  ['chordQuality', [[60, 63, 66]]], ['chordQuality', [[60, 63, 66, 69]]], ['chordQuality', [[60, 63, 66, 70]]],
  ['chordQuality', [[60, 64, 68]]], ['chordQuality', [[60, 62, 67]]], ['chordQuality', [[60, 65, 67]]],
  ['chordQuality', [[60, 64, 67, 71]]], ['chordQuality', [[60, 64, 67, 70]]], ['chordQuality', [[60, 63, 67, 71]]],
  // Inverted and out of order — the quality is read from the LOWEST note, so both must still name
  // a chord rather than depending on how the caller happened to build the list.
  ['chordQuality', [[67, 60, 64]]], ['chordQuality', [[]]],
  // ce.time's grid. Divisions first, because every other verb here takes one and a fraction that
  // differs by a runtime is a sequencer running at the wrong rate with nothing failing.
  ['beatsPerDivision', ['1/16']], ['beatsPerDivision', ['1/8T']], ['beatsPerDivision', ['1/4D']],
  ['beatsPerDivision', ['1/1']], ['beatsPerDivision', ['1/32']], ['beatsPerDivision', ['1/3']],
  ['stepAt', [2.5, '1/16']], ['stepAt', [0, '1/16']], ['stepAt', [-1, '1/16']],
  ['stepAt', [2.5, '1/8T']], ['stepAt', [2.5, 'nope']],
  ['swingOffset', [0, 0.5, '1/16']], ['swingOffset', [1, 0.5, '1/16']],
  ['swingOffset', [3, 1, '1/8']], ['swingOffset', [-1, 0.5, '1/16']],
  ['swingOffset', [1, 2, '1/16']], ['swingOffset', [1, 0.5, 'nope']],
  ['tapTempo', [[0, 500, 1000, 1500]]], ['tapTempo', [[0, 500, 5000, 5500]]],
  ['tapTempo', [[1000]]], ['tapTempo', [[]]], ['tapTempo', [[0, 500, 1000], 100]],
  ['tapTempo', [[0, 10]]], ['tapTempo', [[0, 100000]]],
  ['clockTempo', [[20.8, 20.8, 20.8]]], ['clockTempo', [[20, 21, 100, 20]]],
  ['clockTempo', [[]]], ['clockTempo', [[0, -1]]],
  ['from14bit', [1, 0]], ['from14bit', [127, 127]],
  ['from7bit', [[1, 0], 'msb']], ['from7bit', [[1, 0], 'lsb']], ['from7bit', [[1, 0]]],
  ['fromNibbles', [0xA, 0xB]],
  ['fromAscii', [[72, 105]]],
  ['toOffset', [-64, 64]], ['fromOffset', [0, 64]],
  ['toSigned', [-1, 8]], ['fromSigned', [255, 8]], ['fromSigned', [127, 8]],
  ['checksum', ['roland', [0x01, 0x02, 0x03]]],
  ['checksum', ['yamaha', [0x40, 0x11, 0x00, 0x7F, 0x2A]]],
  ['checksum', ['sum', [0x01, 0x02, 0x03]]],
  ['checksum', ['xor', [0x01, 0x02, 0x03]]],
];

// Helpers returning a table/array/object, compared structurally after normalising Lua's 1-based
// tables back to JS arrays.
const STRUCT_CASES = [
  ['to14bit', [16383]], ['to14bit', [128]],
  ['to7bit', [16383, 2, 'msb']], ['to7bit', [128, 2, 'lsb']], ['to7bit', [1, 4, 'msb']],
  // Default arguments too: a default that differs between runtimes is drift a fully-specified
  // call would never reveal.
  ['to7bit', [128]], ['toNibbles', [0x0F]], ['toAscii', ['Hi']],
  ['toNibbles', [0xAB]],
  ['nibblize', [[0xAB, 0xCD]]], ['denibblize', [[0xA, 0xB, 0xC, 0xD]]],
  ['toAscii', ['Hi', 4]],
  ['scaleNotes', [60, 'dorian']], ['scaleNotes', [60]], ['scaleNotes', [60, 'bogus']],
  ['chordNotes', ['C4', 'min7']], ['chordNotes', [60, 'bogus']],
  ['quantizeNote', [61, 60, 'major']], ['quantizeNote', [66, 60, 'major']], ['quantizeNote', [61, 60, 'bogus']],
  // degreeChord returns a whole record — name, roman numeral, spelling and notes — so every field
  // is compared, which is where a per-runtime table lookup would show up.
  ['degreeChord', [60, 'major', 1]], ['degreeChord', [60, 'major', 5]],
  ['degreeChord', [60, 'major', 7]], ['degreeChord', [60, 'major', 5, 4]],
  ['degreeChord', [60, 'minor', 2]], ['degreeChord', [60, 'minor', 6, 4]],
  ['degreeChord', ['F4', 'minor', 4]], ['degreeChord', [60, 'harmonicMinor', 5, 4]],
  ['degreeChord', [60, 'pentatonicMin', 2]],
  // Past the end of the scale, and the argument defaults — 0 and a missing size are where
  // `0 || 3` (3 in JS and Python, 0 in Lua) would have silently disagreed.
  ['degreeChord', [60, 'major', 8]], ['degreeChord', [60, 'major', 0]],
  ['degreeChord', [60, 'major', 3, 0]], ['degreeChord', [60, 'bogus', 1]],
  ['voiceLead', [[60, 64, 67], [59, 62, 67]]],
  ['voiceLead', [[60, 64, 67], [59, 62, 67], 'smooth']],
  ['voiceLead', [[60, 64, 67], [59, 62, 67], 'off']],
  ['voiceLead', [[60, 64, 67], []]],
  ['voiceLead', [[65, 69, 72], [60, 64, 67]]],
  ['voiceLead', [[62, 65, 69, 72], [60, 64, 67]]],
  ['expandOctaves', [[60, 64, 67], 2]], ['expandOctaves', [[67, 60, 64]]],
  ['expandOctaves', [[120, 124], 2]], ['expandOctaves', [[60], 9]],
  ['arpOrder', [[60, 64, 67], 'up']], ['arpOrder', [[60, 64, 67], 'down']],
  ['arpOrder', [[60, 64, 67], 'updown']], ['arpOrder', [[60, 64, 67], 'downup']],
  ['arpOrder', [[60, 64, 67], 'chord']], ['arpOrder', [[60, 64, 67], 'random']],
  ['arpOrder', [[60, 64, 67], 'asPlayed']], ['arpOrder', [[60, 64], 'updown']],
  ['arpOrder', [[60], 'downup']], ['arpOrder', [[], 'up']],
  ['divisionNames', []],
  ['barBeatAt', [0]], ['barBeatAt', [4.5]], ['barBeatAt', [4.5, 3]], ['barBeatAt', [-1]],
  ['barBeatAt', [0.999]], ['barBeatAt', [12.25, 7]],
  ['stepsBetween', [0, 1, '1/16']], ['stepsBetween', [1, 1, '1/16']],
  ['stepsBetween', [0.9, 1.1, '1/4']], ['stepsBetween', [0, 100, '1/16']],
  ['stepsBetween', [0, 100, '1/16', 4]], ['stepsBetween', [0, 100, '1/16', 0]],
  ['stepsBetween', [5, 1, '1/16']], ['stepsBetween', [0, 1, 'nope']],
  ['cycleAt', [0, 1]], ['cycleAt', [6, 1]], ['cycleAt', [6, 1, 3]],
  ['cycleAt', [6, 0]], ['cycleAt', [6, 1000]], ['cycleAt', [-3, 2]],
  ['loopedBeats', [0, 4, 8]], ['loopedBeats', [4, 4, 8]], ['loopedBeats', [13, 4, 8]],
  ['loopedBeats', [20, 4, 8]], ['loopedBeats', [20, 4, 0]],
];

const near = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? Math.abs(a - b) < 1e-9
  : JSON.stringify(a) === JSON.stringify(b));

// A value built inside a vm context (or handed back by wasmoon) carries that realm's
// Object.prototype, and deepStrictEqual compares prototypes — so a structurally identical result
// fails on identity alone. Compare the data, which is all that crosses the language boundary
// anyway.
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

/* ----------------------------------------------------------------------- JavaScript prelude */

test('the JS engine prelude computes what the WebView runtime computes', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  // The prelude wraps a native bridge that does not exist here; only the pure helpers are under
  // test, so stub the bridge and let the rest define itself.
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);

  for (const [fn, args] of CASES) {
    assert.equal(typeof sandbox[fn], 'function', `${fn} missing from the JS prelude`);
    const got = sandbox[fn](...args);
    const want = web[fn](...args);
    assert.ok(near(got, want), `JS prelude ${fn}(${JSON.stringify(args)}) = ${JSON.stringify(got)}, WebView = ${JSON.stringify(want)}`);
  }
  for (const [fn, args] of STRUCT_CASES) {
    assert.deepEqual(plain(sandbox[fn](...args)), plain(web[fn](...args)), `JS prelude ${fn} disagrees`);
  }
});

test('the JS prelude defines the panel verbs as stubs that log rather than throw', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const logged = [];
  // The JS prelude declares its own log() that forwards to the native bridge (Lua takes log as a
  // host binding instead), so the notice has to be captured at __api, not at a sandbox global.
  const sandbox = {
    __api: new Proxy({}, {
      get: (_t, prop) => (prop === 'log' ? (m) => logged.push(String(m)) : () => undefined),
    }),
  };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);
  assert.equal(typeof sandbox.setlistNext, 'function');
  sandbox.setlistNext('Songs');
  assert.equal(logged.length, 1);
  assert.match(logged[0], /setlistNext\(\) needs the panel window open/);
});

/* ------------------------------------------------------------------------------ Lua prelude */

// Lua results come back as ONE string, serialised inside Lua. Marshalling a table per case across
// the wasmoon boundary corrupts its heap after a few dozen crossings (the failure shows up as a nil
// _ENV in an unrelated helper, then a hard "memory access out of bounds") — which would make this
// test flaky in a way that looks like a prelude bug. One crossing, no table marshalling, no flake.
const LUA_SERIALISER = `
local function __ser(v)
  local t = type(v)
  if t == "number" then
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.10g", v)
  elseif t == "string" then return string.format("%q", v)
  elseif t == "boolean" then return tostring(v)
  elseif t == "table" then
    -- An empty Lua table IS an empty list and an empty map at the same time; the language has no
    -- way to tell them apart. Both sides collapse the empty case to "[]" so a real value never
    -- fails on a distinction Lua cannot express.
    if next(v) == nil then return "[]" end
    if #v > 0 then
      local parts = {}
      for i = 1, #v do parts[i] = __ser(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = string.format("%q", k) .. ":" .. __ser(v[k]) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end
`;

test('the Lua engine prelude computes what the WebView runtime computes', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    // sendCC/log are host bindings in the real engine; the pure helpers do not use them, and the
    // panel-verb stubs only call log when invoked. `on` is different: the prelude CALLS it at load
    // time, to register the one listener that drives after(). Leaving it out does not fail the
    // helper being tested — it fails the whole prelude, before any of them are defined.
    lua.global.set('log', () => {});
    lua.global.set('sendCC', () => {});
    lua.global.set('on', () => {});
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    const all = [...CASES, ...STRUCT_CASES];
    const calls = all.map(([fn, args]) => `__ser(${fn}(${args.map(luaLiteral).join(', ')}))`);
    const chunk = `${LUA_SERIALISER}\nreturn table.concat({${calls.join(',\n')}}, "\\n")`;
    const got = String(await lua.doString(chunk)).split('\n');

    assert.equal(got.length, all.length, 'expected one serialised result per case');
    all.forEach(([fn, args], i) => {
      const want = canonical(web[fn](...args));
      assert.equal(got[i], want,
        `Lua prelude ${fn}(${JSON.stringify(args)}) = ${got[i]}, WebView = ${want}`);
    });
  } finally {
    lua.global.close();
  }
});

test('the Lua prelude defines the panel verbs as stubs that log rather than error', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    const logged = [];
    lua.global.set('log', (m) => logged.push(String(m)));
    lua.global.set('sendCC', () => {});
    lua.global.set('on', () => {});          // called at load time to arm after()
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    await lua.doString('setlistNext("Songs")');
    assert.equal(logged.length, 1);
    assert.match(logged[0], /setlistNext\(\) needs the panel window open/);
  } finally {
    lua.global.close();
  }
});

test('panic expands to the same CC sequence in the Lua prelude as in the WebView runtime', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    const sent = [];
    lua.global.set('log', () => {});
    lua.global.set('sendCC', (ch, cc, v) => sent.push([ch, cc, v]));
    lua.global.set('on', () => {});          // called at load time to arm after()
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    await lua.doString('panic({ channel = 3 })');
    assert.deepEqual(sent, [[3, 120, 0], [3, 123, 0], [3, 121, 0]],
      'all-sound-off must precede all-notes-off, then reset-all-controllers');

    sent.length = 0;
    await lua.doString('panic({ channel = 3, resetControllers = false })');
    assert.deepEqual(sent, [[3, 120, 0], [3, 123, 0]]);

    sent.length = 0;
    await lua.doString('panic()');
    assert.equal(sent.length, 48, 'no channel given means all sixteen, three messages each');
    assert.deepEqual(sent[0], [1, 120, 0]);
    assert.deepEqual(sent[47], [16, 121, 0]);
  } finally {
    lua.global.close();
  }
});

/* --------------------------------------------------------------------------------- helpers */

function luaLiteral(v) {
  if (Array.isArray(v)) return `{${v.map(luaLiteral).join(', ')}}`;
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

// The JS half of the serialiser above: same key ordering, same number formatting (Lua's "%.10g"
// keeps ten significant digits, so scale()'s 503.937007874… must be cut the same way on both
// sides or the comparison fails on float printing rather than on a real disagreement).
function canonical(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(Number(v.toPrecision(10)));
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v).sort();
  // See __ser: an empty table is both shapes in Lua, so the empty case collapses on both sides.
  if (!keys.length) return '[]';
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

/* --------------------------------------------------------------------------- Python prelude */

// Python used to be checked by NAME only, on the grounds that CPython is not guaranteed in a node
// test run. That grounds is real but the conclusion was too weak: where python3 IS on the box, the
// prelude can be executed for free, and the first run of it found quantizeNote raising TypeError on
// every call — because the prelude defines its own `set(path, value)`, which shadows the builtin
// `set` for the whole namespace, and quantizeNote was calling `set(<generator>)`. That is invisible
// to name parity, invisible to a reading of the code, and shipped.
//
// So: run it when python3 is there, skip with a reason when it is not. PythonScriptEngineTests.cpp
// still covers the engine itself where CPython definitely exists.
const PY_DRIVER = `
import sys, json
# The prelude opens with "import ceditor as __api" — the native bridge. Any object may stand in
# for a module in sys.modules, and none of the pure helpers touch it.
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
# The host binds these before the prelude runs; the prelude CALLS on() at load time to arm after(),
# so leaving them out fails the whole prelude rather than the helper under test.
for name in ["log", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
out = []
for fn, args in payload["cases"]:
    if fn not in g:
        out.append({"missing": fn})
    else:
        try: out.append({"value": g[fn](*args)})
        except Exception as err: out.append({"error": type(err).__name__ + ": " + str(err)})
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;

test('the Python engine prelude computes what the WebView runtime computes', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync('python3', ['-c', 'pass'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    t.skip('python3 is not on this machine — PythonScriptEngineTests.cpp covers the prelude there');
    return;
  }

  const all = [...CASES, ...STRUCT_CASES];
  const run = spawnSync('python3', ['-c', PY_DRIVER], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: all }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);

  const got = JSON.parse(run.stdout);
  assert.equal(got.length, all.length, 'expected one result per case');
  all.forEach(([fn, args], i) => {
    assert.equal(got[i].missing, undefined, `${fn} missing from the Python prelude`);
    assert.equal(got[i].error, undefined,
      `Python prelude ${fn}(${JSON.stringify(args)}) raised ${got[i].error}`);
    // Canonicalise both sides the same way, so this compares VALUES rather than how each language
    // happens to print a float or order a dict's keys.
    assert.equal(canonical(got[i].value ?? null), canonical(web[fn](...args) ?? null),
      `Python prelude ${fn}(${JSON.stringify(args)}) disagrees with the WebView runtime`);
  });
});

/* -------------------------------------------------------------- the generated ce.* namespace */

test('the generated namespace block runs in the JS prelude and reaches the same functions', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }) };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);

  assert.equal(typeof sandbox.ce, 'object', 'ce should exist after the prelude runs');
  assert.equal(sandbox.ce.midi.sendCC, sandbox.sendCC, 'ce.midi.sendCC is the flat sendCC');
  assert.equal(sandbox.ce.math.clamp(5, 0, 3), 3);
  assert.equal(sandbox.ce.midi.checksum('roland', [1, 2, 3]), web.checksum('roland', [1, 2, 3]));
  assert.equal(typeof sandbox.ce.components.setlist.next, 'function', 'the panel-verb stub is namespaced too');
  assert.equal(sandbox.ce.components.setlist.next, sandbox.setlistNext);
  assert.equal(typeof sandbox.ce.core.set, 'function', 'ce.core mirrors the globals for discoverability');
});

test('the generated namespace block runs in the Lua prelude and reaches the same functions', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    // The real engine's installApi() binds the ce.core verbs as host functions BEFORE the prelude
    // runs, so the generated namespace block finds them in _G. Mirror that, or ce.core comes out
    // empty here for a reason that has nothing to do with the block being tested.
    for (const hostBinding of ['set', 'get', 'log', 'on', 'off', 'emit', 'run', 'noTransmit', 'transmit', 'sendCC']) {
      lua.global.set(hostBinding, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    // One crossing, as everywhere else in this file — wasmoon's heap does not survive many.
    // Separator is "|" rather than a newline: escaping a newline through JS template literal ->
    // Lua string literal is one layer of quoting too many, and gets it wrong silently.
    const got = String(await lua.doString(`
      return table.concat({
        tostring(ce ~= nil),
        tostring(ce.midi.sendCC == sendCC),
        tostring(ce.math.clamp(5, 0, 3)),
        tostring(ce.midi.checksum("roland", {1, 2, 3})),
        tostring(type(ce.components.setlist.next)),
        tostring(ce.components.setlist.next == setlistNext),
        tostring(type(ce.core.set)),
      }, "|")`)).split('|');

    assert.equal(got[0], 'true', 'ce should exist after the prelude runs');
    assert.equal(got[1], 'true', 'ce.midi.sendCC is the flat sendCC');
    assert.equal(got[2], '3');
    assert.equal(got[3], String(web.checksum('roland', [1, 2, 3])));
    assert.equal(got[4], 'function', 'the panel-verb stub is namespaced too');
    assert.equal(got[5], 'true');
    assert.equal(got[6], 'function', 'ce.core mirrors the globals for discoverability');
  } finally {
    lua.global.close();
  }
});
