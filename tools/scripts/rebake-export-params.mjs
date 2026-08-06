// Re-derive a .cepanel's exportParameters with the current logic (e.g. after adding fields like the
// device wire) WITHOUT re-saving from the editor. Usage: node rebake-export-params.mjs <panel.cepanel>
//
// The controls are expanded first. A saved .cepanel stores each control as a diff against its
// type's defaults (see stores/documentShape.js), so `panel.controls` off a raw JSON.parse is
// sparse — deriving export parameters from it would read a Behavior or Value that is only absent
// because it was unchanged, and quietly bake a shorter parameter list than the panel actually has.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const panelPath = process.argv[2];
if (!panelPath) { console.error('Usage: node rebake-export-params.mjs <panel.cepanel>'); process.exit(1); }

// Resolved from this file rather than from an absolute path on one particular machine.
const webSrc = (rel) => pathToFileURL(path.join(REPO, 'CE/web/src/CE_Application', rel)).href;
const mod = await import(webSrc('utils/exportParameters.js'));
const { expandControl } = await import(webSrc('stores/documentShape.js'));

const panel = JSON.parse(readFileSync(panelPath, 'utf8'));
panel.controls = (panel.controls ?? []).map(expandControl);
panel.exportParameters = mod.deriveExportParameters(panel);  // force re-derive from controls
writeFileSync(panelPath, JSON.stringify(panel, null, 2));

console.log(`re-baked ${panel.exportParameters.length} params into ${panelPath}`);
for (const p of panel.exportParameters)
  console.log(`  ${p.id}  [${p.min}..${p.max}]  role=${p.deviceRole || '-'}  dev=${p.deviceParameterId || '-'}`);
