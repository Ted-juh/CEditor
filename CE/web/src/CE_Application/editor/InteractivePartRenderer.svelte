<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';

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
  let rendersValueArc = $derived(
    String(part?.kind ?? '').toLowerCase() === 'valuearc'
    || String(part?.meta?.renderer ?? '').toLowerCase() === 'valuearc'
  );
  let rendersArcTrack = $derived(
    ['arctrack', 'ringarc'].includes(String(part?.kind ?? '').toLowerCase())
    || ['arctrack', 'ringarc'].includes(String(part?.meta?.renderer ?? '').toLowerCase())
  );
  let usesSimpleBackground = $derived(
    background
    && !rendersArcTrack
    && ['circle', 'ring', 'capsule'].includes(simpleBackgroundKind)
  );

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
      transforms.length ? `transform:${transforms.join(' ')}; transform-origin:center center` : '',
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
    const filledAngle = Math.max(0.001, sweepAngle * value);
    const startAngle = numberOr(valueArc?.startAngle, -135);
    const colour = cssColour(valueArc?.colour ?? background?._children?.Border?.colour, '#5B9BD5');

    return [
      `background:conic-gradient(from ${startAngle}deg, ${colour} 0deg ${filledAngle}deg, transparent ${filledAngle}deg 360deg)`,
      `-webkit-mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
      `mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
    ].join('; ');
  });

  let arcTrackStyle = $derived.by(() => {
    if (!rendersArcTrack) return '';

    const size = Math.max(1, Math.min(frame.width, frame.height));
    const thickness = clampNumber(
      arcTrack?.thickness ?? backgroundBorder?.thickness,
      1,
      size / 2,
    );
    const sweepAngle = clampNumber(arcTrack?.sweepAngle, 0, 360);
    const direction = String(arcTrack?.direction ?? 'cw').trim().toLowerCase() === 'ccw' ? 'ccw' : 'cw';
    const startAngle = numberOr(arcTrack?.startAngle, -135);
    const renderedStartAngle = direction === 'ccw' ? startAngle - sweepAngle : startAngle;
    const colour = cssColour(arcTrack?.colour ?? backgroundBorder?.colour ?? backgroundFill?.colour, '#2B3742');

    return [
      `background:conic-gradient(from ${renderedStartAngle}deg, ${colour} 0deg ${sweepAngle}deg, transparent ${sweepAngle}deg 360deg)`,
      `-webkit-mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
      `mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
    ].join('; ');
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
</script>

{#if part?.visible !== false}
  <div class="interactive-part" class:debug={debug} style={partStyle}>
    {#if background && usesSimpleBackground}
      <div class="interactive-simple-background" style={simpleBackgroundStyle}></div>
    {:else if background}
      <BackgroundRenderer {background} width={frame.width} height={frame.height} />
    {/if}

    {#if rendersValueArc}
      <div class="interactive-value-arc" style={valueArcStyle}></div>
    {/if}

    {#if rendersArcTrack}
      <div class="interactive-arc-track" style={arcTrackStyle}></div>
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

  .interactive-value-arc,
  .interactive-arc-track {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
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
