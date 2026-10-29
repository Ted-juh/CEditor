#!/usr/bin/env node
// gen-patch-prelude.mjs — the JavaScript prelude's ce.patch, made from patchCore.js.
//
// As gen-format-prelude.mjs does for ce.format: the panel view and the plug-in's JavaScript engine
// run the SAME code for ce.patch. This writes patchCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/patchParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/patchScenario.mjs.
//
//   node tools/scripts/gen-patch-prelude.mjs           check
//   node tools/scripts/gen-patch-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/patchCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.patch — tools/scripts/gen-patch-prelude.mjs, from patchCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.patch';
const AFTER = '// END GENERATED ce.format\n';

export const COMMANDS = [
  ['patchCurrent', 'current', 'scope, opts'], ['patchRead', 'read', 'scope, fn, opts'], ['patchLoad', 'load', 'name, opts'],
  ['patchMorph', 'morph', 'a, b, t, opts'], ['patchBlend', 'blend', 'patches, weights, opts'], ['patchRandom', 'random', 'opts'],
  ['patchMutate', 'mutate', 'patch, amount, opts'], ['patchMerge', 'merge', 'base, other, opts'], ['patchDiff', 'diff', 'a, b, opts'],
  ['patchEqual', 'equal', 'a, b, opts'], ['patchApply', 'apply', 'patch, opts'], ['patchSave', 'save', 'name, patch, opts'],
  ['patchList', 'list', 'opts'], ['patchForget', 'forget', 'name, opts'], ['patchWrite', 'write', 'patch, slot, opts'],
  ['patchScopes', 'scopes', 'role'], ['patchDefine', 'define', 'scope, spec, role'],
];

// The host, over the prelude's globals. ce.patch requires ce.device, ce.panel, ce.math and
// ce.storage (panelApi.js), so every one of these is live whenever a script can reach ce.patch.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  profile: function (role) { return __deviceQuery("profile", { role: role }); },
  parameters: function (role) { return __deviceQuery("parameters", { role: role }) || []; },
  read: function (id, role) { return __deviceQuery("read", { role: role, id: String(id) }); },
  write: function (id, value, role) { return deviceWrite(id, value, role) === true; },
  fill: function (values) { return applyDump(values); },
  snapshot: function () { return panelSnapshot() || {}; },
  restore: function (values) { return panelRestore(values); },
  requestDump: function (kind, fn, opts) { return requestDump(kind, fn, opts); },
  sendDump: function (kind) { return sendDump(kind); },
  setVariable: function (name, value, role) { return deviceSetVariable(name, value, role); },
  patchSection: function (role) { return __deviceQuery("patch", { role: role }); },
  random: function () { return random(); },
  now: function () { var t = __deviceQuery("now", null); return typeof t === "string" ? t : ""; },
  store: {
    get: function (key) { return loadSetting(key); },
    set: function (key, value) { return saveSetting(key, value); },
    keys: function () { return listSettings() || []; },
    remove: function (key) { return forgetSetting(key); }
  }
}`;

/**
 * The core's own functions are named __formatX or __patchX inside the wrapper, at their definitions AND where
 * the core calls them. The globals of the same name are wrapped by the option check (gen-script-
 * modules.mjs), which refuses an option the command does not take: a call from inside the core
 * hands its own options on (a note's middleC beside a frequency), and must reach the function itself.
 */
export function privateCalls(text, prefix) {
  const defined = [...text.matchAll(new RegExp(`^function (${prefix}[A-Z]\\w*)\\(`, 'gm'))].map((m) => m[1]);
  let out = text;
  for (const name of defined) out = out.replace(new RegExp(`(?<![\\w.$])${name}\\(`, 'g'), `__${name}(`);
  return out;
}

/** The prelude block, from patchCore.js's text. */
export function patchPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Inside the wrapper the core's functions are __patchX, so each name is defined once in the
  // prelude: the globals below are the only patchX.
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: formatCore's
  // block has helpers of the same names (toNumber, opt).
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'patch').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __patch.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.patch
var __patchCore = (function () {
${body}
return { patchCommands: __patchCommands };
})();
var __patch = __patchCore.patchCommands(${HOST});
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.patch block (the ce.format block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + patchPreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + patchPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.patch block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
