// Geometry for the Listbox: a vertical stack of fixed-height rows in a
// scrollable viewport, configured by the control's Listbox section. Shared by
// the renderer (draw) and the preview surface (hit-test). Pure + unit-testable.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function listboxConfig(control) {
  return control?._children?.Listbox ?? {};
}

// All rows in render order (headers + disabled included so indices align
// between the renderer and the hit-test).
export function listboxRows(control) {
  const rows = control?._children?.Value?.rows;
  return Array.isArray(rows) ? rows : [];
}

// A row the user can actually pick (not a section header, not disabled).
export function isSelectableRow(row) {
  return !!row && row.isHeader !== true && row.enabled !== false;
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

// Top inset before the first row (ContentLayout.paddingTop).
export function listboxPadTop(control) {
  return Math.max(0, num(control?._children?.ContentLayout?.paddingTop, 6));
}

// Total height all rows want (may exceed the control → scroll).
export function listboxContentHeight(control) {
  const n = listboxRows(control).length;
  const stride = listboxRowStride(control);
  const gap = listboxRowGap(control);
  return (n > 0 ? n * stride - gap : 0) + listboxPadTop(control) * 2;
}

// Largest scrollTop that still shows content (0 when everything fits).
export function listboxMaxScroll(control, viewportHeight) {
  return Math.max(0, listboxContentHeight(control) - Math.max(0, num(viewportHeight, 0)));
}

// The row index under a control-local point, accounting for scroll; -1 if the
// click is above the first row / below the last / outside the list.
export function listboxRowIndexAtPoint(control, localY, scrollTop = 0) {
  const rows = listboxRows(control);
  if (!rows.length) return -1;
  const stride = listboxRowStride(control);
  const y = num(localY, -1) - listboxPadTop(control) + Math.max(0, num(scrollTop, 0));
  if (y < 0) return -1;
  const idx = Math.floor(y / stride);
  return idx >= 0 && idx < rows.length ? idx : -1;
}

// The Y offset (grid px, before scroll) of a row's top edge — for scroll-into-view.
export function listboxRowTop(control, index) {
  return listboxPadTop(control) + Math.max(0, num(index, 0)) * listboxRowStride(control);
}

// Indices of rows the user can move selection to (skips headers/disabled).
export function selectableIndices(control) {
  return listboxRows(control).reduce((out, row, i) => {
    if (isSelectableRow(row)) out.push(i);
    return out;
  }, []);
}

// The index of the row whose value matches `value` (-1 if none).
export function listboxIndexOfValue(control, value) {
  const target = String(value ?? '');
  return listboxRows(control).findIndex((r) => String(r?.internalValue ?? r?.id ?? '') === target);
}

// Move selection by `delta` selectable steps from the current index; returns the
// new row index (clamped), or -1 if there are no selectable rows.
export function listboxStep(control, currentIndex, delta) {
  const sel = selectableIndices(control);
  if (!sel.length) return -1;
  let pos = sel.indexOf(currentIndex);
  if (pos < 0) pos = delta >= 0 ? -1 : sel.length; // start before/after so first step lands in range
  const next = Math.max(0, Math.min(sel.length - 1, pos + Math.sign(delta) * Math.max(1, Math.abs(delta))));
  return sel[next];
}

// A scrollTop that brings row `index` fully into a `viewport`-high window,
// nudging the current `scrollTop` the minimum needed.
export function listboxScrollIntoView(control, index, viewport, scrollTop) {
  const top = listboxRowTop(control, index);
  const rh = listboxRowHeight(control);
  const view = Math.max(0, num(viewport, 0));
  const cur = Math.max(0, num(scrollTop, 0));
  const maxScroll = listboxMaxScroll(control, view);
  let next = cur;
  if (top < cur) next = top;
  else if (top + rh > cur + view) next = top + rh - view;
  return Math.max(0, Math.min(maxScroll, next));
}
