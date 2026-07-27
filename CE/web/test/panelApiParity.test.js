// panelApiParity.test.js — the contract in panelApi.js is only a single source of truth if
// something checks that the runtimes obey it. Five of them implement the same API:
//
//   • the WebView runtime      panelRuntime.js            (editor preview + the open plugin window)
//   • the Lua engine           CE/src/Scripting/LuaScriptEngine.cpp
//   • the JS engine            CE/src/Scripting/JsScriptEngine.cpp
//   • the Python engine        CE/src/Scripting/PythonScriptEngine.cpp
//   • the native-handler ABI   CE/src/Scripting/NativeHandlerAbi.h
//
// Before this existed they had drifted: checksum() was documented but implemented nowhere,
// startTimer/stopTimer were implemented but undocumented (and missing from Python), the WebView
// was missing fourteen encoding helpers and spelled a fifteenth differently, on/emit/run were
// silent no-ops there, eight documented events could never fire, and forty-seven panel verbs
// existed in the WebView alone. Each of those is a failure of this file.
//
// The C++ engines are checked by reading their preludes. That is a text scan, and a deliberate
// one: the alternative is compiling Lua, QuickJS and CPython into the JS test run. A name present
// in the prelude but broken is a job for the C++ tests (CE/tests/ScriptRuntimeTests.cpp); a name
// ABSENT is the drift this catches, and absence is exactly what a text scan reads reliably.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ALL_MEMBERS, ALL_EVENTS, ALL_HANDLER_NAMES, LIFECYCLE_HOOKS,
  membersForRuntime, memberNames, memberRuntime,
  WEBVIEW_ONLY_MEMBERS, RUNTIME_ANY, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';
import { apiSurfaceNames } from '../src/CE_Application/scripting/panelRuntime.js';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const readEngine = (file) => readFileSync(join(scriptingDir, file), 'utf8');

// Names the runtimes bind for their own plumbing. They are not part of the script-facing contract,
// so the "implemented but undeclared" direction ignores them rather than forcing panelApi.js to
// document internals.
const INTERNAL = new Set(['self', '__api', '__deliver', '__ownerPrefix', '__owner', '__global']);

/* ------------------------------------------------------------------ the WebView runtime */

test('every cross-runtime member the contract declares is bound by the WebView runtime', () => {
  const bound = new Set(apiSurfaceNames());
  const missing = membersForRuntime(RUNTIME_WEBVIEW)
    .filter((m) => !memberNames(m).some((n) => bound.has(n)))
    .map((m) => m.id);
  assert.deepEqual(missing, [], `declared in panelApi.js but not bound by panelRuntime.js: ${missing.join(', ')}`);
});

test('the WebView runtime binds nothing the contract does not declare', () => {
  const declared = new Set(ALL_MEMBERS.flatMap(memberNames));
  const extra = apiSurfaceNames().filter((n) => !declared.has(n) && !INTERNAL.has(n));
  assert.deepEqual(extra, [], `bound by panelRuntime.js but undeclared in panelApi.js: ${extra.join(', ')}`);
});

test('the WebView runtime probes for every handler name the contract declares', async () => {
  // The executors collect handlers by probing this list; a name missing from it is an event that
  // can never fire, which is how onTimer and the raw-MIDI events went dark.
  const source = readFileSync(join(here, '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'), 'utf8');
  assert.match(source, /const HANDLER_NAMES = ALL_HANDLER_NAMES;/,
    'HANDLER_NAMES must come from panelApi.js, never from a local copy');
  assert.equal(new Set(ALL_HANDLER_NAMES).size, ALL_HANDLER_NAMES.length, 'handler names must be unique');
});

/* --------------------------------------------------------------------- the C++ engines */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A member counts as implemented only if it appears as an actual DEFINITION: a prelude function,
// or a host binding. Deliberately not "the name appears somewhere" — every one of these names is
// also written in a comment nearby, and a matcher that accepts a comment would have passed the
// whole drift this file exists to catch.
function definesName(source, name) {
  const n = escapeRe(name);
  return new RegExp(
    `function\\s+${n}\\s*\\(`            // Lua / JS prelude
    + `|def\\s+${n}\\s*\\(`              // Python prelude
    + `|set_function\\s*\\(\\s*"${n}"`   // Lua host binding
    + `|setMethod\\s*\\(\\s*"${n}"`      // JS host binding
    + `|\\{\\s*"${n}"\\s*,`,             // Python PyMethodDef
  ).test(source);
}

// The webview-only verbs are defined by iterating a name list, so "implemented" means "listed in
// that block" — scoped to the block so a passing mention elsewhere in the file cannot satisfy it.
function webviewStubList(source, file) {
  const m = /WEBVIEW_ONLY\s*(?:=|\[|\{)([\s\S]*?)(?:\]|\})\s*;?\s*\n/.exec(source);
  assert.ok(m, `could not find the webview-only stub list in ${file}`);
  return new Set([...m[1].matchAll(/"([A-Za-z_]\w*)"/g)].map((x) => x[1]));
}

for (const [label, file] of [
  ['Lua', 'LuaScriptEngine.cpp'],
  ['JavaScript', 'JsScriptEngine.cpp'],
  ['Python', 'PythonScriptEngine.cpp'],
]) {
  test(`the ${label} engine implements every cross-runtime member`, () => {
    const source = readEngine(file);
    const missing = membersForRuntime(RUNTIME_ANY)
      .filter((m) => !definesName(source, m.id))
      .map((m) => m.id);
    assert.deepEqual(missing, [], `declared in panelApi.js but absent from ${file}: ${missing.join(', ')}`);
  });

  test(`the ${label} engine defines the panel verbs as window-closed stubs`, () => {
    // Not implemented — explained. The components live in the panel view, so the honest thing is a
    // name that says why it did nothing, rather than an undefined global.
    const listed = webviewStubList(readEngine(file), file);
    const missing = WEBVIEW_ONLY_MEMBERS.filter((id) => !listed.has(id));
    assert.deepEqual(missing, [], `panel verbs with no stub in ${file}: ${missing.join(', ')}`);
    const extra = [...listed].filter((id) => !WEBVIEW_ONLY_MEMBERS.includes(id));
    assert.deepEqual(extra, [], `stubbed in ${file} but not declared webview-only: ${extra.join(', ')}`);
  });
}

/* ------------------------------------------------------------------ the native-handler ABI */

test('the native-handler ABI exposes the whole command surface', () => {
  const abi = readEngine('NativeHandlerAbi.h');
  // The ABI is C, so it spells members in snake_case and covers the primitives the other engines
  // build their preludes on top of — the pure helpers are the handler language's own business.
  const required = [
    'set', 'get', 'send_cc', 'send_nrpn', 'send_sysex', 'log', 'emit',
    'request_dump', 'apply_dump', 'send_dump', 'build_dump',
    'run_action', 'start_timer', 'stop_timer', 'begin_transmit', 'end_transmit',
  ];
  const missing = required.filter((n) => !new RegExp(`\\*${n}\\s*\\)`).test(abi));
  assert.deepEqual(missing, [], `absent from CeHostVtable: ${missing.join(', ')}`);
});

test('the native-handler engine fills every vtable slot it declares', () => {
  const abi = readEngine('NativeHandlerAbi.h');
  const engine = readEngine('NativeHandlerEngine.cpp');
  const slots = [...abi.matchAll(/\(CE_CALL\s+\*(\w+)\)/g)].map((m) => m[1]);
  assert.ok(slots.length >= 16, 'expected to find the vtable slots');
  const unfilled = slots.filter((s) => !new RegExp(`vtable\\.${s}\\s*=`).test(engine));
  assert.deepEqual(unfilled, [], `declared in the vtable but never assigned: ${unfilled.join(', ')}`);
});

/* ------------------------------------------------------------------------- the contract */

test('every declared event has a handler name and every handler name is unique', () => {
  for (const e of ALL_EVENTS) {
    assert.match(e.fn, /^on[A-Z]/, `${e.id} needs an onX handler name`);
  }
  const names = [...LIFECYCLE_HOOKS.map((h) => h.id), ...ALL_EVENTS.map((e) => e.fn)];
  assert.deepEqual(names, ALL_HANDLER_NAMES);
});

test('member ids are unique across the whole contract', () => {
  const ids = ALL_MEMBERS.map((m) => m.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate member ids: ${dupes.join(', ')}`);
});

test('every member declares a runtime the parity checks understand', () => {
  const bad = ALL_MEMBERS.filter((m) => ![RUNTIME_ANY, RUNTIME_WEBVIEW].includes(memberRuntime(m)));
  assert.deepEqual(bad.map((m) => m.id), []);
});

test('panel verbs are the only webview-only members, and there are no webview-only helpers', () => {
  // A helper is pure maths; if one ever needs the panel view it has been put in the wrong list.
  const helpers = ALL_MEMBERS.filter((m) => m.kind === 'helper' && memberRuntime(m) === RUNTIME_WEBVIEW);
  assert.deepEqual(helpers.map((m) => m.id), []);
  assert.ok(WEBVIEW_ONLY_MEMBERS.length > 0, 'the panel verbs should be declared webview-only');
});
