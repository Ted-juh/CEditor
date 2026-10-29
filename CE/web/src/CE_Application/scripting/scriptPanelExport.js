import { getChildControls } from '../utils/containment.js';

/**
 * Every control a script can be attached to, in document order with a container before its
 * children: the entries `panel.controls` lists, then the controls inside each container, at any
 * depth. `panel.controls` is only the top level — a container's children live in its own Children
 * section — and reading only it left the script of every control inside a container out of the
 * plug-in while the editor ran it. Everything that gathers a panel's scripts for export walks this,
 * and gatherPanelScripts (Player/PanelValueModel.h) walks the same tree.
 */
export function controlsInTree(controls) {
  const out = [];
  const visit = (control) => {
    out.push(control);
    for (const child of getChildControls(control)) visit(child);
  };
  for (const control of controls ?? []) visit(control);
  return out;
}

// Gather the scripts a panel ships with. Scripts are stored and run as-is (CLAUDE.md), so
// there is nothing to compile here — the exported player hands these straight to the runtime.
export function collectPanelExportScripts(panel) {
  if (!panel || panel?.scripting?.enabled === false || panel?.scripting?.runOnExport === false) return [];
  const panelScripts = Array.isArray(panel?.scripts) ? panel.scripts.map((script) => ({ ...script, scope: script.scope ?? 'panel' })) : [];
  const controlScripts = [];

  for (const control of controlsInTree(panel.controls)) {
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
