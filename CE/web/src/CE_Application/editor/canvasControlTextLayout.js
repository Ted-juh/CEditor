/**
 * Pure text layout for CanvasControl: canvas-2d measurement, wrapping,
 * block layout (with shrink-to-fit), and custom text-flow glyph placement
 * (line / stair / arc / wave / spiral / path modes). Uses an offscreen
 * canvas for measuring but reads no component scope or stores.
 */

import { numberOr } from '../utils/primitives.js';
import {
  lineBaseOffsetFor, lineCanvasFont, lineColourFor, lineLayerFor,
  normalizeLastLineAlign, normalizeScriptMode, normalizeTextFlowMode,
  scriptScaleForMode,
} from './canvasControlStyles.js';
import {
  arcPathData, degToRad, distanceBetweenPoints, glyphBoundsAt,
  leftNormalForVector, normalizedPathPointToLocal, offsetPolylinePoints,
  pathPointsFromSetting, perimeterPathPoints, pointAlongPolyline,
  polylineLength, polylinePathData, sampleBezierPoints, trimPolylinePoints,
} from './canvasControlTextGeometry.js';

/** Ascent/descent of a font at its section size, measured via canvas 2d. */
export function measureFontMetrics(fontSection, familyName, sampleText = 'Hg') {
  const fontSize = Math.max(1, numberOr(fontSection?.size, 12) * scriptScaleForMode(normalizeScriptMode(fontSection?.scriptMode)));
  const fallback = {
    ascent: fontSize * 0.8,
    descent: fontSize * 0.2,
  };

  if (typeof document === 'undefined') return fallback;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return fallback;

  const fontStyle = fontSection?.style === 'Italic' ? 'italic' : 'normal';
  const fontWeight = numberOr(fontSection?.weightValue, fontSection?.weight === 'Bold' ? 700 : 400);
  const resolvedSample = String(sampleText ?? '').replace(/\s+/g, '') || 'Hg';

  context.font = `${fontStyle} ${fontWeight} ${fontSize}px "${familyName || 'Arial'}"`;
  const metrics = context.measureText(resolvedSample);

  return {
    ascent: Math.max(0, metrics.actualBoundingBoxAscent || fallback.ascent),
    descent: Math.max(0, metrics.actualBoundingBoxDescent || fallback.descent),
  };
}

export function measureCanvasLineWidth(ctx, line, letterSpacing, wordSpacing = 0, fontSize = 12) {
  let width = 0;
  const chars = Array.from(line ?? '');
  for (let i = 0; i < chars.length; i += 1) {
    width += measureGlyphAdvance(ctx, chars[i], fontSize, wordSpacing);
    if (i < chars.length - 1) width += letterSpacing;
  }
  return width;
}

export function measureGlyphAdvance(ctx, char, fontSize, wordSpacing = 0) {
  if (!char) return 0;
  const measured = ctx ? ctx.measureText(char).width : 0;
  const baseAdvance = measured > 0
    ? measured
    : (char === ' ' ? fontSize * 0.35 : fontSize * 0.6);
  return baseAdvance + (/\s/.test(char) ? wordSpacing : 0);
}

export function trimLineToEllipsis(ctx, line, maxWidth, letterSpacing, wordSpacing, fontSize) {
  if (maxWidth <= 0) return '';

  const ellipsis = '...';
  if (measureCanvasLineWidth(ctx, ellipsis, letterSpacing, wordSpacing, fontSize) > maxWidth) {
    return '';
  }

  const chars = Array.from(line ?? '');
  while (chars.length > 0) {
    const candidate = `${chars.join('').replace(/\s+$/u, '')}${ellipsis}`;
    if (measureCanvasLineWidth(ctx, candidate, letterSpacing, wordSpacing, fontSize) <= maxWidth) {
      return candidate;
    }
    chars.pop();
  }

  return ellipsis;
}

export function wrapLineByCharacters(ctx, line, maxWidth, letterSpacing, wordSpacing, fontSize) {
  if (line == null || line === '') return [''];
  if (maxWidth <= 0) return [String(line)];

  const chars = Array.from(String(line));
  const lines = [];
  let current = '';

  for (const char of chars) {
    const candidate = `${current}${char}`;
    if (current && measureCanvasLineWidth(ctx, candidate, letterSpacing, wordSpacing, fontSize) > maxWidth) {
      lines.push(current);
      current = char;
      continue;
    }
    current = candidate;
  }

  if (current || lines.length === 0) lines.push(current);
  return lines;
}

export function wrapLineByWords(ctx, line, maxWidth, letterSpacing, wordSpacing, fontSize) {
  if (line == null || line === '') return [''];
  if (maxWidth <= 0) return [String(line)];

  const tokens = String(line).match(/\S+|\s+/gu) ?? [String(line)];
  const lines = [];
  let current = '';
  let pendingWhitespace = '';

  const pushCurrent = () => {
    lines.push(current.replace(/\s+$/u, ''));
    current = '';
  };

  for (const token of tokens) {
    if (/\s/u.test(token)) {
      if (current) pendingWhitespace += token;
      continue;
    }

    const candidate = current ? `${current}${pendingWhitespace}${token}` : token;
    if (measureCanvasLineWidth(ctx, candidate, letterSpacing, wordSpacing, fontSize) <= maxWidth) {
      current = candidate;
      pendingWhitespace = '';
      continue;
    }

    if (current) pushCurrent();

    if (measureCanvasLineWidth(ctx, token, letterSpacing, wordSpacing, fontSize) <= maxWidth) {
      current = token;
    } else {
      const broken = wrapLineByCharacters(ctx, token, maxWidth, letterSpacing, wordSpacing, fontSize);
      lines.push(...broken.slice(0, -1));
      current = broken.at(-1) ?? '';
    }

    pendingWhitespace = '';
  }

  if (current || lines.length === 0) lines.push(current.replace(/\s+$/u, ''));
  return lines;
}

export function wrapBlockTextLine(ctx, line, maxWidth, wrapMode, letterSpacing, wordSpacing, fontSize) {
  if (wrapMode === 'none') return [String(line ?? '')];
  return wrapMode === 'character'
    ? wrapLineByCharacters(ctx, line, maxWidth, letterSpacing, wordSpacing, fontSize)
    : wrapLineByWords(ctx, line, maxWidth, letterSpacing, wordSpacing, fontSize);
}

export function normalizeParagraphMode(value) {
  return value === 'justify' || value === 'fill' ? 'justify' : 'normal';
}

export function countWhitespaceCharacters(line) {
  return Array.from(String(line ?? '')).filter((char) => /\s/u.test(char)).length;
}

/** Extra word spacing for justified lines; last lines justify only when asked. */
export function resolveBlockLineJustification(line, width, maxWidth, paragraphMode, {
  isParagraphLast = true,
  isLastVisibleLine = true,
  justifyLastLine = false,
} = {}) {
  const mode = normalizeParagraphMode(paragraphMode);
  const availableWidth = Math.max(0, maxWidth);
  const remainingWidth = availableWidth - Math.max(0, width);
  const shouldJustify = mode === 'justify' && (!isParagraphLast || (justifyLastLine && isLastVisibleLine));

  if (!shouldJustify || availableWidth <= 0 || remainingWidth <= 0.01) {
    return {
      fillWidthApplied: false,
      extraWordSpacing: 0,
      extraLetterSpacing: 0,
      visualWidth: Math.max(0, width),
    };
  }

  const whitespaceCount = countWhitespaceCharacters(line);
  if (whitespaceCount <= 0) {
    return {
      fillWidthApplied: false,
      extraWordSpacing: 0,
      extraLetterSpacing: 0,
      visualWidth: Math.max(0, width),
    };
  }

  return {
    fillWidthApplied: false,
    extraWordSpacing: remainingWidth / whitespaceCount,
    extraLetterSpacing: 0,
    visualWidth: availableWidth,
  };
}

/** Wrap, truncate, and measure block text; returns per-line entries plus totals. */
export function buildBlockTextLayout(content, {
  fontSection = null,
  family = 'Arial',
  maxWidth = 0,
  forceLineBoxWidth = false,
  wrapMode = 'word',
  paragraphMode = 'normal',
  justifyLastLine = false,
  lastLineAlign = 'inherit',
  overflowMode = 'clip',
  maxLines = 0,
  lineHeightMultiplier = 1.2,
} = {}) {
  const fontSize = Math.max(1, numberOr(fontSection?.size, 12) * scriptScaleForMode(normalizeScriptMode(fontSection?.scriptMode)));
  const letterSpacing = numberOr(fontSection?.letterSpacing, 0);
  const wordSpacing = numberOr(fontSection?.wordSpacing, 0);
  const lineHeight = Math.max(1, fontSize * Math.max(0.5, numberOr(lineHeightMultiplier, 1.2)));
  const sourceLines = String(content ?? '').split(/\r\n|\r|\n/u);
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  if (ctx) ctx.font = lineCanvasFont(fontSection, family);

  const wrappedEntries = sourceLines.flatMap((line) => {
    const wrappedLines = wrapBlockTextLine(ctx, line, maxWidth, wrapMode, letterSpacing, wordSpacing, fontSize);
    const safeLines = wrappedLines.length > 0 ? wrappedLines : [''];
    return safeLines.map((wrappedLine, index) => ({
      text: wrappedLine,
      isParagraphLast: index === safeLines.length - 1,
    }));
  });
  let lineEntries = wrappedEntries.length > 0 ? wrappedEntries : [{ text: '', isParagraphLast: true }];
  let truncated = false;
  const normalizedMaxLines = Math.max(0, Math.round(numberOr(maxLines, 0)));

  if (normalizedMaxLines > 0 && lineEntries.length > normalizedMaxLines) {
    truncated = true;
    lineEntries = lineEntries.slice(0, normalizedMaxLines);
    if (overflowMode === 'ellipsis' && lineEntries.length > 0) {
      const lastEntry = lineEntries[lineEntries.length - 1];
      lineEntries[lineEntries.length - 1] = {
        ...lastEntry,
        isParagraphLast: true,
        text: trimLineToEllipsis(
          ctx,
          lastEntry.text,
          maxWidth,
          letterSpacing,
          wordSpacing,
          fontSize
        ),
      };
    }
  } else if (overflowMode === 'ellipsis' && wrapMode === 'none' && maxWidth > 0) {
    lineEntries = lineEntries.map((entry) => ({
      ...entry,
      text: measureCanvasLineWidth(ctx, entry.text, letterSpacing, wordSpacing, fontSize) > maxWidth
        ? trimLineToEllipsis(ctx, entry.text, maxWidth, letterSpacing, wordSpacing, fontSize)
        : entry.text,
    }));
  }

  const lines = lineEntries.map((entry) => entry.text);
  const widths = lines.map((line) => measureCanvasLineWidth(ctx, line, letterSpacing, wordSpacing, fontSize));
  const normalizedParagraphMode = normalizeParagraphMode(paragraphMode);
  const stretchedLineEntries = lineEntries.map((entry, index) => {
    const fillWidth = resolveBlockLineJustification(entry.text, widths[index], maxWidth, normalizedParagraphMode, {
      isParagraphLast: entry.isParagraphLast,
      isLastVisibleLine: index === lineEntries.length - 1,
      justifyLastLine,
    });
    return {
      ...entry,
      width: widths[index],
      align: index === lineEntries.length - 1 ? normalizeLastLineAlign(lastLineAlign) : 'inherit',
      ...fillWidth,
    };
  });
  const lineBoxWidth = forceLineBoxWidth && maxWidth > 0 ? maxWidth : 0;
  const visualWidths = stretchedLineEntries.map((entry) => (lineBoxWidth > 0 ? lineBoxWidth : entry.visualWidth));

  return {
    lines,
    lineEntries: stretchedLineEntries,
    renderedContent: lines.join('\n'),
    width: visualWidths.length > 0 ? Math.max(...visualWidths) : 0,
    lineBoxWidth,
    height: lines.length * lineHeight,
    lineHeight,
    truncated,
  };
}

/**
 * Block layout plus shrink-to-fit: binary-searches a scale so the re-wrapped
 * text fits maxWidth x maxHeight. Returns { layout, fitScale }.
 */
export function buildBlockTextLayoutState(content, {
  fontSection = null,
  family = 'Arial',
  maxWidth = 0,
  maxHeight = 0,
  forceLineBoxWidth = false,
  wrapMode = 'word',
  paragraphMode = 'normal',
  justifyLastLine = false,
  lastLineAlign = 'inherit',
  overflowMode = 'clip',
  maxLines = 0,
  fitMode = 'none',
  lineHeightMultiplier = 1.2,
} = {}) {
  const layoutArgs = {
    fontSection,
    family,
    maxWidth,
    forceLineBoxWidth,
    wrapMode,
    paragraphMode,
    justifyLastLine,
    lastLineAlign,
    overflowMode,
    maxLines,
    lineHeightMultiplier,
  };

  const baseLayout = buildBlockTextLayout(content, layoutArgs);
  const safeWidth = Math.max(0.0001, maxWidth);
  const safeHeight = Math.max(0.0001, maxHeight);
  const baseScale = fitMode === 'shrink'
    ? Math.min(1, safeWidth / Math.max(0.0001, baseLayout.width), safeHeight / Math.max(0.0001, baseLayout.height))
    : 1;

  if (
    fitMode !== 'shrink'
    || maxWidth <= 0
    || maxHeight <= 0
    || baseScale >= 0.999
  ) {
    return {
      layout: baseLayout,
      fitScale: baseScale,
    };
  }

  let low = Math.max(0.01, baseScale);
  let high = 1;
  let bestScale = baseScale;
  let bestLayout = baseLayout;

  const initialLayout = buildBlockTextLayout(content, {
    ...layoutArgs,
    maxWidth: maxWidth / low,
  });
  const initialFits = (initialLayout.width * low) <= (maxWidth + 0.5)
    && (initialLayout.height * low) <= (maxHeight + 0.5);

  if (initialFits) {
    bestLayout = initialLayout;
    bestScale = low;
  } else {
    return {
      layout: baseLayout,
      fitScale: baseScale,
    };
  }

  for (let iteration = 0; iteration < 14; iteration += 1) {
    const mid = (low + high) / 2;
    const candidateLayout = buildBlockTextLayout(content, {
      ...layoutArgs,
      maxWidth: maxWidth / mid,
    });
    const scaledWidth = candidateLayout.width * mid;
    const scaledHeight = candidateLayout.height * mid;
    const fits = scaledWidth <= (maxWidth + 0.5) && scaledHeight <= (maxHeight + 0.5);

    if (fits) {
      bestScale = mid;
      bestLayout = candidateLayout;
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    layout: bestLayout,
    fitScale: bestScale,
  };
}

/** Per-glyph advances for a flow line under natural / fixed / fit / justify distribution. */
export function distributeGlyphAdvances(chars, widths, totalAdvance, distributionMode, availableLength, fixedAdvance, letterSpacing, wordSpacing) {
  const normalized = String(distributionMode ?? 'natural');
  const advances = chars.map((char, index) => ({
    width: widths[index] ?? 0,
    advance: (widths[index] ?? 0) + (index < chars.length - 1 ? letterSpacing : 0),
    isWhitespace: /\s/u.test(char),
  }));

  if (normalized === 'fixed') {
    const fixed = Math.max(1, numberOr(fixedAdvance, 0) || (advances[0]?.width ?? 1));
    return advances.map((entry) => ({ ...entry, advance: fixed }));
  }

  if (normalized === 'fit' && availableLength > 0 && totalAdvance > 0) {
    const ratio = availableLength / totalAdvance;
    return advances.map((entry) => ({ ...entry, advance: entry.advance * ratio, width: entry.width * ratio }));
  }

  if (normalized === 'justify' && availableLength > totalAdvance) {
    const whitespaceCount = advances.filter((entry) => entry.isWhitespace).length;
    if (whitespaceCount > 0) {
      const extraPerSpace = (availableLength - totalAdvance) / whitespaceCount;
      return advances.map((entry) => ({
        ...entry,
        advance: entry.advance + (entry.isWhitespace ? extraPerSpace : 0),
      }));
    }
  }

  return advances;
}

export function mergeIntervals(intervals, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  const safeIntervals = Array.isArray(intervals)
    ? intervals
      .map((interval) => ({
        start: Math.max(minimum, Math.min(maximum, numberOr(interval?.start, minimum))),
        end: Math.max(minimum, Math.min(maximum, numberOr(interval?.end, minimum))),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start)
    : [];

  const merged = [];
  for (const interval of safeIntervals) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

export function buildVisibleRanges(totalLength, trimStart = 0, trimEnd = 0, glyphs = [], gap = 0) {
  const safeLength = Math.max(0, numberOr(totalLength, 0));
  const startDistance = Math.max(0, Math.min(safeLength, numberOr(trimStart, 0)));
  const endDistance = Math.max(startDistance, safeLength - Math.max(0, numberOr(trimEnd, 0)));
  if (endDistance - startDistance <= 0.0001) return [];
  return [{ start: startDistance, end: endDistance }];
}

/** Underline/strikethrough/overline paths that follow a custom flow layout. */
export function buildCustomFlowDecorationFor(kind, layout, fontSection, fillSection) {
  if (!fontSection?.[kind] || !layout?.lineEntries?.length) return null;

  const thickness = Math.max(1, numberOr(fontSection?.[`${kind}Thickness`], 1));
  const insetLeft = Math.max(0, numberOr(fontSection?.[`${kind}InsetLeft`], 0));
  const insetRight = Math.max(0, numberOr(fontSection?.[`${kind}InsetRight`], 0));
  const colour = lineColourFor(kind, fontSection, fillSection);
  const gap = Math.max(0, numberOr(fontSection?.[`${kind}Gap`], 0));
  const layer = lineLayerFor(kind, fontSection);
  const offsetDistance = lineBaseOffsetFor(kind, fontSection) + numberOr(fontSection?.[`${kind}Offset`], 0);
  const paths = [];

  for (const lineEntry of layout.lineEntries) {
    if (!lineEntry) continue;

    if (Array.isArray(lineEntry.points) && lineEntry.points.length > 1) {
      const pathPoints = offsetPolylinePoints(lineEntry.points, offsetDistance);
      const totalLength = polylineLength(pathPoints);
      const visibleRanges = buildVisibleRanges(totalLength, insetLeft, insetRight, lineEntry.glyphs, gap);
      for (const range of visibleRanges) {
        const trimmedPoints = trimPolylinePoints(pathPoints, range.start, totalLength - range.end);
        const d = polylinePathData(trimmedPoints);
        if (d) paths.push({ d });
      }
      continue;
    }

    if (lineEntry.mode === 'arc' || lineEntry.mode === 'circle') {
      const sweepSign = Math.sign(lineEntry.sweepRadians || 1) || 1;
      const decorationRadius = Math.max(0.001, lineEntry.radius - (offsetDistance * sweepSign));
      const totalLength = Math.abs(lineEntry.sweepRadians) * decorationRadius;
      const visibleRanges = buildVisibleRanges(totalLength, insetLeft, insetRight, lineEntry.glyphs, gap);
      for (const range of visibleRanges) {
        const startRadians = lineEntry.startRadians + ((range.start / decorationRadius) * sweepSign);
        const endRadians = lineEntry.startRadians + ((range.end / decorationRadius) * sweepSign);
        const d = arcPathData(decorationRadius, startRadians, endRadians);
        if (d) paths.push({ d });
      }
    }
  }

  if (paths.length === 0) return null;
  return { paths, colour, thickness, layer, gap };
}

/**
 * Place glyphs along the requested flow (line, stair, arc, circle, vertical,
 * wave, zigzag, spiral, perimeter, polyline, freehand, bezier). Returns
 * { glyphs, lineEntries, lineHeight, bounds } in box-local coordinates.
 */
export function buildCustomTextFlowLayout(lines, {
  mode = 'rotate',
  angle = 0,
  stepX = 8,
  stepY = 8,
  radius = 48,
  sweep = 180,
  wordSpacing = 0,
  distribution = 'natural',
  facing = 'path',
  side = 'center',
  reverse = false,
  startOffset = 0,
  fixedAdvance = 0,
  amplitude = 18,
  frequency = 1,
  turns = 2,
  perimeterInset = 0,
  stairUnit = 'character',
  boxWidth = 100,
  boxHeight = 40,
  polylinePoints = null,
  freehandPoints = null,
  bezierPoints = null,
  lineHeight = null,
  fontSection = null,
  family = 'Arial',
} = {}) {
  const safeLines = Array.isArray(lines) && lines.length > 0 ? lines : [''];
  const fontSize = Math.max(1, numberOr(fontSection?.size, 12) * scriptScaleForMode(normalizeScriptMode(fontSection?.scriptMode)));
  const letterSpacing = numberOr(fontSection?.letterSpacing, 0);
  const effectiveLineHeight = Math.max(1, numberOr(lineHeight, fontSize * 1.2));
  const normalizedMode = normalizeTextFlowMode(mode);
  const angleDegrees = numberOr(angle, 0);
  const stepHorizontal = numberOr(stepX, Math.max(6, fontSize * 0.6));
  const stepVertical = numberOr(stepY, Math.max(6, fontSize * 0.45));
  const baseRadius = Math.max(fontSize, numberOr(radius, Math.max(18, fontSize * 3)));
  const arcSweepDegrees = normalizedMode === 'circle' ? 360 : numberOr(sweep, 180);
  const distributionMode = String(distribution ?? 'natural');
  const facingMode = String(facing ?? 'path');
  const sideOffsetBase = side === 'inside' ? -(fontSize * 0.35) : (side === 'outside' ? fontSize * 0.35 : 0);
  const startOffsetValue = Math.max(0, numberOr(startOffset, 0));
  const fixedAdvanceValue = Math.max(0, numberOr(fixedAdvance, 0));
  const spiralTurns = Math.max(0.1, numberOr(turns, 2));
  const waveAmplitude = Math.max(0, numberOr(amplitude, Math.max(6, fontSize)));
  const waveFrequency = Math.max(0.1, numberOr(frequency, 1));
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  if (ctx) ctx.font = lineCanvasFont(fontSection, family);

  const glyphs = [];
  const lineEntries = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const registerGlyph = (glyph) => {
    glyphs.push(glyph);
    const bounds = glyphBoundsAt(glyph.x, glyph.y, glyph.width, glyph.height, glyph.rotation);
    minX = Math.min(minX, bounds.left);
    maxX = Math.max(maxX, bounds.right);
    minY = Math.min(minY, bounds.top);
    maxY = Math.max(maxY, bounds.bottom);
  };

  const lineCount = Math.max(1, safeLines.length);

  const glyphRotationForVector = (tangentX, tangentY) => {
    const tangentDegrees = (Math.atan2(tangentY, tangentX) * 180) / Math.PI;
    if (facingMode === 'upright') return 0;
    if (facingMode === 'inward') return tangentDegrees + 90;
    if (facingMode === 'outward') return tangentDegrees - 90;
    return tangentDegrees;
  };

  const unitsForLine = (line) => {
    if (normalizedMode === 'stair' && String(stairUnit) === 'word') {
      return String(line ?? '').match(/\S+\s*/gu) ?? [''];
    }
    if (normalizedMode === 'stair' && String(stairUnit) === 'line') {
      return [String(line ?? '')];
    }
    return Array.from(String(line ?? ''));
  };

  const unitWidth = (unit) => {
    return measureCanvasLineWidth(ctx, unit, letterSpacing, wordSpacing, fontSize);
  };

  const placeAlongPolyline = (pathPoints, units, widths, lineOffset = 0, lineIndex = 0, modeName = normalizedMode) => {
    const safePoints = Array.isArray(pathPoints) ? pathPoints.filter(Boolean) : [];
    if (safePoints.length < 2) {
      lineEntries.push({ mode: modeName, lineIndex, points: safePoints, glyphs: [], lineOffset, totalAdvance: 0 });
      return;
    }

    const path = reverse === true ? [...safePoints].reverse() : safePoints;
    const totalAdvance = widths.reduce((sum, width, index) => (
      sum + width + (index < widths.length - 1 ? letterSpacing : 0)
    ), 0);
    const pathLength = polylineLength(path);
    const distributed = distributeGlyphAdvances(units, widths, totalAdvance, distributionMode, Math.max(0, pathLength - startOffsetValue), fixedAdvanceValue, letterSpacing, wordSpacing);
    const distributedAdvance = distributed.reduce((sum, entry) => sum + entry.advance, 0);
    const centeredStart = (distributionMode === 'natural' || distributionMode === 'fixed')
      ? Math.max(0, ((pathLength - distributedAdvance) / 2) + startOffsetValue)
      : startOffsetValue;
    let cursor = centeredStart;
    const lineGlyphs = [];

    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index] ?? '';
      const entry = distributed[index] ?? { width: widths[index] ?? 0, advance: widths[index] ?? 0 };
      const centerDistance = cursor + (entry.width / 2);
      const point = pointAlongPolyline(path, centerDistance);
      const normal = leftNormalForVector(point.tangentX, point.tangentY);
      const sideOffset = sideOffsetBase + lineOffset;
      registerGlyph({
        char: unit,
        x: point.x + (normal.x * sideOffset),
        y: point.y + (normal.y * sideOffset),
        width: entry.width,
        height: effectiveLineHeight,
        rotation: glyphRotationForVector(point.tangentX, point.tangentY),
        pathPosition: centerDistance,
        render: unit.trim().length > 0,
      });
      lineGlyphs.push(glyphs[glyphs.length - 1]);
      cursor += entry.advance;
    }

    lineEntries.push({
      mode: modeName,
      lineIndex,
      points: path,
      glyphs: lineGlyphs,
      lineOffset,
      totalAdvance: distributedAdvance,
    });
  };

  for (let lineIndex = 0; lineIndex < safeLines.length; lineIndex += 1) {
    const line = safeLines[lineIndex] ?? '';
    const units = unitsForLine(line);
    const widths = units.map((unit) => unitWidth(unit));
    const totalAdvance = widths.reduce((sum, width, index) => sum + width + (index < widths.length - 1 ? letterSpacing : 0), 0);
    const lineOffset = (lineIndex - ((lineCount - 1) / 2)) * effectiveLineHeight;
    const lineGlyphs = [];

    if (normalizedMode === 'line') {
      const angleRadians = degToRad(angleDegrees);
      const dirX = Math.cos(angleRadians);
      const dirY = Math.sin(angleRadians);
      const normal = leftNormalForVector(dirX, dirY);
      const span = Math.max(totalAdvance + (fontSize * 2), Math.hypot(boxWidth, boxHeight));
      placeAlongPolyline([
        { x: (-dirX * span / 2) + (normal.x * lineOffset), y: (-dirY * span / 2) + (normal.y * lineOffset) },
        { x: (dirX * span / 2) + (normal.x * lineOffset), y: (dirY * span / 2) + (normal.y * lineOffset) },
      ], units, widths, 0, lineIndex, 'line');
      continue;
    }

    if (normalizedMode === 'stair') {
      let cursor = 0;
      for (let index = 0; index < units.length; index += 1) {
        const char = units[index] ?? '';
        const width = widths[index] ?? 0;
        registerGlyph({
          char,
          x: cursor + (width / 2) + (index * stepHorizontal),
          y: lineOffset + (index * stepVertical),
          width,
          height: effectiveLineHeight,
          rotation: 0,
          pathPosition: 0,
          render: char.trim().length > 0,
        });
        lineGlyphs.push(glyphs[glyphs.length - 1]);
        cursor += width + (index < units.length - 1 ? letterSpacing : 0);
      }
      const linePoints = [];
      if (lineGlyphs.length > 0) {
        const pushStepPoint = (x, y) => {
          const lastPoint = linePoints[linePoints.length - 1];
          if (lastPoint && distanceBetweenPoints(lastPoint, { x, y }) <= 0.0001) return;
          linePoints.push({ x, y });
        };

        const firstGlyph = lineGlyphs[0];
        const startX = firstGlyph.x - (firstGlyph.width / 2);
        const endX = lineGlyphs[lineGlyphs.length - 1].x + (lineGlyphs[lineGlyphs.length - 1].width / 2);
        const transitionXs = [];
        for (let index = 0; index < lineGlyphs.length - 1; index += 1) {
          const glyph = lineGlyphs[index];
          const nextGlyph = lineGlyphs[index + 1];
          const currentRight = glyph.x + (glyph.width / 2);
          const nextLeft = nextGlyph.x - (nextGlyph.width / 2);
          transitionXs.push(currentRight + ((nextLeft - currentRight) / 2) - 7);
        }
        pushStepPoint(startX, firstGlyph.y);

        for (let index = 0; index < lineGlyphs.length; index += 1) {
          const glyph = lineGlyphs[index];
          const nextGlyph = lineGlyphs[index + 1];
          if (!nextGlyph) {
            pushStepPoint(endX, glyph.y);
            continue;
          }

          const transitionX = transitionXs[index];
          pushStepPoint(transitionX, glyph.y);
          pushStepPoint(transitionX, nextGlyph.y);
        }

        let pathCursor = 0;
        for (let index = 0; index < lineGlyphs.length; index += 1) {
          const glyph = lineGlyphs[index];
          const previousTransitionX = index === 0
            ? startX
            : transitionXs[index - 1];
          const nextTransitionX = index === lineGlyphs.length - 1
            ? endX
            : transitionXs[index];
          glyph.pathPosition = Math.max(0, pathCursor + (glyph.x - previousTransitionX));
          pathCursor += Math.max(0, nextTransitionX - previousTransitionX);
          if (index < lineGlyphs.length - 1) {
            pathCursor += Math.abs(lineGlyphs[index + 1].y - glyph.y);
          }
        }
      }
      lineEntries.push({
        mode: 'stair',
        lineIndex,
        points: linePoints,
        glyphs: lineGlyphs,
        lineOffset,
        totalAdvance,
      });
      continue;
    }

    if (normalizedMode === 'vertical') {
      const span = Math.max(totalAdvance + effectiveLineHeight, boxHeight);
      placeAlongPolyline([
        { x: lineOffset, y: -span / 2 },
        { x: lineOffset, y: span / 2 },
      ], units, widths, 0, lineIndex, 'vertical');
      continue;
    }

    if (normalizedMode === 'wave') {
      const span = Math.max(totalAdvance + fontSize, boxWidth);
      const points = Array.from({ length: 81 }, (_, index) => {
        const ratio = index / 80;
        return {
          x: -span / 2 + (ratio * span),
          y: lineOffset + (Math.sin(ratio * Math.PI * 2 * waveFrequency) * waveAmplitude),
        };
      });
      placeAlongPolyline(points, units, widths, 0, lineIndex, 'wave');
      continue;
    }

    if (normalizedMode === 'zigzag') {
      const span = Math.max(totalAdvance + fontSize, boxWidth);
      const points = [];
      const segments = Math.max(2, Math.round(waveFrequency * 6));
      for (let index = 0; index <= segments; index += 1) {
        const ratio = index / segments;
        points.push({
          x: -span / 2 + (ratio * span),
          y: lineOffset + (((index % 2 === 0) ? -1 : 1) * waveAmplitude),
        });
      }
      placeAlongPolyline(points, units, widths, 0, lineIndex, 'zigzag');
      continue;
    }

    if (normalizedMode === 'arc' || normalizedMode === 'circle') {
      const lineRadius = Math.max(fontSize, baseRadius + lineOffset);
      const sweepRadians = degToRad(arcSweepDegrees) * (reverse === true ? -1 : 1);
      const startDegrees = normalizedMode === 'circle' ? angleDegrees : angleDegrees - (arcSweepDegrees / 2);
      const startRadians = degToRad(startDegrees);
      const pathLength = Math.abs(sweepRadians) * lineRadius;
      const distributed = distributeGlyphAdvances(units, widths, totalAdvance, distributionMode, Math.max(0, pathLength - startOffsetValue), fixedAdvanceValue, letterSpacing, wordSpacing);
      const distributedAdvance = distributed.reduce((sum, entry) => sum + entry.advance, 0);
      let cursor = (distributionMode === 'natural' || distributionMode === 'fixed')
        ? Math.max(0, ((pathLength - distributedAdvance) / 2) + startOffsetValue)
        : startOffsetValue;

      for (let index = 0; index < units.length; index += 1) {
        const char = units[index] ?? '';
        const entry = distributed[index] ?? { width: widths[index] ?? 0, advance: widths[index] ?? 0 };
        const centerDistance = cursor + (entry.width / 2);
        const ratio = pathLength > 0 ? (centerDistance / Math.max(1, pathLength)) : 0.5;
        const glyphAngle = startRadians + (sweepRadians * ratio);
        const pathPosition = pathLength * ratio;
        const radialOffset = sideOffsetBase;
        const tangentX = -Math.sin(glyphAngle);
        const tangentY = Math.cos(glyphAngle);
        registerGlyph({
          char,
          x: Math.cos(glyphAngle) * (lineRadius + radialOffset),
          y: Math.sin(glyphAngle) * (lineRadius + radialOffset),
          width: entry.width,
          height: effectiveLineHeight,
          rotation: glyphRotationForVector(tangentX, tangentY),
          pathPosition,
          angleRadians: glyphAngle,
          render: char.trim().length > 0,
        });
        lineGlyphs.push(glyphs[glyphs.length - 1]);
        cursor += entry.advance;
      }
      lineEntries.push({
        mode: normalizedMode,
        lineIndex,
        glyphs: lineGlyphs,
        radius: lineRadius,
        lineOffset,
        totalAdvance,
        startRadians,
        sweepRadians,
        endRadians: startRadians + sweepRadians,
      });
      continue;
    }

    if (normalizedMode === 'spiral') {
      const totalLength = Math.max(totalAdvance + (fontSize * 2), boxWidth);
      const points = Array.from({ length: 161 }, (_, index) => {
        const ratio = index / 160;
        const angleRadians = degToRad(angleDegrees) + (ratio * Math.PI * 2 * spiralTurns);
        const spiralRadius = (baseRadius * ratio) + lineOffset;
        return {
          x: Math.cos(angleRadians) * spiralRadius,
          y: Math.sin(angleRadians) * spiralRadius,
        };
      });
      placeAlongPolyline(points, units, widths, 0, lineIndex, 'spiral');
      continue;
    }

    if (normalizedMode === 'perimeter') {
      placeAlongPolyline(perimeterPathPoints(boxWidth, boxHeight, perimeterInset), units, widths, 0, lineIndex, 'perimeter');
      continue;
    }

    if (normalizedMode === 'polyline') {
      placeAlongPolyline(pathPointsFromSetting(polylinePoints, boxWidth, boxHeight), units, widths, 0, lineIndex, 'polyline');
      continue;
    }

    if (normalizedMode === 'freehand') {
      placeAlongPolyline(pathPointsFromSetting(freehandPoints, boxWidth, boxHeight), units, widths, 0, lineIndex, 'freehand');
      continue;
    }

    if (normalizedMode === 'bezier') {
      const start = normalizedPathPointToLocal(bezierPoints?.start ?? { x: 0, y: 50 }, boxWidth, boxHeight);
      const c1 = normalizedPathPointToLocal(bezierPoints?.c1 ?? { x: 33, y: 0 }, boxWidth, boxHeight);
      const c2 = normalizedPathPointToLocal(bezierPoints?.c2 ?? { x: 66, y: 100 }, boxWidth, boxHeight);
      const end = normalizedPathPointToLocal(bezierPoints?.end ?? { x: 100, y: 50 }, boxWidth, boxHeight);
      placeAlongPolyline(sampleBezierPoints(start, c1, c2, end, 120), units, widths, 0, lineIndex, 'bezier');
      continue;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return {
      glyphs,
      lineEntries,
      lineHeight: effectiveLineHeight,
      bounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: effectiveLineHeight,
        width: 0,
        height: effectiveLineHeight,
        centerX: 0,
        centerY: effectiveLineHeight / 2,
      },
    };
  }

  return {
    glyphs,
    lineEntries,
    lineHeight: effectiveLineHeight,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    },
  };
}
