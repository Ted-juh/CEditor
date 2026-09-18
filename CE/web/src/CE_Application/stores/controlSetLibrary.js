// The user's library of control sets, and the sets a document carries.
//
// The storage model is the card presets' (stores/cardPresets.js), for the same reason: a set
// that lives only in localStorage is a property of the MACHINE, and a shared .cepanel would
// arrive without the set it was designed in. So a set lives in two places —
//
//   - the user's LIBRARY (localStorage), which makes it available to every panel they open;
//   - the panel DOCUMENT (`panel.controlSets`), so it travels with the file.
//
// A set gets into the document the moment a panel is pointed at it (stores/controlSets.js), and
// stays there even if the panel later switches back — a file that carried a set keeps carrying
// it, so the design can be put back. Lookup order is document, then library, then built-ins
// (models/controlSets.js `getControlSet`), so a reader sees the author's set, not their own copy.
//
// Import and export are plain JSON files (models/controlSetPackage.js): a browser `<input
// type="file">` in, a download out, exactly the way custom-component packages move.

import { derived, get, writable } from 'svelte/store';
import { activePanel, panels, updatePanel } from './panels.js';
import { BUILT_IN_CONTROL_SETS, normalizeControlSetDefinition, normalizeControlSetList } from '../models/controlSets.js';
import { createControlSetEnvelope, normalizeControlSetEnvelope } from '../models/controlSetPackage.js';
import { deepClone } from '../utils/deepClone.js';

const STORAGE_KEY = 'ce.controlSetLibrary.v1';

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

function readStoredSets() {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeControlSetList(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function writeStoredSets(value) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; the in-memory library still works.
  }
}

/** The user's own sets. Persisted; survives every document. */
export const controlSetLibrary = writable(readStoredSets());
controlSetLibrary.subscribe(writeStoredSets);

/** The sets the open document carries. Read-through from the panel store — never persisted here. */
export const documentControlSets = derived(activePanel, ($panel) => normalizeControlSetList($panel?.controlSets));

/**
 * Every set a picker can offer, each stamped with where it comes from: `document`, `library` or
 * `built-in`, in that order of precedence, each id once. The document's copy of a set wins over
 * the library's, which wins over the program's — see getControlSet for why.
 */
export function mergeControlSetLists(document, library, builtIn = BUILT_IN_CONTROL_SETS) {
  const out = [];
  const seen = new Set();
  for (const [origin, list] of [['document', document], ['library', library], ['built-in', builtIn]]) {
    for (const set of Array.isArray(list) ? list : []) {
      if (!set?.id || seen.has(set.id)) continue;
      seen.add(set.id);
      out.push({ ...set, origin });
    }
  }
  return out;
}

export const availableControlSets = derived(
  [documentControlSets, controlSetLibrary],
  ([$document, $library]) => mergeControlSetLists($document, $library),
);

function stripOrigin(set) {
  const { origin, ...rest } = set ?? {};
  return deepClone(rest);
}

/** The open panel's set list, with `mutate` applied. No panel open = nothing to write to. */
function updateActivePanelSets(mutate) {
  const panel = get(activePanel);
  if (!panel) return;
  const current = normalizeControlSetList(panel.controlSets);
  const next = mutate(current);
  if (next === current) return;
  updatePanel(panel.id, { controlSets: next });
}

/** Put a set in the library, replacing one with the same id. Returns the stored set or null. */
export function addControlSetToLibrary(value) {
  const set = normalizeControlSetDefinition(value);
  if (!set) return null;
  controlSetLibrary.update((list) => [set, ...list.filter((entry) => entry.id !== set.id)]);
  return set;
}

export function removeControlSetFromLibrary(id) {
  controlSetLibrary.update((list) => list.filter((entry) => entry.id !== id));
}

/**
 * Carry a set in the open document (replacing the document's copy of the same id). This is what
 * choosing a library set does; it is also how an imported set reaches the file straight away.
 */
export function carryControlSetInDocument(value) {
  const set = normalizeControlSetDefinition(value);
  if (!set) return null;
  updateActivePanelSets((list) => [stripOrigin(set), ...list.filter((entry) => entry.id !== set.id)]);
  return set;
}

/**
 * Import a set file's text. On success the set is in the library AND in the open document, and
 * the result says which; on failure `error` says why in words a person can act on.
 */
export function importControlSetText(text) {
  const envelope = normalizeControlSetEnvelope(text);
  if (!envelope) {
    return { ok: false, error: 'Not a control-set file this build can read (expected format "ceditor-controlset", version 1).' };
  }
  const set = addControlSetToLibrary(envelope.set);
  carryControlSetInDocument(set);
  return { ok: true, set, envelope, replacedBuiltIn: BUILT_IN_CONTROL_SETS.some((entry) => entry.id === set.id) };
}

/** The file form of a set the picker knows, or null. */
export function exportControlSetEnvelope(id) {
  const set = get(availableControlSets).find((entry) => entry.id === id);
  return set ? createControlSetEnvelope(stripOrigin(set)) : null;
}

/**
 * Adopt a document's sets into the library — the "keep these" step for a file somebody sent.
 * Not automatic: opening a file must not quietly grow the library. Returns what was added.
 */
export function adoptDocumentControlSets(panelId) {
  const panel = get(panels).find((p) => p.id === panelId) ?? get(activePanel);
  const carried = normalizeControlSetList(panel?.controlSets);
  if (!carried.length) return [];
  const known = new Set(get(controlSetLibrary).map((set) => set.id));
  const added = carried.filter((set) => !known.has(set.id)).map(stripOrigin);
  if (!added.length) return [];
  controlSetLibrary.update((list) => [...added, ...list]);
  return added;
}
