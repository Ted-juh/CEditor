import { deriveExportParameters } from '../utils/exportParameters.js';
import { panelModules, CE_API_VERSION } from '../scripting/panelApi.js';
import { extensionsToBundle } from '../scripting/extensionModules.js';
import { ensureTs, transpileTs } from '../scripting/tsService.js';
import { packagePanelForSharing, openSharedPanel } from './panelSharing.js';

/** Prepare the same complete document for either native exporter. */
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

  const scripts = [...(panel.scripts ?? []), ...(panel.controls ?? [])
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
  panel.exportParameters = deriveExportParameters(panel);
  return JSON.stringify(panel);
}
