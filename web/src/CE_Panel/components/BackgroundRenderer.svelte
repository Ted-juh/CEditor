<script>
  import { gradientToCSS } from '../../CE_Application/utils/gradientCSS.js';
  import { normalizeCorner } from '../../CE_Application/utils/cornerNormalization.js';
  import { buildFillClipPath } from '../../CE_Application/utils/cornerPaths.js';
  import { gradientCoords } from '../../CE_Application/utils/gradientGeometry.js';
  import { buildBorderSegments, getDoubleGap } from '../../CE_Application/utils/borderSegments.js';

  let { background = null, width = 0, height = 0 } = $props();

  let fill = $derived(background?._children?.Fill);
  let border = $derived(background?._children?.Border);
  let corners = $derived(background?._children?.Corners);

  // Shorthand for the current corners section — the normalization util is
  // pure, but every call site here reads from the same `corners` prop.
  const getCornerNorm = (pos) => normalizeCorner(corners, pos);

  // ============ FILL ============

  let fillBg = $derived.by(() => {
    if (!background) return 'background: transparent;';
    const mode = background.mode || 'solid';
    if (mode === 'solid' && fill?.colour) return `background: #${fill.colour.slice(-6)};`;
    if (mode === 'gradient' && fill?.Gradient) return `background: ${gradientToCSS(fill.Gradient)};`;
    return 'background: transparent;';
  });

  let fillCornerCSS = $derived.by(() => {
    if (!corners || width <= 0 || height <= 0) return '';
    const tl = getCornerNorm('tl'), tr = getCornerNorm('tr'), br = getCornerNorm('br'), bl = getCornerNorm('bl');
    const anyClip = [tl, tr, br, bl].some(c => {
      if (c.radius <= 0) return false;
      return c.style === 'chamfer' || c.style === 'notch' || (c.style === 'rounded' && c.direction === 'inward');
    });
    if (anyClip) return buildFillClipPath({ tl, tr, br, bl }, width, height);
    const r = (c) => (c.radius > 0 && c.style === 'rounded' && c.direction !== 'inward') ? c.radius : 0;
    const tlR = r(tl), trR = r(tr), brR = r(br), blR = r(bl);
    if (tlR === 0 && trR === 0 && brR === 0 && blR === 0) return '';
    return `border-radius: ${tlR}px ${trR}px ${brR}px ${blR}px;`;
  });

  let fillStyle = $derived(['position:absolute; inset:0; box-sizing:border-box; pointer-events:none;', fillBg, fillCornerCSS].filter(Boolean).join(' '));

  // ============ BORDER (SVG) ============

  let hasBorder = $derived(border?.enabled && width > 0 && height > 0);

  // ============ BUILD SEGMENTS ============

  let borderSegments = $derived.by(() =>
    hasBorder ? buildBorderSegments(width, height, border, corners) : []
  );

  // Inner border segments for double (same border, smaller box, translated)
  let innerBorderSegments = $derived.by(() => {
    if (!hasBorder) return [];
    const gap = getDoubleGap(border);
    if (gap <= 0) return [];
    const innerW = width - 2 * gap;
    const innerH = height - 2 * gap;
    if (innerW <= 0 || innerH <= 0) return [];
    return buildBorderSegments(innerW, innerH, border, corners);
  });

  let doubleGapValue = $derived(getDoubleGap(border));

  // ============ FILL MODE HELPERS ============
  // Get the fill source for a segment (per-side or per-corner data)

  function getSegmentFillSource(seg) {
    if (seg.kind === 'side') {
      if (!border) return null;
      if (border.linked) return border;
      return border[seg.key] ?? border;
    } else {
      if (!corners) return null;
      if (corners.linked) return corners;
      return corners[seg.key] ?? corners;
    }
  }

  function fillFlags(src) {
    if (!src) return { solid: true, gradient: false, image: false, overlay: false };
    return {
      solid: src.fillSolid !== false,
      gradient: !!(src.fillGradient && src.gradient),
      image: !!(src.fillImage && src.imageSrc),
      overlay: !!(src.fillOverlay && src.overlaySrc),
    };
  }

  // Collect all unique fill sources used by any segment, with stable IDs
  let allSegments = $derived([...borderSegments, ...innerBorderSegments]);

  // Corner segments in inherit mode reuse a side gradient.
  // sideA = horizontal edge (top/bottom), sideB = vertical edge (left/right)
  // Selected via cornerGradientInheritSide on the corner data ('A' | 'B').
  function inheritedSideKeyFor(pos, side) {
    const useA = side !== 'B';
    switch (pos) {
      case 'tl': return useA ? 'top' : 'left';
      case 'tr': return useA ? 'top' : 'right';
      case 'br': return useA ? 'bottom' : 'right';
      case 'bl': return useA ? 'bottom' : 'left';
    }
    return 'top';
  }

  // Get the gradient mode for a corner segment
  function cornerGradMode(seg) {
    const src = getSegmentFillSource(seg);
    return src?.cornerGradientMode ?? 'radial';
  }

  let fillDefs = $derived.by(() => {
    const defs = []; // { id, type, data, ... }
    const seen = new Set();
    for (const seg of allSegments) {
      const src = getSegmentFillSource(seg);
      if (!src) continue;
      const flags = fillFlags(src);
      const baseId = `${seg.kind}_${seg.key}`;

      if (flags.gradient) {
        if (seg.kind === 'corner') {
          const mode = cornerGradMode(seg);
          const userFlip = !!src.cornerGradientFlip;
          if (mode === 'inherit') {
            // No corner def — corner will reference the side def
          } else if (mode === 'tangential' && seg.cornerShape === 'rounded') {
            // Tangential only meaningful for rounded shapes
            const gid = `grad_${baseId}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              defs.push({ id: gid, type: 'cornerTangential', data: src.gradient, geom: seg.geom, flip: userFlip });
            }
          } else if (seg.cornerShape === 'rounded') {
            // Radial mode (default for rounded). For inward, the natural mapping is inverted,
            // so XOR the user flip with isInward.
            const flip = seg.radialIsInward ? !userFlip : userFlip;
            const gid = `grad_${baseId}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              defs.push({ id: gid, type: 'cornerRadial', data: src.gradient, geom: seg.geom, flip });
            }
          } else if (seg.cornerShape === 'linear') {
            // Chamfer / notch / straight — linear gradient using the per-segment gradAxis.
            // Mode picker is mostly meaningless here; always use the linear gradient.
            const gid = `grad_${baseId}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              defs.push({ id: gid, type: 'cornerLinear', data: src.gradient, gradAxis: seg.gradAxis, flip: userFlip });
            }
          }
        } else {
          const gid = `grad_${baseId}`;
          if (!seen.has(gid)) {
            seen.add(gid);
            // For sides, span the gradient across the stroke thickness perpendicular to the side.
            // This makes side and corner gradients flow continuously into each other.
            const fullThick = src.thickness || 2;
            defs.push({ id: gid, type: 'sideGradient', data: src.gradient, sideKey: seg.key, thickness: fullThick });
          }
        }
      }

      if (flags.image && !seen.has(`img_${baseId}`)) {
        seen.add(`img_${baseId}`);
        defs.push({ id: `img_${baseId}`, type: 'image', data: src.imageSrc });
      }
      if (flags.overlay && !seen.has(`ovr_${baseId}`)) {
        seen.add(`ovr_${baseId}`);
        defs.push({ id: `ovr_${baseId}`, type: 'overlay', data: src.overlaySrc });
      }
    }
    return defs;
  });

  function gradStops(grad) {
    if (!grad?.stops?.length) return [];
    return [...grad.stops].sort((a, b) => a.position - b.position);
  }

  // For a given segment, return the list of fill mode IDs to render it with
  function segmentFills(seg) {
    const src = getSegmentFillSource(seg);
    if (!src) return [{ stroke: seg.colour }];
    const flags = fillFlags(src);
    const baseId = `${seg.kind}_${seg.key}`;
    const out = [];
    if (flags.solid) out.push({ stroke: seg.colour });
    if (flags.gradient) {
      if (seg.kind === 'corner') {
        const mode = cornerGradMode(seg);
        if (mode === 'inherit') {
          const sideKey = inheritedSideKeyFor(seg.pos, src.cornerGradientInheritSide);
          out.push({ stroke: `url(#grad_side_${sideKey})` });
        } else {
          out.push({ stroke: `url(#grad_${baseId})` });
        }
      } else {
        out.push({ stroke: `url(#grad_${baseId})` });
      }
    }
    if (flags.image) out.push({ stroke: `url(#img_${baseId})` });
    if (flags.overlay) out.push({ stroke: `url(#ovr_${baseId})` });
    if (out.length === 0) out.push({ stroke: 'none' });
    return out;
  }

</script>

<!-- Fill -->
<div class="bg-fill" style={fillStyle}></div>

<!-- Border (SVG) -->
{#if hasBorder && (borderSegments.length > 0 || innerBorderSegments.length > 0)}
  <svg class="bg-border" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      {#each fillDefs as def (def.id)}
        {#if def.type === 'gradient'}
          {@const stops = gradStops(def.data)}
          {@const coords = gradientCoords(def.data?.angle, width, height)}
          {#if stops.length >= 2}
            <linearGradient id={def.id} gradientUnits="userSpaceOnUse"
              x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}>
              {#each stops as stop}
                <stop offset="{stop.position}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'sideGradient'}
          {@const stops = gradStops(def.data)}
          {@const t = def.thickness}
          {#if stops.length >= 2}
            {#if def.sideKey === 'top'}
              <linearGradient id={def.id} gradientUnits="userSpaceOnUse" x1="0" y1={t} x2="0" y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'right'}
              <linearGradient id={def.id} gradientUnits="userSpaceOnUse" x1={width - t} y1="0" x2={width} y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'bottom'}
              <linearGradient id={def.id} gradientUnits="userSpaceOnUse" x1="0" y1={height - t} x2="0" y2={height}>
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'left'}
              <linearGradient id={def.id} gradientUnits="userSpaceOnUse" x1={t} y1="0" x2="0" y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {/if}
          {/if}
        {:else if def.type === 'cornerRadial'}
          {@const stops = gradStops(def.data)}
          {@const R = def.geom.R}
          {@const t = def.geom.thickness}
          {@const innerR = Math.max(0.01, R - t / 2)}
          {@const outerR = R + t / 2}
          {#if stops.length >= 2}
            <radialGradient id={def.id} gradientUnits="userSpaceOnUse"
              cx={def.geom.arcCx} cy={def.geom.arcCy}
              fx={def.geom.arcCx} fy={def.geom.arcCy}
              fr={innerR} r={outerR}>
              {#each stops as stop}
                {@const pos = def.flip ? (100 - stop.position) : stop.position}
                <stop offset="{pos}%" stop-color="#{stop.color}" />
              {/each}
            </radialGradient>
          {/if}
        {:else if def.type === 'cornerTangential'}
          {@const stops = gradStops(def.data)}
          {@const start = def.flip ? def.geom.arcEnd : def.geom.arcStart}
          {@const end = def.flip ? def.geom.arcStart : def.geom.arcEnd}
          {#if stops.length >= 2}
            <linearGradient id={def.id} gradientUnits="userSpaceOnUse"
              x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
              {#each stops as stop}
                <stop offset="{stop.position}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'cornerLinear'}
          {@const stops = gradStops(def.data)}
          {@const ax = def.gradAxis}
          {#if stops.length >= 2}
            <linearGradient id={def.id} gradientUnits="userSpaceOnUse"
              x1={ax.x1} y1={ax.y1} x2={ax.x2} y2={ax.y2}>
              {#each stops as stop}
                {@const pos = def.flip ? (100 - stop.position) : stop.position}
                <stop offset="{pos}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'image'}
          <pattern id={def.id} patternUnits="userSpaceOnUse" width={width} height={height}>
            <image href={def.data} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        {:else if def.type === 'overlay'}
          <pattern id={def.id} patternUnits="userSpaceOnUse" width={width} height={height}>
            <image href={def.data} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        {/if}
      {/each}
    </defs>

    <!-- Outer border -->
    <g>
      {#each borderSegments as seg, i (i)}
        {#each segmentFills(seg) as fill}
          <path d={seg.d} fill="none" stroke={fill.stroke} stroke-width={seg.thick}
            stroke-dasharray={seg.dasharray === 'none' ? undefined : seg.dasharray}
            stroke-linecap={seg.linecap || 'butt'} stroke-linejoin="round" />
        {/each}
      {/each}
    </g>

    <!-- Inner border (double) -->
    {#if innerBorderSegments.length > 0}
      <g transform="translate({doubleGapValue},{doubleGapValue})">
        {#each innerBorderSegments as seg, i (i)}
          {#each segmentFills(seg) as fill}
            <path d={seg.d} fill="none" stroke={fill.stroke} stroke-width={seg.thick}
              stroke-dasharray={seg.dasharray === 'none' ? undefined : seg.dasharray}
              stroke-linecap={seg.linecap || 'butt'} stroke-linejoin="round" />
          {/each}
        {/each}
      </g>
    {/if}

  </svg>
{/if}

<style>
  .bg-fill {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-sizing: border-box;
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
