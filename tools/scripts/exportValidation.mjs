import { panelScriptLanguages, shouldEmbedPython } from './pythonEmbed.mjs';

/** A compiler report is not success when any required language failed. */
export function assertNativeHandlersBuilt(report) {
  const failed = report?.failed ?? [];
  if (failed.length) {
    throw new Error(`Required script handlers could not be built: ${failed.map((item) => `${item.lang}: ${item.error}`).join('; ')}. Install the required tools in Settings → Scripting Toolchains or correct the scripts, then retry.`);
  }
}

/** The copy-only exporter cannot add native handlers or a CPython runtime to a template. */
export function validateTemplateScripting(panelDoc) {
  const settings = panelDoc.exportSettings ?? {};
  const languages = panelScriptLanguages(panelDoc);
  const native = settings.compileNativeHandlers === 'off' ? []
    : ['cpp', 'csharp', 'java'].filter((lang) => languages.has(lang));
  const required = [...native, ...(shouldEmbedPython(panelDoc, settings.embedPython ?? 'auto') ? ['python'] : [])];
  if (required.length) {
    throw new Error(`This panel requires ${required.join(', ')} runtime support. The compiler-free exporter cannot bundle it. Use the compiling exporter, or explicitly turn off the corresponding Scripting Runtime option in Panel Properties → Export to export without it.`);
  }
}

/** Extra runtimes are currently laid out only inside the VST3 bundle. */
export function validateRuntimeFormats(panelDoc) {
  const settings = panelDoc.exportSettings ?? {};
  const languages = panelScriptLanguages(panelDoc);
  const native = settings.compileNativeHandlers !== 'off'
    && ['cpp', 'csharp', 'java'].some((lang) => languages.has(lang));
  if (!(native || shouldEmbedPython(panelDoc, settings.embedPython ?? 'auto'))) return;
  const unsupported = [settings.exportClap !== false && 'CLAP', settings.exportLv2 !== false && 'LV2'].filter(Boolean);
  if (unsupported.length) {
    throw new Error(`Required script runtimes can currently be bundled only with VST3. Disable ${unsupported.join(' and ')} in Panel Properties → Export, then retry. Those formats would otherwise be missing the runtime files.`);
  }
}
