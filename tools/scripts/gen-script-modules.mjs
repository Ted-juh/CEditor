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

const { MODULES, moduleMemberMap, MODULE_BY_ID } = await import(`file://${apiPath}`);

export const BEGIN = 'BEGIN GENERATED module namespace';
export const END = 'END GENERATED module namespace';

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

/* ------------------------------------------------------------------------------------ Lua */

export function luaBlock() {
  const entries = layout().map(([id, members]) => {
    const pairs = members.map(([short, global]) => `${luaKey(short)} = ${JSON.stringify(global)}`).join(', ');
    return `  [${JSON.stringify(id)}] = { ${pairs} },`;
  }).join('\n');

  return `-- ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
-- Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
-- on top. ce.core is global: its members are never namespaced, so they appear here only for
-- discoverability (ce.core.set is the same function as set).
local __CE_MODULES = {
${entries}
}
ce = ce or {}
for __path, __members in pairs(__CE_MODULES) do
  local __node = ce
  for __seg in string.gmatch(string.sub(__path, 4), "[^.]+") do
    __node[__seg] = __node[__seg] or {}
    __node = __node[__seg]
  end
  for __short, __global in pairs(__members) do __node[__short] = _G[__global] end
end
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

  return `// ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
// Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
// on top. ce.core is global: its members are never namespaced, so they appear here only for
// discoverability (ce.core.set is the same function as set).
var __CE_MODULES = {
${entries}
};
var ce = {};
(function () {
  var __g = (typeof globalThis !== 'undefined') ? globalThis : this;
  for (var __path in __CE_MODULES) {
    if (!Object.prototype.hasOwnProperty.call(__CE_MODULES, __path)) continue;
    var __segs = __path.split('.').slice(1);
    var __node = ce;
    for (var __i = 0; __i < __segs.length; __i++) {
      if (!__node[__segs[__i]]) __node[__segs[__i]] = {};
      __node = __node[__segs[__i]];
    }
    var __members = __CE_MODULES[__path];
    for (var __short in __members) {
      if (!Object.prototype.hasOwnProperty.call(__members, __short)) continue;
      __node[__short] = __g[__members[__short]];
    }
  }
})();
// ${END}`;
}

/* --------------------------------------------------------------------------------- Python */

export function pythonBlock() {
  const entries = layout().map(([id, members]) => {
    const pairs = members.map(([short, global]) => `${JSON.stringify(short)}: ${JSON.stringify(global)}`).join(', ');
    return `    ${JSON.stringify(id)}: { ${pairs} },`;
  }).join('\n');

  return `# ${BEGIN} — tools/scripts/gen-script-modules.mjs. Do not edit by hand.
# Every member keeps its flat global name as an alias; this adds the ce.<module>.<name> spelling
# on top. ce.core is global: its members are never namespaced, so they appear here only for
# discoverability (ce.core.set is the same function as set).
import types as __ce_types
__CE_MODULES = {
${entries}
}
ce = __ce_types.SimpleNamespace()
for __ce_path, __ce_members in __CE_MODULES.items():
    __ce_node = ce
    for __ce_seg in __ce_path.split(".")[1:]:
        if not hasattr(__ce_node, __ce_seg):
            setattr(__ce_node, __ce_seg, __ce_types.SimpleNamespace())
        __ce_node = getattr(__ce_node, __ce_seg)
    for __ce_short, __ce_global in __ce_members.items():
        setattr(__ce_node, __ce_short, globals()[__ce_global])
# ${END}`;
}

/* ------------------------------------------------------------------------------- splicing */

const TARGETS = [
  { file: 'CE/src/Scripting/LuaScriptEngine.cpp', block: luaBlock, end: ')LUA";' },
  { file: 'CE/src/Scripting/JsScriptEngine.cpp', block: jsBlock, end: ')JS";' },
  { file: 'CE/src/Scripting/PythonScriptEngine.cpp', block: pythonBlock, end: ')PY";' },
];

/** Replace an existing generated block, or append one just before the prelude's closing delimiter. */
function splice(source, block, endDelimiter) {
  const beginAt = source.indexOf(BEGIN);
  if (beginAt !== -1) {
    // Widen to the whole comment line that opens the block, and to the end of the closing one.
    const lineStart = source.lastIndexOf('\n', beginAt) + 1;
    const endAt = source.indexOf(END, beginAt);
    if (endAt === -1) throw new Error('generated block has no end marker');
    const lineEnd = source.indexOf('\n', endAt);
    return source.slice(0, lineStart) + block + source.slice(lineEnd);
  }
  const closeAt = source.indexOf(endDelimiter);
  if (closeAt === -1) throw new Error(`could not find the prelude delimiter ${endDelimiter}`);
  return `${source.slice(0, closeAt)}\n${block}\n${source.slice(closeAt)}`;
}

function run() {
  const mode = process.argv[2] ?? '--print';
  let stale = 0;

  for (const target of TARGETS) {
    const path = join(repo, target.file);
    const source = readFileSync(path, 'utf8');
    const next = splice(source, target.block(), target.end);

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
  if (mode === '--check' && stale) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) run();
