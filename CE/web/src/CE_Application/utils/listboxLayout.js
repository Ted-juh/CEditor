// Geometry for the Listbox: a vertical stack of fixed-height rows in a
// scrollable viewport, configured by the control's Listbox section. When a
// filter string is supplied the visible set is reduced (and headers dropped),
// so the renderer and the hit-test stay aligned by both passing the same
// filter. Pure + unit-testable.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function listboxConfig(control) {
  return control?._children?.Listbox ?? {};
}

// A row the user can pick (not a section header, not disabled).
export function isSelectableRow(row) {
  return !!row && row.isHeader !== true && row.enabled !== false;
}

// Fuzzy = all of q's chars appear in s in order.
function fuzzy(q, s) {
  let i = 0;
  for (const ch of s) { if (ch === q[i]) i += 1; if (i >= q.length) return true; }
  return q.length === 0;
}

// Does a row match the filter under the configured mode?
function rowMatches(row, filter, mode) {
  const q = String(filter ?? '').trim().toLowerCase();
  if (!q) return true;
  const label = String(row?.displayText ?? '').toLowerCase();
  const sub = String(row?.subtitle ?? '').toLowerCase();
  if (mode === 'fuzzy') return fuzzy(q, label) || fuzzy(q, sub);
  return label.includes(q) || sub.includes(q);
}

// The row source for the list. Normally the authored Value rows; when the
// listbox is sourced from presets (choiceSource 'devicePresets' or
// 'factoryCatalog') and the sync has injected `Listbox._presetRows`
// (stores/presetChoiceSync.js in the editor, injectPresetRowsIntoPanel in the
// Player), those take over — with the authored rows as the fallback so the
// editor still shows something to lay out.
export function listboxRowSource(control) {
  const cfg = listboxConfig(control);
  const source = String(cfg.choiceSource);
  if ((source === 'devicePresets' || source === 'factoryCatalog') && Array.isArray(cfg._presetRows) && cfg._presetRows.length) {
    return cfg._presetRows;
  }
  return control?._children?.Value?.rows;
}

// Visible rows in render order. No filter → every row (headers + disabled
// included, so authoring/reorder is faithful). With a filter → only matching
// selectable rows (headers dropped).
export function listboxRows(control, filter = '') {
  const rows = listboxRowSource(control);
  const all = Array.isArray(rows) ? rows : [];
  const q = String(filter ?? '').trim();
  if (!q) return all;
  const mode = String(listboxConfig(control).typeAhead) === 'fuzzy' ? 'fuzzy' : 'prefix';
  return all.filter((r) => isSelectableRow(r) && rowMatches(r, q, mode === 'fuzzy' ? 'fuzzy' : 'substr'));
}

// Card gap between rows (0 unless cardRows is on).
export function listboxRowGap(control) {
  return listboxConfig(control).cardRows === true ? 4 : 0;
}

// Height of a single row's content box (px).
export function listboxRowHeight(control) {
  const cfg = listboxConfig(control);
  const font = control?._children?.Text?._children?.Font ?? null;
  const size = Math.max(6, num(font?.size, 12));
  let h;
  if (num(cfg.rowHeight, 0) > 0) h = Math.round(cfg.rowHeight);
  else h = Math.max(18, Math.round(size + (String(cfg.density) === 'compact' ? 6 : 10)));
  if (cfg.twoLine === true) h += Math.round(size * 0.9) + 2; // room for the subtitle line
  return h;
}

// Row-to-row stride (content height + card gap).
export function listboxRowStride(control) {
  return listboxRowHeight(control) + listboxRowGap(control);
}

// The filter-bar height reserved at the top (0 unless filterBox is on).
export function listboxFilterHeight(control) {
  if (listboxConfig(control).filterBox !== true) return 0;
  const size = Math.max(6, num(control?._children?.Text?._children?.Font?.size, 12));
  return Math.max(20, Math.round(size + 12));
}

// Top inset before the first row (ContentLayout paddingTop + filter bar).
export function listboxPadTop(control) {
  return Math.max(0, num(control?._children?.ContentLayout?.paddingTop, 6)) + listboxFilterHeight(control);
}

// Total height the visible rows want (may exceed the control → scroll).
export function listboxContentHeight(control, filter = '') {
  const n = listboxRows(control, filter).length;
  const stride = listboxRowStride(control);
  const gap = listboxRowGap(control);
  return (n > 0 ? n * stride - gap : 0) + listboxPadTop(control) + Math.max(0, num(control?._children?.ContentLayout?.paddingTop, 6));
}

// Largest scrollTop that still shows content (0 when everything fits).
export function listboxMaxScroll(control, viewportHeight, filter = '') {
  return Math.max(0, listboxContentHeight(control, filter) - Math.max(0, num(viewportHeight, 0)));
}

// The visible-row index under a control-local point (accounting for scroll +
// filter bar); -1 above the first row / below the last / in the filter bar.
export function listboxRowIndexAtPoint(control, localY, scrollTop = 0, filter = '') {
  const rows = listboxRows(control, filter);
  if (!rows.length) return -1;
  const stride = listboxRowStride(control);
  const y = num(localY, -1) - listboxPadTop(control) + Math.max(0, num(scrollTop, 0));
  if (y < 0) return -1;
  const idx = Math.floor(y / stride);
  return idx >= 0 && idx < rows.length ? idx : -1;
}

// The Y offset (grid px, before scroll) of a visible row's top edge.
export function listboxRowTop(control, index) {
  return listboxPadTop(control) + Math.max(0, num(index, 0)) * listboxRowStride(control);
}

// Indices (into the visible set) of rows the user can move selection to.
export function selectableIndices(control, filter = '') {
  return listboxRows(control, filter).reduce((out, row, i) => {
    if (isSelectableRow(row)) out.push(i);
    return out;
  }, []);
}

// The visible index of the row whose value matches `value` (-1 if none/hidden).
export function listboxIndexOfValue(control, value, filter = '') {
  const target = String(value ?? '');
  return listboxRows(control, filter).findIndex((r) => String(r?.internalValue ?? r?.id ?? '') === target);
}

// Move selection by `delta` selectable steps from the current visible index.
export function listboxStep(control, currentIndex, delta, filter = '') {
  const sel = selectableIndices(control, filter);
  if (!sel.length) return -1;
  let pos = sel.indexOf(currentIndex);
  if (pos < 0) pos = delta >= 0 ? -1 : sel.length;
  const next = Math.max(0, Math.min(sel.length - 1, pos + Math.sign(delta) * Math.max(1, Math.abs(delta))));
  return sel[next];
}

// A scrollTop that brings visible row `index` fully into view.
export function listboxScrollIntoView(control, index, viewport, scrollTop, filter = '') {
  const top = listboxRowTop(control, index);
  const rh = listboxRowHeight(control);
  const view = Math.max(0, num(viewport, 0));
  const cur = Math.max(0, num(scrollTop, 0));
  const maxScroll = listboxMaxScroll(control, view, filter);
  let next = cur;
  if (top < cur + listboxFilterHeight(control)) next = top - listboxFilterHeight(control);
  else if (top + rh > cur + view) next = top + rh - view;
  return Math.max(0, Math.min(maxScroll, next));
}
