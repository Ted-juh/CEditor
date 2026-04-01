/**
 * Bridge between Svelte and C++ JUCE backend via window.__JUCE__
 *
 * C++ registers event listeners for: setProperty, requestFullState, undo, redo
 * C++ emits events: fullState, propUpdate
 */

/** Check if we're running inside a JUCE WebView with native integration */
export function isJuceAvailable() {
  return typeof window !== 'undefined' &&
         window.__JUCE__ &&
         window.__JUCE__.backend;
}

/** Send a property change to C++ */
export function setProperty(path, value) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — setProperty ignored:', path, value);
    return;
  }
  window.__JUCE__.backend.emitEvent('setProperty', { path, value });
}

/** Request the full ValueTree state from C++ */
export function requestFullState() {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — requestFullState ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('requestFullState', {});
}

/** Trigger undo on the C++ UndoManager */
export function undo() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('undo', {});
}

/** Trigger redo on the C++ UndoManager */
export function redo() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('redo', {});
}

/**
 * Listen for a full state push from C++.
 * Returns a removal function.
 */
export function onFullState(callback) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — onFullState listener not registered');
    return () => {};
  }
  const token = window.__JUCE__.backend.addEventListener('fullState', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/**
 * Listen for individual property updates from C++.
 * Callback receives { path: string, value: any }
 * Returns a removal function.
 */
export function onPropUpdate(callback) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — onPropUpdate listener not registered');
    return () => {};
  }
  const token = window.__JUCE__.backend.addEventListener('propUpdate', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}
