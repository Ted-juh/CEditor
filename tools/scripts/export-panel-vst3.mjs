// Phase D — compile-per-panel VST3 generator (compile backend).
//
// Given a panel document + its persisted GUID, derive the unique plugin identity (mirrors
// CE/src/Export/PanelExportIdentity.h) and build a uniquely-identified VST3 from the shared
// CEditorPlayerVST template via CMake cache vars. Distinct GUID -> distinct PLUGIN_CODE ->
// distinct VST3 FUID (the Ctrlr fix), even for identically-named panels.
//
// Usage: node export-panel-vst3.mjs <panel.cepanel> <guid> [productName]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
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
  + ` -DCE_VST_PLUGIN_CODE=${id.pluginCode} "-DCE_VST_PRODUCT_NAME=${productName}"`
  + ` "-DCE_VST_COMPANY_NAME=${vendor}" -DCE_VST_MFR_CODE=${mfrCode} "-DCE_VST_VERSION=${version}"`
  + ` "-DCE_VST_PANEL_PATH=${panelAbs}"`;
const bld = `cmake --build "${build}" --target CEditorPlayerVST_VST3 --config Release`;
console.log('Configuring + building the plugin...');
try {
  execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && ${cfg} >nul && ${bld}"`, { stdio: 'inherit' });

  const built = path.join(build, 'CEditorPlayerVST_artefacts', 'Release', 'VST3', `${productName}.vst3`);
  const dest = path.join(outDir, `${productName}.vst3`);
  if (existsSync(built)) { cpSync(built, dest, { recursive: true }); console.log('EXPORTED:', dest); }
  else console.error('Build artifact not found:', built);
} finally {
  // Always restore dev mode so the editor's normal build keeps loading the Vite dev server.
  execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && cmake -S \"${repo}\" -B \"${build}\" -DCEDITOR_DEV_MODE=ON >nul"`, { stdio: 'inherit' });
}
