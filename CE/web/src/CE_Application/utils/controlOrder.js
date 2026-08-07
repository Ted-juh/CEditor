const DEFAULT_LAYER_NAME = 'Main';

export function getControlCore(control) {
  return control?._children?.Core ?? null;
}

export function getControlId(control) {
  return getControlCore(control)?.id ?? null;
}

export function normalizeLayerName(layer) {
  return typeof layer === 'string' && layer.trim() ? layer.trim() : DEFAULT_LAYER_NAME;
}

export function getControlLayer(control) {
  return normalizeLayerName(getControlCore(control)?.layer);
}

export function getControlZIndex(control) {
  const value = Number(getControlCore(control)?.zIndex);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Layer paint order, derived from where each layer's first member happens to sit.
 *
 * KEPT ONLY AS A FALLBACK. Deriving order from array position means deleting an unrelated control
 * can restack the panel: in [A(Main), B(Background), C(Main)], Background paints in front; delete A
 * and it paints behind, because its first member is now index 0. Panels carry an explicit layer
 * order now (utils/panelLayers.js) and callers pass it; this is what happens when nobody does —
 * a bare control list with no panel around it, which is mostly tests and hit-testing helpers.
 */
export function getLayerOrder(controls) {
  const order = new Map();
  let nextIndex = 0;

  for (const control of controls ?? []) {
    const layer = getControlLayer(control);
    if (!order.has(layer)) order.set(layer, nextIndex++);
  }

  return order;
}

/** An explicit order wins; anything it does not name falls in behind, in first-appearance order. */
function resolveLayerOrder(controls, orderedLayerNames) {
  if (!Array.isArray(orderedLayerNames) || orderedLayerNames.length === 0) return getLayerOrder(controls);

  const order = new Map();
  orderedLayerNames.forEach((name, index) => order.set(normalizeLayerName(name), index));

  let next = order.size;
  for (const control of controls ?? []) {
    const layer = getControlLayer(control);
    if (!order.has(layer)) order.set(layer, next++);
  }
  return order;
}

/**
 * @param {Array} controls
 * @param {string[]} [orderedLayerNames]  the panel's layers, back to front. Omit and the order is
 *   inferred from the list, which is the legacy behaviour and can restack — see getLayerOrder.
 */
export function sortControlsForRender(controls, orderedLayerNames = null) {
  const layerOrder = resolveLayerOrder(controls, orderedLayerNames);

  return [...(controls ?? [])]
    .map((control, index) => ({
      control,
      index,
      layer: getControlLayer(control),
      zIndex: getControlZIndex(control),
    }))
    .sort((a, b) => {
      const layerDelta = (layerOrder.get(a.layer) ?? 0) - (layerOrder.get(b.layer) ?? 0);
      if (layerDelta !== 0) return layerDelta;

      const zDelta = a.zIndex - b.zIndex;
      if (zDelta !== 0) return zDelta;

      return a.index - b.index;
    })
    .map(entry => entry.control);
}

export function sortControlsForHitTest(controls, orderedLayerNames = null) {
  return [...sortControlsForRender(controls, orderedLayerNames)].reverse();
}
