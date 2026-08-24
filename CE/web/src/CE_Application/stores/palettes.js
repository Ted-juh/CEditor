import { writable, get } from 'svelte/store';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import {
  normalizeLibrary, activePalette, setActivePalette, addPalette,
  renamePalette, deletePalette, setPaletteColors, sameColors,
} from '../utils/paletteLibrary.js';

/**
 * The named palette library, persisted.
 *
 * Seeded from `ce.displayPanel.swatches` the first time it runs so the 24
 * colours someone had already collected become their first named palette
 * instead of vanishing behind the new UI. DisplayPanel still owns the live
 * `swatches` array and still persists it under the old key — that array is the
 * ACTIVE palette's working copy, and SwatchGrid keeps the two in step.
 *
 * All the reasoning about what a library may look like lives in
 * `utils/paletteLibrary.js`; this file is the persisted singleton around it.
 */

const STORAGE_KEY = 'ce.palettes.v1';
const LEGACY_SWATCHES_KEY = 'ce.displayPanel.swatches';

function readInitial() {
  const stored = readStoredJson(STORAGE_KEY, null);
  if (stored) return normalizeLibrary(stored);
  return normalizeLibrary(readStoredJson(LEGACY_SWATCHES_KEY, null));
}

export const paletteLibrary = writable(readInitial());

function commit(next) {
  paletteLibrary.set(next);
  writeStoredJson(STORAGE_KEY, next);
  return next;
}

export function getActivePalette() {
  return activePalette(get(paletteLibrary));
}

export function selectPalette(id) {
  return commit(setActivePalette(get(paletteLibrary), id));
}

export function newPalette(name = 'Palette', colors = null) {
  return commit(addPalette(get(paletteLibrary), name, colors));
}

export function renameActivePalette(name) {
  const lib = get(paletteLibrary);
  return commit(renamePalette(lib, lib.activeId, name));
}

export function removePalette(id) {
  return commit(deletePalette(get(paletteLibrary), id));
}

/**
 * Store the working copy back into the active palette. A no-op write is
 * skipped: SwatchGrid calls this from an effect that also runs when the
 * palette it just loaded arrives back through the same array.
 */
export function saveActiveColors(colors) {
  const lib = get(paletteLibrary);
  const current = activePalette(lib);
  if (!current || sameColors(current.colors, colors)) return lib;
  return commit(setPaletteColors(lib, current.id, colors));
}
