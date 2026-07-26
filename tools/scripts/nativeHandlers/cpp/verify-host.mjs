// verify-host.mjs — heavier conformance check that builds the REAL host loader (NativeHandlerEngine)
// against vendored JUCE and dispatches into a generated C++ module end-to-end. This is what proved
// the loader: it caught a juce::DynamicLibrary move-assignment bug and a dangling-CeStr lifetime bug.
//
// Run:  node tools/scripts/nativeHandlers/cpp/verify-host.mjs
// Skips (exit 0) if JUCE isn't vendored or no C++ compiler is present. juce_core.o is cached in the OS
// temp dir between runs (its compile is the slow part).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateCppModule } from './genCpp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const ABI_DIR = path.join(REPO, 'CE/src/Scripting');
const SRC = path.join(REPO, 'CE/src/Scripting/NativeHandlerEngine.cpp');

function which(c) { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } }
const cxx = ['clang++', 'g++', 'c++'].find(which);
if (!cxx) { console.log('verify-host: no C++ compiler — skipping.'); process.exit(0); }

// Find the vendored JUCE modules dir: <repo>/JUCE/include/JUCE-*/modules
function findJuceModules() {
  const inc = path.join(REPO, 'JUCE/include');
  if (!existsSync(inc)) return null;
  for (const d of readdirSync(inc)) { const m = path.join(inc, d, 'modules'); if (existsSync(path.join(m, 'juce_core/juce_core.h'))) return m; }
  return null;
}
const JM = findJuceModules();
if (!JM) { console.log('verify-host: vendored JUCE not found — skipping (the C++ ABI itself is covered by verify.mjs).'); process.exit(0); }

const DEFS = ['-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1', '-DJUCE_STANDALONE_APPLICATION=1', '-DJUCE_USE_CURL=0'];
const work = path.join(tmpdir(), `ce-nh-host-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

function run(cmd) { execSync(cmd, { stdio: 'inherit' }); }
const q = (s) => `"${s}"`;

try {
  // 1) juce_core.o (cached — the slow part).
  const juceObj = path.join(tmpdir(), 'ce-nh-juce_core.o');
  if (!existsSync(juceObj)) {
    console.log('verify-host: compiling juce_core (cached after first run)...');
    const unit = path.join(work, 'juce_unit.cpp');
    writeFileSync(unit, '#include <juce_core/juce_core.cpp>\n');
    run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(JM)} ${q(unit)} -o ${q(juceObj)}`);
  }

  // 2) generate + compile a C++ handler module into the work dir (where the e2e binary will live).
  generateCppModule({
    scripts: [{ id: 'knob1', name: 'Cutoff', event: 'onValueChanged',
      source: 'void onValueChanged(CeContext& ctx, const CeEvent& event){ ctx.setValue("out", event.value*2+1); ctx.log("ran"); }' }],
    outDir: work, abiHeaderDir: ABI_DIR, runtimeHeaderDir: HERE,
  });
  run(`${cxx} -std=c++20 -fPIC -shared -fvisibility=hidden -I ${q(ABI_DIR)} -I ${q(HERE)} ${q(path.join(work, 'glue.cpp'))} -o ${q(path.join(work, 'ce_handlers_cpp.so'))}`);

  // 3) e2e main + JUCE link stubs.
  writeFileSync(path.join(work, 'e2e.cpp'), `
namespace juce { extern const char* const juce_compilationDate; extern const char* const juce_compilationTime;
  const char* const juce_compilationDate = __DATE__; const char* const juce_compilationTime = __TIME__; }
#include "ScriptRuntime.h"
#include <juce_core/juce_core.h>
#include <cstdio>
#include <map>
using namespace ceditor::scripting;
struct TestHost : ScriptHostApi {
  std::map<juce::String,double> vals; int cc=-1; juce::String log_;
  juce::var getValue(const juce::String&, const juce::String&) override { return {}; }
  void setValue(const juce::String& p, const juce::var& v, const juce::var&) override { vals[p]=(double)v; }
  void sendCC(int,int c,const juce::var&) override { cc=c; }
  void sendNRPN(int,int,int,const juce::var&) override {}
  void sendSysex(const juce::var&) override {}
  void requestDump(const juce::String&) override {}
  void applyDump(const juce::var&) override {}
  void sendDump(const juce::String&) override {}
  juce::var buildDump(const juce::String&) override { return {}; }
  juce::var runAction(const juce::String&, const juce::var&) override { return {}; }
  void emitEvent(const juce::String&, const juce::var&) override {}
  void log(const juce::String& m, const juce::var&) override { log_=m; }
};
int main(){
  TestHost host; auto eng = createNativeHandlerEngine(); eng->installApi(host);
  auto onErr = [](const juce::String& id, const juce::String& m){ std::printf("[err %s] %s\\n", id.toRawUTF8(), m.toRawUTF8()); };
  ScriptDefinition d; d.id="knob1"; d.name="Cutoff"; d.language="cpp"; d.event="onValueChanged"; d.scope="component";
  bool loaded = eng->loadScript(d, onErr);
  bool has = eng->hasHandler("knob1","onValueChanged");
  eng->dispatch("knob1","onValueChanged", juce::var(10.0), onErr);
  bool ok = loaded && has && host.vals["out"]==21.0 && host.log_=="ran";
  std::printf("loaded=%d has=%d out=%.1f log='%s' -> %s\\n", loaded, has, host.vals["out"], host.log_.toRawUTF8(), ok?"PASS":"FAIL");
  return ok?0:1;
}
`);

  run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(ABI_DIR)} -I ${q(JM)} ${q(SRC)} -o ${q(path.join(work, 'engine.o'))}`);
  run(`${cxx} -c -std=c++20 ${DEFS.join(' ')} -I ${q(ABI_DIR)} -I ${q(JM)} ${q(path.join(work, 'e2e.cpp'))} -o ${q(path.join(work, 'e2e.o'))}`);
  run(`${cxx} ${q(path.join(work, 'e2e.o'))} ${q(path.join(work, 'engine.o'))} ${q(juceObj)} -o ${q(path.join(work, 'e2e'))} -ldl -lpthread`);
  const out = execSync(q(path.join(work, 'e2e')), { cwd: work, encoding: 'utf8' });
  process.stdout.write(out);
  if (!/PASS/.test(out)) { console.error('verify-host: FAIL'); process.exit(1); }
  console.log('verify-host: NativeHandlerEngine loads + dispatches a compiled C++ module against real JUCE ✓');
} finally {
  rmSync(work, { recursive: true, force: true });
}
