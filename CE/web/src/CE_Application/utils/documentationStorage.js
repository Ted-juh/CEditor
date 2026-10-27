// documentationStorage.js — what the manual remembers between opens, in either of its places.
//
// Shared by the editor page (stores/documentation.js) and the manual's own window
// (layout/HelpWindow.svelte). Both pages are the same origin in the same WebView profile, so they
// read and write the same storage: the window can say which document it was on without a message
// through the native side, and the next open — tab or window — starts there.

import { readStoredJson, writeStoredJson } from './localStorageState.js';

export const DOCUMENTATION_STORAGE_KEYS = {
  place: 'ce.help.place',
  doc: 'ce.help.doc',
};

/** The id of the document last shown, in either place; '' when none. */
export function readLastDocument() {
  return String(readStoredJson(DOCUMENTATION_STORAGE_KEYS.doc, '') || '');
}

export function rememberDocument(id) {
  const value = String(id ?? '');
  if (value) writeStoredJson(DOCUMENTATION_STORAGE_KEYS.doc, value);
}

/** 'tab' or 'window'. */
export function readPlace() {
  return readStoredJson(DOCUMENTATION_STORAGE_KEYS.place, 'tab') === 'window' ? 'window' : 'tab';
}

export function rememberPlace(place) {
  writeStoredJson(DOCUMENTATION_STORAGE_KEYS.place, place === 'window' ? 'window' : 'tab');
}
