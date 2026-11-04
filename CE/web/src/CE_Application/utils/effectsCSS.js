/**
 * CSS string builders for a control's Effects section.
 * Each builder reads a sub-section (Shadows / Blend / Filters) from the
 * effects object and returns a CSS fragment ('box-shadow: ...;', etc.) or
 * '' when there is nothing to apply.
 */

/**
 * A shadow's colour as CSS: AARRGGBB keeps its alpha (it was cut to its last six digits, so a soft
 * 60 % shadow drew solid), RRGGBB is opaque.
 */
function shadowColourCSS(colour) {
  const raw = String(colour ?? '').replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(raw)) {
    const alpha = parseInt(raw.slice(0, 2), 16) / 255;
    if (alpha >= 1) return `#${raw.slice(2)}`;
    return `rgba(${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}, ${parseInt(raw.slice(6, 8), 16)}, ${alpha.toFixed(3)})`;
  }
  return `#${raw.slice(-6)}`;
}

export function buildShadowCSS(effects) {
  const shadows = effects?._children?.Shadows;
  if (!shadows?.items?.length) return '';
  const parts = shadows.items
    .filter(s => s.enabled)
    .map(s => {
      const inset = (s.type === 'inner' || s.type === 'inner-glow') ? 'inset ' : '';
      const ox = (s.type === 'outer-glow' || s.type === 'inner-glow') ? 0 : s.offsetX;
      const oy = (s.type === 'outer-glow' || s.type === 'inner-glow') ? 0 : s.offsetY;
      return `${inset}${ox}px ${oy}px ${s.blur}px ${s.spread}px ${shadowColourCSS(s.colour)}`;
    });
  return parts.length ? `box-shadow: ${parts.join(', ')};` : '';
}

export function buildBlendCSS(effects) {
  const mode = effects?._children?.Blend?.mode;
  return mode && mode !== 'normal' ? `mix-blend-mode: ${mode};` : '';
}

export function buildFilterCSS(effects) {
  const f = effects?._children?.Filters;
  if (!f) return '';
  const parts = [];
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  // Older/partial documents may omit neutral filters. One `undefined%` invalidates
  // the entire CSS filter list, including the effects that are explicitly configured.
  if (f.brightness != null && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast != null && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation != null && f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hueRotate != null && f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  if (f.invert > 0) parts.push(`invert(${f.invert}%)`);
  return parts.length ? `filter: ${parts.join(' ')};` : '';
}
