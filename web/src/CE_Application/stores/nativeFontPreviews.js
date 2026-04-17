import { writable, get } from 'svelte/store';
import { isJuceAvailable, renderFontPreview, onFontPreviewRendered } from '../bridge/bridge.js';

export const nativeFontPreviews = writable({});

let listenersInitialized = false;
let requestCounter = 0;
const pendingRequests = new Map();

function initListeners() {
  if (listenersInitialized || !isJuceAvailable()) return;
  listenersInitialized = true;

  onFontPreviewRendered((payload) => {
    const cacheKey = pendingRequests.get(payload?.requestId);
    if (!cacheKey) return;

    pendingRequests.delete(payload.requestId);
    nativeFontPreviews.update((current) => ({
      ...current,
      [cacheKey]: {
        data: String(payload?.data ?? ''),
        error: String(payload?.error ?? ''),
      },
    }));
  });
}

export function requestNativeFontPreview(cacheKey, payload) {
  if (!cacheKey || !payload?.fontData || !isJuceAvailable()) return;

  const current = get(nativeFontPreviews)[cacheKey];
  if (current?.data || current?.error) return;
  if ([...pendingRequests.values()].includes(cacheKey)) return;

  initListeners();

  const requestId = `font_preview_${++requestCounter}`;
  pendingRequests.set(requestId, cacheKey);
  renderFontPreview(requestId, payload);
}
