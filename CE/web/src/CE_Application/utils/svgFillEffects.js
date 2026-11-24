/**
 * A slider part's fill with its effects — a material, shadows, a bevel — drawn as SVG: the fill one
 * plain background with no layer (utils/plainFillCSS.js), each effect an SVG filter on a group around
 * it (editor/SliderShapeFill.svelte).
 *
 * WHY. BackgroundRenderer draws an effect as a CSS `filter: url(#material) url(#shadows)` on a div
 * round the fill, and a CSS filter gives the div a layer of its own. WebKit (the Linux app and
 * plug-ins) paints such a layer inside an SVG foreignObject over everything the SVG draws after it:
 * in 19 of the 79 built-in control sets a knob's lit cap covered its pointer. The same two filters on
 * SVG groups are drawn in the SVG's order by both engines. Measured in WebKitGTK 2.52 and Chromium:
 * one group per filter, since WebKit ignores a list of them on one group.
 *
 * `fillEffectsAsSvg(background, width, height)` returns the fill's paint (as plainFillCSS gives it,
 * or a colour under a gradient) and its effect levels, innermost first — the visible layer's own
 * effects, then the background's, as BackgroundRenderer nests them — each `{ material, shadows }`,
 * the material lit first and the shadows cast from it, as EffectSurfaceActive orders its list. Null
 * when the fill has no effects, or when one says what a group cannot carry in both engines: a blend,
 * a CSS filter function (blur, brightness…), or an effect on one layer of two.
 */
import { colourUnderGradientCSS, plainFillCSS, visibleFillLayers } from './plainFillCSS.js';
import { hasBackgroundEffects, hasSurfaceEffects, surfaceShadows } from './surfaceEffects.js';
import { buildBlendCSS, buildFilterCSS } from './effectsCSS.js';
import { materialActive } from './materialFilter.js';
import { deepClone } from './deepClone.js';

const capitalised = (layer) => `${layer[0].toUpperCase()}${layer.slice(1)}`;

/** One surface's effects as a level, or null when a group cannot say them. */
function level(effects) {
  if (!hasSurfaceEffects(effects)) return { empty: true };
  if (buildBlendCSS(effects) || buildFilterCSS(effects)) return null;
  const material = effects?._children?.Material ?? null;
  return { material: materialActive(material) ? material : null, shadows: surfaceShadows(effects) };
}

export function fillEffectsAsSvg(background, width, height) {
  if (!hasBackgroundEffects(background)) return null;
  const layers = visibleFillLayers(background);
  if (!layers.length) return null;
  const fill = background._children.Fill;
  const layerLevels = layers.map((layer) => level(fill?._children?.[`${capitalised(layer)}Effects`]));
  const outer = level(background._children?.Effects);
  if (!outer || layerLevels.some((l) => l === null)) return null;
  const drawnLayerLevels = layerLevels.filter((l) => !l.empty);
  // An effect on one layer of two lights that layer alone; one group cannot say which.
  if (drawnLayerLevels.length && layers.length > 1) return null;

  const stripped = deepClone(background);
  delete stripped._children.Effects;
  for (const key of Object.keys(stripped._children.Fill?._children ?? {})) {
    if (key.endsWith('Effects')) delete stripped._children.Fill._children[key];
  }
  // A border's effects draw on the border, which a slider fill does not have (SliderShapeFill).
  if (stripped._children.Border?._children?.Effects) delete stripped._children.Border._children.Effects;
  const one = plainFillCSS(stripped, width, height);
  const two = one ? null : colourUnderGradientCSS(stripped, width, height);
  const paint = one ?? two;
  if (!paint) return null;

  const levels = [...drawnLayerLevels, ...(outer.empty ? [] : [outer])]
    .filter((l) => l.material || l.shadows.length);
  if (!levels.length) return null;
  return { paint, gradient: !two && /gradient\(/.test(one ?? ''), both: !!two, levels };
}
