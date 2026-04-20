import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'ce.cardPresets.v1';

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

function readStoredPresets() {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredPresets(value) {
  if (!canUseLocalStorage()) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore persistence failures so the UI still works in-memory.
  }
}

export const cardPresets = writable(readStoredPresets());

cardPresets.subscribe((value) => {
  writeStoredPresets(value);
});

function createPresetId() {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addCardPreset({ domain, name, description = '', scopeIds = [], patches = {} }) {
  const now = new Date().toISOString();
  const preset = {
    id: createPresetId(),
    version: 1,
    domain,
    name,
    description,
    scopeIds,
    patches,
    createdAt: now,
    updatedAt: now,
  };

  cardPresets.update((list) => [preset, ...list]);
  return preset;
}

export function updateCardPreset(id, updates) {
  let updatedPreset = null;

  cardPresets.update((list) =>
    list.map((preset) => {
      if (preset.id !== id) return preset;
      updatedPreset = {
        ...preset,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return updatedPreset;
    })
  );

  return updatedPreset;
}

export function removeCardPreset(id) {
  cardPresets.update((list) => list.filter((preset) => preset.id !== id));
}

export function getCardPresetById(id) {
  return get(cardPresets).find((preset) => preset.id === id) ?? null;
}
