// exportDocument.mjs — any .cepanel made into the export payload a plug-in is built from.
//
// The payload is the export form (exportFormDocument in CE/web/src/CE_Application/stores/
// panelModel.js): controls written as a diff against their types, as a saved document's are, with
// colour-set tokens resolved to literals, the export parameters derived from full controls, and the
// defaults the diff is against carried alongside (`controlDefaults`), from which the plug-in's C++
// (Player/PanelValueModel.h) rebuilds each control, and each drawing several controls share written
// once (`drawings`, stores/documentDrawings.js). The editor makes it at the end of its own export
// preparation (preparePanelForExport). Anything that bakes a saved file directly did not, and twice
// that produced a plug-in that looked fine and was not:
//
//   - `export-panel-vst3.mjs <saved.cepanel>` derived the host parameter list from the sparse
//     controls, which rebake-export-params.mjs already warned "quietly bakes a shorter parameter
//     list than the panel actually has";
//   - a plug-in built with -DCE_VST_PANEL_PATH=<saved.cepanel> lacked every default-valued field.
//     Found by pluginval: the GAIA panel's window-closed scripts wrote text colours and tooltips to
//     paths that were not there, about 14,000 refused writes per run. A saved file is sparse and
//     carries no defaults, so the C++ has nothing to rebuild them from.
//
// So a document that is not yet in the export form goes through the editor's own load and export
// path, the same code the app runs. One that is, what the app sends, is returned unchanged.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = (rel) => pathToFileURL(path.join(REPO, 'CE/web/src/CE_Application', rel)).href;

/**
 * True when the document is already the export payload (`documentForm: "export"`). No structural
 * test can tell: a saved document is a diff too, and only the mark says the defaults came with it.
 */
export function isExportForm(doc) {
  return doc?.documentForm === 'export';
}

/**
 * The export payload for `doc` (parsed JSON). `filePath` names the panel for the editor's loader.
 * Throws when the document cannot be opened, with the loader's reason.
 */
export async function exportFormFor(doc, filePath = null) {
  if (isExportForm(doc)) return doc;
  const { deserializePanel, exportFormDocument, panelOpenReport } = await import(webSrc('stores/panelModel.js'));
  // The complete form an older editor handed over is already baked: only its form changes.
  if (doc?.documentForm === 'complete') return exportFormDocument(doc);
  const { serializePanelForExport } = await import(webSrc('stores/panels.js'));
  const panel = deserializePanel(JSON.stringify(doc), filePath, doc.name ?? null);
  if (!panel) throw new Error(`Cannot export: ${panelOpenReport().error}`);
  const payload = exportFormDocument(JSON.parse(serializePanelForExport(panel)));
  // Carried as they were: the editor's export keeps the panel's identity and its baked settings.
  // The name too: the editor's loader names a panel after its FILE, as it does when you open one,
  // and the product name falls back to the panel's name — so "Validation" saved as panel.cepanel
  // exported as panel.vst3.
  if (doc.panelGuid) payload.panelGuid = doc.panelGuid;
  if (doc.name) payload.name = doc.name;
  return payload;
}
