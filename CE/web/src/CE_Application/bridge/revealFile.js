import { isJuceAvailable } from './bridge.js';

/**
 * revealFile.js — "show me where this actually is on disk".
 *
 * Review finding D8 asks the tab strip for a per-tab context menu including Reveal. There is no
 * such call in bridge.js because nothing has ever needed one, so this adds the JS half: it emits
 * `revealFile` with the tab's path.
 *
 * The native half is `ValueTreeBridgeHandlers.cpp`'s `revealFile` listener, which reveals the
 * file — or its containing folder, when the file has since moved — to the OS file manager. It
 * sends nothing back: opening a shell window is the whole answer, so there is nothing to await.
 *
 * `canRevealFiles()` still gates the menu row, because there is no OS file manager to reveal
 * anything to when the web build runs in a plain browser. Disabling it there beats shipping a
 * row that looks live and does nothing, which is exactly the dead-item problem D3 was about.
 */

/** True when there is a native side that could plausibly answer. */
export function canRevealFiles() {
  return isJuceAvailable();
}

export function revealFile(filePath) {
  const path = String(filePath ?? '').trim();
  if (!path || !isJuceAvailable()) return false;
  window.__JUCE__.backend.emitEvent('revealFile', { filePath: path });
  return true;
}
