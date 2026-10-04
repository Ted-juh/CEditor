// fontFileData.js — a font file the settings keep by path, as a data URL, read through the same file
// cache the images use. Its own module so packaging (panelSharing.js) and the outline wiring
// (fontOutlineSources.js) can both use it without importing each other's stores.

import { get } from 'svelte/store';

import { isJuceAvailable } from '../bridge/bridge.js';
import { fileCache, loadFile } from './fileCache.js';

const READ_TIMEOUT_MS = 4000;

/** A font file by path, as a data URL, or null. */
export function readFontData(filePath) {
  const usable = (value) => (typeof value === 'string' && value.startsWith('data:') ? value : null);
  const cached = usable(get(fileCache)[filePath]);
  if (cached) return Promise.resolve(cached);
  if (!filePath || !isJuceAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value ?? null);
    };
    const timer = setTimeout(() => finish(null), READ_TIMEOUT_MS);
    const unsubscribe = fileCache.subscribe((cache) => {
      const value = usable(cache[filePath]);
      if (value) finish(value);
    });
    loadFile(filePath);
  });
}
