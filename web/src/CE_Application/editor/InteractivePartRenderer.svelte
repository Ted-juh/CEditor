<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';

  let {
    part = null,
    parentWidth = 0,
    parentHeight = 0,
    transitionBucket = null,
    debug = false,
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
      `overflow:${part?.clipChildren === true ? 'hidden' : 'visible'}`,
      transforms.length ? `transform:${transforms.join(' ')}; transform-origin:center center` : '',
      buildTransitionStyle(transitionBucket),
      shadowCSS,
      blendCSS,
      filterCSS,
    ].filter(Boolean).join('; ');
  });
</script>

{#if part?.visible !== false}
  <div class="interactive-part" class:debug={debug} style={partStyle}>
    {#if background}
      <BackgroundRenderer {background} width={frame.width} height={frame.height} />
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
