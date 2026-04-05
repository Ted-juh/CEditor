import { writable, get } from 'svelte/store';
import { requestFileData, onFileData, isJuceAvailable } from '../bridge/bridge.js';

/**
 * Cache of file path → data URL mappings.
 * Used to display local images in the WebView.
 */
export const fileCache = writable({});

let requestCounter = 0;
const pendingRequests = new Map();
let listenerRegistered = false;

function ensureListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  onFileData((result) => {
    const { requestId, data } = result;
    const filePath = pendingRequests.get(requestId);
    if (filePath) {
      pendingRequests.delete(requestId);
      fileCache.update(cache => ({ ...cache, [filePath]: data }));
    }
  });
}

/**
 * Request a file to be loaded into the cache as a data URL.
 * Returns immediately — the cache store updates asynchronously.
 */
export function loadFile(filePath) {
  if (!filePath) return;

  const cache = get(fileCache);
  if (cache[filePath]) return; // Already loaded

  if (!isJuceAvailable()) {
    // In browser dev mode, try using the path directly (won't work for local files)
    fileCache.update(c => ({ ...c, [filePath]: filePath }));
    return;
  }

  ensureListener();

  // Check if already pending
  for (const path of pendingRequests.values()) {
    if (path === filePath) return;
  }

  const reqId = `file_${++requestCounter}`;
  pendingRequests.set(reqId, filePath);
  requestFileData(reqId, filePath);
}

/**
 * Get the data URL for a file path, or null if not yet loaded.
 * Triggers loading if not cached.
 */
export function getFileUrl(filePath) {
  if (!filePath) return null;
  const cache = get(fileCache);
  if (cache[filePath]) return cache[filePath];
  loadFile(filePath);
  return null;
}
