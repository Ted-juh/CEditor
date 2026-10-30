/**
 * Ctrl+wheel zooms what is under the cursor when that zooms itself — the canvas, the Viewer, the
 * Component Designer's surface — and nothing anywhere else.
 *
 * Left to the browser engine, a Ctrl+wheel that none of those took zoomed the whole page: menus,
 * dock, properties and the canvas with them, by accident (Ctrl still held from a canvas zoom, the
 * mouse drifting over the properties panel) and with nothing on screen to say it had happened. The
 * size of the interface is a setting now, Settings → General → Interface Size.
 *
 * A trackpad pinch arrives as a Ctrl+wheel too, so it is covered by the same test. The listener
 * is on the window and not passive, so it runs after every view's own handler and can still cancel
 * the engine's zoom; a view that zooms has done its zooming by then. On Windows the engine's own
 * zoom is also switched off natively (JUCE/VENDORED.md, patch 10); this is the same rule for every
 * other engine, and for a WebView2 that predates the setting.
 */
export function blockPageZoom(e) {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}

export function installPageZoomGuard(target = window) {
  target.addEventListener('wheel', blockPageZoom, { passive: false });
  return () => target.removeEventListener('wheel', blockPageZoom, { passive: false });
}

/** The interface sizes Settings offers, in percent. 100 is the engine's own size. */
export const INTERFACE_ZOOM_CHOICES = [80, 90, 100, 110, 125, 150, 175, 200];

export function normalizeInterfaceZoom(value) {
  const percent = Number(value);
  return INTERFACE_ZOOM_CHOICES.includes(percent) ? percent : 100;
}
