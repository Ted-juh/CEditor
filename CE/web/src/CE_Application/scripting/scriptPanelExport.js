// Gather the scripts a panel ships with. Scripts are stored and run as-is (CLAUDE.md), so
// there is nothing to compile here — the exported player hands these straight to the runtime.
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
