import { isJuceAvailable } from './bridge.js';

/**
 * documentationWindow.js — the manual in a window of its own.
 *
 * The documentation tab can move out of the editor into a separate native window: one the
 * operating system moves, resizes, maximises and puts on another screen, which no overlay inside
 * the editor's page can be. The native half is WebViewHost's DocumentationWindow (CE/src): a
 * second WebView on the same origin, showing help.html and nothing else — no bridge to the
 * editor's documents, because a page that only reads has no use for one.
 *
 * Events, editor page → native:
 *   openDocumentationWindow  { doc, anchor }  open it (or bring it forward) on that document
 * Events, help page → native:
 *   dockDocumentation        { doc, anchor }  close the window, put the manual back in a tab
 * Events, native → editor page:
 *   documentationDocked      { doc, anchor }  the help page asked to go back to a tab
 * Events, native → help page:
 *   documentationRequest     { doc, anchor }  the open window was asked for a document
 *
 * An empty `doc` on openDocumentationWindow means "bring it forward as it is" when the window is
 * open, and "start on the last document shown" when it is not.
 */

/** There is a native side to open a window. In a plain browser there is not, and the action hides. */
export function canOpenDocumentationWindow() {
  return !!isJuceAvailable();
}

export function openDocumentationWindow({ doc = '', anchor = '' } = {}) {
  if (!isJuceAvailable()) return false;
  window.__JUCE__.backend.emitEvent('openDocumentationWindow', { doc: String(doc ?? ''), anchor: String(anchor ?? '') });
  return true;
}

/** From the help page: back into the editor, on the document it shows. */
export function dockDocumentationWindow({ doc = '', anchor = '' } = {}) {
  if (!isJuceAvailable()) return false;
  window.__JUCE__.backend.emitEvent('dockDocumentation', { doc: String(doc ?? ''), anchor: String(anchor ?? '') });
  return true;
}

/** Listen for the help page asking to go back into a tab. Returns the unsubscribe. */
export function onDocumentationDocked(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('documentationDocked', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** On the help page: the open window was asked for a document. Returns the unsubscribe. */
export function onDocumentationRequest(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('documentationRequest', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}
