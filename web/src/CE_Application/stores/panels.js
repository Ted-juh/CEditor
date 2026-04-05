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

/**
 * Panel data model.
 * Each panel has: id, name, width, height, modified, filePath, controls (empty for now).
 */

let nextId = 1;

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
    gridSize: 10,
    gridColour: '33FFFFFF',
    gridLineWidth: 1,
    gridType: 'lines',
    gridSubdivision: 1,
    gridSubColour: '55FFFFFF',
    gridCentered: false,
    gridOriginX: 0,
    gridOriginY: 0,
    snapToGrid: true,
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

/** The active panel object (derived) */
export const activePanel = derived(
  [panels, activePanelId],
  ([$panels, $activePanelId]) => $panels.find(p => p.id === $activePanelId) ?? null
);

/** Add a new panel and make it active */
export function addPanel(panel = null) {
  const p = panel ?? createPanel();
  panels.update(list => [...list, p]);
  activePanelId.set(p.id);
  return p;
}

/** Close a panel by id */
export function closePanel(id) {
  panels.update(list => {
    const idx = list.findIndex(p => p.id === id);
    const newList = list.filter(p => p.id !== id);

    // If we closed the active tab, activate an adjacent one
    activePanelId.update(activeId => {
      if (activeId !== id) return activeId;
      if (newList.length === 0) return null;
      // Prefer the tab to the left, or the first remaining
      const newIdx = Math.min(idx, newList.length - 1);
      return newList[newIdx].id;
    });

    return newList;
  });

  // Update persisted open panel paths
  persistOpenPanelPaths();
}

/** Switch to a panel by id */
export function setActivePanel(id) {
  activePanelId.set(id);
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
  });

  // Session restore — receive list of paths, open each one
  onOpenPanelPaths((paths) => {
    if (Array.isArray(paths)) {
      for (const path of paths) {
        bridgeOpenPanelFile(path);
      }
    }
  });

  // Request stored open panel paths from C++
  bridgeLoadOpenPanels();
}
