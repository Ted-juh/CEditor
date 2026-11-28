/**
 * scenePresetLibrary.js — where scene presets live (utils/scenePreset.js): whole scenes kept to put
 * on another panel, beside the built-in ones. The places are an animation preset's
 * (stores/animationPresetLibrary.js):
 *
 *   - Built-in: the code presets in utils/scenePreset.js.
 *   - Mine: your library, in this machine's storage. Survives every panel.
 *   - This panel: `panel.scenePresets`, carried in the document, so a panel you send someone brings
 *     the presets it was made with, and they can keep them. A panel needs no copy of a preset to play
 *     what it made: that is an ordinary scene, which the panel carries anyway. Carrying one is a
 *     choice, made with "Carry on this panel" or by importing a file there.
 *
 * And a preset is a file of its own, `.cescene` (utils/scenePresetFormat.js), exported and imported
 * through the typed-document route a `.ceanim` takes.
 *
 * A panel write is one undo step; a library write is not in the document's history.
 */
import { derived, get, writable } from 'svelte/store';
import { activePanel, panels, updatePanel } from './panels.js';
import { beginHistoryTransaction, commitHistoryTransaction } from './history.js';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import { buildScenePreset, cleanScenePreset, readScenePresetFile, BUILT_IN_SCENE_PRESETS } from '../utils/scenePreset.js';

const STORAGE_KEY = 'ce.scenePresets.v1';
const cleanList = (list) => (Array.isArray(list) ? list.map(cleanScenePreset).filter(Boolean) : []);

/** Mine: the scene presets you kept. Persisted. */
export const scenePresetLibrary = writable(cleanList(readStoredJson(STORAGE_KEY, [])));
scenePresetLibrary.subscribe((list) => { writeStoredJson(STORAGE_KEY, list); });

/** The scene presets a panel carries, read through from the document and checked. */
export const scenePresetsOf = (panel) => cleanList(panel?.scenePresets);

/** This panel: the scene presets the open panel carries. */
export const panelScenePresets = derived(activePanel, ($panel) => scenePresetsOf($panel));

/** A panel by id, or the open one: the Animation Designer works on its own panel, by id. */
const panelFor = (panelId) => (panelId ? get(panels).find((panel) => panel?.id === panelId) : get(activePanel)) ?? null;

/**
 * Every preset the library shows, in its place: the built-in ones, then yours, then those only the
 * panel has. A panel's copy of one of yours is shown as yours: it is the same preset.
 * `[{ preset, where: 'builtin' | 'mine' | 'panel', carried }]`, `carried` when the panel has a copy.
 */
export function scenePresetEntries(mine = [], panel = []) {
  const carried = new Set((panel ?? []).map((preset) => preset.id));
  const ownIds = new Set((mine ?? []).map((preset) => preset.id));
  return [
    ...BUILT_IN_SCENE_PRESETS.map((preset) => ({ preset, where: 'builtin', carried: carried.has(preset.id) })),
    ...(mine ?? []).map((preset) => ({ preset, where: 'mine', carried: carried.has(preset.id) })),
    ...(panel ?? []).filter((preset) => !ownIds.has(preset.id)).map((preset) => ({ preset, where: 'panel', carried: true })),
  ];
}

/** The built-in ones, then yours: what every panel offers. */
export function allScenePresets(mine) {
  return [...BUILT_IN_SCENE_PRESETS, ...(Array.isArray(mine) ? mine : [])];
}

function step(label, fn) {
  const transaction = beginHistoryTransaction({ label });
  try { return fn(); } finally { commitHistoryTransaction(transaction); }
}

/** Put a preset in a panel, replacing its copy of the same id. One undo step. */
function carryInPanel(preset, label, panelId) {
  const panel = panelFor(panelId);
  if (!panel) return false;
  step(label, () => {
    const current = Array.isArray(panel.scenePresets) ? panel.scenePresets : [];
    updatePanel(panel.id, { scenePresets: [...current.filter((entry) => entry?.id !== preset.id), preset] });
  });
  return true;
}

/** Put a preset in your library, replacing your copy of the same id, and one of the same name. */
function keepInLibrary(preset) {
  scenePresetLibrary.update((list) => [...list.filter((entry) => entry.id !== preset.id && entry.name !== preset.name), preset]);
}

/** Keep a scene as a preset of your own: `{ preset }`, or `{ reason }`. A name you used before is replaced. */
export function saveScenePreset(scene, controls, { name = '' } = {}) {
  const preset = buildScenePreset(scene, controls, { name: String(name ?? '').trim() || scene?.name });
  if (!preset) return { reason: 'A scene with no clips has nothing to keep.' };
  keepInLibrary(preset);
  return { preset };
}

/** Take one of yours out of the library. Scenes already made from it stay as they are, and so does a panel's copy. */
export function removeScenePreset(id) {
  scenePresetLibrary.update((list) => list.filter((entry) => entry.id !== id));
}

/** Carry a preset on a panel (the open one unless named), so it goes wherever the panel goes. `{ carried }` or `{ reason }`. */
export function carryScenePreset(preset, panelId = '') {
  const clean = cleanScenePreset(preset);
  if (!clean) return { reason: 'That preset could not be read.' };
  return carryInPanel(clean, `Carry scene preset ${clean.name}`, panelId) ? { carried: true } : { reason: 'No panel is open.' };
}

/** Stop carrying a preset on a panel. Scenes made from it stay. One undo step. */
export function removeScenePresetFromPanel(id, panelId = '') {
  const panel = panelFor(panelId);
  if (!panel) return { reason: 'No panel is open.' };
  step('Remove scene preset from panel', () => {
    updatePanel(panel.id, { scenePresets: (panel.scenePresets ?? []).filter((preset) => preset?.id !== id) });
  });
  return { removed: true };
}

/** Keep a preset a panel carries in your library: the "keep this" for a panel you were sent. */
export function keepPanelScenePreset(id, panelId = '') {
  const preset = scenePresetsOf(panelFor(panelId)).find((entry) => entry.id === id);
  if (!preset) return { reason: 'This panel does not carry that preset.' };
  keepInLibrary(preset);
  return { preset };
}

/**
 * Bring in a .cescene file's text: into your library, or only this panel. `{ preset, replaced }` or
 * `{ error }`. One of the same id is replaced, as is one of yours of the same name.
 */
export function importScenePresetText(text, { where = 'mine', panelId = '' } = {}) {
  const { preset, error } = readScenePresetFile(text);
  if (!preset) return { error };
  const list = where === 'panel' ? scenePresetsOf(panelFor(panelId)) : get(scenePresetLibrary);
  const replaced = list.some((entry) => entry.id === preset.id || (where !== 'panel' && entry.name === preset.name));
  if (where === 'panel') {
    if (!carryInPanel(preset, `Import scene preset ${preset.name}`, panelId)) return { error: 'No panel is open.' };
  } else keepInLibrary(preset);
  return { preset, replaced };
}

export function resetScenePresetLibraryForTesting(list = []) {
  scenePresetLibrary.set(cleanList(list));
}
