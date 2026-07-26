// selftest.mjs — one status board for "is every scripting option working?". Prints, for all seven
// languages: how it runs in the editor preview, how it ships in the plugin, and a LIVE result. The
// three compile-at-export languages (C++/C#/Java) are actually built + dispatched here via their
// verifiers when the toolchain is present; the always-shipped engines (Lua/JS/TS/Python) are covered
// by the web test suite. Also (re)generates the exportable selftest.cepanel.
//
// Run:  node tools/scripts/nativeHandlers/selftest.mjs          (full: builds the native modules)
//       node tools/scripts/nativeHandlers/selftest.mjs --quick  (toolchain detection only, no builds)
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const quick = process.argv.includes('--quick');
const has = (c) => { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } };

function runVerify(rel) {
  try { execFileSync(process.execPath, [path.join(HERE, rel)], { stdio: 'pipe' }); return 'PASS'; }
  catch { return 'FAIL'; }
}

const tc = {
  cpp: has('clang++') || has('g++') || has('c++'),
  csharp: has('dotnet'),
  java: has('native-image'),
};

// [language, editor preview, shipped-plugin mechanism, live result]
const rows = [
  ['lua',        'wasmoon (WASM)',   'native Sol3 (always)',                'ships (web suite)'],
  ['javascript', 'native JS',        'native QuickJS (always)',             'ships (web suite)'],
  ['typescript', 'tsc transpile',    'QuickJS via compiled JS (always)',    'ships (web suite)'],
  ['python',     'Pyodide (WASM)',   'embedded CPython (when embedded)',    'ships* (when embedded)'],
  ['cpp',        'cppPreview subset','compiled-at-export native module',    null],
  ['csharp',     'csharpPreview',    'NativeAOT native module',             null],
  ['java',       'javaPreview',      'GraalVM native-image module',         null],
];

console.log('\nCEditor scripting self-test\n' + '='.repeat(92));
console.log(['LANGUAGE'.padEnd(11), 'EDITOR PREVIEW'.padEnd(19), 'SHIPPED PLUGIN (window-closed)'.padEnd(34), 'LIVE RESULT'].join(''));
console.log('-'.repeat(92));

const verifyFor = { cpp: 'cpp/verify-host.mjs', csharp: 'csharp/verify-csharp.mjs', java: 'java/verify-java.mjs' };
for (const r of rows) {
  let live = r[3];
  if (live === null) {
    const lang = r[0];
    if (!tc[lang]) live = `toolchain absent (${ { cpp: 'clang', csharp: 'dotnet', java: 'native-image' }[lang] })`;
    else if (quick) live = 'toolchain present (run without --quick to build)';
    else { process.stderr.write(`  (building ${lang}...)\n`); live = runVerify(verifyFor[lang]) === 'PASS' ? 'BUILT + DISPATCHED ✓' : 'BUILD FAILED ✗'; }
  }
  console.log([r[0].padEnd(11), r[1].padEnd(19), r[2].padEnd(34), live].join(''));
}
console.log('='.repeat(92));

// (Re)generate the exportable panel.
try {
  const out = execFileSync(process.execPath, [path.join(HERE, 'make-selftest-panel.mjs')], { encoding: 'utf8' });
  console.log('\n' + out.trim().split('\n')[0]);
} catch { /* non-fatal */ }
console.log('Export selftest.cepanel, route the plugin MIDI out to a monitor, load it — each working');
console.log('language sends a unique CC (lua 20 · js 21 · ts 22 · python 23 · cpp 24 · csharp 25 · java 26).');
