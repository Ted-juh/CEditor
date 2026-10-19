/**
 * Background layer CSS builders.
 * Shared between EditorCanvas (panel background) and anywhere else that needs
 * to render solid / gradient / image / texture overlays from panel data.
 */

import { gradientToCSS } from './gradientCSS.js';
import { readStoredColour } from './colorMath.js';
import { controlSetForPanel, resolveColourValue } from '../models/controlSets.js';

// What panelModel gives a new panel (stores/panelModel.js `bgColour`), spelled the way it is
// compared here.
const DEFAULT_PANEL_COLOUR = 'FF333333';

/**
 * Parse AARRGGBB or RRGGBB hex to rgba(). Falls back to low-alpha white for 6-char.
 */
export function hexToRgba(hex) {
  // A control-set reference that was never resolved renders in the base set — see plainFillCSS.
  const h = String(resolveColourValue(hex)).replace(/^#/, '');
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
export function rotationCoverScale(rotation, width, height) {
  const rad = Math.abs(rotation * Math.PI / 180);
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const w = width || 1, h = height || 1;
  return Math.max((w * cos + h * sin) / w, (w * sin + h * cos) / h);
}

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
    const coverScale = rotationCoverScale(rotation, panelW, panelH);
    transforms.push(`rotate(${rotation}deg)`);
    if (coverScale > 1) transforms.push(`scale(${coverScale.toFixed(4)})`);
  }
  if (flipH) transforms.push('scaleX(-1)');
  if (flipV) transforms.push('scaleY(-1)');
  if (offsetX || offsetY) transforms.push(`translate(${offsetX || 0}px, ${offsetY || 0}px)`);
  if (transforms.length) parts.push(`transform: ${transforms.join(' ')};`);

  switch (fit) {
    case 'fill':
    case 'cover':
      parts.push('background-size: cover;');
      parts.push(`background-position: ${pos};`);
      parts.push('background-repeat: no-repeat;');
      break;
    case 'fit':
    case 'contain':
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
  // A control set may ask for a panel colour (a black tolex, a grey billet). It gets it only
  // while the panel still wears the colour it was created with — an author who picked a colour
  // keeps it, the same rule a set's family patch follows for a control.
  //
  // One leading "#" is dropped, as every colour reader in the panel drops it: a colour property
  // takes 6 or 8 hex digits with or without one, and set("panel.bgColour", "red") stores
  // "#FF0000". Kept, it made "background: ##FF0000", which paints nothing.
  const bare = (colour) => String(colour).replace(/^#/, '').toUpperCase();
  const setColour = controlSetForPanel(panel)?.panel?.colour;
  const authored = bare(panel.bgColour || DEFAULT_PANEL_COLOUR);
  const hex = setColour && authored === DEFAULT_PANEL_COLOUR ? bare(setColour) : authored;
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
  const tint = tintShadow(panel[`bg${prefix}Tint`] ?? 'FFFFFF');

  let style = `background-image: url('${url}'); ${fit}`;
  style += ` opacity: ${opacity}; mix-blend-mode: ${blend};`;
  const filters = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (panel[`bg${prefix}Grayscale`]) filters.push('grayscale(100%)');
  if (sat !== 100) filters.push(`saturate(${sat}%)`);
  if (bri !== 100) filters.push(`brightness(${bri}%)`);
  if (con !== 100) filters.push(`contrast(${con}%)`);
  if (filters.length) style += ` filter: ${filters.join(' ')};`;
  if (tint) style += ` box-shadow: ${tint};`;
  return style;
}

/**
 * The wash an image or texture tint lays over its layer, or '' for none: the tint's colour at 0.3,
 * scaled by its own alpha. Read as the panel reads a colour (readStoredColour): RRGGBB or AARRGGBB,
 * with or without "#". White, in any case, is no tint, and so is a colour fully transparent or one
 * that cannot be read. The first two characters were read as red whatever followed, so "#FF0000"
 * (what set() stores for "red") painted no tint, and an AARRGGBB tint took its alpha for its red.
 */
function tintShadow(value) {
  const read = readStoredColour(value);
  if (!read || read.color === 'FFFFFF' || read.alpha <= 0) return '';
  const byte = (i) => parseInt(read.color.slice(i, i + 2), 16);
  const alpha = read.alpha >= 1 ? 0.3 : Number((0.3 * read.alpha).toFixed(3));
  return `inset 0 0 0 9999px rgba(${byte(0)},${byte(2)},${byte(4)},${alpha})`;
}
