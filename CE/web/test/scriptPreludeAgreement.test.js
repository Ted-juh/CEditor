// scriptPreludeAgreement.test.js — the C++ engines' preludes and the WebView runtime have to
// compute the SAME numbers, not merely define the same names.
//
// Name parity (panelApiParity.test.js) would still pass if to7bit packed msb-first in one runtime
// and lsb-first in another, or if checksum used a different polynomial — and a script that packs a
// SysEx value in the editor and unpacks it in the shipped plugin would quietly corrupt the patch.
// So this extracts the Lua and JavaScript preludes from the .cpp sources and RUNS them: Lua under
// wasmoon (the same Lua 5.4 the runtime already embeds), JavaScript under node:vm.
//
// Python is checked by name only — CPython is not available to a node test run. Its prelude is a
// line-by-line transliteration of the same maths, and PythonScriptEngineTests.cpp covers it where
// CPython does exist.

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
  ['noteNumber', ['C3']], ['noteNumber', ['A#4']], ['noteNumber', ['nonsense']],
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
    // panel-verb stubs only call log when invoked.
    lua.global.set('log', () => {});
    lua.global.set('sendCC', () => {});
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
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

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
