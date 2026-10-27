#!/usr/bin/env node
// gen-mpe-prelude.mjs — the JavaScript prelude's ce.mpe, made from mpeCore.js.
//
// As gen-patch-prelude.mjs does for ce.patch: the panel view and the plug-in's JavaScript engine run
// the SAME code for ce.mpe. This writes mpeCore.js into JsScriptEngine.cpp between the
// BEGIN/END markers, wrapped so its helper names stay out of the prelude's global scope, with the
// commands built over a host made of the prelude's own globals, and one global per command.
// test/mpeParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same answers by the scenario in test/support/mpeScenario.mjs.
//
//   node tools/scripts/gen-mpe-prelude.mjs           check
//   node tools/scripts/gen-mpe-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateCalls } from './gen-patch-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/mpeCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.mpe — tools/scripts/gen-mpe-prelude.mjs, from mpeCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.mpe';
const AFTER = '// END GENERATED ce.ci\n';

export const COMMANDS = [
  ['mpeZone', 'zone', 'opts'], ['mpeNoteOn', 'noteOn', 'note, velocity, opts'], ['mpeExpress', 'express', 'id, values'],
  ['mpeNoteOff', 'noteOff', 'id, velocity'], ['mpeAllOff', 'allOff', ''], ['mpeNotes', 'notes', ''], ['mpeListen', 'listen', 'opts'],
];

// The host, over the prelude's globals: MIDI goes out as sendMidi sends it (to another device inside
// routeMidi), a note is read as sendNote reads it, and listen tells the input decoder how to read MPE
// (MidiInDecoder.h, through the "mpeListen" device query).
const HOST = `{
  say: function (level, text) { if (level === "warn") logWarn(text); else logError(text); },
  send: function (bytes, role) {
    if (role && role !== "mainSynth") routeMidi(role, function () { sendMidi(bytes); });
    else sendMidi(bytes);
  },
  note: function (v) { return __note(v); },
  listen: function (role, opts) { __deviceQuery("mpeListen", { role: role, opts: opts }); }
}`;

/** The prelude block, from mpeCore.js's text. */
export function mpePreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Indented, so the prelude's checks read none of the core's helpers as top-level names: the
  // other generated blocks have helpers of the same names.
  const body = privateCalls(core.replace(/\r\n/g, '\n').replace(/^export /gm, ''), 'mpe').trimEnd()
    .split('\n').map((line) => (line === '' ? line : `  ${line}`)).join('\n');
  const globals = COMMANDS.map(([name, command, args]) => `function ${name}(${args}) { return __mpe.${command}(${args}); }`).join('\n');
  return `${BEGIN}
// @module ce.mpe
var __mpeCore = (function () {
${body}
return { mpeCommands: __mpeCommands };
})();
var __mpe = __mpeCore.mpeCommands(${HOST});
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
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.mpe block (the ce.ci block moved)');
    next = source.slice(0, at + AFTER.length) + '\n' + mpePreludeBlock() + '\n' + source.slice(at + AFTER.length);
  } else {
    next = source.slice(0, from) + mpePreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.mpe block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
