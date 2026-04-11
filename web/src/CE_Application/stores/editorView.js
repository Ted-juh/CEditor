import { writable } from 'svelte/store';

/**
 * Create a writable store that persists to localStorage.
 */
function persisted(key, defaultValue) {
  let initial = defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) initial = JSON.parse(stored);
  } catch { /* ignore */ }

  const store = writable(initial);
  store.subscribe(v => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  });
  return store;
}

/** Show rulers along canvas edges */
export const showRulers = persisted('ce.showRulers', true);

/** Show guide lines on the canvas */
export const showGuides = persisted('ce.showGuides', true);

/** Show distance measurements during drag */
export const showDistances = persisted('ce.showDistances', true);
