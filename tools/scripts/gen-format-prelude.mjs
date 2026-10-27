#!/usr/bin/env node
// gen-format-prelude.mjs — the JavaScript prelude's ce.format, made from formatCore.js.
//
// The panel view and the plug-in's JavaScript engine run the SAME code for ce.format: this writes
// formatCore.js into JsScriptEngine.cpp between the BEGIN/END markers, wrapped so its helper names
// stay out of the prelude's global scope, with one global per command that hands the console in.
// test/formatParity.test.js fails when the block is stale. The Lua and Python preludes are ports by
// hand, held to the same text by the parity table (test/support/formatCases.mjs).
//
//   node tools/scripts/gen-format-prelude.mjs           check
//   node tools/scripts/gen-format-prelude.mjs --write   write
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = join(root, 'CE/web/src/CE_Application/scripting/formatCore.js');
const ENGINE = join(root, 'CE/src/Scripting/JsScriptEngine.cpp');
export const BEGIN = '// BEGIN GENERATED ce.format — tools/scripts/gen-format-prelude.mjs, from formatCore.js. Do not edit by hand.';
export const END = '// END GENERATED ce.format';

export const COMMANDS = [
  ['formatNumber', 'v, opts'], ['formatHz', 'v, opts'], ['formatTime', 'ms, opts'], ['formatDb', 'v, opts'],
  ['formatPercent', 'v, opts'], ['formatPan', 'v, opts'], ['formatRatio', 'v, opts'], ['formatClock', 'ms, opts'],
  ['formatNote', 'n, opts'], ['formatDivision', 'beats, opts'], ['formatTable', 'v, table, opts'],
  ['formatFit', 'text, width, opts'], ['formatLine', 'left, right, width, opts'], ['formatParse', 'text, opts'],
];

/** The prelude block, from formatCore.js's text. */
export function formatPreludeBlock(core = readFileSync(CORE, 'utf8')) {
  // Inside the wrapper the commands are __formatX, so each name is defined once in the prelude (the
  // globals below are the only formatX), which the duplicate-name check holds every prelude to.
  const body = core.replace(/\r\n/g, '\n').replace(/^export /gm, '')
    .replace(/^function (format[A-Z]\w*)\(/gm, 'function __$1(').trimEnd();
  const names = COMMANDS.map(([n]) => `${n}: __${n}`).join(', ');
  const globals = COMMANDS.map(([name, args]) => {
    const pass = name === 'formatParse' ? args : `${args}, __fmtSay`;
    return `function ${name}(${args}) { return __fmt.${name}(${pass}); }`;
  }).join('\n');
  return `${BEGIN}
// @module ce.format
// A rejected argument is an error, a value past the end of a table a warning, as in the panel view.
function __fmtSay(level, text) { if (level === "warn") logWarn(text); else logError(text); }
var __fmt = (function () {
${body}
return { ${names} };
})();
${globals}
${END}`;
}

function main() {
  const source = readFileSync(ENGINE, 'utf8');
  const from = source.indexOf(BEGIN);
  const to = source.indexOf(END);
  let next;
  if (from < 0 || to < 0) {
    const anchor = '// @module ce.music\nvar __NOTES';
    const at = source.indexOf(anchor);
    if (at < 0) throw new Error('JsScriptEngine.cpp: no place for the ce.format block (the ce.music section moved)');
    next = source.slice(0, at) + formatPreludeBlock() + '\n\n' + source.slice(at);
  } else {
    next = source.slice(0, from) + formatPreludeBlock() + source.slice(to + END.length);
  }
  if (next === source) { console.log('unchanged CE/src/Scripting/JsScriptEngine.cpp'); return; }
  if (!process.argv.includes('--write')) { console.error('CE/src/Scripting/JsScriptEngine.cpp: the ce.format block is stale (run with --write)'); process.exit(1); }
  writeFileSync(ENGINE, next);
  console.log('wrote CE/src/Scripting/JsScriptEngine.cpp');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
