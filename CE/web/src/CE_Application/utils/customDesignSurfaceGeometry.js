// Pure geometry helpers for the custom-component design surface.
// Extracted verbatim from CustomDesignSurfaceEditor.svelte — reactive values
// (artboard size, zoom, snap settings) are passed in as explicit parameters.
import { numberOr } from './primitives.js';

export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveUnit(value, unit, total) {
  const numeric = numberOr(value, 0);
  return String(unit ?? 'px') === 'percent' ? (total * numeric) / 100 : numeric;
}

export function anchorOffset(anchor, size) {
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

export function partFrame(part, artboardWidth, artboardHeight) {
  const layout = part?._children?.Layout ?? {};
  if (String(layout.mode ?? 'absolute') === 'fill') {
    return { left: 0, top: 0, width: artboardWidth, height: artboardHeight };
  }

  const width = resolveUnit(layout.width, layout.widthUnit, artboardWidth);
  const height = resolveUnit(layout.height, layout.heightUnit, artboardHeight);
  const x = resolveUnit(layout.x, layout.xUnit, artboardWidth);
  const y = resolveUnit(layout.y, layout.yUnit, artboardHeight);
  return {
    left: x - anchorOffset(layout.anchorX, width) + numberOr(layout.offsetX, 0),
    top: y - anchorOffset(layout.anchorY, height) + numberOr(layout.offsetY, 0),
    width,
    height,
  };
}

export function zoneFrame(zone, artboardWidth, artboardHeight) {
  const bounds = zone?.bounds ?? {};
  const unit = String(bounds.unit ?? 'percent') === 'px' ? 'px' : '%';
  const x = numberOr(bounds.x, 0);
  const y = numberOr(bounds.y, 0);
  const width = Math.max(0, numberOr(bounds.width, 100));
  const height = Math.max(0, numberOr(bounds.height, 100));
  return unit === 'px'
    ? { left: x, top: y, width, height }
    : {
      left: (artboardWidth * x) / 100,
      top: (artboardHeight * y) / 100,
      width: (artboardWidth * width) / 100,
      height: (artboardHeight * height) / 100,
    };
}

export function isTinyFrame(frame) {
  return !!frame && (frame.width < 28 || frame.height < 18);
}

export function frameCenter(frame) {
  return {
    x: numberOr(frame?.left, 0) + (numberOr(frame?.width, 0) / 2),
    y: numberOr(frame?.top, 0) + (numberOr(frame?.height, 0) / 2),
  };
}

export function boundsForFrames(frames = []) {
  if (!frames.length) return null;
  const left = Math.min(...frames.map((frame) => frame.left));
  const top = Math.min(...frames.map((frame) => frame.top));
  const right = Math.max(...frames.map((frame) => frame.left + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.top + frame.height));
  return { left, top, width: right - left, height: bottom - top };
}

export function draftRect(draft, artboardWidth, artboardHeight) {
  if (!draft) return null;
  let x2 = draft.current.x;
  let y2 = draft.current.y;
  if (draft.constrain) {
    const size = Math.max(Math.abs(x2 - draft.start.x), Math.abs(y2 - draft.start.y));
    x2 = draft.start.x + Math.sign(x2 - draft.start.x || 1) * size;
    y2 = draft.start.y + Math.sign(y2 - draft.start.y || 1) * size;
    x2 = Math.max(0, Math.min(artboardWidth, x2));
    y2 = Math.max(0, Math.min(artboardHeight, y2));
  }
  return {
    left: Math.min(draft.start.x, x2),
    top: Math.min(draft.start.y, y2),
    width: Math.abs(x2 - draft.start.x),
    height: Math.abs(y2 - draft.start.y),
  };
}

export function defaultDrawSize(tool) {
  if (tool === 'text') return { width: 96, height: 28 };
  if (tool === 'hitZone') return { width: 96, height: 52 };
  if (['ellipse', 'ring', 'arcTrack'].includes(tool)) return { width: 72, height: 72 };
  return { width: 72, height: 52 };
}

export function roundLayoutValue(value) {
  return Math.round(value * 1000) / 1000;
}

export function valueFromPx(px, unit, total) {
  return String(unit ?? 'px') === 'percent'
    ? roundLayoutValue(total > 0 ? (px / total) * 100 : 0)
    : roundLayoutValue(px);
}

export function patchFromFrameForLayer(name, part, frame, artboardWidth, artboardHeight) {
  const layout = part?._children?.Layout ?? {};
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  const coordinateX = frame.left + anchorOffset(layout.anchorX, width) - numberOr(layout.offsetX, 0);
  const coordinateY = frame.top + anchorOffset(layout.anchorY, height) - numberOr(layout.offsetY, 0);

  return {
    [`Parts.${name}.Layout.x`]: valueFromPx(coordinateX, layout.xUnit, artboardWidth),
    [`Parts.${name}.Layout.y`]: valueFromPx(coordinateY, layout.yUnit, artboardHeight),
    [`Parts.${name}.Layout.width`]: valueFromPx(width, layout.widthUnit, artboardWidth),
    [`Parts.${name}.Layout.height`]: valueFromPx(height, layout.heightUnit, artboardHeight),
  };
}

export function patchFromZoneFrameFor(name, zone, frame, artboardWidth, artboardHeight) {
  const unit = String(zone?.bounds?.unit ?? 'percent') === 'px' ? 'px' : 'percent';
  const left = Math.max(0, frame.left);
  const top = Math.max(0, frame.top);
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  return {
    [`HitZones.${name}.bounds.x`]: unit === 'px' ? roundLayoutValue(left) : roundLayoutValue((left / artboardWidth) * 100),
    [`HitZones.${name}.bounds.y`]: unit === 'px' ? roundLayoutValue(top) : roundLayoutValue((top / artboardHeight) * 100),
    [`HitZones.${name}.bounds.width`]: unit === 'px' ? roundLayoutValue(width) : roundLayoutValue((width / artboardWidth) * 100),
    [`HitZones.${name}.bounds.height`]: unit === 'px' ? roundLayoutValue(height) : roundLayoutValue((height / artboardHeight) * 100),
    [`HitZones.${name}.bounds.unit`]: unit,
  };
}

export function pointInArtboardFromElement(event, element, artboardWidth, artboardHeight, surfaceZoom) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(artboardWidth, (event.clientX - rect.left) / surfaceZoom)),
    y: Math.max(0, Math.min(artboardHeight, (event.clientY - rect.top) / surfaceZoom)),
  };
}

export function arcPointStyle(frame, angleDeg) {
  if (!frame) return '';
  const radians = (numberOr(angleDeg, 0) * Math.PI) / 180;
  const rx = frame.width / 2;
  const ry = frame.height / 2;
  const x = rx + Math.cos(radians) * rx;
  const y = ry + Math.sin(radians) * ry;
  return `left:${x - 6}px;top:${y - 6}px;`;
}

export function snapGuides(frame, snapEnabled, snapSize, artboardWidth, artboardHeight) {
  if (!frame || !snapEnabled) return [];
  const size = Math.max(1, numberOr(snapSize, 10));
  const candidates = [
    { axis: 'x', value: frame.left },
    { axis: 'x', value: frame.left + frame.width },
    { axis: 'y', value: frame.top },
    { axis: 'y', value: frame.top + frame.height },
  ];
  return candidates
    .filter((guide) => Math.abs(guide.value - Math.round(guide.value / size) * size) < 0.01)
    .map((guide) => ({
      ...guide,
      style: guide.axis === 'x'
        ? `left:${guide.value}px;top:0;height:${artboardHeight}px;`
        : `top:${guide.value}px;left:0;width:${artboardWidth}px;`,
    }));
}

export function frameReadout(frame) {
  if (!frame) return '';
  return `${Math.round(frame.width)} x ${Math.round(frame.height)}  X ${Math.round(frame.left)}  Y ${Math.round(frame.top)}`;
}

export function feedbackLabelStyle(frame, artboardWidth, artboardHeight) {
  if (!frame) return '';
  const left = Math.max(4, Math.min(artboardWidth - 118, frame.left + frame.width + 8));
  const top = Math.max(4, Math.min(artboardHeight - 24, frame.top + frame.height + 8));
  return `left:${left}px;top:${top}px;`;
}

export function selectionBoundsStyle(frame) {
  if (!frame) return '';
  return `left:${frame.left}px;top:${frame.top}px;width:${frame.width}px;height:${frame.height}px;`;
}
