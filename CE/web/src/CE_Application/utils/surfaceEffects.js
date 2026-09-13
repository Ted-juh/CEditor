import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';

export const EFFECT_SURFACES = [
  { id: 'component', label: 'Whole component', root: 'Effects' },
  { id: 'background', label: 'Background + border', root: 'Background.Effects' },
  { id: 'solid', label: 'Solid fill', root: 'Background.Fill.SolidEffects' },
  { id: 'gradient', label: 'Gradient fill', root: 'Background.Fill.GradientEffects' },
  { id: 'image', label: 'Image fill', root: 'Background.Fill.ImageEffects' },
  { id: 'overlay', label: 'Overlay fill', root: 'Background.Fill.OverlayEffects' },
  { id: 'border', label: 'Border only', root: 'Background.Border.Effects' },
];
export function effectSurfaceRoot(surface) {
  return EFFECT_SURFACES.find((entry) => entry.id === surface)?.root ?? 'Effects';
}
export function readSurfaceEffects(control, surface) {
  let node = control;
  for (const key of effectSurfaceRoot(surface).split('.')) node = node?._children?.[key];
  return node;
}
export function resolvedSurfaceEffects(control, surface) {
  const saved = readSurfaceEffects(control, surface);
  const defaults = SECTION_DEFAULTS.Effects;
  return { ...defaults, ...saved, _children: Object.fromEntries(Object.entries(defaults._children)
    .map(([key, value]) => [key, { ...value, ...saved?._children?.[key] }])) };
}
export function effectSurfacePath(surface, path) {
  return path.replace(/^Effects(?=\.|$)/, effectSurfaceRoot(surface));
}
export function effectSurfacePatch(control, surface, patch) {
  const root = effectSurfaceRoot(surface);
  const result = {};
  // Create real ValueTree children through leaf paths, so save/load and state overrides
  // use exactly the same representation as existing component effects.
  if (!readSurfaceEffects(control, surface)) {
    for (const [section, fields] of Object.entries(SECTION_DEFAULTS.Effects._children)) {
      for (const [key, value] of Object.entries(fields)) {
        if (!key.startsWith('_')) result[`${root}.${section}.${key}`] = deepClone(value);
      }
    }
  }
  for (const [path, value] of Object.entries(patch)) result[effectSurfacePath(surface, path)] = value;
  return result;
}
export function hasSurfaceEffects(effects) {
  if (!effects) return false;
  const children = effects._children ?? {};
  if (children.Shadows?.items?.some((shadow) => shadow.enabled)) return true;
  if (children.Bevel?.enabled) return true;
  if (children.Blend?.mode && children.Blend.mode !== 'normal') return true;
  return Object.entries(children.Filters ?? {}).some(([key, value]) => !key.startsWith('_')
    && value !== SECTION_DEFAULTS.Effects._children.Filters[key]);
}
export function hasBackgroundEffects(background) {
  return [background?._children?.Effects, background?._children?.Border?._children?.Effects,
    ...Object.values(background?._children?.Fill?._children ?? {})].some(hasSurfaceEffects);
}
export function surfaceColour(raw = 'FF000000') {
  const hex = String(raw).replace(/^#/, '');
  return { colour: `#${hex.slice(-6)}`, alpha: hex.length === 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1 };
}
export function surfaceShadows(effects) {
  const shadows = (effects?._children?.Shadows?.items ?? []).filter((item) => item.enabled).map((item) => {
    const glow = item.type === 'outer-glow' || item.type === 'inner-glow';
    return { inner: item.type === 'inner' || item.type === 'inner-glow',
      x: glow ? 0 : Number(item.offsetX) || 0, y: glow ? 0 : Number(item.offsetY) || 0,
      blur: Math.max(0, Number(item.blur) || 0), spread: Number(item.spread) || 0,
      ...surfaceColour(item.colour) };
  });
  const bevel = effects?._children?.Bevel;
  if (bevel?.enabled) {
    const angle = (Number(bevel.angle ?? 135) * Math.PI) / 180;
    const size = Math.max(0, Number(bevel.size ?? 5)) * Math.max(0, Number(bevel.depth ?? 100)) / 100;
    const reverse = bevel.style === 'pillow' || bevel.style === 'pillow-emboss' ? -1 : 1;
    const inner = bevel.style !== 'outer-bevel';
    for (const [colour, opacity, direction] of [[bevel.highlightColour ?? 'FFFFFF', bevel.highlightOpacity ?? 75, 1], [bevel.shadowColour ?? '000000', bevel.shadowOpacity ?? 75, -1]]) {
      const paint = surfaceColour(colour);
      shadows.unshift({ inner, x: Math.cos(angle) * size * direction * reverse,
        y: -Math.sin(angle) * size * direction * reverse, blur: Number(bevel.softness) || 0,
        spread: 0, ...paint, alpha: paint.alpha * Number(opacity) / 100 });
    }
  }
  return shadows;
}
