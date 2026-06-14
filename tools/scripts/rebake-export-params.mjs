// Re-derive a .cepanel's exportParameters with the current logic (e.g. after adding fields like the
// device wire) WITHOUT re-saving from the editor. Usage: node rebake-export-params.mjs <panel.cepanel>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const panelPath = process.argv[2];
if (!panelPath) { console.error('Usage: node rebake-export-params.mjs <panel.cepanel>'); process.exit(1); }

const mod = await import(pathToFileURL('C:/dev/Projects/CEditor/CE/web/src/CE_Application/utils/exportParameters.js').href);
const panel = JSON.parse(readFileSync(panelPath, 'utf8'));
panel.exportParameters = mod.deriveExportParameters(panel);  // force re-derive from controls
writeFileSync(panelPath, JSON.stringify(panel, null, 2));

console.log(`re-baked ${panel.exportParameters.length} params into ${panelPath}`);
for (const p of panel.exportParameters)
  console.log(`  ${p.id}  [${p.min}..${p.max}]  role=${p.deviceRole || '-'}  dev=${p.deviceParameterId || '-'}`);
