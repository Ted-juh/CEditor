#!/usr/bin/env node
// gen-file-prelude.mjs — the JavaScript prelude's ce.file, made from fileCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.file's byte commands (the dialogs are the panel view's alone). This writes fileCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/fileParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/fileScenario.mjs.
//
//   node tools/scripts/gen-file-prelude.mjs           check
//   node tools/scripts/gen-file-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/fileCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.file — tools/scripts/gen-file-prelude.mjs, from fileCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.file';
const AFTER = '// END GENERATED ce.verify\n';

export const COMMANDS = [
  ['fileSyxSplit', 'syxSplit', 'bytes, opts'], ['fileSyxJoin', 'syxJoin', 'messages'],
  ['fileMidiRead', 'midiRead', 'bytes, opts'], ['fileMidiWrite', 'midiWrite', 'song, opts'],
];

// The host, over the prelude's globals. ce.file requires ce.time (panelApi.js), whose tempo and
// transport give midiWrite the tempo and beats per bar when a song carries neither.
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  clock: function () { var t = transportInfo(); return { tempo: tempo(), beatsPerBar: t && t.beatsPerBar ? t.beatsPerBar : 4 }; }
}`;

/** The prelude block, from fileCore.js's text. */
export function filePreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // other generated blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'file').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __file.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.file
var __fileCore = (function () {
${body}
return { fileCommands: __fileCommands };
})();
var __file = __fileCore.fileCommands(${HOST});
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.file block (the ce.verify block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + filePreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + filePreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.file block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
