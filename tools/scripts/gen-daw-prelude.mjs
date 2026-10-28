#!/usr/bin/env node
// gen-daw-prelude.mjs — the JavaScript prelude's ce.daw, made from dawCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.daw. This writes dawCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/dawParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/dawScenario.mjs.
//
//   node tools/scripts/gen-daw-prelude.mjs           check
//   node tools/scripts/gen-daw-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/dawCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.daw — tools/scripts/gen-daw-prelude.mjs, from dawCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.daw';
const AFTER = '// END GENERATED ce.mpe\n';

export const COMMANDS = [
  ['dawHost', 'host', ''], ['dawParameters', 'parameters', ''], ['dawParameter', 'parameter', 'path'],
  ['dawProgram', 'program', ''], ['dawPrograms', 'programs', ''], ['dawBeginGesture', 'beginGesture', 'path'],
  ['dawEndGesture', 'endGesture', 'path'], ['dawRename', 'rename', 'path, name'], ['dawAssign', 'assign', 'slot, path, opts'],
  ['dawMarkChanged', 'markChanged', ''],
];

// The host, over the prelude's globals: every question goes to the plug-in as the "daw" device query.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  query: function (op, fields) { var q = {}; for (var k in fields) q[k] = fields[k]; q.op = op; return __deviceQuery("daw", q); }
}`;

/** The prelude block, from dawCore.js's text. */
export function dawPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // other generated blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'daw').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __daw.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.daw
var __dawCore = (function () {
${body}
return { dawCommands: __dawCommands };
})();
var __daw = __dawCore.dawCommands(${HOST});
${globals}
${END}`;
}

function main() {
  const source = readFileSync(ENGINE, 'utf8');
  const from = source.indexOf(BEGIN);
  const to = source.indexOf(END);
  let next;
  if (from < 0 || to < 0) {
    const at = source.indexOf(AFTER);
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.daw block (the ce.mpe block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + dawPreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + dawPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.daw block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
