<script>
  // A border along an outline (a combined or compound shape, utils/booleanGroups.js): bands
  // measured inward from the outline. BackgroundRenderer mounts it only for a bordered outline.
  import { gradientCoords } from '../../CE_Application/utils/gradientGeometry.js';
  import { fileCache } from '../../CE_Application/stores/fileCache.js';
  import { svgGradientStops } from '../../CE_Application/utils/gradientStops.js';
  import { outlineBorderBands, outlineBorderPaints, outlineFlowPieces, outlineInsetKey, stopsColourAt } from '../../CE_Application/utils/outlineBorder.js';

  let { border = null, outline, width = 0, height = 0 } = $props();

  const svgInstanceId = $props.id();
  const svgDefId = (localId) => `${svgInstanceId}-${localId}`;

  function resolvedFillSource(src) {
    if (!src) return null;
    if (String(src).startsWith('data:')) return src;
    return $fileCache[src] ?? null;
  }

  let outlineBands = $derived(outlineBorderBands(border));
  let outlinePaints = $derived(outlineBands.length ? outlineBorderPaints(border) : null);
  let outlineGradientCoords = $derived(outlinePaints?.gradient ? gradientCoords(outlinePaints.gradient.angle, width, height) : null);
  // Paints for a band, in the box border's order: its own (shaded) colour, then gradient, image, overlay.
  // A gradient that follows the outline: the path sampled by the browser's own geometry, cut into
  // short pieces each stroked in the colour of where it falls (utils/outlineBorder.js).
  let outlineFlow = $derived.by(() => {
    if (!outlinePaints?.gradient || outlinePaints.flow !== 'follow' || typeof document === 'undefined') return null;
    const stops = svgGradientStops(outlinePaints.gradient);
    if (stops.length < 2) return null;
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    probe.setAttribute('d', outline.d);
    let total = 0;
    try { total = probe.getTotalLength(); } catch { return null; }
    if (!(total > 0)) return null;
    const step = Math.max(1.5, total / 900);
    const points = [];
    for (let at = 0; at < total; at += step) {
      const p = probe.getPointAtLength(at);
      points.push({ x: p.x, y: p.y });
    }
    return outlineFlowPieces(points, step * 1.5).map((piece) => ({ ...piece, colour: stopsColourAt(stops, piece.t) }));
  });

  function outlineBandPaints(band) {
    const out = [];
    if (outlinePaints?.solid) out.push(band.colour);
    if (outlinePaints?.gradient) out.push(outlineFlow ? 'flow' : `url(#${svgDefId('ol-grad')})`);
    if (outlinePaints?.image) out.push(`url(#${svgDefId('ol-img')})`);
    if (outlinePaints?.overlay) out.push(`url(#${svgDefId('ol-ovr')})`);
    return out;
  }
  // Which way an edge faces: the shape moved down-right by the band's width covers the band on the
  // edges that face down and right, and leaves uncovered the ones facing up and left.
  let outlineShift = $derived(outlineBands.reduce((max, band) => Math.max(max, band.to), 0));
</script>

{#if outlineBands.length > 0}
  {@const pad = outlineShift + 2}
  <svg class="bg-border" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id={svgDefId('ol-inside')}>
        <path d={outline.d} clip-rule={outline.fillRule ?? 'evenodd'} />
      </clipPath>
      <clipPath id={svgDefId('ol-shifted')}>
        <path d={outline.d} clip-rule={outline.fillRule ?? 'evenodd'} transform="translate({outlineShift} {outlineShift})" />
      </clipPath>
      {#each outlineBands as band, i (i)}
        {#if !band.dots}
          <mask id={svgDefId(`ol-band-${i}`)} maskUnits="userSpaceOnUse" x={-pad} y={-pad} width={width + 2 * pad} height={height + 2 * pad}>
            <g clip-path="url(#{svgDefId('ol-inside')})">
              <g clip-path={band.facing === 'downRight' ? `url(#${svgDefId('ol-shifted')})` : undefined}>
                <path d={outline.d} fill="none" stroke="white" stroke-width={band.to * 2} stroke-linejoin="round"
                  stroke-dasharray={band.dasharray === 'none' ? undefined : band.dasharray} stroke-linecap={band.linecap} />
                {#if band.from > 0}
                  <path d={outline.d} fill="none" stroke="black" stroke-width={band.from * 2} stroke-linejoin="round" />
                {/if}
              </g>
              {#if band.facing === 'upLeft'}
                <path d={outline.d} fill="black" fill-rule={outline.fillRule ?? 'evenodd'} transform="translate({outlineShift} {outlineShift})" />
              {/if}
            </g>
          </mask>
        {/if}
      {/each}
      {#if outlinePaints?.gradient && outlineGradientCoords}
        {@const stops = svgGradientStops(outlinePaints.gradient)}
        {#if stops.length >= 2}
          <linearGradient id={svgDefId('ol-grad')} gradientUnits="userSpaceOnUse"
            x1={outlineGradientCoords.x1} y1={outlineGradientCoords.y1} x2={outlineGradientCoords.x2} y2={outlineGradientCoords.y2}>
            {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
          </linearGradient>
        {/if}
      {/if}
      {#if outlinePaints?.image}
        <pattern id={svgDefId('ol-img')} patternUnits="userSpaceOnUse" width={width} height={height}>
          <image href={resolvedFillSource(outlinePaints.image) ?? outlinePaints.image} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
        </pattern>
      {/if}
      {#if outlinePaints?.overlay}
        <pattern id={svgDefId('ol-ovr')} patternUnits="userSpaceOnUse" width={width} height={height}>
          <image href={resolvedFillSource(outlinePaints.overlay) ?? outlinePaints.overlay} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
        </pattern>
      {/if}
    </defs>
    {#each outlineBands as band, i (i)}
      {#each outlineBandPaints(band) as paint}
        {#if band.dots}
          <!-- Dots take the gradient across the shape: a dot is too small to show where along it falls. -->
          <path d={outline.insets?.[outlineInsetKey(band.dots.depth)] ?? ''} fill="none" stroke={paint === 'flow' ? `url(#${svgDefId('ol-grad')})` : paint} stroke-width={band.dots.radius * 2}
            stroke-dasharray={band.dasharray} stroke-linecap="round" />
        {:else if paint === 'flow'}
          <g mask="url(#{svgDefId(`ol-band-${i}`)})" data-outline-flow>
            {#each outlineFlow as piece, k (k)}
              <line x1={piece.x1} y1={piece.y1} x2={piece.x2} y2={piece.y2} stroke={piece.colour} stroke-width={band.to * 2 + 2} stroke-linecap="square" />
            {/each}
          </g>
        {:else}
          <rect x={-pad} y={-pad} width={width + 2 * pad} height={height + 2 * pad} fill={paint} mask="url(#{svgDefId(`ol-band-${i}`)})" />
        {/if}
      {/each}
    {/each}
  </svg>
{/if}

<style>
  /* A colour animation on the control or part this border belongs to reaches the strokes through an
     inherited custom property; see utils/transitionCss.js. */
  .bg-border :global(path),
  .bg-border :global(rect) {
    transition: var(--ce-colour-transition, none);
  }

  .bg-border {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
</style>
