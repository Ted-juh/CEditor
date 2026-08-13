export const COMPACT_CHROME_BREAKPOINT = 920;

export function classifyWorkspace({ activeTab = null, componentWorkspaceMode = 'panel' } = {}) {
  const activeType = activeTab?.type ?? 'panel';
  if (componentWorkspaceMode === 'surface' && (activeType === 'panel' || activeType === 'component')) return 'component';
  if (activeTab?.type === 'deviceProfile') return 'device';
  if (activeTab?.type === 'script') return 'script';
  if (activeTab?.type === 'component') return 'component';
  if (activeTab?.type === 'settings') return 'settings';
  return 'panel';
}

export function workspaceOwnsChrome(workspaceKind) {
  return ['component', 'device', 'script'].includes(workspaceKind);
}

export function resolveWorkspaceChrome({
  activeTab = null,
  componentWorkspaceMode = 'panel',
  viewportWidth = Number.POSITIVE_INFINITY,
  showTreePanel = true,
  showDisplayPanel = false,
  showPropertiesPanel = true,
} = {}) {
  const workspaceKind = classifyWorkspace({ activeTab, componentWorkspaceMode });
  const ownsChrome = workspaceOwnsChrome(workspaceKind);
  const compactPanel = workspaceKind === 'panel' && Number(viewportWidth) > 0 && Number(viewportWidth) < COMPACT_CHROME_BREAKPOINT;

  // The Custom Component Designer renders its OWN DisplayPanel inside its centre
  // column (between the full-height palette and inspector), so the App-level
  // shared DisplayPanel is hidden here just like for other chrome-owning
  // workspaces — it stays available only in the panel editor.
  //
  // The properties panel is the exception (restructure Stage A): while the
  // component workspace is open it hosts the AUTHOR tab set (Interact / React
  // / Assets / Publish / Test Bench), so it must stay visible — it is the
  // author inspector, not panel-editor chrome. Forced on (not merely allowed)
  // because the icon-panel toggle that could re-show it is itself hidden in
  // owned-chrome workspaces.
  return {
    workspaceKind,
    ownsChrome,
    compactPanel,
    chromeWorkspaceActive: ownsChrome,
    showTreePanel: !ownsChrome && !compactPanel && showTreePanel,
    showDisplayPanel: !ownsChrome && !compactPanel && showDisplayPanel,
    showPropertiesPanel: workspaceKind === 'component'
      ? true
      : (!ownsChrome && !compactPanel && showPropertiesPanel),
    // The icon rail is part of the persistent shell: it stays at every
    // workspace and width, so switching tabs no longer tears the whole
    // frame down — and the panel toggles can't vanish along with the
    // panels they restore (the old sub-920px trap). What varies is what
    // the rail may DO:
    iconWidth: 48,
    // Panel toggles only operate where the panels themselves are allowed.
    railTogglesEnabled: !ownsChrome && !compactPanel,
    // Insertion only targets the panel canvas — never a hidden panel
    // behind the component/script/device workspaces.
    railInsertEnabled: workspaceKind === 'panel',
  };
}
