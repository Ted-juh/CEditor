/**
 * CSS `linear-gradient` strings for the HSL band sliders in ColorChooser.
 * Each band shows how the current color would change as one axis of HSL
 * varies across the band, holding the other two axes fixed.
 */

/** Full hue spectrum (0° → 360° in 30° steps) at the given saturation and lightness. */
export function hueBand(saturation, lightness) {
  const stops = [];
  for (let i = 0; i <= 360; i += 30) {
    stops.push(`hsl(${i}, ${saturation}%, ${lightness}%)`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Saturation axis (100% → 0%) at the given hue and lightness. */
export function saturationBand(hue, lightness) {
  return `linear-gradient(to right, hsl(${hue}, 100%, ${lightness}%), hsl(${hue}, 0%, ${lightness}%))`;
}

/** Lightness axis (0% → 50% → 100%) at the given hue and saturation. */
export function lightnessBand(hue, saturation) {
  return `linear-gradient(to right, hsl(${hue}, ${saturation}%, 0%), hsl(${hue}, ${saturation}%, 50%), hsl(${hue}, ${saturation}%, 100%))`;
}

/** Alpha axis (1 → 0) at the given hue, saturation, lightness. */
export function alphaBand(hue, saturation, lightness) {
  return `linear-gradient(to right, hsla(${hue}, ${saturation}%, ${lightness}%, 1), hsla(${hue}, ${saturation}%, ${lightness}%, 0))`;
}
