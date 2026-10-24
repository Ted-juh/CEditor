// Re-derive a .cepanel's exportParameters with the current logic (e.g. after adding fields like the
// device wire) WITHOUT re-saving from the editor. Usage: node rebake-export-params.mjs <panel.cepanel>
//
// The controls are expanded first. A saved .cepanel stores each control as a diff against its
// type's defaults (see stores/documentShape.js), so `panel.controls` off a raw JSON.parse is
// sparse — deriving export parameters from it would read a Behavior or Value that is only absent
// because it was unchanged, and quietly bake a shorter parameter list than the panel actually has.
// Before that, a drawing several controls share is put back into each (stores/documentDrawings.js),
// and the defaults the entries of a control's lists leave out go back in (stores/documentEntries.js).
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
const { panelDocumentText } = await import(webSrc('stores/documentLayout.js'));
const { resolveDrawings } = await import(webSrc('stores/documentDrawings.js'));
const { restoreDocumentEntries } = await import(webSrc('stores/documentEntries.js'));
const { panelFormatVersion } = await import(webSrc('utils/panelFormat.js'));

// Derived from the whole controls, written back into the document as it was: only the list changes.
// This wrote the expanded controls back once, without the drawings table, into a file that still
// said it was a saved one.
const saved = JSON.parse(readFileSync(panelPath, 'utf8'));
const panel = restoreDocumentEntries(resolveDrawings(saved).doc, panelFormatVersion(saved));
const controls = (panel.controls ?? []).map(expandControl);
saved.exportParameters = mod.deriveExportParameters({ ...panel, controls });  // force re-derive from controls
writeFileSync(panelPath, panelDocumentText(saved));   // the layout serializePanel writes

console.log(`re-baked ${saved.exportParameters.length} params into ${panelPath}`);
for (const p of saved.exportParameters)
  console.log(`  ${p.id}  [${p.min}..${p.max}]  role=${p.deviceRole || '-'}  dev=${p.deviceParameterId || '-'}`);
