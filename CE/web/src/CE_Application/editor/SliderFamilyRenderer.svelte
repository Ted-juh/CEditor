<script>
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { resolveSliderSemanticParts } from '../utils/sliderEntityFactory.js';
  import { numberOr, clamp } from '../utils/primitives.js';
  import {
    formatSliderNumericValue,
    formatSliderReadout,
    getSliderGeometry,
    getSliderOrientation,
    getSliderValueMode,
  } from '../utils/sliderBehavior.js';
  import {
    buildSliderLabelAnchors,
    buildSliderTickStops,
    normalizeDegrees,
    resolveCircularArcSweep,
    resolveCircularPoint,
    resolveCircularTrackMetrics,
    resolveLinearPointerPoint,
    resolveLinearTrackFrame,
    sliderNormalizedToAngle,
  } from '../utils/sliderGeometry.js';

  let {
    control = null,
    runtime = null,
    width = 0,
    height = 0,
    partTransitions = null,
    debug = false,
  } = $props();

  function argbToCss(value, fallback = 'rgba(255,255,255,1)') {
    const raw = String(value ?? '').replace(/^#/, '').trim();
    if (raw.length === 8) {
      const alpha = parseInt(raw.slice(0, 2), 16) / 255;
      const rgb = raw.slice(2);
      return `rgba(${parseInt(rgb.slice(0, 2), 16)}, ${parseInt(rgb.slice(2, 4), 16)}, ${parseInt(rgb.slice(4, 6), 16)}, ${alpha.toFixed(3)})`;
    }
    if (raw.length === 6) {
      return `#${raw}`;
    }
    return fallback;
  }

  function describeArcPath(radius, startAngle, sweepAngle, direction, center = null) {
    const safeSweep = clamp(Math.abs(numberOr(sweepAngle, 0)), 0, 359.999);
    const normalizedStart = normalizeDegrees(startAngle);
    const normalizedEnd = normalizeDegrees(direction === 'ccw'
      ? normalizedStart - safeSweep
      : normalizedStart + safeSweep);
    const start = resolveCircularPoint(width, height, normalizedStart, radius, center);
    const end = resolveCircularPoint(width, height, normalizedEnd, radius, center);
    const largeArcFlag = safeSweep > 180 ? 1 : 0;
    const sweepFlag = direction === 'ccw' ? 0 : 1;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  }

  function safeSvgId(value) {
    return String(value ?? 'slider').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function lineBounds(x1, y1, x2, y2, strokeWidth) {
    const pad = (Math.max(1, numberOr(strokeWidth, 0)) / 2) + 1;
    return {
      x: Math.min(x1, x2) - pad,
      y: Math.min(y1, y2) - pad,
      width: Math.abs(x2 - x1) + (pad * 2),
      height: Math.abs(y2 - y1) + (pad * 2),
    };
  }

  function circleBounds(cx, cy, radius, strokeWidth = 0) {
    const pad = (Math.max(0, numberOr(strokeWidth, 0)) / 2) + 1;
    const outerRadius = Math.max(1, numberOr(radius, 0)) + pad;
    return {
      x: cx - outerRadius,
      y: cy - outerRadius,
      width: outerRadius * 2,
      height: outerRadius * 2,
    };
  }

  function arcBounds(center, radius, strokeWidth) {
    return circleBounds(numberOr(center?.x, 0), numberOr(center?.y, 0), radius, strokeWidth);
  }

  function partBorderWidth(part, fallback = 0) {
    const border = part?._children?.Background?._children?.Border ?? null;
    if (border?.enabled === false) return 0;
    return Math.max(0, numberOr(border?.thickness, fallback));
  }

  function partBorderColour(part, fallback = '#000000') {
    return argbToCss(part?._children?.Background?._children?.Border?.colour, fallback);
  }

  function buildTransitionStyle(bucket) {
    if (runtime?.signals?.reducedMotion === true) return '';
    if (runtime?.signals?.dragging === true) return '';
    const transition = bucket?.transform ?? bucket?.size ?? bucket?.opacity ?? '';
    return transition ? `transition: all ${transition};` : '';
  }

  function textTransformForCase(caseMode) {
    const value = String(caseMode ?? 'normal').trim().toLowerCase();
    if (value === 'uppercase') return 'uppercase';
    if (value === 'lowercase') return 'lowercase';
    if (value === 'smallcaps') return 'none';
    return 'none';
  }

  function textDecorationForFont(font) {
    const lines = [];
    if (font?.underline === true) lines.push('underline');
    if (font?.strikethrough === true) lines.push('line-through');
    if (font?.overline === true) lines.push('overline');
    return lines.length ? lines.join(' ') : 'none';
  }

  function buildLabelShadow(textEffects, fallbackColour) {
    const shadows = [];
    if (textEffects?.shadowEnabled === true && String(textEffects?.shadowStyle ?? 'soft') === 'soft') {
      shadows.push([
        `${numberOr(textEffects?.shadowOffsetX, 1)}px`,
        `${numberOr(textEffects?.shadowOffsetY, 1)}px`,
        `${Math.max(0, numberOr(textEffects?.shadowBlur, 2))}px`,
        argbToCss(textEffects?.shadowColour, 'rgba(0,0,0,0.5)'),
      ].join(' '));
    }
    if (textEffects?.glowEnabled === true) {
      shadows.push([
        '0',
        '0',
        `${Math.max(0, numberOr(textEffects?.glowSize, 4))}px`,
        argbToCss(textEffects?.glowColour, argbToCss(fallbackColour, '#FFFFFF')),
      ].join(' '));
    }
    return shadows.join(', ');
  }

  function buildLabelFilter(textEffects) {
    if (textEffects?.blurEnabled === true) {
      return `blur(${Math.max(0, numberOr(textEffects?.blurAmount, 1))}px)`;
    }
    return '';
  }

  function highlightStop(stop, mode, startValue, currentValue, endValue) {
    if (mode === 'single') {
      return stop >= Math.min(startValue, currentValue) && stop <= Math.max(startValue, currentValue);
    }

    if (startValue <= endValue) {
      return stop >= startValue && stop <= endValue;
    }

    return stop >= startValue || stop <= endValue;
  }

  function labelStyle(part, anchor) {
    const text = part?._children?.Text ?? null;
    const fill = text?._children?.Fill ?? null;
    const font = text?._children?.Font ?? null;
    const effects = text?._children?.Effects ?? null;
    const shadow = buildLabelShadow(effects, fill?.colour ?? 'FFFFFFFF');
    const filter = buildLabelFilter(effects);
    // A corner-placed label (utils/sliderGeometry.js placedLabel) hangs from its start or end
    // rather than its centre; the stylesheet's translate is the centred default.
    const align = anchor?.align === 'start' ? 'translate(0, -50%)' : (anchor?.align === 'end' ? 'translate(-100%, -50%)' : '');
    return [
      `left:${numberOr(anchor?.x, 0)}px`,
      `top:${numberOr(anchor?.y, 0)}px`,
      align ? `transform:${align}` : '',
      `color:${argbToCss(fill?.colour, '#FFFFFF')}`,
      `font-family:${JSON.stringify(font?.family ?? 'Arial')}`,
      `font-size:${numberOr(font?.size, 11)}px`,
      `font-weight:${numberOr(font?.weightValue, 600)}`,
      `font-style:${String(font?.style ?? 'Normal').trim().toLowerCase() === 'italic' ? 'italic' : 'normal'}`,
      `letter-spacing:${numberOr(font?.letterSpacing, 0)}px`,
      `word-spacing:${numberOr(font?.wordSpacing, 0)}px`,
      `text-transform:${textTransformForCase(font?.caseMode)}`,
      `font-variant-caps:${String(font?.caseMode ?? '').trim().toLowerCase() === 'smallcaps' ? 'small-caps' : 'normal'}`,
      `text-decoration-line:${textDecorationForFont(font)}`,
      `text-decoration-thickness:${Math.max(1, numberOr(font?.underlineThickness, 1))}px`,
      `text-shadow:${shadow || 'none'}`,
      `filter:${filter || 'none'}`,
      effects?.outlineEnabled === true ? `-webkit-text-stroke:${Math.max(0, numberOr(effects?.outlineThickness ?? effects?.outlineWidth, 1))}px ${argbToCss(effects?.outlineColour, '#000000')}` : '',
      `opacity:${numberOr(part?.opacity, 1)}`,
    ].filter(Boolean).join(';');
  }

  function labelFontSize(part, fallback = 11) {
    return Math.max(1, numberOr(part?._children?.Text?._children?.Font?.size, fallback));
  }

  function labelContent(part, fallback = '') {
    const authored = String(part?._children?.Text?.content ?? '').trim();
    return authored || fallback;
  }

  let behavior = $derived(control?._children?.Behavior ?? null);
  let parts = $derived(resolveSliderSemanticParts(control?._children?.Parts ?? null));
  let signals = $derived(runtime?.signals ?? {});
  let geometry = $derived(getSliderGeometry(behavior));
  let orientation = $derived(getSliderOrientation(behavior));
  let valueMode = $derived(getSliderValueMode(behavior));
  let normalizedValues = $derived({
    start: numberOr(signals?.startValueNormalized, 0),
    current: numberOr(signals?.currentValueNormalized, numberOr(signals?.valueNormalized, 0)),
    end: numberOr(signals?.endValueNormalized, 1),
  });
  let rawValues = $derived({
    start: numberOr(signals?.startValueRaw, 0),
    current: numberOr(signals?.currentValueRaw, numberOr(signals?.valueRaw, 0)),
    end: numberOr(signals?.endValueRaw, 0),
  });
  let showReadout = $derived(behavior?.showValueReadout !== false);
  let showTicks = $derived(behavior?.showTicks !== false);
  let showMinMaxLabels = $derived(behavior?.showMinMaxLabels !== false);
  let showHandleLabels = $derived(behavior?.showHandleLabels === true);
  let trackBasePart = $derived(parts?._children?.bodyTrackBase ?? null);
  let trackFillPart = $derived(parts?._children?.bodyTrackFill ?? null);
  let selectedRangePart = $derived(parts?._children?.bodySelectedRange ?? null);
  let centerMarkerPart = $derived(parts?._children?.bodyCenterMarker ?? null);
  let pointerStartPart = $derived(parts?._children?.pointerStart ?? null);
  let pointerCurrentPart = $derived(parts?._children?.pointerCurrent ?? null);
  let pointerEndPart = $derived(parts?._children?.pointerEnd ?? null);
  let tickMajorPart = $derived(parts?._children?.tickMajor ?? null);
  let tickMinorPart = $derived(parts?._children?.tickMinor ?? null);
  let labelParts = $derived({
    min: parts?._children?.labelMin ?? null,
    max: parts?._children?.labelMax ?? null,
    start: parts?._children?.labelStart ?? null,
    current: parts?._children?.labelCurrent ?? null,
    end: parts?._children?.labelEnd ?? null,
    title: parts?._children?.labelTitle ?? null,
    value: parts?._children?.labelValue ?? null,
    unit: parts?._children?.labelUnit ?? null,
  });
  let labelMetrics = $derived({
    readoutSize: labelFontSize(labelParts.value, 12),
    titleSize: labelFontSize(labelParts.title, 11),
    minMaxSize: Math.max(labelFontSize(labelParts.min, 11), labelFontSize(labelParts.max, 11)),
    handleSize: Math.max(labelFontSize(labelParts.start, 11), labelFontSize(labelParts.current, 11), labelFontSize(labelParts.end, 11)),
  });
  let trackThickness = $derived(numberOr(trackBasePart?._children?.Layout?.height, 10));
  let pointerCurrentSize = $derived(numberOr(pointerCurrentPart?._children?.Layout?.width, 20));
  // The knob's body (utils/sliderEntityFactory.js `bodyCap`): a disc under the pointer, sized as a
  // percentage of the track's diameter or in px, drawn only when the part is visible and the
  // geometry is circular. A set turns it on; a document that never heard of it keeps its arc.
  let bodyCapPart = $derived(parts?._children?.bodyCap ?? null);
  let bodyCapRadius = $derived.by(() => {
    if (geometry !== 'circular' || bodyCapPart?.visible !== true) return 0;
    const layout = bodyCapPart?._children?.Layout ?? {};
    const size = Math.max(0, numberOr(layout.width, 72));
    return String(layout.widthUnit ?? 'percent') === 'px' ? size / 2 : circularMetrics.radius * (size / 100);
  });
  // How the current-value pointer is drawn on a circular track: the dot that rides the arc, or a
  // line / chicken-head drawn from the centre out along the value angle, over the cap.
  let pointerKind = $derived.by(() => {
    const kind = String(pointerCurrentPart?.kind ?? 'dot').toLowerCase();
    return geometry === 'circular' && (kind === 'line' || kind === 'chicken' || kind === 'capdot') ? kind : 'dot';
  });
  let pointerReach = $derived(bodyCapRadius > 0 ? bodyCapRadius : circularMetrics.radius * 0.7);
  // On a linear track a cap (current, start or end) can be the original dot, a fader cap
  // ('bar': a rectangle with a groove), a console cap ('console': the bar with a sheen, the
  // long-throw desk fader), a billet block ('block': the bar with a sheen and an inset top
  // plate, the photographed fader), a lens ('lens': a domed dot lit from inside), a glass dot
  // ('glass': a dot in a halo), a ring, or a line. For the rectangular kinds the pointer's
  // Layout.width is its size ALONG the travel and Layout.height ACROSS the track, whatever the
  // orientation; for the round kinds Layout.width is the diameter. Each cap part may also ask for
  // `sheen` (the cylinder gradient), `shadow` (a drop shadow on the panel), `glow` (a halo in its
  // own colour), and name a `grooveColour` and a `plateColour`. See the boards in
  // docs/design/control-sets.md — these are their fader caps, kind by kind.
  const LINEAR_CAP_KINDS = ['dot', 'bar', 'console', 'block', 'lens', 'glass', 'ring', 'line'];
  function capKindOf(part) {
    const kind = String(part?.kind ?? 'dot').toLowerCase();
    return geometry === 'linear' && LINEAR_CAP_KINDS.includes(kind) ? kind : 'dot';
  }
  const RECT_CAP_KINDS = ['bar', 'console', 'block'];
  function capGeometry(part, point) {
    const kind = capKindOf(part);
    const along = Math.max(2, numberOr(part?._children?.Layout?.width, 20));
    const across = Math.max(2, numberOr(part?._children?.Layout?.height, 20));
    const vertical = orientation === 'vertical';
    if (kind === 'ring') {
      const ring = Math.max(2, across / 4);
      return { kind, r: Math.max(2, (along / 2) - (ring / 2)), stroke: ring };
    }
    if (kind === 'line') {
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      return kind === 'line' && vertical
        ? { kind, x1: point.x - w / 2, y1: point.y, x2: point.x + w / 2, y2: point.y, stroke: along }
        : { kind, x1: point.x, y1: point.y - h / 2, x2: point.x, y2: point.y + h / 2, stroke: along };
    }
    if (!RECT_CAP_KINDS.includes(kind)) return { kind, r: along / 2 };
    const w = vertical ? across : along;
    const h = vertical ? along : across;
    const x = point.x - (w / 2);
    const y = point.y - (h / 2);
    const stroke = Math.max(1.5, Math.min(w, h) * 0.18);
    const rx = kind === 'block' ? Math.min(w, h) * 0.15 : Math.min(w, h) * 0.18;
    // The groove runs across the travel, the length of the cap less a margin at each end; on a
    // block it is shorter, the board's engraved line on the top plate.
    const margin = kind === 'block' ? Math.max(6, Math.min(w, h) * 0.4) : 3;
    const groove = vertical
      ? { x1: x + margin, y1: point.y, x2: x + w - margin, y2: point.y }
      : { x1: point.x, y1: y + margin, x2: point.x, y2: y + h - margin };
    const inset = Math.max(2, Math.min(w, h) * 0.15);
    const plate = { x: x + inset, y: y + inset, w: w - inset * 2, h: h - inset * 2, rx: Math.max(1, rx - 1) };
    return { kind, x, y, w, h, rx, stroke, groove, plate };
  }
  // `glow` and `shadow` are filters in the svg's defs; both need room beyond the shape.
  let capGlowId = $derived(maskIdFor('capGlow'));
  let capShadowId = $derived(maskIdFor('capShadow'));
  let capSheenId = $derived(maskIdFor('capSheen'));
  let capDomeId = $derived(maskIdFor('capDome'));
  let fillGlowId = $derived(maskIdFor('fillGlow'));
  // The track: a slot (an inner shadow along its upper edge, the fader's cut in the plate), a
  // corner radius below a pill's (the boards' square-ended tracks), and a fill inset from the
  // slot's edge (`bodyTrackFill.inset`, px each side — the lit boards' 4 px light in a 10 px
  // slot). None of these change a track that does not ask.
  let trackSlot = $derived(trackBasePart?.slot === true);
  let trackRadius = $derived.by(() => {
    const corners = trackBasePart?._children?.Background?._children?.Corners;
    const r = numberOr(corners?.radius, 999);
    return r < trackThickness / 2 ? Math.max(0, r) : null;
  });
  let fillInset = $derived(Math.max(0, Math.min(trackThickness / 2 - 1, numberOr(trackFillPart?.inset, 0))));
  let fillThickness = $derived(Math.max(1, trackThickness - fillInset * 2));
  let fillGlow = $derived(trackFillPart?.glow === true);
  // A square-ended track is a rect; a pill is the line it always was. Both as a shape for
  // SliderShapeFill and as the attributes of the plain strokes drawn around it.
  function trackShape(x1, y1, x2, y2, thickness) {
    if (trackRadius === null) return { kind: 'line', x1, y1, x2, y2, strokeWidth: thickness, lineCap: 'round' };
    const vertical = orientation === 'vertical';
    return vertical
      ? { kind: 'rect', x: x1 - thickness / 2, y: Math.min(y1, y2), width: thickness, height: Math.abs(y2 - y1), rx: trackRadius }
      : { kind: 'rect', x: Math.min(x1, x2), y: y1 - thickness / 2, width: Math.abs(x2 - x1), height: thickness, rx: trackRadius };
  }
  function radialPointerShape(kind) {
    const angle = (sliderNormalizedToAngle(behavior, normalizedValues.current) * Math.PI) / 180;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const cx = circularCenter.x;
    const cy = circularCenter.y;
    const tip = pointerReach * (numberOr(pointerCurrentPart?._children?.Layout?.height, 88) / 100);
    const thick = Math.max(1, pointerCurrentSize);
    if (kind === 'capdot') {
      // A dot on the cap: width is its diameter, height its distance out, both % of the cap radius.
      const r = Math.max(1.5, pointerReach * (numberOr(pointerCurrentPart?._children?.Layout?.width, 26) / 200));
      return { dot: { cx: cx + ux * tip, cy: cy + uy * tip, r } };
    }
    if (kind === 'line') {
      // Layout.offsetX is where the line starts, as a % of the cap radius (30 unless the set says).
      const r0 = pointerReach * (numberOr(pointerCurrentPart?._children?.Layout?.offsetX, 30) / 100);
      return { line: { x1: cx + ux * r0, y1: cy + uy * r0, x2: cx + ux * tip, y2: cy + uy * tip, width: thick } };
    }
    // A chicken-head: a blunt taper that starts behind the centre and reaches past the cap.
    const px = -uy;
    const py = ux;
    const back = -pointerReach * 0.28;
    const halfBase = thick / 2;
    const halfTip = Math.max(1, thick * 0.22);
    const points = [[back, -halfBase], [tip, -halfTip], [tip, halfTip], [back, halfBase]]
      .map(([r, s]) => `${(cx + ux * r + px * s).toFixed(2)},${(cy + uy * r + py * s).toFixed(2)}`)
      .join(' ');
    return { polygon: { points, stroke: Math.max(1, thick * 0.35) } };
  }
  let pointerStartSize = $derived(numberOr(pointerStartPart?._children?.Layout?.width, 18));
  let pointerEndSize = $derived(numberOr(pointerEndPart?._children?.Layout?.width, 18));
  let maxPointerSize = $derived(Math.max(pointerCurrentSize, pointerStartSize, pointerEndSize));
  let majorTickLength = $derived(numberOr(tickMajorPart?._children?.Layout?.height, numberOr(behavior?.majorTickLength, 12)));
  let minorTickLength = $derived(numberOr(tickMinorPart?._children?.Layout?.height, numberOr(behavior?.minorTickLength, 7)));
  let tickStrokeWidth = $derived(numberOr(tickMajorPart?._children?.Layout?.width, 2));
  let minorTickStrokeWidth = $derived(numberOr(tickMinorPart?._children?.Layout?.width, 1));
  let centerMarkerWidth = $derived(numberOr(centerMarkerPart?._children?.Layout?.width, 2));
  let centerMarkerLength = $derived(numberOr(centerMarkerPart?._children?.Layout?.height, 18));
  let showCenterMarker = $derived(behavior?.showCenterMarker === true && Number.isFinite(Number(behavior?.centerValue)));
  let centerMarkerNormalized = $derived.by(() => {
    const min = numberOr(behavior?.min, 0);
    const max = Math.max(min, numberOr(behavior?.max, min + 1));
    const span = max - min;
    if (!(span > 0)) return 0.5;
    return clamp((numberOr(behavior?.centerValue, min) - min) / span, 0, 1);
  });
  let lineFrame = $derived(resolveLinearTrackFrame(behavior, width, height, trackThickness, maxPointerSize, showReadout, labelMetrics));
  let circularMetrics = $derived(resolveCircularTrackMetrics(width, height, {
    trackThickness,
    pointerSize: maxPointerSize,
    majorTickLength,
    hasTicks: showTicks,
    hasReadout: showReadout,
    circularDiameter: behavior?.circularDiameter,
    labelMetrics,
  }));
  let circularCenter = $derived({
    x: circularMetrics.centerX,
    y: circularMetrics.centerY,
  });
  let labelAnchors = $derived(buildSliderLabelAnchors(behavior, width, height, normalizedValues, {
    trackThickness,
    pointerSize: maxPointerSize,
    hasReadout: showReadout,
    labelMetrics,
  }));
  let tickStops = $derived(buildSliderTickStops(behavior));
  // How a tick is drawn (utils/sliderEntityFactory.js): a line, a dot, the stop's numeral, or a
  // line engraved into the plate. And which major stops draw at all — every one, the two ends, or
  // the ends and the centre (Behavior.tickStops). Minor ticks draw between the majors shown.
  function tickKindOf(part) {
    const kind = String(part?.kind ?? 'line').toLowerCase();
    return ['dot', 'numeral', 'engraved'].includes(kind) ? kind : 'line';
  }
  let majorTickKind = $derived(tickKindOf(tickMajorPart));
  let minorTickKind = $derived(tickKindOf(tickMinorPart));
  // What a numeral tick prints: the stop's index, or the value at the stop in the readout's
  // format with its trailing zeros dropped — a dial reads 0 · 0.5 · 1, not 0.00 · 0.50 · 1.00;
  // the precision is the readout's, and a scale is not a readout.
  function tickNumeral(stop) {
    if (String(behavior?.tickNumerals ?? 'index') !== 'value') return String(stop.index ?? 0);
    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    const text = formatSliderNumericValue(behavior, min + (max - min) * numberOr(stop.normalized, 0));
    return text.replace(/(\.\d*?[1-9])0+(?!\d)|\.0+(?!\d)/g, '$1');
  }
  let majorStopsShown = $derived.by(() => {
    const mode = String(behavior?.tickStops ?? 'all').trim();
    const list = tickStops.major.map((stop, index) => ({ ...stop, index }));
    if (mode === 'ends') return list.filter((stop) => stop.index === 0 || stop.index === list.length - 1);
    if (mode === 'endsCentre') {
      const mid = (list.length - 1) / 2;
      return list.filter((stop) => stop.index === 0 || stop.index === list.length - 1 || Math.abs(stop.index - mid) < 0.75);
    }
    return list;
  });
  let minorStopsShown = $derived.by(() => {
    if (String(behavior?.tickStops ?? 'all').trim() === 'all') return tickStops.minor;
    const shown = new Set(majorStopsShown.map((stop) => stop.index));
    return tickStops.minor.filter((stop) => shown.has(Number(String(stop.key).split('_')[1])));
  });
  let readoutText = $derived(String(signals?.valueDisplay ?? formatSliderReadout(behavior, null)));
  let activeHandleLabel = $derived(String(signals?.activeHandle ?? 'current'));
  let titleText = $derived(String(labelParts.title?._children?.Text?.content ?? control?._children?.Text?.content ?? '').trim());
  let sliderMaskSeed = $derived(safeSvgId(control?._children?.Core?.id ?? 'slider'));
  let singleFillOrigin = $derived(String(behavior?.fillOrigin ?? 'min').trim().toLowerCase() === 'center' ? centerMarkerNormalized : 0);
  let selectionStart = $derived(valueMode === 'single' ? singleFillOrigin : normalizedValues.start);
  let selectionEnd = $derived(valueMode === 'single' ? normalizedValues.current : normalizedValues.end);
  let circularStartAngle = $derived(sliderNormalizedToAngle(behavior, selectionStart));
  let circularEndAngle = $derived(sliderNormalizedToAngle(behavior, selectionEnd));
  let circularSelectionSweep = $derived(resolveCircularArcSweep(behavior, circularStartAngle, circularEndAngle));
  let authoredCircularDirection = $derived(String(behavior?.direction ?? 'cw').trim().toLowerCase() === 'ccw' ? 'ccw' : 'cw');
  let singleFillDirection = $derived(normalizedValues.current >= selectionStart
    ? authoredCircularDirection
    : oppositeDirection(authoredCircularDirection));
  let singleFillSweep = $derived(Math.abs(normalizedValues.current - selectionStart) * numberOr(behavior?.sweepAngle, 270));
  let trackPath = $derived.by(() => {
    if (geometry !== 'circular') return '';
    return describeArcPath(
      circularMetrics.radius,
      numberOr(behavior?.startAngle, 135),
      numberOr(behavior?.sweepAngle, 270),
      authoredCircularDirection,
      circularCenter,
    );
  });
  let fillPath = $derived.by(() => {
    if (geometry !== 'circular') return '';
    return describeArcPath(
      circularMetrics.radius,
      circularStartAngle,
      valueMode === 'single'
        ? singleFillSweep
        : circularSelectionSweep,
      valueMode === 'single' ? singleFillDirection : authoredCircularDirection,
      circularCenter,
    );
  });

  function maskIdFor(name) {
    return `${sliderMaskSeed}-${name}`;
  }

  function linearPointerPoint(role) {
    const normalized = role === 'start'
      ? normalizedValues.start
      : role === 'end'
        ? normalizedValues.end
        : normalizedValues.current;
    const size = role === 'start'
      ? pointerStartSize
      : role === 'end'
        ? pointerEndSize
        : pointerCurrentSize;
    return resolveLinearPointerPoint(behavior, width, height, normalized, trackThickness, size, showReadout, labelMetrics);
  }

  function circularPointerPoint(role) {
    const normalized = role === 'start'
      ? normalizedValues.start
      : role === 'end'
        ? normalizedValues.end
        : normalizedValues.current;
    return resolveCircularPoint(width, height, sliderNormalizedToAngle(behavior, normalized), circularMetrics.radius, circularCenter);
  }

  function linearTickLine(normalized, length) {
    const point = resolveLinearPointerPoint(behavior, width, height, normalized, trackThickness, maxPointerSize, showReadout, labelMetrics);
    const placement = String(behavior?.tickPlacement ?? 'outside').trim().toLowerCase();

    if (orientation === 'vertical') {
      if (placement === 'inside') {
        return {
          x1: point.x - (trackThickness / 2),
          y1: point.y,
          x2: point.x - (trackThickness / 2) - length,
          y2: point.y,
        };
      }
      if (placement === 'cross') {
        return {
          x1: point.x - (length / 2),
          y1: point.y,
          x2: point.x + (length / 2),
          y2: point.y,
        };
      }
      return {
        x1: point.x + (trackThickness / 2),
        y1: point.y,
        x2: point.x + (trackThickness / 2) + length,
        y2: point.y,
      };
    }

    if (placement === 'inside') {
      return {
        x1: point.x,
        y1: point.y - (trackThickness / 2),
        x2: point.x,
        y2: point.y - (trackThickness / 2) - length,
      };
    }
    if (placement === 'cross') {
      return {
        x1: point.x,
        y1: point.y - (length / 2),
        x2: point.x,
        y2: point.y + (length / 2),
      };
    }
    return {
      x1: point.x,
      y1: point.y + (trackThickness / 2),
      x2: point.x,
      y2: point.y + (trackThickness / 2) + length,
    };
  }

  function circularTickLine(angle, length) {
    const placement = String(behavior?.tickPlacement ?? 'outside').trim().toLowerCase();
    let startRadius = circularMetrics.radius + (trackThickness / 2);
    let endRadius = startRadius + length;

    if (placement === 'inside') {
      startRadius = circularMetrics.radius - (trackThickness / 2);
      endRadius = startRadius - length;
    } else if (placement === 'cross') {
      startRadius = circularMetrics.radius - (length / 2);
      endRadius = circularMetrics.radius + (length / 2);
    }

    const start = resolveCircularPoint(width, height, angle, startRadius, circularCenter);
    const end = resolveCircularPoint(width, height, angle, endRadius, circularCenter);
    return {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  }

  function centerMarkerLine() {
    if (!showCenterMarker) return null;
    if (geometry === 'circular') {
      const angle = sliderNormalizedToAngle(behavior, centerMarkerNormalized);
      const start = resolveCircularPoint(width, height, angle, circularMetrics.radius - (centerMarkerLength / 2), circularCenter);
      const end = resolveCircularPoint(width, height, angle, circularMetrics.radius + (centerMarkerLength / 2), circularCenter);
      return {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      };
    }

    const point = resolveLinearPointerPoint(behavior, width, height, centerMarkerNormalized, trackThickness, maxPointerSize, showReadout, labelMetrics);
    if (orientation === 'vertical') {
      return {
        x1: point.x - (centerMarkerLength / 2),
        y1: point.y,
        x2: point.x + (centerMarkerLength / 2),
        y2: point.y,
      };
    }

    return {
      x1: point.x,
      y1: point.y - (centerMarkerLength / 2),
      x2: point.x,
      y2: point.y + (centerMarkerLength / 2),
    };
  }

  function pointerStyleFor(partName) {
    if ([
      'bodyTrackFill',
      'bodySelectedRange',
      'pointerStart',
      'pointerCurrent',
      'pointerEnd',
    ].includes(String(partName))) {
      return '';
    }

    return buildTransitionStyle(partTransitions?.get?.(partName) ?? null);
  }

  function oppositeDirection(direction) {
    return direction === 'ccw' ? 'cw' : 'ccw';
  }
</script>

<div class="slider-family-renderer">
  <svg class="slider-svg" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} width={width} height={height} aria-hidden="true">
    {#snippet tickMark(kind, line, colour, strokeWidth, length, opacity, label)}
      {#if kind === 'dot'}
        <circle cx={(line.x1 + line.x2) / 2} cy={(line.y1 + line.y2) / 2} r={Math.max(1.5, length * 0.45)} fill={colour} opacity={opacity} />
      {:else if kind === 'numeral'}
        <text x={line.x2 + (line.x2 - line.x1) * 0.6} y={line.y2 + (line.y2 - line.y1) * 0.6} text-anchor="middle" dominant-baseline="central"
          font-size={Math.max(6, length * 1.4)} font-weight="700" fill={colour} opacity={opacity}>{label}</text>
      {:else if kind === 'engraved'}
        <line x1={line.x1 + 0.6} y1={line.y1 + 0.8} x2={line.x2 + 0.6} y2={line.y2 + 0.8} stroke="#FFFFFF" stroke-width={strokeWidth} stroke-linecap="round" opacity={opacity * 0.35} />
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={colour} stroke-width={strokeWidth} stroke-linecap="round" opacity={opacity} />
      {:else}
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={colour} stroke-width={strokeWidth} opacity={opacity} />
      {/if}
    {/snippet}

    {#if geometry === 'linear'}
      <defs>
        <!-- The cylinder sheen across a fader cap: light along the near edge, shade along the
             far one, so a flat rectangle reads as a turned or milled block. -->
        <linearGradient id={capSheenId} x1="0" y1="0" x2={orientation === 'vertical' ? 1 : 0} y2={orientation === 'vertical' ? 0 : 1}>
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.38" />
          <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0" />
          <stop offset="0.6" stop-color="#000000" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.4" />
        </linearGradient>
        <radialGradient id={capDomeId} cx="35%" cy="30%" r="70%">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.75" />
          <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.35" />
        </radialGradient>
        <filter id={capGlowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={fillGlowId} x="-20%" y="-300%" width="140%" height="700%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={capShadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.55" />
        </filter>
      </defs>
    {/if}

    <!-- One cap, whatever its kind and whichever handle it is: the part says how it is drawn. -->
    {#snippet linearCap(part, point, name)}
      {@const g = capGeometry(part, point)}
      {@const fill = argbToCss(part?._children?.Background?._children?.Fill?.colour, '#FFFFFF')}
      {@const border = partBorderColour(part, '#333333')}
      {@const borderWidth = partBorderWidth(part, 1)}
      {@const op = numberOr(part?.opacity, 1)}
      {@const groove = argbToCss(part?.grooveColour, border)}
      {@const plate = argbToCss(part?.plateColour, 'rgba(255,255,255,0.22)')}
      {@const styled = pointerStyleFor(name)}
      {#if part?.glow === true}
        {#if g.r !== undefined}
          <circle cx={point.x} cy={point.y} r={g.r * 1.5} fill={fill} opacity={0.5 * op} filter={`url(#${capGlowId})`} style={styled} />
        {:else if g.w !== undefined}
          <rect x={g.x - 4} y={g.y - 4} width={g.w + 8} height={g.h + 8} rx={g.rx + 4} fill={fill} opacity={0.45 * op} filter={`url(#${capGlowId})`} style={styled} />
        {/if}
      {/if}
      {#if g.kind === 'ring'}
        <SliderShapeFill
          background={part?._children?.Background ?? null}
          bounds={circleBounds(point.x, point.y, g.r, g.stroke)}
          shape={{ kind: 'circle-stroke', cx: point.x, cy: point.y, r: g.r, strokeWidth: g.stroke }}
          maskId={maskIdFor(`${name}Ring`)}
          svgWidth={width}
          svgHeight={height}
          opacity={op}
          style={styled}
        />
      {:else if g.kind === 'line'}
        <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={fill} stroke-width={g.stroke} stroke-linecap="round" opacity={op} style={styled} />
      {:else if g.r !== undefined}
        {#if g.kind === 'glass'}
          <circle cx={point.x} cy={point.y} r={g.r * 1.5} fill={fill} opacity={0.18 * op} style={styled} />
        {/if}
        {#if part?.shadow === true}
          <circle cx={point.x} cy={point.y} r={g.r} fill="#000000" opacity={0.001} filter={`url(#${capShadowId})`} style={styled} />
        {/if}
        <SliderShapeFill
          background={part?._children?.Background ?? null}
          bounds={circleBounds(point.x, point.y, g.r)}
          shape={{ kind: 'circle', cx: point.x, cy: point.y, r: g.r }}
          maskId={maskIdFor(name)}
          svgWidth={width}
          svgHeight={height}
          opacity={op}
          style={styled}
        />
        {#if g.kind === 'lens' || part?.sheen === true}
          <circle cx={point.x} cy={point.y} r={g.r} fill={`url(#${capDomeId})`} opacity={op} style={styled} />
        {/if}
        <circle cx={point.x} cy={point.y} r={g.r} fill="none" stroke={border} stroke-width={borderWidth} opacity={op} style={styled} />
        {#if g.kind === 'lens'}
          <!-- Lit from inside: a small source in the groove colour (the set's light), blurred, and its sharp core. -->
          <circle cx={point.x} cy={point.y} r={g.r * 0.6} fill={groove} opacity={0.9 * op} filter={`url(#${capGlowId})`} style={styled} />
          <circle cx={point.x} cy={point.y} r={g.r * 0.42} fill={groove} opacity={op} style={styled} />
          <circle cx={point.x} cy={point.y} r={g.r * 0.16} fill="#FFFFFF" opacity={0.9 * op} style={styled} />
        {/if}
      {:else}
        {#if part?.shadow === true}
          <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.rx} fill="#000000" opacity={0.001} filter={`url(#${capShadowId})`} style={styled} />
        {/if}
        <SliderShapeFill
          background={part?._children?.Background ?? null}
          bounds={{ x: g.x, y: g.y, width: g.w, height: g.h }}
          shape={{ kind: 'rect', x: g.x, y: g.y, width: g.w, height: g.h, rx: g.rx }}
          maskId={maskIdFor(`${name}Bar`)}
          svgWidth={width}
          svgHeight={height}
          opacity={op}
          style={styled}
        />
        {#if g.kind !== 'bar' || part?.sheen === true}
          <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.rx} fill={`url(#${capSheenId})`} opacity={op} style={styled} />
        {/if}
        {#if g.kind === 'block'}
          <rect x={g.plate.x} y={g.plate.y} width={g.plate.w} height={g.plate.h} rx={g.plate.rx} fill={plate} opacity={op} style={styled} />
          <rect x={g.plate.x} y={g.plate.y} width={g.plate.w} height={g.plate.h} rx={g.plate.rx} fill={`url(#${capSheenId})`} opacity={0.6 * op} style={styled} />
        {/if}
        <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.rx} fill="none" stroke={border} stroke-width={borderWidth} opacity={op} style={styled} />
        <line x1={g.groove.x1} y1={g.groove.y1} x2={g.groove.x2} y2={g.groove.y2} stroke={groove} stroke-width={Math.max(1, g.kind === 'block' ? 2 : g.stroke)} stroke-linecap="round" opacity={op * (g.kind === 'block' ? 1 : 0.85)} style={styled} />
      {/if}
    {/snippet}
    {#if geometry === 'linear'}
      {@const trackBase = trackShape(lineFrame.x1, lineFrame.y1, lineFrame.x2, lineFrame.y2, trackThickness)}
      {@const trackEdgeWidth = partBorderWidth(trackBasePart, 0)}
      {#if trackEdgeWidth > 0}
        <!-- The track's edge: the masked fill cannot stroke, so the border is a stroke beneath it. -->
        {#if trackBase.kind === 'line'}
          <line x1={trackBase.x1} y1={trackBase.y1} x2={trackBase.x2} y2={trackBase.y2} stroke={partBorderColour(trackBasePart, '#000000')} stroke-width={trackThickness + trackEdgeWidth * 2} stroke-linecap="round" opacity={numberOr(trackBasePart?.opacity, 1)} />
        {:else}
          <rect x={trackBase.x - trackEdgeWidth} y={trackBase.y - trackEdgeWidth} width={trackBase.width + trackEdgeWidth * 2} height={trackBase.height + trackEdgeWidth * 2} rx={trackBase.rx + trackEdgeWidth} fill={partBorderColour(trackBasePart, '#000000')} opacity={numberOr(trackBasePart?.opacity, 1)} />
        {/if}
      {/if}
      <SliderShapeFill
        background={trackBasePart?._children?.Background ?? null}
        bounds={lineBounds(lineFrame.x1, lineFrame.y1, lineFrame.x2, lineFrame.y2, trackThickness)}
        shape={trackBase}
        maskId={maskIdFor('bodyTrackBase')}
        svgWidth={width}
        svgHeight={height}
        opacity={numberOr(trackBasePart?.opacity, 1)}
        style={pointerStyleFor('bodyTrackBase')}
      />
      {#if trackSlot}
        <!-- The slot's inner shadow: the upper (or left) half of the track in shade, inset so it
             stays inside a pill's rounded ends. -->
        {@const vertical = orientation === 'vertical'}
        {@const q = trackThickness / 4}
        {@const along = trackRadius === null ? q : 0}
        <line
          x1={vertical ? lineFrame.x1 - q : Math.min(lineFrame.x1, lineFrame.x2) + along}
          y1={vertical ? Math.min(lineFrame.y1, lineFrame.y2) + along : lineFrame.y1 - q}
          x2={vertical ? lineFrame.x1 - q : Math.max(lineFrame.x1, lineFrame.x2) - along}
          y2={vertical ? Math.max(lineFrame.y1, lineFrame.y2) - along : lineFrame.y1 - q}
          stroke="#000000" stroke-width={trackThickness / 2} stroke-linecap={trackRadius === null ? 'round' : 'butt'} opacity={0.42 * numberOr(trackBasePart?.opacity, 1)} />
      {/if}
      {#if showCenterMarker}
        {@const centerLine = centerMarkerLine()}
        <line
          x1={centerLine?.x1}
          y1={centerLine?.y1}
          x2={centerLine?.x2}
          y2={centerLine?.y2}
          stroke={argbToCss(centerMarkerPart?._children?.Background?._children?.Fill?.colour, '#FFFFFF')}
          stroke-width={centerMarkerWidth}
          stroke-linecap="round"
          opacity={numberOr(centerMarkerPart?.opacity, 0.6)}
        />
      {/if}
      {#if valueMode === 'single'}
        {@const fillStartPoint = resolveLinearPointerPoint(behavior, width, height, selectionStart, trackThickness, pointerCurrentSize, showReadout, labelMetrics)}
        {@const currentPoint = linearPointerPoint('current')}
        {#if fillGlow}
          <line x1={fillStartPoint.x} y1={fillStartPoint.y} x2={currentPoint.x} y2={currentPoint.y} stroke={argbToCss(trackFillPart?._children?.Background?._children?.Fill?.colour, '#FFFFFF')} stroke-width={fillThickness * 1.8} stroke-linecap="round" opacity={0.55 * numberOr(trackFillPart?.opacity, 1)} filter={`url(#${fillGlowId})`} />
        {/if}
        <SliderShapeFill
          background={trackFillPart?._children?.Background ?? null}
          bounds={lineBounds(fillStartPoint.x, fillStartPoint.y, currentPoint.x, currentPoint.y, fillThickness)}
          shape={trackRadius === null ? {
            kind: 'line',
            x1: fillStartPoint.x,
            y1: fillStartPoint.y,
            x2: currentPoint.x,
            y2: currentPoint.y,
            strokeWidth: fillThickness,
            lineCap: 'round',
          } : trackShape(fillStartPoint.x, fillStartPoint.y, currentPoint.x, currentPoint.y, fillThickness)}
          maskId={maskIdFor('bodyTrackFill')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(trackFillPart?.opacity, 1)}
          style={pointerStyleFor('bodyTrackFill')}
        />
      {:else}
        {@const startPoint = linearPointerPoint('start')}
        {@const endPoint = linearPointerPoint('end')}
        <SliderShapeFill
          background={selectedRangePart?._children?.Background ?? null}
          bounds={lineBounds(startPoint.x, startPoint.y, endPoint.x, endPoint.y, trackThickness)}
          shape={{
            kind: 'line',
            x1: startPoint.x,
            y1: startPoint.y,
            x2: endPoint.x,
            y2: endPoint.y,
            strokeWidth: trackThickness,
            lineCap: 'round',
          }}
          maskId={maskIdFor('bodySelectedRange')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(selectedRangePart?.opacity, 1)}
          style={pointerStyleFor('bodySelectedRange')}
        />
      {/if}

      {#if showTicks}
        {#each minorStopsShown as stop (stop.key)}
          {@const tickLine = linearTickLine(stop.normalized, minorTickLength)}
          {@const highlighted = highlightStop(stop.normalized, valueMode, selectionStart, normalizedValues.current, selectionEnd)}
          {@render tickMark(minorTickKind, tickLine, argbToCss(tickMinorPart?._children?.Background?._children?.Fill?.colour, highlighted ? '#BFE0FF' : '#B0B0B0'), minorTickStrokeWidth, minorTickLength, highlighted ? 0.9 : numberOr(tickMinorPart?.opacity, 0.55), tickNumeral(stop))}
        {/each}
        {#each majorStopsShown as stop (stop.key)}
          {@const tickLine = linearTickLine(stop.normalized, majorTickLength)}
          {@const highlighted = highlightStop(stop.normalized, valueMode, selectionStart, normalizedValues.current, selectionEnd)}
          {@render tickMark(majorTickKind, tickLine, argbToCss(tickMajorPart?._children?.Background?._children?.Fill?.colour, highlighted ? '#FFFFFF' : '#D0D0D0'), tickStrokeWidth, majorTickLength, highlighted ? 1 : numberOr(tickMajorPart?.opacity, 0.95), tickNumeral(stop))}
        {/each}
      {/if}

      {#if valueMode !== 'single'}
        {@render linearCap(pointerStartPart, linearPointerPoint('start'), 'pointerStart')}
      {/if}

      {#if valueMode === 'single' || valueMode === 'band'}
        {@render linearCap(pointerCurrentPart, linearPointerPoint('current'), 'pointerCurrent')}
      {/if}

      {#if valueMode !== 'single'}
        {@render linearCap(pointerEndPart, linearPointerPoint('end'), 'pointerEnd')}
      {/if}
    {:else}
      {#if numberOr(behavior?.sweepAngle, 270) >= 359.5}
        <SliderShapeFill
          background={trackBasePart?._children?.Background ?? null}
          bounds={circleBounds(circularMetrics.centerX, circularMetrics.centerY, circularMetrics.radius, trackThickness)}
          shape={{
            kind: 'circle-stroke',
            cx: circularMetrics.centerX,
            cy: circularMetrics.centerY,
            r: circularMetrics.radius,
            strokeWidth: trackThickness,
          }}
          maskId={maskIdFor('bodyTrackBaseCircle')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(trackBasePart?.opacity, 1)}
          style={pointerStyleFor('bodyTrackBase')}
        />
      {:else}
        <SliderShapeFill
          background={trackBasePart?._children?.Background ?? null}
          bounds={arcBounds(circularCenter, circularMetrics.radius, trackThickness)}
          shape={{
            kind: 'path',
            d: trackPath,
            strokeWidth: trackThickness,
            lineCap: 'round',
          }}
          maskId={maskIdFor('bodyTrackBaseArc')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(trackBasePart?.opacity, 1)}
          style={pointerStyleFor('bodyTrackBase')}
        />
      {/if}
      {#if showCenterMarker}
        {@const centerLine = centerMarkerLine()}
        <line
          x1={centerLine?.x1}
          y1={centerLine?.y1}
          x2={centerLine?.x2}
          y2={centerLine?.y2}
          stroke={argbToCss(centerMarkerPart?._children?.Background?._children?.Fill?.colour, '#FFFFFF')}
          stroke-width={centerMarkerWidth}
          stroke-linecap="round"
          opacity={numberOr(centerMarkerPart?.opacity, 0.6)}
        />
      {/if}

      {#if fillPath}
        <SliderShapeFill
          background={(valueMode === 'single' ? trackFillPart : selectedRangePart)?._children?.Background ?? null}
          bounds={arcBounds(circularCenter, circularMetrics.radius, trackThickness)}
          shape={{
            kind: 'path',
            d: fillPath,
            strokeWidth: trackThickness,
            lineCap: 'round',
          }}
          maskId={maskIdFor(valueMode === 'single' ? 'bodyTrackFillArc' : 'bodySelectedRangeArc')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(valueMode === 'single' ? trackFillPart?.opacity : selectedRangePart?.opacity, 1)}
          style={pointerStyleFor(valueMode === 'single' ? 'bodyTrackFill' : 'bodySelectedRange')}
        />
      {/if}

      {#if showTicks}
        {#each minorStopsShown as stop (stop.key)}
          {@const tickLine = circularTickLine(sliderNormalizedToAngle(behavior, stop.normalized), minorTickLength)}
          {@const highlighted = highlightStop(stop.normalized, valueMode, selectionStart, normalizedValues.current, selectionEnd)}
          {@render tickMark(minorTickKind, tickLine, argbToCss(tickMinorPart?._children?.Background?._children?.Fill?.colour, highlighted ? '#BFE0FF' : '#B0B0B0'), minorTickStrokeWidth, minorTickLength, highlighted ? 0.9 : numberOr(tickMinorPart?.opacity, 0.55), tickNumeral(stop))}
        {/each}
        {#each majorStopsShown as stop (stop.key)}
          {@const tickLine = circularTickLine(sliderNormalizedToAngle(behavior, stop.normalized), majorTickLength)}
          {@const highlighted = highlightStop(stop.normalized, valueMode, selectionStart, normalizedValues.current, selectionEnd)}
          {@render tickMark(majorTickKind, tickLine, argbToCss(tickMajorPart?._children?.Background?._children?.Fill?.colour, highlighted ? '#FFFFFF' : '#D0D0D0'), tickStrokeWidth, majorTickLength, highlighted ? 1 : numberOr(tickMajorPart?.opacity, 0.95), tickNumeral(stop))}
        {/each}
      {/if}

      {#if bodyCapRadius > 0}
        <SliderShapeFill
          background={bodyCapPart?._children?.Background ?? null}
          bounds={circleBounds(circularCenter.x, circularCenter.y, bodyCapRadius)}
          shape={{ kind: 'circle', cx: circularCenter.x, cy: circularCenter.y, r: bodyCapRadius }}
          maskId={maskIdFor('bodyCapCircle')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(bodyCapPart?.opacity, 1)}
          style={pointerStyleFor('bodyCap')}
        />
        <circle
          cx={circularCenter.x}
          cy={circularCenter.y}
          r={bodyCapRadius}
          fill="none"
          stroke={partBorderColour(bodyCapPart, '#333333')}
          stroke-width={partBorderWidth(bodyCapPart, 1)}
          opacity={numberOr(bodyCapPart?.opacity, 1)}
        />
      {/if}

      {#if valueMode !== 'single'}
        {@const startPoint = circularPointerPoint('start')}
        <SliderShapeFill
          background={pointerStartPart?._children?.Background ?? null}
          bounds={circleBounds(startPoint.x, startPoint.y, pointerStartSize / 2)}
          shape={{ kind: 'circle', cx: startPoint.x, cy: startPoint.y, r: pointerStartSize / 2 }}
          maskId={maskIdFor('pointerStartCircle')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(pointerStartPart?.opacity, 1)}
          style={pointerStyleFor('pointerStart')}
        />
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={pointerStartSize / 2}
          fill="none"
          stroke={partBorderColour(pointerStartPart, '#000000')}
          stroke-width={partBorderWidth(pointerStartPart, 1)}
          opacity={numberOr(pointerStartPart?.opacity, 1)}
          style={pointerStyleFor('pointerStart')}
        />
      {/if}

      {#if (valueMode === 'single' || valueMode === 'band') && pointerKind !== 'dot'}
        {@const radial = radialPointerShape(pointerKind)}
        {#if radial.dot}
          <circle
            cx={radial.dot.cx}
            cy={radial.dot.cy}
            r={radial.dot.r}
            fill={argbToCss(pointerCurrentPart?._children?.Background?._children?.Fill?.colour, '#FFFFFF')}
            opacity={numberOr(pointerCurrentPart?.opacity, 1)}
            style={pointerStyleFor('pointerCurrent')}
          />
        {:else if radial.line}
          <line
            x1={radial.line.x1}
            y1={radial.line.y1}
            x2={radial.line.x2}
            y2={radial.line.y2}
            stroke={argbToCss(pointerCurrentPart?._children?.Background?._children?.Fill?.colour, '#FFFFFF')}
            stroke-width={radial.line.width}
            stroke-linecap="round"
            opacity={numberOr(pointerCurrentPart?.opacity, 1)}
            style={pointerStyleFor('pointerCurrent')}
          />
        {:else}
          <polygon
            points={radial.polygon.points}
            fill={argbToCss(pointerCurrentPart?._children?.Background?._children?.Fill?.colour, '#1C1A17')}
            stroke={argbToCss(pointerCurrentPart?._children?.Background?._children?.Fill?.colour, '#1C1A17')}
            stroke-width={radial.polygon.stroke}
            stroke-linejoin="round"
            opacity={numberOr(pointerCurrentPart?.opacity, 1)}
            style={pointerStyleFor('pointerCurrent')}
          />
        {/if}
      {:else if valueMode === 'single' || valueMode === 'band'}
        {@const currentCircularPoint = circularPointerPoint('current')}
        <SliderShapeFill
          background={pointerCurrentPart?._children?.Background ?? null}
          bounds={circleBounds(currentCircularPoint.x, currentCircularPoint.y, pointerCurrentSize / 2)}
          shape={{ kind: 'circle', cx: currentCircularPoint.x, cy: currentCircularPoint.y, r: pointerCurrentSize / 2 }}
          maskId={maskIdFor('pointerCurrentCircle')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(pointerCurrentPart?.opacity, 1)}
          style={pointerStyleFor('pointerCurrent')}
        />
        <circle
          cx={currentCircularPoint.x}
          cy={currentCircularPoint.y}
          r={pointerCurrentSize / 2}
          fill="none"
          stroke={partBorderColour(pointerCurrentPart, '#333333')}
          stroke-width={partBorderWidth(pointerCurrentPart, 1)}
          opacity={numberOr(pointerCurrentPart?.opacity, 1)}
          style={pointerStyleFor('pointerCurrent')}
        />
      {/if}

      {#if valueMode !== 'single'}
        {@const endPoint = circularPointerPoint('end')}
        <SliderShapeFill
          background={pointerEndPart?._children?.Background ?? null}
          bounds={circleBounds(endPoint.x, endPoint.y, pointerEndSize / 2)}
          shape={{ kind: 'circle', cx: endPoint.x, cy: endPoint.y, r: pointerEndSize / 2 }}
          maskId={maskIdFor('pointerEndCircle')}
          svgWidth={width}
          svgHeight={height}
          opacity={numberOr(pointerEndPart?.opacity, 1)}
          style={pointerStyleFor('pointerEnd')}
        />
        <circle
          cx={endPoint.x}
          cy={endPoint.y}
          r={pointerEndSize / 2}
          fill="none"
          stroke={partBorderColour(pointerEndPart, '#202020')}
          stroke-width={partBorderWidth(pointerEndPart, 1)}
          opacity={numberOr(pointerEndPart?.opacity, 1)}
          style={pointerStyleFor('pointerEnd')}
        />
      {/if}
    {/if}
  </svg>

  {#if showReadout}
    <div class="slider-label slider-readout" style={labelStyle(labelParts.value, labelAnchors.value)}>
      {labelContent(labelParts.value, readoutText)}
    </div>
  {/if}

  {#if titleText}
    <div class="slider-label slider-title" style={labelStyle(labelParts.title, labelAnchors.title)}>
      {titleText}
    </div>
  {/if}

  {#if showMinMaxLabels}
    <div class="slider-label" style={labelStyle(labelParts.min, labelAnchors.min)}>
      {labelContent(labelParts.min, formatSliderNumericValue(behavior, numberOr(behavior?.min, 0)))}
    </div>
    <div class="slider-label" style={labelStyle(labelParts.max, labelAnchors.max)}>
      {labelContent(labelParts.max, formatSliderNumericValue(behavior, numberOr(behavior?.max, 1)))}
    </div>
  {/if}

  {#if showHandleLabels && valueMode !== 'single'}
    <div class="slider-label" style={labelStyle(labelParts.start, labelAnchors.start)}>
      {labelContent(labelParts.start, formatSliderNumericValue(behavior, rawValues.start))}
    </div>
    {#if valueMode === 'band'}
      <div class="slider-label" style={labelStyle(labelParts.current, labelAnchors.current)}>
        {labelContent(labelParts.current, formatSliderNumericValue(behavior, rawValues.current))}
      </div>
    {/if}
    <div class="slider-label" style={labelStyle(labelParts.end, labelAnchors.end)}>
      {labelContent(labelParts.end, formatSliderNumericValue(behavior, rawValues.end))}
    </div>
  {:else if showHandleLabels}
    <div class="slider-label" style={labelStyle(labelParts.current, labelAnchors.current)}>
      {labelContent(labelParts.current, formatSliderNumericValue(behavior, rawValues.current))}
    </div>
  {/if}

  {#if debug}
    <div class="slider-debug-chip">{geometry} / {valueMode} / {activeHandleLabel}</div>
  {/if}
</div>

<style>
  .slider-family-renderer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }

  .slider-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .slider-label {
    position: absolute;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    line-height: 1;
    letter-spacing: 0.08px;
    pointer-events: none;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
  }

  .slider-readout {
    text-align: center;
  }

  .slider-title {
    text-align: center;
    letter-spacing: 0.2px;
  }

  .slider-debug-chip {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 3px 6px;
    border-radius: 999px;
    background: rgba(9, 71, 113, 0.92);
    color: #FFF;
    font-size: 9px;
    line-height: 1;
    text-transform: uppercase;
    pointer-events: none;
  }
</style>
