import { resolveInteractiveControl } from './interactionRuntime.js';
import { denormalizeCustomChannelValue, seedCustomValues } from './customComponentInteraction.js';
import { normalizeCorner } from './cornerNormalization.js';
import { buildFillClipPath } from './cornerPaths.js';
import { buildBorderSegments, getDoubleGap } from './borderSegments.js';

export const FILMSTRIP_BAKE_WARN_PIXELS = 32_000_000;
export const FILMSTRIP_BAKE_MAX_PIXELS = 96_000_000;
export const FILMSTRIP_BAKE_MAX_DIMENSION = 32_767;

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function argbToRgba(colour, fallback = 'rgba(0,0,0,0)') {
  const text = String(colour ?? '').replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6,8}$/.test(text)) return fallback;
  const hex = text.length === 6 ? `FF${text}` : text;
  const alpha = parseInt(hex.slice(0, 2), 16) / 255;
  const red = parseInt(hex.slice(2, 4), 16);
  const green = parseInt(hex.slice(4, 6), 16);
  const blue = parseInt(hex.slice(6, 8), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function cssFilterFor(filters) {
  if (!filters) return 'none';
  const parts = [];
  if (numberOr(filters.blur, 0) > 0) parts.push(`blur(${numberOr(filters.blur, 0)}px)`);
  if (numberOr(filters.brightness, 100) !== 100) parts.push(`brightness(${numberOr(filters.brightness, 100)}%)`);
  if (numberOr(filters.contrast, 100) !== 100) parts.push(`contrast(${numberOr(filters.contrast, 100)}%)`);
  if (numberOr(filters.saturation, 100) !== 100) parts.push(`saturate(${numberOr(filters.saturation, 100)}%)`);
  if (numberOr(filters.hueRotate, 0) !== 0) parts.push(`hue-rotate(${numberOr(filters.hueRotate, 0)}deg)`);
  if (numberOr(filters.grayscale, 0) > 0) parts.push(`grayscale(${numberOr(filters.grayscale, 0)}%)`);
  if (numberOr(filters.sepia, 0) > 0) parts.push(`sepia(${numberOr(filters.sepia, 0)}%)`);
  if (numberOr(filters.invert, 0) > 0) parts.push(`invert(${numberOr(filters.invert, 0)}%)`);
  return parts.length ? parts.join(' ') : 'none';
}

function applyBlendMode(ctx, mode) {
  const blend = String(mode ?? 'normal');
  const supported = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);
  ctx.globalCompositeOperation = supported.has(blend) ? blend : 'source-over';
}

function section(control, name) {
  return control?._children?.[name] ?? null;
}

function resolveUnit(value, unit, total) {
  const numeric = numberOr(value, 0);
  return String(unit ?? 'px') === 'percent' ? (total * numeric) / 100 : numeric;
}

function anchorOffset(anchor, size) {
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

function partFrame(part, parentWidth, parentHeight) {
  const layout = part?._children?.Layout ?? {};
  if (String(layout.mode ?? 'absolute') === 'fill') {
    return { left: 0, top: 0, width: parentWidth, height: parentHeight };
  }

  const width = resolveUnit(layout.width, layout.widthUnit, parentWidth);
  const height = resolveUnit(layout.height, layout.heightUnit, parentHeight);
  const x = resolveUnit(layout.x, layout.xUnit, parentWidth);
  const y = resolveUnit(layout.y, layout.yUnit, parentHeight);
  return {
    left: x - anchorOffset(layout.anchorX, width) + numberOr(layout.offsetX, 0),
    top: y - anchorOffset(layout.anchorY, height) + numberOr(layout.offsetY, 0),
    width,
    height,
  };
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = clamp(numberOr(radius, 0), 0, Math.min(width, height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function extractPathFromClipCSS(css) {
  const match = String(css ?? '').match(/path\('([^']+)'\)/);
  return match?.[1] ?? '';
}

function makePath2D(pathText) {
  if (typeof Path2D === 'undefined' || !pathText) return null;
  try {
    return new Path2D(pathText);
  } catch {
    return null;
  }
}

function normalizedCorners(background) {
  const corners = background?._children?.Corners ?? null;
  return {
    tl: normalizeCorner(corners, 'tl'),
    tr: normalizeCorner(corners, 'tr'),
    br: normalizeCorner(corners, 'br'),
    bl: normalizeCorner(corners, 'bl'),
  };
}

function advancedFillPath(part, frame, background) {
  const kind = String(part?.kind ?? 'rectangle').toLowerCase();
  if (kind === 'circle' || kind === 'ellipse') return null;
  const pathText = extractPathFromClipCSS(buildFillClipPath(normalizedCorners(background), frame.width, frame.height));
  return makePath2D(pathText);
}

function partPath(ctx, part, frame, background) {
  const kind = String(part?.kind ?? 'rectangle').toLowerCase();
  const corners = background?._children?.Corners ?? {};
  if (kind === 'circle' || kind === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      frame.width / 2,
      frame.height / 2,
      Math.max(0, frame.width / 2),
      Math.max(0, frame.height / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.closePath();
    return;
  }
  const advancedPath = advancedFillPath(part, frame, background);
  if (advancedPath) {
    ctx.beginPath();
    return advancedPath;
  }
  roundedRectPath(ctx, 0, 0, frame.width, frame.height, numberOr(corners.radius, 0));
  return null;
}

function gradientStops(gradient) {
  const stops = Array.isArray(gradient?.stops) ? gradient.stops : [];
  return stops
    .map((stop, index) => {
      const rawPosition = stop?.position ?? (stops.length <= 1 ? 0 : (index / (stops.length - 1)) * 100);
      const position = typeof rawPosition === 'number'
        ? rawPosition
        : parseFloat(String(rawPosition).replace('%', ''));
      return {
        position: clamp(Number.isFinite(position) ? position : 0, 0, 100),
        color: argbToRgba(stop?.colour ?? stop?.color ?? stop?.hex ?? 'FFFFFFFF', 'rgba(255,255,255,1)'),
      };
    })
    .sort((left, right) => left.position - right.position);
}

function canvasGradient(ctx, gradient, width, height) {
  const type = String(gradient?.type ?? 'linear').toLowerCase();
  const stops = gradientStops(gradient);
  if (stops.length < 2) return null;

  let result;
  if (type === 'radial') {
    const cx = (numberOr(gradient.centerX, 50) / 100) * width;
    const cy = (numberOr(gradient.centerY, 50) / 100) * height;
    const radius = Math.max(width, height) * (numberOr(gradient.radius, 100) / 100);
    result = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, radius));
  } else {
    const angle = (numberOr(gradient.angle, 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const length = Math.max(width, height);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    result = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
  }

  for (const stop of stops) {
    result.addColorStop(stop.position / 100, stop.color);
  }
  return result;
}

function fillLayerOrder(fill) {
  return Array.isArray(fill?.layerOrder) && fill.layerOrder.length
    ? fill.layerOrder
    : ['solid', 'gradient', 'image', 'overlay'];
}

function fillLayerVisible(fill, layer) {
  if (fill?.soloLayer && fill.soloLayer !== layer) return false;
  if (fill?.[`${layer}Muted`] === true) return false;
  if (layer === 'solid') return fill?.solidEnabled !== false;
  if (layer === 'gradient') return fill?.gradientEnabled === true && !!fill?.gradient;
  if (layer === 'image') return fill?.imageEnabled === true && !!fill?.imageSrc;
  if (layer === 'overlay') return fill?.overlayEnabled === true && !!fill?.overlaySrc;
  return false;
}

function drawShapeFill(ctx, part, frame, fillStyle, opacity = 1, blend = 'normal') {
  ctx.save();
  ctx.globalAlpha *= clamp(opacity, 0, 1);
  applyBlendMode(ctx, blend);
  const path = partPath(ctx, part, frame, part?._children?.Background ?? null);
  ctx.fillStyle = fillStyle;
  if (path) ctx.fill(path);
  else ctx.fill();
  ctx.restore();
}

function imageFitRect(image, frame, fit = 'fill') {
  const mode = String(fit ?? 'fill');
  if (mode === 'stretch' || mode === 'fill') return { sx: 0, sy: 0, sw: image.width, sh: image.height, dx: 0, dy: 0, dw: frame.width, dh: frame.height };
  const imageRatio = image.width / Math.max(1, image.height);
  const frameRatio = frame.width / Math.max(1, frame.height);
  const contain = mode === 'contain' || mode === 'fit';
  const useWidth = contain ? imageRatio > frameRatio : imageRatio < frameRatio;
  const dw = useWidth ? frame.width : frame.height * imageRatio;
  const dh = useWidth ? frame.width / imageRatio : frame.height;
  return {
    sx: 0,
    sy: 0,
    sw: image.width,
    sh: image.height,
    dx: (frame.width - dw) / 2,
    dy: (frame.height - dh) / 2,
    dw,
    dh,
  };
}

async function drawImageFillLayer(ctx, part, frame, fill, layer) {
  const isImage = layer === 'image';
  const source = String(fill?.[`${layer}Src`] ?? '');
  const image = await loadImage(source);
  if (!image) return;

  const prefix = isImage ? 'image' : 'overlay';
  const rect = imageFitRect(image, frame, fill?.[`${prefix}Fit`] ?? (isImage ? 'fill' : 'cover'));
  ctx.save();
  const path = partPath(ctx, part, frame, part?._children?.Background ?? null);
  if (path) ctx.clip(path);
  else ctx.clip();
  ctx.globalAlpha *= clamp(numberOr(fill?.[`${prefix}Opacity`], 100) / 100, 0, 1);
  applyBlendMode(ctx, fill?.[`${prefix}Blend`] ?? 'normal');
  const filterParts = [];
  const blur = numberOr(fill?.[`${prefix}Blur`], 0);
  if (blur > 0) filterParts.push(`blur(${blur}px)`);
  if (fill?.[`${prefix}Grayscale`] === true) filterParts.push('grayscale(100%)');
  if (numberOr(fill?.[`${prefix}Saturation`], 100) !== 100) filterParts.push(`saturate(${numberOr(fill?.[`${prefix}Saturation`], 100)}%)`);
  if (numberOr(fill?.[`${prefix}Brightness`], 100) !== 100) filterParts.push(`brightness(${numberOr(fill?.[`${prefix}Brightness`], 100)}%)`);
  if (numberOr(fill?.[`${prefix}Contrast`], 100) !== 100) filterParts.push(`contrast(${numberOr(fill?.[`${prefix}Contrast`], 100)}%)`);
  ctx.filter = filterParts.length ? filterParts.join(' ') : 'none';
  ctx.translate(frame.width / 2, frame.height / 2);
  ctx.rotate((numberOr(fill?.[`${prefix}Rotation`], 0) * Math.PI) / 180);
  ctx.scale(fill?.[`${prefix}FlipH`] === true ? -1 : 1, fill?.[`${prefix}FlipV`] === true ? -1 : 1);
  ctx.translate(-frame.width / 2, -frame.height / 2);
  ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx + numberOr(fill?.[`${prefix}OffsetX`], 0), rect.dy + numberOr(fill?.[`${prefix}OffsetY`], 0), rect.dw, rect.dh);
  ctx.restore();
}

function applyPartShadow(ctx, effects) {
  const shadow = (effects?._children?.Shadows?.items ?? []).find((item) => item?.enabled && !['inner', 'inner-glow'].includes(String(item.type ?? '')));
  if (!shadow) return;
  ctx.shadowColor = argbToRgba(shadow.colour, 'rgba(0,0,0,0.5)');
  ctx.shadowBlur = numberOr(shadow.blur, 0) + numberOr(shadow.spread, 0);
  ctx.shadowOffsetX = ['outer-glow', 'glow'].includes(String(shadow.type ?? '')) ? 0 : numberOr(shadow.offsetX, 0);
  ctx.shadowOffsetY = ['outer-glow', 'glow'].includes(String(shadow.type ?? '')) ? 0 : numberOr(shadow.offsetY, 0);
}

function borderSourceForSegment(background, segment) {
  const border = background?._children?.Border ?? {};
  const corners = background?._children?.Corners ?? {};
  if (segment.kind === 'side') {
    return border.linked ? border : (border?.[segment.key] ?? border);
  }
  if (corners.linked) return corners;
  return corners?.[segment.key] ?? corners;
}

function gradientForAxis(ctx, gradient, axis) {
  const stops = gradientStops(gradient);
  if (!axis || stops.length < 2) return null;
  const result = ctx.createLinearGradient(axis.x1, axis.y1, axis.x2, axis.y2);
  for (const stop of stops) {
    result.addColorStop(stop.position / 100, stop.color);
  }
  return result;
}

function segmentGradientAxis(segment, source) {
  if (segment.kind === 'side') return segment.flowAxis ?? null;
  const mode = String(source?.cornerGradientMode ?? 'radial');
  if (mode === 'tangential') return segment.tangentialAxis ?? segment.flowAxis ?? null;
  return segment.radialAxis ?? segment.tangentialAxis ?? segment.flowAxis ?? null;
}

function strokeStyleForSegment(ctx, background, segment) {
  const source = borderSourceForSegment(background, segment);
  if (source?.fillGradient === true && source?.gradient) {
    const gradient = gradientForAxis(ctx, source.gradient, segmentGradientAxis(segment, source));
    if (gradient) return gradient;
  }
  return segment.colour ?? '#FFFFFF';
}

function applySegmentDash(ctx, segment) {
  const text = String(segment.dasharray ?? 'none');
  if (!text || text === 'none') {
    ctx.setLineDash([]);
    return;
  }
  const dash = text
    .split(/\s+/)
    .map((value) => numberOr(value, 0))
    .filter((value) => value >= 0);
  ctx.setLineDash(dash.length ? dash : []);
}

function drawBorderSegments(ctx, background, width, height) {
  const segments = buildBorderSegments(width, height, background?._children?.Border, background?._children?.Corners);
  for (const segment of segments) {
    const path = makePath2D(segment.d);
    if (!path) continue;
    ctx.save();
    ctx.lineWidth = Math.max(0.1, numberOr(segment.thick, 1));
    ctx.strokeStyle = strokeStyleForSegment(ctx, background, segment);
    ctx.lineCap = segment.linecap === 'round' ? 'round' : 'butt';
    ctx.lineJoin = segment.linejoin === 'miter' ? 'miter' : 'round';
    applySegmentDash(ctx, segment);
    ctx.stroke(path);
    ctx.restore();
  }
}

function drawAdvancedBorder(ctx, background, frame) {
  const border = background?._children?.Border ?? {};
  if (border.enabled === false) return;
  drawBorderSegments(ctx, background, frame.width, frame.height);
  const gap = getDoubleGap(border);
  if (gap > 0 && frame.width > gap * 2 && frame.height > gap * 2) {
    ctx.save();
    ctx.translate(gap, gap);
    drawBorderSegments(ctx, background, frame.width - gap * 2, frame.height - gap * 2);
    ctx.restore();
  }
}

async function drawBackground(ctx, part, frame) {
  const background = part?._children?.Background ?? null;
  if (!background) return;
  const fill = background?._children?.Fill ?? {};
  const border = background?._children?.Border ?? {};
  ctx.save();
  for (const layer of fillLayerOrder(fill)) {
    if (!fillLayerVisible(fill, layer)) continue;
    if (layer === 'solid') {
      drawShapeFill(ctx, part, frame, argbToRgba(fill.colour, 'rgba(0,0,0,0)'), 1, fill.solidBlend ?? 'normal');
    } else if (layer === 'gradient') {
      const gradient = canvasGradient(ctx, fill.gradient, frame.width, frame.height);
      if (gradient) drawShapeFill(ctx, part, frame, gradient, numberOr(fill.gradientOpacity, 100) / 100, fill.gradientBlend ?? 'normal');
    } else if (layer === 'image' || layer === 'overlay') {
      await drawImageFillLayer(ctx, part, frame, fill, layer);
    }
  }
  drawAdvancedBorder(ctx, background, frame);
  ctx.restore();
}

const imageCache = new Map();

function loadImage(source) {
  const src = String(source ?? '');
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image asset for filmstrip baking.'));
    image.crossOrigin = 'anonymous';
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

async function drawImageSection(ctx, imageSection, frame) {
  const source = String(imageSection?.source ?? '');
  if (!source) return;
  const image = await loadImage(source);
  if (!image) return;

  const mode = String(imageSection?.mode ?? 'image');
  if (mode === 'filmstrip') {
    const frameCount = Math.max(1, Math.round(numberOr(imageSection.frameCount, 1)));
    const frameIndex = clamp(Math.round(numberOr(imageSection.frameIndex, 0)), 0, frameCount - 1);
    const orientation = String(imageSection.orientation ?? 'vertical');
    const sourceWidth = orientation === 'horizontal' ? image.width / frameCount : image.width;
    const sourceHeight = orientation === 'horizontal' ? image.height : image.height / frameCount;
    const sourceX = orientation === 'horizontal' ? sourceWidth * frameIndex : 0;
    const sourceY = orientation === 'horizontal' ? 0 : sourceHeight * frameIndex;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, frame.width, frame.height);
    return;
  }

  const rect = imageFitRect(image, frame, imageSection?.fit ?? 'cover');
  ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
}

function drawText(ctx, part, frame) {
  const text = part?._children?.Text ?? null;
  if (!text) return;
  const fill = text?._children?.Fill ?? {};
  const font = text?._children?.Font ?? {};
  const position = text?._children?.Position ?? {};
  const effects = text?._children?.Effects ?? {};
  const size = numberOr(font.size, 12);
  const weight = numberOr(font.weightValue, 400);
  const family = String(font.family ?? 'Arial');
  const content = String(text.content ?? '');
  ctx.fillStyle = argbToRgba(fill.colour, 'rgba(255,255,255,1)');
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = 'middle';
  const justification = String(position.justification ?? 'centred').toLowerCase();
  ctx.textAlign = justification === 'left' || justification === 'near' ? 'left' : (justification === 'right' || justification === 'far' ? 'right' : 'center');
  const x = ctx.textAlign === 'left' ? 8 : (ctx.textAlign === 'right' ? frame.width - 8 : frame.width / 2);
  const y = frame.height / 2;
  const maxWidth = Math.max(0, frame.width - 16);

  if (effects.shadowEnabled === true) {
    ctx.save();
    ctx.shadowColor = argbToRgba(effects.shadowColour ?? '99000000', 'rgba(0,0,0,0.6)');
    ctx.shadowBlur = numberOr(effects.shadowBlur, numberOr(effects.shadowSize, 2));
    ctx.shadowOffsetX = numberOr(effects.shadowOffsetX, 1);
    ctx.shadowOffsetY = numberOr(effects.shadowOffsetY, 1);
    ctx.fillText(content, x, y, maxWidth);
    ctx.restore();
  }
  if (effects.glowEnabled === true) {
    ctx.save();
    ctx.shadowColor = argbToRgba(effects.glowColour ?? fill.colour ?? '66FFFFFF', 'rgba(255,255,255,0.5)');
    ctx.shadowBlur = numberOr(effects.glowSize, 4);
    ctx.fillText(content, x, y, maxWidth);
    ctx.restore();
  }
  if (effects.outlineEnabled === true) {
    ctx.save();
    ctx.lineWidth = Math.max(1, numberOr(effects.outlineThickness, 1));
    ctx.strokeStyle = argbToRgba(effects.outlineColour, 'rgba(0,0,0,1)');
    ctx.lineJoin = String(effects.outlineJoin ?? 'round');
    ctx.strokeText(content, x, y, maxWidth);
    ctx.restore();
  }
  ctx.save();
  ctx.filter = effects.blurEnabled === true ? `blur(${numberOr(effects.blurAmount, 1)}px)` : 'none';
  ctx.fillText(content, x, y, maxWidth);
  ctx.restore();
}

async function drawPart(ctx, part, width, height) {
  if (!part || part.visible === false) return;
  const frame = partFrame(part, width, height);
  if (frame.width <= 0 || frame.height <= 0) return;
  const layout = part?._children?.Layout ?? {};
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  const rotation = (numberOr(layout.rotation, 0) * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = clamp(numberOr(part.opacity, 1), 0, 1);
  ctx.filter = cssFilterFor(part?._children?.Effects?._children?.Filters);
  applyPartShadow(ctx, part?._children?.Effects);
  ctx.translate(frame.left + frame.width / 2, frame.top + frame.height / 2);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(-frame.width / 2, -frame.height / 2);
  await drawBackground(ctx, part, frame);
  await drawImageSection(ctx, part?._children?.Image, frame);
  drawText(ctx, part, frame);
  ctx.restore();
}

function cloneWithoutFilmstripGenerators(control) {
  const clone = structuredClone(control);
  const generators = clone?._children?.Generators?._children ?? {};
  for (const generator of Object.values(generators)) {
    const type = String(generator?.type ?? '').toLowerCase();
    if (type === 'filmstrip' || type === 'filmstrip-frames') generator.enabled = false;
  }
  return clone;
}

function channelValueAt(control, channelName, normalized) {
  const channel = control?._children?.ValueChannels?._children?.[channelName] ?? null;
  if (!channel) return normalized;
  return denormalizeCustomChannelValue(channel, normalized);
}

function renderControlForFrame(control, valueSource, normalized) {
  const customValues = {
    ...seedCustomValues(control),
    [valueSource]: channelValueAt(control, valueSource, normalized),
  };
  const resolved = resolveInteractiveControl(cloneWithoutFilmstripGenerators(control), {
    enabled: true,
    customValues,
    customNormalizedValue: normalized,
    valueOverrideEnabled: valueSource === 'mainValue',
    valueOverride: customValues[valueSource],
  });
  return resolved?.control ?? control;
}

export function normalizeFilmstripBakeOptions(control, options = {}) {
  const transform = section(control, 'Transform') ?? {};
  const rawFrameWidth = numberOr(options.frameWidth, 0);
  const rawFrameHeight = numberOr(options.frameHeight, 0);
  const frameWidth = Math.max(1, Math.round(rawFrameWidth > 0 ? rawFrameWidth : numberOr(transform.width, 128)));
  const frameHeight = Math.max(1, Math.round(rawFrameHeight > 0 ? rawFrameHeight : numberOr(transform.height, 128)));
  const frameCount = Math.max(1, Math.round(numberOr(options.frameCount, 64)));
  const orientation = String(options.orientation ?? 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
  const outputScale = clamp(numberOr(options.outputScale, 1), 1, 4);
  const outputFrameWidth = Math.max(1, Math.round(frameWidth * outputScale));
  const outputFrameHeight = Math.max(1, Math.round(frameHeight * outputScale));
  const canvasWidth = orientation === 'horizontal' ? outputFrameWidth * frameCount : outputFrameWidth;
  const canvasHeight = orientation === 'horizontal' ? outputFrameHeight : outputFrameHeight * frameCount;
  return {
    name: String(options.name ?? 'bakedFilmstrip').trim() || 'bakedFilmstrip',
    frameWidth,
    frameHeight,
    outputFrameWidth,
    outputFrameHeight,
    frameCount,
    orientation,
    outputScale,
    canvasWidth,
    canvasHeight,
    pixelCount: canvasWidth * canvasHeight,
    estimatedMemoryBytes: canvasWidth * canvasHeight * 4,
    valueSource: String(options.valueSource ?? 'mainValue').trim() || 'mainValue',
    interpolation: String(options.interpolation ?? 'nearest') === 'linear' ? 'linear' : 'nearest',
  };
}

export function estimateFilmstripBake(control, options = {}) {
  const normalized = normalizeFilmstripBakeOptions(control, options);
  const dimensionBlocked = normalized.canvasWidth > FILMSTRIP_BAKE_MAX_DIMENSION || normalized.canvasHeight > FILMSTRIP_BAKE_MAX_DIMENSION;
  const pixelBlocked = normalized.pixelCount > FILMSTRIP_BAKE_MAX_PIXELS;
  const blockReason = dimensionBlocked
    ? `Max ${FILMSTRIP_BAKE_MAX_DIMENSION}px per side`
    : (pixelBlocked ? 'Too many pixels' : '');
  return {
    ...normalized,
    warning: normalized.pixelCount >= FILMSTRIP_BAKE_WARN_PIXELS || dimensionBlocked,
    blocked: dimensionBlocked || pixelBlocked,
    blockReason,
  };
}

export async function bakeCustomComponentFilmstrip(control, options = {}) {
  const normalized = normalizeFilmstripBakeOptions(control, options);
  const estimate = estimateFilmstripBake(control, normalized);
  if (estimate.blocked) {
    throw new Error(`Filmstrip is too large (${normalized.canvasWidth}x${normalized.canvasHeight}). ${estimate.blockReason}. Reduce frames, size, or scale.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = normalized.canvasWidth;
  canvas.height = normalized.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available for filmstrip baking.');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < normalized.frameCount; index += 1) {
    const frameX = normalized.orientation === 'horizontal' ? index * normalized.outputFrameWidth : 0;
    const frameY = normalized.orientation === 'horizontal' ? 0 : index * normalized.outputFrameHeight;
    const frameNormalized = normalized.frameCount <= 1 ? 0 : index / (normalized.frameCount - 1);
    const resolvedControl = renderControlForFrame(control, normalized.valueSource, frameNormalized);
    const parts = Object.entries(resolvedControl?._children?.Parts?._children ?? {})
      .filter(([, part]) => part?.visible !== false)
      .sort((left, right) => numberOr(left?.[1]?.zIndex, 0) - numberOr(right?.[1]?.zIndex, 0));

    ctx.save();
    ctx.translate(frameX, frameY);
    ctx.clearRect(0, 0, normalized.outputFrameWidth, normalized.outputFrameHeight);
    ctx.scale(normalized.outputScale, normalized.outputScale);
    for (const [, part] of parts) {
      await drawPart(ctx, part, normalized.frameWidth, normalized.frameHeight);
    }
    ctx.restore();
  }

  let source = '';
  try {
    source = canvas.toDataURL('image/png');
  } catch (error) {
    throw new Error(`Could not export baked filmstrip. ${error?.message ?? ''}`.trim());
  }

  return {
    _type: 'FilmstripAsset',
    name: normalized.name,
    source,
    frameCount: normalized.frameCount,
    frameWidth: normalized.outputFrameWidth,
    frameHeight: normalized.outputFrameHeight,
    orientation: normalized.orientation,
    interpolation: normalized.interpolation,
    valueSource: normalized.valueSource,
    package: true,
    generated: true,
    generator: 'customComponentBake',
    generatedAt: new Date().toISOString(),
    bake: {
      logicalFrameWidth: normalized.frameWidth,
      logicalFrameHeight: normalized.frameHeight,
      outputScale: normalized.outputScale,
      canvasWidth: normalized.canvasWidth,
      canvasHeight: normalized.canvasHeight,
      pixelCount: normalized.pixelCount,
    },
  };
}
