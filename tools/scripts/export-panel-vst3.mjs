// Phase D — compile-per-panel VST3 generator (compile backend).
//
// Given a panel document + its persisted GUID, derive the unique plugin identity (mirrors
// CE/src/Export/PanelExportIdentity.h) and build a uniquely-identified VST3 from the shared
// CEditorPlayerVST template via CMake cache vars. Distinct GUID -> distinct PLUGIN_CODE ->
// distinct VST3 FUID (the Ctrlr fix), even for identically-named panels.
//
// Usage: node export-panel-vst3.mjs <panel.cepanel> <guid> [productName]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
// Identity derivation is shared with the editor's Export-settings UI (single source of truth), so the
// codes shown in the editor are exactly what gets built. The self-check below still validates it
// against the canonical C++ output (PanelExportIdentity) on every run.
import { deriveIdentity } from '../../CE/web/src/CE_Application/utils/exportIdentity.js';
import { identityInputsFromPanel } from '../../CE/web/src/CE_Application/utils/panelIdentityInputs.js';
import { panelScriptLanguages, shouldEmbedPython } from './pythonEmbed.mjs';

// Self-check against the canonical C++ output (PanelExportIdentityTests).
{
  const t = deriveIdentity('guid-AAAA-1111', 'GAIA Filter', 'Tedjuh', 'Tdjh', '1.0.0');
  // pluginCode + auSubtype drive the VST3/AU FUID — these must match C++ exactly.
  if (t.pluginCode !== 'HlSQ' || t.auSubtype !== 'HU7n') {
    console.error('IDENTITY MISMATCH vs C++:', t);
    process.exit(2);
  }
  console.log('identity derivation matches C++ PanelExportIdentity (pluginCode/auSubtype) ✓');
}

const [panel, guid, productNameArg] = process.argv.slice(2);
if (!panel || !guid) {
  console.log('Usage: node export-panel-vst3.mjs <panel.cepanel> <guid> [productName]');
  process.exit(0);
}

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '../..');
const build = path.join(repo, 'build', 'native');   // reuse the configured build dir (incremental, fast)
const outDir = path.join(repo, 'export-out');

// Read the panel + its Export settings (Panel Properties → Export). These drive the plugin identity;
// the CLI productName arg and built-in defaults are fallbacks (keeps the CLI and in-app paths aligned).
const panelDoc = JSON.parse(readFileSync(panel, 'utf8'));
const es = panelDoc.exportSettings ?? {};
// The fallback chain lives in panelIdentityInputs.js rather than here, because the template
// exporter and the C++ a prebuilt player uses at load have to agree with it exactly — a different
// default is a different FUID, and the symptom is a saved DAW session that stops finding its
// plugin rather than anything that looks like a bug.
const { productName, vendor, version, manufacturerCode: mfrCode } =
  identityInputsFromPanel(panelDoc, path.basename(panel), { productName: productNameArg });
const id = deriveIdentity(guid, productName, vendor, mfrCode, version);
console.log('Export identity:', id);

// --- Python runtime inclusion (Export settings → Scripting Runtime) ---
// 'auto' embeds the native CPython runtime only when the panel actually has Python scripts; 'on'/'off'
// force it. Embedding links libpython into the plugin AND bundles the full stdlib next to the binary,
// so Python scripts run window-closed + offline (matching the Lua/JS window-closed runtimes).
// Detection (empty-stub exclusion + 'py' alias) lives in pythonEmbed.mjs so it is unit-tested and
// matches the shipped C++ isSourceScript predicate (non-empty source + language).
const hasPython = panelScriptLanguages(panelDoc).has('python');
const embedMode = es.embedPython ?? 'auto';
const embedPython = shouldEmbedPython(panelDoc, embedMode);
console.log(`Python runtime: mode=${embedMode}, panelHasPython=${hasPython} -> ${embedPython ? 'EMBED (native CPython + full stdlib)' : 'skip (no size cost)'}`);
if (embedMode === 'off' && hasPython)
  console.warn('  ⚠ Panel has Python scripts but embed is Off — they will NOT run window-closed (only window-open).');
// The native bundler below currently only lays out the Windows VST3 (Contents/x86_64-win + .dll). On
// macOS/Linux the embed links libpython but the runtime files are not yet bundled, so Python would run
// window-open only. Warn loudly rather than fail silently until the cross-platform bundler lands.
if (embedPython && process.platform !== 'win32')
  console.warn('  ⚠ Python embed requested, but the runtime bundler only fully supports the Windows VST3 layout yet — '
    + 'Python may NOT run window-closed on this platform (only window-open). Lua/JS are unaffected.');

// --- Native handlers (C++/C#/Java compiled-at-export) ---
// 'auto' (default) AOT-compiles the native-handler languages the panel actually uses, when their
// toolchain is present (index.mjs warns + skips any that's missing, so the export never hard-fails);
// 'on' forces it; 'off' keeps those handlers preview-only. When active it also links the loader
// (-DCEDITOR_NATIVE_HANDLERS=ON) so the shipped plugin can load the modules.
const nhMode = es.compileNativeHandlers ?? 'auto';
const nativeLangs = ['cpp', 'csharp', 'java'].filter((l) => panelScriptLanguages(panelDoc).has(l));
const compileNative = nhMode === 'on' || (nhMode === 'auto' && nativeLangs.length > 0);
console.log(`Native handlers: mode=${nhMode}, panel uses [${nativeLangs.join(', ') || 'none'}] -> ${compileNative ? 'COMPILE (toolchain permitting)' : 'skip'}`);

// --- On-demand toolchain provisioning ---
// Install ONLY the toolchains the languages THIS panel actually compiles need, and only if missing —
// the "download what you script in" model (see docs/scripting-language-options-and-shippable-export.md).
// Default on; set exportSettings.autoProvisionToolchains=false to manage toolchains yourself (Settings →
// Scripting Toolchains). Failures here are non-fatal: the per-language build below warns + skips.
if ((es.autoProvisionToolchains ?? true) && (compileNative || embedPython)) {
  const langsToBuild = [...(compileNative ? nativeLangs : []), ...(embedPython ? ['python'] : [])];
  try {
    const lm = await import(pathToFileURL(path.join(repo, 'tools/toolchains/languages.mjs')).href);
    // Only provision for languages that aren't already exportable (e.g. Python via a system python, or a
    // toolchain already provisioned) — so we never download an unused runtime.
    const notReady = langsToBuild.filter((l) => !lm.languageInstalled(l));
    const missing = [...lm.requiredToolchains(notReady)].filter((t) => !lm.toolchainProvisioned(t));
    if (missing.length) {
      console.log(`Toolchains: panel needs [${notReady.join(', ')}]; installing missing: ${missing.join(', ')} (one-time)...`);
      lm.provisionForLanguages(notReady);
    }
  } catch (e) {
    console.warn(`  ⚠ On-demand toolchain provisioning failed (${e?.message ?? e}); any language without its toolchain will be skipped.`);
  }
}

// True when CE/web/dist is newer than every web source/config file — i.e. a rebuild would be identical.
// Walks src + the build config; compares the newest source mtime against the oldest dist artifact mtime.
function webBundleFresh(webDir, dist) {
  const indexHtml = path.join(dist, 'index.html');
  if (!existsSync(indexHtml)) return false;
  const newest = (p, skip) => {
    let m = 0;
    const walk = (d) => {
      let ents; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (skip && skip(e.name)) continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp);
        else { try { const t = statSync(fp).mtimeMs; if (t > m) m = t; } catch { /* ignore */ } }
      }
    };
    if (existsSync(p)) { const st = statSync(p); st.isDirectory() ? walk(p) : (m = st.mtimeMs); }
    return m;
  };
  // Newest input: src tree + the build config files (node_modules/.bin excluded — not inputs).
  const srcNewest = newest(path.join(webDir, 'src'));
  let cfgNewest = 0;
  for (const f of ['vite.config.js', 'vite.config.ts', 'svelte.config.js', 'package.json', 'index.html'])
    cfgNewest = Math.max(cfgNewest, newest(path.join(webDir, f)));
  const inputNewest = Math.max(srcNewest, cfgNewest);
  // Oldest dist artifact (if ANY output predates an input, the bundle is stale).
  let distOldest = Infinity;
  const walkDist = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walkDist(fp);
      else { try { const t = statSync(fp).mtimeMs; if (t < distOldest) distOldest = t; } catch { /* ignore */ } }
    }
  };
  walkDist(dist);
  return distOldest >= inputNewest;
}

// --- size + python-bundling helpers ---
const mb = (bytes) => (bytes / 1048576).toFixed(1);
function dirSize(p) {
  const st = statSync(p);
  if (st.isFile()) return st.size;
  let total = 0;
  for (const entry of readdirSync(p)) total += dirSize(path.join(p, entry));
  return total;
}
function pythonInfo() {
  try {
    // One newline-separated query that works in both `cmd` and POSIX sh (single quotes inside, double
    // outside). POSIX fields (libdir/ldlibrary/instsoname/stdlib/dynload) are empty on Windows.
    const expr = "import sys,sysconfig as s;"
      + "print(sys.base_prefix);"
      + "print('%d.%d'%sys.version_info[:2]);"
      + "print(s.get_config_var('LIBDIR') or '');"
      + "print(s.get_config_var('LDLIBRARY') or '');"
      + "print(s.get_config_var('INSTSONAME') or '');"
      + "print(s.get_path('stdlib') or '');"
      + "print(s.get_config_var('DESTSHARED') or '')";
    const out = execSync(`python -c "${expr}"`, { encoding: 'utf8' }).trim().split(/\r?\n/);
    return { prefix: out[0], ver: out[1], libdir: out[2], ldlibrary: out[3], instsoname: out[4], stdlib: out[5], dynload: out[6] };
  } catch { return null; }
}
// The JUCE VST3 bundle puts the binary in a platform-specific subfolder: Contents/x86_64-win (Win),
// Contents/MacOS (mac), Contents/<arch>-linux (Linux). Pick the one that exists, with a sane default.
function vst3BinDir(vst3Dir) {
  const contents = path.join(vst3Dir, 'Contents');
  if (process.platform === 'darwin') return path.join(contents, 'MacOS');
  const want = process.platform === 'win32' ? /-win$/ : /-linux$/;
  const sub = existsSync(contents)
    ? readdirSync(contents).find((d) => want.test(d) && statSync(path.join(contents, d)).isDirectory())
    : null;
  return sub ? path.join(contents, sub)
             : path.join(contents, process.platform === 'win32' ? 'x86_64-win' : 'x86_64-linux');
}
// Copy the CPython runtime + full stdlib into the VST3 bundle (where the engine's resolvePythonHome()
// looks). Returns bytes added (0 if it couldn't locate a Python install).
// NOTE: the Windows layout is shipped + exercised; the macOS/Linux branch is UNVERIFIED — the exact
// PYTHONHOME stdlib layout and dylib/.so loader resolution must be confirmed against a native build.
function bundlePythonRuntime(vst3Dir) {
  const info = pythonInfo();
  if (!info) { console.warn('  ⚠ Python not found on PATH — runtime NOT bundled. Install Python or set it on PATH.'); return 0; }
  const binDir = vst3BinDir(vst3Dir);
  if (!existsSync(binDir)) { console.warn('  ⚠ VST3 binary dir not found, runtime NOT bundled:', binDir); return 0; }
  // resolvePythonHome() probes <module>/PythonRuntime and <module>/Resources/PythonRuntime; on mac the
  // binary is in Contents/MacOS so its Resources sibling is the natural home.
  const runtime = process.platform === 'darwin'
    ? path.join(vst3Dir, 'Contents', 'Resources', 'PythonRuntime')
    : path.join(binDir, 'PythonRuntime');
  mkdirSync(runtime, { recursive: true });
  // Exclude site-packages (third-party pip installs — NOT the stdlib, can be hundreds of MB) and
  // __pycache__ (compiled bytecode, regenerated on first import). Everything else is the full stdlib.
  const skip = (src) => {
    const n = src.replace(/\\/g, '/');
    return !/\/site-packages(\/|$)/.test(n) && !/\/__pycache__(\/|$)/.test(n);
  };
  let added = 0;

  if (process.platform === 'win32') {
    const verNoDot = info.ver.replace('.', '');
    // Interpreter DLLs are IMPLICITLY linked, so the loader must resolve them from the plugin's OWN
    // directory (it does NOT search subdirs). Place them next to the binary, NOT in PythonRuntime.
    for (const dll of ['python3.dll', `python${verNoDot}.dll`]) {
      const src = path.join(info.prefix, dll);
      if (existsSync(src)) { const dst = path.join(binDir, dll); cpSync(src, dst); added += statSync(dst).size; }
      else console.warn(`  ⚠ missing CPython DLL: ${src}`);
    }
    // Stdlib (Lib/) + C-extension modules (DLLs/) go in PythonRuntime/, where PYTHONHOME points.
    for (const dir of ['Lib', 'DLLs']) {
      const src = path.join(info.prefix, dir);
      if (existsSync(src)) { const dst = path.join(runtime, dir); cpSync(src, dst, { recursive: true, filter: skip }); added += dirSize(dst); }
      else console.warn(`  ⚠ missing CPython dir: ${src}`);
    }
  } else {
    // macOS/Linux: place the shared libpython next to the binary (rpath @loader_path / $ORIGIN — see
    // CMakeLists CEDITOR_PYTHON), and the stdlib + lib-dynload under PythonRuntime/lib/pythonX.Y.
    for (const lib of [info.ldlibrary, info.instsoname].filter(Boolean)) {
      const src = path.join(info.libdir, lib);
      if (existsSync(src)) { const dst = path.join(binDir, path.basename(src)); cpSync(src, dst); added += statSync(dst).size; }
      else console.warn(`  ⚠ missing libpython: ${src}`);
    }
    if (info.stdlib && existsSync(info.stdlib)) {
      const dst = path.join(runtime, 'lib', `python${info.ver}`);
      cpSync(info.stdlib, dst, { recursive: true, filter: skip }); added += dirSize(dst);
    } else console.warn('  ⚠ missing CPython stdlib dir:', info.stdlib);
    if (info.dynload && existsSync(info.dynload)) {
      const dst = path.join(runtime, 'lib', `python${info.ver}`, 'lib-dynload');
      cpSync(info.dynload, dst, { recursive: true, filter: skip }); added += dirSize(dst);
    }
  }
  if (added === 0) { console.warn('  ⚠ No CPython runtime files copied from', info.prefix); return 0; }
  console.log(`  Bundled CPython ${info.ver} (full stdlib) — interpreter lib beside the plugin, stdlib in PythonRuntime/`);
  return added;
}

// 1. Bake CURRENT exportParameters (params + device wire) into a temp copy of the panel, so the
//    plugin is always built from up-to-date data without mutating the user's file.
mkdirSync(outDir, { recursive: true });
// Ensure every TypeScript handler carries compiledJs (the shipped C++ host has no TS compiler — it runs
// the transpiled JS). The editor sets this on save, but a panel that wasn't re-saved, was imported, or
// was generated may lack it — transpile any that are missing so TS always runs window-closed.
{
  const ts = await import(pathToFileURL(path.join(repo, 'CE/web/src/CE_Application/scripting/tsService.js')).href);
  await ts.ensureTs();
  let fixed = 0;
  const fixTs = (s) => {
    if (s && s.language === 'typescript' && typeof s.source === 'string' && !(typeof s.compiledJs === 'string' && s.compiledJs)) {
      const js = ts.transpileTs(s.source);
      if (js != null) { s.compiledJs = js; fixed++; }
    }
  };
  for (const s of panelDoc.scripts ?? []) fixTs(s);
  for (const c of panelDoc.controls ?? []) for (const s of c?._children?.Scripts?.scripts ?? []) fixTs(s);
  if (fixed) console.log(`TypeScript: transpiled ${fixed} handler(s) to compiledJs for the shipped runtime`);
}

// Resolve the panel's scripting modules and BAKE the result in. `auto` (no declaration) is derived
// from what the scripts actually reference; an explicit list is closed over `requires`. Either way
// the shipped plugin reads a plain list — it has no scanner and should not need one, and resolving
// once here means the editor and the player can never disagree about which modules are on.
{
  const api = await import(pathToFileURL(path.join(repo, 'CE/web/src/CE_Application/scripting/panelApi.js')).href);
  const resolved = api.panelModules(panelDoc);
  if (resolved.unknown.length) {
    console.warn(`  WARNING: unknown scripting module(s) ignored: ${resolved.unknown.join(', ')}`);
  }
  // Third-party modules the panel uses are COPIED into the export. A shipped plugin has no
  // CEditor install to read one from, so a module left as a reference would break the export on
  // anybody else's machine — including the author's, once they uninstall it. Only what the panel
  // actually turned on: bundling the whole install would put someone else's module in an export
  // that never calls it.
  const ext = await import(pathToFileURL(path.join(repo, 'CE/web/src/CE_Application/scripting/extensionModules.js')).href);
  const bundled = ext.extensionsToBundle(resolved.enabled);
  if (resolved.missing.length) {
    // Not fatal, and deliberately so: the panel's other modules still work and the export still
    // runs. What is NOT acceptable is being quiet about it.
    console.warn(`  WARNING: ${resolved.missing.length} module(s) this panel needs are not installed `
      + `and cannot be bundled: ${resolved.missing.join(', ')}. Calls into them will log a notice `
      + 'in the exported plugin instead of acting.');
  }

  panelDoc.scripting = {
    ...(panelDoc.scripting ?? {}),
    modules: resolved.enabled,
    apiVersion: api.CE_API_VERSION,
  };
  if (bundled.length) panelDoc.scripting.extensions = bundled;
  else delete panelDoc.scripting.extensions;

  const cost = api.panelModuleCost(panelDoc);
  console.log(`Scripting: ${resolved.enabled.length} module(s) [${resolved.mode}] — ${resolved.enabled.join(', ')}`);
  console.log(`  surface ${(cost.total / 1024).toFixed(1)} KB across ${cost.languages.join(', ')}`
    + ` (+${(cost.shared / 1024).toFixed(1)} KB shared baseline)`);
  if (bundled.length) {
    console.log(`  bundled ${bundled.length} third-party module(s): `
      + bundled.map((m) => `${m.id}@${m.version}`).join(', '));
  }
}

const ep = await import(pathToFileURL(path.join(repo, 'CE/web/src/CE_Application/utils/exportParameters.js')).href);
panelDoc.exportParameters = ep.deriveExportParameters(panelDoc);
const bakedPanel = path.join(outDir, `${productName}.cepanel`);
writeFileSync(bakedPanel, JSON.stringify(panelDoc, null, 2));
const panelAbs = bakedPanel.replace(/\\/g, '/');
console.log(`Baked ${panelDoc.exportParameters.length} parameters into ${bakedPanel}`);

// 2. Build the web bundle (the self-contained UI embedded into the plugin). The bundle is
//    PANEL-INDEPENDENT (the .cepanel is loaded at runtime, not baked into the JS), so we only rebuild
//    it when the web sources changed since the last `dist/` — otherwise every export paid an ~18 s Vite
//    build for an identical bundle. Set exportSettings.forceWebBuild=true (or env CE_FORCE_WEB=1) to force.
{
  const webDir = path.join(repo, 'CE', 'web');
  const dist = path.join(webDir, 'dist');
  const forceWeb = es.forceWebBuild === true || process.env.CE_FORCE_WEB === '1';
  if (!forceWeb && webBundleFresh(webDir, dist)) {
    console.log('Web bundle: up-to-date (sources unchanged since last build) — skipping Vite build.');
  } else {
    console.log('Building web bundle...');
    execSync('npm run build', { cwd: webDir, stdio: 'inherit' });
  }
}

// 3. Configure (DEV_MODE OFF -> bundled UI, not localhost) with this panel's identity, build the
//    VST3 wrapper, copy to export-out, then restore DEV_MODE ON so the dev build dir is unchanged.
// Locate vcvars64.bat without hardcoding a machine-specific path: ask vswhere (the supported way),
// then fall back to the well-known VS 2022/2025 install roots.
function findVcvars() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = path.join(pf86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  try {
    if (existsSync(vswhere)) {
      const installPath = execSync(`"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`, { encoding: 'utf8' }).trim();
      const c = installPath && path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
      if (c && existsSync(c)) return c;
    }
  } catch { /* fall through to known roots */ }
  for (const root of [
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise',
    'C:\\Program Files\\Microsoft Visual Studio\\18\\Community',
  ]) {
    const c = path.join(root, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    if (existsSync(c)) return c;
  }
  return null; // not found — caller falls back to the bundled LLVM-MinGW toolchain
}

// --- CLAP format (Export settings → Formats → CLAP) ---
// Default ON: the .clap ships beside the .vst3 for Bitwig/Reaper/FL users; opt out with
// exportSettings.exportClap === false. The id is the derived reverse-DNS string — per-panel unique
// via the guid hash, no 4-char-code dance needed (see exportIdentity.js).
const exportClap = es.exportClap !== false;
console.log(`CLAP format: ${exportClap ? `BUILD (id ${id.clapId})` : 'skip (Export settings)'}`);

// LV2 is the other zero-gate JUCE format (AAX needs Avid's SDK + signing, VST2 licensing is closed,
// AU/AUv3 need a macOS build). Windows LV2 hosts are rare, so the toggle exists — but the default
// follows "every reachable format ships".
const exportLv2 = es.exportLv2 !== false;
const lv2Uri = `urn:ceditor:${id.clapId}`;
console.log(`LV2 format: ${exportLv2 ? `BUILD (uri ${lv2Uri})` : 'skip (Export settings)'}`);

if (exportClap && embedPython) {
  console.warn('  ⚠ Python embed + CLAP: the stdlib bundler only lays out the VST3 today — Python in the .clap '
    + 'runs window-open only until the CLAP layout lands. Lua/JS are unaffected.');
}

// The build targets, from the same two flags that set the cache vars — written once so a format
// can never be configured ON and then not built, which produces a silent "artifact not found".
const formatTargets = ['CEditorPlayerVST_VST3',
  ...(exportClap ? ['CEditorPlayerVST_CLAP'] : []),
  ...(exportLv2 ? ['CEditorPlayerVST_LV2'] : [])].join(' ');

// Common CMake cache vars (identity + feature flags), generator-agnostic.
const cacheVars = `-DCEDITOR_DEV_MODE=OFF -DCEDITOR_SCRIPTING=ON`
  + ` -DCEDITOR_PYTHON=${embedPython ? 'ON' : 'OFF'}`
  + ` -DCEDITOR_NATIVE_HANDLERS=${compileNative ? 'ON' : 'OFF'}`
  + ` -DCEDITOR_CLAP=${exportClap ? 'ON' : 'OFF'} "-DCE_CLAP_ID=${id.clapId}"`
  + ` -DCEDITOR_LV2=${exportLv2 ? 'ON' : 'OFF'} "-DCE_LV2_URI=${lv2Uri}"`
  + ` -DCE_VST_PLUGIN_CODE=${id.pluginCode} "-DCE_VST_PRODUCT_NAME=${productName}"`
  + ` "-DCE_VST_COMPANY_NAME=${vendor}" -DCE_VST_MFR_CODE=${mfrCode} "-DCE_VST_VERSION=${version}"`
  + ` "-DCE_VST_PANEL_PATH=${panelAbs}"`;

// Pick the build backend: a system Visual Studio if present (default, fully battle-tested), else the
// bundled self-contained LLVM-MinGW (the "done at install" path — no VS required). EXPERIMENTAL on the
// MinGW path until validated on Windows (JUCE software renderer; VST3 wrapper link tweak).
const { llvmMingwDir, ninjaExe } = await import(pathToFileURL(path.join(repo, 'tools/toolchains/resolveToolchain.mjs')).href);
const vcvars = findVcvars();
const mingw = vcvars ? null : llvmMingwDir();
let runBuild, runRestore;
if (vcvars) {
  console.log('Build backend: Visual Studio —', vcvars);
  const cfg = `cmake -S "${repo}" -B "${build}" ${cacheVars}`;
  const bld = `cmake --build "${build}" --target ${formatTargets} --config Release`;
  runBuild = () => execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && ${cfg} >nul && ${bld}"`, { stdio: 'inherit' });
  runRestore = () => execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && cmake -S \"${repo}\" -B \"${build}\" -DCEDITOR_DEV_MODE=ON >nul"`, { stdio: 'inherit' });
} else if (mingw) {
  const ninja = ninjaExe();
  if (!ninja) throw new Error('Ninja not found — run: node tools/toolchains/provision.mjs ninja');
  console.log('Build backend: bundled LLVM-MinGW (no Visual Studio) —', mingw, '[EXPERIMENTAL]');
  const tcFile = path.join(repo, 'tools/toolchains/llvm-mingw-win.cmake');
  const cfg = `cmake -S "${repo}" -B "${build}" -G Ninja -DCMAKE_MAKE_PROGRAM="${ninja}"`
    + ` -DCMAKE_TOOLCHAIN_FILE="${tcFile}" -DCE_LLVM_MINGW_DIR="${mingw}" -DCMAKE_BUILD_TYPE=Release ${cacheVars}`;
  const bld = `cmake --build "${build}" --target ${formatTargets}`;
  runBuild = () => { execSync(cfg, { stdio: 'inherit' }); execSync(bld, { stdio: 'inherit' }); };
  runRestore = () => execSync(`cmake -S "${repo}" -B "${build}" -DCEDITOR_DEV_MODE=ON`, { stdio: 'inherit' });
} else {
  throw new Error('No C++ build toolchain found. Install Visual Studio (Desktop C++) OR run: node tools/toolchains/provision.mjs llvm-mingw ninja');
}

console.log('Configuring + building the plugin...');
try {
  runBuild();

  const built = path.join(build, 'CEditorPlayerVST_artefacts', 'Release', 'VST3', `${productName}.vst3`);
  const dest = path.join(outDir, `${productName}.vst3`);
  if (existsSync(built)) {
    rmSync(dest, { recursive: true, force: true });   // clear stale output so the size report is accurate
    cpSync(built, dest, { recursive: true });
    const baseBytes = dirSize(dest);
    console.log(`EXPORTED: ${dest} (${mb(baseBytes)} MB base)`);
    if (embedPython) {
      const addedBytes = bundlePythonRuntime(dest);
      if (addedBytes > 0)
        console.log(`Python runtime: +${mb(addedBytes)} MB  →  total ${mb(baseBytes + addedBytes)} MB`);
    }
    if (compileNative) {
      const { compileNativeHandlers } = await import(pathToFileURL(path.join(repo, 'tools/scripts/nativeHandlers/index.mjs')).href);
      const binDir = vst3BinDir(dest);
      const report = await compileNativeHandlers(panelDoc, { binDir, workRoot: path.join(outDir, 'native-handlers', productName) });
      for (const b of report.built ?? []) console.log(`Native handlers: ${b.lang} module bundled (+${mb(b.bytes)} MB)`);
    }
  }
  else console.error('Build artifact not found:', built);

  if (exportClap) {
    // The wrapper derives its output directory from the shared target's LIBRARY_OUTPUT_DIRECTORY,
    // so the .clap normally lands beside the VST3 under <artefacts>/<config>/CLAP/ — but SEARCH the
    // build tree rather than hardcode it, in case the wrapper's layout shifts between versions.
    const findClap = (dir) => {
      if (!existsSync(dir)) return null;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === `${productName}.clap`) return p;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const hit = findClap(p);
          if (hit) return hit;
        }
      }
      return null;
    };
    const builtClap = findClap(path.join(build, 'CEditorPlayerVST_artefacts'));
    if (builtClap) {
      const destClap = path.join(outDir, `${productName}.clap`);
      rmSync(destClap, { force: true });
      cpSync(builtClap, destClap);
      console.log(`EXPORTED: ${destClap} (${mb(statSync(destClap).size)} MB)`);
    } else {
      console.error('CLAP artifact not found under', path.join(build, 'CEditorPlayerVST_artefacts'));
    }
  }

  if (exportLv2) {
    // An .lv2 is a DIRECTORY bundle — the binary plus its Turtle manifests — so it is copied
    // recursively and measured with dirSize, like the VST3 above and unlike the single-file .clap.
    const builtLv2 = path.join(build, 'CEditorPlayerVST_artefacts', 'Release', 'LV2', `${productName}.lv2`);
    if (existsSync(builtLv2)) {
      const destLv2 = path.join(outDir, `${productName}.lv2`);
      rmSync(destLv2, { recursive: true, force: true });
      cpSync(builtLv2, destLv2, { recursive: true });
      console.log(`EXPORTED: ${destLv2} (${mb(dirSize(destLv2))} MB)`);
    } else {
      console.error('LV2 artifact not found:', builtLv2);
    }
  }
} finally {
  // Always restore dev mode so the editor's normal build keeps loading the Vite dev server.
  runRestore();
}
