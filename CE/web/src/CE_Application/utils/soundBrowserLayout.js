/** Keep rendering proportional to the visible dock, even for large vendor libraries. */
export function presetWindow(count, scrollTop, viewportHeight, rowHeight = 32) {
  const total = Math.max(0, count);
  const rows = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight));
  const first = Math.min(Math.max(0, total - rows), Math.max(0, Math.floor(scrollTop / rowHeight)));
  const start = Math.max(0, first - 6);
  const end = Math.min(total, first + rows + 6);
  return { start, end, before: start * rowHeight, after: (total - end) * rowHeight };
}

export function matchesPresetKind(record, kind) {
  if (kind === 'instrument') return record.type === 'preset' && !record.isEffect;
  if (kind === 'effect') return record.type === 'preset' && record.isEffect;
  return true;
}
