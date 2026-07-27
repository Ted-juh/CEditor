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
  WEBVIEW_ONLY_MEMBERS, RUNTIME_ANY, RUNTIME_WEBVIEW, RUNTIME_PLAYER,
  handlerNamesForRuntime, PANEL_TARGET, PANEL_READONLY_PROPERTIES,
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
  assert.match(source, /const HANDLER_NAMES = handlerNamesForRuntime\(RUNTIME_WEBVIEW\);/,
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
  const bad = ALL_MEMBERS.filter((m) => ![RUNTIME_ANY, RUNTIME_WEBVIEW, RUNTIME_PLAYER].includes(memberRuntime(m)));
  assert.deepEqual(bad.map((m) => m.id), []);
});

/* ------------------------------------------------------- event sources, not just event names */

test('the WebView runtime raises every event it is expected to raise', () => {
  // Name parity got the handlers PROBED for; this checks they can actually FIRE. A declared event
  // with no source is the same defect one step earlier — the probe list is right and nothing ever
  // pushes the event. onDaw* are excluded by their runtime:'player' marker: the editor has no DAW.
  //
  // Two places can raise one: panelRuntime itself, and the preview surface, which calls
  // dispatchInteraction for the transient pointer events (onWheel/onDoubleClick/onPointerMove)
  // that cannot be recovered from a session diff. Both count.
  const sources = [
    join(here, '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'),
    join(here, '..', 'src', 'CE_Application', 'editor', 'PanelPreviewSurface.svelte'),
  ].map((f) => readFileSync(f, 'utf8')).join('\n');

  const missing = handlerNamesForRuntime(RUNTIME_WEBVIEW)
    .filter((name) => !new RegExp(`['\`"]${name}['\`"]`).test(sources));
  assert.deepEqual(missing, [], `declared but nothing raises them: ${missing.join(', ')}`);
});

test('the onDaw hooks are declared player-only rather than pretending to fire everywhere', () => {
  const daw = ALL_MEMBERS.filter((m) => m.id.startsWith('onDaw'));
  assert.ok(daw.length > 0);
  for (const hook of daw) {
    assert.equal(memberRuntime(hook), RUNTIME_PLAYER, `${hook.id} should be runtime:'player'`);
  }
  assert.ok(!handlerNamesForRuntime(RUNTIME_WEBVIEW).includes('onDawSaveState'));
  assert.ok(handlerNamesForRuntime(RUNTIME_PLAYER).includes('onDawSaveState'));
});

/* ------------------------------------------------------------------------------- scope */

test('the only scope-limited members are the ones that genuinely need a component', () => {
  // The Device/MIDI verbs used to declare device/panel/project scope. Enforcing that denied a
  // per-control script the ability to send a CC — the ordinary thing a panel control does — so the
  // list was withdrawn rather than enforced as written. What is left is the panel-component verbs,
  // which need a component to exist: a device script runs at onPanelLoad, before the GUI is there.
  const limited = ALL_MEMBERS.filter((m) => Array.isArray(m.scopes));
  const categories = [...new Set(limited.map((m) => m.category))];
  assert.deepEqual(categories, ['Panel components'],
    `scope-limited members outside the panel verbs: ${limited.filter((m) => m.category !== 'Panel components').map((m) => m.id).join(', ')}`);
});

/* ------------------------------------------------------------------------ the panel itself */

test('both runtimes reserve the same word for the panel document', () => {
  const runtime = readFileSync(join(here, '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'), 'utf8');
  assert.match(runtime, /function isPanelTarget\(name\)/, 'the WebView runtime should reserve it');
  assert.match(readEngine('../Player/PanelValueModel.h'), /isPanelTarget \(const juce::String& name\)/,
    'the value model should reserve it too, or a script addresses the panel window-open only');
  assert.equal(PANEL_TARGET, 'panel');
});

test('the read-only panel properties agree across the contract and both C++ copies', () => {
  // The list appears three times: the contract, the value model's own invariant, and
  // BridgeScriptHost, which owns the message because the WebView explains the refusal and a script
  // must get the same answer from both runtimes. Three copies is two too many to leave unchecked.
  const declared = [...PANEL_READONLY_PROPERTIES].sort();

  const bridge = readEngine('BridgeScriptHost.h');
  const bridgeList = /readOnly\[\] = \{([^}]*)\}/.exec(bridge);
  assert.ok(bridgeList, 'could not find the read-only list in BridgeScriptHost.h');
  assert.deepEqual([...bridgeList[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(), declared,
    'BridgeScriptHost.h disagrees with panelApi.js');

  const model = readEngine('../Player/PanelValueModel.h');
  const modelBlock = /isPanelReadOnly \(const juce::String& property\)[\s\S]*?\n    \}/.exec(model);
  assert.ok(modelBlock, 'could not find the read-only guard in PanelValueModel.h');
  assert.deepEqual([...modelBlock[0].matchAll(/equalsIgnoreCase \("(\w+)"\)/g)].map((m) => m[1]).sort(), declared,
    'PanelValueModel.h disagrees with panelApi.js');
});

test('`self` in a panel script resolves to the panel in every runtime', () => {
  // SELF has always been documented as "control, panel, or custom-component instance". The panel
  // half never resolved, in any runtime, because the panel was unaddressable.
  const runtime = readFileSync(join(here, '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'), 'utf8');
  assert.match(runtime, /script\?\.scope === 'panel' \? PANEL_TARGET : ''/);
  assert.match(readEngine('ScriptRuntime.h'), /resolveSelfOwner \(const ScriptDefinition& def\)/);
  for (const file of ['LuaScriptEngine.cpp', 'JsScriptEngine.cpp', 'PythonScriptEngine.cpp']) {
    assert.match(readEngine(file), /resolveSelfOwner \(def\)/, `${file} should resolve self through the shared rule`);
  }
});
