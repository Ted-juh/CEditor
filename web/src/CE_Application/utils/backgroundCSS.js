/**
 * Background layer CSS builders.
 * Shared between EditorCanvas (panel background) and anywhere else that needs
 * to render solid / gradient / image / texture overlays from panel data.
 */

import { gradientToCSS } from './gradientCSS.js';

/**
 * Parse AARRGGBB or RRGGBB hex to rgba(). Falls back to low-alpha white for 6-char.
 */
export function hexToRgba(hex) {
  const h = String(hex).replace(/^#/, '');
  if (h.length === 8) {
    const a = parseInt(h.slice(0, 2), 16) / 255;
    const r = parseInt(h.slice(2, 4), 16);
    const g = parseInt(h.slice(4, 6), 16);
    const b = parseInt(h.slice(6, 8), 16);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.06)`;
}

/**
 * Build the CSS snippet controlling how an image/texture fills the panel —
 * size, position, repeat, plus any rotation/flip/offset transform.
 * `panelW`/`panelH` are needed so rotation can compute a cover scale.
 */
export function fitToCSS(fit, align, offsetX, offsetY, flipH, flipV, tileScale, rotation, panelW, panelH) {
  const parts = [];

  const posMap = {
    'top-left': 'left top', 'top': 'center top', 'top-right': 'right top',
    'left': 'left center', 'center': 'center center', 'right': 'right center',
    'bottom-left': 'left bottom', 'bottom': 'center bottom', 'bottom-right': 'right bottom',
  };
  const pos = posMap[align] || 'center center';

  // Transform (rotation, flip, offset)
  // When rotated, scale the layer up so the rotated content still covers the panel fully.
  const transforms = [];
  if (rotation) {
    const rad = Math.abs(rotation * Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const w = panelW || 1;
    const h = panelH || 1;
    const newW = w * cos + h * sin;
    const newH = w * sin + h * cos;
    const coverScale = Math.max(newW / w, newH / h);
    transforms.push(`rotate(${rotation}deg)`);
    if (coverScale > 1) transforms.push(`scale(${coverScale.toFixed(4)})`);
  }
  if (flipH) transforms.push('scaleX(-1)');
  if (flipV) transforms.push('scaleY(-1)');
  if (offsetX || offsetY) transforms.push(`translate(${offsetX || 0}px, ${offsetY || 0}px)`);
  if (transforms.length) parts.push(`transform: ${transforms.join(' ')};`);

  switch (fit) {
    case 'fill':
      parts.push('background-size: cover;');
      parts.push(`background-position: ${pos};`);
      parts.push('background-repeat: no-repeat;');
      break;
    case 'fit':
      parts.push('background-size: contain;');
      parts.push(`background-position: ${pos};`);
      parts.push('background-repeat: no-repeat;');
      break;
    case 'stretch':
      parts.push('background-size: 100% 100%;');
      parts.push('background-repeat: no-repeat;');
      break;
    case 'tile': {
      const pct = (tileScale || 1) * 25;
      parts.push(`background-size: ${pct}%;`);
      parts.push(`background-position: ${pos};`);
      parts.push('background-repeat: repeat;');
      break;
    }
    case 'original':
      parts.push('background-size: auto;');
      parts.push(`background-position: ${pos};`);
      parts.push('background-repeat: no-repeat;');
      break;
    default:
      parts.push('background-size: cover;');
      parts.push('background-repeat: no-repeat;');
  }

  return parts.join(' ');
}

/**
 * Build the solid-fill background style (panel.bgSolid / panel.bgColour).
 * Returns '' when disabled.
 */
export function buildSolidStyle(panel) {
  if (!panel || panel.bgSolid === false) return '';
  const hex = String(panel.bgColour || 'FF2A2A2A');
  if (hex.length === 8) {
    const a = parseInt(hex.slice(0, 2), 16) / 255;
    const rgb = hex.slice(2);
    return `background: #${rgb}; opacity: ${a.toFixed(3)};`;
  }
  return `background: #${hex};`;
}

/**
 * Build the gradient-overlay background style. Returns null when disabled.
 */
export function buildGradientStyle(panel) {
  if (!panel || !panel.bgGradientEnabled || !panel.bgGradient) return null;
  const opacity = (panel.bgGradientOpacity ?? 100) / 100;
  return `background: ${gradientToCSS(panel.bgGradient)}; opacity: ${opacity};`;
}

/**
 * Unified image/texture overlay style builder. The two layers differ only by
 * property prefix (`bgImage*` vs `bgTexture*`), so both are handled by
 * passing the prefix in.
 *
 *   buildLayerStyle(panel, 'Image', url)
 *   buildLayerStyle(panel, 'Texture', url)
 *
 * Returns null when the layer is disabled or the URL isn't loaded yet.
 */
export function buildLayerStyle(panel, prefix, url) {
  if (!panel || !url) return null;
  const enabled = panel[`bg${prefix}Enabled`];
  const src = panel[`bg${prefix}`];
  if (!enabled || !src) return null;

  const fit = fitToCSS(
    panel[`bg${prefix}Fit`], panel[`bg${prefix}Align`],
    panel[`bg${prefix}OffsetX`], panel[`bg${prefix}OffsetY`],
    panel[`bg${prefix}FlipH`], panel[`bg${prefix}FlipV`],
    panel[`bg${prefix}TileScale`], panel[`bg${prefix}Rotation`],
    panel.width, panel.height
  );
  const opacity = (panel[`bg${prefix}Opacity`] ?? 100) / 100;
  const blend = panel[`bg${prefix}Blend`] || 'normal';
  const blur = panel[`bg${prefix}Blur`] || 0;
  const sat = panel[`bg${prefix}Saturation`] ?? 100;
  const bri = panel[`bg${prefix}Brightness`] ?? 100;
  const con = panel[`bg${prefix}Contrast`] ?? 100;
  const tint = panel[`bg${prefix}Tint`] ?? 'FFFFFF';

  let style = `background-image: url('${url}'); ${fit}`;
  style += ` opacity: ${opacity}; mix-blend-mode: ${blend};`;
  const filters = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (panel[`bg${prefix}Grayscale`]) filters.push('grayscale(100%)');
  if (sat !== 100) filters.push(`saturate(${sat}%)`);
  if (bri !== 100) filters.push(`brightness(${bri}%)`);
  if (con !== 100) filters.push(`contrast(${con}%)`);
  if (filters.length) style += ` filter: ${filters.join(' ')};`;
  if (tint && tint !== 'FFFFFF') {
    const r = parseInt(tint.slice(0, 2), 16);
    const g = parseInt(tint.slice(2, 4), 16);
    const b = parseInt(tint.slice(4, 6), 16);
    style += ` box-shadow: inset 0 0 0 9999px rgba(${r},${g},${b},0.3);`;
  }
  return style;
}
