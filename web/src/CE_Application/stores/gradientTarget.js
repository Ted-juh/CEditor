import { writable, get } from 'svelte/store';
import { updateControlProperty } from './controls.js';

/**
 * Gradient target binding store.
 *
 * When a gradient swatch is clicked, it registers a "target"
 * describing where to read/write gradient data. The DisplayPanel's
 * GradientEditor reads this target and routes edits to the right place.
 *
 * Target shape:
 *   { type: 'panel' }                                         — panel bgGradient (default)
 *   { type: 'control', controlId: 'x', path: 'Background.Border' } — control border gradient
 *   null                                                       — default panel behavior
 */
export const gradientTarget = writable(null);

/**
 * Activate a gradient target. Stores the target and returns the current gradient data.
 * Call this when a gradient swatch is clicked.
 *
 * @param {object} target - The target descriptor
 * @param {object|null} currentGradient - The current gradient data object
 * @returns {object} The gradient data for the editor
 */
export function activateGradientTarget(target, currentGradient) {
  const grad = currentGradient || {
    type: 'linear',
    angle: 90,
    stops: [
      { color: 'FFFFFF', position: 0 },
      { color: '000000', position: 100 },
    ],
    edge: 0,
    centerX: 50,
    centerY: 50,
    radiusX: 50,
    radiusY: 50,
  };
  gradientTarget.set({ ...target, _initialGradient: grad });
  return grad;
}

/**
 * Apply a gradient change from the GradientEditor to the active target.
 * Called by DisplayPanel when editing a targeted gradient.
 *
 * @param {object} newGradient - The updated gradient object
 */
export function applyGradientToTarget(newGradient) {
  const target = get(gradientTarget);
  if (!target || target.type !== 'control') return false;

  // Write gradient to the control property
  updateControlProperty(target.controlId, `${target.path}.gradient`, newGradient);
  return true;
}

/**
 * Clear the gradient target (go back to default panel behavior).
 */
export function clearGradientTarget() {
  gradientTarget.set(null);
}
