// verify-all.mjs — run every native-handler conformance check and aggregate. Each sub-check skips
// (exit 0) when its toolchain is absent, so this is safe to run anywhere; what it CAN verify, it does.
// With --require a skip fails instead (toolchain.mjs skip()): CI passes it, so a missing JDK or
// compiler turns the step red rather than into a green list of skips.
//
// Run:  node tools/scripts/nativeHandlers/verify-all.mjs [--require]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const checks = [
  ['C++ ABI round-trip',        'cpp/verify.mjs'],
  ['C++ host loader (JUCE)',    'cpp/verify-host.mjs'],
  ['Java vs GraalVM SDK',       'java/verify-java.mjs'],
  ['C# generator conformance',  'csharp/verify-csharp.mjs'],
];

const env = process.argv.includes('--require') ? { ...process.env, CE_NH_REQUIRE: '1' } : process.env;
let failed = 0;
for (const [label, rel] of checks) {
  console.log(`\n=== ${label} (${rel}) ===`);
  try { execFileSync(process.execPath, [path.join(HERE, rel)], { stdio: 'inherit', env }); }
  catch { failed++; console.error(`  -> ${label} FAILED`); }
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll native-handler checks passed (or skipped where the toolchain was absent).');
process.exit(failed ? 1 : 0);
