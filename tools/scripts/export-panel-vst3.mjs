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
function panelScriptLanguages(doc) {
  const langs = new Set();
  for (const s of doc.scripts ?? []) if (s?.enabled !== false) langs.add(s?.language);
  for (const c of doc.controls ?? []) {
    const sec = c?._children?.Scripts;
    if (sec?.enabled === false) continue;
    for (const s of sec?.scripts ?? []) if (s?.enabled !== false) langs.add(s?.language);
  }
  return langs;
}
const hasPython = panelScriptLanguages(panelDoc).has('python');
const embedMode = es.embedPython ?? 'auto';
const embedPython = embedMode === 'on' || (embedMode === 'auto' && hasPython);
console.log(`Python runtime: mode=${embedMode}, panelHasPython=${hasPython} -> ${embedPython ? 'EMBED (native CPython + full stdlib)' : 'skip (no size cost)'}`);
if (embedMode === 'off' && hasPython)
  console.warn('  ⚠ Panel has Python scripts but embed is Off — they will NOT run window-closed (only window-open).');

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
    const out = execSync(
      'python -c "import sys; print(sys.base_prefix); print(\'%d.%d\' % sys.version_info[:2])"',
      { encoding: 'utf8' }
    ).trim().split(/\r?\n/);
    return { prefix: out[0], ver: out[1] };
  } catch { return null; }
}
// Copy the CPython runtime + full stdlib into <vst3>/Contents/x86_64-win/PythonRuntime (where the
// engine's resolvePythonHome() looks). Returns bytes added (0 if it couldn't locate a Python install).
function bundlePythonRuntime(vst3Dir) {
  const info = pythonInfo();
  if (!info) { console.warn('  ⚠ Python not found on PATH — runtime NOT bundled. Install Python or set it on PATH.'); return 0; }
  const binDir = path.join(vst3Dir, 'Contents', 'x86_64-win');
  if (!existsSync(binDir)) { console.warn('  ⚠ VST3 binary dir not found, runtime NOT bundled:', binDir); return 0; }
  const runtime = path.join(binDir, 'PythonRuntime');
  mkdirSync(runtime, { recursive: true });
  const verNoDot = info.ver.replace('.', '');
  // Exclude site-packages (third-party pip installs — NOT the stdlib, can be hundreds of MB) and
  // __pycache__ (compiled bytecode, regenerated on first import). Everything else under Lib/ is the
  // genuine full standard library.
  const skip = (src) => {
    const n = src.replace(/\\/g, '/');
    return !/\/site-packages(\/|$)/.test(n) && !/\/__pycache__(\/|$)/.test(n);
  };
  let added = 0;
  // The interpreter DLLs are IMPLICITLY linked, so the loader must resolve them from the plugin's OWN
  // directory at load time (it does NOT search subdirs). Place python3.dll + pythonXX.dll next to the
  // plugin binary — NOT in PythonRuntime — or the plugin won't load on a machine without Python on PATH.
  for (const dll of ['python3.dll', `python${verNoDot}.dll`]) {
    const src = path.join(info.prefix, dll);
    if (existsSync(src)) { const dst = path.join(binDir, dll); cpSync(src, dst); added += statSync(dst).size; }
    else console.warn(`  ⚠ missing CPython DLL: ${src}`);
  }
  // The stdlib (Lib/) + C-extension modules (DLLs/) go in PythonRuntime/, which the engine points
  // PYTHONHOME at (resolvePythonHome) so <home>/Lib + <home>/DLLs are on sys.path.
  for (const dir of ['Lib', 'DLLs']) {
    const src = path.join(info.prefix, dir);
    if (existsSync(src)) { const dst = path.join(runtime, dir); cpSync(src, dst, { recursive: true, filter: skip }); added += dirSize(dst); }
    else console.warn(`  ⚠ missing CPython dir: ${src}`);
  }
  if (added === 0) { console.warn('  ⚠ No CPython runtime files copied from', info.prefix); return 0; }
  console.log(`  Bundled CPython ${info.ver} (full stdlib) — interpreter DLLs beside the plugin, stdlib in PythonRuntime/`);
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
