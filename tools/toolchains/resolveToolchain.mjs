// resolveToolchain.mjs — locate the bundled build toolchains (provisioned by provision.mjs / shipped
// by the installer) so the exporter never depends on a system Visual Studio / .NET SDK / GraalVM.
// Each resolver prefers the bundled toolchain under tools/toolchains/<id>/ and falls back to a system
// tool only if nothing is bundled.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const exe = (b) => (process.platform === 'win32' ? `${b}.exe` : b);
function has(cmd) {
  try { execSync(`${process.platform === 'win32' ? 'where' : 'command -v'} ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

/** Path to a provisioned toolchain dir, or null. */
export function toolchainDir(id) { const d = path.join(HERE, id); return existsSync(d) ? d : null; }

/** The C/C++ compiler to build the handler module (and, on Windows, the JUCE plugin). Prefers the
 *  bundled self-contained LLVM-MinGW Clang (NO Visual Studio / Windows SDK needed). The triple wrapper
 *  targets Windows x64 on any host; on a Windows export host that's a native .dll. */
export function cppCompiler() {
  const m = toolchainDir('llvm-mingw');
  if (m) {
    for (const w of ['x86_64-w64-mingw32-clang++', 'clang++']) {
      const p = path.join(m, 'bin', exe(w));
      if (existsSync(p)) return { cxx: p, bundled: true, targetsWindows: true };
    }
  }
  for (const c of ['clang++', 'g++', 'c++']) if (has(c)) return { cxx: c, bundled: false, targetsWindows: false };
  return null;
}

/** Path to the bundled JDK (javac + jlink) or null — used by the Java ship-a-JRE export path. */
export function jdkHome() { return toolchainDir('jdk'); }

/** Path to the bundled CPython embeddable runtime (bundled INTO exported plugins) or null. */
export function pythonEmbedDir() { return toolchainDir('python-embed'); }

/** The bundled LLD linker (lld-link) — backs the C# NativeAOT link step with no MSVC. */
export function lldLink() {
  const m = toolchainDir('llvm-mingw');
  if (m) { const p = path.join(m, 'bin', exe('lld-link')); if (existsSync(p)) return p; }
  return has('lld-link') ? 'lld-link' : null;
}
