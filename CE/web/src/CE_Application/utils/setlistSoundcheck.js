export function soundcheckDb(value, measured) {
  if (!measured || !Number.isFinite(value) || value < 0) return '—';
  return value === 0 ? '−∞' : (20 * Math.log10(value)).toFixed(1);
}

export function soundcheckReferenceStatus(entry) {
  if (!entry?.checkedAt) return { kind: 'unchecked', label: 'References not checked' };
  const count = entry.issues?.length ?? 0;
  return count ? { kind: 'warning', label: `${count} reference ${count === 1 ? 'issue' : 'issues'}` }
    : { kind: 'checked', label: 'References found at last check' };
}
