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
  if (!target) return false;

  if (target.type === 'callback' && typeof target.apply === 'function') {
    target.apply(newGradient);
    return true;
  }

  if (target.type !== 'control') return false;

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

/**
 * Shared seed helper for the fill editors (Background / Text / custom-surface —
 * previously three near-identical copies): returns the fill's gradient when it
 * is usable (>= 2 stops), otherwise clones `defaultGradient` and hands it to
 * `seedGradient` so the caller can persist it through its own write primitive
 * (which may be state-scoped or path-prefixed).
 */
export function ensureFillGradientSeeded({ fill, defaultGradient, seedGradient }) {
  if (fill?.gradient?.stops?.length >= 2) return fill.gradient;
  const seeded = JSON.parse(JSON.stringify(defaultGradient));
  seedGradient?.(seeded);
  return seeded;
}

/**
 * Seed-and-open in one step: ensure the Fill has a usable gradient, then
 * activate the gradient target at `targetPath` (the Fill node's path).
 */
export function openFillGradientEditor({ controlId, targetPath, fill, defaultGradient, seedGradient }) {
  if (!controlId || !targetPath) return null;
  const gradient = ensureFillGradientSeeded({ fill, defaultGradient, seedGradient });
  return activateGradientTarget({ type: 'control', controlId, path: targetPath }, gradient);
}
