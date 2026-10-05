export function soundcheckDb(value, measured) {
  if (!measured || !Number.isFinite(value) || value < 0) return '—';
  return value === 0 ? '−∞' : (20 * Math.log10(value)).toFixed(1);
}

/** Loads slower than this are worth preloading: the keyboard's SOUNDCHECK page marks them too. */
export const SLOW_LOAD_SECONDS = 5;

/** How long a song took to load when last recalled, as the row shows it. */
export function soundcheckLoad(entry) {
  if (entry?.loadTimedOut) return { text: 'gave up', slow: true };
  if (!(entry?.loadSeconds >= 0)) return { text: '—', slow: false };
  return { text: `${entry.loadSeconds.toFixed(1)}s`, slow: entry.loadSeconds >= SLOW_LOAD_SECONDS && !entry.loadPreloaded };
}

export function soundcheckReferenceStatus(entry) {
  if (!entry?.checkedAt) return { kind: 'unchecked', label: 'References not checked' };
  const count = entry.issues?.length ?? 0;
  return count ? { kind: 'warning', label: `${count} reference ${count === 1 ? 'issue' : 'issues'}` }
    : { kind: 'checked', label: 'References found at last check' };
}
