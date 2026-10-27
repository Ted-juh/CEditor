#!/usr/bin/env node
// gen-ci-prelude.mjs — the JavaScript prelude's ce.ci, made from ciCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.ci's commands (draftProfile is the panel view's alone). This writes ciCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/ciParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/ciScenario.mjs.
//
//   node tools/scripts/gen-ci-prelude.mjs           check
//   node tools/scripts/gen-ci-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/ciCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.ci — tools/scripts/gen-ci-prelude.mjs, from ciCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.ci';
const AFTER = '// END GENERATED ce.file\n';

export const COMMANDS = [
  ['ciDiscover', 'discover', 'opts, fn'], ['ciDevices', 'devices', 'role'], ['ciGet', 'get', 'muid, resource, opts, fn'],
  ['ciSet', 'set', 'muid, resource, body, opts, fn'], ['ciSubscribe', 'subscribe', 'muid, resource, opts, fn'],
  ['ciUnsubscribe', 'unsubscribe', 'id'], ['ciProfiles', 'profiles', 'muid, fn'], ['ciSetProfile', 'setProfile', 'muid, id, on, opts'],
];

// The host, over the prelude's globals. Every command goes to the device layer's one MIDI-CI session
// (__deviceQuery "ci", DeviceProfileService::ciCommand). The answers come as "__ciReply" events, and
// __ciWaiters is the running script's own (__CE_OWN), so each answer reaches the script that asked
// and its function runs as that script.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  ask: function (fields) { return __deviceQuery("ci", fields); },
  query: function (fields) { return __deviceQuery("ci", fields); },
  waiters: function () { return __ciWaiters; },
  call: function (fn, value) { try { fn(value); } catch (e) { logError("ce.ci: the function given to it failed: " + e); } }
}`;

/** The prelude block, from ciCore.js's text. */
export function ciPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // other generated blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'ci').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __ci.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.ci
var __ciCore = (function () {
${body}
return { ciCommands: __ciCommands };
})();
var __ci = __ciCore.ciCommands(${HOST});
on("*", "__ciReply", function (reply) { __ci.receive(reply); });
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.ci block (the ce.file block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + ciPreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + ciPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.ci block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
