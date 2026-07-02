<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { deepClone } from '../utils/deepClone.js';
  import { numberOr } from '../utils/primitives.js';

  let {
    background = null,
    bounds = null,
    shape = null,
    maskId = '',
    svgWidth = 0,
    svgHeight = 0,
    opacity = 1,
    style = '',
  } = $props();

  function normalizeMaskedBackground(source) {
    if (!source) return null;
    const copy = deepClone(source);

    if (copy?._children?.Border) {
      copy._children.Border.enabled = false;
    }

    if (copy?._children?.Corners) {
      copy._children.Corners.linked = true;
      copy._children.Corners.radius = 0;
      copy._children.Corners.topLeft = { ...(copy._children.Corners.topLeft ?? {}), radius: 0 };
      copy._children.Corners.topRight = { ...(copy._children.Corners.topRight ?? {}), radius: 0 };
      copy._children.Corners.bottomLeft = { ...(copy._children.Corners.bottomLeft ?? {}), radius: 0 };
      copy._children.Corners.bottomRight = { ...(copy._children.Corners.bottomRight ?? {}), radius: 0 };
    }

    return copy;
  }

  let preparedBackground = $derived.by(() => normalizeMaskedBackground(background));
  let safeBounds = $derived.by(() => ({
    x: numberOr(bounds?.x, 0),
    y: numberOr(bounds?.y, 0),
    width: Math.max(1, numberOr(bounds?.width, 0)),
    height: Math.max(1, numberOr(bounds?.height, 0)),
  }));
  let safeSvgWidth = $derived(Math.max(1, numberOr(svgWidth, 0)));
  let safeSvgHeight = $derived(Math.max(1, numberOr(svgHeight, 0)));
</script>

{#if preparedBackground && shape && maskId}
  <mask
    id={maskId}
    maskUnits="userSpaceOnUse"
    x={0}
    y={0}
    width={safeSvgWidth}
    height={safeSvgHeight}
  >
    <rect x={0} y={0} width={safeSvgWidth} height={safeSvgHeight} fill="black" />

    {#if shape.kind === 'line'}
      <line
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke="white"
        stroke-width={shape.strokeWidth}
        stroke-linecap={shape.lineCap ?? 'round'}
      />
    {:else if shape.kind === 'path'}
      <path
        d={shape.d}
        fill="none"
        stroke="white"
        stroke-width={shape.strokeWidth}
        stroke-linecap={shape.lineCap ?? 'round'}
      />
    {:else if shape.kind === 'circle'}
      <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="white" />
    {:else if shape.kind === 'circle-stroke'}
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill="none"
        stroke="white"
        stroke-width={shape.strokeWidth}
      />
    {/if}
  </mask>

  <foreignObject
    x={safeBounds.x}
    y={safeBounds.y}
    width={safeBounds.width}
    height={safeBounds.height}
    mask={`url(#${maskId})`}
    opacity={numberOr(opacity, 1)}
    style={style}
  >
    <div xmlns="http://www.w3.org/1999/xhtml" class="shape-fill-host">
      <BackgroundRenderer background={preparedBackground} width={safeBounds.width} height={safeBounds.height} />
    </div>
  </foreignObject>
{/if}

<style>
  .shape-fill-host {
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
  }
</style>
