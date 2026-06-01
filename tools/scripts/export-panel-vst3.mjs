// Phase D — compile-per-panel VST3 generator (compile backend).
//
// Given a panel document + its persisted GUID, derive the unique plugin identity (mirrors
// CE/src/Export/PanelExportIdentity.h) and build a uniquely-identified VST3 from the shared
// CEditorPlayerVST template via CMake cache vars. Distinct GUID -> distinct PLUGIN_CODE ->
// distinct VST3 FUID (the Ctrlr fix), even for identically-named panels.
//
// Usage: node export-panel-vst3.mjs <panel.cepanel> <guid> [productName]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';

const MASK = (1n << 64n) - 1n;
function fnv1a(str, salt) {
  let h = (1469598103934665603n ^ salt) & MASK;
  for (const b of Buffer.from(str, 'utf8')) {
    h = (h ^ BigInt(b)) & MASK;
    h = (h * 1099511628211n) & MASK;
  }
  return h;
}
function code4(h) {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = upper[Number(h % 26n)];
  h /= 26n;
  for (let i = 0; i < 3; i++) { out += alnum[Number(h % 62n)]; h /= 62n; }
  return out;
}
function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function deriveIdentity(guid, name, vendor, mfrCode, version) {
  const pluginCode = code4(fnv1a(guid, 0x9E3779B97F4A7C15n));
  const auSubtype = code4(fnv1a(guid, 0xC2B2AE3D27D4EB4Fn));
  const shortGuid = ((fnv1a(guid, 0n) >> 32n) & 0xFFFFFFFFn).toString(16).padStart(8, '0');
  const clapId = `com.${slug(vendor || 'ceditor')}.${slug(name) ? slug(name) + '.' : ''}${shortGuid}`;
  return { guid, productName: name || 'CEditor Panel', vendor, mfrCode, version, pluginCode, auSubtype, clapId };
}

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
const build = path.join(repo, 'build', 'native');
const productName = productNameArg || ('CEditor ' + path.basename(panel).replace(/\.[^.]+$/, ''));
const id = deriveIdentity(guid, productName, 'Tedjuh', 'Tdjh', '1.0.0');
const panelAbs = path.resolve(panel).replace(/\\/g, '/');
console.log('Export identity:', id);

const vcvars = 'C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat';
const cfg = `cmake -S "${repo}" -B "${build}" -DCE_VST_PLUGIN_CODE=${id.pluginCode} "-DCE_VST_PRODUCT_NAME=${productName}" "-DCE_VST_PANEL_PATH=${panelAbs}"`;
const bld = `cmake --build "${build}" --target CEditorPlayerVST_VST3 --config Release`;
console.log('Configuring + building...');
execSync(`cmd /c "\"${vcvars}\" >nul 2>&1 && ${cfg} >nul 2>&1 && ${bld}"`, { stdio: 'inherit' });

const built = path.join(build, 'CEditorPlayerVST_artefacts', 'Release', 'VST3', `${productName}.vst3`);
const outDir = path.join(repo, 'export-out');
mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, `${productName}.vst3`);
if (existsSync(built)) { cpSync(built, dest, { recursive: true }); console.log('Exported:', dest); }
else console.error('Build artifact not found:', built);
