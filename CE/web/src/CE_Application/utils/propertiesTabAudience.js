// Audience gating for the properties panel tab bar (restructure Stage A).
//
// A selected custom component means two different things: *using* an instance
// placed on a panel, or *authoring* the component's internals while the
// Designer workspace is open. Each tab declares which audience it serves;
// the panel filters by the active context. Non-custom controls are never
// filtered — the split only exists for custom components.
//
// Pure module (no Svelte imports) so the filtering, sanitizing, and storage
// migration are unit-testable.

export const TAB_AUDIENCE = {
  // Generic tabs every control has — visible in both contexts.
  core: 'both',
  transform: 'both',
  background: 'both',
  border: 'both',
  mouse: 'both',
  effects: 'both',
  actions: 'both',

  // Instance concerns: configuring a placed component.
  properties: 'instance',
  devicebindings: 'instance',

  // Authoring concerns: the component's internal graph. For custom
  // components states/bindings/animations patch Parts/channels — internals,
  // not instance furniture (they stay visible on non-custom controls).
  designer: 'author',
  valuechannels: 'author',
  behaviors: 'author',
  hitzones: 'author',
  interact: 'author',
  react: 'author',
  assets: 'author',
  links: 'author',
  published: 'author',
  publish: 'author',
  variants: 'author',
  testbench: 'author',
  states: 'author',
  bindings: 'author',
  animations: 'author',
};

export function tabAudience(tabId) {
  return TAB_AUDIENCE[String(tabId ?? '')] ?? 'both';
}

// True when `tabId` may render for the given context ('instance' | 'author').
// `isCustomComponent === false` disables gating entirely.
export function tabAllowedForAudience(tabId, context, isCustomComponent = true) {
  if (!isCustomComponent) return true;
  const audience = tabAudience(tabId);
  return audience === 'both' || audience === context;
}

export function filterTabsByAudience(tabs, context, isCustomComponent = true) {
  if (!isCustomComponent) return tabs;
  return tabs.filter((tab) => tabAllowedForAudience(tab.id, context, true));
}

// Clamp a persisted single/multi tab selection against the currently visible
// tab ids so a stale id can never yield an empty panel.
export function sanitizeTabSelection({ singleTab, multiTabs, validIds, fallback = 'core' }) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds ?? []);
  const fallbackId = valid.has(fallback) ? fallback : ([...valid][0] ?? fallback);
  const nextSingle = valid.has(singleTab) ? singleTab : fallbackId;
  const filteredMulti = [...(multiTabs ?? [])].filter((id) => valid.has(id));
  return {
    singleTab: nextSingle,
    multiTabs: filteredMulti.length > 0 ? filteredMulti : [nextSingle],
  };
}

// v1 → v2 storage migration. v2 keeps the v1 fields as the instance/panel tab
// state and adds a separate author-context pair so switching contexts never
// clobbers the other side's selection.
export const PROPERTIES_UI_STATE_KEY_V1 = 'ce.propertiesPanel.uiState.v1';
export const PROPERTIES_UI_STATE_KEY_V2 = 'ce.propertiesPanel.uiState.v2';
export const DEFAULT_AUTHOR_TAB = 'valuechannels';

export function migratePropertiesUiState(storedV2, storedV1 = null) {
  const source = storedV2 && typeof storedV2 === 'object' ? storedV2 : (storedV1 ?? {});
  const singleTab = String(source?.singleTab ?? 'core');
  const multiTabs = Array.isArray(source?.multiTabs) && source.multiTabs.length > 0
    ? source.multiTabs.map(String)
    : [singleTab];
  const authorSingleTab = String(source?.authorSingleTab ?? DEFAULT_AUTHOR_TAB);
  const authorMultiTabs = Array.isArray(source?.authorMultiTabs) && source.authorMultiTabs.length > 0
    ? source.authorMultiTabs.map(String)
    : [authorSingleTab];
  return {
    viewMode: source?.viewMode === 'multi' ? 'multi' : 'single',
    pinPanelProps: source?.pinPanelProps === true,
    singleTab,
    multiTabs,
    authorSingleTab,
    authorMultiTabs,
    pinnedPanelTab: String(source?.pinnedPanelTab ?? 'core'),
    pinnedPanelMultiTabs: Array.isArray(source?.pinnedPanelMultiTabs) && source.pinnedPanelMultiTabs.length > 0
      ? source.pinnedPanelMultiTabs.map(String)
      : ['core'],
    collapsedCards: source?.collapsedCards && typeof source.collapsedCards === 'object'
      ? source.collapsedCards
      : {},
  };
}
