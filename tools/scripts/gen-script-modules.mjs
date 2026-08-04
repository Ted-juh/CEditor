// gen-script-modules.mjs — emit the `ce.*` module namespace block for each C++ engine prelude.
//
// The module layout lives in ONE place, CE/web/src/CE_Application/scripting/panelApi.js. The WebView
// runtime imports it directly, so it cannot drift. The three C++ engines embed their preludes as
// string literals and cannot import anything, so their namespace block is GENERATED from the same
// contract and committed alongside the hand-written prelude.
//
//   node tools/scripts/gen-script-modules.mjs            # print all three blocks
//   node tools/scripts/gen-script-modules.mjs --write    # splice them into the .cpp files
//   node tools/scripts/gen-script-modules.mjs --check    # exit 1 if a committed block is stale
//
// panelApiParity.test.js runs --check, so a module added to the contract and not regenerated fails
// the build rather than silently missing from the shipped plugin.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const apiPath = join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting', 'panelApi.js');

const { MODULES, moduleMemberMap, MODULE_BY_ID, MODULE_CORE, MODULE_GATE_MESSAGE, CE_API_VERSION,
        ALL_MEMBERS, isValueMember, RUNTIME_ANY, RUNTIME_PLAYER, RUNTIME_WEBVIEW, memberRuntime,
        WEBVIEW_ONLY_MEMBERS, memberModule }
  = await import(`file://${apiPath}`);

const musicPath = join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting', 'musicTheory.js');
const { SCALES, CHORDS, NOTE_SHARP, NOTE_FLAT, FLAT_KEY_PCS, MINOR_SCALE_NAMES,
        QUALITY_SUFFIX, ROMAN, MINOR_QUALITY_NAMES } = await import(`file://${musicPath}`);

const timePath = join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting', 'timeTables.js');
const { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, PPQN, MIN_BPM, MAX_BPM }
  = await import(`file://${timePath}`);

const easingPath = join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting', 'easingTables.js');
const { EASING_BEZIERS } = await import(`file://${easingPath}`);

// The envelope sample count is the WebView runtime's own constant rather than a second copy: the
// two sides sampling a different number of points is exactly the divergence sampling exists to
// avoid. Read from the source text, because importing panelRuntime.js pulls in the whole editor.
// Windows checkouts can carry CRLF line endings (core.autocrlf). Everything here — byte
// measuring, block splicing, freshness comparison — is defined over the LF form the repo is
// authored in, so every read normalizes.
const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const runtimeSrc = readText(join(repo, 'CE', 'web', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'));
const ANIM_SAMPLES = Number(/export const ANIM_SAMPLES = (\d+);/.exec(runtimeSrc)?.[1]);
if (!Number.isFinite(ANIM_SAMPLES)) throw new Error('could not read ANIM_SAMPLES from panelRuntime.js');

export const BEGIN = 'BEGIN GENERATED module namespace';
export const END = 'END GENERATED module namespace';

// The window-closed stub list is generated for the same reason the namespace block is, and became
// worth generating at phase 7: 248 names maintained by hand in three files is 744 chances to
// mistype one, and a mistyped stub is an undefined global in exactly one engine.
export const STUBS_BEGIN = 'BEGIN GENERATED webview-only stubs';
export const STUBS_END = 'END GENERATED webview-only stubs';

// ce.music's interval tables. Generated for a sharper reason than the stub lists: a mistyped NAME
// is a missing global, which fails loudly in one engine. A mistyped INTERVAL is a wrong note — it
// loads fine, runs fine, and the panel is subtly out of key in the export and correct in the
// editor. Twelve scales and twenty chords across four runtimes is not a thing to hand-copy.
export const MUSIC_BEGIN = 'BEGIN GENERATED music tables';
export const MUSIC_END = 'END GENERATED music tables';

// ce.anim's engine lives in ScriptRuntime.cpp as well as in the preludes — it is the host that
// ticks an animation with the panel shut — so the easing control points have to reach C++ CODE and
// not only C++ string literals. Same rule, one more target: four control points that are off by a
// hundredth trace a curve that looks right and is not the Properties panel's.
export const ANIM_BEGIN = 'BEGIN GENERATED animation tables';
export const ANIM_END = 'END GENERATED animation tables';

// A short name has to be a legal member name in EVERY language a prelude is generated for. Lua is
// the strict one: `goto` is a keyword there, so both `{ goto = ... }` and `t.goto(...)` fail to
// parse, while JS and Python would have accepted it. Catching this at generation is the difference
// between a rejected name and a prelude that refuses to load in one engine only.
const RESERVED = {
  lua: new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']),
  javascript: new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
    'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
    'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true',
    'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']),
  python: new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
    'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if',
    'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield']),
};

/** Throw if any short name is a keyword in a language we generate for. */
export function checkReservedNames() {
  const bad = [];
  for (const m of MODULES) {
    for (const short of Object.keys(moduleMemberMap(m.id))) {
      for (const [language, words] of Object.entries(RESERVED)) {
        if (words.has(short)) bad.push(`${m.id}.${short} — "${short}" is a ${language} keyword`);
      }
    }
  }
  if (bad.length) {
    throw new Error('module member names collide with language keywords:\n  ' + bad.join('\n  '));
  }
}

/** { "ce.midi": { shortName: memberId } } for every module, in a stable order. */
function layout() {
  checkReservedNames();
  const out = [];
  for (const m of MODULES) {
    const members = moduleMemberMap(m.id);
    const names = Object.keys(members).sort();
    if (!names.length) continue;
    out.push([m.id, names.map((n) => [n, members[n]])]);
  }
  return out;
}

/** Module ids in manifest order — pairs()/for-in are unordered, and the block must be stable. */
function moduleOrder() {
  return layout().map(([id]) => id);
}

/** { id, version, runtime } per module, for ce.modules. */
function moduleMeta() {
  return layout().map(([id]) => {
    const m = MODULE_BY_ID[id];
    return { id, version: m.version, runtime: m.runtime };
  });
}

// Members that are VALUES, not functions — `state` is the only one today. A gate stub is a
// function that explains itself, which is right for a verb and wrong for a table: replacing
// `state` with a function turns `state.count = 1` into a type error, i.e. exactly the
// unexplained failure gating exists to prevent. Values are left alone and the module still
// reports as disabled through ce.has().
function valueMemberIds() {
  return ALL_MEMBERS.filter((m) => isValueMember(m)).map((m) => m.id);
}

/* ------------------------------------------------------------------------------------ Lua */

export function luaBlock() {
  const entries = layout().map(([id, members]) => {
    const pairs = members.map(([short, global]) => `${luaKey(short)} = ${JSON.stringify(global)}`).join(', ');
    return `  [${JSON.stringify(id)}] = { ${pairs} },`;
  }).join('\n');
  const order = moduleOrder().map((id) => JSON.stringify(id)).join(', ');
  const meta = moduleMeta()
    .map((m) => `  { id = ${JSON.stringify(m.id)}, version = ${JSON.stringify(m.version)}, runtime = ${JSON.stringify(m.runtime)} },`)
    .join('\n');
  const values = valueMemberIds().map((id) => `[${JSON.stringify(id)}] = true`).join(', ');

  return `-- ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
-- on top. ce.core is global: its members are never namespaced, so they appear here only for
-- discoverability (ce.core.set is the same function as set).
local __CE_MODULES = {
${entries}
}
local __CE_ORDER = { ${order} }
local __CE_META = {
${meta}
}
local __CE_VALUES = { ${values} }
local __CE_GATE_MSG = ${JSON.stringify(MODULE_GATE_MESSAGE)}
-- The real implementation of every member, captured before anything is gated, so turning a module
-- back on restores the function rather than leaving the stub in place.
local __CE_REAL = {}

local function __ce_gate(__member, __module)
  return function()
    local __m = string.gsub(__CE_GATE_MSG, "{member}", __member)
    __m = string.gsub(__m, "{module}", __module)
    log(__m)
    -- An explicit "return nil", NOT a bare return: a Lua function with no return statement
    -- yields ZERO values, so tostring(gatedRead()) errors with "value expected" rather than
    -- printing "nil". Void commands never showed it; a gated read shows it on the first call.
    return nil
  end
end

-- __ce_apply_modules(enabled) — enabled is an array of module ids, or nil for "everything on".
-- The host calls this with the panel's resolved list; a member of a module that is not on becomes
-- a stub that names the module instead of a call that quietly works.
function __ce_apply_modules(enabled)
  local __on = nil
  if enabled ~= nil then
    __on = { [${JSON.stringify(MODULE_CORE)}] = true }
    for _, __id in ipairs(enabled) do __on[__id] = true end
  end
  ce = {}
  for _, __path in ipairs(__CE_ORDER) do
    local __live = (__on == nil) or (__on[__path] == true)
    local __node = ce
    for __seg in string.gmatch(string.sub(__path, 4), "[^.]+") do
      __node[__seg] = __node[__seg] or {}
      __node = __node[__seg]
    end
    for __short, __global in pairs(__CE_MODULES[__path]) do
      if __CE_REAL[__global] == nil then __CE_REAL[__global] = _G[__global] end
      local __v = __CE_REAL[__global]
      if (not __live) and (not __CE_VALUES[__global]) then __v = __ce_gate(__global, __path) end
      _G[__global] = __v
      __node[__short] = __v
    end
  end
  ce.version = ${JSON.stringify(CE_API_VERSION)}
  ce.runtime = ${JSON.stringify(RUNTIME_PLAYER)}
  ce.language = "lua"
  ce.modules = {}
  for _, __m in ipairs(__CE_META) do
    if (__on == nil) or (__on[__m.id] == true) then
      ce.modules[#ce.modules + 1] = { id = __m.id, version = __m.version, runtime = __m.runtime }
    end
  end
  ce.has = function(__id)
    for _, __m in ipairs(ce.modules) do
      if __m.id == __id then return __m.runtime == ${JSON.stringify(RUNTIME_ANY)} or __m.runtime == ce.runtime end
    end
    return false
  end
end

-- __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
-- (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
-- prelude first, so its globals already exist by the time this runs; re-applying the gate then
-- treats it exactly like anything else. An extension needs no machinery of its own — that is the
-- whole point of giving it the same shape.
function __ce_register_module(path, members, version, runtime)
  if __CE_MODULES[path] == nil then __CE_ORDER[#__CE_ORDER + 1] = path end
  __CE_MODULES[path] = members
  for _, __m in ipairs(__CE_META) do
    if __m.id == path then __m.version = version; __m.runtime = runtime; return end
  end
  __CE_META[#__CE_META + 1] = { id = path, version = version, runtime = runtime }
end

__ce_apply_modules(nil)
-- ${END}`;
}

// Lua table keys: bare when they are valid identifiers, bracketed otherwise.
function luaKey(name) {
  return /^[A-Za-z_]\w*$/.test(name) ? name : `[${JSON.stringify(name)}]`;
}

/* ----------------------------------------------------------------------------- JavaScript */

export function jsBlock() {
  const entries = layout().map(([id, members]) => {
    const pairs = members.map(([short, global]) => `${JSON.stringify(short)}: ${JSON.stringify(global)}`).join(', ');
    return `  ${JSON.stringify(id)}: { ${pairs} },`;
  }).join('\n');
  const order = JSON.stringify(moduleOrder());
  const meta = JSON.stringify(moduleMeta());
  const values = JSON.stringify(Object.fromEntries(valueMemberIds().map((id) => [id, true])));

  return `// ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
// on top. ce.core is global: its members are never namespaced, so they appear here only for
// discoverability (ce.core.set is the same function as set).
var __CE_MODULES = {
${entries}
};
var __CE_ORDER = ${order};
var __CE_META = ${meta};
var __CE_VALUES = ${values};
var __CE_GATE_MSG = ${JSON.stringify(MODULE_GATE_MESSAGE)};
// The real implementation of every member, captured before anything is gated, so turning a module
// back on restores the function rather than leaving the stub in place.
var __CE_REAL = {};
var ce = {};

function __ce_gate(member, module) {
  return function () {
    log(__CE_GATE_MSG.split("{member}").join(member).split("{module}").join(module));
  };
}

// __ce_apply_modules(enabled) — enabled is an array of module ids, or null for "everything on".
// The host calls this with the panel's resolved list; a member of a module that is not on becomes
// a stub that names the module instead of a call that quietly works.
function __ce_apply_modules(enabled) {
  var __g = (typeof globalThis !== 'undefined') ? globalThis : this;
  var on = null;
  if (enabled !== undefined && enabled !== null) {
    on = {};
    on[${JSON.stringify(MODULE_CORE)}] = true;
    for (var i = 0; i < enabled.length; i++) on[enabled[i]] = true;
  }
  ce = {};
  for (var p = 0; p < __CE_ORDER.length; p++) {
    var path = __CE_ORDER[p];
    var live = (on === null) || (on[path] === true);
    var segs = path.split('.').slice(1);
    var node = ce;
    for (var s = 0; s < segs.length; s++) {
      if (!node[segs[s]]) node[segs[s]] = {};
      node = node[segs[s]];
    }
    var members = __CE_MODULES[path];
    for (var short in members) {
      if (!Object.prototype.hasOwnProperty.call(members, short)) continue;
      var global = members[short];
      if (!Object.prototype.hasOwnProperty.call(__CE_REAL, global)) __CE_REAL[global] = __g[global];
      var v = __CE_REAL[global];
      if (!live && __CE_VALUES[global] !== true) v = __ce_gate(global, path);
      __g[global] = v;
      node[short] = v;
    }
  }
  ce.version = ${JSON.stringify(CE_API_VERSION)};
  ce.runtime = ${JSON.stringify(RUNTIME_PLAYER)};
  ce.language = "javascript";
  ce.modules = [];
  for (var m = 0; m < __CE_META.length; m++) {
    if (on === null || on[__CE_META[m].id] === true) ce.modules.push(__CE_META[m]);
  }
  ce.has = function (id) {
    for (var k = 0; k < ce.modules.length; k++) {
      if (ce.modules[k].id === id) {
        return ce.modules[k].runtime === ${JSON.stringify(RUNTIME_ANY)} || ce.modules[k].runtime === ce.runtime;
      }
    }
    return false;
  };
  __g.ce = ce;
}

// __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
// (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
// prelude first, so its globals already exist by the time this runs; re-applying the gate then
// treats it exactly like anything else.
function __ce_register_module(path, members, version, runtime) {
  if (!Object.prototype.hasOwnProperty.call(__CE_MODULES, path)) __CE_ORDER.push(path);
  __CE_MODULES[path] = members;
  for (var i = 0; i < __CE_META.length; i++) {
    if (__CE_META[i].id === path) { __CE_META[i].version = version; __CE_META[i].runtime = runtime; return; }
  }
  __CE_META.push({ id: path, version: version, runtime: runtime });
}

__ce_apply_modules(null);
// ${END}`;
}

/* --------------------------------------------------------------------------------- Python */

export function pythonBlock() {
  const entries = layout().map(([id, members]) => {
    const pairs = members.map(([short, global]) => `${JSON.stringify(short)}: ${JSON.stringify(global)}`).join(', ');
    return `    ${JSON.stringify(id)}: { ${pairs} },`;
  }).join('\n');
  const order = JSON.stringify(moduleOrder());
  const meta = moduleMeta()
    .map((m) => `    { "id": ${JSON.stringify(m.id)}, "version": ${JSON.stringify(m.version)}, "runtime": ${JSON.stringify(m.runtime)} },`)
    .join('\n');
  const values = valueMemberIds().map((id) => `${JSON.stringify(id)}: True`).join(', ');

  return `# ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
# on top. ce.core is global: its members are never namespaced, so they appear here only for
# discoverability (ce.core.set is the same function as set).
import types as __ce_types
__CE_MODULES = {
${entries}
}
__CE_ORDER = ${order}
__CE_META = [
${meta}
]
__CE_VALUES = { ${values} }
__CE_GATE_MSG = ${JSON.stringify(MODULE_GATE_MESSAGE)}
# The real implementation of every member, captured before anything is gated, so turning a module
# back on restores the function rather than leaving the stub in place.
__CE_REAL = {}
ce = __ce_types.SimpleNamespace()

def __ce_gate(__member, __module):
    def __stub(*args, **kwargs):
        log(__CE_GATE_MSG.replace("{member}", __member).replace("{module}", __module))
    return __stub

# __ce_apply_modules(enabled) — enabled is a list of module ids, or None for "everything on".
# The host calls this with the panel's resolved list; a member of a module that is not on becomes
# a stub that names the module instead of a call that quietly works.
def __ce_apply_modules(enabled):
    global ce
    __g = globals()
    __on = None
    if enabled is not None:
        __on = { ${JSON.stringify(MODULE_CORE)}: True }
        for __id in enabled:
            __on[__id] = True
    ce = __ce_types.SimpleNamespace()
    for __path in __CE_ORDER:
        __live = (__on is None) or (__on.get(__path) is True)
        __node = ce
        for __seg in __path.split(".")[1:]:
            if not hasattr(__node, __seg):
                setattr(__node, __seg, __ce_types.SimpleNamespace())
            __node = getattr(__node, __seg)
        for __short, __global in __CE_MODULES[__path].items():
            if __global not in __CE_REAL:
                __CE_REAL[__global] = __g.get(__global)
            __v = __CE_REAL[__global]
            if (not __live) and (__CE_VALUES.get(__global) is not True):
                __v = __ce_gate(__global, __path)
            __g[__global] = __v
            setattr(__node, __short, __v)
    ce.version = ${JSON.stringify(CE_API_VERSION)}
    ce.runtime = ${JSON.stringify(RUNTIME_PLAYER)}
    ce.language = "python"
    ce.modules = [__m for __m in __CE_META if __on is None or __on.get(__m["id"]) is True]
    def __ce_has(__id):
        for __m in ce.modules:
            if __m["id"] == __id:
                return __m["runtime"] == ${JSON.stringify(RUNTIME_ANY)} or __m["runtime"] == ce.runtime
        return False
    ce.has = __ce_has
    __g["ce"] = ce


# __ce_register_module(path, members, version, runtime) — add an INSTALLED third-party module
# (ce.ext.*) to the same tables the built-in ones live in. The host evaluates the module's own
# prelude first, so its globals already exist by the time this runs; re-applying the gate then
# treats it exactly like anything else.
def __ce_register_module(path, members, version, runtime):
    if path not in __CE_MODULES:
        __CE_ORDER.append(path)
    __CE_MODULES[path] = members
    for __m in __CE_META:
        if __m["id"] == path:
            __m["version"] = version
            __m["runtime"] = runtime
            return
    __CE_META.append({ "id": path, "version": version, "runtime": runtime })

__ce_apply_modules(None)
# ${END}`;
}

/* ----------------------------------------------------------------------- cost measurement */
// §3 of the design doc: "cost is measured, not asserted". Each prelude carries `@module <id>`
// marker lines; everything from one marker to the next belongs to that module. `@module -` marks
// a shared region (the host bindings, the generated block) that no single module pays for.
//
// A marker id that is not a module id — `ce.components` — is a GROUP: the five component families
// share one indivisible stub block in the C++ preludes, and splitting its bytes five ways would be
// invented precision. It is reported under the group key and attributed to the group.

export const COST_SHARED = '-';

// Where each runtime's scripting surface lives, and how far the measurement runs. For the C++
// engines that is the prelude's raw string literal — the rest of the .cpp is host binding code,
// not script surface. For the WebView it is the runtime module itself.
const COST_SOURCES = [
  { language: 'lua', file: 'CE/src/Scripting/LuaScriptEngine.cpp', open: 'R"LUA(', close: ')LUA";' },
  { language: 'javascript', file: 'CE/src/Scripting/JsScriptEngine.cpp', open: 'R"JS(', close: ')JS";' },
  { language: 'python', file: 'CE/src/Scripting/PythonScriptEngine.cpp', open: 'R"PY(', close: ')PY";' },
  { language: 'webview', file: 'CE/web/src/CE_Application/scripting/panelRuntime.js' },
];

const MARKER_RE = /^\s*(?:--|\/\/|#)\s*@module\s+(\S+)\s*$/;

/** Bytes per module id for one source, by walking its `@module` markers. */
export function measureSource({ file, open, close }) {
  let text = readText(join(repo, file));
  if (open) {
    const from = text.indexOf(open);
    const to = text.indexOf(close, from);
    if (from === -1 || to === -1) throw new Error(`could not bound the prelude in ${file}`);
    text = text.slice(from + open.length, to);
  }

  const bytes = {};
  let current = COST_SHARED;
  for (const line of text.split('\n')) {
    const marker = MARKER_RE.exec(line);
    if (marker) { current = marker[1]; continue; }   // the marker line itself costs nobody anything
    bytes[current] = (bytes[current] ?? 0) + Buffer.byteLength(line, 'utf8') + 1;
  }
  return bytes;
}

/** Every marker names a real module, a real group, or the shared bucket. */
export function checkCostKeys(perLanguage) {
  const groups = new Set();
  for (const m of MODULES) {
    const parts = m.id.split('.');
    for (let i = 2; i < parts.length; i++) groups.add(parts.slice(0, i).join('.'));
  }
  const bad = [];
  for (const [language, bytes] of Object.entries(perLanguage)) {
    for (const key of Object.keys(bytes)) {
      if (key === COST_SHARED || MODULE_BY_ID[key] || groups.has(key)) continue;
      bad.push(`${language}: @module ${key} — not a module id or a module group`);
    }
  }
  if (bad.length) throw new Error('prelude cost markers name unknown modules:\n  ' + bad.join('\n  '));
  return true;
}

/** { lua: { 'ce.midi': 3412, ... }, javascript: {...}, ... } */
export function measureAll() {
  const out = {};
  for (const source of COST_SOURCES) out[source.language] = measureSource(source);
  checkCostKeys(out);
  return out;
}

const COST_FILE = 'CE/web/src/CE_Application/scripting/moduleCost.generated.js';

export function costFile() {
  const measured = measureAll();
  const languages = Object.keys(measured).sort();
  const keys = [...new Set(languages.flatMap((l) => Object.keys(measured[l])))].sort();
  const rows = keys.map((key) => {
    const cells = languages
      .map((l) => `${JSON.stringify(l)}: ${measured[l][key] ?? 0}`)
      .join(', ');
    return `  ${JSON.stringify(key)}: { ${cells} },`;
  }).join('\n');

  return `// GENERATED by tools/scripts/gen-script-modules.mjs — do not edit by hand.
//
// Bytes of scripting-surface source per module, per runtime, MEASURED from the preludes rather
// than asserted in the manifest (design doc §3). The regions are delimited by \`@module <id>\`
// marker lines in each prelude; "${COST_SHARED}" is the shared baseline every panel pays — host
// bindings, the event registry, the generated namespace block itself.
//
// "ce.components" is a group: the five component families share one indivisible stub block in the
// C++ preludes, so its bytes are reported once for the group rather than split five ways.
//
// These are SOURCE bytes, not binary delta. The preludes are compiled into the player either way
// today; the number is what the panel's scripting surface weighs, and it is the figure the Export
// tab shows beside the (far larger) Python runtime cost.
export const MODULE_COST = {
${rows}
};

export const MODULE_COST_LANGUAGES = ${JSON.stringify(languages)};
`;
}

/* ------------------------------------------------------------- webview-only stub lists */
// Members declared runtime:'webview' exist in the C++ engines as EXPLAINING STUBS: the panel view
// is where those components are modelled and rendered, so there is nothing to drive with the
// window shut, and a name that says why it did nothing beats an undefined global.
//
// Grouped by owning module so the cost measurement can attribute the bytes: `@module` markers are
// emitted between the groups, and the stub factory itself sits under the shared bucket because no
// single module pays for it.

/** [{ module, names }] in manifest order — the grouping the emitted markers follow. */
function webviewOnlyGroups() {
  // memberModule() returns the WHOLE map (memberId -> { module, name }) rather than one lookup —
  // it is rebuilt per call to fold in the installed extensions, so it is read once here.
  const owners = memberModule();
  const byModule = new Map();
  for (const id of WEBVIEW_ONLY_MEMBERS) {
    const mod = owners[id]?.module ?? MODULE_CORE;
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(id);
  }
  // Manifest order, so the emitted list reads the way the module list does — and so the output is
  // stable: a Map iterated in insertion order would reorder whenever a member moved in panelApi.
  const order = MODULES.map((m) => m.id);
  return [...byModule.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([module, names]) => ({ module, names }));
}

/** Wrap a group's names onto lines of at most ~100 columns, quoted and comma-separated. */
function nameLines(names, indent) {
  const lines = [];
  let line = '';
  for (const name of names) {
    const piece = `"${name}",`;
    if (line && (indent.length + line.length + piece.length) > 100) { lines.push(indent + line); line = ''; }
    line += piece;
  }
  if (line) lines.push(indent + line);
  return lines;
}

const STUB_MESSAGE = '() needs the panel window open — that component is drawn and modelled in the '
  + 'panel view, so there is nothing to drive while the window is closed.';

function stubList(comment, open, close, indent) {
  const out = [];
  for (const { module, names } of webviewOnlyGroups()) {
    out.push(`${comment} @module ${module}`);
    out.push(...nameLines(names, indent));
  }
  return [open, ...out, close].join('\n');
}

export function luaStubBlock() {
  return `-- ${STUBS_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
${stubList('--', 'local WEBVIEW_ONLY = {', '}', '  ')}
-- @module ${COST_SHARED}
for _, name in ipairs(WEBVIEW_ONLY) do
  _G[name] = function()
    log("[panel] " .. name .. "${STUB_MESSAGE}")
    -- An explicit "return nil", NOT a bare return. A Lua function with no return statement yields
    -- ZERO values, so tostring(stub()) raises "value expected" rather than printing "nil". It went
    -- unnoticed while every webview-only member was a void command; ce.panel.create() is the first
    -- one whose RESULT a script reads, and it found it immediately. Same fix as the module gate.
    return nil
  end
end
-- ${STUBS_END}`;
}

export function jsStubBlock() {
  return `// ${STUBS_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
${stubList('//', 'var __WEBVIEW_ONLY = [', '];', '  ')}
// @module ${COST_SHARED}
var __global = (typeof globalThis !== 'undefined') ? globalThis : this;
for (var __i = 0; __i < __WEBVIEW_ONLY.length; __i++) {
  __global[__WEBVIEW_ONLY[__i]] = (function (name) {
    return function () {
      log("[panel] " + name + "${STUB_MESSAGE}");
      // undefined, explicitly — the JS engine has no zero-value hazard, but a stub whose result a
      // script reads has to read as "nothing", the same as the Lua and Python ones.
      return undefined;
    };
  })(__WEBVIEW_ONLY[__i]);
}
// ${STUBS_END}`;
}

export function pythonStubBlock() {
  return `# ${STUBS_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
${stubList('#', '__WEBVIEW_ONLY = [', ']', '  ')}
# @module ${COST_SHARED}
def __webviewOnly(name):
    def stub(*args, **kwargs):
        log("[panel] " + name + "${STUB_MESSAGE}")
        return None
    return stub
for __stubName in __WEBVIEW_ONLY:
    globals()[__stubName] = __webviewOnly(__stubName)
# del, because a module-level loop variable OUTLIVES the loop in Python: this one was called __n
# and shadowed a prelude helper of the same name with the last stub's NAME - a string where a
# function belonged, which fails only when the helper is called, and only in this one engine.
del __stubName
# ${STUBS_END}`;
}

/* --------------------------------------------------------------- ce.music interval tables */
// Emitted as plain maps and lists. The verbs built on top (scaleNotes / chordNotes / quantizeNote /
// degreeChord …) are hand-written per prelude — they are a handful of lines each, and their ANSWERS
// are pinned by tests that run the same fixtures through every engine.
//
// The SPELLING tables joined the interval ones at phase 12, for a milder version of the same
// reason: a mistyped semitone is a wrong note, and a mistyped note NAME is a label that disagrees
// with the Chord Pad drawn next to it. Both are silent, and both are copies of a table the app
// already has — so neither is copied.

const MUSIC_TABLES = [
  { name: '__CE_SCALES', kind: 'map', data: SCALES },
  { name: '__CE_CHORDS', kind: 'map', data: CHORDS },
  { name: '__CE_NOTE_SHARP', kind: 'list', data: NOTE_SHARP },
  { name: '__CE_NOTE_FLAT', kind: 'list', data: NOTE_FLAT },
  { name: '__CE_FLAT_KEYS', kind: 'set', data: FLAT_KEY_PCS },
  { name: '__CE_MINOR_SCALES', kind: 'set', data: MINOR_SCALE_NAMES },
  { name: '__CE_QUALITY_SUFFIX', kind: 'map', data: QUALITY_SUFFIX },
  { name: '__CE_ROMAN', kind: 'list', data: ROMAN },
  { name: '__CE_MINOR_QUALITIES', kind: 'set', data: MINOR_QUALITY_NAMES },
];

// ce.time's division table, emitted the same way and for the same reason: a mistyped fraction is a
// sequencer running at the wrong rate in one runtime, which nothing fails on. `__CE_TIME` carries
// the handful of scalar constants (PPQN, the tempo bounds) so they are one number each rather than
// four copies. The @module marker is emitted with the block, so the cost lands on ce.time.
const TIME_TABLES = [
  { name: '__CE_DIVISIONS', kind: 'map', data: DIVISIONS },
  { name: '__CE_DIVISION_LABELS', kind: 'map', data: DIVISION_LABELS },
  { name: '__CE_DIVISION_NAMES', kind: 'list', data: DIVISION_NAMES },
  { name: '__CE_TIME', kind: 'map', data: { ppqn: PPQN, minBpm: MIN_BPM, maxBpm: MAX_BPM } },
];

// ce.anim's named easings, as cubic-bezier control points. The sharpest version of the reason yet:
// these four numbers per curve are the PROPERTIES PANEL's, a script animating with
// curve = "outCubic" has to trace the same path the panel's CSS transition does, and a control
// point that is off by a hundredth produces a curve that looks right in every runtime and is not
// the panel's.
const EASING_TABLES = [
  { name: '__CE_EASINGS', kind: 'map', data: EASING_BEZIERS },
];

// Non-ASCII is deliberate and load-bearing: ♭ ♯ ° are the characters the panel PRINTS, so a script
// naming a chord has to emit the same bytes. JSON.stringify leaves them literal (it only escapes
// lone surrogates), and all three preludes are UTF-8 raw string literals already.
function musicLiteral(value, language) {
  if (Array.isArray(value)) {
    const items = value.map((v) => musicLiteral(v, language)).join(',');
    return language === 'lua' ? `{${items}}` : `[${items}]`;
  }
  return JSON.stringify(value);
}

/** Assignment lines for a list of tables, in one language. */
function tableRows(tables, language) {
  const TRUE = language === 'python' ? 'True' : 'true';
  const semi = language === 'javascript' ? ';' : '';
  const out = [];
  for (const { name, kind, data } of tables) {
    if (kind === 'list') { out.push(`${name} = ${musicLiteral(data, language)}${semi}`); continue; }
    out.push(language === 'lua' ? `${name} = {}` : `${name} = {}${semi}`);
    const pairs = kind === 'set'
      ? data.map((k) => [k, true])
      : Object.entries(data);
    for (const [k, v] of pairs) {
      const key = `[${JSON.stringify(k)}]`;
      out.push(`${name}${key} = ${kind === 'set' ? TRUE : musicLiteral(v, language)}${semi}`);
    }
  }
  return out;
}

// The block sits INSIDE each prelude's ce.music region, so it has to leave the cost marker where it
// found it: the last thing emitted is a `@module ce.music` line, or every verb written after the
// block would be attributed to ce.time.
export function luaMusicBlock() {
  return `-- ${MUSIC_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- @module ce.music
${tableRows(MUSIC_TABLES, 'lua').join('\n')}
-- @module ce.time
${tableRows(TIME_TABLES, 'lua').join('\n')}
-- @module ce.anim
${tableRows(EASING_TABLES, 'lua').join('\n')}
-- @module ce.music
-- ${MUSIC_END}`;
}

export function jsMusicBlock() {
  const names = [...MUSIC_TABLES, ...TIME_TABLES, ...EASING_TABLES].map((t) => t.name).join(', ');
  return `// ${MUSIC_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// @module ce.music
var ${names};
${tableRows(MUSIC_TABLES, 'javascript').join('\n')}
// @module ce.time
${tableRows(TIME_TABLES, 'javascript').join('\n')}
// @module ce.anim
${tableRows(EASING_TABLES, 'javascript').join('\n')}
// @module ce.music
// ${MUSIC_END}`;
}

export function pythonMusicBlock() {
  return `# ${MUSIC_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# @module ce.music
${tableRows(MUSIC_TABLES, 'python').join('\n')}
# @module ce.time
${tableRows(TIME_TABLES, 'python').join('\n')}
# @module ce.anim
${tableRows(EASING_TABLES, 'python').join('\n')}
# @module ce.music
# ${MUSIC_END}`;
}

/* --------------------------------------------------------- ce.anim tables, for C++ CODE */

export function cppAnimBlock() {
  const rows = Object.entries(EASING_BEZIERS)
    .map(([k, v]) => `    { "${k}", { ${v.map((n) => n.toFixed(6)).join(', ')} } },`)
    .join('\n');
  return `// ${ANIM_BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// The Properties panel's named easings, as the cubic-bezier control points it stores. Generated so
// the host engine, the three preludes and the WebView all animate along ONE set of numbers.
static const std::map<juce::String, std::array<double, 4>>& animEasings()
{
    static const std::map<juce::String, std::array<double, 4>> table = {
${rows}
    };
    return table;
}
// An envelope is sampled into this many segments before it is handed to the engine; the same
// number in every runtime is what makes the sampled shape identical rather than merely similar.
static constexpr int kAnimSamples = ${ANIM_SAMPLES};
// ${ANIM_END}`;
}

/* ------------------------------------------------------------------------------- splicing */

// Two generated regions per engine now: the ce.* namespace block, and the window-closed stub list.
// The stub list has no append fallback — it replaces a region that must already be marked, because
// WHERE it sits matters (the uiDialog override below it depends on running afterwards) and a
// generator that guessed the position would put it somewhere subtly wrong.
const TARGETS = [
  { file: 'CE/src/Scripting/LuaScriptEngine.cpp', block: luaBlock, end: ')LUA";' },
  { file: 'CE/src/Scripting/JsScriptEngine.cpp', block: jsBlock, end: ')JS";' },
  { file: 'CE/src/Scripting/PythonScriptEngine.cpp', block: pythonBlock, end: ')PY";' },
];

const STUB_TARGETS = [
  { file: 'CE/src/Scripting/LuaScriptEngine.cpp', block: luaStubBlock },
  { file: 'CE/src/Scripting/JsScriptEngine.cpp', block: jsStubBlock },
  { file: 'CE/src/Scripting/PythonScriptEngine.cpp', block: pythonStubBlock },
];

const MUSIC_TARGETS = [
  { file: 'CE/src/Scripting/LuaScriptEngine.cpp', block: luaMusicBlock },
  { file: 'CE/src/Scripting/JsScriptEngine.cpp', block: jsMusicBlock },
  { file: 'CE/src/Scripting/PythonScriptEngine.cpp', block: pythonMusicBlock },
];

/** Replace an existing generated block, or append one just before the prelude's closing delimiter. */
function splice(source, block, endDelimiter, begin = BEGIN, end = END) {
  const beginAt = source.indexOf(begin);
  if (beginAt !== -1) {
    // Widen to the whole comment line that opens the block, and to the end of the closing one.
    const lineStart = source.lastIndexOf('\n', beginAt) + 1;
    const endAt = source.indexOf(end, beginAt);
    if (endAt === -1) throw new Error('generated block has no end marker');
    const lineEnd = source.indexOf('\n', endAt);
    return source.slice(0, lineStart) + block + source.slice(lineEnd);
  }
  if (endDelimiter === null) throw new Error(`${begin} region not found — it must already be marked`);
  const closeAt = source.indexOf(endDelimiter);
  if (closeAt === -1) throw new Error(`could not find the prelude delimiter ${endDelimiter}`);
  return `${source.slice(0, closeAt)}\n${block}\n${source.slice(closeAt)}`;
}

const ANIM_TARGET = { file: 'CE/src/Scripting/ScriptRuntime.cpp', block: cppAnimBlock };

function run() {
  const mode = process.argv[2] ?? '--print';
  let stale = 0;

  // The host engine's table. Spliced on its own rather than alongside a prelude, because this one
  // lands in compiled code instead of a string literal.
  {
    const path = join(repo, ANIM_TARGET.file);
    const source = readText(path);
    const next = splice(source, ANIM_TARGET.block(), null, ANIM_BEGIN, ANIM_END);
    if (mode === '--write') {
      if (next !== source) { writeFileSync(path, next); console.log(`wrote ${ANIM_TARGET.file}`); }
      else console.log(`unchanged ${ANIM_TARGET.file}`);
    } else if (mode === '--check') {
      if (next !== source) { console.error(`STALE ${ANIM_TARGET.file} — run: node tools/scripts/gen-script-modules.mjs --write`); stale += 1; }
      else console.log(`ok ${ANIM_TARGET.file}`);
    } else {
      console.log(`\n===== ${ANIM_TARGET.file} =====\n${ANIM_TARGET.block()}`);
    }
  }

  for (const target of TARGETS) {
    const path = join(repo, target.file);
    const source = readText(path);
    const stubs = STUB_TARGETS.find((t) => t.file === target.file);
    const music = MUSIC_TARGETS.find((t) => t.file === target.file);
    const next = splice(
      splice(
        splice(source, music.block(), null, MUSIC_BEGIN, MUSIC_END),
        stubs.block(), null, STUBS_BEGIN, STUBS_END),
      target.block(), target.end);

    if (mode === '--write') {
      if (next !== source) { writeFileSync(path, next); console.log(`wrote ${target.file}`); }
      else console.log(`unchanged ${target.file}`);
    } else if (mode === '--check') {
      if (next !== source) { console.error(`STALE ${target.file} — run: node tools/scripts/gen-script-modules.mjs --write`); stale += 1; }
      else console.log(`ok ${target.file}`);
    } else {
      console.log(`\n===== ${target.file} =====\n${target.block()}`);
    }
  }

  // The measured cost table. Regenerated the same way and for the same reason: a number nobody
  // recomputes is a number that quietly stops being true.
  {
    const path = join(repo, COST_FILE);
    const next = costFile();
    const current = (() => { try { return readText(path); } catch { return null; } })();
    if (mode === '--write') {
      if (next !== current) { writeFileSync(path, next); console.log(`wrote ${COST_FILE}`); }
      else console.log(`unchanged ${COST_FILE}`);
    } else if (mode === '--check') {
      if (next !== current) { console.error(`STALE ${COST_FILE} — run: node tools/scripts/gen-script-modules.mjs --write`); stale += 1; }
      else console.log(`ok ${COST_FILE}`);
    } else {
      console.log(`\n===== ${COST_FILE} =====\n${next}`);
    }
  }

  if (mode === '--check' && stale) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) run();
