// verify-java.mjs — verify the Java native-handler path as far as the toolchain allows:
//   • If `native-image` is on PATH: run the FULL build (javac → native-image --shared → rename → C-shim
//     link), then load the module through a JUCE-free harness and assert the round-trip (init creates
//     the GraalVM isolate; dispatch runs the Java handler which calls back into the host). This is the
//     real proof — it built + dispatched on GraalVM CE 21.
//   • Otherwise: generate the module and `javac` it against the real GraalVM SDK (fetched + cached), so
//     the @CEntryPoint/@CStruct/@CField interop + generated registry still type-check.
//
// Run:  node tools/scripts/nativeHandlers/java/verify-java.mjs
// Skips (exit 0) if neither javac nor native-image is usable.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateJavaModule } from './genJava.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const ABI_DIR = path.join(REPO, 'CE/src/Scripting');
const SDK_URL = 'https://repo1.maven.org/maven2/org/graalvm/sdk/graal-sdk/23.0.1/graal-sdk-23.0.1.jar';
const SCRIPTS = [
  { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
];

function which(c) { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } }
if (!which('javac')) { console.log('verify-java: javac not found — skipping.'); process.exit(0); }

const work = path.join(tmpdir(), `ce-nh-java-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  const gen = generateJavaModule({ scripts: SCRIPTS, outDir: work, abiInfo: { dir: ABI_DIR } });

  if (which('native-image') && which('cc')) {
    // --- FULL build + dispatch ---
    for (const step of [...gen.buildSteps.nativeImage, ...gen.buildSteps.shimCompileLink])
      execSync(step, { cwd: work, stdio: 'inherit' });
    execSync(`cc -I "${work}" "${path.join(HERE, 'harness.c')}" -o "${path.join(work, 'jharness')}" -ldl`, { stdio: 'inherit' });
    const out = execSync(`"${path.join(work, 'jharness')}"`, { cwd: work, encoding: 'utf8' });
    process.stdout.write(out);
    if (!/JAVA NATIVE-IMAGE E2E PASS/.test(out)) { console.error('verify-java: FAIL (full build)'); process.exit(1); }
    console.log('verify-java: full native-image build loads + dispatches a Java handler (host callbacks OK) ✓');
    process.exit(0);
  }

  // --- javac-against-real-SDK fallback ---
  const jar = path.join(tmpdir(), 'ce-nh-graal-sdk.jar');
  if (!existsSync(jar)) {
    if (!which('curl')) { console.log('verify-java: no native-image and no curl for the SDK — skipping.'); process.exit(0); }
    try { execSync(`curl -sSL --max-time 60 -o "${jar}" "${SDK_URL}"`, { stdio: 'ignore' }); } catch { /* offline */ }
    if (!existsSync(jar) || statSync(jar).size < 100000) { console.log('verify-java: could not fetch GraalVM SDK (offline?) — skipping.'); process.exit(0); }
  }
  const javaFiles = readdirSync(work).filter((f) => f.endsWith('.java')).map((f) => `"${path.join(work, f)}"`);
  const classes = path.join(work, 'classes');
  mkdirSync(classes, { recursive: true });
  execSync(`javac -cp "${jar}" -d "${classes}" ${javaFiles.join(' ')}`, { stdio: 'inherit' });
  const n = readdirSync(classes).filter((f) => f.endsWith('.class')).length;
  if (n < 1) { console.error('verify-java: FAIL — javac produced no classes'); process.exit(1); }
  console.log(`verify-java: Java module type-checks against the real GraalVM SDK (${n} classes) ✓`);
  console.log('  (install GraalVM native-image to run the full build + dispatch check.)');
} finally {
  rmSync(work, { recursive: true, force: true });
}
