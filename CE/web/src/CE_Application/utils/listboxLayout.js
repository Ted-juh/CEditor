// Geometry for the Listbox: a vertical stack of fixed-height rows in a
// scrollable viewport. Shared by the renderer (draw) and the preview surface
// (hit-test) so a click lands on the row it's over. Pure + unit-testable.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function listboxRows(control) {
  const rows = control?._children?.Value?.rows;
  return Array.isArray(rows) ? rows.filter((r) => r?.enabled !== false) : [];
}

// Per-row height in px, derived from the font size (with a sensible floor).
export function listboxRowHeight(control) {
  const font = control?._children?.Text?._children?.Font ?? null;
  const size = Math.max(6, num(font?.size, 12));
  return Math.max(18, Math.round(size + 10));
}

// Top inset before the first row (ContentLayout.paddingTop).
export function listboxPadTop(control) {
  return Math.max(0, num(control?._children?.ContentLayout?.paddingTop, 6));
}

// Total height all rows want (may exceed the control → scroll).
export function listboxContentHeight(control) {
  return listboxRows(control).length * listboxRowHeight(control) + listboxPadTop(control) * 2;
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
  const rh = listboxRowHeight(control);
  const y = num(localY, -1) - listboxPadTop(control) + Math.max(0, num(scrollTop, 0));
  if (y < 0) return -1;
  const idx = Math.floor(y / rh);
  return idx >= 0 && idx < rows.length ? idx : -1;
}
