import { get, writable } from 'svelte/store';
import { readLastDocument, readPlace, rememberDocument, rememberPlace } from '../utils/documentationStorage.js';
import { closeDocumentationTab, documentationTabOpen, openDocumentationTab } from './panels.js';
import {
  canOpenDocumentationWindow,
  onDocumentationDocked,
  openDocumentationWindow,
} from '../bridge/documentationWindow.js';

/**
 * documentation.js — where the manual is, and what it is showing.
 *
 * It used to be a modal overlay: a fixed box over the editor that could not be moved or resized,
 * and hid the thing the reader was reading about. Now it has two places, and remembers which one
 * the reader chose:
 *
 *   'tab'     an editor tab, beside the panels and Settings (panels.js owns the tab itself);
 *   'window'  a separate native window (bridge/documentationWindow.js), for a second screen.
 *
 * What it shows survives either: the document is kept in storage both pages share
 * (utils/documentationStorage.js), and the place in it by the viewer, so closing the tab,
 * switching away, or moving between the tab and the window does not send the reader back to the
 * top of the first document.
 */

/** 'tab' or 'window' — the last place the reader put the manual. */
export const documentationPlace = writable(readPlace());
documentationPlace.subscribe(rememberPlace);

/**
 * A request to show a document: `{ doc, anchor, n }`. `n` counts requests, so asking for the same
 * section twice scrolls to it twice. The viewer follows it and reports back with `noteDocumentShown`.
 */
export const documentationRequest = writable({ doc: readLastDocument(), anchor: '', n: 0 });

/** The document the viewer is on now, for the next open, in either place. */
export function noteDocumentShown(doc) {
  const id = String(doc ?? '');
  if (!id) return;
  rememberDocument(id);
  // The request's document follows, without counting as a request: the viewer moves only when
  // `n` changes, and this is the viewer telling us where it already is.
  documentationRequest.update((current) => (current.doc === id ? current : { ...current, doc: id }));
}

function request({ doc = '', anchor = '' } = {}) {
  // With no document named, the last one shown — which may have been in the other place.
  documentationRequest.update((current) => ({
    doc: String(doc || readLastDocument() || current.doc || ''),
    anchor: String(anchor ?? ''),
    n: current.n + 1,
  }));
  return get(documentationRequest);
}

/**
 * Help → Documentation, and any "read about this" link: open the manual where the reader keeps it,
 * on `doc` at `anchor` when given, else where they left it.
 */
export function openDocumentation(target = {}) {
  if (get(documentationPlace) === 'window' && canOpenDocumentationWindow()) {
    // Only what was asked for: with nothing named, an open window is brought forward as it is,
    // and a new one starts on the last document shown.
    openDocumentationWindow({ doc: target.doc ?? '', anchor: target.anchor ?? '' });
    return 'window';
  }
  // An open tab asked for nothing in particular is only brought forward: a request would move the
  // reader, and they asked to see the manual, not to be sent somewhere in it.
  if (target.doc || target.anchor || !get(documentationTabOpen)) request(target);
  openDocumentationTab();
  return 'tab';
}

/** The tab's "Own window" action: the same document, at the same section, moves into a window. */
export function moveDocumentationToWindow({ doc = '', anchor = '' } = {}) {
  if (!canOpenDocumentationWindow()) return false;
  documentationPlace.set('window');
  rememberDocument(doc);
  openDocumentationWindow({ doc, anchor });
  closeDocumentationTab();
  return true;
}

/** The window's "Back to the editor" action, as the native side relays it. */
export function moveDocumentationToTab({ doc = '', anchor = '' } = {}) {
  documentationPlace.set('tab');
  request({ doc, anchor });
  openDocumentationTab();
}

/** Wire the native events once, from the editor page (App.svelte). Returns the unsubscribe. */
export function installDocumentationWindowEvents() {
  return onDocumentationDocked((payload) => {
    moveDocumentationToTab({ doc: payload?.doc ?? '', anchor: payload?.anchor ?? '' });
  });
}
