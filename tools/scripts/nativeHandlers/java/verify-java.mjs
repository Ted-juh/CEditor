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
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateJavaModule } from './genJava.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const ABI_DIR = path.join(REPO, 'CE/src/Scripting');
// Exercise sendCC (numeric) + setValue + log — the same surface the selftest panel uses.
const SCRIPTS = [
  { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.sendCC(1, 26, 127); ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
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
    execSync(`${cc} -I "${ABI_DIR}" "${path.join(HERE, '..', 'harness.c')}" -o "${path.join(work, 'jharness')}" -ldl`, { stdio: 'inherit' });
    const out = execSync(`"${path.join(work, 'jharness')}" "./ce_handlers_java${ext()}"`, { cwd: work, encoding: 'utf8' });
    process.stdout.write(out.replace(/Picked up JAVA_TOOL_OPTIONS.*\n/g, ''));
    if (!/NATIVE HANDLER E2E PASS/.test(out)) { console.error('verify-java: FAIL (full build)'); process.exit(1); }
    console.log('verify-java: full hosted-JVM build (javac + jlink + JNI shim) loads + dispatches a Java handler ✓');
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
