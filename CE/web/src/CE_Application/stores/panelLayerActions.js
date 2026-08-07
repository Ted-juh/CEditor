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

import { get } from 'svelte/store';

import { panels, resolvedActivePanelId, activePanel, selectedComponentIds } from './panels.js';
import { pushSnapshot } from './history.js';
import { mapControlsTree } from '../utils/containment.js';
import {
  DEFAULT_LAYER_NAME, createLayer, findLayer, normalizeLayerName, normalizePanelLayers,
  reorderLayers, uniqueLayerName,
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
