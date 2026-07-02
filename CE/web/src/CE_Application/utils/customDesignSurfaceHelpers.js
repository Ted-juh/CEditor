// Pure node/style helpers for the custom-component design surface.
// Extracted verbatim from CustomDesignSurfaceEditor.svelte — reactive values
// (frames, artboard size) are passed in as explicit parameters.
import { numberOr } from './primitives.js';
import { isPolygonKind, clipPathForKind } from './shapeGeometry.js';
import { clampNumber } from './customDesignSurfaceGeometry.js';

export function isEditablePart(part) {
  if (!part) return false;
  if (part?.locked === true || part?.meta?.locked === true) return false;
  if (part?.generated === true || part?.meta?.generated === true) {
    return !!(part?.detachedFromGenerator || part?.meta?.detachedFromGenerator);
  }
  return true;
}

export function isGeneratedPart(part) {
  return part?.generated === true || part?.meta?.generated === true;
}

export function generatorNameForEntry(part) {
  return String(part?.meta?.generatedBy ?? part?.generatedBy ?? '').trim();
}

export function generatedSourceForNode(node) {
  const source = String(node?.meta?.generatedBy ?? node?.generatedBy ?? '').trim();
  if (source) return source;
  if (node?.generated === true || node?.meta?.generated === true) return 'generated';
  return '';
}

export function kitIdFor(node) {
  return String(node?.meta?.kitId ?? '');
}

export function isEditableZone(zone) {
  if (!zone) return false;
  if (zone?.locked === true || zone?.meta?.locked === true) return false;
  if (zone?.generated === true || zone?.meta?.generated === true) {
    return !!(zone?.detachedFromGenerator || zone?.meta?.detachedFromGenerator);
  }
  return true;
}

export function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function uniqueNodeName(base, existing, fallback) {
  const safeBase = String(base || fallback).replace(/[^a-zA-Z0-9_]/g, '') || fallback;
  let name = safeBase;
  let index = 1;
  while (existing.has(name)) {
    index += 1;
    name = `${safeBase}_${index}`;
  }
  return name;
}

export function valueControlStyleLabel(style = 'dial') {
  if (style === 'horizontal') return 'Horizontal Scale';
  if (style === 'vertical') return 'Vertical Scale';
  return 'Dial Control';
}

export function isArcCenterPart(part) {
  const kind = String(part?.kind ?? '').trim();
  return kind === 'arcTrack'
    || kind === 'valueArc'
    || !!part?.meta?.arcTrack
    || !!part?.meta?.valueArc;
}

export function previewSignals(value = {}) {
  return {
    valueNormalized: Math.max(0, Math.min(1, numberOr(value?.testValue, 0.5))),
    customChannels: {},
  };
}

export function stopSelectionAction(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

export const STATE_ACCENTS = ['#14B8A6', '#5B9BD5', '#E5A029', '#9B7FEA', '#70C08F', '#E26D6D'];

export function hashIndex(value, size) {
  const text = String(value ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % Math.max(1, size);
}

export function stateLabel(name, state, base = false) {
  if (base) return 'Base';
  return String(state?.label ?? state?.name ?? name ?? 'State');
}

export function stateDescription(name, state, base = false) {
  if (base) return 'Default component look';
  const flags = Object.entries(state?.when ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (flags.length) return flags.join(' + ');
  return state?.description || state?.group || name;
}

export function statePatchCount(state) {
  const patches = state?.patches ?? {};
  return Object.values(patches).reduce((total, patch) => {
    if (!patch || typeof patch !== 'object') return total;
    return total + Object.keys(patch).length;
  }, 0);
}

export function stateCardStyle(name, index = 0) {
  const accent = STATE_ACCENTS[(hashIndex(name, STATE_ACCENTS.length) + index) % STATE_ACCENTS.length];
  return `--state-accent:${accent};`;
}

export function statePreviewStageStyle(entry, artboardWidth, artboardHeight) {
  const previewWidth = Math.max(1, numberOr(entry?.previewWidth, artboardWidth));
  const previewHeight = Math.max(1, numberOr(entry?.previewHeight, artboardHeight));
  const scale = Math.min(44 / previewWidth, 30 / previewHeight);
  const left = Math.max(0, (44 - (previewWidth * scale)) / 2);
  const top = Math.max(0, (30 - (previewHeight * scale)) / 2);
  return [
    `width:${previewWidth}px`,
    `height:${previewHeight}px`,
    `transform:translate(${left}px, ${top}px) scale(${scale})`,
    'transform-origin:top left',
  ].join(';');
}

export function stateTriggerLabel(state, base = false) {
  if (base) return '';
  const when = state?.when ?? {};
  if (when.hover) return 'Hover';
  if (when.pressed) return 'Pressed';
  if (when.disabled) return 'Disabled';
  if (when.focused) return 'Focused';
  if (when.dragging) return 'Dragging';
  if (when.checked) return 'Checked';
  const flags = Object.entries(when).filter(([, v]) => v === true).map(([k]) => k);
  if (flags.length) return flags[0];
  return 'No trigger';
}

export function partBackground(part) {
  return part?._children?.Background ?? {};
}

export function partFillColour(part, fallback = '#14B8A6') {
  return colorInputValue(partBackground(part)?._children?.Fill?.colour, fallback);
}

export function partStrokeColour(part, fallback = '#DCEBFA') {
  return colorInputValue(partBackground(part)?._children?.Border?.colour, fallback);
}

export function partCornerRadius(part) {
  return numberOr(partBackground(part)?._children?.Corners?.radius, 4);
}

export function layerKind(part) {
  return String(part?.kind ?? part?.role ?? 'part');
}

export function layerKindLabel(part) {
  const kind = layerKind(part);
  const labels = {
    roundedRectangle: 'Rounded',
    rectangle: 'Rect',
    circle: 'Circle',
    ellipse: 'Ellipse',
    text: 'Text',
    arcTrack: 'Arc',
    valueArc: 'Arc',
    capsule: 'Capsule',
    ring: 'Ring',
    viewport: 'View',
  };
  return labels[kind] ?? kind;
}

export function layerKindClass(part) {
  const kind = layerKind(part);
  if (['circle', 'ellipse', 'ring'].includes(kind)) return 'ellipse';
  if (['arcTrack', 'valueArc'].includes(kind)) return 'arc';
  if (kind === 'text') return 'text';
  if (kind === 'capsule') return 'capsule';
  return 'rect';
}

export function layerThumbPartStyle(frame, part, artboardWidth, artboardHeight) {
  const left = clampNumber((frame.left / Math.max(1, artboardWidth)) * 100, -8, 100);
  const top = clampNumber((frame.top / Math.max(1, artboardHeight)) * 100, -8, 100);
  const width = clampNumber((frame.width / Math.max(1, artboardWidth)) * 100, 6, 110);
  const height = clampNumber((frame.height / Math.max(1, artboardHeight)) * 100, 6, 110);
  const radius = ['circle', 'ellipse', 'ring'].includes(layerKind(part))
    ? 999
    : Math.min(999, Math.max(2, partCornerRadius(part) / 3));
  return [
    `left:${left}%`,
    `top:${top}%`,
    `width:${width}%`,
    `height:${height}%`,
    `border-radius:${radius}px`,
    `background:${partFillColour(part, '#23323B')}`,
    `border-color:${partStrokeColour(part, '#5B9BD5')}`,
    `opacity:${clampNumber(numberOr(part?.opacity, 1), 0.18, 1)}`,
  ].join(';');
}

export function zoneThumbPartStyle(frame, zone, artboardWidth, artboardHeight) {
  const shape = String(zone?.shape ?? 'rectangle');
  return [
    `left:${clampNumber((frame.left / Math.max(1, artboardWidth)) * 100, -8, 100)}%`,
    `top:${clampNumber((frame.top / Math.max(1, artboardHeight)) * 100, -8, 100)}%`,
    `width:${clampNumber((frame.width / Math.max(1, artboardWidth)) * 100, 8, 110)}%`,
    `height:${clampNumber((frame.height / Math.max(1, artboardHeight)) * 100, 8, 110)}%`,
    `border-radius:${['circle', 'ellipse', 'ring'].includes(shape) ? '999px' : '5px'}`,
  ].join(';');
}

export function partOverlayStyle(frame, part) {
  const layout = part?._children?.Layout ?? {};
  const rotation = numberOr(layout.rotation, 0);
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  const transforms = [];
  if (Math.abs(rotation) > 0.001) transforms.push(`rotate(${rotation}deg)`);
  if (Math.abs(scale - 1) > 0.001) transforms.push(`scale(${scale})`);

  return [
    `left:${frame.left}px`,
    `top:${frame.top}px`,
    `width:${frame.width}px`,
    `height:${frame.height}px`,
    `z-index:${1000 + numberOr(part?.zIndex, 0)}`,
    transforms.length ? `transform:${transforms.join(' ')}; transform-origin:${numberOr(layout.pivotX, 50)}% ${numberOr(layout.pivotY, 50)}%` : '',
  ].filter(Boolean).join(';');
}

export function hitZoneStyle(frame, zone) {
  const shape = String(zone?.shape ?? 'rectangle');
  return [
    `left:${frame.left}px`,
    `top:${frame.top}px`,
    `width:${Math.max(0, frame.width)}px`,
    `height:${Math.max(0, frame.height)}px`,
    `border-radius:${['circle', 'ellipse', 'ring'].includes(shape) ? '999px' : '5px'}`,
    `z-index:${1800 + numberOr(zone?.priority, 0)}`,
  ].join(';');
}

export function inlineTextEditorStyle(frame, part) {
  const text = part?._children?.Text ?? {};
  const font = text?._children?.Font ?? {};
  const fill = text?._children?.Fill ?? {};
  return [
    `left:${frame.left}px`,
    `top:${frame.top}px`,
    `width:${frame.width}px`,
    `height:${frame.height}px`,
    `z-index:${2500 + numberOr(part?.zIndex, 0)}`,
    `color:#${String(fill?.colour ?? 'FFFFFFFF').slice(-6)}`,
    `font-family:${font?.family ?? 'Arial'}`,
    `font-size:${numberOr(font?.size, 12)}px`,
    `font-weight:${numberOr(font?.weightValue, 600)}`,
  ].join(';');
}

export function handleStyle(id) {
  const offset = -4;
  const middle = 'calc(50% - 4px)';
  const positions = {
    tl: `left:${offset}px;top:${offset}px;`,
    t: `left:${middle};top:${offset}px;`,
    tr: `right:${offset}px;top:${offset}px;`,
    r: `right:${offset}px;top:${middle};`,
    br: `right:${offset}px;bottom:${offset}px;`,
    b: `left:${middle};bottom:${offset}px;`,
    bl: `left:${offset}px;bottom:${offset}px;`,
    l: `left:${offset}px;top:${middle};`,
  };
  return positions[id] ?? '';
}

export function colorInputValue(value, fallback = '#5B9BD5') {
  const raw = String(value ?? '').trim();
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return fallback;
}

export function swatchCss(value, fallback = '5B9BD5') {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(raw)) {
    const a = parseInt(raw.slice(0, 2), 16) / 255;
    const rgb = raw.slice(2);
    // Opaque: just paint the solid colour.
    if (a >= 0.999) return `background:#${rgb}`;
    // Semi-transparent: layer the colour over a checkerboard so alpha shows.
    // The colour must be a linear-gradient() to be a valid background-image layer.
    const r = parseInt(raw.slice(2, 4), 16);
    const g = parseInt(raw.slice(4, 6), 16);
    const b = parseInt(raw.slice(6, 8), 16);
    const c = `rgba(${r},${g},${b},${a})`;
    return `background-image:linear-gradient(${c},${c}),repeating-conic-gradient(#555 0% 25%,#333 0% 50%);background-size:auto,8px 8px`;
  }
  // 6-digit RRGGBB (no alpha) — fully opaque.
  if (/^[0-9a-f]{6}$/i.test(raw)) return `background:#${raw}`;
  return `background:#${fallback}`;
}

export function alphaFromColour(value, fallback = 'FF') {
  const raw = String(value ?? '').trim();
  return /^[0-9a-f]{8}$/i.test(raw) ? raw.slice(0, 2).toUpperCase() : fallback;
}

export function colourFromInput(value, alpha = 'FF', fallback = '5B9BD5') {
  const raw = String(value ?? '').replace('#', '').trim();
  return /^[0-9a-f]{6}$/i.test(raw) ? `${alpha}${raw.toUpperCase()}` : `${alpha}${fallback}`;
}

export function numericInputValue(event, fallback = 0) {
  const numeric = Number(event?.target?.value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

// Clip the drag preview to the shape being drawn (polygons + a thin line bar).
export function drawPreviewClip(tool) {
  if (tool === 'line') return 'polygon(0% 42%, 100% 42%, 100% 58%, 0% 58%)';
  if (isPolygonKind(tool)) return clipPathForKind(tool);
  return 'none';
}
