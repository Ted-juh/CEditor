function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeKey(value) {
  return String(value ?? '').trim();
}

export function isRadioGroupBehavior(behavior) {
  return String(behavior?.buttonType ?? '').trim().toLowerCase() === 'radio';
}

export function normalizeRadioGroupOrientation(behavior) {
  return String(behavior?.orientation ?? 'horizontal').trim().toLowerCase() === 'vertical'
    ? 'vertical'
    : 'horizontal';
}

export function normalizeRadioGroupSelectionMode(behavior) {
  return String(behavior?.selectionMode ?? 'single').trim().toLowerCase() === 'multi'
    ? 'multi'
    : 'single';
}

export function getEnabledRadioGroupRows(valueRows = []) {
  return Array.isArray(valueRows)
    ? valueRows.filter((row) => row?.enabled !== false)
    : [];
}

export function getRadioGroupValueKey(row, fallback = '') {
  return normalizeKey(row?.internalValue ?? row?.id ?? fallback);
}

function resolveRequestedColumns(behavior, itemCount) {
  const requested = Math.max(0, Math.round(numberOr(behavior?.itemColumns, 0)));
  if (requested > 0) return Math.min(itemCount, requested);
  return normalizeRadioGroupOrientation(behavior) === 'vertical'
    ? 1
    : Math.max(1, itemCount);
}

export function resolveRadioGroupLayout({
  behavior = null,
  valueRows = [],
  width = 0,
  height = 0,
  paddingLeft = 0,
  paddingRight = 0,
  paddingTop = 0,
  paddingBottom = 0,
  gap = 0,
} = {}) {
  const rows = getEnabledRadioGroupRows(valueRows);
  if (!rows.length) {
    return {
      columns: 0,
      rowCount: 0,
      items: [],
    };
  }

  const safeGap = Math.max(0, numberOr(gap, 0));
  const safePaddingLeft = Math.max(0, numberOr(paddingLeft, 0));
  const safePaddingRight = Math.max(0, numberOr(paddingRight, 0));
  const safePaddingTop = Math.max(0, numberOr(paddingTop, 0));
  const safePaddingBottom = Math.max(0, numberOr(paddingBottom, 0));

  const columns = resolveRequestedColumns(behavior, rows.length);
  const rowCount = Math.max(1, Math.ceil(rows.length / columns));
  const contentWidth = Math.max(0, numberOr(width, 0) - safePaddingLeft - safePaddingRight);
  const contentHeight = Math.max(0, numberOr(height, 0) - safePaddingTop - safePaddingBottom);
  const cellWidth = Math.max(0, (contentWidth - (safeGap * Math.max(0, columns - 1))) / columns);
  const cellHeight = Math.max(0, (contentHeight - (safeGap * Math.max(0, rowCount - 1))) / rowCount);

  return {
    columns,
    rowCount,
    items: rows.map((row, index) => {
      const columnIndex = index % columns;
      const rowIndex = Math.floor(index / columns);
      return {
        row,
        key: getRadioGroupValueKey(row, `item_${index + 1}`),
        columnIndex,
        rowIndex,
        left: safePaddingLeft + (columnIndex * (cellWidth + safeGap)),
        top: safePaddingTop + (rowIndex * (cellHeight + safeGap)),
        width: cellWidth,
        height: cellHeight,
      };
    }),
  };
}

export function resolveRadioGroupValueAtPoint(layout, x, y) {
  const localX = numberOr(x, -1);
  const localY = numberOr(y, -1);
  if (!layout?.items?.length) return '';

  const item = layout.items.find((entry) => (
    localX >= entry.left
    && localX <= entry.left + entry.width
    && localY >= entry.top
    && localY <= entry.top + entry.height
  ));
  return item?.key ?? '';
}
