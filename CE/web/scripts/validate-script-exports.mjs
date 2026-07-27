// validate-script-exports.mjs — prove that a script an author writes in CEditor is valid,
// runnable source in its own language.
//
// CEditor stores and runs scripts AS-IS: no transpilation, no projection through an
// intermediate model (CLAUDE.md, tools/docs/panel-api-spec.md). So this harness takes the
// canonical script source for each language (script-export-corpus.mjs), hands it to that
// language's REAL toolchain, and asserts it produces the canonical effects against a stubbed
// panel API. If a language's toolchain is absent the target is skipped, never silently passed.
//
// Coverage is exactly RUNNABLE_LANGUAGES from panelApi.js — the set the product claims to run.
//
// Two extra passes beyond "does it compile":
//   • TypeScript is additionally transpiled with the SAME tsService the editor uses, and the
//     emitted JS is executed — that JS is what ships in `compiledJs` and what QuickJS runs.
//   • C++/C#/Java also run through the CeScript interpreters (cppPreview/csharpPreview/
//     javaPreview) that drive the live editor preview, and must agree with the real compiler.
//     That cross-check needs no toolchain, so it always runs.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileCpp, invokeCpp } from '../src/CE_Application/scripting/cppPreview.js';
import { compileCsharp, invokeCsharp } from '../src/CE_Application/scripting/csharpPreview.js';
import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';
import { RUNNABLE_LANGUAGES } from '../src/CE_Application/scripting/panelApi.js';
import { ensureTs, transpileTs } from '../src/CE_Application/scripting/tsService.js';
import { EXPECTED, SOURCES, checkEffects, createRecordingApi } from './script-export-corpus.mjs';

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

function cppHarness() {
  return `
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

struct CeEvent { double value = 0.0; };

struct CeContext {
  std::vector<std::pair<std::string, double>> patches;
  int ccCount = 0, ccChannel = -1, ccNumber = -1;
  long ccValue = -1;
  void set(const char* path, double value) { patches.emplace_back(path, value); }
  double get(const char*) const { return 0.0; }
  void sendCC(int channel, int cc, long value) { ++ccCount; ccChannel = channel; ccNumber = cc; ccValue = value; }
  double scale(double v, double inLo, double inHi, double outLo, double outHi) const {
    return inHi == inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo);
  }
  double clamp(double v, double lo, double hi) const { return v < lo ? lo : v > hi ? hi : v; }
  double round(double v) const { return std::floor(v + 0.5); }
};

${SOURCES.cpp}
int main() {
  CeContext ctx;
  CeEvent event; event.value = ${EV};
  onValueChanged(ctx, event);

  if (ctx.patches.size() != ${EXP_PATCHES.length}) throw std::runtime_error("expected ${EXP_PATCHES.length} set() calls");
${EXP_PATCHES.map((p, i) => `  if (ctx.patches[${i}].first != ${JSON.stringify(p.path)}) throw std::runtime_error("set()[${i}] wrong path");
  if (std::fabs(ctx.patches[${i}].second - ${p.value}) > 1e-9) throw std::runtime_error("set()[${i}] wrong value");`).join('\n')}
  if (ctx.ccCount != 1) throw std::runtime_error("expected one CC");
  if (ctx.ccChannel != ${EXP_CC.channel} || ctx.ccNumber != ${EXP_CC.cc} || ctx.ccValue != ${EXP_CC.value}) throw std::runtime_error("wrong CC");
  return 0;
}
`.trimStart();
}

function csharpHarness() {
  return `
using System;
using System.Collections.Generic;

public sealed class CeEvent { public double Value { get; set; } }

public sealed class CeContext {
  public List<KeyValuePair<string, double>> Patches = new List<KeyValuePair<string, double>>();
  public int CcCount = 0, CcChannel = -1, CcNumber = -1, CcValue = -1;
  public void SetValue(string path, double value) { Patches.Add(new KeyValuePair<string, double>(path, value)); }
  public double GetValue(string path) { return 0; }
  public void SendCC(int channel, int cc, int value) { CcCount++; CcChannel = channel; CcNumber = cc; CcValue = value; }
  public double Scale(double v, double inLo, double inHi, double outLo, double outHi) {
    return inHi == inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo);
  }
  public double Clamp(double v, double lo, double hi) { return Math.Min(hi, Math.Max(lo, v)); }
  public double Round(double v) { return Math.Floor(v + 0.5); }
}

public sealed class ScriptHarness {
${SOURCES.csharp.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n')}
  public static void Main() {
    var ctx = new CeContext();
    new ScriptHarness().OnValueChanged(ctx, new CeEvent { Value = ${EV} });

    if (ctx.Patches.Count != ${EXP_PATCHES.length}) throw new Exception("expected ${EXP_PATCHES.length} set() calls");
${EXP_PATCHES.map((p, i) => `    if (ctx.Patches[${i}].Key != ${JSON.stringify(p.path)}) throw new Exception("set()[${i}] wrong path");
    if (Math.Abs(ctx.Patches[${i}].Value - ${p.value}) > 1e-9) throw new Exception("set()[${i}] wrong value");`).join('\n')}
    if (ctx.CcCount != 1) throw new Exception("expected one CC");
    if (ctx.CcChannel != ${EXP_CC.channel} || ctx.CcNumber != ${EXP_CC.cc} || ctx.CcValue != ${EXP_CC.value}) throw new Exception("wrong CC");
  }
}
`.trimStart();
}

function javaHarness() {
  return `
import java.util.ArrayList;
import java.util.List;

public class MacroRouting {
  static class CeEvent {
    double value;
    CeEvent(double v) { value = v; }
  }

  static class CeContext {
    List<String> paths = new ArrayList<String>();
    List<Double> values = new ArrayList<Double>();
    int ccCount = 0, ccChannel = -1, ccNumber = -1, ccValue = -1;
    void set(String path, double value) { paths.add(path); values.add(value); }
    double get(String path) { return 0; }
    void sendCC(int channel, int cc, int value) { ccCount++; ccChannel = channel; ccNumber = cc; ccValue = value; }
    double scale(double v, double inLo, double inHi, double outLo, double outHi) {
      return inHi == inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo);
    }
    double clamp(double v, double lo, double hi) { return Math.min(hi, Math.max(lo, v)); }
    double round(double v) { return Math.floor(v + 0.5); }
  }

${SOURCES.java.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n')}
  public static void main(String[] args) {
    CeContext ctx = new CeContext();
    new MacroRouting().onValueChanged(ctx, new CeEvent(${EV}));

    if (ctx.paths.size() != ${EXP_PATCHES.length}) throw new RuntimeException("expected ${EXP_PATCHES.length} set() calls");
${EXP_PATCHES.map((p, i) => `    if (!ctx.paths.get(${i}).equals(${JSON.stringify(p.path)})) throw new RuntimeException("set()[${i}] wrong path");
    if (Math.abs(ctx.values.get(${i}) - ${p.value}) > 1e-9) throw new RuntimeException("set()[${i}] wrong value");`).join('\n')}
    if (ctx.ccCount != 1) throw new RuntimeException("expected one CC");
    if (ctx.ccChannel != ${EXP_CC.channel} || ctx.ccNumber != ${EXP_CC.cc} || ctx.ccValue != ${EXP_CC.value}) throw new RuntimeException("wrong CC");
  }
}
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

async function validateCpp() {
  const compiler = resolveCommand(['g++', 'clang++', 'cl']);
  if (!compiler) return result('cpp', 'skip', 'C++ compiler not found.');
  const { directory, filePath } = await writeTargetFile('cpp', 'macroRouting.cpp', cppHarness());
  const outPath = path.join(directory, process.platform === 'win32' ? 'macroRouting.exe' : 'macroRouting');
  const isMsvc = /(^|[\\/])cl(\.exe)?$/i.test(compiler);
  const compile = isMsvc
    ? runExecutable(compiler, ['/nologo', '/EHsc', '/std:c++20', filePath, `/Fe:${outPath}`], directory)
    : runExecutable(compiler, ['-std=c++20', filePath, '-o', outPath], directory);
  if (compile.status !== 0) return result('cpp', 'fail', combineOutput(compile), { tool: compiler });
  const exec = runExecutable(outPath, [], directory);
  return exec.status === 0
    ? result('cpp', 'pass', 'compiled and panel-API harness passed.', { tool: compiler })
    : result('cpp', 'fail', combineOutput(exec), { tool: compiler });
}

async function validateCsharp() {
  const dotnet = resolveCommand(['dotnet']);
  if (!dotnet) return result('csharp', 'skip', 'dotnet SDK not found.');
  const sdks = runExecutable(dotnet, ['--list-sdks'], webRoot);
  if (sdks.status !== 0 || !sdks.stdout.trim()) {
    return result('csharp', 'skip', 'dotnet runtime found, but no .NET SDK is installed for build validation.', { tool: dotnet });
  }
  const directory = path.join(workspaceRoot, 'csharp');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'ScriptHarness.csproj'), [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '    <TargetFramework>net8.0</TargetFramework>',
    '    <ImplicitUsings>disable</ImplicitUsings>',
    '    <Nullable>disable</Nullable>',
    '  </PropertyGroup>',
    '</Project>',
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(directory, 'Program.cs'), csharpHarness(), 'utf8');
  const exec = runExecutable(dotnet, ['run', '--nologo', '--project', path.join(directory, 'ScriptHarness.csproj')], directory);
  return exec.status === 0
    ? result('csharp', 'pass', 'dotnet run panel-API harness passed.', { tool: dotnet })
    : result('csharp', 'fail', combineOutput(exec), { tool: dotnet });
}

async function validateJava() {
  const javac = resolveCommand(['javac']);
  const java = resolveCommand(['java']);
  if (!javac) return result('java', 'skip', 'javac not found.');
  const { directory, filePath } = await writeTargetFile('java', 'MacroRouting.java', javaHarness());
  const compile = runExecutable(javac, [filePath], directory);
  if (compile.status !== 0) return result('java', 'fail', combineOutput(compile), { tool: javac });
  if (!java) return result('java', 'pass', 'javac compiled the harness; java not found for the runtime pass.', { tool: javac });
  const exec = runExecutable(java, ['-cp', directory, 'MacroRouting'], directory);
  return exec.status === 0
    ? result('java', 'pass', 'javac and panel-API harness passed.', { tool: javac })
    : result('java', 'fail', combineOutput(exec), { tool: javac });
}

// The interpreted-subset languages ship TWO executors: the real compiler at export, and the
// CeScript interpreter that moves controls live in the editor. They must agree, or a script
// behaves one way while designing and another way once exported. Pure JS — always runs.
const INTERPRETERS = [
  { language: 'cpp', handler: 'onValueChanged', compile: compileCpp, invoke: invokeCpp, event: () => ({ value: EV }) },
  { language: 'csharp', handler: 'OnValueChanged', compile: compileCsharp, invoke: invokeCsharp, event: () => ({ value: EV, Value: EV }) },
  { language: 'java', handler: 'onValueChanged', compile: compileJava, invoke: invokeJava, event: () => ({ value: EV }) },
];

async function validateInterpreters() {
  const failures = [];
  for (const spec of INTERPRETERS) {
    const { patches, midi, api } = createRecordingApi();
    const ctx = {
      ...api,
      setValue: api.set, getValue: api.get,
      SetValue: api.set, GetValue: api.get, Log: api.log,
      SendCC: api.sendCC, SendNRPN: api.sendNRPN, SendSysex: api.sendSysex,
      Clamp: api.clamp, Scale: api.scale, Round: api.round,
    };
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
      spec.invoke(fn, [ctx, spec.event()]);
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
