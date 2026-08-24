import { writable } from 'svelte/store';

/**
 * Manual override for the gradient editor's proxy shape.
 *
 * `null` means AUTO — derive the preview from the targeted control's real
 * width, height and corners (see `utils/gradientProxyGeometry.js`). That is
 * the default, and it is a store rather than a prop precisely because the prop
 * could not express it: the shape prop's default is the string 'rectangle',
 * which is a real answer, so there was nowhere for "nobody has chosen" to live
 * and the preview shipped as a rectangle forever.
 *
 * A non-null value is one of the legacy shape names — 'rectangle', 'circle',
 * 'ellipse', 'square', 'triangle' — chosen deliberately by the user, e.g. to
 * sketch a gradient before it has anything to be applied to.
 */
export const gradientShapeOverride = writable(null);

export function setGradientShapeOverride(shape) {
  gradientShapeOverride.set(shape ?? null);
}

export function clearGradientShapeOverride() {
  gradientShapeOverride.set(null);
}
