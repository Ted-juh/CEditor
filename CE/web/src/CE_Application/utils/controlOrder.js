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

export function getLayerOrder(controls) {
  const order = new Map();
  let nextIndex = 0;

  for (const control of controls ?? []) {
    const layer = getControlLayer(control);
    if (!order.has(layer)) order.set(layer, nextIndex++);
  }

  return order;
}

export function sortControlsForRender(controls) {
  const layerOrder = getLayerOrder(controls);

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

export function sortControlsForHitTest(controls) {
  return [...sortControlsForRender(controls)].reverse();
}
