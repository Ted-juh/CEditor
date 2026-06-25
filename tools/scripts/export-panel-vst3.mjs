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
const productName = (es.pluginName && es.pluginName.trim())
  || productNameArg || panelDoc.name || ('CEditor ' + path.basename(panel).replace(/\.[^.]+$/, ''));
const vendor = (es.vendor && es.vendor.trim()) || 'Tedjuh';
const version = (es.version && es.version.trim()) || '1.0.0';
let mfrCode = (es.manufacturerCode ?? '').trim() || 'Tdjh';
mfrCode = (mfrCode + 'xxxx').slice(0, 4);   // JUCE plugin manufacturer code must be exactly 4 chars
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
const ep = await import(pathToFileURL(path.join(repo, 'CE/web/src/CE_Application/utils/exportParameters.js')).href);
panelDoc.exportParameters = ep.deriveExportParameters(panelDoc);
const bakedPanel = path.join(outDir, `${productName}.cepanel`);
writeFileSync(bakedPanel, JSON.stringify(panelDoc, null, 2));
const panelAbs = bakedPanel.replace(/\\/g, '/');
console.log(`Baked ${panelDoc.exportParameters.length} parameters into ${bakedPanel}`);

// 2. Build the web bundle (the self-contained UI embedded into the plugin).
console.log('Building web bundle...');
execSync('npm run build', { cwd: path.join(repo, 'CE', 'web'), stdio: 'inherit' });

// 3. Configure (DEV_MODE OFF -> bundled UI, not localhost) with this panel's identity, build the
//    VST3 wrapper, copy to export-out, then restore DEV_MODE ON so the dev build dir is unchanged.
const vcvars = 'C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat';
const cfg = `cmake -S "${repo}" -B "${build}" -DCEDITOR_DEV_MODE=OFF -DCEDITOR_SCRIPTING=ON`
  + ` -DCEDITOR_PYTHON=${embedPython ? 'ON' : 'OFF'}`
  + ` -DCE_VST_PLUGIN_CODE=${id.pluginCode} "-DCE_VST_PRODUCT_NAME=${productName}"`
  + ` "-DCE_VST_COMPANY_NAME=${vendor}" -DCE_VST_MFR_CODE=${mfrCode} "-DCE_VST_VERSION=${version}"`
  + ` "-DCE_VST_PANEL_PATH=${panelAbs}"`;
const bld = `cmake --build "${build}" --target CEditorPlayerVST_VST3 --config Release`;
console.log('Configuring + building the plugin...');
try {
  execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && ${cfg} >nul && ${bld}"`, { stdio: 'inherit' });

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
  }
  else console.error('Build artifact not found:', built);
} finally {
  // Always restore dev mode so the editor's normal build keeps loading the Vite dev server.
  execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && cmake -S \"${repo}\" -B \"${build}\" -DCEDITOR_DEV_MODE=ON >nul"`, { stdio: 'inherit' });
}
