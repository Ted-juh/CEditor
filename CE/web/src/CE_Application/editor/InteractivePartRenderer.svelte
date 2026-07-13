<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';
  import { polygonPoints, polygonToSvgPoints } from '../utils/shapeGeometry.js';

  let {
    part = null,
    parentWidth = 0,
    parentHeight = 0,
    transitionBucket = null,
    debug = false,
    editableInput = null,
    oneditableinput = null,
    oneditablekeydown = null,
    oneditablefocus = null,
    oneditableblur = null,
  } = $props();

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, numberOr(value, min)));
  }

  function cssColour(value, fallback = '#5B9BD5') {
    const raw = String(value ?? '').trim();
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const alpha = parseInt(raw.slice(0, 2), 16) / 255;
      const red = parseInt(raw.slice(2, 4), 16);
      const green = parseInt(raw.slice(4, 6), 16);
      const blue = parseInt(raw.slice(6, 8), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return raw || fallback;
  }

  function resolveUnit(value, unit, total) {
    const numeric = numberOr(value, 0);
    return String(unit ?? 'px') === 'percent'
      ? (total * numeric) / 100
      : numeric;
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

  function buildTransitionStyle(bucket) {
    const rules = [];
    if (bucket?.transform) rules.push(`transform ${bucket.transform}`);
    if (bucket?.opacity) rules.push(`opacity ${bucket.opacity}`);
    if (bucket?.size) {
      rules.push(`width ${bucket.size}`);
      rules.push(`height ${bucket.size}`);
    }
    return rules.length ? `transition:${rules.join(', ')};` : '';
  }

  let layout = $derived(part?._children?.Layout ?? null);
  let background = $derived(part?._children?.Background ?? null);
  let backgroundFill = $derived(background?._children?.Fill ?? null);
  let backgroundBorder = $derived(background?._children?.Border ?? null);
  let simpleBackgroundKind = $derived(String(part?.kind ?? '').trim().toLowerCase());
  let effects = $derived(part?._children?.Effects ?? null);
  let text = $derived(part?._children?.Text ?? null);
  let image = $derived(part?._children?.Image ?? null);
  let textFill = $derived(text?._children?.Fill ?? null);
  let textFont = $derived(text?._children?.Font ?? null);
  let textPosition = $derived(text?._children?.Position ?? null);
  let valueArc = $derived(part?.meta?.valueArc ?? null);
  let arcTrack = $derived(part?.meta?.arcTrack ?? part?.meta?.ringArc ?? null);
  let envelopePath = $derived(part?.meta?.envelopePath ?? null);
  let waveformIcon = $derived(part?.meta?.waveformIcon ?? null);
  let rendersValueArc = $derived(
    String(part?.kind ?? '').toLowerCase() === 'valuearc'
    || String(part?.meta?.renderer ?? '').toLowerCase() === 'valuearc'
  );
  let rendersArcTrack = $derived(
    ['arctrack', 'ringarc'].includes(String(part?.kind ?? '').toLowerCase())
    || ['arctrack', 'ringarc'].includes(String(part?.meta?.renderer ?? '').toLowerCase())
  );
  let rendersEnvelopePath = $derived(
    String(part?.kind ?? '').toLowerCase() === 'envelopepath'
    || String(part?.meta?.renderer ?? '').toLowerCase() === 'envelopepath'
  );
  let rendersWaveformIcon = $derived(
    String(part?.kind ?? '').toLowerCase() === 'waveformicon'
    || String(part?.meta?.renderer ?? '').toLowerCase() === 'waveformicon'
  );
  let usesSimpleBackground = $derived(
    background
    && !rendersArcTrack
    && ['circle', 'ring', 'capsule'].includes(simpleBackgroundKind)
  );

  // Flat vector polygons (triangle, star, hexagon, …) render as a single SVG
  // <polygon> using the part's fill + border, instead of the CSS background.
  let polygonVerts = $derived(polygonPoints(part?.kind));
  let rendersPolygon = $derived(!!polygonVerts);
  let rendersLine = $derived(simpleBackgroundKind === 'line');
  let rendersVectorShape = $derived(rendersPolygon || rendersLine);

  let frame = $derived.by(() => {
    if (!layout) {
      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
    }

    if (String(layout.mode ?? 'absolute') === 'fill') {
      return {
        left: 0,
        top: 0,
        width: parentWidth,
        height: parentHeight,
      };
    }

    const width = resolveUnit(layout.width, layout.widthUnit, parentWidth);
    const height = resolveUnit(layout.height, layout.heightUnit, parentHeight);
    const x = resolveUnit(layout.x, layout.xUnit, parentWidth);
    const y = resolveUnit(layout.y, layout.yUnit, parentHeight);
    const offsetX = numberOr(layout.offsetX, 0);
    const offsetY = numberOr(layout.offsetY, 0);

    return {
      left: x - anchorOffset(layout.anchorX, width) + offsetX,
      top: y - anchorOffset(layout.anchorY, height) + offsetY,
      width,
      height,
    };
  });

  let partScale = $derived(Math.max(0.01, numberOr(layout?.scale, 1)));
  let partRotation = $derived(numberOr(layout?.rotation, 0));
  let shadowCSS = $derived(buildShadowCSS(effects));
  let blendCSS = $derived(buildBlendCSS(effects));
  let filterCSS = $derived(buildFilterCSS(effects));
  let partStyle = $derived.by(() => {
    const transforms = [];
    if (Math.abs(partRotation) > 0.001) transforms.push(`rotate(${partRotation}deg)`);
    if (Math.abs(partScale - 1) > 0.001) transforms.push(`scale(${partScale})`);

    return [
      `left:${frame.left}px`,
      `top:${frame.top}px`,
      `width:${frame.width}px`,
      `height:${frame.height}px`,
      `opacity:${numberOr(part?.opacity, 1)}`,
      `z-index:${numberOr(part?.zIndex, 0)}`,
      `overflow:${part?.clipChildren === true || editableInput ? 'hidden' : 'visible'}`,
      transforms.length ? `transform:${transforms.join(' ')}; transform-origin:${numberOr(layout?.pivotX, 50)}% ${numberOr(layout?.pivotY, 50)}%` : '',
      buildTransitionStyle(transitionBucket),
      shadowCSS,
      blendCSS,
      filterCSS,
    ].filter(Boolean).join('; ');
  });

  function justifyContentFor(value) {
    switch (String(value ?? 'centred').toLowerCase()) {
      case 'left':
      case 'near':
        return 'flex-start';
      case 'right':
      case 'far':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  let textStyle = $derived.by(() => {
    if (!text) return '';

    return [
      `color:#${String(textFill?.colour ?? 'FFFFFFFF').slice(-6)}`,
      `font-family:${textFont?.family ?? 'Arial'}`,
      `font-size:${numberOr(textFont?.size, 12)}px`,
      `font-weight:${numberOr(textFont?.weightValue, 400)}`,
      `font-style:${String(textFont?.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal'}`,
      `justify-content:${justifyContentFor(textPosition?.justification)}`,
      'align-items:center',
      'display:flex',
      // The part Background renders as position:absolute fill layers, which are
      // positioned descendants. A non-positioned text block would be painted
      // *under* them (CSS paint order), hiding the glyphs. Promote the text to
      // its own positioned level so it always draws above the fill.
      'position:relative',
      'z-index:2',
      'height:100%',
      'line-height:1',
      'padding:0 8px',
      'text-align:center',
      'white-space:nowrap',
      'width:100%',
      'box-sizing:border-box',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'pointer-events:none',
      `text-transform:${String(textFont?.caseMode ?? 'normal').toLowerCase() === 'uppercase' ? 'uppercase' : (String(textFont?.caseMode ?? 'normal').toLowerCase() === 'lowercase' ? 'lowercase' : 'none')}`,
    ].join('; ');
  });

  let inputStyle = $derived.by(() => {
    if (!editableInput) return '';

    return [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'border:none',
      'outline:none',
      'background:transparent',
      'box-sizing:border-box',
      'padding:0 8px',
      `color:#${String(textFill?.colour ?? 'FFFFFFFF').slice(-6)}`,
      `font-family:${textFont?.family ?? 'Arial'}`,
      `font-size:${numberOr(textFont?.size, 12)}px`,
      `font-weight:${numberOr(textFont?.weightValue, 400)}`,
      `font-style:${String(textFont?.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal'}`,
      `text-align:${justifyContentFor(textPosition?.justification) === 'flex-start' ? 'left' : (justifyContentFor(textPosition?.justification) === 'flex-end' ? 'right' : 'center')}`,
      'line-height:1',
      'pointer-events:auto',
    ].join('; ');
  });

  let imageStyle = $derived.by(() => {
    if (!image) return '';
    const source = String(image?.source ?? '');
    const mode = String(image?.mode ?? 'image');
    const orientation = String(image?.orientation ?? 'vertical');
    const frameCount = Math.max(1, Math.round(numberOr(image?.frameCount, 1)));
    const frameIndex = Math.max(0, Math.min(frameCount - 1, Math.round(numberOr(image?.frameIndex, 0))));
    const rendering = String(image?.interpolation ?? 'nearest') === 'nearest' ? 'pixelated' : 'auto';

    const rules = [
      'position:absolute',
      'inset:0',
      source ? `background-image:url("${source.replaceAll('"', '\\"')}")` : '',
      'background-repeat:no-repeat',
      `image-rendering:${rendering}`,
    ];

    if (mode === 'filmstrip') {
      if (orientation === 'horizontal') {
        rules.push(`background-size:${frameCount * 100}% 100%`);
        rules.push(`background-position:${frameCount <= 1 ? 0 : (frameIndex / (frameCount - 1)) * 100}% 0%`);
      } else {
        rules.push(`background-size:100% ${frameCount * 100}%`);
        rules.push(`background-position:0% ${frameCount <= 1 ? 0 : (frameIndex / (frameCount - 1)) * 100}%`);
      }
    } else {
      rules.push(`background-size:${String(image?.fit ?? 'cover')}`);
      rules.push('background-position:center center');
    }

    return rules.filter(Boolean).join('; ');
  });

  let valueArcStyle = $derived.by(() => {
    if (!rendersValueArc) return '';

    const size = Math.max(1, Math.min(frame.width, frame.height));
    const thickness = clampNumber(valueArc?.thickness, 1, size / 2);
    const value = clampNumber(valueArc?.value, 0, 1);
    const sweepAngle = clampNumber(valueArc?.sweepAngle, 0, 360);
    const startAngle = numberOr(valueArc?.startAngle, -135);
    const hasRange = valueArc?.startValue !== undefined || valueArc?.endValue !== undefined;
    const rangeStartValue = hasRange ? clampNumber(valueArc?.startValue, 0, 1) : 0;
    const rangeEndValue = hasRange ? clampNumber(valueArc?.endValue, rangeStartValue, 1) : value;
    const renderedStartAngle = startAngle + (sweepAngle * rangeStartValue);
    const filledAngle = Math.max(0.001, sweepAngle * Math.max(0, rangeEndValue - rangeStartValue));
    const colour = cssColour(valueArc?.colour ?? background?._children?.Border?.colour, '#5B9BD5');

    return [
      `background:conic-gradient(from ${renderedStartAngle}deg, ${colour} 0deg ${filledAngle}deg, transparent ${filledAngle}deg 360deg)`,
      `-webkit-mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
      `mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
    ].join('; ');
  });

  let arcSvgData = $derived.by(() => {
    if (!rendersArcTrack) return null;
    const size = Math.max(1, Math.min(frame.width, frame.height));
    const thickness = clampNumber(arcTrack?.thickness ?? backgroundBorder?.thickness, 1, size / 2);
    const r = Math.max(0.5, size / 2 - thickness / 2);
    const sweepAngle = clampNumber(arcTrack?.sweepAngle, 0, 360);
    const direction = String(arcTrack?.direction ?? 'cw').trim().toLowerCase() === 'ccw' ? 'ccw' : 'cw';
    const startAngle = numberOr(arcTrack?.startAngle, -135);
    const renderedStartAngle = direction === 'ccw' ? startAngle - sweepAngle : startAngle;
    const cap = arcTrack?.cap === 'round' ? 'round' : 'butt';
    const colour = cssColour(arcTrack?.colour ?? backgroundBorder?.colour ?? backgroundFill?.colour, '#2B3742');
    const circumference = 2 * Math.PI * r;
    const arcLength = circumference * Math.min(sweepAngle, 359.99) / 360;
    // SVG 0° = 3-o'clock; CSS conic 0° = 12-o'clock → subtract 90 to align
    const rotation = renderedStartAngle - 90;
    return { size, r, thickness, arcLength, circumference, rotation, cap, colour };
  });

  let simpleBackgroundStyle = $derived.by(() => {
    if (!usesSimpleBackground) return '';

    const fillEnabled = backgroundFill?.solidEnabled !== false;
    const borderEnabled = backgroundBorder?.enabled === true && numberOr(backgroundBorder?.thickness, 0) > 0;
    const fillColour = fillEnabled ? cssColour(backgroundFill?.colour ?? '00000000', 'transparent') : 'transparent';
    const borderColour = borderEnabled ? cssColour(backgroundBorder?.colour ?? 'FFFFFFFF', '#FFFFFF') : 'transparent';
    const borderWidth = borderEnabled ? Math.max(0, numberOr(backgroundBorder?.thickness, 1)) : 0;

    return [
      'position:absolute',
      'inset:0',
      'box-sizing:border-box',
      'border-radius:9999px',
      `background:${fillColour}`,
      borderWidth > 0 ? `border:${borderWidth}px solid ${borderColour}` : 'border:none',
    ].join('; ');
  });

  let vectorShapeSvg = $derived.by(() => {
    if (!rendersVectorShape) return null;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const fillEnabled = backgroundFill?.solidEnabled !== false;
    const borderEnabled = backgroundBorder?.enabled === true && numberOr(backgroundBorder?.thickness, 0) > 0;
    const strokeWidth = borderEnabled ? Math.max(1, numberOr(backgroundBorder?.thickness, 1)) : 0;
    const fill = fillEnabled ? cssColour(backgroundFill?.colour ?? '00000000', 'transparent') : 'none';
    const stroke = borderEnabled ? cssColour(backgroundBorder?.colour ?? 'FFFFFFFF', '#FFFFFF') : 'none';

    if (rendersLine) {
      // A line/divider has no area: paint the border as a centered stroke,
      // falling back to the fill colour or white when no border is set.
      const lineStroke = stroke !== 'none'
        ? stroke
        : (fillEnabled ? cssColour(backgroundFill?.colour ?? 'FFFFFFFF', '#FFFFFF') : '#FFFFFF');
      const lineWidth = strokeWidth > 0 ? strokeWidth : 2;
      return {
        width, height, points: '',
        line: { x1: 0, y1: height / 2, x2: width, y2: height / 2, stroke: lineStroke, width: lineWidth },
      };
    }

    const inset = strokeWidth / 2;
    return {
      width, height, fill, stroke, strokeWidth,
      points: polygonToSvgPoints(polygonVerts, width, height, inset),
      line: null,
    };
  });

  let envelopeSvg = $derived.by(() => {
    if (!rendersEnvelopePath) return { d: '', fillD: '', stroke: '#65E6A0', fill: 'transparent', strokeWidth: 3 };
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const padX = clampNumber(envelopePath?.padX, 0, width / 3);
    const padY = clampNumber(envelopePath?.padY, 0, height / 3);
    const innerWidth = Math.max(1, width - (padX * 2));
    const bottom = Math.max(padY + 1, height - padY);
    const top = padY;
    const normalizedPoints = Array.isArray(envelopePath?.points) ? envelopePath.points : [];
    const points = normalizedPoints.length >= 2
      ? normalizedPoints.map((point) => {
        const x = clampNumber(point?.x, 0, 1);
        const y = clampNumber(point?.y, 0, 1);
        return [
          padX + (innerWidth * x),
          bottom - ((bottom - top) * y),
        ];
      })
      : (() => {
        const attack = clampNumber(envelopePath?.attack, 0, 1);
        const decay = clampNumber(envelopePath?.decay, 0, 1);
        const sustain = clampNumber(envelopePath?.sustain, 0, 1);
        const release = clampNumber(envelopePath?.release, 0, 1);
        const attackX = padX + Math.max(12, innerWidth * (0.12 + attack * 0.18));
        const sustainX = Math.min(width - padX - 36, attackX + Math.max(22, innerWidth * (0.12 + decay * 0.16)));
        const releaseX = Math.max(sustainX + 28, width - padX - Math.max(20, innerWidth * (0.08 + release * 0.22)));
        const sustainY = bottom - ((bottom - top) * sustain);
        return [
          [padX, bottom],
          [attackX, top],
          [sustainX, sustainY],
          [releaseX, sustainY],
          [width - padX, bottom],
        ];
      })();
    const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const firstX = points[0]?.[0] ?? padX;
    const lastX = points.at(-1)?.[0] ?? (width - padX);
    const fillD = `${d} L ${lastX.toFixed(2)} ${bottom.toFixed(2)} L ${firstX.toFixed(2)} ${bottom.toFixed(2)} Z`;
    return {
      d,
      fillD,
      stroke: cssColour(envelopePath?.stroke ?? 'FF65E6A0', '#65E6A0'),
      fill: cssColour(envelopePath?.fill ?? '2265E6A0', 'rgba(101,230,160,0.12)'),
      strokeWidth: clampNumber(envelopePath?.strokeWidth, 1, 12),
    };
  });

  function waveformPath(type, left, right, top, bottom, mid) {
    const width = right - left;
    if (type === 'saw') {
      return `M ${left} ${bottom} L ${right} ${top} L ${right} ${bottom}`;
    }
    if (type === 'square') {
      return `M ${left} ${bottom} L ${left} ${top} L ${left + width * 0.5} ${top} L ${left + width * 0.5} ${bottom} L ${right} ${bottom}`;
    }
    if (type === 'noise') {
      const amplitude = Math.max(2, (bottom - top) * 0.42);
      const points = [
        [left, mid],
        [left + width * 0.12, mid - amplitude * 0.65],
        [left + width * 0.23, mid + amplitude * 0.35],
        [left + width * 0.34, mid - amplitude * 0.2],
        [left + width * 0.46, mid + amplitude * 0.78],
        [left + width * 0.58, mid - amplitude * 0.72],
        [left + width * 0.7, mid + amplitude * 0.08],
        [left + width * 0.82, mid - amplitude * 0.36],
        [right, mid],
      ];
      return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${clampNumber(x, left, right).toFixed(2)} ${clampNumber(y, top, bottom).toFixed(2)}`).join(' ');
    }
    return `M ${left} ${mid} C ${left + width * 0.25} ${top}, ${left + width * 0.25} ${top}, ${left + width * 0.5} ${mid} C ${left + width * 0.75} ${bottom}, ${left + width * 0.75} ${bottom}, ${right} ${mid}`;
  }

  let waveformSvg = $derived.by(() => {
    if (!rendersWaveformIcon) return { d: '', tileD: '', tiles: [], stroke: '#EAF0F6', strokeWidth: 3, animate: false, animationMode: 'scroll', durationMs: 900 };
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const pad = Math.max(2, Math.min(width, height) * 0.16);
    const left = pad;
    const right = width - pad;
    const top = pad;
    const mid = height / 2;
    const bottom = height - pad;
    const type = String(waveformIcon?.type ?? 'sine').trim().toLowerCase();
    const d = waveformPath(type, left, right, top, bottom, mid);
    const tileTop = top;
    const tileBottom = bottom;
    const tileMid = mid;
    const tileD = waveformPath(type, 0, width, tileTop, tileBottom, tileMid);
    return {
      d,
      tileD,
      tiles: [0, width, width * 2],
      stroke: cssColour(waveformIcon?.stroke ?? 'FFEAF0F6', '#EAF0F6'),
      strokeWidth: clampNumber(waveformIcon?.strokeWidth, 1, 8),
      animate: waveformIcon?.animate === true,
      animationMode: String(waveformIcon?.animationMode ?? waveformIcon?.animation ?? 'scroll').trim().toLowerCase(),
      durationMs: Math.max(120, numberOr(waveformIcon?.animationDurationMs ?? waveformIcon?.duration, 900)),
    };
  });
</script>

{#if part?.visible !== false}
  <div class="interactive-part" class:debug={debug} style={partStyle}>
    {#if background && usesSimpleBackground && !rendersVectorShape}
      <div class="interactive-simple-background" style={simpleBackgroundStyle}></div>
    {:else if background && !rendersVectorShape}
      <BackgroundRenderer {background} width={frame.width} height={frame.height} />
    {/if}

    {#if rendersVectorShape && vectorShapeSvg}
      <svg class="interactive-vector-shape" viewBox={`0 0 ${vectorShapeSvg.width} ${vectorShapeSvg.height}`} preserveAspectRatio="none" aria-hidden="true">
        {#if vectorShapeSvg.line}
          <line
            x1={vectorShapeSvg.line.x1}
            y1={vectorShapeSvg.line.y1}
            x2={vectorShapeSvg.line.x2}
            y2={vectorShapeSvg.line.y2}
            stroke={vectorShapeSvg.line.stroke}
            stroke-width={vectorShapeSvg.line.width}
            stroke-linecap="round"
          ></line>
        {:else}
          <polygon
            points={vectorShapeSvg.points}
            fill={vectorShapeSvg.fill}
            stroke={vectorShapeSvg.stroke}
            stroke-width={vectorShapeSvg.strokeWidth}
            stroke-linejoin="round"
          ></polygon>
        {/if}
      </svg>
    {/if}

    {#if rendersValueArc}
      <div class="interactive-value-arc" style={valueArcStyle}></div>
    {/if}

    {#if arcSvgData}
      <svg class="interactive-arc-svg" viewBox="0 0 {arcSvgData.size} {arcSvgData.size}" aria-hidden="true">
        <circle
          cx={arcSvgData.size / 2}
          cy={arcSvgData.size / 2}
          r={arcSvgData.r}
          fill="none"
          stroke={arcSvgData.colour}
          stroke-width={arcSvgData.thickness}
          stroke-linecap={arcSvgData.cap}
          stroke-dasharray="{arcSvgData.arcLength} {arcSvgData.circumference}"
          transform="rotate({arcSvgData.rotation} {arcSvgData.size / 2} {arcSvgData.size / 2})"
        />
      </svg>
    {/if}

    {#if rendersEnvelopePath}
      <svg class="interactive-envelope-path" viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
        <path d={envelopeSvg.fillD} fill={envelopeSvg.fill}></path>
        <path d={envelopeSvg.d} fill="none" stroke={envelopeSvg.stroke} stroke-width={envelopeSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    {/if}

    {#if rendersWaveformIcon}
      <svg class="interactive-waveform-icon" class:dash-scrolling={waveformSvg.animate && waveformSvg.animationMode === 'dash'} class:real-scrolling={waveformSvg.animate && waveformSvg.animationMode !== 'dash'} viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
        {#if waveformSvg.animate && waveformSvg.animationMode !== 'dash'}
          <g class="waveform-strip">
            <animateTransform attributeName="transform" type="translate" from="0 0" to={`-${Math.max(1, frame.width)} 0`} dur={`${waveformSvg.durationMs}ms`} repeatCount="indefinite" />
            {#each waveformSvg.tiles as offset}
              <path d={waveformSvg.tileD} transform={`translate(${offset} 0)`} fill="none" stroke={waveformSvg.stroke} stroke-width={waveformSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
            {/each}
          </g>
        {:else}
          <path d={waveformSvg.d} fill="none" stroke={waveformSvg.stroke} stroke-width={waveformSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
        {/if}
      </svg>
    {/if}

    {#if text && !editableInput}
      <div class="interactive-part-text" style={textStyle}>
        {text?.content ?? ''}
      </div>
    {:else if editableInput}
      <input
        class="interactive-part-input"
        type="text"
        inputmode={editableInput.inputMode ?? 'decimal'}
        value={editableInput.value ?? ''}
        disabled={editableInput.disabled === true}
        aria-label={editableInput.ariaLabel ?? 'Value'}
        tabindex={editableInput.tabIndex ?? -1}
        style={inputStyle}
        oninput={oneditableinput}
        onkeydown={oneditablekeydown}
        onfocus={oneditablefocus}
        onblur={oneditableblur}
      />
    {/if}

    {#if image}
      <div class="interactive-part-image" style={imageStyle}></div>
    {/if}

    {#if debug}
      <div class="part-debug-chip">{part?.name ?? part?.role ?? 'part'}</div>
    {/if}
  </div>
{/if}

<style>
  .interactive-part {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
  }

  /* Editable value field — make editing visually obvious (caret + focus highlight). */
  .interactive-part-input {
    caret-color: currentColor;
  }

  .interactive-part-input:focus {
    outline: 1px solid rgba(120, 180, 255, 0.9);
    outline-offset: -1px;
    background: rgba(120, 180, 255, 0.14) !important;
  }

  .interactive-part-input::selection {
    background: rgba(120, 180, 255, 0.45);
  }

  .interactive-value-arc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
  }

  .interactive-arc-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .interactive-envelope-path,
  .interactive-waveform-icon,
  .interactive-vector-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .interactive-waveform-icon.real-scrolling {
    overflow: hidden;
  }

  .interactive-waveform-icon path {
    vector-effect: non-scaling-stroke;
  }

  .interactive-waveform-icon.dash-scrolling path {
    stroke-dasharray: 14 8;
    animation: waveform-icon-scroll 760ms linear infinite;
  }

  @keyframes waveform-icon-scroll {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -22; }
  }

  .part-debug-chip {
    position: absolute;
    top: 2px;
    left: 2px;
    padding: 2px 5px;
    border-radius: 999px;
    background: rgba(9, 71, 113, 0.92);
    color: #FFF;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    pointer-events: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .interactive-part::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .interactive-part.debug::after {
    border: 1px dashed rgba(91, 155, 213, 0.55);
  }
</style>
