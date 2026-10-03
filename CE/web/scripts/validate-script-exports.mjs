// validate-script-exports.mjs — prove that a script an author writes in CEditor is valid,
// runnable source in its own language.
//
// CEditor stores and runs scripts AS-IS: no transpilation, no projection through an
// intermediate model (CLAUDE.md, docs/design/panel-api-spec.md). So this harness takes the
// canonical script source for each language (script-export-corpus.mjs), hands it to that
// language's REAL toolchain, and asserts it produces the canonical effects against a stubbed
// panel API. If a language's toolchain is absent the target is skipped, never silently passed.
//
// Coverage is exactly RUNNABLE_LANGUAGES from panelApi.js — the set the product claims to run.
//
// Two extra passes beyond "does it compile":
//   • TypeScript is additionally transpiled with the SAME tsService the editor uses, and the
//     emitted JS is executed — that JS is what ships in `compiledJs` and what QuickJS runs.
//   • C++/C#/Java are not run as written but as exported: through genCpp/genCsharp/genJava,
//     compiled against the shipped runtimes and dispatched through the flat ABI, then compared
//     call for call with the same source in the editor's preview (see the section below).
//     The canonical source also runs through the preview interpreters on their own, which
//     needs no toolchain, so it always runs.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { get as readStore } from 'svelte/store';

import { compileCpp, invokeCpp } from '../src/CE_Application/scripting/cppPreview.js';
import { compileCsharp, invokeCsharp } from '../src/CE_Application/scripting/csharpPreview.js';
import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';
import { RUNNABLE_LANGUAGES } from '../src/CE_Application/scripting/panelApi.js';
import { ensureTs, transpileTs } from '../src/CE_Application/scripting/tsService.js';
import { CORE_GET, CORE_SOURCES, EXPECTED, JAVA_READ_CASES, SOURCES, checkEffects, createRecordingApi } from './script-export-corpus.mjs';

// The compiled handlers are compared with the preview's own ctx and event, so this needs
// panelRuntime, which imports its wasm through Vite's `?url` suffix. Plain Node cannot resolve that;
// the test suite's loader stubs it. Registered here so `node scripts/validate-script-exports.mjs`
// works as well as `npm run test:script-exports`.
register('../test/support/svelte-hooks.mjs', import.meta.url);
const { previewContextFor, previewEventFor, scriptApiForTesting } =
  await import('../src/CE_Application/scripting/panelRuntime.js');
const { scriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(os.tmpdir(), 'ceditor-script-export-validation');

function quote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? webRoot,
    encoding: 'utf8',
    shell: options.shell ?? false,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? '',
  };
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const extensions = path.extname(name) ? [''] : ['.exe', '.cmd', '.bat', ''];
  return extensions.map((extension) => `${name}${extension}`);
}

function resolveCommand(names) {
  for (const name of names) {
    if (name.includes('/') || name.includes('\\')) {
      const fullPath = path.resolve(webRoot, name);
      if (existsSync(fullPath)) return fullPath;
      continue;
    }
    const lookup = process.platform === 'win32'
      ? run('where.exe', [name])
      : run('which', [name]);
    if (lookup.status === 0) {
      const first = lookup.stdout.split(/\r?\n/).find(Boolean);
      if (first) return first.trim();
    }
    for (const candidate of commandCandidates(name)) {
      const lookupCandidate = process.platform === 'win32'
        ? run('where.exe', [candidate])
        : run('which', [candidate]);
      if (lookupCandidate.status === 0) {
        const first = lookupCandidate.stdout.split(/\r?\n/).find(Boolean);
        if (first) return first.trim();
      }
    }
  }
  return '';
}

function runExecutable(executable, args, cwd) {
  const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
  if (isCmd) {
    return run('cmd.exe', ['/d', '/s', '/c', [quote(executable), ...args.map(quote)].join(' ')], { cwd });
  }
  return run(executable, args, { cwd });
}

function combineOutput(result) {
  return [result.error, result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function result(target, status, detail, extra = {}) {
  return { target, status, detail, ...extra };
}

async function resetWorkspace() {
  if (!workspaceRoot.endsWith('ceditor-script-export-validation')) {
    throw new Error(`Refusing to clear unexpected validation workspace: ${workspaceRoot}`);
  }
  await rm(workspaceRoot, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true });
}

async function writeTargetFile(target, filename, contents) {
  const directory = path.join(workspaceRoot, target);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, contents, 'utf8');
  return { directory, filePath };
}

/* ------------------------------------------------------------------ harnesses */
// Each harness = stub panel API + the author's source verbatim + the canonical assertions.
// EXPECTED is interpolated so the fixture and the assertions can never drift apart.

const { patches: EXP_PATCHES, cc: EXP_CC, eventValue: EV } = EXPECTED;

function javascriptHarness(source = SOURCES.javascript) {
  return `
const patches = [];
const midi = [];
function set(path, value) { patches.push({ path, value }); }
function get(path) { return 0; }
function sendCC(channel, cc, value) { midi.push({ channel, cc, value }); }
function scale(v, inLo, inHi, outLo, outHi) { return inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function round(v) { return Math.round(v); }

${source}
onValueChanged(${EV});

if (patches.length !== ${EXP_PATCHES.length}) throw new Error('expected ${EXP_PATCHES.length} set() calls, got ' + patches.length);
${EXP_PATCHES.map((p, i) => `if (patches[${i}].path !== ${JSON.stringify(p.path)}) throw new Error('set()[${i}] wrong path');
if (Math.abs(patches[${i}].value - ${p.value}) > 1e-9) throw new Error('set()[${i}] expected ${p.value}, got ' + patches[${i}].value);`).join('\n')}
if (midi.length !== 1) throw new Error('expected one CC, got ' + midi.length);
if (midi[0].channel !== ${EXP_CC.channel} || midi[0].cc !== ${EXP_CC.cc} || midi[0].value !== ${EXP_CC.value}) throw new Error('wrong CC: ' + JSON.stringify(midi[0]));
`.trimStart();
}

// Type-check file: the ambient declarations are the panel API's contract for TS authors.
function typescriptHarness() {
  return `
declare function set(path: string, value: number): void;
declare function get(path: string): number;
declare function sendCC(channel: number, cc: number, value: number): void;
declare function scale(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number;
declare function clamp(v: number, lo: number, hi: number): number;
declare function round(v: number): number;

${SOURCES.typescript}`.trimStart();
}

function luaHarness() {
  return `
local patches = {}
local midi = {}
function set(path, value) table.insert(patches, { path = path, value = value }) end
function get(path) return 0 end
function sendCC(channel, cc, value) table.insert(midi, { channel = channel, cc = cc, value = value }) end
function scale(v, inLo, inHi, outLo, outHi)
  if inHi == inLo then return outLo end
  return outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)
end
function clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi else return v end end
function round(v) return math.floor(v + 0.5) end

${SOURCES.lua}
onValueChanged(${EV})

assert(#patches == ${EXP_PATCHES.length}, 'expected ${EXP_PATCHES.length} set() calls, got ' .. #patches)
${EXP_PATCHES.map((p, i) => `assert(patches[${i + 1}].path == ${JSON.stringify(p.path)}, 'set()[${i}] wrong path')
assert(math.abs(patches[${i + 1}].value - ${p.value}) < 1e-9, 'set()[${i}] expected ${p.value}, got ' .. patches[${i + 1}].value)`).join('\n')}
assert(#midi == 1, 'expected one CC, got ' .. #midi)
assert(midi[1].channel == ${EXP_CC.channel} and midi[1].cc == ${EXP_CC.cc} and midi[1].value == ${EXP_CC.value}, 'wrong CC')
`.trimStart();
}

function pythonHarness() {
  return `
patches = []
midi = []
def set(path, value):
    patches.append({"path": path, "value": value})
def get(path):
    return 0
def sendCC(channel, cc, value):
    midi.append({"channel": channel, "cc": cc, "value": value})
def scale(v, inLo, inHi, outLo, outHi):
    if inHi == inLo:
        return outLo
    return outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)
def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)
def round(v):
    import math
    return int(math.floor(v + 0.5))

${SOURCES.python}
onValueChanged(${EV})

assert len(patches) == ${EXP_PATCHES.length}, "expected ${EXP_PATCHES.length} set() calls, got %d" % len(patches)
${EXP_PATCHES.map((p, i) => `assert patches[${i}]["path"] == ${JSON.stringify(p.path)}, "set()[${i}] wrong path"
assert abs(patches[${i}]["value"] - ${p.value}) < 1e-9, "set()[${i}] expected ${p.value}, got %r" % patches[${i}]["value"]`).join('\n')}
assert len(midi) == 1, "expected one CC, got %d" % len(midi)
assert midi[0]["channel"] == ${EXP_CC.channel} and midi[0]["cc"] == ${EXP_CC.cc} and midi[0]["value"] == ${EXP_CC.value}, "wrong CC: %r" % midi[0]
`.trimStart();
}

/* ----------------------------------------------------------------- validators */

async function validateJavascript() {
  const node = resolveCommand(['node']);
  if (!node) return result('javascript', 'skip', 'node not found.');
  const { directory, filePath } = await writeTargetFile('javascript', 'macroRouting.js', javascriptHarness());
  const check = runExecutable(node, ['--check', filePath], directory);
  if (check.status !== 0) return result('javascript', 'fail', combineOutput(check), { tool: node });
  const exec = runExecutable(node, [filePath], directory);
  return exec.status === 0
    ? result('javascript', 'pass', 'node --check and panel-API harness passed.', { tool: node })
    : result('javascript', 'fail', combineOutput(exec), { tool: node });
}

// Two passes: tsc --strict against the ambient panel API, then transpile through the editor's
// own tsService and RUN the emitted JS — that emitted JS is what ships as `compiledJs`.
async function validateTypescript() {
  const node = resolveCommand(['node']);
  const localTsc = path.join(webRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const globalTsc = resolveCommand(['tsc']);
  const hasLocalTsc = node && existsSync(localTsc);
  if (!hasLocalTsc && !globalTsc) return result('typescript', 'skip', 'TypeScript compiler not found. Install the local dev dependency or put tsc on PATH.');
  const { directory, filePath } = await writeTargetFile('typescript', 'macroRouting.ts', typescriptHarness());
  const args = ['--noEmit', '--strict', '--target', 'ES2022', '--lib', 'ES2022', filePath];
  const typeCheck = hasLocalTsc
    ? runExecutable(node, [localTsc, ...args], directory)
    : runExecutable(globalTsc, args, directory);
  const tool = hasLocalTsc ? `${node} ${localTsc}` : globalTsc;
  if (typeCheck.status !== 0) return result('typescript', 'fail', combineOutput(typeCheck), { tool });

  if (!node) return result('typescript', 'pass', 'tsc --strict --noEmit passed (node absent, transpile pass skipped).', { tool });
  await ensureTs();
  const emitted = transpileTs(SOURCES.typescript);
  if (!emitted) return result('typescript', 'fail', 'tsService.transpileTs returned null — the compiler chunk failed to load.', { tool });
  const { directory: runDir, filePath: runPath } =
    await writeTargetFile('typescript', 'macroRouting.compiled.js', javascriptHarness(emitted));
  const exec = runExecutable(node, [runPath], runDir);
  return exec.status === 0
    ? result('typescript', 'pass', 'tsc --strict passed; tsService-emitted JS ran green.', { tool })
    : result('typescript', 'fail', `emitted JS failed: ${combineOutput(exec)}`, { tool });
}

async function validateLua() {
  const lua = resolveCommand(['lua']);
  const luac = resolveCommand(['luac']);
  if (!lua && !luac) return result('lua', 'skip', 'lua/luac not found.');
  const { directory, filePath } = await writeTargetFile('lua', 'macroRouting.lua', luaHarness());
  if (luac) {
    const syntax = runExecutable(luac, ['-p', filePath], directory);
    if (syntax.status !== 0) return result('lua', 'fail', combineOutput(syntax), { tool: luac });
  }
  if (!lua) return result('lua', 'pass', 'luac -p syntax check passed.', { tool: luac });
  const exec = runExecutable(lua, [filePath], directory);
  return exec.status === 0
    ? result('lua', 'pass', `${luac ? 'luac -p and ' : ''}panel-API harness passed.`, { tool: lua })
    : result('lua', 'fail', combineOutput(exec), { tool: lua });
}

async function validatePython() {
  const python = resolveCommand(['python', 'py']);
  if (!python) return result('python', 'skip', 'python not found.');
  const { directory, filePath } = await writeTargetFile('python', 'macroRouting.py', pythonHarness());
  const compile = runExecutable(python, ['-m', 'py_compile', filePath], directory);
  if (compile.status !== 0) return result('python', 'fail', combineOutput(compile), { tool: python });
  const exec = runExecutable(python, [filePath], directory);
  return exec.status === 0
    ? result('python', 'pass', 'py_compile and panel-API harness passed.', { tool: python })
    : result('python', 'fail', combineOutput(exec), { tool: python });
}

/* ------------------------------------------------- C++ / C# / Java: the real export */
// These three are not run as written. At export a handler is wrapped by a generator (genCpp,
// genCsharp, genJava), compiled against that language's runtime (ce_runtime.h, CeRuntime.cs,
// CeRuntime.java) and dispatched through the flat ABI. So that is what runs here: the canonical
// source and CORE_SOURCES go through the real generator, are compiled against the real runtime, and
// are dispatched through the real entry points into a host that records every call. Each run is then
// compared, call for call and to the bit, with the same source run through the editor's preview.
//
// This used to compile each source against a CeContext written inside this file, which proved the
// source was valid C++ against a context the export never uses. The canonical C# example declared
// OnValueChanged and called ctx.Scale, neither of which the shipped runtime had, and passed.
//
// The far side is the only stand-in. C++ links the generated glue straight into the harness; C# calls
// the [UnmanagedCallersOnly] exports through function pointers; Java swaps CeRuntime.HOST for a
// recorder. The native shims that sit in that last gap (CeHost.c, ce_java_shim.c) are what
// tools/scripts/nativeHandlers/verify-all.mjs builds and runs, where a JDK and a C compiler exist.

const repoRoot = path.resolve(webRoot, '../..');
const nativeDir = path.join(repoRoot, 'tools', 'scripts', 'nativeHandlers');
const abiDir = path.join(repoRoot, 'CE', 'src', 'Scripting');
const NATIVE_SCRIPTS = (language) => [
  { id: 'canonical', name: 'canonical', event: 'onValueChanged', source: SOURCES[language] },
  { id: 'core', name: 'core', event: 'onValueChanged', source: CORE_SOURCES[language] },
];

async function generator(relative, name) {
  return (await import(pathToFileURL(path.join(nativeDir, relative)).href))[name];
}

// Every harness prints a call as `R <json>`, its arguments encoded so nothing is lost on the way:
// a double as its 64 bits in hex, an int64 as a decimal string, text with everything past ASCII
// escaped (a Windows console would otherwise re-encode it).
function decodeArg(v) {
  if (Array.isArray(v)) return v.map(decodeArg);
  if (v && typeof v === 'object' && 'f' in v) {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${v.f}`));
    return view.getFloat64(0);
  }
  if (v && typeof v === 'object' && 'i' in v) return Number(BigInt(v.i));
  return v;
}

function parseRecords(stdout) {
  const runs = {};
  let current = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('S ')) runs[(current = line.slice(2).trim())] = [];
    else if (line.startsWith('R ') && current) runs[current].push(JSON.parse(line.slice(2)).map(decodeArg));
  }
  return runs;
}

/** The same source through the preview, with the preview's own ctx and event over a recording API. */
function previewRecords(language, source) {
  const base = scriptApiForTesting('', `export-${language}`);
  const records = [];
  const lastTraceId = () => readStore(scriptTrace).at(-1)?.id ?? 0;
  const api = {
    ...base,
    set: (p, v) => { records.push(['set', p, v]); },
    get: (p) => (p === CORE_GET.path ? CORE_GET.value : null),
    log: (...args) => { records.push(['log', ...args]); },
    sendCC: (ch, cc, v) => { records.push(['cc', ch, cc, v]); },
    sendNRPN: (ch, msb, lsb, v) => { records.push(['nrpn', ch, msb, lsb, v]); },
    sendSysex: (bytes) => { records.push(['sysex', bytes]); },
    emit: (name, data) => { records.push(['emit', name, data]); },
    // The WebView's curve reports an unknown shape to the script console rather than through log();
    // the compiled one has only log(). Read it back so the two can be compared.
    curve: (...args) => {
      const since = lastTraceId();
      const r = base.curve(...args);
      for (const t of readStore(scriptTrace)) if (t.id > since && t.kind === 'log') records.push(['log', t.message]);
      return r;
    },
  };
  const spec = INTERPRETERS.find((i) => i.language === language);
  const { handlers, diagnostics } = spec.compile(source);
  if (diagnostics.length) throw new Error(`preview: ${diagnostics.join('; ')}`);
  // The preview's rule for which declaration answers onValueChanged, which genCsharp follows too.
  const fn = handlers.get('onValueChanged') ?? (language === 'csharp' ? handlers.get('OnValueChanged') : undefined);
  if (!fn) throw new Error('preview: no onValueChanged handler');
  spec.invoke(fn, [previewContextFor(language, api), previewEventFor(language, EV)]);
  return records;
}

const sameValue = (a, b) => (Array.isArray(a) || Array.isArray(b)
  ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  : Object.is(a, b));
const show = (r) => JSON.stringify(r, (_, v) => (Object.is(v, -0) ? '-0' : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));

/** Compare a compiled run with the preview's, and the canonical run with EXPECTED. '' when they agree. */
function compareRuns(language, runs) {
  for (const id of ['canonical', 'core']) {
    const compiled = runs[id];
    if (!compiled) return `${id}: the compiled module did not run it`;
    const preview = previewRecords(language, id === 'canonical' ? SOURCES[language] : CORE_SOURCES[language]);
    const n = Math.max(compiled.length, preview.length);
    for (let i = 0; i < n; i++) {
      if (!compiled[i] || !preview[i] || !sameValue(compiled[i], preview[i])) {
        return `${id}: call ${i + 1} differs — compiled ${show(compiled[i] ?? 'nothing')}, preview ${show(preview[i] ?? 'nothing')}`;
      }
    }
  }
  const patches = runs.canonical.filter((r) => r[0] === 'set').map(([, p, value]) => ({ path: p, value }));
  const midi = runs.canonical.filter((r) => r[0] === 'cc').map(([, channel, cc, value]) => ({ channel, cc, value }));
  return checkEffects(patches, midi);
}

function cppRecordingHost() {
  return `// The recording host for validate-script-exports.mjs. Linked with the generated glue.cpp, so the
// entry points are called directly: no dlopen, and so no difference between platforms.
#include "NativeHandlerAbi.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

static const char* kHex = "0123456789abcdef";
static std::string text(const char* p, int64_t n) {
  std::string s = "\\"";
  for (int64_t i = 0; i < n; ) {
    unsigned char c = (unsigned char) p[i];
    unsigned cp = c; int len = 1;
    if (c >= 0xF0) { cp = c & 0x07; len = 4; } else if (c >= 0xE0) { cp = c & 0x0F; len = 3; } else if (c >= 0xC0) { cp = c & 0x1F; len = 2; }
    for (int k = 1; k < len && i + k < n; ++k) cp = (cp << 6) | ((unsigned char) p[i + k] & 0x3F);
    i += len;
    auto u = [&](unsigned v) { s += "\\\\u"; for (int sh = 12; sh >= 0; sh -= 4) s += kHex[(v >> sh) & 15]; };
    if (cp == '"' || cp == '\\\\') { s += '\\\\'; s += (char) cp; }
    else if (cp < 0x20 || cp > 0x7E) {
      if (cp > 0xFFFF) { cp -= 0x10000; u(0xD800 + (cp >> 10)); u(0xDC00 + (cp & 0x3FF)); } else u(cp);
    } else s += (char) cp;
  }
  return s + "\\"";
}
static std::string str(const CeStr* s) { return s ? text(s->ptr, s->len) : "null"; }
static std::string enc(const CeValue* v) {
  if (!v) return "null";
  switch (v->tag) {
    case CE_DOUBLE: {
      unsigned long long u; std::memcpy(&u, &v->u.d, 8);
      std::string h; for (int sh = 60; sh >= 0; sh -= 4) h += kHex[(u >> sh) & 15];
      return "{\\"f\\":\\"" + h + "\\"}";
    }
    case CE_INT64:  return "{\\"i\\":\\"" + std::to_string((long long) v->u.i) + "\\"}";
    case CE_BOOL:   return v->u.b ? "true" : "false";
    case CE_STRING: return text(v->u.s.ptr, v->u.s.len);
    case CE_LIST: {
      std::string s = "[";
      for (int64_t i = 0; i < v->u.list.len; ++i) { if (i) s += ","; s += enc(&v->u.list.items[i]); }
      return s + "]";
    }
    default: return "null";
  }
}
static void out(const std::string& call) { std::fputs(("R " + call + "\\n").c_str(), stdout); }

static int  CE_CALL h_set(void*, const CeStr* k, const CeValue* v, const CeValue*) { out("[\\"set\\"," + str(k) + "," + enc(v) + "]"); return 0; }
static int  CE_CALL h_get(void*, const CeStr* k, const CeStr*, CeValue* o) {
  o->tag = CE_NULL;
  if (k && std::string(k->ptr, (size_t) k->len) == ${JSON.stringify(CORE_GET.path)}) { o->tag = CE_DOUBLE; o->u.d = ${CORE_GET.value}; }
  return 0;
}
static void CE_CALL h_cc(void*, int32_t ch, int32_t cc, const CeValue* v) { out("[\\"cc\\"," + std::to_string(ch) + "," + std::to_string(cc) + "," + enc(v) + "]"); }
static void CE_CALL h_nrpn(void*, int32_t ch, int32_t msb, int32_t lsb, const CeValue* v) {
  out("[\\"nrpn\\"," + std::to_string(ch) + "," + std::to_string(msb) + "," + std::to_string(lsb) + "," + enc(v) + "]");
}
static void CE_CALL h_sysex(void*, const CeBytes* b) {
  std::string s = "[\\"sysex-packed\\",[";
  for (int64_t i = 0; b && i < b->len; ++i) { if (i) s += ","; s += std::to_string((int) b->ptr[i]); }
  out(s + "]]");
}
static void CE_CALL h_log(void*, int32_t, const CeStr* m) { out("[\\"log\\"," + str(m) + "]"); }
static void CE_CALL h_log_value(void*, int32_t, const CeStr* m, const CeValue* v) { out("[\\"log\\"," + str(m) + "," + enc(v) + "]"); }
static void CE_CALL h_sysex_value(void*, const CeValue* v) { out("[\\"sysex\\"," + enc(v) + "]"); }
static void CE_CALL h_emit(void*, const CeStr* n, const CeValue* v) { out("[\\"emit\\"," + str(n) + "," + enc(v) + "]"); }
static void CE_CALL h_free(void*, CeValue*) {}
static void* CE_CALL h_alloc(void*, size_t n) { return std::malloc(n); }
static void CE_CALL h_dealloc(void*, void* p, size_t) { std::free(p); }

int main() {
  CeHostVtable vt; std::memset(&vt, 0, sizeof vt);
  vt.abi_version = CE_ABI_VERSION; vt.struct_size = (uint32_t) sizeof vt;
  vt.set = h_set; vt.get = h_get; vt.send_cc = h_cc; vt.send_nrpn = h_nrpn; vt.send_sysex = h_sysex;
  vt.log = h_log; vt.emit = h_emit; vt.free_value = h_free; vt.alloc = h_alloc; vt.dealloc = h_dealloc;
  vt.log_value = h_log_value; vt.send_sysex_value = h_sysex_value;
  void* state = nullptr;
  if (ce_handler_init(&vt, &state) != 0) { std::puts("ce_handler_init failed"); return 1; }
  CeValue payload; std::memset(&payload, 0, sizeof payload); payload.tag = CE_DOUBLE; payload.u.d = ${EV};
  const CeStr ev { "onValueChanged", 14 };
  for (const char* id : { "canonical", "core" }) {
    const CeStr sid { id, (int64_t) std::strlen(id) };
    std::printf("S %s\\n", id);
    if (!ce_handler_has(state, sid, ev)) { std::printf("no handler for %s\\n", id); return 1; }
    const int rc = ce_handler_dispatch(state, sid, ev, &payload, nullptr);
    if (rc != 0) { std::printf("dispatch %s returned %d\\n", id, rc); return 1; }
  }
  ce_handler_shutdown(state);
  return 0;
}
`;
}

async function validateCpp() {
  const compiler = resolveCommand(['g++', 'clang++', 'cl']);
  if (!compiler) return result('cpp', 'skip', 'C++ compiler not found.');
  const directory = path.join(workspaceRoot, 'cpp');
  const generateCppModule = await generator('cpp/genCpp.mjs', 'generateCppModule');
  const runtimeDir = path.join(nativeDir, 'cpp');
  generateCppModule({ scripts: NATIVE_SCRIPTS('cpp'), outDir: directory, abiHeaderDir: abiDir, runtimeHeaderDir: runtimeDir });
  await writeFile(path.join(directory, 'host.cpp'), cppRecordingHost(), 'utf8');
  const outPath = path.join(directory, process.platform === 'win32' ? 'exported.exe' : 'exported');
  const isMsvc = /(^|[\\/])cl(\.exe)?$/i.test(compiler);
  // -ffp-contract=off as the export builds it: a fused multiply-add rounds once where JS rounds twice.
  const compile = isMsvc
    ? runExecutable(compiler, ['/nologo', '/EHsc', '/std:c++20', '/O2', '/fp:precise', `/I${abiDir}`, `/I${runtimeDir}`,
      path.join(directory, 'glue.cpp'), path.join(directory, 'host.cpp'), `/Fe:${outPath}`], directory)
    : runExecutable(compiler, ['-std=c++20', '-O2', '-ffp-contract=off', '-I', abiDir, '-I', runtimeDir,
      path.join(directory, 'glue.cpp'), path.join(directory, 'host.cpp'), '-o', outPath], directory);
  if (compile.status !== 0) return result('cpp', 'fail', `genCpp's module did not compile:\n${combineOutput(compile)}`, { tool: compiler });
  const exec = runExecutable(outPath, [], directory);
  if (exec.status !== 0) return result('cpp', 'fail', combineOutput(exec), { tool: compiler });
  const mismatch = compareRuns('cpp', parseRecords(exec.stdout));
  return mismatch
    ? result('cpp', 'fail', mismatch, { tool: compiler })
    : result('cpp', 'pass', 'genCpp module compiled and dispatched; every call matches the preview.', { tool: compiler });
}

function csharpRecordingHost() {
  return `// The recording host for validate-script-exports.mjs: the generated module's own exports, called
// through function pointers exactly as the native shim calls them.
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;

namespace Ce
{
    internal static unsafe class ExportHarness
    {
        static string Text(CeStr s)
        {
            string v = Utf8.Decode(s);
            var sb = new StringBuilder("\\"");
            foreach (char c in v)
            {
                if (c == '"' || c == '\\\\') sb.Append('\\\\').Append(c);
                else if (c < 0x20 || c > 0x7E) sb.Append("\\\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }
        static string Enc(CeValue* v)
        {
            if (v == null) return "null";
            switch ((CeTag)v->tag)
            {
                case CeTag.Double: return "{\\"f\\":\\"" + BitConverter.DoubleToInt64Bits(v->d).ToString("x16") + "\\"}";
                case CeTag.Int64: return "{\\"i\\":\\"" + v->i.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\\"}";
                case CeTag.Bool: return v->b != 0 ? "true" : "false";
                case CeTag.String: return Text(v->s);
                case CeTag.List:
                {
                    var items = (CeValue*)v->list.items;
                    var sb = new StringBuilder("[");
                    for (long i = 0; i < v->list.len; i++) { if (i > 0) sb.Append(','); sb.Append(Enc(&items[i])); }
                    return sb.Append(']').ToString();
                }
                default: return "null";
            }
        }
        static readonly System.IO.Stream Stdout = Console.OpenStandardOutput();
        static void Out(string call) { var b = Encoding.ASCII.GetBytes("R " + call + "\\n"); Stdout.Write(b, 0, b.Length); Stdout.Flush(); }
        static void Line(string s) { var b = Encoding.ASCII.GetBytes(s + "\\n"); Stdout.Write(b, 0, b.Length); Stdout.Flush(); }

        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static int Set(IntPtr c, CeStr* k, CeValue* v, CeValue* o) { Out("[\\"set\\"," + Text(*k) + "," + Enc(v) + "]"); return 0; }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static int Get(IntPtr c, CeStr* k, CeStr* f, CeValue* o)
        {
            o->tag = (int)CeTag.Null;
            if (Utf8.Decode(*k) == ${JSON.stringify(CORE_GET.path)}) { o->tag = (int)CeTag.Double; o->d = ${CORE_GET.value}; }
            return 0;
        }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Cc(IntPtr c, int ch, int cc, CeValue* v) { Out("[\\"cc\\"," + ch + "," + cc + "," + Enc(v) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Nrpn(IntPtr c, int ch, int msb, int lsb, CeValue* v) { Out("[\\"nrpn\\"," + ch + "," + msb + "," + lsb + "," + Enc(v) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Sysex(IntPtr c, CeBytes* b)
        {
            var sb = new StringBuilder("[\\"sysex-packed\\",[");
            for (long i = 0; i < b->len; i++) { if (i > 0) sb.Append(','); sb.Append(((byte*)b->ptr)[i]); }
            Out(sb.Append("]]").ToString());
        }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Log(IntPtr c, int level, CeStr* m) { Out("[\\"log\\"," + Text(*m) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void LogValue(IntPtr c, int level, CeStr* m, CeValue* v) { Out("[\\"log\\"," + Text(*m) + "," + Enc(v) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void SysexValue(IntPtr c, CeValue* v) { Out("[\\"sysex\\"," + Enc(v) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Emit(IntPtr c, CeStr* n, CeValue* v) { Out("[\\"emit\\"," + Text(*n) + "," + Enc(v) + "]"); }
        [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
        static void Free(IntPtr c, CeValue* v) { }

        static CeStr Ascii(string s, byte* buf) { for (int i = 0; i < s.Length; i++) buf[i] = (byte)s[i]; return new CeStr { ptr = (IntPtr)buf, len = s.Length }; }

        static int Main()
        {
            var vt = (CeHostVtable*)NativeMemory.AllocZeroed((nuint)sizeof(CeHostVtable));
            vt->abi_version = Abi.Version;
            vt->struct_size = (uint)sizeof(CeHostVtable);
            vt->set = &Set; vt->get = &Get; vt->send_cc = &Cc; vt->send_nrpn = &Nrpn; vt->send_sysex = &Sysex;
            vt->log = &Log; vt->emit = &Emit; vt->free_value = &Free;
            vt->log_value = &LogValue; vt->send_sysex_value = &SysexValue;

            delegate* unmanaged[Cdecl]<CeHostVtable*, void**, int> init = &Exports.Init;
            delegate* unmanaged[Cdecl]<void*, CeStr, CeStr, int> has = &Exports.Has;
            delegate* unmanaged[Cdecl]<void*, CeStr, CeStr, CeValue*, CeValue*, int> dispatch = &Exports.Dispatch;
            void* state = null;
            if (init(vt, &state) != 0) { Line("ce_handler_init failed"); return 1; }
            var payload = new CeValue { tag = (int)CeTag.Double, d = ${EV} };
            byte* evBuf = stackalloc byte[64]; byte* idBuf = stackalloc byte[64];
            CeStr ev = Ascii("onValueChanged", evBuf);
            foreach (var id in new[] { "canonical", "core" })
            {
                CeStr sid = Ascii(id, idBuf);
                Line("S " + id);
                if (has(state, sid, ev) != 1) { Line("no handler for " + id); return 1; }
                int rc = dispatch(state, sid, ev, &payload, null);
                if (rc != 0) { Line("dispatch " + id + " returned " + rc); return 1; }
            }
            return 0;
        }
    }
}
`;
}

async function validateCsharp() {
  const dotnet = resolveCommand(['dotnet']);
  if (!dotnet) return result('csharp', 'skip', 'dotnet SDK not found.');
  const sdks = runExecutable(dotnet, ['--list-sdks'], webRoot);
  if (sdks.status !== 0 || !sdks.stdout.trim()) {
    return result('csharp', 'skip', 'dotnet runtime found, but no .NET SDK is installed for build validation.', { tool: dotnet });
  }
  const directory = path.join(workspaceRoot, 'csharp');
  const genDir = path.join(directory, 'module');
  const runDir = path.join(directory, 'run');
  await mkdir(runDir, { recursive: true });
  const generateCsharpModule = await generator('csharp/genCsharp.mjs', 'generateCsharpModule');
  generateCsharpModule({ scripts: NATIVE_SCRIPTS('csharp'), outDir: genDir, abiInfo: { dir: abiDir } });
  await writeFile(path.join(runDir, 'ExportHarness.cs'), csharpRecordingHost(), 'utf8');
  // The module's own sources, less its no-op Program.cs (the harness has the entry point), built as
  // an ordinary framework-dependent program — no self-contained publish, no native shim.
  const moduleSources = ['CeRuntime.cs', 'HandlerRegistry.Registration.cs', 'Handlers.canonical.cs', 'Handlers.core.cs'];
  await writeFile(path.join(runDir, 'ExportHarness.csproj'), [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '    <TargetFramework>net8.0</TargetFramework>',
    '    <Nullable>enable</Nullable>',
    '    <ImplicitUsings>disable</ImplicitUsings>',
    '    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>',
    '    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="ExportHarness.cs" />',
    ...moduleSources.map((f) => `    <Compile Include="../module/${f}" />`),
    '  </ItemGroup>',
    '</Project>',
    '',
  ].join('\n'), 'utf8');
  const exec = runExecutable(dotnet, ['run', '--nologo', '-c', 'Release', '--project', path.join(runDir, 'ExportHarness.csproj')], runDir);
  if (exec.status !== 0) return result('csharp', 'fail', `genCsharp's module did not build or run:\n${combineOutput(exec)}`, { tool: dotnet });
  const mismatch = compareRuns('csharp', parseRecords(exec.stdout));
  return mismatch
    ? result('csharp', 'fail', mismatch, { tool: dotnet })
    : result('csharp', 'pass', 'genCsharp module built and dispatched; every call matches the preview.', { tool: dotnet });
}

function javaRecordingHost() {
  return `// The recording host for validate-script-exports.mjs. CeRuntime.HOST is the one seam: everything
// else — the registry, the dispatch entry point, CeContext, CeEvent — is the generated module's own.
public final class ExportHarness implements CeHostCalls {
    static String text(String v) {
        StringBuilder sb = new StringBuilder("\\"");
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            if (c == '"' || c == '\\\\') sb.append('\\\\').append(c);
            else if (c < 0x20 || c > 0x7E) sb.append(String.format("\\\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }
    static String dbl(double d) { return "{\\"f\\":\\"" + String.format("%016x", Double.doubleToRawLongBits(d)) + "\\"}"; }
    static String kind(int kind, double d, String s) {
        return kind == CeRuntime.CE_DOUBLE ? dbl(d) : kind == CeRuntime.CE_STRING ? text(s)
             : kind == CeRuntime.CE_BOOL ? String.valueOf(d != 0) : "null";
    }
    static void out(String call) { System.out.print("R " + call + "\\n"); }

    public void   setD(long h, String key, double v)        { out("[\\"set\\"," + text(key) + "," + dbl(v) + "]"); }
    public void   setS(long h, String key, String v)        { out("[\\"set\\"," + text(key) + "," + text(v) + "]"); }
    public void   setB(long h, String key, boolean v)       { out("[\\"set\\"," + text(key) + "," + v + "]"); }
    public int    getKind(long h, String key, String form)  { return ${JSON.stringify(CORE_GET.path)}.equals(key) ? CeRuntime.CE_DOUBLE : CeRuntime.CE_NULL; }
    public double getD(long h, String key, String form)     { return ${JSON.stringify(CORE_GET.path)}.equals(key) ? ${CORE_GET.value} : 0; }
    public String getS(long h, String key, String form)     { return ""; }
    public void   ccD(long h, int ch, int cc, double v)     { out("[\\"cc\\"," + ch + "," + cc + "," + dbl(v) + "]"); }
    public void   ccS(long h, int ch, int cc, String v)     { out("[\\"cc\\"," + ch + "," + cc + "," + text(v) + "]"); }
    public void   ccV(long h, int ch, int cc, int k, double d, String s) { out("[\\"cc\\"," + ch + "," + cc + "," + kind(k, d, s) + "]"); }
    public void   nrpnV(long h, int ch, int msb, int lsb, int k, double d, String s) { out("[\\"nrpn\\"," + ch + "," + msb + "," + lsb + "," + kind(k, d, s) + "]"); }
    public void   sysexList(long h, int[] bytes) {
        StringBuilder sb = new StringBuilder("[\\"sysex\\",[");
        for (int i = 0; i < bytes.length; i++) { if (i > 0) sb.append(','); sb.append("{\\"i\\":\\"").append(bytes[i]).append("\\"}"); }
        out(sb.append("]]").toString());
    }
    public void   sysexHex(long h, String hex)              { out("[\\"sysex\\"," + text(hex) + "]"); }
    public void   log(long h, int level, String msg)        { out("[\\"log\\"," + text(msg) + "]"); }
    public void   logV(long h, int level, String msg, int k, double d, String s) { out("[\\"log\\"," + text(msg) + "," + kind(k, d, s) + "]"); }
    public void   emitD(long h, String name, double v)      { out("[\\"emit\\"," + text(name) + "," + dbl(v) + "]"); }
    public void   emitS(long h, String name, String v)      { out("[\\"emit\\"," + text(name) + "," + text(v) + "]"); }
    public void   emitV(long h, String name, int k, double d, String s) { out("[\\"emit\\"," + text(name) + "," + kind(k, d, s) + "]"); }
    public int    pKind(long p, String key)                 { return "value".equals(key) ? CeRuntime.CE_DOUBLE : -1; }
    public double pD(long p, String key)                    { return "value".equals(key) ? ${EV} : 0; }
    public String pS(long p, String key)                    { return ""; }

    public static void main(String[] args) {
        CeRuntime.HOST = new ExportHarness();
        if (CeRuntime.init() != 0) { System.out.println("init failed"); System.exit(1); }
        for (String id : new String[] { "canonical", "core" }) {
            System.out.print("S " + id + "\\n");
            if (CeRuntime.has(id, "onValueChanged") != 1) { System.out.println("no handler for " + id); System.exit(1); }
            int rc = CeRuntime.dispatch(id, "onValueChanged", 1L, 1L);
            if (rc != 0) { System.out.println("dispatch " + id + " returned " + rc); System.exit(1); }
        }
        System.out.flush();
    }
}
`;
}

async function validateJava() {
  const javac = resolveCommand(['javac']);
  const java = resolveCommand(['java']);
  if (!javac) return result('java', 'skip', 'javac not found.');
  const directory = path.join(workspaceRoot, 'java');
  const classes = path.join(directory, 'classes');
  await mkdir(classes, { recursive: true });
  const generateJavaModule = await generator('java/genJava.mjs', 'generateJavaModule');
  const gen = generateJavaModule({ scripts: NATIVE_SCRIPTS('java'), outDir: directory, abiInfo: { dir: abiDir } });
  await writeFile(path.join(directory, 'ExportHarness.java'), javaRecordingHost(), 'utf8');
  const sources = [...gen.javaSources, 'ExportHarness.java'].map((f) => path.join(directory, f));
  const compile = runExecutable(javac, ['-encoding', 'UTF-8', '-d', classes, ...sources], directory);
  if (compile.status !== 0) return result('java', 'fail', `genJava's module did not compile:\n${combineOutput(compile)}`, { tool: javac });
  if (!java) return result('java', 'pass', 'genJava module compiled; java not found for the run.', { tool: javac });
  const exec = runExecutable(java, ['-cp', classes, 'ExportHarness'], directory);
  if (exec.status !== 0) return result('java', 'fail', combineOutput(exec), { tool: javac });
  const mismatch = compareRuns('java', parseRecords(exec.stdout));
  return mismatch
    ? result('java', 'fail', mismatch, { tool: javac })
    : result('java', 'pass', 'genJava module compiled and dispatched; every call matches the preview.', { tool: javac });
}

// The Java preview reports what javac will say about a ctx read (contextReadErrors). That is only
// worth anything while it agrees with javac, so every case in JAVA_READ_CASES is compiled against the
// real runtime — all at once, a javac error mapped back to its case by a marker on its line — and the
// ones that compile are run against a host that answers with a Double, a String and a Boolean. The
// preview must flag exactly the cases javac rejects or that throw, and no other.
async function validateJavaReads() {
  const javac = resolveCommand(['javac']);
  const java = resolveCommand(['java']);
  if (!javac || !java) return result('java-reads', 'skip', 'javac and java are both needed.');
  const generateJavaModule = await generator('java/genJava.mjs', 'generateJavaModule');
  const directory = path.join(workspaceRoot, 'java-reads');
  const moduleFor = async (dir, indices) => {
    const source = ['void onValueChanged(CeContext ctx, CeEvent e) { }',
      ...indices.map((i) => `void case${i}(CeContext ctx, CeEvent e) {\n  ${JAVA_READ_CASES[i]} // case ${i}\n}`)].join('\n');
    await mkdir(path.join(dir, 'classes'), { recursive: true });
    const gen = generateJavaModule({ scripts: [{ id: 'reads', event: 'onValueChanged', source }], outDir: dir, abiInfo: { dir: abiDir } });
    return gen.javaSources.map((f) => path.join(dir, f));
  };
  const all = JAVA_READ_CASES.map((_, i) => i);
  const firstDir = path.join(directory, 'all');
  const first = runExecutable(javac, ['-encoding', 'UTF-8', '-Xmaxerrs', '1000', '-d', path.join(firstDir, 'classes'), ...await moduleFor(firstDir, all)], firstDir);
  const generated = readFileSync(path.join(firstDir, 'Script_reads.java'), 'utf8').split(/\r?\n/);
  const rejected = new Set();
  for (const m of combineOutput(first).matchAll(/Script_reads\.java:(\d+): error/g)) {
    const marker = /\/\/ case (\d+)/.exec(generated[Number(m[1]) - 1] ?? '');
    if (!marker) return result('java-reads', 'fail', `a javac error outside every case:\n${combineOutput(first)}`, { tool: javac });
    rejected.add(Number(marker[1]));
  }
  const compiling = all.filter((i) => !rejected.has(i));
  const runDir = path.join(directory, 'run');
  const sources = await moduleFor(runDir, compiling);
  await writeFile(path.join(runDir, 'ReadHost.java'), `public final class ReadHost implements CeHostCalls {
    public void setD(long h, String k, double v) {} public void setS(long h, String k, String v) {} public void setB(long h, String k, boolean v) {}
    public int getKind(long h, String k, String f) { return k.equals("a") ? CeRuntime.CE_DOUBLE : k.equals("t") ? CeRuntime.CE_STRING : k.equals("on") ? CeRuntime.CE_BOOL : CeRuntime.CE_NULL; }
    public double getD(long h, String k, String f) { return k.equals("a") ? 42.5 : k.equals("on") ? 1 : 0; }
    public String getS(long h, String k, String f) { return "text"; }
    public void ccD(long h, int a, int b, double v) {} public void ccS(long h, int a, int b, String v) {} public void ccV(long h, int a, int b, int k, double d, String s) {}
    public void nrpnV(long h, int a, int b, int c, int k, double d, String s) {} public void sysexList(long h, int[] b) {} public void sysexHex(long h, String x) {}
    public void log(long h, int l, String m) {} public void logV(long h, int l, String m, int k, double d, String s) {}
    public void emitD(long h, String n, double v) {} public void emitS(long h, String n, String v) {} public void emitV(long h, String n, int k, double d, String s) {}
    public int pKind(long p, String k) { return -1; } public double pD(long p, String k) { return 0; } public String pS(long p, String k) { return ""; }
    public static void main(String[] a) {
      CeRuntime.HOST = new ReadHost();
      CeContext ctx = new CeContext(1L); CeEvent e = new CeEvent(0L);
${compiling.map((i) => `      try { Script_reads.INSTANCE.case${i}(ctx, e); System.out.print("ran ${i}\\n"); } catch (Throwable t) { System.out.print("threw ${i}\\n"); }`).join('\n')}
    }
  }
`, 'utf8');
  const second = runExecutable(javac, ['-encoding', 'UTF-8', '-d', path.join(runDir, 'classes'), ...sources, path.join(runDir, 'ReadHost.java')], runDir);
  if (second.status !== 0) return result('java-reads', 'fail', `the cases javac accepted did not compile together:\n${combineOutput(second)}`, { tool: javac });
  const exec = runExecutable(java, ['-cp', path.join(runDir, 'classes'), 'ReadHost'], runDir);
  const threw = new Set([...exec.stdout.matchAll(/^threw (\d+)/gm)].map((m) => Number(m[1])));
  const ran = new Set([...exec.stdout.matchAll(/^ran (\d+)/gm)].map((m) => Number(m[1])));
  const failures = [];
  for (const i of all) {
    const actual = rejected.has(i) ? 'javac rejects it' : threw.has(i) ? 'it throws' : ran.has(i) ? 'it runs' : 'it did not run';
    if (actual === 'it did not run') { failures.push(`case ${i} did not run: ${JAVA_READ_CASES[i]}`); continue; }
    const flagged = compileJava(`void onValueChanged(CeContext ctx, CeEvent e) {\n  ${JAVA_READ_CASES[i]}\n}`).diagnostics.length > 0;
    if (flagged !== (actual !== 'it runs')) failures.push(`${JAVA_READ_CASES[i]} — ${actual}, and the preview ${flagged ? 'flags' : 'accepts'} it`);
  }
  return failures.length
    ? result('java-reads', 'fail', failures.join('\n'), { tool: javac })
    : result('java-reads', 'pass', `the Java preview flags exactly the ${rejected.size + threw.size} of ${all.length} ctx reads javac rejects or that throw.`, { tool: javac });
}

// The interpreted-subset languages ship TWO executors: the real compiler at export, and the
// CeScript interpreter that moves controls live in the editor. They must agree, or a script
// behaves one way while designing and another way once exported. Pure JS — always runs.
const INTERPRETERS = [
  { language: 'cpp', handler: 'onValueChanged', compile: compileCpp, invoke: invokeCpp },
  { language: 'csharp', handler: 'OnValueChanged', compile: compileCsharp, invoke: invokeCsharp },
  { language: 'java', handler: 'onValueChanged', compile: compileJava, invoke: invokeJava },
];

async function validateInterpreters() {
  const failures = [];
  for (const spec of INTERPRETERS) {
    const { patches, midi, api } = createRecordingApi();
    const ctx = previewContextFor(spec.language, api);
    const { handlers, diagnostics } = spec.compile(SOURCES[spec.language]);
    if (diagnostics.length) {
      failures.push(`${spec.language}: ${diagnostics.join('; ')}`);
      continue;
    }
    const fn = handlers.get(spec.handler);
    if (!fn) {
      failures.push(`${spec.language}: interpreter did not expose ${spec.handler}`);
      continue;
    }
    try {
      spec.invoke(fn, [ctx, previewEventFor(spec.language, EV)]);
    } catch (e) {
      failures.push(`${spec.language}: ${e?.message ?? e}`);
      continue;
    }
    const mismatch = checkEffects(patches, midi);
    if (mismatch) failures.push(`${spec.language}: ${mismatch}`);
  }
  return failures.length
    ? result('interpreters', 'fail', failures.join('\n'))
    : result('interpreters', 'pass', `CeScript preview matches the compiled result for ${INTERPRETERS.map((i) => i.language).join(', ')}.`);
}

// Guard against the corpus silently falling behind the languages the product advertises.
async function validateCoverage() {
  const covered = Object.keys(SOURCES).sort();
  const claimed = [...RUNNABLE_LANGUAGES].sort();
  const missing = claimed.filter((l) => !covered.includes(l));
  const extra = covered.filter((l) => !claimed.includes(l));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`no source for RUNNABLE_LANGUAGES: ${missing.join(', ')}`);
    if (extra.length) parts.push(`source for non-runnable languages: ${extra.join(', ')}`);
    return result('coverage', 'fail', parts.join('; '));
  }
  return result('coverage', 'pass', `corpus covers every runnable language (${claimed.join(', ')}).`);
}

const validators = [
  validateCoverage,
  validateJavascript,
  validateTypescript,
  validateLua,
  validatePython,
  validateCpp,
  validateCsharp,
  validateJava,
  validateJavaReads,
  validateInterpreters,
];

export async function validateScriptExportToolchains() {
  await resetWorkspace();
  const results = [];
  for (const validator of validators) {
    results.push(await validator());
  }
  return {
    workspaceRoot,
    results,
    failed: results.filter((item) => item.status === 'fail'),
    skipped: results.filter((item) => item.status === 'skip'),
    passed: results.filter((item) => item.status === 'pass'),
  };
}

function printSummary(summary) {
  for (const item of summary.results) {
    const label = item.status.toUpperCase().padEnd(4);
    const tool = item.tool ? ` (${item.tool})` : '';
    console.log(`${label} ${item.target.padEnd(12)} ${item.detail}${tool}`);
  }
  console.log('');
  console.log(`Export validation workspace: ${summary.workspaceRoot}`);
  console.log(`Passed: ${summary.passed.length}; skipped: ${summary.skipped.length}; failed: ${summary.failed.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const summary = await validateScriptExportToolchains();
  if (json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
  if (summary.failed.length || (strict && summary.skipped.length)) process.exit(1);
}
