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
  MODULES, MODULE_BY_ID, MEMBER_MODULE, moduleMemberMap, memberPath,
  MODULE_EXT_ROOT, isExtensionModule, modulesForRuntime, isValueMember,
  MODULE_COST, MODULE_COST_LANGUAGES, resolveModules, modulesUsedBy, panelModules,
  panelModuleCost, costKeyFor, moduleGateMessage, MODULE_CORE, COST_SHARED_KEY,
} from '../src/CE_Application/scripting/panelApi.js';
import { apiSurfaceNames, scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');
const readEngine = (file) => readFileSync(join(scriptingDir, file), 'utf8');

// Names the runtimes bind for their own plumbing. They are not part of the script-facing contract,
// so the "implemented but undeclared" direction ignores them rather than forcing panelApi.js to
// document internals.
// `ce` is the namespace root, not a member: tier 1 (ce.version, ce.has) plus every module hanging
// off it. Its CONTENTS are checked against the manifest below, which is stricter than treating it
// as a declared member would be.
const INTERNAL = new Set(['self', 'ce', '__api', '__deliver', '__ownerPrefix', '__owner', '__global']);

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
function definesName(source, name, { value = false } = {}) {
  const n = escapeRe(name);
  // A VALUE member (`state`) is assigned, not declared — `state = {}` in Lua/Python, `var state = {}`
  // in JS. Matching only function shapes would report it missing from all three engines.
  if (value) return new RegExp(`(?:^|\\n)\\s*(?:var |let |const )?${n}\\s*=`).test(source);
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
      .filter((m) => !definesName(source, m.id, { value: isValueMember(m) }))
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

/* ---------------------------------------------------------------------------------- modules */

test('every member belongs to exactly one module', () => {
  const members = ALL_MEMBERS.filter((m) => m.kind !== 'lifecycle').map((m) => m.id);
  const assigned = Object.keys(MEMBER_MODULE);
  assert.deepEqual(members.filter((id) => !assigned.includes(id)), [], 'members with no module');
  assert.deepEqual(assigned.filter((id) => !members.includes(id)), [], 'assigned but not a member');
  assert.equal(assigned.length, members.length);
});

test('every module a member claims actually exists, and declares its dependencies', () => {
  for (const [memberId, at] of Object.entries(MEMBER_MODULE)) {
    assert.ok(MODULE_BY_ID[at.module], `${memberId} claims unknown module ${at.module}`);
  }
  for (const m of MODULES) {
    for (const dep of m.requires ?? []) {
      assert.ok(MODULE_BY_ID[dep], `${m.id} requires ${dep}, which does not exist`);
    }
    assert.match(m.version, /^\d+\.\d+$/, `${m.id} needs a version`);
  }
});

test('a member is reachable at its module path, and keeps its flat name as an alias', () => {
  const api = scriptApiForTesting();
  for (const [memberId, at] of Object.entries(MEMBER_MODULE)) {
    // Panel-verb stubs and host-dependent members are still bound; only their behaviour differs.
    // memberPath already carries the `ce.` root for a namespaced member, and is a bare name for a
    // ce.core one, so both forms walk from the api object itself.
    const path = memberPath(memberId);
    const viaPath = path.split('.').reduce((node, seg) => (node == null ? node : node[seg]), api);
    assert.notEqual(viaPath, undefined, `${memberId} is not reachable at ${path}`);
    assert.notEqual(api[memberId], undefined, `${memberId} lost its flat alias`);
    assert.equal(viaPath, api[memberId], `${path} and ${memberId} should be the same thing`);
  }
});

test('ce.core is global and nothing else is', () => {
  const global = MODULES.filter((m) => m.global).map((m) => m.id);
  assert.deepEqual(global, ['ce.core'],
    'only the verbs used on every line stay unprefixed; anything else earns its namespace');
});

test('the generated namespace blocks in the C++ engines are up to date', async () => {
  // The engines embed their preludes as string literals and cannot import the contract, so their
  // namespace block is generated. Adding a module and forgetting to regenerate would ship a plugin
  // whose scripts cannot see it — this turns that into a build failure.
  const gen = await import('../../../tools/scripts/gen-script-modules.mjs');
  const blocks = { 'LuaScriptEngine.cpp': gen.luaBlock(), 'JsScriptEngine.cpp': gen.jsBlock(), 'PythonScriptEngine.cpp': gen.pythonBlock() };
  for (const [file, block] of Object.entries(blocks)) {
    assert.ok(readEngine(file).includes(block), `${file} has a stale generated block — run: node tools/scripts/gen-script-modules.mjs --write`);
  }
});

test('no module member name is a keyword in any language we generate for', async () => {
  // `goto` was the one that caught this: legal in JS and Python, a Lua keyword, so both the
  // generated table and the call site ce.components.setlist.goto(...) failed to parse there only.
  const gen = await import('../../../tools/scripts/gen-script-modules.mjs');
  assert.doesNotThrow(() => gen.checkReservedNames());
});

test('third-party modules are namespaced away from ours', () => {
  assert.equal(MODULE_EXT_ROOT, 'ce.ext');
  assert.ok(isExtensionModule('ce.ext.roland_sysex'));
  assert.ok(!isExtensionModule('ce.midi'), 'a first-party module is not an extension');
  for (const m of MODULES) {
    assert.ok(!isExtensionModule(m.id), `${m.id} is built in and must not sit under ${MODULE_EXT_ROOT}`);
  }
});

test('a runtime is only asked for the modules it can actually carry', () => {
  const webview = modulesForRuntime(RUNTIME_WEBVIEW).map((m) => m.id);
  const player = modulesForRuntime(RUNTIME_PLAYER).map((m) => m.id);
  assert.ok(webview.includes('ce.components.setlist'), 'the panel view carries the component modules');
  assert.ok(!player.includes('ce.components.setlist'), 'the window-closed runtime does not');
  assert.ok(player.includes('ce.midi') && player.includes('ce.math'), 'and does carry the cross-runtime ones');
});

/* ------------------------------------------------------- module opt-in, and what it costs */

// Every prelude carries `@module <id>` marker lines. This reads them back so the tests below can
// ask "which module owns this line", which is what makes the cross-module dependency check
// possible at all.
const PRELUDE_SOURCES = [
  { language: 'lua', file: 'LuaScriptEngine.cpp', open: 'R"LUA(', close: ')LUA";' },
  { language: 'javascript', file: 'JsScriptEngine.cpp', open: 'R"JS(', close: ')JS";' },
  { language: 'python', file: 'PythonScriptEngine.cpp', open: 'R"PY(', close: ')PY";' },
];
const MARKER = /^\s*(?:--|\/\/|#)\s*@module\s+(\S+)\s*$/;

// Strip line comments before the scan. A comment that MENTIONS a call is not a call — the header
// of this file makes the point in the other direction (a matcher that accepts a comment would have
// passed the drift this file exists to catch), and a matcher that reports one is the same defect
// facing the other way. Block comments and strings are not handled; that is the standing caveat on
// every text scan here, and over-stripping is the direction that could hide a real call, so the
// patterns are deliberately conservative.
function stripLineComments(line, language) {
  if (language === 'lua') return line.replace(/--.*$/, '');
  if (language === 'python') return line.replace(/#.*$/, '');
  return line.replace(/\/\/.*$/, '');
}

function preludeRegions({ file, open, close, language }) {
  const text = readEngine(file);
  const from = text.indexOf(open);
  const to = text.indexOf(close, from);
  assert.ok(from !== -1 && to !== -1, `could not bound the prelude in ${file}`);

  const regions = new Map();   // marker id -> its source
  let current = '-';
  for (const line of text.slice(from + open.length, to).split('\n')) {
    const m = MARKER.exec(line);
    if (m) { current = m[1]; continue; }
    regions.set(current, (regions.get(current) ?? '') + stripLineComments(line, language) + '\n');
  }
  return regions;
}

test('a prelude region only calls members its module declares a dependency on', () => {
  // The bug this exists for: ce.midi's sendNote(1, "C4", …) resolves the name with noteNumber(),
  // which belongs to ce.music. Gate ce.music away and sendNote reads a stub and sends note 0 —
  // silently. `requires` is the place that has to know, so this walks the actual prelude source
  // and fails if a region reaches outside its module's declared closure.
  const owner = {};   // global name -> owning module id
  for (const [memberId, at] of Object.entries(MEMBER_MODULE)) owner[memberId] = at.module;

  const problems = [];
  for (const source of PRELUDE_SOURCES) {
    for (const [regionId, code] of preludeRegions(source)) {
      if (regionId === '-') continue;                 // shared region owes nothing to anyone
      // A region marked with a GROUP (ce.components) covers several modules; take the closure of
      // all of them, which is the weakest claim the manifest makes about that block.
      const covered = MODULES.map((m) => m.id).filter((id) => id === regionId || id.startsWith(`${regionId}.`));
      if (!covered.length) continue;
      const allowed = new Set(resolveModules(covered).enabled);

      for (const [name, ownerModule] of Object.entries(owner)) {
        if (allowed.has(ownerModule)) continue;
        // A BARE identifier call. `Math.round(...)` and `t:round(...)` reach a method on
        // something else and are not calls to the module's member, so the look-behind excludes
        // them — without it the guard reports a dependency on ce.math for every use of Math.round.
        if (!new RegExp(`(?<![\\w.:])${escapeRe(name)}\\s*\\(`).test(code)) continue;
        problems.push(`${source.language} @module ${regionId} calls ${name}() from ${ownerModule}`
          + ` — add "${ownerModule}" to ${regionId}'s requires`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('every prelude marker names a module we know about, and every module with a prelude is marked', async () => {
  const gen = await import('../../../tools/scripts/gen-script-modules.mjs');
  assert.doesNotThrow(() => gen.checkCostKeys(gen.measureAll()));

  // A module that carries members in a prelude but has no marker would silently bill its bytes to
  // the shared bucket, which is how a cost table stops being true.
  const marked = new Set();
  for (const source of PRELUDE_SOURCES) for (const id of preludeRegions(source).keys()) marked.add(id);
  for (const m of MODULES) {
    if (m.global) continue;                                       // ce.core lives in host bindings
    const key = costKeyFor(m.id);
    assert.ok(key && marked.has(key), `${m.id} has no @module marker in any prelude (billed to "${COST_SHARED_KEY}")`);
  }
});

test('the measured cost table matches what the preludes actually weigh', async () => {
  // MODULE_COST is generated. If a prelude grew and nobody regenerated, the Export tab would show
  // a number that used to be true — which is worse than showing none.
  const gen = await import('../../../tools/scripts/gen-script-modules.mjs');
  const fresh = gen.costFile();
  const committed = readFileSync(
    join(here, '..', 'src', 'CE_Application', 'scripting', 'moduleCost.generated.js'), 'utf8');
  assert.equal(committed, fresh,
    'moduleCost.generated.js is stale — run: node tools/scripts/gen-script-modules.mjs --write');

  for (const m of MODULES) {
    if (m.global) continue;
    const key = costKeyFor(m.id);
    const bytes = MODULE_COST_LANGUAGES.reduce((n, l) => n + (MODULE_COST[key]?.[l] ?? 0), 0);
    assert.ok(bytes > 0, `${m.id} measures as free, which no module is`);
  }
});

test('resolveModules closes over requires and always keeps ce.core', () => {
  const bare = resolveModules([]);
  assert.deepEqual(bare.enabled, [MODULE_CORE], 'declaring nothing still leaves the always-on module');

  const midi = resolveModules(['ce.midi']);
  assert.ok(midi.enabled.includes('ce.music'),
    'ce.midi pulls in ce.music, because sendNote resolves note names with noteNumber');
  assert.ok(midi.added.includes('ce.music'), 'and reports it as pulled in, so the UI can say why');

  const typo = resolveModules(['ce.middi']);
  assert.deepEqual(typo.unknown, ['ce.middi'], 'an unknown id is reported, not silently dropped');
  assert.ok(!typo.enabled.includes('ce.middi'));

  // Manifest order, not declaration order — two panels with the same set produce the same list.
  const a = resolveModules(['ce.storage', 'ce.midi']).enabled;
  const b = resolveModules(['ce.midi', 'ce.storage']).enabled;
  assert.deepEqual(a, b);
});

test('auto-detection reads both spellings of a member', () => {
  assert.deepEqual(modulesUsedBy('function f(){ sendCC(1,74,100); }'), ['ce.midi']);
  assert.deepEqual(modulesUsedBy('function f(){ ce.midi.sendCC(1,74,100); }'), ['ce.midi']);
  assert.deepEqual(modulesUsedBy('local midi = ce.midi'), ['ce.midi'], 'a module taken wholesale counts');
  assert.deepEqual(modulesUsedBy('function f(){ setlistNext("s") }'), ['ce.components.setlist']);
  assert.deepEqual(modulesUsedBy('function f(){ set("a", 1) }'), [],
    'ce.core is never gated, so it is never scanned for');
  assert.deepEqual(modulesUsedBy(''), []);
});

test('a panel with no declaration follows its scripts, and an explicit list is obeyed', () => {
  const scripts = [{ source: 'function onX(){ sendCC(1, 74, 100) }' }];

  const auto = panelModules({ scripts });
  assert.equal(auto.mode, 'auto');
  assert.deepEqual(auto.enabled, ['ce.core', 'ce.midi', 'ce.music']);

  const manual = panelModules({ scripts, scripting: { modules: ['ce.math'] } });
  assert.equal(manual.mode, 'manual');
  assert.deepEqual(manual.enabled, ['ce.core', 'ce.math'],
    'an explicit list is the panel\'s decision, even where it contradicts the scan');

  // An EMPTY explicit list is still explicit — "I want nothing but ce.core" is expressible.
  assert.deepEqual(panelModules({ scripts, scripting: { modules: [] } }).enabled, ['ce.core']);

  // Per-control scripts count too, or a panel that keeps its logic on the controls auto-detects
  // as empty and loses its whole API.
  const onControl = panelModules({
    controls: [{ _children: { Scripts: { scripts: [{ source: 'function onX(){ splitMute(1, true) }' }] } } }],
  });
  assert.ok(onControl.enabled.includes('ce.components.split'));
});

test('the cost of a panel is the sum of what it turned on', () => {
  const cost = panelModuleCost({ scripting: { modules: ['ce.math'] } });
  assert.equal(cost.modules.length, 1, 'ce.core has no prelude of its own — its bytes are shared');
  assert.equal(cost.modules[0].key, 'ce.math');
  assert.ok(cost.total > 0 && cost.total === cost.modules[0].bytes);
  assert.ok(cost.shared > 0, 'the shared baseline is real and is reported separately');
  assert.ok(cost.unused.has('ce.midi'), 'and what declaring less would save is reported too');

  // Component families are billed per family AND share a group. Before phase 7 the five families
  // shared one indivisible hand-written stub block and were billed once for all of them; the stub
  // lists are generated per module now, so each family pays for its own names — and the generic
  // machinery they all go through is still charged once, as `ce.components`.
  const one = panelModuleCost({ scripting: { modules: ['ce.components.split'] } });
  const two = panelModuleCost({ scripting: { modules: ['ce.components.split', 'ce.components.arp'] } });
  assert.ok(two.total > one.total, 'a second family costs more than one — it has its own names');

  const groupOf = (cost) => cost.modules.find((m) => m.key === 'ce.components');
  assert.ok(groupOf(one), 'the shared component machinery is billed');
  assert.equal(groupOf(one).bytes, groupOf(two).bytes,
    'and billed ONCE however many families are on — that is what makes it a group');
  assert.equal(groupOf(two).ids.length, 2, '…while naming every family charged to it');

  // Every component family resolves to a key, so none of them is silently free.
  for (const m of MODULES.filter((x) => x.id.startsWith('ce.components.'))) {
    assert.ok(costKeyFor(m.id), `${m.id} has no cost key`);
  }
});

test('a gated member explains itself in the same words everywhere', () => {
  const msg = moduleGateMessage('sendCC');
  assert.ok(msg.includes('sendCC()'), 'names the member');
  assert.ok(msg.includes('ce.midi'), 'names the module');
  assert.ok(msg.includes('Scripting Modules'), 'says where to turn it on');
  // The same sentence is compiled into the three C++ preludes, via the generator.
  for (const source of PRELUDE_SOURCES) {
    assert.ok(readEngine(source.file).includes('{member}() needs the {module} module'),
      `${source.file} carries the shared gate template`);
  }
});
