import { SCRIPT_TARGETS } from './scriptCommandRegistry.js';
import { buildExportSummary, emitScript, exportWarningsForScript } from './scriptEmitters.js';
import { validateScriptForProject } from './scriptProjectValidation.js';

export function collectPanelExportScripts(panel) {
  if (!panel || panel?.scripting?.enabled === false || panel?.scripting?.runOnExport === false) return [];
  const panelScripts = Array.isArray(panel?.scripts) ? panel.scripts.map((script) => ({ ...script, scope: script.scope ?? 'panel' })) : [];
  const controlScripts = [];

  for (const control of panel.controls ?? []) {
    const controlId = String(control?._children?.Core?.id ?? '');
    const scripts = control?._children?.Scripts?.scripts;
    if (control?._children?.Scripts?.enabled === false || !Array.isArray(scripts)) continue;
    for (const script of scripts) {
      controlScripts.push({
        ...script,
        scope: script.scope ?? 'component',
        target: script.target ?? controlId,
      });
    }
  }

  return [...panelScripts, ...controlScripts].filter((script) => script?.enabled !== false);
}

export function compilePanelScripts(panel, targetId = 'ce') {
  const target = SCRIPT_TARGETS.find((item) => item.id === targetId) ?? SCRIPT_TARGETS[0];
  const scripts = collectPanelExportScripts(panel);
  const files = scripts.map((script) => ({
    scriptId: script.id,
    name: script.name,
    scope: script.scope,
    target: target.id,
    extension: target.extension,
    code: emitScript(script, target.id),
    warnings: exportWarningsForScript(script),
    issues: validateScriptForProject(script, { panel }),
  }));

  return {
    panelId: panel?.id ?? null,
    panelName: panel?.name ?? '',
    target: target.id,
    generatedAt: new Date(0).toISOString(),
    scripts: files,
    warnings: files.flatMap((file) => file.warnings.map((message) => ({ scriptId: file.scriptId, message }))),
    issues: files.flatMap((file) => file.issues.map((issue) => ({ scriptId: file.scriptId, ...issue }))),
  };
}

export function compileScriptWorkspace(document) {
  const scripts = Array.isArray(document?.scripts) ? document.scripts : [];
  return {
    documentId: document?.id ?? '',
    name: document?.name ?? '',
    scripts: scripts.map((script) => ({
      ...buildExportSummary(script),
      scriptId: script.id,
      name: script.name,
    })),
  };
}
