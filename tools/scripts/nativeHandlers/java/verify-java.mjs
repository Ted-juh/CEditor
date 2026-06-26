// verify-java.mjs — structural verification of the Java native-handler path: generate a module and
// javac it against the REAL GraalVM SDK (so the @CEntryPoint / @CStruct / @CField annotations, the
// CeContext/CeEvent surface, and the generated handler classes + registry all type-check). This does
// NOT run native-image (that needs a full GraalVM install + closed-world analysis), but it proves the
// generated Java is correct against the actual Graal API — the part most likely to drift.
//
// Run:  node tools/scripts/nativeHandlers/java/verify-java.mjs
// Skips (exit 0) if javac is absent or the SDK jar can't be fetched (offline). The jar is cached in
// the OS temp dir between runs.
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

function which(c) { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } }
if (!which('javac')) { console.log('verify-java: javac not found — skipping.'); process.exit(0); }

// Fetch (and cache) the GraalVM SDK jar so javac can resolve org.graalvm.* .
const jar = path.join(tmpdir(), 'ce-nh-graal-sdk.jar');
if (!existsSync(jar)) {
  if (!which('curl')) { console.log('verify-java: curl absent — cannot fetch GraalVM SDK; skipping.'); process.exit(0); }
  try { execSync(`curl -sSL --max-time 60 -o "${jar}" "${SDK_URL}"`, { stdio: 'ignore' }); } catch { /* offline */ }
  if (!existsSync(jar) || statSync(jar).size < 100000) { console.log('verify-java: could not download GraalVM SDK (offline?) — skipping.'); process.exit(0); }
}

const work = path.join(tmpdir(), `ce-nh-java-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  generateJavaModule({
    scripts: [
      { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
      { id: 'p1', name: 'Ready', event: 'onPanelReady', source: 'void onPanelReady(CeContext ctx, CeEvent e){ if (e.firstTime) ctx.sendCC(1,7,100); }' },
    ],
    outDir: work, abiInfo: { dir: ABI_DIR },
  });
  const javaFiles = readdirSync(work).filter((f) => f.endsWith('.java')).map((f) => `"${path.join(work, f)}"`);
  const classes = path.join(work, 'classes');
  mkdirSync(classes, { recursive: true });
  execSync(`javac -cp "${jar}" -d "${classes}" ${javaFiles.join(' ')}`, { stdio: 'inherit' });
  const n = readdirSync(classes).filter((f) => f.endsWith('.class')).length;
  if (n < 1) { console.error('verify-java: FAIL — javac produced no classes'); process.exit(1); }
  console.log(`verify-java: Java module type-checks against the real GraalVM SDK (${n} classes) ✓`);
  console.log('  (native-image build + the C-shim isolate link still require a GraalVM toolchain — see BUILD.md.)');
} finally {
  rmSync(work, { recursive: true, force: true });
}
