// verify-java.mjs — verify the Java native-handler path (HOSTED-JVM: javac + jlink + JNI shim, NOT
// GraalVM native-image) as far as the toolchain allows:
//   • If a JDK (javac/jar/jlink) + a C compiler are present: run the FULL build — javac the handlers,
//     jar them, jlink a minimal JRE, compile the JNI shim (ce_java_shim.c) — then load the module
//     through the shared host harness and assert the round-trip (the shim boots the JVM via JNI and
//     dispatches a Java handler that calls back into the host). Built + dispatched on JDK 21.
//   • Otherwise: generate the module and `javac` just the sources (no jlink/shim) so the interop +
//     generated registry still type-check.
//
// Run:  node tools/scripts/nativeHandlers/java/verify-java.mjs
// Skips (exit 0) if javac is not usable.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateJavaModule } from './genJava.mjs';
import { buildEngineE2E, engineE2EUnavailable } from '../engineE2E.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const ABI_DIR = path.join(REPO, 'CE/src/Scripting');
// Exercise sendCC (numeric) + setValue + log — the same surface the selftest panel uses.
const SCRIPTS = [
  { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.sendCC(1, 26, 127); ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
  // The calls whose value goes through the slots appended after ABI 1 (log_value, send_sysex_value),
  // so the shim's marshalling of them is run, not only the Java above it. harness.c checks each.
  { id: 'knob2', name: 'Values', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.log("v", 1.5); ctx.sendSysex(new int[] { 0xF0, 0x7F, 0xF7 }); ctx.sendSysex("F0 7E F7"); ctx.sendNRPN(1, 2, 3, 400); ctx.sendCC(1, 64, true); ctx.setValue("typed", ctx.getDouble("cutoff.value") + ctx.getInt("cutoff.value")); }' },
  // A null String handed to a native — a message, a path, an event name, a form, a field name — throws
  // NullPointerException in the handler. Given to GetStringUTFChars it crashed the JVM and the host.
  { id: 'knob3', name: 'Nulls', event: 'onValueChanged', source: `void onValueChanged(CeContext ctx, CeEvent e){
    int refused = 0;
    try { ctx.log(null, 2.0); } catch (NullPointerException x) { refused++; }
    try { ctx.emit(null, true); } catch (NullPointerException x) { refused++; }
    try { ctx.emit(null, 0.5); } catch (NullPointerException x) { refused++; }
    try { ctx.log(null); } catch (NullPointerException x) { refused++; }
    try { ctx.set(null, 1.0); } catch (NullPointerException x) { refused++; }
    try { ctx.set(null, "text"); } catch (NullPointerException x) { refused++; }
    try { ctx.getDouble(null); } catch (NullPointerException x) { refused++; }
    try { ctx.get("cutoff.value", null); } catch (NullPointerException x) { refused++; }
    ctx.log("still running", null);
    ctx.setValue("refused", refused); }` },
  // Two instances of this module in one process must count apart (harness.c), in a field and a static.
  { id: 'counter', name: 'Counter', event: 'onValueChanged', source: 'int count = 0; static int calls = 0;\nvoid onValueChanged(CeContext ctx, CeEvent e){ count++; calls++; ctx.setValue("count", count == calls ? count : -1); }' },
];
// Another panel: the same class and script names, different code. Loaded beside the first in one
// process, each panel's instances must run their own classes.
const OTHER_PANEL = [
  { id: 'counter', name: 'Counter', event: 'onValueChanged', source: 'static int count = 0;\nvoid onValueChanged(CeContext ctx, CeEvent e){ count += 100; ctx.setValue("count", count); }' },
];

function which(c) { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } }
function ext() { return process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so'; }
if (!which('javac')) { console.log('verify-java: javac not found — skipping.'); process.exit(0); }

// Resolve the JDK home (for jlink + the JNI include dir) from JAVA_HOME or javac's real location.
function jdkHome() {
  if (process.env.JAVA_HOME && existsSync(path.join(process.env.JAVA_HOME, 'include'))) return process.env.JAVA_HOME;
  try {
    const real = execSync('readlink -f "$(command -v javac)"', { encoding: 'utf8', shell: '/bin/bash' }).trim();
    const home = path.dirname(path.dirname(real)); // <home>/bin/javac
    if (existsSync(path.join(home, 'include'))) return home;
  } catch { /* fall through */ }
  return null;
}

const work = path.join(tmpdir(), `ce-nh-java-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  const gen = generateJavaModule({ scripts: SCRIPTS, outDir: work, abiInfo: { dir: ABI_DIR } });
  const home = jdkHome();
  const cc = which('cc') ? 'cc' : which('clang') ? 'clang' : null;

  // --- FULL hosted-JVM build + dispatch ---
  if (home && which('jlink') && cc) {
    const plan = gen.buildPlan({
      javac: 'javac', jar: 'jar', jlink: 'jlink', cc,
      jniIncludeDir: path.join(home, 'include'), abiDir: ABI_DIR, ext: ext(),
    });
    for (const step of [...plan.compile, ...plan.jlink, ...plan.shim]) execSync(step, { cwd: work, stdio: 'inherit' });
    // The other panel, in a folder of its own with a copy of the runtime, as a second exported plug-in
    // would have: its shim must find the JVM the first one started rather than load its own libjvm.
    const other = path.join(work, 'other-panel');
    const gen2 = generateJavaModule({ scripts: OTHER_PANEL, outDir: other, abiInfo: { dir: ABI_DIR } });
    const plan2 = gen2.buildPlan({
      javac: 'javac', jar: 'jar', jlink: 'jlink', cc,
      jniIncludeDir: path.join(home, 'include'), abiDir: ABI_DIR, ext: ext(),
    });
    for (const step of [...plan2.compile, ...plan2.shim]) execSync(step, { cwd: other, stdio: 'inherit' });
    cpSync(path.join(work, 'jre'), path.join(other, 'jre'), { recursive: true });
    execSync(`${cc} -I "${ABI_DIR}" "${path.join(HERE, '..', 'harness.c')}" -o "${path.join(work, 'jharness')}" -ldl`, { stdio: 'inherit' });
    const out = execSync(`"${path.join(work, 'jharness')}" "./ce_handlers_java${ext()}" "${path.join(other, `ce_handlers_java${ext()}`)}"`, { cwd: work, encoding: 'utf8' });
    process.stdout.write(out.replace(/Picked up JAVA_TOOL_OPTIONS.*\n/g, ''));
    if (!/NATIVE HANDLER E2E PASS/.test(out)) { console.error('verify-java: FAIL (full build)'); process.exit(1); }
    console.log('verify-java: full hosted-JVM build (javac + jlink + JNI shim) loads + dispatches a Java handler ✓');

    // The same module through the real loader, as the plug-in runs it: two instances count apart, a
    // reload starts an instance's handlers afresh, and closing one leaves the other running.
    const unavailable = engineE2EUnavailable();
    if (unavailable) { console.log(`verify-java: ${unavailable} — the NativeHandlerEngine run is skipped.`); process.exit(0); }
    const e2e = buildEngineE2E({ work, main: `
  TestHost hostA, hostB;
  auto a = createNativeHandlerEngine(); a->installApi(hostA);
  auto b = createNativeHandlerEngine(); b->installApi(hostB);
  ScriptDefinition c; c.id="counter"; c.name="Counter"; c.language="java"; c.event="onValueChanged"; c.scope="component";
  const bool loaded = a->loadScript(c, onErr) && b->loadScript(c, onErr);
  a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  b->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  const bool apart = loaded && hostA.vals["count"] == 2.0 && hostB.vals["count"] == 1.0;
  std::printf("engine: two instances, A counted %.0f, B %.0f -> %s\\n", hostA.vals["count"], hostB.vals["count"], apart ? "PASS" : "FAIL");
  b->reset(); b->loadScript(c, onErr);
  b->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  const bool reload = hostB.vals["count"] == 1.0 && hostA.vals["count"] == 3.0;
  std::printf("engine: B reloaded counts afresh (%.0f), A carries on (%.0f) -> %s\\n", hostB.vals["count"], hostA.vals["count"], reload ? "PASS" : "FAIL");
  b.reset();
  a->dispatch("counter","onValueChanged", juce::var(1.0), onErr);
  const bool survives = hostA.vals["count"] == 4.0;
  std::printf("engine: B closed, A counted %.0f -> %s\\n", hostA.vals["count"], survives ? "PASS" : "FAIL");
  return apart && reload && survives ? 0 : 1;
` });
    const eout = execSync(`"${e2e}"`, { cwd: work, encoding: 'utf8' });
    process.stdout.write(eout);
    if (/FAIL/.test(eout) || !/PASS/.test(eout)) { console.error('verify-java: FAIL (NativeHandlerEngine)'); process.exit(1); }
    console.log('verify-java: NativeHandlerEngine runs the Java module per instance ✓');
    process.exit(0);
  }

  // --- javac-only type-check fallback (no jlink/shim) ---
  const javaFiles = readdirSync(work).filter((f) => f.endsWith('.java')).map((f) => `"${path.join(work, f)}"`);
  const classes = path.join(work, 'classes');
  mkdirSync(classes, { recursive: true });
  execSync(`javac -d "${classes}" ${javaFiles.join(' ')}`, { stdio: 'inherit' });
  const n = readdirSync(classes).filter((f) => f.endsWith('.class')).length;
  if (n < 1) { console.error('verify-java: FAIL — javac produced no classes'); process.exit(1); }
  console.log(`verify-java: Java module type-checks with javac (${n} classes) ✓`);
  console.log('  (install a full JDK with jlink + a C compiler to run the full build + dispatch check.)');
} finally {
  rmSync(work, { recursive: true, force: true });
}
