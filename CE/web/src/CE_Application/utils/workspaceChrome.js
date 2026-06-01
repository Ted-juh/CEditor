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

  return {
    workspaceKind,
    ownsChrome,
    compactPanel,
    chromeWorkspaceActive: ownsChrome,
    showTreePanel: !ownsChrome && !compactPanel && showTreePanel,
    showDisplayPanel: !ownsChrome && !compactPanel && showDisplayPanel,
    showPropertiesPanel: !ownsChrome && !compactPanel && showPropertiesPanel,
    iconWidth: ownsChrome || compactPanel ? 0 : 48,
  };
}
