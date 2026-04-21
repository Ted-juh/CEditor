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
  let effects = $derived(part?._children?.Effects ?? null);
  let text = $derived(part?._children?.Text ?? null);
  let textFill = $derived(text?._children?.Fill ?? null);
  let textFont = $derived(text?._children?.Font ?? null);
  let textPosition = $derived(text?._children?.Position ?? null);

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
</script>

{#if part?.visible !== false}
  <div class="interactive-part" class:debug={debug} style={partStyle}>
    {#if background}
      <BackgroundRenderer {background} width={frame.width} height={frame.height} />
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
