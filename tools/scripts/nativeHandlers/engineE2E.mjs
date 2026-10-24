// engineE2E.mjs — build the REAL host loader (NativeHandlerEngine) against vendored JUCE into a test
// program, for the verifiers that drive a generated module through it: verify-host.mjs (C++) and
// verify-java.mjs. juce_core's object is cached in the OS temp dir between runs (its compile is the slow part).
//
// The program is `<work>/e2e` (e2e.exe on Windows), and the engine looks for handler modules beside
// the binary it is in, so the module under test goes in `work` too. On Windows it is built with
// cl.exe, as the plug-in is — the SEH guard in NativeHandlerCrashGuard.c is MSVC's __try, and only
// cl compiles it as the product does — so it needs a Developer environment. `main` is the body of main(): it has TestHost (a
// ScriptHostApi that records what reaches it), `onErr` and the engine factory to work with, and
// returns the exit code.
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { IS_WINDOWS, which } from './toolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const ABI_DIR = path.join(REPO, 'CE/src/Scripting');
const SRC = path.join(REPO, 'CE/src/Scripting/NativeHandlerEngine.cpp');
// The engine runs every dispatch through this guard (a C file: MSVC's __try lives there), so it has
// to be linked in.
const GUARD = path.join(REPO, 'CE/src/Scripting/NativeHandlerCrashGuard.c');
const DEFS = ['-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1', '-DJUCE_STANDALONE_APPLICATION=1', '-DJUCE_USE_CURL=0'];

const q = (s) => `"${s}"`;

/** <repo>/JUCE/include/JUCE-*\/modules, or null. */
function findJuceModules() {
  const inc = path.join(REPO, 'JUCE/include');
  if (!existsSync(inc)) return null;
  for (const d of readdirSync(inc)) { const m = path.join(inc, d, 'modules'); if (existsSync(path.join(m, 'juce_core/juce_core.h'))) return m; }
  return null;
}

/** Why the engine cannot be built here, or null when it can. */
export function engineE2EUnavailable() {
  if (IS_WINDOWS && !which('cl')) return 'no cl.exe (run it from a Visual Studio Developer environment)';
  if (!IS_WINDOWS && !['clang++', 'g++', 'c++'].some(which)) return 'no C++ compiler';
  if (!findJuceModules()) return 'vendored JUCE not found';
  return null;
}

/** Builds `<work>/e2e` from the engine and `main`, and returns its path. */
export function buildEngineE2E({ work, main }) {
  const JM = findJuceModules();
  const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

  writeFileSync(path.join(work, 'e2e.cpp'), `
#include "ScriptRuntime.h"
#include <juce_core/juce_core.h>
#include <cstdio>
#include <map>
using namespace ceditor::scripting;
struct TestHost : ScriptHostApi {
  std::map<juce::String,double> vals; int cc=-1; juce::String log_; juce::var logValue; juce::Array<juce::var> sysex;
  juce::var getValue(const juce::String&, const juce::String&) override { return {}; }
  void setValue(const juce::String& p, const juce::var& v, const juce::var&) override { vals[p]=(double)v; }
  void sendCC(int,int c,const juce::var&) override { cc=c; }
  void sendNRPN(int,int,int,const juce::var&) override {}
  void sendSysex(const juce::var& b) override { sysex.add(b); }
  void requestDump(const juce::String&) override {}
  void applyDump(const juce::var&) override {}
  void sendDump(const juce::String&) override {}
  juce::var buildDump(const juce::String&) override { return {}; }
  juce::var runAction(const juce::String&, const juce::var&) override { return {}; }
  void emitEvent(const juce::String&, const juce::var&) override {}
  void log(const juce::String& m, const juce::var& v) override { log_=m; logValue=v; }
};
int main(){
  auto onErr = [](const juce::String& id, const juce::String& m){ std::printf("[err %s] %s\\n", id.toRawUTF8(), m.toRawUTF8()); };
${main}
}
`);

  // juce_core, and the build date it reads, from JUCE's own file: MSVC puts a variable's type in its
  // symbol name, so a definition here that spelled the type differently from JUCE's declaration
  // (`const char* const` for `const char*`) linked on Linux and not on Windows.
  const unit = path.join(work, 'juce_unit.cpp');
  writeFileSync(unit, '#include <juce_core/juce_core.cpp>\n#include <juce_core/juce_core_CompilationTime.cpp>\n');
  const at = (name) => path.join(work, name);

  if (IS_WINDOWS) {
    // /bigobj for juce_core's section count. JUCE's #pragma comment(lib, ...) lines name most of the
    // system libraries; shell32 and ole32 (shortcuts, the trash, special folders) it leaves to its
    // CMake, so they are named here.
    const cl = `cl /nologo /c /std:c++20 /EHsc /MD /O2 /bigobj /utf-8 /Zc:__cplusplus ${DEFS.map((d) => d.replace(/^-D/, '/D')).join(' ')}`;
    const juceObj = path.join(tmpdir(), 'ce-nh-juce_core-2.obj');
    if (!existsSync(juceObj)) {
      console.log('engine e2e: compiling juce_core (cached after first run)...');
      run(`${cl} /I ${q(JM)} ${q(unit)} /Fo${q(juceObj)}`);
    }
    run(`${cl} /I ${q(ABI_DIR)} /I ${q(JM)} ${q(SRC)} /Fo${q(at('engine.obj'))}`);
    run(`${cl} /I ${q(ABI_DIR)} /I ${q(JM)} ${q(at('e2e.cpp'))} /Fo${q(at('e2e.obj'))}`);
    run(`cl /nologo /c /O2 /MD /I ${q(ABI_DIR)} ${q(GUARD)} /Fo${q(at('guard.obj'))}`);
    run(`cl /nologo ${q(at('e2e.obj'))} ${q(at('engine.obj'))} ${q(at('guard.obj'))} ${q(juceObj)} /Fe${q(at('e2e.exe'))} shell32.lib ole32.lib oleaut32.lib uuid.lib`);
    return at('e2e.exe');
  }

  const cxx = ['clang++', 'g++', 'c++'].find(which);
  // -2: the cached object now carries the build date too; one cached before would not link.
  const juceObj = path.join(tmpdir(), 'ce-nh-juce_core-2.o');
  if (!existsSync(juceObj)) {
    console.log('engine e2e: compiling juce_core (cached after first run)...');
    run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(JM)} ${q(unit)} -o ${q(juceObj)}`);
  }
  run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(ABI_DIR)} -I ${q(JM)} ${q(SRC)} -o ${q(at('engine.o'))}`);
  run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(ABI_DIR)} -I ${q(JM)} ${q(at('e2e.cpp'))} -o ${q(at('e2e.o'))}`);
  run(`${cxx.replace(/\+\+$/, '').replace(/^g$/, 'gcc').replace(/^c$/, 'cc')} -c -I ${q(ABI_DIR)} ${q(GUARD)} -o ${q(at('guard.o'))}`);
  run(`${cxx} ${q(at('e2e.o'))} ${q(at('engine.o'))} ${q(at('guard.o'))} ${q(juceObj)} -o ${q(at('e2e'))} -ldl -lpthread`);
  return at('e2e');
}
