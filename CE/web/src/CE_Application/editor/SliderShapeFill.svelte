<script>
  /**
   * A slider part's fill — HTML in a foreignObject, so a colour that animates, a gradient or an
   * image all paint as they do on any other part — cut to the part's shape.
   *
   * WEBKIT (the Linux app and plug-ins: WebKitGTK) paints anything inside a foreignObject that has a
   * layer of its own — positioned, clipped, translucent — outside the SVG's order: over whatever the
   * SVG draws after it, and past an SVG mask or clip on the foreignObject. BackgroundRenderer's fill
   * layers are all positioned, so on Linux the default knob drew as squares, over its pointer.
   * Measured in WebKitGTK 2.52 and Chromium; utils/shapeClip.js has the rest. So:
   *
   *   - A plain fill (one colour, gradient or picture: plainFillCSS; or a colour under a gradient,
   *     the designed sets' shaded plates: colourUnderGradientCSS) is the host's own `background`,
   *     with no layer, cut by an SVG clip on the foreignObject. Both engines cut it and keep it in
   *     order. Nearly every slider part's fill is this.
   *   - Anything more (layers, effects, patterns) keeps BackgroundRenderer and is cut by a CSS clip
   *     on the host, which WebKit does apply; WebKit may still paint it over what comes after.
   *   - A shape shapeClip.js cannot outline (a clip has no stroke) keeps the mask it always had.
   *
   * And the part's opacity and style sit on a group around the foreignObject, never on it: WebKit
   * fades a foreignObject through a layer it places without the foreignObject's x and y, which cut
   * the far side off a faded knob track.
   */
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { deepClone } from '../utils/deepClone.js';
  import { numberOr } from '../utils/primitives.js';
  import { clipShapeFor } from '../utils/shapeClip.js';
  import { plainFillCSS, colourUnderGradientCSS } from '../utils/plainFillCSS.js';
  import { hasPatterns } from '../utils/patternLayers.js';

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
  let clip = $derived(clipShapeFor(shape));
  // One colour, gradient or picture, or a colour under a gradient, said as the host's own
  // background (utils/plainFillCSS.js).
  let plainOne = $derived(preparedBackground && !hasPatterns(preparedBackground)
    ? plainFillCSS(preparedBackground, safeBounds.width, safeBounds.height)
    : null);
  let plainTwo = $derived(preparedBackground && !plainOne && !hasPatterns(preparedBackground)
    ? colourUnderGradientCSS(preparedBackground, safeBounds.width, safeBounds.height)
    : null);
  let plainPaint = $derived(plainOne ?? plainTwo);
  // Its colour animation: a gradient's own channel, the colour's, or both (utils/keyframeAnimation.js).
  let plainGradient = $derived(!plainTwo && /gradient\(/.test(plainOne ?? ''));
  // The SVG clip on the foreignObject is in the SVG's units. The CSS clip on the host is in the
  // host's own pixels, whose origin is the foreignObject's corner.
  let clipShift = $derived(plainPaint ? undefined : `translate(${-safeBounds.x} ${-safeBounds.y})`);
</script>

{#if preparedBackground && shape && maskId && clip}
  <!-- data-shape-d: the stroked path itself, which the clip holds only as its outline. -->
  <clipPath id={maskId} clipPathUnits="userSpaceOnUse" transform={clipShift} data-shape-d={shape.kind === 'path' ? shape.d : undefined}>
    {#if clip.kind === 'circle'}
      <circle cx={clip.cx} cy={clip.cy} r={clip.r} />
    {:else if clip.kind === 'rect'}
      <rect x={clip.x} y={clip.y} width={clip.width} height={clip.height} rx={clip.rx} />
    {:else if clip.d}
      <path d={clip.d} clip-rule={clip.rule} transform={clip.transform} />
    {/if}
  </clipPath>

  <!-- The opacity and the part's style (its timing, its keyframes, its colour variables, which the
       HTML inherits) are the group's: on the foreignObject itself, WebKit fades it through a layer
       it places without the foreignObject's x and y, and cuts off that much of its far side. -->
  <g opacity={numberOr(opacity, 1)} style={style}>
    <foreignObject
      x={safeBounds.x}
      y={safeBounds.y}
      width={safeBounds.width}
      height={safeBounds.height}
      clip-path={plainPaint ? `url(#${maskId})` : undefined}
    >
      {#if plainPaint}
        <div xmlns="http://www.w3.org/1999/xhtml" class="shape-fill-plain" class:gradient={plainGradient} class:both={!!plainTwo} data-shape-clip={maskId} style={plainPaint}></div>
      {:else}
        <div xmlns="http://www.w3.org/1999/xhtml" class="shape-fill-host clipped" data-shape-clip={maskId} style={`clip-path: url("#${maskId}");`}>
          <BackgroundRenderer background={preparedBackground} width={safeBounds.width} height={safeBounds.height} />
        </div>
      {/if}
    </foreignObject>
  </g>
{:else if preparedBackground && shape && maskId}
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
    {:else if shape.kind === 'filled-path'}
      <!-- An outline filled: a knob's polygon, scallop or flutes, or a ring with its hole
           (utils/knobOutlines.js); moved, squashed and turned by its transform when it has one, a
           plate seen in perspective. -->
      <path d={shape.d} fill="white" fill-rule="evenodd" transform={shape.transform} />
    {:else if shape.kind === 'circle'}
      <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="white" />
    {:else if shape.kind === 'rect'}
      <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx ?? 0} fill="white" />
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
  /* Positioned, so the fill's absolutely positioned layers are laid out in it and cut with it. */
  .shape-fill-host.clipped {
    position: relative;
  }

  /* A plain fill: no position, no overflow clip, no opacity — nothing that gives it a layer of its
     own, which WebKit would paint outside the SVG's order. Its colour plays as BackgroundRenderer's
     layers' does, from the custom properties the part sets. */
  .shape-fill-plain {
    width: 100%;
    height: 100%;
    pointer-events: none;
    transition: var(--ce-colour-transition, none);
    animation: var(--ce-kf-paint, none);
  }
  .shape-fill-plain.gradient {
    animation: var(--ce-kf-gradient, none);
  }
  .shape-fill-plain.both {
    animation: var(--ce-kf-paint, none), var(--ce-kf-gradient, none);
  }
</style>
