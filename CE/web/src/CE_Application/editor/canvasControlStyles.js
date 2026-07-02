/**
 * Pure style helpers for CanvasControl: hex colour parsing, text-section
 * normalizers, and CSS / SVG string builders. Everything here maps section
 * data passed in as arguments to strings or plain objects — no component
 * scope, no DOM, no store reads.
 */

import { numberOr } from '../utils/primitives.js';
import { gradientToCSS } from '../utils/gradientCSS.js';

/** Parse AARRGGBB / RRGGBB hex (with or without '#') into { r, g, b, a }. */
export function parseHexColor(hex, fallback = 'FFFFFFFF') {
  const value = String(hex ?? '').replace(/^#/, '');
  if (value.length === 8) {
    return {
      r: parseInt(value.slice(2, 4), 16),
      g: parseInt(value.slice(4, 6), 16),
      b: parseInt(value.slice(6, 8), 16),
      a: parseInt(value.slice(0, 2), 16) / 255,
    };
  }
  if (value.length === 6) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: 1,
    };
  }
  if (fallback != null && String(fallback).replace(/^#/, '') !== value) {
    return parseHexColor(fallback, null);
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

export function rgbaColor({ r, g, b, a }) {
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export function cssColor(hex) {
  return rgbaColor(parseHexColor(hex));
}

export function textEffectColor(value, fallback = 'FFFFFFFF') {
  return rgbaColor(parseHexColor(value, fallback));
}

export function scaledTextEffectColor(value, factor = 1, fallback = 'FFFFFFFF') {
  const parsed = parseHexColor(value, fallback);
  return rgbaColor({
    ...parsed,
    a: parsed.a * Math.max(0, numberOr(factor, 1)),
  });
}

export function getEnabledValueRows(valueSection) {
  const rows = valueSection?.rows;
  return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
}

/**
 * Glow renders as stacked text-shadow layers; whole-number intensity adds
 * full-opacity copies, the fractional remainder gets a scaled-alpha copy.
 */
export function buildGlowShadowLayers(textEffects, glowFallback = 'FFFFFFFF') {
  if (textEffects?.glowEnabled !== true) return [];

  const blur = Math.max(0, numberOr(textEffects?.glowSize, 4));
  const intensity = Math.max(0, numberOr(textEffects?.glowIntensity, 1));
  if (blur <= 0 || intensity <= 0) return [];

  const layers = [];
  const fullLayers = Math.floor(intensity);
  const remainder = intensity - fullLayers;

  if (fullLayers <= 0) {
    layers.push({
      blur,
      colour: scaledTextEffectColor(textEffects?.glowColour, intensity, glowFallback),
    });
    return layers;
  }

  for (let index = 0; index < fullLayers; index += 1) {
    layers.push({
      blur,
      colour: textEffectColor(textEffects?.glowColour, glowFallback),
    });
  }

  if (remainder > 0.001) {
    layers.push({
      blur,
      colour: scaledTextEffectColor(textEffects?.glowColour, remainder, glowFallback),
    });
  }

  return layers;
}

export function buildTextShadowValue(textEffects, glowFallback = 'FFFFFFFF') {
  const parts = [];

  if (textEffects?.shadowEnabled && String(textEffects?.shadowStyle ?? 'soft') === 'soft') {
    parts.push([
      `${numberOr(textEffects?.shadowOffsetX, 1)}px`,
      `${numberOr(textEffects?.shadowOffsetY, 1)}px`,
      `${Math.max(0, numberOr(textEffects?.shadowBlur, 2))}px`,
      textEffectColor(textEffects?.shadowColour, '80000000'),
    ].join(' '));
  }

  for (const glowLayer of buildGlowShadowLayers(textEffects, glowFallback)) {
    parts.push([
      '0px',
      '0px',
      `${glowLayer.blur}px`,
      glowLayer.colour,
    ].join(' '));
  }

  return parts.join(', ');
}

export function buildTextBlurFilterValue(textEffects) {
  if (textEffects?.blurEnabled) {
    const blurAmount = Math.max(0, numberOr(textEffects?.blurAmount, 1));
    if (blurAmount > 0) return `blur(${blurAmount}px)`;
  }
  return '';
}

export function buildSingleBlurFilterValue(amount = 0) {
  const blurAmount = Math.max(0, numberOr(amount, 0));
  return blurAmount > 0 ? `blur(${blurAmount}px)` : '';
}

export function normalizeTextLayerOrder(value, fallback = 50) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

/** Sort visual layers by explicit order, falling back to built-in priority. */
export function sortTextVisualLayers(layers) {
  return [...layers].sort((left, right) => {
    const orderDiff = numberOr(left?.order, 0) - numberOr(right?.order, 0);
    if (Math.abs(orderDiff) > 0.001) return orderDiff;
    return numberOr(left?.priority, 0) - numberOr(right?.priority, 0);
  });
}

export function textAlignFor(justification) {
  switch (justification) {
    case 'left':
    case 'topLeft':
    case 'bottomLeft':
      return 'left';
    case 'right':
    case 'topRight':
    case 'bottomRight':
      return 'right';
    default:
      return 'center';
  }
}

export function svgTextAnchorFor(justification) {
  switch (justification) {
    case 'left':
    case 'topLeft':
    case 'bottomLeft':
      return 'start';
    case 'right':
    case 'topRight':
    case 'bottomRight':
      return 'end';
    default:
      return 'middle';
  }
}

export function customHitZoneStyle(zone) {
  const bounds = zone?.bounds ?? {};
  const unit = String(bounds.unit ?? 'percent') === 'px' ? 'px' : '%';
  const width = Math.max(0, numberOr(bounds.width, 100));
  const height = Math.max(0, numberOr(bounds.height, 100));
  const x = numberOr(bounds.x, 0);
  const y = numberOr(bounds.y, 0);
  const shape = String(zone?.shape ?? 'rectangle');

  return [
    `left:${x}${unit}`,
    `top:${y}${unit}`,
    `width:${width}${unit}`,
    `height:${height}${unit}`,
    `border-radius:${shape === 'circle' || shape === 'ellipse' || shape === 'ring' ? '999px' : '4px'}`,
  ].join(';');
}

export function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeTextOrientation(value) {
  const orientation = String(value ?? 'horizontal');
  if (orientation === 'rotate90' || orientation === 'rotate180' || orientation === 'rotate270') {
    return orientation;
  }
  return 'horizontal';
}

export function isVerticalTextOrientation(value) {
  const orientation = normalizeTextOrientation(value);
  return orientation === 'rotate90' || orientation === 'rotate270';
}

export function textOrientationAngle(value) {
  switch (normalizeTextOrientation(value)) {
    case 'rotate90':
      return 90;
    case 'rotate180':
      return 180;
    case 'rotate270':
      return 270;
    default:
      return 0;
  }
}

export function normalizeTextFlowMode(value) {
  const mode = String(value ?? 'rotate');
  if ([
    'line', 'stair', 'arc', 'circle', 'vertical', 'wave', 'zigzag',
    'spiral', 'perimeter', 'polyline', 'bezier', 'freehand',
  ].includes(mode)) return mode;
  return 'rotate';
}

export function resolveTextFlowAngle(positionSection) {
  const explicit = Number(positionSection?.flowAngle);
  if (Number.isFinite(explicit)) return explicit;
  return textOrientationAngle(positionSection?.orientation);
}

export function normalizeTextReadingOrientation(value) {
  const normalized = String(value ?? 'ltr');
  return normalized === 'rtl' || normalized === 'mirrored' ? normalized : 'ltr';
}

export function applyTextReadingOrientation(content, orientation) {
  const normalizedContent = String(content ?? '');
  if (normalizeTextReadingOrientation(orientation) === 'ltr') return normalizedContent;
  return normalizedContent
    .split(/\r\n|\r|\n/)
    .map((line) => Array.from(line).reverse().join(''))
    .join('\n');
}

export function normalizeTextCaseMode(value) {
  const mode = String(value ?? 'normal');
  return ['uppercase', 'lowercase', 'title', 'sentence', 'smallcaps'].includes(mode) ? mode : 'normal';
}

export function applyTextCaseMode(content, caseMode) {
  const normalizedContent = String(content ?? '');
  const mode = normalizeTextCaseMode(caseMode);
  if (mode === 'uppercase') return normalizedContent.toUpperCase();
  if (mode === 'lowercase') return normalizedContent.toLowerCase();
  if (mode === 'title') {
    return normalizedContent.replace(/\w\S*/gu, (word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  }
  if (mode === 'sentence') {
    return normalizedContent
      .toLowerCase()
      .replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (match) => match.toUpperCase());
  }
  return normalizedContent;
}

export function normalizeFillMode(value) {
  const mode = String(value ?? 'solid');
  return ['gradient', 'image', 'texture'].includes(mode) ? mode : 'solid';
}

export function normalizeScriptMode(value) {
  const mode = String(value ?? 'normal');
  return mode === 'superscript' || mode === 'subscript' ? mode : 'normal';
}

export function normalizeLastLineAlign(value) {
  const align = String(value ?? 'inherit');
  return ['left', 'centred', 'right'].includes(align) ? align : 'inherit';
}

export function textCaseVariantCaps(caseMode) {
  return normalizeTextCaseMode(caseMode) === 'smallcaps' ? 'small-caps' : 'normal';
}

export function buildFontFeatureSettings(fontSection) {
  const features = [];
  features.push(`"liga" ${fontSection?.ligatures === false ? 0 : 1}`);
  features.push(`"clig" ${fontSection?.ligatures === false ? 0 : 1}`);
  if (fontSection?.stylisticAlternates === true) features.push('"salt" 1');
  if (fontSection?.oldstyleFigures === true) features.push('"onum" 1');
  if (fontSection?.tabularFigures === true) features.push('"tnum" 1');
  if (fontSection?.fractions === true) features.push('"frac" 1');
  if (fontSection?.slashedZero === true) features.push('"zero" 1');
  if (normalizeTextCaseMode(fontSection?.caseMode) === 'smallcaps') features.push('"smcp" 1');
  return features.join(', ');
}

export function buildFontVariationSettings(axes = {}) {
  const entries = Object.entries(axes ?? {})
    .filter(([tag, value]) => String(tag).length === 4 && Number.isFinite(Number(value)))
    .map(([tag, value]) => `"${String(tag)}" ${Number(value)}`);
  return entries.join(', ');
}

export function scriptScaleForMode(mode) {
  if (mode === 'superscript' || mode === 'subscript') return 0.72;
  return 1;
}

export function scriptBaselineShiftForMode(mode, fontSize) {
  if (mode === 'superscript') return fontSize * 0.28;
  if (mode === 'subscript') return -(fontSize * 0.18);
  return 0;
}

export function fillBackgroundPosition(offsetX = 0, offsetY = 0) {
  return `calc(50% + ${numberOr(offsetX, 0)}px) calc(50% + ${numberOr(offsetY, 0)}px)`;
}

/** Inline style for the fill layer behind masked text (solid / gradient / image / texture). */
export function buildTextFillLayerStyle(fillSection, imageUrl, textureUrl) {
  const mode = normalizeFillMode(fillSection?.mode);
  if (mode === 'gradient' && fillSection?.gradient?.stops?.length >= 2) {
    return `width:100%;height:100%;background:${gradientToCSS(fillSection.gradient)};`;
  }
  if (mode === 'image' && imageUrl) {
    const tint = cssColor(fillSection?.imageTint ?? 'FFFFFFFF');
    const sizeMap = {
      cover: 'cover',
      contain: 'contain',
      fill: '100% 100%',
    };
    return [
      'width:100%;height:100%',
      `opacity:${Math.max(0, Math.min(1, numberOr(fillSection?.imageOpacity, 100) / 100))}`,
      `background-image:linear-gradient(${tint}, ${tint}), url("${imageUrl}")`,
      `background-size:100% 100%, ${sizeMap[String(fillSection?.imageFit ?? 'cover')] ?? 'cover'}`,
      `background-position:center center, ${fillBackgroundPosition(fillSection?.imageOffsetX, fillSection?.imageOffsetY)}`,
      'background-repeat:no-repeat, no-repeat',
      'background-blend-mode:multiply',
    ].join(';');
  }
  if (mode === 'texture' && textureUrl) {
    const tint = cssColor(fillSection?.textureTint ?? 'FFFFFFFF');
    const tileScale = Math.max(0.1, numberOr(fillSection?.textureTileScale, 1));
    const tileSize = `${Math.max(8, 64 * tileScale)}px ${Math.max(8, 64 * tileScale)}px`;
    return [
      'width:100%;height:100%',
      `opacity:${Math.max(0, Math.min(1, numberOr(fillSection?.textureOpacity, 100) / 100))}`,
      `background-image:linear-gradient(${tint}, ${tint}), url("${textureUrl}")`,
      `background-size:100% 100%, ${tileSize}`,
      `background-position:center center, ${fillBackgroundPosition(fillSection?.textureOffsetX, fillSection?.textureOffsetY)}`,
      'background-repeat:no-repeat, repeat',
      'background-blend-mode:multiply',
    ].join(';');
  }
  return `width:100%;height:100%;background:${cssColor(fillSection?.colour ?? 'FFFFFFFF')};`;
}

/** Line-decoration (underline/strikethrough/overline) colour: explicit setting or the text fill. */
export function lineColourFor(kind, fontSection, fillSection) {
  const key = `${kind}Colour`;
  const stored = String(fontSection?.[key] ?? '').replace(/^#/, '');
  if (stored.length === 8 || stored.length === 6) return cssColor(stored);
  return cssColor(fillSection?.colour ?? 'FFFFFFFF');
}

export function safeSvgId(value) {
  return String(value ?? 'control').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function lineLayerFor(kind, fontSection) {
  return String(fontSection?.[`${kind}Layer`] ?? 'back') === 'front' ? 'front' : 'back';
}

export function lineBaseOffsetFor(kind, fontSection) {
  const halfFontSize = numberOr(fontSection?.size, 12) / 2;
  if (kind === 'underline') return halfFontSize;
  if (kind === 'overline') return -halfFontSize;
  return 0;
}

/**
 * Geometry of a block-text line decoration. axis is the caller's text
 * placement: { inlineExtent, centerX, centerY } in control-local pixels.
 */
export function lineGeometry(kind, fontSection, fillSection, { inlineExtent = 0, centerX = 0, centerY = 0 } = {}) {
  const thickness = Math.max(1, numberOr(fontSection?.[`${kind}Thickness`], 1));
  const offset = numberOr(fontSection?.[`${kind}Offset`], 0);
  const insetLeft = numberOr(fontSection?.[`${kind}InsetLeft`], 0);
  const insetRight = numberOr(fontSection?.[`${kind}InsetRight`], 0);
  const colour = lineColourFor(kind, fontSection, fillSection);
  const halfInlineExtent = Math.max(0, inlineExtent) / 2;
  const halfFontSize = numberOr(fontSection?.size, 12) / 2;

  let lineCenterY = centerY + offset;
  if (kind === 'underline') {
    lineCenterY += halfFontSize;
  } else if (kind === 'overline') {
    lineCenterY -= halfFontSize;
  }

  const left = centerX - halfInlineExtent + insetLeft;
  const right = centerX + halfInlineExtent - insetRight;
  const top = lineCenterY - (thickness / 2);

  return {
    left,
    right,
    top,
    bottom: top + thickness,
    thickness,
    colour,
    gap: Math.max(0, numberOr(fontSection?.[`${kind}Gap`], 0)),
  };
}

/** Canvas 2D font shorthand for a text Font section. */
export function lineCanvasFont(fontSection, familyName) {
  const fontStyle = fontSection?.style === 'Italic' ? 'italic' : 'normal';
  const fontWeight = numberOr(fontSection?.weightValue, fontSection?.weight === 'Bold' ? 700 : 400);
  const fontSize = Math.max(1, numberOr(fontSection?.size, 12) * scriptScaleForMode(normalizeScriptMode(fontSection?.scriptMode)));
  return `${fontStyle} ${fontWeight} ${fontSize}px "${familyName}"`;
}
