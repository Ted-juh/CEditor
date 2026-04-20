import { writable, get } from 'svelte/store';
import { deepClone } from '../utils/deepClone.js';

export const backgroundLayerClipboard = writable(null);

export function copyBackgroundLayer(payload) {
  backgroundLayerClipboard.set(payload ? deepClone(payload) : null);
}

export function getBackgroundLayerClipboard() {
  const value = get(backgroundLayerClipboard);
  return value ? deepClone(value) : null;
}
