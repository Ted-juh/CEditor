// verify.mjs — conformance check for the C++ native-handler path. Generates a module from sample
// handlers (via genCpp.mjs), compiles it + harness.cpp against the real NativeHandlerAbi.h +
// ce_runtime.h, runs the harness, and asserts the round-trip works (load -> init -> dispatch ->
// host callbacks). Proves the ABI + generated glue + user-facing C++ surface agree — WITHOUT JUCE.
//
// Run:  node tools/scripts/nativeHandlers/cpp/verify.mjs
// Skips gracefully (exit 0) if no C++ compiler is on PATH. The sample handlers below must match the
// expectations hard-coded in harness.cpp.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateCppModule } from './genCpp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABI_DIR = path.resolve(HERE, '../../../../CE/src/Scripting');

function compiler() {
  for (const c of ['c++', 'g++', 'clang++']) {
    try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  return null;
}

const SAMPLES = [
  { id: 'knob1', name: 'Cutoff', event: 'onValueChanged',
    source: 'void onValueChanged(CeContext& ctx, const CeEvent& event) {\n  ctx.setValue("out", event.value * 2 + 1);\n  ctx.log("ran");\n}' },
  { id: 'knob2', name: 'Res', event: 'onValueChanged',
    source: 'static double dbl(double x){ return x*2; }\nvoid onValueChanged(CeContext& ctx, const CeEvent& event) {\n  ctx.setValue("r", dbl(event.value));\n}' },
  { id: 'p1', name: 'Ready', event: 'onPanelReady',
    source: 'void onPanelReady(CeContext& ctx, const CeEvent& event) {\n  if (event.firstTime) ctx.sendCC(1, 7, 100);\n}' },
];

const cxx = compiler();
if (!cxx) { console.log('verify.mjs: no C++ compiler on PATH — skipping (this is a build-machine check).'); process.exit(0); }

const work = path.join(tmpdir(), `ce-nh-verify-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  generateCppModule({ scripts: SAMPLES, outDir: work, abiHeaderDir: ABI_DIR, runtimeHeaderDir: HERE });
  const so = path.join(work, 'ce_handlers_cpp.so');
  execSync(`${cxx} -std=c++20 -fPIC -shared -fvisibility=hidden -I "${ABI_DIR}" -I "${HERE}" "${path.join(work, 'glue.cpp')}" -o "${so}"`, { stdio: 'inherit' });
  const harness = path.join(work, 'harness');
  execSync(`${cxx} -std=c++20 -I "${ABI_DIR}" "${path.join(HERE, 'harness.cpp')}" -o "${harness}" -ldl`, { stdio: 'inherit' });
  const out = execSync(`"${harness}"`, { cwd: work, encoding: 'utf8' });
  process.stdout.write(out);
  if (!/ALL PASS/.test(out)) { console.error('verify.mjs: FAIL — round-trip assertions did not pass'); process.exit(1); }
  console.log('verify.mjs: C++ native-handler path OK ✓');
} finally {
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
}
