/**
 * scenePresetLibrary.js — your scene presets (utils/scenePreset.js): whole scenes kept to put on
 * another panel, beside the built-in ones. Mine, in this machine's storage, as your animation presets
 * are (stores/animationPresetLibrary.js). A panel needs no copy of one to play it: what a preset puts
 * on a panel is an ordinary scene, which the panel carries.
 */
import { writable } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import { buildScenePreset, cleanScenePreset, BUILT_IN_SCENE_PRESETS } from '../utils/scenePreset.js';

const STORAGE_KEY = 'ce.scenePresets.v1';
const cleanList = (list) => (Array.isArray(list) ? list.map(cleanScenePreset).filter(Boolean) : []);

/** Mine: the scene presets you kept. Persisted. */
export const scenePresetLibrary = writable(cleanList(readStoredJson(STORAGE_KEY, [])));
scenePresetLibrary.subscribe((list) => { writeStoredJson(STORAGE_KEY, list); });

/** The built-in ones, then yours. */
export function allScenePresets(mine) {
  return [...BUILT_IN_SCENE_PRESETS, ...(Array.isArray(mine) ? mine : [])];
}

/** Keep a scene as a preset of your own: `{ preset }`, or `{ reason }`. A name you used before is replaced. */
export function saveScenePreset(scene, controls, { name = '' } = {}) {
  const preset = buildScenePreset(scene, controls, { name: String(name ?? '').trim() || scene?.name });
  if (!preset) return { reason: 'A scene with no clips has nothing to keep.' };
  scenePresetLibrary.update((list) => [...list.filter((entry) => entry.name !== preset.name), preset]);
  return { preset };
}

/** Take one of yours out of the library. Scenes already made from it stay as they are. */
export function removeScenePreset(id) {
  scenePresetLibrary.update((list) => list.filter((entry) => entry.id !== id));
}

export function resetScenePresetLibraryForTesting(list = []) {
  scenePresetLibrary.set(cleanList(list));
}
