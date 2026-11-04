import { deriveExportParameters } from '../utils/exportParameters.js';
import { panelModules, CE_API_VERSION } from '../scripting/panelApi.js';
import { extensionsToBundle } from '../scripting/extensionModules.js';
import { ensureTs, transpileTs } from '../scripting/tsService.js';
import { packagePanelForSharing, openSharedPanel } from './panelSharing.js';
import { exportFormDocument } from './panelModel.js';
import { controlsInTree } from '../scripting/scriptPanelExport.js';
import { bakeRenderedLooks } from '../utils/renderedLook.js';
import { getControlSet, isTokenReference, resolveColourLiteral } from '../models/controlSets.js';
import { resolveControlForSet } from '../models/controlSetFamilies.js';

/**
 * Prepare the same document for either native exporter: assets carried, TypeScript compiled,
 * modules and host parameters baked, and last, the export form the plug-in is built from.
 */
export async function preparePanelForExport(serialized) {
  const original = JSON.parse(serialized);
  const packed = await packagePanelForSharing(original);
  if (!packed.ok || packed.missing.length) {
    throw new Error(`Cannot export: panel assets could not be read: ${(packed.missing ?? packed.issues ?? []).join(', ')}. Locate those files and retry.`);
  }
  const opened = await openSharedPanel(packed.envelope);
  if (!opened.ok) throw new Error(`Cannot prepare export assets: ${opened.issues.join(', ')}`);
  const panel = opened.panel;
  delete panel.filePath;
  // Unlike a shared document, plugin export deliberately carries Total Recall.
  if (original.deviceSession) panel.deviceSession = original.deviceSession;

  // Every control's, a container's children included: the player loads the scripts of the whole
  // tree (collectPanelExportScripts), so a nested control's TypeScript needs its compiledJs too.
  const scripts = [...(panel.scripts ?? []), ...controlsInTree(panel.controls)
    .flatMap((control) => control?._children?.Scripts?.scripts ?? [])];
  const typescript = scripts.filter((script) => script.language === 'typescript' && script.source?.trim());
  if (typescript.length) {
    if (!await ensureTs()) throw new Error('TypeScript compiler could not load. Retry after restarting the editor.');
    for (const script of typescript) script.compiledJs = transpileTs(script.source);
  }
  const modules = panelModules(panel);
  if (modules.unknown.length || modules.missing.length) {
    throw new Error(`Cannot export unavailable scripting modules: ${[...modules.unknown, ...modules.missing].join(', ')}. Install them or remove their use from this panel.`);
  }
  const extensions = extensionsToBundle(modules.enabled);
  panel.scripting = { ...(panel.scripting ?? {}), modules: modules.enabled, apiVersion: CE_API_VERSION };
  if (extensions.length) panel.scripting.extensions = extensions;
  else delete panel.scripting.extensions;
  // Rendered looks (utils/renderedLook.js), baked here where WebGL is, so the plug-in carries their
  // images and needs none: the owner's choice, live in the editor and baked at export.
  // Each control as it is drawn, its set's family applied and its colour roles resolved, so the
  // images are the ones its parts ask for in the plug-in.
  const sources = { document: panel.controlSets ?? [] };
  const panelSet = getControlSet(panel.controlSet?.id, sources);
  const looks = await bakeRenderedLooks(controlsInTree(panel.controls), {
    lamp: panelSet?.lamp ?? null,
    resolve: (control) => resolveControlForSet(control, panelSet, sources),
    // A component's state may colour a rendered layer by a role; it draws in the set's colour.
    resolveColour: (value) => (isTokenReference(value) ? resolveColourLiteral(value, panelSet, value) : value),
  });
  if (Object.keys(looks.images).length) panel.renderedLookImages = looks.images;
  else delete panel.renderedLookImages;
  if (looks.failed) console.warn(`[export] ${looks.failed} rendered look image(s) could not be made; those parts draw their plain fill in the plug-in.`);
  panel.exportParameters = deriveExportParameters(panel);
  // Last, because everything above reads whole controls (exportFormDocument says why).
  return JSON.stringify(exportFormDocument(panel));
}
