#!/usr/bin/env node
// gen-osc-prelude.mjs — the JavaScript prelude's ce.osc, made from oscCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.osc. This writes oscCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/oscParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/oscScenario.mjs.
//
//   node tools/scripts/gen-osc-prelude.mjs           check
//   node tools/scripts/gen-osc-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/oscCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.osc — tools/scripts/gen-osc-prelude.mjs, from oscCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.osc';
const AFTER = '// END GENERATED ce.daw\n';

export const COMMANDS = [
  ['oscListen', 'listen', 'opts'], ['oscStop', 'stop', ''], ['oscOn', 'on', 'pattern, fn'], ['oscOff', 'off', 'id'],
  ['oscTarget', 'target', 'name, address'], ['oscSend', 'send', 'to, address, args, types'],
  ['oscBundle', 'bundle', 'to, messages, opts'], ['oscStatus', 'status', ''],
];

// The host, over the prelude's globals: every question goes to the transport as the "osc" device
// query (Osc/OscService); what arrives comes as the "__oscIn" event, and __oscListeners is the
// running script's own (__CE_OWN), so its patterns go when it reloads and its functions run as it.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  query: function (op, fields) { var q = {}; for (var k in fields) q[k] = fields[k]; q.op = op; return __deviceQuery("osc", q); },
  listeners: function () { return __oscListeners; },
  call: function (fn, value) { try { fn(value); } catch (e) { logError("ce.osc: the function given to on failed: " + e); } }
}`;

/** The prelude block, from oscCore.js's text. */
export function oscPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // other generated blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'osc').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __osc.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.osc
var __oscCore = (function () {
${body}
return { oscCommands: __oscCommands, oscMatches: __oscMatches };
})();
var __osc = __oscCore.oscCommands(${HOST});
on("*", "__oscIn", function (msg) { __osc.receive(msg); });
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.osc block (the ce.daw block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + oscPreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + oscPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.osc block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
