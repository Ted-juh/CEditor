// panelLayerActions.js — everything the Layers dock does to a panel.
//
// Kept apart from the component so the model can be tested without mounting Svelte, and apart from
// utils/panelLayers.js so that file stays pure. The rules that need saying out loud:
//
//   - A layer's position in the array IS its paint order. Reordering is the whole of
//     "send to back", which is why there is no separate z-index for layers.
//   - Deleting a layer must never delete controls. They move to a surviving layer, and the panel
//     always keeps at least one, because a control whose layer does not exist is a control that
//     renders in an arbitrary place.
//   - Renaming is a rename AND a reassign: `Core.layer` holds the name, so the two have to move
//     together or every control on the layer is orphaned. Doing it in one store update means undo
//     sees one step rather than two, which matters because half a rename is not a state anyone
//     wants to land on.

import { derived, get, writable } from 'svelte/store';

import { panels, resolvedActivePanelId, activePanel, selectedComponentIds } from './panels.js';
import { pushSnapshot } from './history.js';
import { mapControlsTree } from '../utils/containment.js';
import { SCENERY_KIND } from '../utils/sceneryCompile.js';
import {
  DEFAULT_LAYER_NAME, createLayer, findLayer, layerColour, normalizeLayerName, normalizePanelLayers,
  reorderLayers, resolveActiveLayer, uniqueLayerName,
} from '../utils/panelLayers.js';

/** Read the active panel's layers, migrating on the fly if the document predates them. */
export function activeLayers() {
  const panel = get(activePanel);
  if (!panel) return [];
  return normalizePanelLayers(panel.layers, panel.controls);
}

/**
 * One store update: new layer list, and optionally a rewrite of which layer controls name.
 *
 * `assign` maps an old layer name to a new one. Controls are only cloned when their layer actually
 * changes, so moving one layer's worth of controls does not replace the whole tree — the history
 * snapshot shares everything it did not touch, and that is only true if we do not touch it.
 */
function commit(mutate, assign = null) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  pushSnapshot();
  panels.update((list) => list.map((panel) => {
    if (panel.id !== panelId) return panel;

    const layers = mutate(normalizePanelLayers(panel.layers, panel.controls));
    let controls = panel.controls;

    if (assign) {
      controls = mapControlsTree(panel.controls, (control) => {
        const current = normalizeLayerName(control?._children?.Core?.layer);
        const next = assign(current, control);
        if (next == null || next === current) return control;
        return {
          ...control,
          _children: { ...control._children, Core: { ...control._children.Core, layer: next } },
        };
      });
    }

    return { ...panel, layers, controls, modified: true };
  }));
  pushSnapshot();
}

export function addLayer(name = null) {
  commit((layers) => [...layers, createLayer(name ?? uniqueLayerName(layers))]);
}

/**
 * Remove a layer; its controls move to the nearest survivor rather than disappearing.
 *
 * "Nearest" is the layer below it, or above if it was already at the bottom — so a control ends up
 * adjacent to where it was drawn rather than teleporting to whatever happens to be first.
 */
export function removeLayer(name) {
  const target = normalizeLayerName(name);
  const layers = activeLayers();
  if (layers.length <= 1 || !findLayer(layers, target)) return;

  const index = layers.findIndex((layer) => layer.name === target);
  const survivor = layers[index - 1]?.name ?? layers[index + 1]?.name ?? DEFAULT_LAYER_NAME;

  commit(
    (current) => current.filter((layer) => layer.name !== target),
    (currentName) => (currentName === target ? survivor : null),
  );
}

export function renameLayer(from, to) {
  const before = normalizeLayerName(from);
  const after = normalizeLayerName(to);
  if (before === after) return;

  const layers = activeLayers();
  if (!findLayer(layers, before) || findLayer(layers, after)) return;   // no merging by rename

  commit(
    (current) => current.map((layer) => (layer.name === before ? { ...layer, name: after } : layer)),
    (currentName) => (currentName === before ? after : null),
  );
}

/** `to` is an index in the layer array: 0 paints furthest back. */
export function moveLayer(name, to) {
  const target = normalizeLayerName(name);
  commit((layers) => {
    const from = layers.findIndex((layer) => layer.name === target);
    return from < 0 ? layers : reorderLayers(layers, from, to);
  });
}

function setLayerFlag(name, key, value) {
  const target = normalizeLayerName(name);
  commit((layers) => layers.map((layer) => (layer.name === target ? { ...layer, [key]: value } : layer)));
}

export const setLayerVisible = (name, visible) => setLayerFlag(name, 'visible', visible === true);
export const setLayerLocked = (name, locked) => setLayerFlag(name, 'locked', locked === true);

/**
 * Declare a layer scenery, or take the declaration back.
 *
 * A `kind` any layer can be flipped to, rather than a layer type you create as one. The question
 * came up while designing this and the answer is what actually happens in use: you draw the chassis
 * on a layer without knowing yet that it IS the chassis, and a type fixed at creation would mean
 * making a second layer and moving everything onto it to find out. Nothing about the controls
 * changes when the kind does — the compiler reads them, it does not rewrite them — so flipping back
 * is free and there is no state to migrate.
 */
export const setLayerKind = (name, kind) =>
  setLayerFlag(name, 'kind', kind === SCENERY_KIND ? SCENERY_KIND : 'controls');

/* ------------------------------------------------------------------ the active layer */

// Which layer a newly-drawn control lands on. UI state, not document state: it is a statement about
// what you are working on right now, and storing it in the .cepanel would make "where I was" a
// property of the file, shared with everyone who opens it and undoable, which it is not.
//
// Deliberately NOT reset when the panel changes. Resolution is total (utils/panelLayers.js), so a
// name that means nothing in the panel you just switched to resolves back to Main rather than
// dropping controls somewhere invisible — and switching back finds your layer still selected.
export const activeLayerName = writable(null);

/** The layer a control drawn right now would land on, for this panel, as it stands. */
export function targetLayerName() {
  return resolveActiveLayer(activeLayers(), get(activeLayerName));
}

/** Pick the layer to draw on. Locked layers refuse — a control you cannot then select is a trap. */
export function setActiveLayer(name) {
  const target = normalizeLayerName(name);
  const layer = findLayer(activeLayers(), target);
  if (!layer || layer.locked === true) return;
  activeLayerName.set(target);
}

/* ------------------------------------------------------------------ solo */

/**
 * Show only this layer — or, if it is already the only visible one, show them all again.
 *
 * One commit, so it is one undo step. The toggle-back is what makes this usable as a look rather
 * than an edit: alt-click to check what is on a layer, alt-click to put the panel back.
 */
export function soloLayer(name) {
  const target = normalizeLayerName(name);
  const layers = activeLayers();
  if (!findLayer(layers, target)) return;

  const soloed = layers.every((layer) => (layer.name === target) === (layer.visible !== false));
  commit((current) => current.map((layer) => ({
    ...layer,
    visible: soloed || layer.name === target,
  })));
}

/** Colour coding. Clearing DELETES the key rather than storing null — see utils/panelLayers.js. */
export function setLayerColour(name, colour) {
  const target = normalizeLayerName(name);
  commit((layers) => layers.map((layer) => {
    if (layer.name !== target) return layer;
    if (colour == null) {
      const { colour: dropped, ...rest } = layer;
      return rest;
    }
    return { ...layer, colour: String(colour) };
  }));
}

/**
 * layer name -> colour, for the canvas.
 *
 * A store rather than a per-control derivation because the canvas asks this question once per
 * control per render, and 400 controls each rebuilding the layer list is exactly the kind of
 * quadratic that makes a panel feel slow for no visible reason.
 *
 * Derived from `layers` ALONE, with no controls passed to the normalizer. Self-healing exists so
 * that a control on an unlisted layer still renders; it has nothing to teach about colour, and
 * feeding the controls in here would rebuild the map on every drag frame.
 */
export const layerTints = derived(activePanel, ($panel) => {
  const map = new Map();
  for (const layer of normalizePanelLayers($panel?.layers, [])) {
    const colour = layerColour(layer);
    if (colour) map.set(layer.name, colour);
  }
  return map;
});

/** Move the current selection onto a layer — the "put this where it belongs" action. */
export function assignSelectionToLayer(name) {
  const target = normalizeLayerName(name);
  const ids = get(selectedComponentIds);
  if (!ids || ids.size === 0) return;
  if (!findLayer(activeLayers(), target)) return;

  commit(
    (layers) => layers,
    (currentName, control) => (ids.has(control?._children?.Core?.id) ? target : null),
  );
}
