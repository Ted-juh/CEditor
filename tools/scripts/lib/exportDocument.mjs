// exportDocument.mjs — a saved .cepanel made into the complete document a plug-in is built from.
//
// A saved .cepanel stores each control as a difference from its type's defaults
// (CE/web/src/CE_Application/stores/documentShape.js). The plug-in's C++ reader
// (Player/PanelValueModel.h) cannot rebuild a default it never saw, so it needs every field written
// out, colour-set tokens resolved to literals, and the export parameters derived from full controls.
// The editor does exactly that before it hands a panel to the exporter (serializePanelForExport in
// stores/panels.js). Anything that bakes a saved file directly did not:
//
//   - `export-panel-vst3.mjs <saved.cepanel>` derived the host parameter list from the sparse
//     controls, which rebake-export-params.mjs already warned "quietly bakes a shorter parameter
//     list than the panel actually has";
//   - a plug-in built with -DCE_VST_PANEL_PATH=<saved.cepanel> lacked every default-valued field.
//     Found by pluginval: the GAIA panel's window-closed scripts wrote text colours and tooltips to
//     paths that were not there, about 14,000 refused writes per run.
//
// So a sparse document goes through the editor's own load and export path, the same code the app
// runs. A document that is already complete — what the app sends — is returned unchanged.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = (rel) => pathToFileURL(path.join(REPO, 'CE/web/src/CE_Application', rel)).href;

/**
 * True unless the document says it is complete (`documentForm: "complete"`, written by the editor's
 * export serialisation). No structural test can tell: an item the author deleted from a type's
 * defaults is absent from a complete control and from a sparse one alike.
 */
export function isSparseDocument(doc) {
  return doc?.documentForm !== 'complete';
}

/**
 * The complete export document for `doc` (parsed JSON). `filePath` names the panel for the editor's
 * loader. Throws when the document cannot be opened, with the loader's reason.
 */
export async function completeExportDocument(doc, filePath = null) {
  if (!isSparseDocument(doc)) return doc;
  const { deserializePanel, panelOpenReport } = await import(webSrc('stores/panelModel.js'));
  const { serializePanelForExport } = await import(webSrc('stores/panels.js'));
  const panel = deserializePanel(JSON.stringify(doc), filePath, doc.name ?? null);
  if (!panel) throw new Error(`Cannot export: ${panelOpenReport().error}`);
  const complete = JSON.parse(serializePanelForExport(panel));
  // Carried as they were: the editor's export keeps the panel's identity and its baked settings.
  if (doc.panelGuid) complete.panelGuid = doc.panelGuid;
  return complete;
}
