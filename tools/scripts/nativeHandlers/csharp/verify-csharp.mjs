// verify-csharp.mjs — verify the C# native-handler path as far as the toolchain allows:
//   • If the .NET SDK (`dotnet`) is present: run the REAL NativeAOT build (`dotnet publish -r <rid>
//     -p:NativeLib=Shared`), then load the produced ce_handlers_csharp.<ext> through the shared host
//     harness and assert the round-trip (init brings up the AOT runtime/GC; dispatch runs the C#
//     handler which calls back into the host). This built + dispatched on .NET 10 / NativeAOT.
//   • Otherwise: structural conformance of the generated module (entry points, csproj AOT knobs,
//     per-script registration) — no compiler needed.
//
// Run:  node tools/scripts/nativeHandlers/csharp/verify-csharp.mjs
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateCsharpModule } from './genCsharp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABI_DIR = path.resolve(HERE, '../../../../CE/src/Scripting');
const HARNESS = path.join(HERE, '..', 'harness.c');

function which(c) { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } }
function rid() {
  const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'osx' : 'linux';
  return `${os}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
}

const work = path.join(tmpdir(), `ce-nh-cs-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  // --- FULL NativeAOT build + dispatch, when the .NET SDK + a C compiler are present ---
  if (which('dotnet') && (which('cc') || which('clang'))) {
    generateCsharpModule({ scripts: [
      { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
    ], outDir: work, abiInfo: { dir: ABI_DIR } });
    execSync(`dotnet publish -c Release -r ${rid()} -p:NativeLib=Shared`, { cwd: work, stdio: 'inherit', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
    const found = walk(work, 'ce_handlers_csharp' + (process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so'));
    if (!found) { console.error('verify-csharp: FAIL — AOT publish produced no module'); process.exit(1); }
    const dir = path.dirname(found);
    const cc = which('cc') ? 'cc' : 'clang';
    execSync(`${cc} -I "${ABI_DIR}" "${HARNESS}" -o "${path.join(dir, 'charness')}" -ldl`, { stdio: 'inherit' });
    const out = execSync(`"${path.join(dir, 'charness')}" "./${path.basename(found)}"`, { cwd: dir, encoding: 'utf8' });
    process.stdout.write(out);
    if (!/NATIVE HANDLER E2E PASS/.test(out)) { console.error('verify-csharp: FAIL (full build)'); process.exit(1); }
    console.log('verify-csharp: full NativeAOT build loads + dispatches a C# handler (host callbacks OK) ✓');
    process.exit(0);
  }

  // --- structural conformance (no .NET SDK) ---
  const r = generateCsharpModule({ scripts: [
    { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2); }' },
    { id: 'p1', name: 'Ready', event: 'onPanelReady', source: 'void onPanelReady(CeContext ctx, CeEvent e){ if (e.firstTime) ctx.sendCC(1,7,100); }' },
  ], outDir: work, abiInfo: { dir: ABI_DIR } });

  const all = readdirSync(work);
  const blob = all.map((f) => readFileSync(path.join(work, f), 'utf8')).join('\n');
  let failures = 0;
  const check = (ok, label) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

  check(r.moduleName === 'ce_handlers_csharp', 'module name is ce_handlers_csharp');
  check(/dotnet publish .*-p:NativeLib=Shared/.test(r.publishCommand('linux-x64')), 'publishCommand uses NativeLib=Shared with the RID');
  for (const ep of ['abi_version', 'init', 'dispatch', 'has', 'shutdown'])
    check(new RegExp(`EntryPoint = "ce_handler_${ep}"`).test(blob), `exports ce_handler_${ep} via [UnmanagedCallersOnly]`);
  const csproj = readFileSync(path.join(work, all.find((f) => f.endsWith('.csproj'))), 'utf8');
  check(/<PublishAot>\s*true/.test(csproj) && /<NativeLib>\s*Shared/.test(csproj), 'csproj: PublishAot + NativeLib=Shared');
  check(/<AssemblyName>\s*ce_handlers_csharp/.test(csproj), 'csproj: AssemblyName pins the module name');
  check(/sealed partial class Script_knob1/.test(blob) && /sealed partial class Script_p1/.test(blob), 'each script wrapped in its own sealed partial class');
  check(/Script_knob1\.__ce_register/.test(blob), 'registry self-registers each script');

  console.log(failures ? `verify-csharp: ${failures} FAILURE(S)` : 'verify-csharp: C# generator output conforms ✓ (install the .NET SDK to run the full AOT build + dispatch)');
  process.exit(failures ? 1 : 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}

function walk(root, name) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) { const r = walk(p, name); if (r) return r; }
    else if (e.name === name) return p;
  }
  return null;
}
