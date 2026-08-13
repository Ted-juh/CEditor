import { writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

/**
 * Recently picked colours (6-char RRGGBB), most recent first, persisted.
 * The Colors tab records one entry per settled pick — the caller debounces
 * so a hue-band drag lands as one colour, not sixty.
 */
const STORAGE_KEY = 'ce.recentColours';
const MAX_RECENT = 10;

function readInitial() {
  const stored = readStoredJson(STORAGE_KEY, []);
  return Array.isArray(stored)
    ? stored.filter((c) => typeof c === 'string' && /^[0-9A-F]{6}$/i.test(c)).slice(0, MAX_RECENT)
    : [];
}

export const recentColours = writable(readInitial());

export function recordRecentColour(rgb) {
  const hex = String(rgb ?? '').replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return;
  recentColours.update((list) => {
    const next = [hex, ...list.filter((c) => c !== hex)].slice(0, MAX_RECENT);
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
}
