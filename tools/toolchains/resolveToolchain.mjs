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

// Toolchain roots. The bundled root (HERE = tools/toolchains, beside the app) is where the elevated
// installer's [Run] step provisions and where a source checkout keeps its toolchains; for the installed,
// non-elevated app it is READ-ONLY (it lives under Program Files). CEDITOR_TOOLCHAIN_DIR — set by the app
// at runtime to a per-user writable path (e.g. %LOCALAPPDATA%\CEditor\toolchains) — is where runtime
// provisioning writes. Lookups check the per-user root FIRST, then the bundled root; writes go to the
// writable root.
export function userToolchainsRoot() { return process.env.CEDITOR_TOOLCHAIN_DIR || null; }
export function bundledToolchainsRoot() { return HERE; }
export function writableToolchainsRoot() { return userToolchainsRoot() || HERE; }

/** Path to a provisioned toolchain dir (per-user root first, then the bundled root), or null. */
export function toolchainDir(id) {
  for (const root of [userToolchainsRoot(), HERE]) {
    if (!root) continue;
    const d = path.join(root, id);
    if (existsSync(d)) return d;
  }
  return null;
}

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

/** The bundled LLVM-MinGW dir (for the CMake toolchain file), or null. */
export function llvmMingwDir() { return toolchainDir('llvm-mingw'); }

/** Path to the ninja generator (bundled, else system), or null. */
export function ninjaExe() {
  const n = toolchainDir('ninja');
  if (n) { const p = path.join(n, exe('ninja')); if (existsSync(p)) return p; }
  return has('ninja') ? 'ninja' : null;
}

/** Path to the bundled JDK (javac + jlink) or null — used by the Java ship-a-JRE export path. */
export function jdkHome() { return toolchainDir('jdk'); }

/** Resolve the JDK tools the hosted-JVM Java path needs (javac/jar/jlink + the JNI include dir).
 *  Prefers the bundled JDK (tools/toolchains/jdk), then $JAVA_HOME, then a system JDK on PATH. Returns
 *  null if no JDK with javac is found. */
export function jdkTools() {
  const fromHome = (home) => {
    if (!home) return null;
    const javac = path.join(home, 'bin', exe('javac'));
    if (!existsSync(javac)) return null;
    return {
      home,
      javac,
      jar: path.join(home, 'bin', exe('jar')),
      jlink: path.join(home, 'bin', exe('jlink')),
      jniIncludeDir: path.join(home, 'include'),
    };
  };
  return fromHome(jdkHome()) || fromHome(process.env.JAVA_HOME) ||
    (has('javac') ? { home: null, javac: 'javac', jar: 'jar', jlink: 'jlink', jniIncludeDir: null } : null);
}

/** Path to the bundled CPython embeddable runtime (bundled INTO exported plugins) or null. */
export function pythonEmbedDir() { return toolchainDir('python-embed'); }

/** Path to the bundled .NET SDK `dotnet` driver (Roslyn + publish for the C# handler path), or the
 *  system one, or null. Prefers tools/toolchains/dotnet/ provisioned by provision.mjs. */
export function dotnetExe() {
  const d = toolchainDir('dotnet');
  if (d) { const p = path.join(d, exe('dotnet')); if (existsSync(p)) return p; }
  return has('dotnet') ? 'dotnet' : null;
}

/** The bundled LLD linker (lld-link) — backs the C# NativeAOT link step with no MSVC. */
export function lldLink() {
  const m = toolchainDir('llvm-mingw');
  if (m) { const p = path.join(m, 'bin', exe('lld-link')); if (existsSync(p)) return p; }
  return has('lld-link') ? 'lld-link' : null;
}
