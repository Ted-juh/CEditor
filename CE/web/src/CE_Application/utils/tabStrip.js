/**
 * tabStrip.js — the pure half of the editor tab strip: user ordering, overflow, and which of a
 * tab's context-menu commands can actually run.
 *
 * Review finding D8: "no tab reorder, no overflow UI, no per-tab context menu, no file-path
 * tooltip."
 *
 * Reordering has one structural constraint worth writing down, because it is the reason this is
 * an override list and not a simple array move. `editorTabs` (panels.js:430) is a *derived*
 * store: it concatenates panels, the settings tab, device profiles, component documents, script
 * documents and screen documents, in that fixed order, from six independent stores. There is no
 * single array to splice. So the strip keeps its own list of tab keys and sorts the derived list
 * through it; a tab the override has never seen keeps its natural place at the end, which is
 * where a newly opened tab belongs anyway.
 */

/** Stable identity for a tab across re-derives. `id` alone collides across tab types. */
export function tabKey(tab) {
  if (!tab) return '';
  const type = String(tab.tabType ?? tab.type ?? '');
  return `${type}:${String(tab.id ?? '')}`;
}

/**
 * Sort `tabs` by `order`, appending anything the order has not seen.
 *
 * Order entries for tabs that have since closed are ignored rather than treated as gaps — a
 * closed-and-reopened document should come back where the user put it, so the entries are left
 * in the stored order and only filtered at read time.
 */
export function applyTabOrder(tabs, order) {
  const list = Array.isArray(tabs) ? tabs : [];
  const keys = Array.isArray(order) ? order : [];
  if (keys.length === 0) return [...list];

  const byKey = new Map(list.map((tab) => [tabKey(tab), tab]));
  const placed = [];
  const seen = new Set();
  for (const key of keys) {
    const tab = byKey.get(key);
    if (!tab || seen.has(key)) continue;
    seen.add(key);
    placed.push(tab);
  }
  for (const tab of list) {
    if (!seen.has(tabKey(tab))) placed.push(tab);
  }
  return placed;
}

/**
 * Move `fromKey` to `toKey`'s position.
 *
 * Direction matters and is the thing that feels broken when it is wrong: dragging a tab
 * rightwards onto another must land it *after* that tab, dragging leftwards *before* it.
 * Inserting at the target's index unconditionally gets one of those two backwards, and the tab
 * appears to refuse to move past its neighbour.
 */
export function moveTabKey(order, fromKey, toKey) {
  const keys = Array.isArray(order) ? [...order] : [];
  if (!fromKey || !toKey || fromKey === toKey) return keys;

  const fromIndex = keys.indexOf(fromKey);
  const toIndex = keys.indexOf(toKey);
  if (fromIndex < 0 || toIndex < 0) return keys;

  keys.splice(fromIndex, 1);
  const anchor = keys.indexOf(toKey);
  const insertAt = anchor + (fromIndex < toIndex ? 1 : 0);
  keys.splice(insertAt, 0, fromKey);
  return keys;
}

/** Snapshot the current visual order as the new override, so the first drag has something to move within. */
export function seedTabOrder(tabs, order) {
  return applyTabOrder(tabs, order).map(tabKey);
}

/** Forget keys for tabs that no longer exist, so the stored list cannot grow without bound. */
export function pruneTabOrder(order, tabs) {
  const live = new Set((Array.isArray(tabs) ? tabs : []).map(tabKey));
  return (Array.isArray(order) ? order : []).filter((key) => live.has(key));
}

/**
 * Which edges have tabs hidden past them. A bare `overflow-x: auto` (the strip's whole previous
 * answer) scrolls but never says there is anything to scroll to, so a tab pushed off the end is
 * indistinguishable from a tab that was never opened.
 */
export function tabOverflowState({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const slack = Math.max(0, scrollWidth - clientWidth);
  // Sub-pixel layout leaves a fraction of a pixel of "overflow" on a strip that plainly fits.
  const overflowing = slack > 1;
  return {
    overflowing,
    atStart: !overflowing || scrollLeft <= 1,
    atEnd: !overflowing || scrollLeft >= slack - 1,
    hiddenBefore: overflowing && scrollLeft > 1,
    hiddenAfter: overflowing && scrollLeft < slack - 1,
  };
}

/**
 * What a right-click on the tab at `index` may offer. "Close Others" with one tab open and
 * "Close to the Right" on the last tab are the two that look enabled and do nothing.
 */
export function tabContextAvailability(tabs, index, tab) {
  const list = Array.isArray(tabs) ? tabs : [];
  const at = Number.isInteger(index) ? index : list.findIndex((item) => tabKey(item) === tabKey(tab));
  const path = String(tab?.filePath ?? '').trim();
  return {
    canClose: at >= 0,
    canCloseOthers: list.length > 1,
    canCloseToRight: at >= 0 && at < list.length - 1,
    canCopyPath: path.length > 0,
    canReveal: path.length > 0,
  };
}

/** The tabs a "Close Others" / "Close to the Right" click should close, in a stable order. */
export function tabsToClose(tabs, index, mode) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (!Number.isInteger(index) || index < 0) return [];
  if (mode === 'others') return list.filter((_, i) => i !== index);
  if (mode === 'right') return list.slice(index + 1);
  return [];
}
