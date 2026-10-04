/** Content-aware sizing for the Hostage editor dock. */

export const HOST_DOCK_TABS = Object.freeze(['sounds', 'zone', 'midi', 'inserts', 'routing', 'params', 'rack']);

const TAB_MINIMUMS = Object.freeze({
  sounds: 360,
  zone: 170,
  midi: 220,
  inserts: 170,
  routing: 190,
  params: 240,
  rack: 220,
});

const STORAGE_KEY = 'ceditor.instrumentHost.dockHeights.v1';

// The dock may take up to three quarters of the workspace: the part editor is where the work
// happens, and a tall window should give it the room rather than the rack list above it. The
// rack keeps a quarter, enough for a few parts and the keyboard.
export function dockHeightBounds(availableHeight = 0) {
  const minimum = 140;
  const maximum = availableHeight > 0
    ? Math.max(minimum, Math.floor(availableHeight * 0.75))
    : 720;
  return { minimum, maximum };
}

export function clampDockHeight(height, availableHeight = 0) {
  const { minimum, maximum } = dockHeightBounds(availableHeight);
  const numeric = Number.isFinite(Number(height)) ? Number(height) : minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

export function preferredDockHeight(tab, contentHeight = 0, availableHeight = 0) {
  // A scrolling preset list fills its dock; fitting thousands of rows would always maximise it.
  if (tab === 'sounds') return clampDockHeight(TAB_MINIMUMS.sounds, availableHeight);
  const tabMinimum = TAB_MINIMUMS[tab] ?? 200;
  // Tab bar, resize grip and vertical body padding together occupy about 54 px.
  const contentFit = Math.max(0, Number(contentHeight) || 0) + 54;
  return clampDockHeight(Math.max(tabMinimum, contentFit), availableHeight);
}

export function normaliseDockHeights(value = {}) {
  return Object.fromEntries(HOST_DOCK_TABS.flatMap((tab) => {
    if (value?.[tab] === null || value?.[tab] === undefined || value?.[tab] === '') return [];
    const height = Number(value?.[tab]);
    return Number.isFinite(height) ? [[tab, Math.max(140, Math.min(2400, Math.round(height)))]] : [];
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
