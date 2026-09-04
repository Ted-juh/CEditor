/** Content-aware sizing for the Hostage editor dock. */

export const HOST_DOCK_TABS = Object.freeze(['zone', 'midi', 'inserts', 'routing', 'params', 'rack']);

const TAB_MINIMUMS = Object.freeze({
  zone: 170,
  midi: 220,
  inserts: 170,
  routing: 190,
  params: 240,
  rack: 220,
});

const STORAGE_KEY = 'ceditor.instrumentHost.dockHeights.v1';

export function dockHeightBounds(availableHeight = 0) {
  const minimum = 140;
  const maximum = availableHeight > 0
    ? Math.max(minimum, Math.min(520, Math.floor(availableHeight * 0.48)))
    : 520;
  return { minimum, maximum };
}

export function clampDockHeight(height, availableHeight = 0) {
  const { minimum, maximum } = dockHeightBounds(availableHeight);
  const numeric = Number.isFinite(Number(height)) ? Number(height) : minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

export function preferredDockHeight(tab, contentHeight = 0, availableHeight = 0) {
  const tabMinimum = TAB_MINIMUMS[tab] ?? 200;
  // Tab bar, resize grip and vertical body padding together occupy about 54 px.
  const contentFit = Math.max(0, Number(contentHeight) || 0) + 54;
  return clampDockHeight(Math.max(tabMinimum, contentFit), availableHeight);
}

export function normaliseDockHeights(value = {}) {
  return Object.fromEntries(HOST_DOCK_TABS.flatMap((tab) => {
    if (value?.[tab] === null || value?.[tab] === undefined || value?.[tab] === '') return [];
    const height = Number(value?.[tab]);
    return Number.isFinite(height) ? [[tab, Math.max(140, Math.min(720, Math.round(height)))]] : [];
  }));
}

export function restoreDockHeights(storage = globalThis?.localStorage) {
  if (!storage) return {};
  try {
    return normaliseDockHeights(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export function storeDockHeights(value, storage = globalThis?.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normaliseDockHeights(value)));
  } catch {
    // Resizing still works when storage is unavailable.
  }
}
