import { writable, derived, get } from 'svelte/store';
import {
  savePanelAs as bridgeSavePanelAs,
  savePanel as bridgeSavePanel,
  openPanel as bridgeOpenPanel,
  openPanelFile as bridgeOpenPanelFile,
  loadOpenPanels as bridgeLoadOpenPanels,
  updateOpenPanels as bridgeUpdateOpenPanels,
  onPanelSaved,
  onPanelOpened,
  onOpenPanelPaths,
  requestFileData,
  onFileData,
  buildVst3 as bridgeBuildVst3,
  onBuildProgress,
  onBuildComplete,
} from '../bridge/bridge.js';
import { clog, cinfo, cwarn, cerror } from './console.js';
import {
  appendRunLine, beginRun, claimIdentity, finishRun, identityFor, newCopyPatch,
} from './exportRuns.js';
import {
  reopenLastSession,
  autosaveEnabled,
  autosaveIntervalSeconds,
  restoreUnsavedWork,
} from './runtimePreferences.js';
import { createPerfDebugTimer, logPerfDebug } from '../utils/perfDebug.js';
import { fileDataByteSize, fileDataText } from '../utils/fileDataPayload.js';
import { confirmDiscardUnsaved } from '../utils/confirmDiscard.js';
import { runWhenIdle } from '../utils/runWhenIdle.js';
import { rememberRecentFile } from './recentFiles.js';
import { equalityWritable } from '../utils/equalityStore.js';
import { applyPanelUpdates } from './panelDocumentHelpers.js';
import { createPanel, deserializePanel, serializePanel, uniquePanelPaths, makeGuid } from './panelModel.js';
import {
  getProjectDeviceSessionSnapshot,
  requestProjectDeviceSessionRestore,
} from './projectDeviceSession.js';
import {
  clearUnsavedSessionSnapshot,
  persistUnsavedSessionSnapshot as persistSessionSnapshot,
  readUnsavedActiveEditorTab,
  readUnsavedSessionSnapshot,
} from './panelSessionPersistence.js';
import {
  activeComponentDocumentId,
  closeComponentDocument,
  componentDocuments,
  openComponentSurfaceWorkspace,
  setActiveComponentDocument,
} from './componentWorkspace.js';
import {
  activeScriptDocumentId,
  closeScriptWorkspaceDocument,
  scriptDocuments,
  setActiveScriptDocument,
} from './scriptWorkspace.js';
import {
  closeScreenDocument,
  screenDocuments,
  setActiveScreenDocument,
} from './screenBuilder.js';

export { createPanel };

/**
 * Panel data model.
 * Each panel has: id, name, width, height, modified, filePath, controls (empty for now).
 */

let autosaveTimer = null;
let sessionRestoreInitialized = false;
const pendingOpenPanelFileTimers = new Map();
const pendingOpenPanelFiles = new Set();
let pendingManualOpenTimer = null;
let panelDataRequestCounter = 0;
const pendingPanelDataRequests = new Map();
let panelDataListenerRegistered = false;
const DPD_SPLIT_SIZE_STORAGE_KEY = 'ceditor.dpdSplitSizes.v1';

function readDesignerSplitSizes() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(DPD_SPLIT_SIZE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function storedDesignerSplitSize(panelId) {
  const value = Number(readDesignerSplitSizes()[String(panelId)]);
  return Number.isFinite(value) ? Math.min(0.94, Math.max(0.06, value)) : 0.5;
}

function persistDesignerSplitSize(panelId, size) {
  if (typeof localStorage === 'undefined' || panelId == null) return;
  try {
    const values = readDesignerSplitSizes();
    values[String(panelId)] = Math.min(0.94, Math.max(0.06, Number(size) || 0.5));
    localStorage.setItem(DPD_SPLIT_SIZE_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // UI preference persistence is optional.
  }
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function panelPerfLabel(name, filePath) {
  return String(name ?? filePath ?? 'panel').trim() || 'panel';
}

function finishPendingPanelTimers(filePath, label, payloadSizeBytes, extra = '') {
  const detail = `label="${label}" bytes=${formatBytes(payloadSizeBytes)}${extra ? ` ${extra}` : ''}`;
  pendingManualOpenTimer?.(detail);
  pendingManualOpenTimer = null;

  const queuedTimer = pendingOpenPanelFileTimers.get(filePath);
  queuedTimer?.(detail);
  pendingOpenPanelFileTimers.delete(filePath);
}

function ensurePanelDataListener() {
  if (panelDataListenerRegistered) return;
  panelDataListenerRegistered = true;

  onFileData((payload) => {
    const pending = pendingPanelDataRequests.get(payload?.requestId);
    if (!pending) return;

    pendingPanelDataRequests.delete(payload.requestId);

    try {
      const decodedText = fileDataText(payload);
      const byteSize = fileDataByteSize(payload);
      pending.stopTimer?.(
        `bytes=${formatBytes(byteSize)} read=${Number(payload?.readMs || 0).toFixed(1)}ms encode=${Number(payload?.encodeMs || 0).toFixed(1)}ms`
      );
      pending.resolve({
        data: decodedText,
        byteSize,
        readMs: Number(payload?.readMs),
        encodeMs: Number(payload?.encodeMs),
      });
    } catch (error) {
      pending.stopTimer?.('decode failed');
      pending.reject(error);
    }
  });
}

function requestDeferredPanelData(filePath, label) {
  ensurePanelDataListener();

  return new Promise((resolve, reject) => {
    const requestId = `panel_${++panelDataRequestCounter}`;
    logPerfDebug(`panel data request ${label}`, filePath);
    pendingPanelDataRequests.set(requestId, {
      resolve,
      reject,
      stopTimer: createPerfDebugTimer(`panel data load ${label}`),
    });
    requestFileData(requestId, filePath);
  });
}

function schedulePanelOpenHousekeeping(label) {
  setTimeout(() => {
    const stopTimer = createPerfDebugTimer(`panel post-open housekeeping ${label}`);
    persistOpenPanelPaths();
    flushUnsavedSessionSnapshot();
    stopTimer();
  }, 0);
}

function serializePanelDocument(panel) {
  return serializePanel(panel, {
    deviceSession: getProjectDeviceSessionSnapshot(),
  });
}

/**
 * The document handed to the exporter, which is not the same document we save.
 *
 * A saved .cepanel stores each control as a diff against its type's defaults and is expanded again
 * by deserializePanel. The exported plugin never runs that code: Player/PanelValueModel.h parses
 * the .cepanel in C++ and reads Core, Behavior and Scripts directly off controls[]. A field that
 * was elided is simply absent to it. So the build payload is written in full.
 */
function serializePanelForExport(panel) {
  return serializePanel(panel, {
    deviceSession: getProjectDeviceSessionSnapshot(),
    // An in-progress capture is saved in the .cepanel and has no business in a plugin binary: the
    // player's C++ reads Core, Behavior and Scripts and has never heard of a capture session, so
    // carrying one would compile tens of KB of somebody's SysEx dumps into the build for nothing.
    captureSession: null,
    elide: false,
  });
}

function restorePanelDeviceSession(panel, label) {
  if (!panel?.deviceSession) return;

  requestProjectDeviceSessionRestore(panel.deviceSession, {
    source: 'panel',
    label,
  });
}

function persistUnsavedSessionSnapshot() {
  persistSessionSnapshot({
    panelList: get(panels),
    activeEditorTab: get(activeEditorTab),
    autosaveEnabled: get(autosaveEnabled),
    restoreUnsavedWork: get(restoreUnsavedWork),
  });
}

export function flushUnsavedSessionSnapshot() {
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  persistUnsavedSessionSnapshot();
}

// Autosave is suspended for the length of a preview run. A preview mutates the document — scripts
// write to it, and several component gesture handlers write to it — and all of that is put back
// when preview stops. Persisting a half-way state would mean a crash mid-preview restores a panel
// the author never authored; the last snapshot taken before preview started is the right one to
// keep. See stores/previewRehearsal.js.
let autosaveSuspended = false;

export function setAutosaveSuspended(on) {
  autosaveSuspended = on === true;
  if (!autosaveSuspended) {
    scheduleUnsavedSessionAutosave();   // resume from whatever the document looks like now
    return;
  }
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function scheduleUnsavedSessionAutosave() {
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (autosaveSuspended) return;

  if (!sessionRestoreInitialized || !get(autosaveEnabled) || !get(restoreUnsavedWork)) {
    if (!get(restoreUnsavedWork)) clearUnsavedSessionSnapshot();
    return;
  }

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    // WHEN THE BROWSER IS FREE, not when the timer happens to fire. Serialising the document is
    // measured in hundreds of milliseconds on a large panel, and a bare setTimeout drops that on
    // whatever the author is doing five seconds after an edit — which is a freeze in the middle of
    // a drag with no visible cause. requestIdleCallback waits for a gap instead, and its `timeout`
    // guarantees the snapshot still happens on a busy editor rather than being starved.
    //
    // flushUnsavedSessionSnapshot stays synchronous: it runs before destructive actions and on the
    // way out, where the point is that the write has finished.
    runWhenIdle(persistUnsavedSessionSnapshot, 2000);
  }, Math.max(5, get(autosaveIntervalSeconds)) * 1000);
}

function restoreUnsavedSessionFromSnapshot() {
  if (!get(restoreUnsavedWork)) {
    clearUnsavedSessionSnapshot();
    return;
  }

  const snapshot = readUnsavedSessionSnapshot();
  if (!Array.isArray(snapshot) || snapshot.length === 0) return;

  const idMap = new Map();
  const restoredPanels = snapshot
    .filter((panel) => panel && typeof panel === 'object')
    .map((panelData) => {
      const restored = {
        ...createPanel(),
        ...panelData,
        modified: panelData.modified !== false,
      };

      idMap.set(panelData.id, restored.id);
      return restored;
    });

  if (restoredPanels.length === 0) return;

  panels.update((list) => [
    ...list,
    ...restoredPanels.filter((candidate) =>
      !candidate.filePath || !list.some((panel) => panel.filePath && panel.filePath === candidate.filePath)
    ),
  ]);

  const savedActiveTab = readUnsavedActiveEditorTab();
  const restoredActiveId = idMap.get(savedActiveTab?.id) ?? restoredPanels[restoredPanels.length - 1]?.id ?? null;

  if (restoredActiveId != null) {
    activePanelId.set(restoredActiveId);
    activeEditorTab.set({ type: 'panel', id: restoredActiveId });
    const restoredPanel = get(panels).find((panel) => panel.id === restoredActiveId);
    maybeAutoOpenComponentDesigner(restoredPanel);
  }
}

/** Currently selected component ids (Set). Empty = panel is selected. */
export const selectedComponentIds = writable(new Set());

/** Backward-compatible: first selected id or null */
export const selectedComponentId = derived(
  selectedComponentIds,
  ($ids) => $ids.size > 0 ? [...$ids][0] : null
);

/** Key object id — the most recently clicked component in a multi-select */
export const keyObjectId = writable(null);

/** Selection helpers */
export function selectComponent(id, addToSelection = false) {
  if (id == null) return;

  if (addToSelection) {
    selectedComponentIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  } else {
    selectedComponentIds.set(new Set([id]));
  }
  keyObjectId.set(id);
}

export function clearSelection() {
  selectedComponentIds.set(new Set());
  keyObjectId.set(null);
}

export function isSelected(id) {
  return get(selectedComponentIds).has(id);
}

/**
 * Active multi-drag delta — applied visually to all selected components during drag.
 *
 * Object-valued, and set to the idle value at the end of EVERY drag whether or not a multi-drag
 * happened — which a plain writable turns into a notification, because safe_not_equal cannot see
 * that two objects hold the same numbers. The same defect that made selecting a control cost
 * 200 ms (utils/equalityStore.js); here it is worth a single callback, and it is fixed because it
 * is the same bug rather than because the measurement demanded it.
 */
export const multiDragDelta = equalityWritable(
  { x: 0, y: 0, active: false },
  (a, b) => a?.x === b?.x && a?.y === b?.y && a?.active === b?.active,
);

/** Editor zoom state */
export const editorZoom = writable(100);
export const editorZoomIncrement = writable(10);

/** All open panels */
export const panels = writable([]);

/** ID of the active (visible) panel */
export const activePanelId = writable(null);

/** Whether the global Settings editor tab is open */
export const settingsTabOpen = writable(false);

/** Open device profile editor tabs */
export const deviceProfileTabs = writable([]);

/** Active editor tab descriptor: { type: 'panel'|'settings'|'deviceProfile'|'component'|'script', id } */
export const activeEditorTab = writable({ type: 'panel', id: null });

/** Editor split layout. Primary and secondary pin the two tabs shown in the split workspace. */
export const editorSplitLayout = writable({
  mode: 'single',
  orientation: 'vertical',
  primary: null,
  secondary: null,
});

/** Per-panel Device Profile Designer companions keyed by panel id. */
export const panelDesignerSplits = writable({});

export const activePanelDesignerSplit = derived(
  [panelDesignerSplits, activeEditorTab],
  ([$panelDesignerSplits, $activeEditorTab]) => {
    const panelId = $activeEditorTab?.type === 'panel' ? $activeEditorTab.id : null;
    return panelId != null ? ($panelDesignerSplits?.[panelId] ?? null) : null;
  }
);

/** Active panel id with fallback resolution when selection state lags behind open panels. */
export const resolvedActivePanelId = derived(
  [panels, activePanelId, activeEditorTab],
  ([$panels, $activePanelId, $activeEditorTab]) =>
    resolvePanelSelection($panels, $activePanelId, $activeEditorTab)?.id ?? null
);

/** Panel targeted by the script RUNTIME. On a script tab this is the script
 *  document's bound panel — an explicit binding, not "whatever panel tab sits
 *  behind the workspace". Everywhere else it matches resolvedActivePanelId.
 *  Panel-editing commands (undo, paste, insert) must keep using
 *  resolvedActivePanelId, which is null on script tabs. */
export const scriptRuntimePanelId = derived(
  [panels, activePanelId, activeEditorTab, scriptDocuments],
  ([$panels, $activePanelId, $tab, $scriptDocuments]) => {
    if ($tab?.type === 'script') {
      const doc = $scriptDocuments.find((d) => d.id === $tab.id);
      const boundId = doc?.panelId ?? null;
      return $panels.find((p) => String(p.id) === String(boundId))?.id ?? null;
    }
    return resolvePanelSelection($panels, $activePanelId, $tab)?.id ?? null;
  }
);

/** All editor tabs shown in the top tab bar */
export const editorTabs = derived(
  [panels, settingsTabOpen, deviceProfileTabs, componentDocuments, scriptDocuments, screenDocuments],
  ([$panels, $settingsTabOpen, $deviceProfileTabs, $componentDocuments, $scriptDocuments, $screenDocuments]) => {
    const tabs = $panels.map(panel => ({
      id: panel.id,
      tabType: 'panel',
      name: panel.name,
      modified: panel.modified,
    }));

    if ($settingsTabOpen) {
      tabs.push({
        id: 'settings',
        tabType: 'settings',
        name: 'Settings',
        modified: false,
      });
    }

    for (const profileTab of $deviceProfileTabs) {
      tabs.push({
        id: profileTab.id,
        tabType: 'deviceProfile',
        name: profileTab.name || `Profile: ${profileTab.id}`,
        modified: profileTab.modified === true,
      });
    }

    for (const componentDocument of $componentDocuments) {
      tabs.push({
        id: componentDocument.id,
        tabType: 'component',
        name: componentDocument.name || 'Untitled Component',
        modified: componentDocument.modified === true,
      });
    }

    for (const scriptDocument of $scriptDocuments) {
      tabs.push({
        id: scriptDocument.id,
        tabType: 'script',
        name: scriptDocument.name || 'Untitled Script Workspace',
        modified: scriptDocument.modified === true,
      });
    }

    for (const screenDocument of $screenDocuments) {
      tabs.push({
        id: screenDocument.id,
        tabType: 'screen',
        name: screenDocument.name || 'Untitled Screen',
        modified: screenDocument.modified === true,
      });
    }

    return tabs;
  }
);

function resolvePanelSelection(list, activeId, tab) {
  if (!Array.isArray(list) || list.length === 0) return null;
  if (tab?.type === 'settings') return null;
  if (tab?.type === 'component') return null;
  if (tab?.type === 'deviceProfile') return null;
  // Script tabs edit script documents, not panels. Falling through here made
  // every panel-scoped command (undo, paste, insert) silently hit an
  // off-screen panel while a script workspace was in front.
  if (tab?.type === 'script') return null;
  if (tab?.type === 'screen') return null;

  const panelFromTab = tab?.type === 'panel'
    ? list.find((panel) => panel.id === tab.id) ?? null
    : null;
  const panelFromActiveId = list.find((panel) => panel.id === activeId) ?? null;

  return panelFromTab ?? panelFromActiveId ?? list[list.length - 1] ?? null;
}

/** The active panel object (derived) */
export const activePanel = derived(
  [panels, activePanelId, activeEditorTab],
  ([$panels, $activePanelId, $activeEditorTab]) =>
    resolvePanelSelection($panels, $activePanelId, $activeEditorTab)
);

function firstCustomComponent(panel) {
  return (panel?.controls ?? []).find((control) =>
    control?._children?.Core?.controlType === 'CustomComponent'
  ) ?? null;
}

function maybeAutoOpenComponentDesigner(panel) {
  if (panel?._codexAutoOpenComponentDesigner !== true) return;
  const customControl = firstCustomComponent(panel);
  const customId = customControl?._children?.Core?.id;
  if (!customId) return;

  queueMicrotask(() => {
    activePanelId.set(panel.id);
    activeEditorTab.set({ type: 'panel', id: panel.id });
    selectComponent(customId);
    openComponentSurfaceWorkspace();
  });
}

/** Add a new panel and make it active */
export function addPanel(panel = null) {
  const p = panel ?? createPanel();
  panels.update(list => [...list, p]);
  activePanelId.set(p.id);
  activeEditorTab.set({ type: 'panel', id: p.id });
  maybeAutoOpenComponentDesigner(p);
  return p;
}

/** Open the global Settings editor tab and activate it */
export function openSettingsTab() {
  settingsTabOpen.set(true);
  activeEditorTab.set({ type: 'settings', id: 'settings' });
  editorSplitLayout.update((layout) => layout.mode === 'split' ? { ...layout, primary: { type: 'settings', id: 'settings' } } : layout);
  clearSelection();
}

/** Close the global Settings editor tab */
export function closeSettingsTab() {
  settingsTabOpen.set(false);

  const panelId = get(activePanelId);
  if (panelId != null) {
    activeEditorTab.set({ type: 'panel', id: panelId });
  } else {
    activeEditorTab.set({ type: 'panel', id: null });
  }
}

/** Open a device profile designer beside the active panel. */
export function openDeviceProfileTab(profile) {
  const id = String(profile?.id ?? '').trim();
  if (!id) return;
  const currentPanelId = get(activePanelId);
  const name = profile?.name || `Profile: ${id}`;

  ensureDeviceProfileTab(id, name);

  if (currentPanelId != null) {
    panelDesignerSplits.update((splits) => ({
      ...splits,
      [currentPanelId]: {
        profileId: id,
        profileName: name,
        orientation: splits?.[currentPanelId]?.orientation ?? 'vertical',
        deviceOnLeft: splits?.[currentPanelId]?.deviceOnLeft ?? true,
        designerSize: splits?.[currentPanelId]?.designerSize ?? storedDesignerSplitSize(currentPanelId),
      },
    }));
    activeEditorTab.set({ type: 'panel', id: currentPanelId });
  }
  clearSelection();
}

/** Open a standalone Device Profile Designer tab for MIDI CC, NRPN, and SysEx authoring. */
export function openStandaloneDeviceProfileTab(profile) {
  const id = String(profile?.id ?? '').trim();
  if (!id) return null;
  const name = profile?.name || `Profile: ${id}`;
  ensureDeviceProfileTab(id, name);
  activeEditorTab.set({ type: 'deviceProfile', id });
  clearSelection();
  return { id, name };
}

/** Update the active panel's already-open DPD companion to a different profile. */
export function syncOpenDeviceProfileDesigner(profile) {
  const id = String(profile?.id ?? '').trim();
  if (!id) return;
  const currentPanelId = get(activePanelId);
  if (currentPanelId == null) return;

  const currentSplit = get(panelDesignerSplits)?.[currentPanelId];
  if (!currentSplit) return;

  const name = profile?.name || `Profile: ${id}`;

  panelDesignerSplits.update((splits) => ({
    ...splits,
    [currentPanelId]: {
      ...splits[currentPanelId],
      profileId: id,
      profileName: name,
    },
  }));
}

function ensureDeviceProfileTab(id, name) {
  deviceProfileTabs.update((tabs) => {
    const existing = tabs.find((tab) => tab.id === id);
    if (existing) {
      return tabs.map((tab) =>
        tab.id === id
          ? { ...tab, name: name || tab.name || `Profile: ${id}` }
          : tab
      );
    }

    return [
      ...tabs,
      {
        id,
        name,
        modified: false,
      },
    ];
  });
}

/** Close a device profile editor tab */
export function closeDeviceProfileTab(id) {
  const closingActive = get(activeEditorTab)?.type === 'deviceProfile' && get(activeEditorTab)?.id === id;
  deviceProfileTabs.update((tabs) => tabs.filter((tab) => tab.id !== id));
  panelDesignerSplits.update((splits) => {
    const next = { ...splits };
    for (const [panelId, split] of Object.entries(next)) {
      if (split?.profileId === id) delete next[panelId];
    }
    return next;
  });
  editorSplitLayout.update((layout) => {
    if (layout.primary?.type === 'deviceProfile' && layout.primary?.id === id) return { mode: 'single', orientation: 'vertical', primary: null, secondary: null };
    if (layout.secondary?.type === 'deviceProfile' && layout.secondary?.id === id) return { ...layout, mode: 'single', secondary: null };
    return layout;
  });

  if (closingActive) {
    const panelId = get(activePanelId);
    if (panelId != null) {
      activeEditorTab.set({ type: 'panel', id: panelId });
    } else if (get(settingsTabOpen)) {
      activeEditorTab.set({ type: 'settings', id: 'settings' });
    } else {
      activeEditorTab.set({ type: 'panel', id: null });
    }
  }
}

export function openEditorSplit(primaryTab, secondaryTab) {
  if (!primaryTab || !secondaryTab) return;
  editorSplitLayout.set({
    mode: 'split',
    orientation: 'vertical',
    primary: normalizeEditorTabDescriptor(primaryTab),
    secondary: normalizeEditorTabDescriptor(secondaryTab),
  });
}

export function closeEditorSplit() {
  editorSplitLayout.set({
    mode: 'single',
    orientation: 'vertical',
    primary: null,
    secondary: null,
  });
}

export function swapEditorSplit() {
  const activeTab = get(activeEditorTab);
  const panelId = activeTab?.type === 'panel' ? activeTab.id : get(activePanelId);
  if (panelId != null) {
    let didSwap = false;
    panelDesignerSplits.update((splits) => {
      const split = splits?.[panelId];
      if (!split) return splits;
      didSwap = true;
      return {
        ...splits,
        [panelId]: {
          ...split,
          deviceOnLeft: !split.deviceOnLeft,
        },
      };
    });
    if (didSwap) return;
  }

  const layout = get(editorSplitLayout);
  if (layout.mode !== 'split' || !layout.primary || !layout.secondary) return;

  editorSplitLayout.set({
    ...layout,
    primary: layout.secondary,
    secondary: layout.primary,
  });
  setActiveEditorTab(layout.secondary);
}

export function toggleEditorSplitOrientation() {
  const activeTab = get(activeEditorTab);
  const panelId = activeTab?.type === 'panel' ? activeTab.id : get(activePanelId);
  if (panelId != null) {
    let didToggle = false;
    panelDesignerSplits.update((splits) => {
      const split = splits?.[panelId];
      if (!split) return splits;
      didToggle = true;
      return {
        ...splits,
        [panelId]: {
          ...split,
          orientation: split.orientation === 'horizontal' ? 'vertical' : 'horizontal',
        },
      };
    });
    if (didToggle) return;
  }

  editorSplitLayout.update((layout) => {
    if (layout.mode !== 'split') return layout;
    return {
      ...layout,
      orientation: layout.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    };
  });
}

export function setPanelDesignerSplitSize(panelId, designerSize) {
  if (panelId == null) return;
  const size = Math.min(0.94, Math.max(0.06, Number(designerSize) || 0.5));
  persistDesignerSplitSize(panelId, size);
  panelDesignerSplits.update((splits) => {
    const split = splits?.[panelId];
    if (!split) return splits;
    return {
      ...splits,
      [panelId]: {
        ...split,
        designerSize: size,
      },
    };
  });
}

export function openTabToSide(tab) {
  if (!tab) return;
  const current = get(activeEditorTab);
  const panelId = current?.type === 'panel' ? current.id : get(activePanelId);
  if ((tab.tabType === 'deviceProfile' || tab.type === 'deviceProfile') && panelId != null) {
    const profileId = tab.id;
    panelDesignerSplits.update((splits) => ({
      ...splits,
      [panelId]: {
        profileId,
        profileName: tab.name || `Profile: ${profileId}`,
        orientation: splits?.[panelId]?.orientation ?? 'vertical',
        deviceOnLeft: splits?.[panelId]?.deviceOnLeft ?? true,
        designerSize: splits?.[panelId]?.designerSize ?? storedDesignerSplitSize(panelId),
      },
    }));
    activeEditorTab.set({ type: 'panel', id: panelId });
    clearSelection();
    return;
  }
  openEditorSplit(current, tab);
}

function normalizeEditorTabDescriptor(tab) {
  if (!tab) return null;
  return {
    type: tab.type || tab.tabType || 'panel',
    id: tab.id ?? null,
  };
}

/** Close a panel by id. Prompts when the panel has unsaved changes; returns
 *  false when the user keeps the panel open. */
export function closePanel(id) {
  const closing = get(panels).find((p) => p.id === id);
  if (closing?.modified && !confirmDiscardUnsaved(closing.name)) return false;

  panelDesignerSplits.update((splits) => {
    if (!splits || !(id in splits)) return splits;
    const next = { ...splits };
    delete next[id];
    return next;
  });

  panels.update(list => {
    const idx = list.findIndex(p => p.id === id);
    const newList = list.filter(p => p.id !== id);
    const wasActivePanelTab = get(activeEditorTab)?.type === 'panel' && get(activeEditorTab)?.id === id;

    // If we closed the active tab, activate an adjacent one
    activePanelId.update(activeId => {
      if (activeId !== id) return activeId;
      if (newList.length === 0) return null;
      // Prefer the tab to the left, or the first remaining
      const newIdx = Math.min(idx, newList.length - 1);
      return newList[newIdx].id;
    });

    if (wasActivePanelTab) {
      const nextPanelId = newList.length > 0
        ? newList[Math.min(idx, newList.length - 1)].id
        : null;

      if (nextPanelId != null) {
        activeEditorTab.set({ type: 'panel', id: nextPanelId });
      } else if (get(settingsTabOpen)) {
        activeEditorTab.set({ type: 'settings', id: 'settings' });
      } else {
        activeEditorTab.set({ type: 'panel', id: null });
      }
    }

    return newList;
  });

  // Update persisted open panel paths
  persistOpenPanelPaths();
  flushUnsavedSessionSnapshot();
  return true;
}

/** Switch to a panel by id */
export function setActivePanel(id) {
  const nextTab = { type: 'panel', id };
  activePanelId.set(id);
  activeEditorTab.set(nextTab);
}

/** Switch to any editor tab by descriptor */
export function setActiveEditorTab(tab) {
  if (!tab) return;

  if (tab.tabType === 'settings' || tab.type === 'settings' || tab.id === 'settings') {
    openSettingsTab();
    editorSplitLayout.update((layout) => layout.mode === 'split' ? { ...layout, primary: { type: 'settings', id: 'settings' } } : layout);
    return;
  }

  if (tab.tabType === 'deviceProfile' || tab.type === 'deviceProfile') {
    const nextTab = { type: 'deviceProfile', id: tab.id };
    activeEditorTab.set(nextTab);
    clearSelection();
    return;
  }

  if (tab.tabType === 'component' || tab.type === 'component') {
    const nextTab = { type: 'component', id: tab.id };
    activeEditorTab.set(nextTab);
    setActiveComponentDocument(tab.id);
    clearSelection();
    return;
  }

  if (tab.tabType === 'script' || tab.type === 'script') {
    const nextTab = { type: 'script', id: tab.id };
    activeEditorTab.set(nextTab);
    setActiveScriptDocument(tab.id);
    clearSelection();
    return;
  }

  if (tab.tabType === 'screen' || tab.type === 'screen') {
    const nextTab = { type: 'screen', id: tab.id };
    activeEditorTab.set(nextTab);
    setActiveScreenDocument(tab.id);
    clearSelection();
    return;
  }

  const panelId = tab.id ?? null;
  if (panelId != null) {
    setActivePanel(panelId);
  } else if (tab.tabType === 'panel' || tab.type === 'panel') {
    activeEditorTab.set({ type: 'panel', id: null });
    clearSelection();
  }
}

/** Close whichever editor tab is currently active */
export function closeActiveEditorTab() {
  const tab = get(activeEditorTab);
  if (!tab) return;

  if (tab.type === 'settings') {
    closeSettingsTab();
    return;
  }

  if (tab.type === 'deviceProfile') {
    closeDeviceProfileTab(tab.id);
    return;
  }

  if (tab.type === 'component') {
    closeComponentDocument(tab.id);
    const nextComponentId = get(activeComponentDocumentId);
    if (nextComponentId) {
      activeEditorTab.set({ type: 'component', id: nextComponentId });
    } else if (get(activePanelId) != null) {
      activeEditorTab.set({ type: 'panel', id: get(activePanelId) });
    } else {
      activeEditorTab.set({ type: 'panel', id: null });
    }
    return;
  }

  if (tab.type === 'script') {
    closeScriptWorkspaceDocument(tab.id);
    const nextScriptId = get(activeScriptDocumentId);
    if (nextScriptId) {
      activeEditorTab.set({ type: 'script', id: nextScriptId });
    } else if (get(activePanelId) != null) {
      activeEditorTab.set({ type: 'panel', id: get(activePanelId) });
    } else {
      activeEditorTab.set({ type: 'panel', id: null });
    }
    return;
  }

  if (tab.type === 'screen') {
    closeScreenDocument(tab.id);
    if (get(activePanelId) != null) {
      activeEditorTab.set({ type: 'panel', id: get(activePanelId) });
    } else {
      activeEditorTab.set({ type: 'panel', id: null });
    }
    return;
  }

  if (tab.type === 'panel' && tab.id != null) {
    closePanel(tab.id);
    return;
  }

  const resolvedPanelId = get(resolvedActivePanelId);
  if (resolvedPanelId != null) {
    closePanel(resolvedPanelId);
  }
}

/** Update a panel's properties */
export function updatePanel(id, updates) {
  panels.update((list) =>
    list.map((panel) => (panel.id === id ? applyPanelUpdates(panel, updates) : panel))
  );
}

// --- Save / Open actions ---

/** Save the active panel. If it has no filePath, triggers Save As. */
export function saveActivePanel() {
  const panel = get(activePanel);
  if (!panel) return;

  if (panel.filePath) {
    bridgeSavePanel(String(panel.id), panel.filePath, serializePanelDocument(panel));
  } else {
    saveActivePanelAs();
  }
}

/** Save the active panel with a file dialog. */
export function saveActivePanelAs() {
  const panel = get(activePanel);
  if (!panel) return;

  bridgeSavePanelAs(String(panel.id), serializePanelDocument(panel));
}

// --- In-app VST3 build (Build menu → "Build VST3") -------------------------------------------
// Drives the same exporter the CLI uses (tools/scripts/export-panel-vst3.mjs) from inside the
// editor: C++ writes the serialized panel to a temp .cepanel, runs npm build + cmake, and streams
// the log back. Output is surfaced in the global console (ConsolePanel).
let buildListenersReady = false;
let buildInFlight = false;

function ensureBuildListeners() {
  if (buildListenersReady) return;
  buildListenersReady = true;
  onBuildProgress((p) => {
    const line = p?.line;
    if (line == null || !String(line).length) return;
    clog('[vst3]', String(line));
    // Also captured per run. The console is where every subsystem's chatter goes, and a build's
    // output interleaved with MIDI traffic is not a build log — see stores/exportRuns.js.
    appendRunLine(String(line));
  });
  onBuildComplete((r) => {
    buildInFlight = false;
    if (r?.ok) cinfo('[vst3] ✓ Build complete →', r.path ?? '(see export-out/)');
    else cerror('[vst3] ✗ Build failed:', r?.message ?? `exit ${r?.code ?? '?'}`);
    finishRun({
      ok: r?.ok === true,
      path: r?.path ?? '',
      message: r?.message ?? (r?.ok ? '' : `exit ${r?.code ?? '?'}`),
    });
  });
}

/**
 * Build the active panel into a VST3. Returns true if a build was started. Requires the JUCE
 * backend (no-op in plain-browser dev). Reuses the panel's stable GUID, minting + persisting one
 * the first time so re-exports keep the same plugin identity.
 */
export function buildActivePanelVst3({ identityChoice = null } = {}) {
  const panel = get(activePanel);
  if (!panel) { cwarn('[vst3] No active panel to build.'); return false; }
  if (buildInFlight) { cwarn('[vst3] A build is already running.'); return false; }

  ensureBuildListeners();

  // The identity fork (export plan D1). The collision that matters is not two panels picking the
  // same random GUID — it is a .cepanel being COPIED: export the copy and it takes over the
  // original plugin's identity, silently replacing it in every project that loaded it. `ask` is
  // returned only for that case, so the ordinary re-export still runs without a question.
  const decision = identityFor(panel);
  if (decision.action === 'ask' && identityChoice === null) {
    cwarn(`[vst3] ${decision.reason}. Choose Update or New copy on the Export tab.`);
    return { needsChoice: true, decision };
  }

  let guid = panel.panelGuid;
  if (identityChoice === 'new') {
    const patch = newCopyPatch(panel, makeGuid);
    guid = patch.panelGuid;
    updatePanel(panel.id, patch);
    cinfo(`[vst3] New independent plugin identity — exporting as "${patch.exportSettings.pluginName}".`);
  } else if (!guid) {
    guid = makeGuid();
    updatePanel(panel.id, { panelGuid: guid }); // persist identity into the document
  }

  // Claimed BEFORE the build, not after: a failed first export would otherwise leave the panel
  // holding a GUID nothing has claimed, and the next export of a copy of it would read as "adopt"
  // rather than "ask" — which is exactly the collision this is here to catch.
  claimIdentity({
    guid,
    panelId: String(panel.id),
    panelPath: panel.filePath ?? '',
    productName: panel.exportSettings?.pluginName?.trim() || String(panel.name ?? ''),
  });

  // Match the exporter's choice (Export settings pluginName overrides the panel name) so the
  // streamed "Build complete → path" reflects the real output file.
  const pluginName = panel.exportSettings?.pluginName?.trim();
  const productName = pluginName || String(panel.name || 'CEditor Panel').trim() || 'CEditor Panel';
  buildInFlight = true;
  beginRun({
    panelId: String(panel.id),
    panelName: String(panel.name ?? ''),
    productName,
    guid,
    format: 'VST3',
  });
  cinfo(`[vst3] Building "${productName}" — runs npm + cmake, may take a minute…`);
  // Serialize with the GUID merged in so the temp .cepanel carries it too (harmless if unused).
  bridgeBuildVst3(String(panel.id), serializePanelForExport({ ...panel, panelGuid: guid }), guid, productName);
  return true;
}

/** Open a panel from a file dialog. */
export function openPanelFromFile() {
  pendingManualOpenTimer?.('cancelled-or-superseded');
  pendingManualOpenTimer = createPerfDebugTimer('panel manual open roundtrip');
  logPerfDebug('panel open requested from UI');
  bridgeOpenPanel();
}

/** Persist the list of saved (filePath != null) open panel paths to C++ settings. */
function persistOpenPanelPaths() {
  const list = get(panels);
  const paths = uniquePanelPaths(list.filter(p => p.filePath).map(p => p.filePath));
  bridgeUpdateOpenPanels(paths);
}

function syncPanelSelection() {
  const tab = get(activeEditorTab);
  if (tab?.type === 'settings' || tab?.type === 'deviceProfile' || tab?.type === 'component' || tab?.type === 'script' || tab?.type === 'screen') return;

  const list = get(panels);
  const activeId = get(activePanelId);

  if (list.length === 0) {
    if (activeId !== null) activePanelId.set(null);
    if (tab?.type !== 'panel' || tab?.id !== null) {
      activeEditorTab.set({ type: 'panel', id: null });
    }
    return;
  }

  const resolvedPanel = resolvePanelSelection(list, activeId, tab);

  if (!resolvedPanel) return;
  if (activeId !== resolvedPanel.id) activePanelId.set(resolvedPanel.id);
  if (tab?.type !== 'panel' || tab?.id !== resolvedPanel.id) {
    activeEditorTab.set({ type: 'panel', id: resolvedPanel.id });
  }
}

panels.subscribe(() => {
  scheduleUnsavedSessionAutosave();
  syncPanelSelection();
});

autosaveEnabled.subscribe(() => {
  scheduleUnsavedSessionAutosave();
});

autosaveIntervalSeconds.subscribe(() => {
  scheduleUnsavedSessionAutosave();
});

restoreUnsavedWork.subscribe((enabled) => {
  if (!enabled) clearUnsavedSessionSnapshot();
  scheduleUnsavedSessionAutosave();
});

activePanelId.subscribe(() => {
  syncPanelSelection();
});

activeEditorTab.subscribe((tab) => {
  if (tab?.type === 'settings' || tab?.type === 'deviceProfile' || tab?.type === 'component' || tab?.type === 'script' || tab?.type === 'screen') return;
  syncPanelSelection();
});

// --- Bridge event listeners ---

/** Initialize bridge listeners. Call once at app startup. */
export function initPanelBridge() {
  // Panel saved successfully — update filePath, name, clear modified flag
  onPanelSaved((payload) => {
    const label = panelPerfLabel(payload?.name, payload?.filePath);
    const panelId = parseInt(payload.panelId, 10);
    const updates = { filePath: payload.filePath, modified: false };
    if (payload.name) updates.name = payload.name;

    panels.update(list =>
      list.map(p => p.id === panelId ? { ...p, ...updates } : p)
    );

    // No markContextSaved() call here on purpose: history.js imports this module, so importing it
    // back would close a cycle for something it does not need. Its noteCleanState() adopts this
    // state as the saved marker the moment the cleared `modified` flag reaches its subscription,
    // which is this same tick — so undo back to here clears the dirty dot either way.
    if (updates.filePath) {
      rememberRecentFile({ kind: 'panel', path: updates.filePath, name: updates.name });
    }

    // Persist open panel paths now that this panel has a file
    schedulePanelOpenHousekeeping(label);
  });

  // Panel opened from file — create panel and make it active
  onPanelOpened(async (payload) => {
    const label = panelPerfLabel(payload?.name, payload?.filePath);
    let payloadSizeBytes = Number(payload?.byteSize) || String(payload?.data ?? '').length;
    const filePath = String(payload?.filePath ?? '').trim();

    // Check if this file is already open
    const existing = get(panels).find(p => p.filePath === filePath);
    if (existing) {
      finishPendingPanelTimers(filePath, label, payloadSizeBytes);
      logPerfDebug(`panel reuse ${label}`, `id=${existing.id}`);
      setActivePanel(existing.id);
      return;
    }

    if (filePath && pendingOpenPanelFiles.has(filePath)) {
      finishPendingPanelTimers(filePath, label, payloadSizeBytes, 'duplicate-request-ignored');
      return;
    }

    if (filePath) pendingOpenPanelFiles.add(filePath);

    let panelData = String(payload?.data ?? '');
    let nativeReadMs = Number(payload?.readMs);

    if (!panelData && filePath) {
      try {
        const deferred = await requestDeferredPanelData(filePath, label);
        panelData = deferred.data;
        payloadSizeBytes = Number(deferred?.byteSize) || payloadSizeBytes;
        nativeReadMs = Number.isFinite(deferred?.readMs) ? deferred.readMs : nativeReadMs;
      } catch (error) {
        if (filePath) pendingOpenPanelFiles.delete(filePath);
        finishPendingPanelTimers(filePath, label, payloadSizeBytes, 'failed');
        console.error('[panels] Failed to load deferred panel data:', error);
        return;
      }
    }

    const existingAfterLoad = get(panels).find((panel) => panel.filePath === filePath);
    if (existingAfterLoad) {
      if (filePath) pendingOpenPanelFiles.delete(filePath);
      finishPendingPanelTimers(filePath, label, payloadSizeBytes, 'reused-after-load');
      setActivePanel(existingAfterLoad.id);
      maybeAutoOpenComponentDesigner(existingAfterLoad);
      return;
    }

    finishPendingPanelTimers(filePath, label, payloadSizeBytes);

    const openTimer = createPerfDebugTimer(`panel open ${label}`);
    const deserializeTimer = createPerfDebugTimer(`panel deserialize ${label}`);
    const panel = deserializePanel(panelData, filePath, payload.name);
    if (!panel) {
      if (filePath) pendingOpenPanelFiles.delete(filePath);
      deserializeTimer('failed');
      console.error(`[panels] "${label}" could not be opened — the file is corrupted or is not a .cepanel document.`);
      return;
    }
    restorePanelDeviceSession(panel, label);
    const controlCount = Array.isArray(panel?.controls) ? panel.controls.length : 0;
    deserializeTimer(
      `controls=${controlCount} bytes=${formatBytes(payloadSizeBytes)}${Number.isFinite(nativeReadMs) ? ` nativeRead=${nativeReadMs.toFixed(1)}ms` : ''}`
    );

    const activateTimer = createPerfDebugTimer(`panel activate ${label}`);
    addPanel(panel);
    if (filePath) rememberRecentFile({ kind: 'panel', path: filePath, name: panel?.name });
    activateTimer(`controls=${controlCount}`);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        openTimer(
          `controls=${controlCount} bytes=${formatBytes(payloadSizeBytes)}${Number.isFinite(nativeReadMs) ? ` nativeRead=${nativeReadMs.toFixed(1)}ms` : ''}`
        );
      });
    });

    if (filePath) pendingOpenPanelFiles.delete(filePath);
    persistOpenPanelPaths();
    flushUnsavedSessionSnapshot();
  });

  // Session restore — receive list of paths, open each one
  onOpenPanelPaths((paths) => {
    if (Array.isArray(paths)) {
      const uniquePaths = uniquePanelPaths(paths);
      logPerfDebug('restore open-panel paths received', `count=${paths.length} unique=${uniquePaths.length}`);
      for (const path of uniquePaths) {
        pendingOpenPanelFileTimers.set(path, createPerfDebugTimer(`panel file bridge ${panelPerfLabel('', path)}`));
        bridgeOpenPanelFile(path);
      }
    }
  });

}

export function restoreSessionFromPreferences() {
  if (sessionRestoreInitialized) return;
  sessionRestoreInitialized = true;

  const unsavedRestoreTimer = createPerfDebugTimer('restore unsaved session snapshot');
  restoreUnsavedSessionFromSnapshot();
  unsavedRestoreTimer(`panels=${get(panels).length}`);

  if (get(reopenLastSession)) {
    logPerfDebug('restore saved panel paths requested');
    bridgeLoadOpenPanels();
  } else {
    scheduleUnsavedSessionAutosave();
  }
}
