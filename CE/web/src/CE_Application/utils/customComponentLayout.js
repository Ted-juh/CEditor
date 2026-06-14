// Shared layout math for custom components.
//
// A part's `Layout` positions an anchored box using mixed units (percent or
// px) relative to the control's pixel size. The same math is used by the
// package thumbnail renderer and by hit-zone follow-mode resolution, so it
// lives here as a single source of truth.

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function resolveLayoutUnit(value, unit, total) {
  const numeric = numberOr(value, 0);
  return String(unit ?? 'px') === 'percent' ? (total * numeric) / 100 : numeric;
}

export function layoutAnchorOffset(anchor, size) {
  switch (String(anchor ?? 'center')) {
    case 'left':
    case 'top':
      return 0;
    case 'right':
    case 'bottom':
      return size;
    default:
      return size / 2;
  }
}

/**
 * Resolve a part's `Layout` to a top-left pixel rect inside a control of the
 * given pixel size. Returns null when no layout is supplied.
 */
export function resolvePartPixelRect(layout, controlWidth, controlHeight) {
  if (!layout) return null;
  const mode = String(layout.mode ?? 'absolute');
  if (mode === 'fill') {
    return { x: 0, y: 0, width: controlWidth, height: controlHeight };
  }
  const width = resolveLayoutUnit(layout.width, layout.widthUnit, controlWidth);
  const height = resolveLayoutUnit(layout.height, layout.heightUnit, controlHeight);
  const x = resolveLayoutUnit(layout.x, layout.xUnit, controlWidth)
    - layoutAnchorOffset(layout.anchorX, width)
    + numberOr(layout.offsetX, 0);
  const y = resolveLayoutUnit(layout.y, layout.yUnit, controlHeight)
    - layoutAnchorOffset(layout.anchorY, height)
    + numberOr(layout.offsetY, 0);
  return { x, y, width, height };
}
