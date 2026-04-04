import { writable, get } from 'svelte/store';
import { panels, activePanelId, updatePanel } from './panels.js';
import { updateControlProperty } from './controls.js';

/**
 * Color target binding store.
 *
 * When a swatch is clicked anywhere in the UI, it registers a "target"
 * describing where to write color changes back to. The DisplayPanel's
 * ColorChooser reads this target and routes live updates to the right place.
 *
 * Target shape:
 *   { type: 'panel', prop: 'bgColour' }
 *   { type: 'panel', prop: 'gridColour' }
 *   { type: 'control', controlId: 'ctrl_1', path: 'Background.Fill.colour' }
 *   null  (no active target — default panel bgColour behavior)
 */
export const colorTarget = writable(null);

/**
 * Activate a color target and return the current color value.
 * Call this when a swatch is clicked.
 *
 * @param {object} target - The target descriptor
 * @param {string} currentColor - The current RRGGBB (6-char) or AARRGGBB (8-char) color
 * @returns {{ color: string, alpha: number }} Parsed color + alpha for the ColorChooser
 */
export function activateColorTarget(target, currentColor) {
  // Parse AARRGGBB or RRGGBB
  const hex = (currentColor || '333333').replace(/^#/, '');
  let color, alpha;
  if (hex.length === 8) {
    alpha = parseInt(hex.slice(0, 2), 16) / 255;
    color = hex.slice(2, 8);
  } else {
    alpha = 1;
    color = hex.slice(0, 6);
  }

  // Attach initial color to the target so DisplayPanel can sync
  colorTarget.set({ ...target, _initialColor: color, _initialAlpha: alpha });

  return { color, alpha };
}

/**
 * Apply a color change from the ColorChooser to the active target.
 * Called by DisplayPanel's handleColorChange when a colorTarget is active.
 *
 * @param {string} hex - AARRGGBB (8-char) hex from ColorChooser
 */
export function applyColorToTarget(hex) {
  const target = get(colorTarget);
  if (!target) return;

  if (target.type === 'panel') {
    const panelId = get(activePanelId);
    if (panelId == null) return;

    // Panel properties store AARRGGBB for gridColour, RRGGBB for bgColour
    if (target.prop === 'gridColour') {
      updatePanel(panelId, { [target.prop]: hex, modified: true });
    } else {
      // bgColour uses 6-char RRGGBB
      updatePanel(panelId, { [target.prop]: hex.slice(2, 8), modified: true });
    }
  } else if (target.type === 'control') {
    // Control properties use AARRGGBB
    updateControlProperty(target.controlId, target.path, hex);
  }
}

/**
 * Clear the color target (go back to default behavior).
 */
export function clearColorTarget() {
  colorTarget.set(null);
}
