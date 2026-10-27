#!/usr/bin/env node
// gen-verify-prelude.mjs — the JavaScript prelude's ce.verify, made from verifyCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.verify. This writes verifyCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/verifyParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/verifyScenario.mjs.
//
//   node tools/scripts/gen-verify-prelude.mjs           check
//   node tools/scripts/gen-verify-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/verifyCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.verify — tools/scripts/gen-verify-prelude.mjs, from verifyCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.verify';
const AFTER = '// END GENERATED ce.patch\n';

export const COMMANDS = [
  ['verifyCoverage', 'coverage', 'opts'], ['verifyCheck', 'check', 'opts, fn'], ['verifyDump', 'dump', 'kind, opts, fn'],
  ['verifyWrite', 'write', 'id, value, opts, fn'], ['verifyProbe', 'probe', 'id, opts, fn'], ['verifyPatch', 'patch', 'opts, fn'],
  ['verifySummary', 'summary', 'report, opts'], ['verifyRunning', 'running', 'role'], ['verifyCancel', 'cancel', 'role'],
];

// The host, over the prelude's globals. ce.verify requires ce.device and ce.time (panelApi.js), so
// every one of these is live whenever a script can reach ce.verify. The prelude runs once per panel,
// so __verify, and the checks it runs, are every script's: one script's Stop button cancels what
// another's Check button started.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  parameters: function (role) { return __deviceQuery("parameters", { role: role }) || []; },
  layout: function (role) { return __deviceQuery("dumpLayout", { role: role }); },
  read: function (id, role) { return __deviceQuery("read", { role: role, id: String(id) }); },
  write: function (id, value, role) { return deviceWrite(id, value, role) === true; },
  sendDump: function (kind) { return sendDump(kind); },
  patchSection: function (role) { return __deviceQuery("patch", { role: role }); },
  connected: function (role) { return deviceConnected(role) === true; },
  requestDump: function (kind, fn) { return requestDump(kind, fn); },
  after: function (ms, fn) { return after(ms, fn); },
  clock: function () { return nowMs(); },
  emit: function (report) { emit("onVerifyDone", report); }
}`;

/** The prelude block, from verifyCore.js's text. */
export function verifyPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // format and patch blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'verify').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __verify.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.verify
var __verifyCore = (function () {
${body}
return { verifyCommands: __verifyCommands };
})();
var __verify = __verifyCore.verifyCommands(${HOST});
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.verify block (the ce.patch block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + verifyPreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + verifyPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.verify block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
