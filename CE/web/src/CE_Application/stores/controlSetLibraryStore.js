// The user's library of control sets: the store and its localStorage persistence, and nothing else.
//
// Everything that acts on the library lives in stores/controlSetLibrary.js, which re-exports this
// store. It is split out for one reader: createPanel (stores/panelModel.js) has to look the default
// set up in the library, and controlSetLibrary.js imports panels.js, which imports panelModel.js.
// Reading the store from here keeps that a straight line instead of a cycle.

import { writable } from 'svelte/store';
import { normalizeControlSetList } from '../models/controlSets.js';

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
