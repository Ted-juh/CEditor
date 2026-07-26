// verify-csharp.mjs — verify the C# native-handler path (HOSTED-CoreCLR, not NativeAOT) as far as the
// toolchain allows:
//   • If `dotnet` + a C compiler are present: run the REAL build — Roslyn publishes a self-contained
//     ce_managed.dll + CoreCLR, the C shim (CeHost.c) is compiled into the publish dir, then the shared
//     host harness loads ce_handlers_csharp.<ext> and asserts the round-trip (the shim boots CoreCLR via
//     hostfxr, dispatch runs the C# handler which calls back into the host). Built + dispatched on .NET 10.
//   • Otherwise: structural conformance of the generated module (managed entry points, csproj, shim,
//     per-script registration) — no toolchain needed.
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
function ext() { return process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so'; }

const work = path.join(tmpdir(), `ce-nh-cs-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  const cc = which('cc') ? 'cc' : which('clang') ? 'clang' : null;

  // --- FULL hosted-CoreCLR build + dispatch, when dotnet + a C compiler are present ---
  if (which('dotnet') && cc) {
    // Exercise sendCC (numeric overload) + setValue + log — the same API surface the selftest panel
    // uses — so an API/signature mismatch fails the build here, not on the user's machine.
    const gen = generateCsharpModule({ scripts: [
      { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.sendCC(1, 25, 127); ctx.setValue("out", e.value*2+1); ctx.log("ran"); }' },
    ], outDir: work, abiInfo: { dir: ABI_DIR } });

    // 1) Roslyn → self-contained CoreCLR + ce_managed.dll
    execSync(gen.publishCommand(rid()), { cwd: work, stdio: 'inherit', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
    const pub = path.join(work, gen.publishSubdir);
    if (!existsSync(path.join(pub, 'ce_managed.dll'))) { console.error('verify-csharp: FAIL — publish produced no ce_managed.dll'); process.exit(1); }

    // 2) compile the native hosting shim into the publish dir
    const shimOut = path.join(pub, `ce_handlers_csharp${ext()}`);
    execSync(`${cc} -x c -shared -fPIC -O2 -fvisibility=hidden -I "${ABI_DIR}" -I "${gen.hostingIncludeDir}" "${gen.shimSource}" -o "${shimOut}" -ldl`, { stdio: 'inherit' });

    // 3) load through the shared host harness and dispatch
    execSync(`${cc} -I "${ABI_DIR}" "${HARNESS}" -o "${path.join(pub, 'charness')}" -ldl`, { stdio: 'inherit' });
    const out = execSync(`"${path.join(pub, 'charness')}" "./ce_handlers_csharp${ext()}"`, { cwd: pub, encoding: 'utf8' });
    process.stdout.write(out);
    if (!/NATIVE HANDLER E2E PASS/.test(out)) { console.error('verify-csharp: FAIL (full build)'); process.exit(1); }
    console.log('verify-csharp: full hosted-CoreCLR build loads + dispatches a C# handler (host callbacks OK) ✓');
    process.exit(0);
  }

  // --- structural conformance (no toolchain) ---
  const r = generateCsharpModule({ scripts: [
    { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2); }' },
    { id: 'p1', name: 'Ready', event: 'onPanelReady', source: 'void onPanelReady(CeContext ctx, CeEvent e){ if (e.firstTime) ctx.sendCC(1,7,100); }' },
  ], outDir: work, abiInfo: { dir: ABI_DIR } });

  const all = readdirSync(work);
  const blob = all.filter((f) => f.endsWith('.cs') || f.endsWith('.csproj') || f.endsWith('.c') || f.endsWith('.xml'))
    .map((f) => readFileSync(path.join(work, f), 'utf8')).join('\n');
  let failures = 0;
  const check = (ok, label) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

  check(r.moduleName === 'ce_handlers_csharp', 'module name is ce_handlers_csharp');
  check(/dotnet publish .*--self-contained true/.test(r.publishCommand('linux-x64')), 'publishCommand is a self-contained publish (no NativeAOT)');
  for (const ep of ['abi_version', 'init', 'dispatch', 'has', 'shutdown'])
    check(new RegExp(`EntryPoint = "ce_handler_${ep}"`).test(blob), `managed exports ce_handler_${ep} via [UnmanagedCallersOnly]`);
  check(existsSync(path.join(work, 'CeHost.c')), 'native hosting shim CeHost.c emitted');
  check(existsSync(path.join(work, 'hosting', 'hostfxr.h')) && existsSync(path.join(work, 'hosting', 'coreclr_delegates.h')), 'vendored hostfxr headers emitted');
  check(/hostfxr_initialize_for_dotnet_command_line/.test(readFileSync(path.join(work, 'CeHost.c'), 'utf8')), 'shim uses command-line init (supports self-contained)');
  const csproj = readFileSync(path.join(work, 'ce_managed.csproj'), 'utf8');
  check(/<SelfContained>\s*true/.test(csproj) && !/<PublishAot>\s*true/.test(csproj), 'csproj: self-contained CoreCLR, NOT NativeAOT');
  check(/<AssemblyName>\s*ce_managed/.test(csproj), 'csproj: AssemblyName pins ce_managed (shim resolves Ce.Exports, ce_managed)');
  check(existsSync(path.join(work, 'Program.cs')), 'no-op entry point Program.cs emitted (command-line init needs one)');
  check(/sealed partial class Script_knob1/.test(blob) && /sealed partial class Script_p1/.test(blob), 'each script wrapped in its own sealed partial class');
  check(/Script_knob1\.__ce_register/.test(blob), 'registry self-registers each script');

  console.log(failures ? `verify-csharp: ${failures} FAILURE(S)` : 'verify-csharp: C# generator output conforms ✓ (install dotnet + a C compiler to run the full build + dispatch)');
  process.exit(failures ? 1 : 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}
