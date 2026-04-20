import { writable, get } from 'svelte/store';
import { requestFileData, onFileData, isJuceAvailable } from '../bridge/bridge.js';
import { createPerfDebugTimer, logPerfDebug } from '../utils/perfDebug.js';

/**
 * Cache of file path → data URL mappings.
 * Used to display local images in the WebView.
 */
export const fileCache = writable({});

let requestCounter = 0;
const pendingRequests = new Map();
let listenerRegistered = false;

function fileLabel(filePath) {
  const parts = String(filePath ?? '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || String(filePath ?? '') || 'file';
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function estimateDataUrlBytes(dataUrl) {
  const value = String(dataUrl ?? '');
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return value.length;

  const base64 = value.slice(commaIndex + 1);
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function ensureListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  onFileData((result) => {
    const { requestId, data } = result;
    const pending = pendingRequests.get(requestId);
    if (pending?.filePath) {
      pendingRequests.delete(requestId);
      fileCache.update(cache => ({ ...cache, [pending.filePath]: data }));
      const byteSize = Number(result?.byteSize) || estimateDataUrlBytes(data);
      pending.stopTimer?.(
        `bytes=${formatBytes(byteSize)} read=${Number(result?.readMs || 0).toFixed(1)}ms encode=${Number(result?.encodeMs || 0).toFixed(1)}ms`
      );
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
  for (const pending of pendingRequests.values()) {
    if (pending?.filePath === filePath) return;
  }

  const reqId = `file_${++requestCounter}`;
  logPerfDebug(`file cache request ${fileLabel(filePath)}`, filePath);
  pendingRequests.set(reqId, {
    filePath,
    stopTimer: createPerfDebugTimer(`file cache load ${fileLabel(filePath)}`),
  });
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
