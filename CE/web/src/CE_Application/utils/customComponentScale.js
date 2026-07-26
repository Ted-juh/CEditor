// "Scale internals" resize policy for placed custom-component instances.
//
// By default an instance stretches: percent-unit parts follow the box and
// px-unit parts keep their authored size. With
// Transform.contentScaleMode === 'scaleInternals', px-unit internals scale
// with the instance relative to the stamped design size
// (Designer.designWidth/designHeight, written when a package is
// instantiated), so a 2x-sized knob looks like a 2x knob, not a knob lost
// in a big box.
//
// Applied by resolveInteractiveControl on the RESOLVED control — after
// materialization, bindings, and state patches (which all author in design
// space) — so rendering and hit-zone resolution stay consistent from the
// same scaled tree.
//
// A part can opt out of size scaling with Layout.pinned === true ("pin
// labels"): its position still tracks the scale, but width/height, font,
// and border stay at authored size.
import { numberOr } from './primitives.js';

export function customInternalScale(control) {
  const transform = control?._children?.Transform ?? null;
  const designer = control?._children?.Designer ?? null;
  if (String(transform?.contentScaleMode ?? 'stretch') !== 'scaleInternals') return null;

  const designWidth = numberOr(designer?.designWidth, 0);
  const designHeight = numberOr(designer?.designHeight, 0);
  if (designWidth <= 0 || designHeight <= 0) return null;

  const sx = numberOr(transform?.width, designWidth) / designWidth;
  const sy = numberOr(transform?.height, designHeight) / designHeight;
  if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return null;

  return { sx, sy, uniform: Math.min(sx, sy) };
}

function isPx(unit) {
  return String(unit ?? 'px') !== 'percent';
}

function scaleLayout(layout, scale, pinned) {
  if (!layout || String(layout.mode ?? 'absolute') === 'fill') return;
  // Positions track the scale even for pinned parts, so a pinned label stays
  // over the feature it labels.
  if (isPx(layout.xUnit)) layout.x = numberOr(layout.x, 0) * scale.sx;
  if (isPx(layout.yUnit)) layout.y = numberOr(layout.y, 0) * scale.sy;
  layout.offsetX = numberOr(layout.offsetX, 0) * scale.sx;
  layout.offsetY = numberOr(layout.offsetY, 0) * scale.sy;
  if (pinned) return;
  if (isPx(layout.widthUnit)) layout.width = numberOr(layout.width, 0) * scale.sx;
  if (isPx(layout.heightUnit)) layout.height = numberOr(layout.height, 0) * scale.sy;
}

function scalePartChrome(part, scale) {
  const border = part?._children?.Background?._children?.Border;
  if (border && numberOr(border.thickness, 0) > 0) {
    border.thickness = Math.max(0.5, numberOr(border.thickness, 0) * scale.uniform);
  }
  const corners = part?._children?.Background?._children?.Corners;
  // 999 is the "fully rounded" sentinel — leave it alone.
  if (corners && numberOr(corners.radius, 0) > 0 && numberOr(corners.radius, 0) < 999) {
    corners.radius = numberOr(corners.radius, 0) * scale.uniform;
  }
  const font = part?._children?.Text?._children?.Font;
  if (font && numberOr(font.size, 0) > 0) {
    font.size = Math.max(1, numberOr(font.size, 0) * scale.uniform);
  }
  const arcTrack = part?.meta?.arcTrack;
  if (arcTrack && numberOr(arcTrack.thickness, 0) > 0) {
    arcTrack.thickness = numberOr(arcTrack.thickness, 0) * scale.uniform;
  }
}

/**
 * Mutates `control` (a resolved deep clone) so px-unit internals match the
 * instance size. No-op unless the scaleInternals policy applies.
 * Returns true when a scale was applied.
 */
export function applyCustomInternalScale(control) {
  const scale = customInternalScale(control);
  if (!scale) return false;

  for (const part of Object.values(control?._children?.Parts?._children ?? {})) {
    const pinned = part?._children?.Layout?.pinned === true;
    scaleLayout(part?._children?.Layout, scale, pinned);
    if (!pinned) scalePartChrome(part, scale);
  }

  for (const zone of Object.values(control?._children?.HitZones?._children ?? {})) {
    const bounds = zone?.bounds;
    if (bounds && String(bounds.unit ?? 'percent') === 'px') {
      bounds.x = numberOr(bounds.x, 0) * scale.sx;
      bounds.y = numberOr(bounds.y, 0) * scale.sy;
      bounds.width = numberOr(bounds.width, 0) * scale.sx;
      bounds.height = numberOr(bounds.height, 0) * scale.sy;
    }
    if (zone?.inflate && String(zone.inflate.unit ?? 'px') === 'px') {
      zone.inflate.x = numberOr(zone.inflate.x, 0) * scale.uniform;
      zone.inflate.y = numberOr(zone.inflate.y, 0) * scale.uniform;
    }
    // minTouch stays unscaled on purpose: it is a finger-size floor, not geometry.
  }

  return true;
}
