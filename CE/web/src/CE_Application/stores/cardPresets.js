import { derived, get, writable } from 'svelte/store';
import { activePanel, panels, updatePanel } from './panels.js';
import { deepClone } from '../utils/deepClone.js';

/**
 * Card presets — the saved patch bundles behind each properties card's preset footer.
 *
 * They used to live only in localStorage, which made them a property of the MACHINE rather than
 * of the design. Share a `.cepanel` and it arrives without the presets its layout was built from:
 * the recipient sees a preset picker with their own presets in it and none of the author's, and
 * the "reapply the card style" step the author documented cannot be followed at all.
 *
 * So a preset now lives in two places, deliberately:
 *
 *   - the user's global LIBRARY (localStorage), which is what makes a preset reusable across
 *     every panel they open — that behaviour is unchanged;
 *   - the panel DOCUMENT (`panel.cardPresets`, written by panelModel), so it travels with the file.
 *
 * `cardPresets` — the store every consumer already reads — is the merge of the two, and the merge
 * is by preset id with the DOCUMENT winning. That direction matters: if a shared panel carries a
 * preset whose id collides with one of the reader's, the panel's own design is what the panel's
 * own presets have to describe. The library copy is left alone; nothing here writes another
 * person's presets into the reader's localStorage behind their back.
 */

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

/** The user's own library. Persisted; survives every document. */
export const cardPresetLibrary = writable(readStoredPresets());

cardPresetLibrary.subscribe((value) => {
  writeStoredPresets(value);
});

/** The presets the open document carries. Read-through from the panel store — never persisted here. */
export const documentCardPresets = derived(
  activePanel,
  ($panel) => (Array.isArray($panel?.cardPresets) ? $panel.cardPresets : [])
);

/**
 * Merge two preset lists by id, `preferred` winning a collision, and stamp each entry with where
 * it came from so a consumer that cares can tell (nothing does yet; the field is there because a
 * merged list with no provenance is a list you cannot debug).
 */
export function mergePresetLists(preferred, fallback) {
  const out = [];
  const seen = new Set();

  for (const preset of preferred ?? []) {
    if (!preset?.id || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push({ ...preset, origin: 'document' });
  }
  for (const preset of fallback ?? []) {
    if (!preset?.id || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push({ ...preset, origin: 'library' });
  }
  return out;
}

/**
 * What every card's preset footer reads. Same shape as before — an array of presets — so no
 * consumer had to change; it is just no longer only the library.
 */
export const cardPresets = derived(
  [documentCardPresets, cardPresetLibrary],
  ([$document, $library]) => mergePresetLists($document, $library)
);

function createPresetId() {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The open panel's preset list, with `mutate` applied. No panel open = nothing to write to. */
function updateActivePanelPresets(mutate) {
  const panel = get(activePanel);
  if (!panel) return;
  const current = Array.isArray(panel.cardPresets) ? panel.cardPresets : [];
  const next = mutate(current);
  if (next === current) return;
  updatePanel(panel.id, { cardPresets: next });
}

/** Strip the merge's provenance stamp before anything is stored — it is a view, not data. */
function toStored(preset) {
  const { origin, ...rest } = preset ?? {};
  return deepClone(rest);
}

/**
 * Save a preset. It goes into the library (so it is reusable everywhere) AND into the open panel
 * (so it travels with the file). Those are not alternatives: the preset was built from this
 * panel's design, and it is the design that a reader of the shared file needs it for.
 */
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

  cardPresetLibrary.update((list) => [preset, ...list]);
  updateActivePanelPresets((list) => [toStored(preset), ...list]);
  return preset;
}

/**
 * Edit a preset wherever it lives. A preset that came in with a shared panel is edited in that
 * panel and NOT copied into the library; a library preset that the panel also carries is edited
 * in both, because they are the same preset and letting them drift is how you get a panel whose
 * presets silently stop matching their names.
 */
export function updateCardPreset(id, updates) {
  let updatedPreset = null;
  const stamp = new Date().toISOString();

  const apply = (preset) => {
    if (preset.id !== id) return preset;
    updatedPreset = { ...preset, ...updates, updatedAt: stamp };
    return updatedPreset;
  };

  cardPresetLibrary.update((list) => list.map(apply));
  updateActivePanelPresets((list) => {
    if (!list.some((preset) => preset.id === id)) return list;
    return list.map(apply).map(toStored);
  });

  return updatedPreset;
}

/** Remove a preset from both the library and the open document. */
export function removeCardPreset(id) {
  cardPresetLibrary.update((list) => list.filter((preset) => preset.id !== id));
  updateActivePanelPresets((list) => {
    if (!list.some((preset) => preset.id === id)) return list;
    return list.filter((preset) => preset.id !== id);
  });
}

export function getCardPresetById(id) {
  return get(cardPresets).find((preset) => preset.id === id) ?? null;
}

/**
 * Adopt a document's presets into the user's own library — the "keep these" step for a panel
 * somebody sent you. Not automatic: opening a file must not quietly grow your library, and the
 * merge above already makes the panel's presets usable without it.
 *
 * @param {number} panelId
 * @returns {object[]} the presets that were newly added
 */
export function adoptDocumentCardPresets(panelId) {
  const panel = get(panels).find((p) => p.id === panelId) ?? get(activePanel);
  const carried = Array.isArray(panel?.cardPresets) ? panel.cardPresets : [];
  if (carried.length === 0) return [];

  const known = new Set(get(cardPresetLibrary).map((preset) => preset.id));
  const added = carried.filter((preset) => preset?.id && !known.has(preset.id)).map(toStored);
  if (added.length === 0) return [];

  cardPresetLibrary.update((list) => [...added, ...list]);
  return added;
}
