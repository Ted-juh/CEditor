// nativeHandlers/index.mjs — orchestrate compile-at-export of a panel's C++/C#/Java handlers into
// native modules (ce_handlers_<lang>.<ext>) bundled next to the plugin binary, loaded at runtime by
// NativeHandlerEngine. See native-handlers-design.md. BUILD-UNVERIFIED: requires the per-language
// toolchains (CMake+C++, .NET AOT, GraalVM) on the export machine; per-OS (no cross-OS build).
//
// Wiring: export-panel-vst3.mjs calls compileNativeHandlers() after the plugin binary is built, only
// when Export settings opt in (compileNativeHandlers === 'on'); it also passes -DCEDITOR_NATIVE_HANDLERS=ON
// to the player CMake so the loader is linked in.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cppCompiler } from '../../toolchains/resolveToolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABI_DIR = path.resolve(HERE, '../../../CE/src/Scripting'); // holds NativeHandlerAbi.h

// Native shared-lib extension for the current platform (matches NativeHandlerEngine::moduleFileName).
function libExt() {
  return process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
}

// Gather a panel's runnable scripts grouped by language (panel-level + per-control), matching the
// shipped isSourceScript predicate (non-empty source + language).
function scriptsByLanguage(panelDoc) {
  const byLang = { cpp: [], csharp: [], java: [] };
  const add = (s) => {
    if (!s || s.enabled === false) return;
    if (typeof s.source !== 'string' || !s.source.trim()) return;
    const lang = String(s.language ?? '').trim().toLowerCase();
    if (byLang[lang]) byLang[lang].push({ id: String(s.id), name: s.name ?? s.id, event: s.event, source: s.source });
  };
  for (const s of panelDoc?.scripts ?? []) add(s);
  for (const c of panelDoc?.controls ?? []) {
    const sec = c?._children?.Scripts;
    if (sec?.enabled === false) continue;
    for (const s of sec?.scripts ?? []) add(s);
  }
  return byLang;
}

// Map process.platform/arch to a .NET RID (for the C# publish).
function dotnetRid() {
  const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'osx' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${os}-${arch}`;
}

function have(cmd) {
  try { execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// Build one language's module and copy it next to the plugin binary. Returns { ok, lang, bytes, error }.
async function buildLanguage(lang, scripts, { workRoot, binDir }) {
  const outDir = path.join(workRoot, lang);
  mkdirSync(outDir, { recursive: true });
  const ext = libExt();
  const moduleName = `ce_handlers_${lang}`;
  const dest = path.join(binDir, `${moduleName}${ext}`);

  try {
    if (lang === 'cpp') {
      // Build the handler module with the BUNDLED LLVM-MinGW Clang (no Visual Studio / Windows SDK).
      // Direct clang invocation — no CMake, no system toolchain. -static links the mingw runtime in so
      // the .dll is self-contained; the flat C ABI means it loads into the MSVC-built host regardless.
      const { generateCppModule } = await import('./cpp/genCpp.mjs');
      generateCppModule({ scripts, outDir, abiHeaderDir: ABI_DIR, runtimeHeaderDir: path.join(HERE, 'cpp') });
      const tc = cppCompiler();
      if (!tc) return { ok: false, lang, error: 'no C++ compiler — run: node tools/toolchains/provision.mjs llvm-mingw' };
      const out = path.join(outDir, `${moduleName}${ext}`);
      execSync(`"${tc.cxx}" -std=c++20 -shared -static -O2 -fvisibility=hidden -I "${ABI_DIR}" -I "${path.join(HERE, 'cpp')}" "${path.join(outDir, 'glue.cpp')}" -o "${out}"`, { stdio: 'inherit' });
      if (!existsSync(out)) return { ok: false, lang, error: 'C++ module build produced no output' };
      cpSync(out, dest);
    } else if (lang === 'csharp') {
      if (!have('dotnet')) return { ok: false, lang, error: 'dotnet SDK not found on PATH' };
      const { generateCsharpModule } = await import('./csharp/genCsharp.mjs');
      const gen = generateCsharpModule({ scripts, outDir, abiInfo: { dir: ABI_DIR } });
      execSync(gen.publishCommand(dotnetRid()), { cwd: outDir, stdio: 'inherit' });
      const built = findBuilt(outDir, moduleName, ext);
      if (!built) return { ok: false, lang, error: 'C# AOT publish produced no module' };
      cpSync(built, dest);
    } else if (lang === 'java') {
      if (!have('native-image')) return { ok: false, lang, error: 'GraalVM native-image not found on PATH' };
      const { generateJavaModule } = await import('./java/genJava.mjs');
      const gen = generateJavaModule({ scripts, outDir, abiInfo: { dir: ABI_DIR } });
      // buildSteps groups the native-image compile + rename, then the C-shim compile+link (proven on
      // GraalVM CE 21; see genJava.mjs + the emitted BUILD.md). Linux-shaped; on win/mac follow BUILD.md.
      const steps = [...(gen.buildSteps?.nativeImage ?? []), ...(gen.buildSteps?.shimCompileLink ?? [])];
      for (const step of steps) execSync(step, { cwd: outDir, stdio: 'inherit' });
      // Java ships TWO files: the shim (ce_handlers_java.<ext>, what the host opens) + its native-image
      // sibling lib<name>_svm.<ext>. Copy every declared artifact next to the plugin binary.
      let bytes = 0;
      for (const art of gen.buildSteps?.artifacts ?? [`${moduleName}${ext}`]) {
        const src = path.join(outDir, art);
        if (!existsSync(src)) return { ok: false, lang, error: `Java build missing artifact ${art}` };
        cpSync(src, path.join(binDir, art));
        bytes += statSync(path.join(binDir, art)).size;
      }
      return { ok: true, lang, bytes };
    }
    return { ok: true, lang, bytes: statSync(dest).size };
  } catch (e) {
    return { ok: false, lang, error: e?.message ?? String(e) };
  }
}

// native-image / dotnet may name the output libce_handlers_X.so or place it under publish/ — find it.
function findBuilt(root, moduleName, ext) {
  const candidates = [
    path.join(root, `${moduleName}${ext}`),
    path.join(root, `lib${moduleName}${ext}`),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // shallow recursive scan as a fallback
  const want = new Set([`${moduleName}${ext}`, `lib${moduleName}${ext}`]);
  const walk = (d, depth) => {
    if (depth > 4) return null;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { const r = walk(p, depth + 1); if (r) return r; }
      else if (want.has(e.name)) return p;
    }
    return null;
  };
  try { return walk(root, 0); } catch { return null; }
}

/**
 * Compile + bundle a panel's native handlers. `binDir` is the plugin's binary dir (where the host
 * loader looks). Returns a report; logs progress. Never throws — a per-language failure is reported.
 */
export async function compileNativeHandlers(panelDoc, { binDir, workRoot }) {
  const byLang = scriptsByLanguage(panelDoc);
  const used = Object.entries(byLang).filter(([, s]) => s.length);
  if (!used.length) return { built: [], skipped: [], note: 'no C++/C#/Java handlers' };

  const built = [], failed = [];
  for (const [lang, scripts] of used) {
    console.log(`Native handlers: building ${scripts.length} ${lang} handler(s) -> ce_handlers_${lang}${libExt()}`);
    const r = await buildLanguage(lang, scripts, { workRoot, binDir });
    if (r.ok) { console.log(`  ✓ ${lang}: +${(r.bytes / 1048576).toFixed(2)} MB`); built.push(r); }
    else { console.warn(`  ⚠ ${lang}: NOT built — ${r.error}. (${lang} handlers will not run in the shipped plugin.)`); failed.push(r); }
  }
  return { built, failed };
}
