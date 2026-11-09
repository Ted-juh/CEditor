import { writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

/**
 * The device profile picker: one window, opened from Settings › MIDI, the Device tool, the tab
 * bar's Open Device Profile and File › New Panel from Device Profile. Each caller says what choosing
 * a profile does there (`onPick`) and what the button says (`actionLabel`); the picker itself is
 * mounted once, in App.svelte.
 */
export const profilePickerRequest = writable(null);

export function openProfilePicker({
  title = 'Device profile',
  subtitle = '',
  selectedId = '',
  panelProfileIds = [],
  actionLabel = 'Use this profile',
  onPick = () => {},
} = {}) {
  profilePickerRequest.set({
    title,
    subtitle,
    selectedId,
    panelProfileIds: (panelProfileIds ?? []).filter(Boolean),
    actionLabel,
    onPick,
  });
}

export function closeProfilePicker() {
  profilePickerRequest.set(null);
}

/** Profiles chosen in the picker, most recent first, so the next choice starts with them. */
const STORAGE_KEY = 'ce.recentDeviceProfiles';
const MAX_RECENTS = 5;

function readInitial() {
  const stored = readStoredJson(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string').slice(0, MAX_RECENTS) : [];
}

export const recentDeviceProfiles = writable(readInitial());

export function recordProfileUse(id) {
  if (!id || typeof id !== 'string') return;
  recentDeviceProfiles.update((list) => {
    const next = [id, ...list.filter((entry) => entry !== id)].slice(0, MAX_RECENTS);
    writeStoredJson(STORAGE_KEY, next);
    return next;
  });
}
