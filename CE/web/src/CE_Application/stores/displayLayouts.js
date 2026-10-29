import { get } from 'svelte/store';
import { lcdDesignLayoutIds, setLcdDesignLayout } from './lcdDesignLayout.js';

// displayLayouts.js — which layout an LCD or a Pixel Display is showing, and a way to show another,
// for the script runtime.
//
// The preview decides which layout shows (PanelPreviewSurface: a soft key, an overlay, the
// Selector's value, the default, a page's timeout) and keeps it in its own state, transient and
// never in the panel. A script asks the same question: text() and clear() with no layout act on the
// layout showing, read(t, "layout") answers it, and layout() changes it as a soft key does. So the
// preview provides both answers here while it is mounted, and the runtime asks here rather than
// reaching into a component.
//
// With no preview (the design canvas), the layout showing is the one the inspector is editing and
// previewing, and showing another selects it there: the only screen there is.

let provider = null;

/**
 * Called by the preview while it is mounted: `showing(controlId)` gives the id of the layout a
 * display shows, `show(controlId, layoutId)` shows one. Returns the call that withdraws them.
 */
export function provideDisplayLayouts(next) {
  provider = next;
  return () => { if (provider === next) provider = null; };
}

/** The id of the layout a display shows, or '' when the display rests on its default. */
export function layoutShowing(controlId) {
  const id = String(controlId ?? '');
  if (!id) return '';
  if (provider) return String(provider.showing(id) ?? '');
  return String(get(lcdDesignLayoutIds)[id] ?? '');
}

/** Show a layout on a display, as a soft key that opens it does. */
export function showLayout(controlId, layoutId) {
  const id = String(controlId ?? '');
  if (!id) return;
  if (provider) provider.show(id, String(layoutId ?? ''));
  else setLcdDesignLayout(id, layoutId);
}
