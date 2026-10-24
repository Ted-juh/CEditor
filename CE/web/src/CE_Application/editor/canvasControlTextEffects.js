/**
 * What a control's text effects resolve to, from its Text section's Effects and Fill: every value
 * CanvasControl draws the effect layers from, in one plain object.
 *
 * These were sixty-eight deriveds of their own in CanvasControl, one per value. A derived is a
 * node in Svelte's reactive graph with its own closure and dependency lists, and every control on
 * a panel made all sixty-eight, though a label with no effects reads a handful of them and a knob
 * with no text none: about 13 KB a control. Here they cost one derived (`textFx`), and the values
 * are the same ones, by the same expressions.
 *
 * Pure: section data in, values out, no component scope, no DOM, no store reads.
 */

import { numberOr } from '../utils/primitives.js';
import { angleDegreesFromVector, degToRad, normalizeVector } from './canvasControlTextGeometry.js';
import {
  buildGlowShadowLayers, buildSingleBlurFilterValue, buildTextBlurFilterValue, buildTextShadowValue,
  cssColor, normalizeTextLayerOrder, parseHexColor, sortTextVisualLayers, textEffectColor,
} from './canvasControlStyles.js';

function longShadowSteps(textEffects, shadowStyle) {
  const steps = Math.max(1, Math.round(numberOr(textEffects?.shadowSteps, 8)));
  const distance = Math.max(0, numberOr(textEffects?.shadowDistance, 12));
  const direction = normalizeVector(numberOr(textEffects?.shadowOffsetX, 1), numberOr(textEffects?.shadowOffsetY, 1));
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return {
      dx: direction.x * distance * ratio,
      dy: direction.y * distance * ratio,
      opacity: shadowStyle === 'extrude' ? 0.88 : Math.max(0.12, 0.5 * (1 - ratio)),
    };
  });
}

function motionSteps(textEffects) {
  const steps = Math.max(1, Math.round(numberOr(textEffects?.motionSteps, 4)));
  const distance = Math.max(0, numberOr(textEffects?.motionDistance, 8));
  if (distance <= 0) return [];
  const angleRadians = degToRad(numberOr(textEffects?.motionAngle, 0));
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return {
      dx: Math.cos(angleRadians) * distance * ratio,
      dy: Math.sin(angleRadians) * distance * ratio,
      opacity: Math.max(0.08, 0.35 * (1 - ((index + 1) / (steps + 1)))),
    };
  });
}

// The reflection was once a "copy", with an offset vector, a colour and a blur of its own; a
// section saved then still reads the same.
function reflectionAngleOf(textEffects) {
  const explicit = Number(textEffects?.reflectionAngle);
  if (Number.isFinite(explicit)) return explicit;
  return angleDegreesFromVector(textEffects?.copyOffsetX, textEffects?.copyOffsetY, 90);
}

function reflectionDistanceOf(textEffects) {
  const explicit = Number(textEffects?.reflectionDistance);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  return Math.hypot(numberOr(textEffects?.copyOffsetX, 0), numberOr(textEffects?.copyOffsetY, 0));
}

function reflectionIntensityOf(textEffects, textFill) {
  const explicit = Number(textEffects?.reflectionIntensity);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit));
  const legacy = parseHexColor(textEffects?.copyColour ?? textFill?.colour ?? 'FFFFFFFF', textFill?.colour ?? 'FFFFFFFF');
  return Math.max(0, Math.min(1, legacy.a));
}

function reflectionColourOf(textEffects, textFill) {
  const stored = String(textEffects?.reflectionColour ?? '').replace(/^#/, '');
  if (stored.length === 8 || stored.length === 6) return textEffectColor(stored, textFill?.colour ?? 'FFFFFFFF');
  const legacy = String(textEffects?.copyColour ?? '').replace(/^#/, '');
  if (legacy.length === 8 || legacy.length === 6) return textEffectColor(legacy, textFill?.colour ?? 'FFFFFFFF');
  return textEffectColor(textFill?.colour ?? 'FFFFFFFF', 'FFFFFFFF');
}

/** `textEffects` is Text.Effects, `textFill` Text.Fill; either may be missing. */
export function resolveTextEffects(textEffects, textFill) {
  const outlineThickness = Math.max(1, numberOr(textEffects?.outlineThickness ?? textEffects?.outlineWidth, textEffects?.knockout === true ? 1 : 1));
  const outlineDistance = Math.max(0, numberOr(textEffects?.outlineDistance, 0));
  const outlineEnabled = textEffects?.outlineEnabled === true || textEffects?.knockout === true;
  const outlineFill = textEffects?.outlineFill !== false;
  const outlineInnerRadius = outlineFill ? 0 : outlineDistance;
  const outlineOuterRadius = outlineDistance + outlineThickness;
  const outlineColour = textEffectColor(textEffects?.outlineColour, textEffects?.knockout === true ? (textFill?.colour ?? 'FFFFFFFF') : 'FF000000');
  const outlineJoin = String(textEffects?.outlineJoin ?? 'round');
  const outlinePlacement = String(textEffects?.outlinePlacement ?? 'outer');
  const outlineDashEnabled = textEffects?.outlineDashEnabled === true;
  const outlineDashArray = outlineDashEnabled
    ? `${Math.max(1, numberOr(textEffects?.outlineDashLength, 8))} ${Math.max(1, numberOr(textEffects?.outlineDashGap, 4))}`
    : '';
  const outlineUseStroke = outlineDashEnabled || outlinePlacement !== 'outer';
  const knockout = textEffects?.knockout === true;
  const fillOrder = normalizeTextLayerOrder(textFill?.order, 50);
  const outlineOrder = normalizeTextLayerOrder(textEffects?.outlineOrder, 40);
  const stroke2Order = normalizeTextLayerOrder(textEffects?.stroke2Order, 45);
  const shadowStyle = String(textEffects?.shadowStyle ?? 'soft');
  const shadowEnabled = textEffects?.shadowEnabled === true;
  const shadowOrder = normalizeTextLayerOrder(textEffects?.shadowOrder, 10);
  const softShadowEnabled = shadowEnabled
    && shadowStyle === 'soft'
    && (
      Math.abs(numberOr(textEffects?.shadowOffsetX, 1)) > 0.001
      || Math.abs(numberOr(textEffects?.shadowOffsetY, 1)) > 0.001
      || Math.max(0, numberOr(textEffects?.shadowBlur, 2)) > 0
    );
  const longShadowEnabled = shadowEnabled && shadowStyle !== 'soft';
  const longShadowCopies = longShadowEnabled ? longShadowSteps(textEffects, shadowStyle) : [];
  const shadowColour = textEffectColor(textEffects?.shadowColour, '80000000');
  const shadowValue = buildTextShadowValue(textEffects, textFill?.colour ?? 'FFFFFFFF');
  const softShadowFilterValue = buildSingleBlurFilterValue(textEffects?.shadowBlur ?? 0);
  const glowLayers = buildGlowShadowLayers(textEffects, textFill?.colour ?? 'FFFFFFFF');
  const glowEnabled = glowLayers.length > 0;
  const glowOrder = normalizeTextLayerOrder(textEffects?.glowOrder, 20);
  const filterValue = buildTextBlurFilterValue(textEffects);
  const fillColourResolved = cssColor(textFill?.colour ?? 'FFFFFFFF');
  const mainFillColour = knockout ? 'rgba(0,0,0,0)' : fillColourResolved;
  const innerGlowEnabled = textEffects?.innerGlowEnabled === true && Math.max(0, numberOr(textEffects?.innerGlowSize, 0)) > 0;
  const innerGlowOrder = normalizeTextLayerOrder(textEffects?.innerGlowOrder, 80);
  const innerGlowColour = textEffectColor(textEffects?.innerGlowColour, textFill?.colour ?? 'FFFFFFFF');
  const innerGlowFilterValue = buildSingleBlurFilterValue(textEffects?.innerGlowSize ?? 0);
  const innerShadowEnabled = textEffects?.innerShadowEnabled === true;
  const innerShadowOrder = normalizeTextLayerOrder(textEffects?.innerShadowOrder, 60);
  const innerShadowColour = textEffectColor(textEffects?.innerShadowColour, '80000000');
  const innerShadowBlurValue = buildSingleBlurFilterValue(textEffects?.innerShadowBlur ?? 0);
  const stroke2Enabled = textEffects?.stroke2Enabled === true && Math.max(0, numberOr(textEffects?.stroke2Thickness, 0)) > 0;
  const stroke2Colour = textEffectColor(textEffects?.stroke2Colour, 'FFFFFFFF');
  const stroke2Placement = String(textEffects?.stroke2Placement ?? 'inner');
  const stroke2DashEnabled = textEffects?.stroke2DashEnabled === true;
  const stroke2DashArray = stroke2DashEnabled
    ? `${Math.max(1, numberOr(textEffects?.stroke2DashLength, 6))} ${Math.max(1, numberOr(textEffects?.stroke2DashGap, 3))}`
    : '';
  const reflectionEnabled = textEffects?.reflectionEnabled === true || (textEffects?.reflectionEnabled == null && textEffects?.copyEnabled === true);
  const reflectionOrder = normalizeTextLayerOrder(textEffects?.reflectionOrder, 5);
  const reflectionAngle = reflectionAngleOf(textEffects);
  const reflectionDistance = reflectionDistanceOf(textEffects);
  const reflectionIntensity = reflectionIntensityOf(textEffects, textFill);
  const reflectionColour = reflectionColourOf(textEffects, textFill);
  const reflectionFilterValue = buildSingleBlurFilterValue(textEffects?.reflectionBlur ?? textEffects?.copyBlur ?? 0);
  const motionEnabled = textEffects?.motionEnabled === true && Math.max(0, numberOr(textEffects?.motionDistance, 0)) > 0;
  const motionOrder = normalizeTextLayerOrder(textEffects?.motionOrder, 30);
  const motionColour = textEffectColor(textEffects?.motionColour, textFill?.colour ?? 'FFFFFFFF');
  const motionCopies = motionEnabled ? motionSteps(textEffects) : [];
  const bevelEnabled = textEffects?.bevelEnabled === true && Math.max(0, numberOr(textEffects?.bevelDepth, 0)) > 0;
  const bevelOrder = normalizeTextLayerOrder(textEffects?.bevelOrder, 60);
  const bevelStyle = String(textEffects?.bevelStyle ?? 'emboss');
  const bevelDepth = Math.max(0, numberOr(textEffects?.bevelDepth, 1.5));
  const bevelHighlightColour = textEffectColor(textEffects?.bevelHighlightColour, '99FFFFFF');
  const bevelShadowColour = textEffectColor(textEffects?.bevelShadowColour, '99000000');
  const bevelIsOuter = bevelEnabled && bevelStyle === 'outer';
  const bevelIsInside = bevelEnabled && bevelStyle !== 'outer';
  const bevelHighlightOpacity = !bevelEnabled ? 0 : bevelStyle === 'inner' ? 0.65 : 0.8;
  const bevelShadowOpacity = !bevelEnabled ? 0 : bevelStyle === 'inner' ? 0.6 : bevelStyle === 'emboss' ? 0.78 : 0.8;
  const bevelNeedsMask = bevelEnabled && bevelStyle !== 'outer';
  const visualLayers = sortTextVisualLayers([
    ...(reflectionEnabled ? [{ key: 'reflection', order: reflectionOrder, priority: 10 }] : []),
    ...(softShadowEnabled ? [{ key: 'softShadow', order: shadowOrder, priority: 20 }] : []),
    ...(longShadowEnabled ? [{ key: 'longShadow', order: shadowOrder, priority: 21 }] : []),
    ...(glowEnabled ? [{ key: 'glow', order: glowOrder, priority: 30 }] : []),
    ...(motionEnabled ? [{ key: 'motion', order: motionOrder, priority: 40 }] : []),
    ...(bevelIsOuter ? [{ key: 'bevelOuter', order: bevelOrder, priority: 50 }] : []),
    ...(outlineEnabled ? [{ key: 'outline', order: outlineOrder, priority: 60 }] : []),
    ...(stroke2Enabled ? [{ key: 'stroke2', order: stroke2Order, priority: 70 }] : []),
    { key: 'fill', order: fillOrder, priority: 80 },
    ...(innerShadowEnabled ? [{ key: 'innerShadow', order: innerShadowOrder, priority: 90 }] : []),
    ...(bevelIsInside ? [{ key: 'bevelInner', order: bevelOrder, priority: 100 }] : []),
    ...(innerGlowEnabled ? [{ key: 'innerGlow', order: innerGlowOrder, priority: 110 }] : []),
  ]);
  const hasEffects = outlineEnabled
    || stroke2Enabled
    || knockout
    || shadowEnabled
    || glowEnabled
    || innerGlowEnabled
    || innerShadowEnabled
    || textEffects?.blurEnabled === true
    || motionEnabled
    || bevelEnabled
    || reflectionEnabled;
  return {
    outlineThickness,
    outlineDistance,
    outlineEnabled,
    outlineFill,
    outlineInnerRadius,
    outlineOuterRadius,
    outlineColour,
    outlineJoin,
    outlinePlacement,
    outlineDashEnabled,
    outlineDashArray,
    outlineUseStroke,
    knockout,
    fillOrder,
    outlineOrder,
    stroke2Order,
    shadowStyle,
    shadowEnabled,
    shadowOrder,
    softShadowEnabled,
    longShadowEnabled,
    longShadowCopies,
    shadowColour,
    shadowValue,
    softShadowFilterValue,
    glowLayers,
    glowEnabled,
    glowOrder,
    filterValue,
    fillColourResolved,
    mainFillColour,
    innerGlowEnabled,
    innerGlowOrder,
    innerGlowColour,
    innerGlowFilterValue,
    innerShadowEnabled,
    innerShadowOrder,
    innerShadowColour,
    innerShadowBlurValue,
    stroke2Enabled,
    stroke2Colour,
    stroke2Placement,
    stroke2DashEnabled,
    stroke2DashArray,
    reflectionEnabled,
    reflectionOrder,
    reflectionAngle,
    reflectionDistance,
    reflectionIntensity,
    reflectionColour,
    reflectionFilterValue,
    motionEnabled,
    motionOrder,
    motionColour,
    motionCopies,
    bevelEnabled,
    bevelOrder,
    bevelStyle,
    bevelDepth,
    bevelHighlightColour,
    bevelShadowColour,
    bevelIsOuter,
    bevelIsInside,
    bevelHighlightOpacity,
    bevelShadowOpacity,
    bevelNeedsMask,
    visualLayers,
    hasEffects,
  };
}
