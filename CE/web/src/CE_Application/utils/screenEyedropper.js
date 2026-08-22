/**
 * Screen eyedropper — the browser's `EyeDropper`, wrapped.
 *
 * The editor already had "an eyedropper": the Viewer tab could sample a pixel
 * out of an image it had loaded, into the first empty swatch. That is not what
 * anyone means by the word. This one samples any pixel on the screen — the
 * canvas, a reference image in another window, the OS behind the app.
 *
 * The editor ships in WebView2 (Chromium), where `EyeDropper` is present, so
 * this is the live path rather than a progressive-enhancement gesture. It is
 * still feature-detected: the same Svelte components render in a plain browser
 * during development and in the SSR test harness, where the constructor and
 * even `window` may be missing. Callers get a reason string to show rather
 * than a thrown error, and a cancelled pick (Esc) is not an error at all.
 */

/** Is a real screen eyedropper available in this host? */
export function eyedropperAvailable(host = globalThis) {
  return typeof host?.EyeDropper === 'function';
}

/**
 * Open the picker and resolve with the chosen colour.
 *
 * @returns {Promise<{ok: true, color: string} | {ok: false, cancelled?: boolean, reason?: string}>}
 *          `color` is uppercase RRGGBB. A cancelled pick resolves
 *          `{ ok: false, cancelled: true }` with no reason — nothing went
 *          wrong and nothing should be reported.
 */
export async function pickScreenColour(host = globalThis) {
  if (!eyedropperAvailable(host)) {
    return { ok: false, reason: 'No screen eyedropper in this browser.' };
  }

  try {
    const result = await new host.EyeDropper().open();
    const hex = String(result?.sRGBHex ?? '').replace(/^#/, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(hex)) {
      return { ok: false, reason: 'The eyedropper returned no colour.' };
    }
    return { ok: true, color: hex };
  } catch (error) {
    // Esc / click-away rejects with AbortError. Treating that as a failure
    // would flash an error message every time someone changes their mind.
    if (error?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, reason: error?.message || 'The eyedropper failed.' };
  }
}
