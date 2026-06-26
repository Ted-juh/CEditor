// verify-csharp.mjs — structural conformance check for the C# native-handler generator. There is no
// .NET / NativeAOT toolchain to compile against in CI here, so this asserts the generated module has
// the load-bearing shape: the five flat-ABI [UnmanagedCallersOnly] entry points, the NativeAOT csproj
// knobs (PublishAot / NativeLib=Shared / size flags / pinned AssemblyName), and that each script is
// wrapped + registered by (scriptId, event). Catches generator regressions without a compiler.
//
// Run:  node tools/scripts/nativeHandlers/csharp/verify-csharp.mjs
// The real compile (dotnet publish -r <rid> -p:NativeLib=Shared) still needs the .NET SDK + a native
// toolchain on the export machine — see the genCsharp.mjs header.
import { mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateCsharpModule } from './genCsharp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABI_DIR = path.resolve(HERE, '../../../../CE/src/Scripting');

const work = path.join(tmpdir(), `ce-nh-cs-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

try {
  const r = generateCsharpModule({
    scripts: [
      { id: 'knob1', name: 'Cutoff', event: 'onValueChanged', source: 'void onValueChanged(CeContext ctx, CeEvent e){ ctx.setValue("out", e.value*2); }' },
      { id: 'p1', name: 'Ready', event: 'onPanelReady', source: 'void onPanelReady(CeContext ctx, CeEvent e){ if (e.firstTime) ctx.sendCC(1,7,100); }' },
    ],
    outDir: work, abiInfo: { dir: ABI_DIR },
  });

  const all = readdirSync(work);
  const read = (f) => readFileSync(path.join(work, f), 'utf8');
  const blob = all.map(read).join('\n');

  check(r.moduleName === 'ce_handlers_csharp', 'module name is ce_handlers_csharp');
  check(r.handlerCount === 2, 'reports 2 handlers');
  check(/dotnet publish .*-p:NativeLib=Shared/.test(r.publishCommand('linux-x64')), 'publishCommand uses NativeLib=Shared with the RID');

  for (const ep of ['abi_version', 'init', 'dispatch', 'has', 'shutdown'])
    check(new RegExp(`EntryPoint = "ce_handler_${ep}"`).test(blob), `exports ce_handler_${ep} via [UnmanagedCallersOnly]`);
  check(/UnmanagedCallersOnly/.test(blob), 'uses [UnmanagedCallersOnly]');
  check(/CallConvCdecl/.test(blob), 'pins the cdecl calling convention');

  const csproj = read(all.find((f) => f.endsWith('.csproj')));
  check(/<PublishAot>\s*true/.test(csproj), 'csproj: PublishAot=true');
  check(/<NativeLib>\s*Shared/.test(csproj), 'csproj: NativeLib=Shared');
  check(/<AssemblyName>\s*ce_handlers_csharp/.test(csproj), 'csproj: AssemblyName pins the module name');
  check(/InvariantGlobalization/.test(csproj) && /IlcOptimizationPreference/.test(csproj), 'csproj: size knobs present');

  check(/class Script_knob1/.test(blob) && /class Script_p1/.test(blob), 'each script wrapped in its own static class');
  check(/Script_knob1\.onValueChanged/.test(blob) && /Script_p1\.onPanelReady/.test(blob), 'registry binds (scriptId,event) -> Script_<id>.<event>');

  console.log(failures ? `verify-csharp: ${failures} FAILURE(S)` : 'verify-csharp: C# generator output conforms ✓');
  process.exit(failures ? 1 : 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}
