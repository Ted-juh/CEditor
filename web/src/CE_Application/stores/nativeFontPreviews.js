import { writable, get } from 'svelte/store';
import { isJuceAvailable, renderFontPreview, onFontPreviewRendered } from '../bridge/bridge.js';
import { createPerfDebugTimer, logPerfDebug } from '../utils/perfDebug.js';

export const nativeFontPreviews = writable({});

let listenersInitialized = false;
let requestCounter = 0;
const pendingRequests = new Map();

function initListeners() {
  if (listenersInitialized || !isJuceAvailable()) return;
  listenersInitialized = true;

  onFontPreviewRendered((payload) => {
    const pending = pendingRequests.get(payload?.requestId);
    const cacheKey = pending?.cacheKey;
    if (!cacheKey) return;

    pendingRequests.delete(payload.requestId);
    nativeFontPreviews.update((current) => ({
      ...current,
      [cacheKey]: {
        data: String(payload?.data ?? ''),
        error: String(payload?.error ?? ''),
      },
    }));
    pending?.stopTimer?.(payload?.error ? `error=${payload.error}` : '');
  });
}

export function requestNativeFontPreview(cacheKey, payload) {
  if (!cacheKey || !payload?.fontData || !isJuceAvailable()) return;

  const current = get(nativeFontPreviews)[cacheKey];
  if (current?.data || current?.error) return;
  if ([...pendingRequests.values()].includes(cacheKey)) return;

  initListeners();

  const requestId = `font_preview_${++requestCounter}`;
  logPerfDebug(`native font preview request ${requestId}`, cacheKey);
  pendingRequests.set(requestId, {
    cacheKey,
    stopTimer: createPerfDebugTimer(`native font preview ${requestId}`),
  });
  renderFontPreview(requestId, payload);
}
