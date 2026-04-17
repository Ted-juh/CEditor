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
} from '../bridge/bridge.js';
import {
  reopenLastSession,
  autosaveEnabled,
  autosaveIntervalSeconds,
  restoreUnsavedWork,
  defaultSnapToGrid,
  defaultGridSize,
} from './runtimePreferences.js';

/**
 * Panel data model.
 * Each panel has: id, name, width, height, modified, filePath, controls (empty for now).
 */

let nextId = 1;
const UNSAVED_PANELS_KEY = 'ce.unsavedPanels';
const UNSAVED_ACTIVE_TAB_KEY = 'ce.unsavedActiveEditorTab';
let autosaveTimer = null;
let sessionRestoreInitialized = false;

/** Create a new panel object with defaults */
export function createPanel(name = null) {
  const id = nextId++;
  return {
    id,
    name: name ?? `Untitled ${id}`,
    scriptId: `panel_${id}`,
    author: '',
    version: '1.0.0',
    description: '',
    enabled: true,
    locked: false,
    filePath: null,
    width: 600,
    height: 400,
    resizable: false,
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,
    maxHeight: 0,
    lockAspectRatio: false,
    // --- Background layers ---
    bgLayerOrder: ['solid', 'gradient', 'image', 'texture'],
    bgSolid: true,
    bgColour: 'FF333333',
    bgGradientEnabled: false,
    bgGradientOpacity: 100,
    bgGradientName: '',
    bgGradient: {
      type: 'linear',
      angle: 90,
      centerX: 50,
      centerY: 50,
      radiusX: 50,
      radiusY: 50,
      edge: 0,
      stops: [
        { color: 'FF0000', position: 0 },
        { color: '0000FF', position: 100 },
      ],
    },
    bgImageEnabled: false,
    bgImage: '',
    bgImageOpacity: 100,
    bgImageFit: 'fill',
    bgImageAlign: 'center',
    bgImageOffsetX: 0,
    bgImageOffsetY: 0,
    bgImageBlend: 'normal',
    bgImageBlur: 0,
    bgImageTint: 'FFFFFF',
    bgImageFlipH: false,
    bgImageFlipV: false,
    bgImageRotation: 0,
    bgImageGrayscale: false,
    bgImageSaturation: 100,
    bgImageBrightness: 100,
    bgImageContrast: 100,
    bgImageTileScale: 1.0,
    bgTextureEnabled: false,
    bgTexture: '',
    bgTextureOpacity: 100,
    bgTextureFit: 'tile',
    bgTextureAlign: 'center',
    bgTextureOffsetX: 0,
    bgTextureOffsetY: 0,
    bgTextureBlend: 'normal',
    bgTextureBlur: 0,
    bgTextureTint: 'FFFFFF',
    bgTextureFlipH: false,
    bgTextureFlipV: false,
    bgTextureRotation: 0,
    bgTextureGrayscale: false,
    bgTextureSaturation: 100,
    bgTextureBrightness: 100,
    bgTextureContrast: 100,
    bgTextureTileScale: 1.0,
    gridEnabled: true,
    gridSize: get(defaultGridSize),
    gridColour: '33FFFFFF',
    gridLineWidth: 1,
    gridType: 'lines',
    gridSubdivision: 1,
    gridSubColour: '55FFFFFF',
    gridCentered: false,
    gridOriginX: 0,
    gridOriginY: 0,
    snapToGrid: get(defaultSnapToGrid),
    notepad: {
      notes: [{ name: 'Note 1', content: '' }],
      activeNoteIndex: 0,
    },
    viewer: {
      images: [],
      activeImageIndex: 0,
    },
    modified: false,
    controls: [],
  };
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

function readStoredJson(key, fallback) {
  if (!canUseLocalStorage()) return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

function clearUnsavedSessionSnapshot() {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.removeItem(UNSAVED_PANELS_KEY);
    localStorage.removeItem(UNSAVED_ACTIVE_TAB_KEY);
  } catch { /* ignore */ }
}

function buildUnsavedSessionSnapshot() {
  return get(panels)
    .filter((panel) => !panel.filePath || panel.modified)
    .map((panel) => ({ ...panel }));
}

function persistUnsavedSessionSnapshot() {
  if (!get(autosaveEnabled) || !get(restoreUnsavedWork)) {
    clearUnsavedSessionSnapshot();
    return;
  }

  const snapshot = buildUnsavedSessionSnapshot();
  if (snapshot.length === 0) {
    clearUnsavedSessionSnapshot();
    return;
  }

  writeStoredJson(UNSAVED_PANELS_KEY, snapshot);
  writeStoredJson(UNSAVED_ACTIVE_TAB_KEY, get(activeEditorTab));
}

export function flushUnsavedSessionSnapshot() {
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  persistUnsavedSessionSnapshot();
}

function scheduleUnsavedSessionAutosave() {
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (!sessionRestoreInitialized || !get(autosaveEnabled) || !get(restoreUnsavedWork)) {
    if (!get(restoreUnsavedWork)) clearUnsavedSessionSnapshot();
    return;
  }

  autosaveTimer = setTimeout(() => {
    persistUnsavedSessionSnapshot();
    autosaveTimer = null;
  }, Math.max(5, get(autosaveIntervalSeconds)) * 1000);
}

function restoreUnsavedSessionFromSnapshot() {
  if (!get(restoreUnsavedWork)) {
    clearUnsavedSessionSnapshot();
    return;
  }

  const snapshot = readStoredJson(UNSAVED_PANELS_KEY, []);
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

  const savedActiveTab = readStoredJson(UNSAVED_ACTIVE_TAB_KEY, null);
  const restoredActiveId = idMap.get(savedActiveTab?.id) ?? restoredPanels[restoredPanels.length - 1]?.id ?? null;

  if (restoredActiveId != null) {
    activePanelId.set(restoredActiveId);
    activeEditorTab.set({ type: 'panel', id: restoredActiveId });
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

/** Active multi-drag delta — applied visually to all selected components during drag */
export const multiDragDelta = writable({ x: 0, y: 0, active: false });

/** Editor zoom state */
export const editorZoom = writable(100);
export const editorZoomIncrement = writable(10);

/** All open panels */
export const panels = writable([]);

/** ID of the active (visible) panel */
export const activePanelId = writable(null);

/** Whether the global Settings editor tab is open */
export const settingsTabOpen = writable(false);

/** Active editor tab descriptor: { type: 'panel'|'settings', id } */
export const activeEditorTab = writable({ type: 'panel', id: null });

/** All editor tabs shown in the top tab bar */
export const editorTabs = derived(
  [panels, settingsTabOpen],
  ([$panels, $settingsTabOpen]) => {
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

    return tabs;
  }
);

/** The active panel object (derived) */
export const activePanel = derived(
  [panels, activePanelId, activeEditorTab],
  ([$panels, $activePanelId, $activeEditorTab]) =>
    $activeEditorTab?.type === 'panel'
      ? ($panels.find(p => p.id === $activePanelId) ?? null)
      : null
);

/** Add a new panel and make it active */
export function addPanel(panel = null) {
  const p = panel ?? createPanel();
  panels.update(list => [...list, p]);
  activePanelId.set(p.id);
  activeEditorTab.set({ type: 'panel', id: p.id });
  return p;
}

/** Open the global Settings editor tab and activate it */
export function openSettingsTab() {
  settingsTabOpen.set(true);
  activeEditorTab.set({ type: 'settings', id: 'settings' });
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

/** Close a panel by id */
export function closePanel(id) {
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
}

/** Switch to a panel by id */
export function setActivePanel(id) {
  activePanelId.set(id);
  activeEditorTab.set({ type: 'panel', id });
}

/** Switch to any editor tab by descriptor */
export function setActiveEditorTab(tab) {
  if (!tab) return;

  if (tab.tabType === 'settings' || tab.type === 'settings' || tab.id === 'settings') {
    openSettingsTab();
    return;
  }

  const panelId = tab.id ?? null;
  if (panelId != null) {
    setActivePanel(panelId);
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

  if (tab.type === 'panel' && tab.id != null) {
    closePanel(tab.id);
  }
}

/** Update a panel's properties */
export function updatePanel(id, updates) {
  panels.update(list =>
    list.map(p => {
      if (p.id !== id) return p;

      // Lock aspect ratio: proportionally adjust the other dimension
      if (p.lockAspectRatio && p.width > 0 && p.height > 0) {
        const ratio = p.width / p.height;
        if ('width' in updates && !('height' in updates)) {
          updates.height = Math.round(updates.width / ratio);
        } else if ('height' in updates && !('width' in updates)) {
          updates.width = Math.round(updates.height * ratio);
        }
      }

      return { ...p, ...updates, modified: true };
    })
  );
}

// --- Serialization ---

/** Serialize a panel to JSON (strip runtime-only fields) */
function serializePanel(panel) {
  const { id, modified, ...data } = panel;
  return JSON.stringify(data, null, 2);
}

/** Deserialize JSON into a panel object */
function deserializePanel(json, filePath, name) {
  const data = JSON.parse(json);
  const id = nextId++;
  return {
    ...createPanel(),
    ...data,
    id,
    filePath,
    name: name || data.name || `Untitled ${id}`,
    modified: false,
  };
}

// --- Save / Open actions ---

/** Save the active panel. If it has no filePath, triggers Save As. */
export function saveActivePanel() {
  const panel = get(activePanel);
  if (!panel) return;

  if (panel.filePath) {
    bridgeSavePanel(String(panel.id), panel.filePath, serializePanel(panel));
  } else {
    saveActivePanelAs();
  }
}

/** Save the active panel with a file dialog. */
export function saveActivePanelAs() {
  const panel = get(activePanel);
  if (!panel) return;

  bridgeSavePanelAs(String(panel.id), serializePanel(panel));
}

/** Open a panel from a file dialog. */
export function openPanelFromFile() {
  bridgeOpenPanel();
}

/** Persist the list of saved (filePath != null) open panel paths to C++ settings. */
function persistOpenPanelPaths() {
  const list = get(panels);
  const paths = list.filter(p => p.filePath).map(p => p.filePath);
  bridgeUpdateOpenPanels(paths);
}

panels.subscribe(() => {
  scheduleUnsavedSessionAutosave();
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

// --- Bridge event listeners ---

/** Initialize bridge listeners. Call once at app startup. */
export function initPanelBridge() {
  // Panel saved successfully — update filePath, name, clear modified flag
  onPanelSaved((payload) => {
    const panelId = parseInt(payload.panelId, 10);
    const updates = { filePath: payload.filePath, modified: false };
    if (payload.name) updates.name = payload.name;

    panels.update(list =>
      list.map(p => p.id === panelId ? { ...p, ...updates } : p)
    );

    // Persist open panel paths now that this panel has a file
    persistOpenPanelPaths();
    flushUnsavedSessionSnapshot();
  });

  // Panel opened from file — create panel and make it active
  onPanelOpened((payload) => {
    // Check if this file is already open
    const existing = get(panels).find(p => p.filePath === payload.filePath);
    if (existing) {
      activePanelId.set(existing.id);
      return;
    }

    const panel = deserializePanel(payload.data, payload.filePath, payload.name);
    addPanel(panel);
    persistOpenPanelPaths();
    flushUnsavedSessionSnapshot();
  });

  // Session restore — receive list of paths, open each one
  onOpenPanelPaths((paths) => {
    if (Array.isArray(paths)) {
      for (const path of paths) {
        bridgeOpenPanelFile(path);
      }
    }
  });

}

export function restoreSessionFromPreferences() {
  if (sessionRestoreInitialized) return;
  sessionRestoreInitialized = true;

  restoreUnsavedSessionFromSnapshot();

  if (get(reopenLastSession)) {
    bridgeLoadOpenPanels();
  } else {
    scheduleUnsavedSessionAutosave();
  }
}
