// verify-host.mjs — heavier conformance check that builds the REAL host loader (NativeHandlerEngine)
// against vendored JUCE and dispatches into a generated C++ module end-to-end. This is what proved
// the loader: it caught a juce::DynamicLibrary move-assignment bug and a dangling-CeStr lifetime bug.
//
// Run:  node tools/scripts/nativeHandlers/cpp/verify-host.mjs
// Skips (exit 0) if JUCE isn't vendored or no C++ compiler is present. juce_core.o is cached in the OS
// temp dir between runs (its compile is the slow part).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateCppModule } from './genCpp.mjs';
import { cppModuleCommand } from './moduleCommand.mjs';
import { ABI_DIR, buildEngineE2E, engineE2EUnavailable } from '../engineE2E.mjs';
import { LIB_EXT, cxxCompiler, skip } from '../toolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const unavailable = engineE2EUnavailable();
if (unavailable) skip(`verify-host: ${unavailable} — skipping (the C++ ABI itself is covered by verify.mjs).`);
// The module is built as an export builds it, with clang where there is one; the engine as the
// plug-in is (engineE2E.mjs). The ABI between them is flat C.
const cxx = cxxCompiler(['clang++', 'g++', 'c++']);
if (!cxx) skip('verify-host: no C++ compiler for the handler module — skipping.');

const work = path.join(tmpdir(), `ce-nh-host-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

function run(cmd) { execSync(cmd, { stdio: 'inherit' }); }
const q = (s) => `"${s}"`;

try {
  // 1) generate + compile a C++ handler module into the work dir (where the e2e binary will live).
  generateCppModule({
    scripts: [{ id: 'knob1', name: 'Cutoff', event: 'onValueChanged',
      source: 'void onValueChanged(CeContext& ctx, const CeEvent& event){ ctx.setValue("out", event.value*2+1); ctx.log("ran"); }' },
    // The values that travel through the slots appended after ABI 1, into the real host trampolines.
    { id: 'knob2', name: 'Values', event: 'onValueChanged',
      source: 'void onValueChanged(CeContext& ctx, const CeEvent& event){ ctx.log("v", 1.5); ctx.sendSysex({0xF0, 0x7F, 0xF7}); ctx.sendSysex("F0 7E F7"); }' },
    // A variable the script keeps: one per plug-in instance, never shared between two.
    { id: 'counter', name: 'Counter', event: 'onValueChanged',
      source: 'int count = 0;\nvoid onValueChanged(CeContext& ctx, const CeEvent&){ ++count; ctx.setValue("count", count); }' }],
    outDir: work, abiHeaderDir: ABI_DIR, runtimeHeaderDir: HERE,
  });
  run(cppModuleCommand({ cxx, glue: path.join(work, 'glue.cpp'), out: path.join(work, `ce_handlers_cpp${LIB_EXT}`), includeDirs: [ABI_DIR, HERE] }));

  // 2) the real engine and a main that drives it.
  const e2e = buildEngineE2E({ work, main: `
  TestHost host; auto eng = createNativeHandlerEngine(); eng->installApi(host);
  ScriptDefinition d; d.id="knob1"; d.name="Cutoff"; d.language="cpp"; d.event="onValueChanged"; d.scope="component";
  bool loaded = eng->loadScript(d, onErr);
  bool has = eng->hasHandler("knob1","onValueChanged");
  eng->dispatch("knob1","onValueChanged", juce::var(10.0), onErr);
  bool ok = loaded && has && host.vals["out"]==21.0 && host.log_=="ran";
  std::printf("loaded=%d has=%d out=%.1f log='%s' -> %s\\n", loaded, has, host.vals["out"], host.log_.toRawUTF8(), ok?"PASS":"FAIL");

  ScriptDefinition d2 = d; d2.id="knob2"; d2.name="Values";
  eng->loadScript(d2, onErr);
  eng->dispatch("knob2","onValueChanged", juce::var(10.0), onErr);
  const bool list = host.sysex.size() == 2 && host.sysex[0].isArray() && host.sysex[0].size() == 3
                 && (int) host.sysex[0][0] == 0xF0 && (int) host.sysex[0][1] == 0x7F && (int) host.sysex[0][2] == 0xF7;
  const bool hex = host.sysex.size() == 2 && host.sysex[1].isString() && host.sysex[1].toString() == "F0 7E F7";
  const bool values = host.log_ == "v" && host.logValue.isDouble() && (double) host.logValue == 1.5 && list && hex;
  std::printf("knob2: log('%s', %s) sysex=%s then %s -> %s\\n", host.log_.toRawUTF8(), host.logValue.toString().toRawUTF8(),
              list ? "[F0,7F,F7]" : "WRONG", hex ? "\\"F0 7E F7\\"" : "WRONG", values ? "PASS" : "FAIL");
  ok = ok && values;

  // Two instances of the same panel in one process, as two plug-ins in one DAW. Each must reach its
  // own host and keep its own count; and removing one must leave the other working. With one module
  // global for the host, the second instance received both instances' calls, the count was shared,
  // and the first instance called into freed memory once the second was gone.
  {
    TestHost hostA, hostB;
    auto a = createNativeHandlerEngine(); a->installApi(hostA);
    auto b = createNativeHandlerEngine(); b->installApi(hostB);
    ScriptDefinition c = d; c.id = "counter"; c.name = "Counter";
    a->loadScript(c, onErr); b->loadScript(c, onErr);
    a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
    a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
    b->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
    const bool apart = hostA.vals["count"] == 2.0 && hostB.vals["count"] == 1.0;
    std::printf("two instances: A counted %.0f, B counted %.0f -> %s\\n", hostA.vals["count"], hostB.vals["count"], apart ? "PASS" : "FAIL");
    b.reset();
    a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
    const bool survives = hostA.vals["count"] == 3.0;
    std::printf("instance B removed: A counted %.0f -> %s\\n", hostA.vals["count"], survives ? "PASS" : "FAIL");
    ok = ok && apart && survives;
  }
  return ok?0:1;
` });
  const out = execSync(q(e2e), { cwd: work, encoding: 'utf8' });
  process.stdout.write(out);
  if (!/PASS/.test(out) || /FAIL/.test(out)) { console.error('verify-host: FAIL'); process.exit(1); }
  console.log('verify-host: NativeHandlerEngine loads + dispatches a compiled C++ module against real JUCE ✓');
} finally {
  rmSync(work, { recursive: true, force: true });
}
