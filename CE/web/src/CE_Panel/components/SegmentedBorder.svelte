<script>
  // The border BackgroundRenderer draws in SVG when one CSS declaration cannot: per side, dashed,
  // gradient-, image- or overlay-filled, chamfered, double. BackgroundRenderer mounts it only for
  // such a border (`hasBorder && !cssBorder && !outline`), which is why nothing here asks again.
  import { gradientCoords } from '../../CE_Application/utils/gradientGeometry.js';
  import { buildBorderSegments, getDoubleGap } from '../../CE_Application/utils/borderSegments.js';
  import { svgGradientStops } from '../../CE_Application/utils/gradientStops.js';

  let { border = null, corners = null, width = 0, height = 0 } = $props();

  // Each instance owns its defs: two borders on a page never resolve each other's url(#…).
  const svgInstanceId = $props.id();
  const svgDefId = (localId) => `${svgInstanceId}-${localId}`;

  // ============ BUILD SEGMENTS ============

  let outerSegments = $derived(
    buildBorderSegments(width, height, border, corners).map((seg, idx) => ({ ...seg, _ring: 'outer', _flowId: `outer-${idx}` })),
  );

  // Inner border segments for double (same border, smaller box, translated)
  let innerSegments = $derived.by(() => {
    const gap = getDoubleGap(border);
    if (gap <= 0) return [];
    const innerW = width - 2 * gap;
    const innerH = height - 2 * gap;
    if (innerW <= 0 || innerH <= 0) return [];
    return buildBorderSegments(innerW, innerH, border, corners).map((seg, idx) => ({ ...seg, _ring: 'inner', _flowId: `inner-${idx}` }));
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

  function gradientFlowMode(src) {
    return src?.gradientFlow ?? 'across';
  }

  function segmentBaseId(seg) {
    const ring = seg._ring ?? 'outer';
    const part = seg.cornerPart !== undefined ? `_p${seg.cornerPart}` : '';
    return `${ring}_${seg.kind}_${seg.key}${part}`;
  }

  function flowOrder(seg) {
    if (seg.kind === 'side') {
      if (seg.key === 'top') return 0;
      if (seg.key === 'right') return 2;
      if (seg.key === 'bottom') return 4;
      if (seg.key === 'left') return 6;
    } else if (seg.kind === 'corner') {
      const part = seg.cornerPart ?? 0;
      if (seg.pos === 'tr') return 1 + part * 0.01;
      if (seg.pos === 'br') return 3 + part * 0.01;
      if (seg.pos === 'bl') return 5 + part * 0.01;
      if (seg.pos === 'tl') return 7 + part * 0.01;
    }
    return 99;
  }

  function flowKey(seg) {
    if (seg.kind === 'side') return `side:${seg.key}`;
    const part = seg.cornerPart !== undefined ? `:${seg.cornerPart}` : '';
    return `corner:${seg.pos}${part}`;
  }

  function getFlowAxis(seg) {
    if (seg.kind === 'side') return seg.flowAxis ?? null;
    return seg.tangentialAxis ?? null;
  }

  function axisLength(axis) {
    if (!axis) return 0;
    const dx = axis.x2 - axis.x1;
    const dy = axis.y2 - axis.y1;
    return Math.hypot(dx, dy);
  }

  function computeFlowRanges(segments) {
    const rangesByFlowKey = Object.create(null);
    const rangesById = Object.create(null);
    const unique = [];
    const seen = new Set();

    for (const seg of segments) {
      const key = flowKey(seg);
      if (seen.has(key)) continue;
      const axis = getFlowAxis(seg);
      if (!axis) continue;
      const len = axisLength(axis);
      if (len <= 0) continue;
      seen.add(key);
      unique.push({ key, order: flowOrder(seg), len });
    }

    unique.sort((a, b) => a.order - b.order);
    const total = unique.reduce((sum, item) => sum + item.len, 0);
    if (total <= 0) return rangesById;

    let acc = 0;
    for (const item of unique) {
      const start = (acc / total) * 100;
      acc += item.len;
      const end = (acc / total) * 100;
      rangesByFlowKey[item.key] = { start, end };
    }

    for (const seg of segments) {
      const key = flowKey(seg);
      const range = rangesByFlowKey[key];
      if (range) rangesById[seg._flowId] = range;
    }

    return rangesById;
  }

  let outerFlowRanges = $derived.by(() => computeFlowRanges(outerSegments));
  let innerFlowRanges = $derived.by(() => computeFlowRanges(innerSegments));

  function getSegmentFlowRange(seg) {
    const ranges = seg._ring === 'inner' ? innerFlowRanges : outerFlowRanges;
    return ranges?.[seg._flowId] ?? null;
  }

  // Draw chamfer corner pieces first so side strokes sit on top and visually
  // "cap" the corner joins.
  function orderSegmentsForPaint(segments) {
    const under = [];
    const rest = [];
    for (const seg of segments) {
      if (seg.kind === 'corner' && seg.cornerStyle === 'chamfer') under.push(seg);
      else rest.push(seg);
    }
    return [...under, ...rest];
  }

  let outerRenderSegments = $derived.by(() => orderSegmentsForPaint(outerSegments));
  let innerRenderSegments = $derived.by(() => orderSegmentsForPaint(innerSegments));

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    const c = String(hex || 'FFFFFF').slice(-6);
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  function rgbToHex([r, g, b]) {
    const toHex = (v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase();
    return `${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function sampleGradientColor(stops, position) {
    if (!stops.length) return 'FFFFFF';
    const p = Math.max(0, Math.min(100, position));
    if (p <= stops[0].position) return stops[0].color;
    if (p >= stops[stops.length - 1].position) return stops[stops.length - 1].color;

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (p >= a.position && p <= b.position) {
        const span = Math.max(0.0001, b.position - a.position);
        const t = (p - a.position) / span;
        const [ar, ag, ab] = hexToRgb(a.color);
        const [br, bg, bb] = hexToRgb(b.color);
        return rgbToHex([lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)]);
      }
    }
    return stops[stops.length - 1].color;
  }

  function buildFlowStops(gradient, range) {
    const stops = svgGradientStops(gradient);
    if (stops.length < 2 || !range) return stops;

    const start = Math.max(0, Math.min(100, range.start));
    const end = Math.max(0, Math.min(100, range.end));
    const span = end - start;
    if (span <= 0.0001) return stops;

    const out = [];
    out.push({ color: sampleGradientColor(stops, start), position: 0 });

    for (const s of stops) {
      if (s.position <= start || s.position >= end) continue;
      out.push({
        color: s.color,
        position: ((s.position - start) / span) * 100,
      });
    }

    out.push({ color: sampleGradientColor(stops, end), position: 100 });
    return out;
  }

  // Collect all unique fill sources used by any segment, with stable IDs
  let allSegments = $derived([...outerSegments, ...innerSegments]);

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
      const baseId = segmentBaseId(seg);
      const flowMode = gradientFlowMode(src);
      const flowRange = getSegmentFlowRange(seg);
      const flowStops = buildFlowStops(src.gradient, flowRange);

      if (flags.gradient) {
        if (seg.kind === 'corner') {
          const mode = cornerGradMode(seg);
          const userFlip = !!src.cornerGradientFlip;
          const isRoundedCorner = seg.cornerStyle === 'rounded';
          const useRoundedInherit = isRoundedCorner && mode === 'inherit';
          const linearFollowInherit = flowMode === 'follow' && !isRoundedCorner;
          if (useRoundedInherit || linearFollowInherit) {
            // Corner uses an adjacent side gradient. If that side doesn't have
            // its own gradient enabled, synthesize one from the corner gradient
            // so the reference never resolves to a missing SVG gradient id.
            const sideKey = seg.cornerPartSide || inheritedSideKeyFor(seg.pos, src.cornerGradientInheritSide);
            const gid = `grad_${seg._ring}_side_${sideKey}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              const sideSeg = allSegments.find((s) =>
                s.kind === 'side' && s._ring === seg._ring && s.key === sideKey
              );
              const sideSrc = sideSeg ? getSegmentFillSource(sideSeg) : null;
              const sideFlowMode = sideSrc ? gradientFlowMode(sideSrc) : flowMode;
              if (sideFlowMode === 'follow' && sideSeg?.flowAxis) {
                const sideRange = getSegmentFlowRange(sideSeg);
                defs.push({
                  id: gid,
                  type: 'flowGradient',
                  data: src.gradient,
                  axis: sideSeg.flowAxis,
                  stops: buildFlowStops(src.gradient, sideRange),
                });
              } else {
                const thick = sideSrc?.thickness || src.thickness || 2;
                defs.push({
                  id: gid,
                  type: 'sideGradient',
                  data: src.gradient,
                  sideKey,
                  thickness: thick,
                });
              }
            }
          } else if (flowMode === 'follow' && seg.tangentialAxis) {
            const gid = `grad_${baseId}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              defs.push({
                id: gid,
                type: 'flowGradient',
                data: src.gradient,
                axis: seg.tangentialAxis,
                stops: flowStops,
              });
            }
          } else if (seg.cornerShape === 'rounded') {
            const gid = `grad_${baseId}`;
            if (!seen.has(gid)) {
              seen.add(gid);
              if (mode === 'tangential') {
                if (seg.tangentialAxis) {
                  defs.push({
                    id: gid,
                    type: 'cornerTangential',
                    data: src.gradient,
                    axis: seg.tangentialAxis,
                    flip: userFlip,
                  });
                }
              } else {
                // Radial mode (default for rounded). For inward, the natural
                // mapping is inverted, so XOR the user flip with isInward.
                const flip = seg.radialIsInward ? !userFlip : userFlip;
                defs.push({ id: gid, type: 'cornerRadial', data: src.gradient, geom: seg.geom, flip });
              }
            }
          } else if (seg.cornerShape === 'linear') {
            // Non-rounded corners use across-thickness gradient behavior.
            // Tangential/radial mode toggles are intentionally ignored here.
            const axis = seg.radialAxis ?? seg.tangentialAxis;
            const gid = `grad_${baseId}`;
            if (axis && !seen.has(gid)) {
              seen.add(gid);
              defs.push({ id: gid, type: 'cornerLinear', data: src.gradient, gradAxis: axis, flip: userFlip });
            }
          }
        } else {
          const gid = `grad_${baseId}`;
          if (!seen.has(gid)) {
            seen.add(gid);
            if (flowMode === 'follow' && seg.flowAxis) {
              defs.push({
                id: gid,
                type: 'flowGradient',
                data: src.gradient,
                axis: seg.flowAxis,
                stops: flowStops,
              });
            } else {
              // Across-thickness mode
              const fullThick = src.thickness || 2;
              defs.push({ id: gid, type: 'sideGradient', data: src.gradient, sideKey: seg.key, thickness: fullThick });
            }
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

  // For a given segment, return the list of fill mode IDs to render it with
  function segmentFills(seg) {
    const src = getSegmentFillSource(seg);
    if (!src) return [{ stroke: seg.colour }];
    const flags = fillFlags(src);
    const baseId = segmentBaseId(seg);
    const flowMode = gradientFlowMode(src);
    const out = [];
    if (flags.solid) out.push({ stroke: seg.colour });
    if (flags.gradient) {
      if (seg.kind === 'corner') {
        const mode = cornerGradMode(seg);
        const isRoundedCorner = seg.cornerStyle === 'rounded';
        const useRoundedInherit = isRoundedCorner && mode === 'inherit';
        const linearFollowInherit = flowMode === 'follow' && !isRoundedCorner;
        if (useRoundedInherit || linearFollowInherit) {
          const sideKey = seg.cornerPartSide || inheritedSideKeyFor(seg.pos, src.cornerGradientInheritSide);
          out.push({ stroke: `url(#${svgDefId(`grad_${seg._ring}_side_${sideKey}`)})` });
        } else {
          out.push({ stroke: `url(#${svgDefId(`grad_${baseId}`)})` });
        }
      } else {
        out.push({ stroke: `url(#${svgDefId(`grad_${baseId}`)})` });
      }
    }
    if (flags.image) out.push({ stroke: `url(#${svgDefId(`img_${baseId}`)})` });
    if (flags.overlay) out.push({ stroke: `url(#${svgDefId(`ovr_${baseId}`)})` });
    if (out.length === 0) out.push({ stroke: 'none' });
    return out;
  }
</script>

<!-- Border (SVG) -->
{#if outerSegments.length > 0 || innerSegments.length > 0}
  <svg class="bg-border" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      {#each fillDefs as def (def.id)}
        {#if def.type === 'gradient'}
          {@const stops = svgGradientStops(def.data)}
          {@const coords = gradientCoords(def.data?.angle, width, height)}
          {#if stops.length >= 2}
            <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse"
              x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}>
              {#each stops as stop}
                <stop offset="{stop.position}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'sideGradient'}
          {@const stops = svgGradientStops(def.data)}
          {@const t = def.thickness}
          {#if stops.length >= 2}
            {#if def.sideKey === 'top'}
              <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse" x1="0" y1={t} x2="0" y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'right'}
              <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse" x1={width - t} y1="0" x2={width} y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'bottom'}
              <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse" x1="0" y1={height - t} x2="0" y2={height}>
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {:else if def.sideKey === 'left'}
              <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse" x1={t} y1="0" x2="0" y2="0">
                {#each stops as stop}<stop offset="{stop.position}%" stop-color="#{stop.color}" />{/each}
              </linearGradient>
            {/if}
          {/if}
        {:else if def.type === 'flowGradient'}
          {@const stops = def.stops ?? svgGradientStops(def.data)}
          {#if stops.length >= 2}
            <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse"
              x1={def.axis.x1} y1={def.axis.y1} x2={def.axis.x2} y2={def.axis.y2}>
              {#each stops as stop}
                <stop offset="{stop.position}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'cornerRadial'}
          {@const stops = svgGradientStops(def.data)}
          <!-- The band's own centreline radius, which is R - thickness/2 for an
               outward corner and R for an inward one — not R in both cases. The
               ramp has to bracket the band the arc actually paints, or the stops
               land off the stroke. -->
          {@const R = def.geom.arcR ?? def.geom.R}
          {@const t = def.geom.thickness}
          {@const innerR = Math.max(0.01, R - t / 2)}
          {@const outerR = R + t / 2}
          {#if stops.length >= 2}
            <radialGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse"
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
          {@const stops = svgGradientStops(def.data)}
          {@const start = def.flip ? { x: def.axis.x2, y: def.axis.y2 } : { x: def.axis.x1, y: def.axis.y1 }}
          {@const end = def.flip ? { x: def.axis.x1, y: def.axis.y1 } : { x: def.axis.x2, y: def.axis.y2 }}
          {#if stops.length >= 2}
            <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse"
              x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
              {#each stops as stop}
                <stop offset="{stop.position}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'cornerLinear'}
          {@const stops = svgGradientStops(def.data)}
          {@const ax = def.gradAxis}
          {#if stops.length >= 2}
            <linearGradient id={svgDefId(def.id)} gradientUnits="userSpaceOnUse"
              x1={ax.x1} y1={ax.y1} x2={ax.x2} y2={ax.y2}>
              {#each stops as stop}
                {@const pos = def.flip ? (100 - stop.position) : stop.position}
                <stop offset="{pos}%" stop-color="#{stop.color}" />
              {/each}
            </linearGradient>
          {/if}
        {:else if def.type === 'image'}
          <pattern id={svgDefId(def.id)} patternUnits="userSpaceOnUse" width={width} height={height}>
            <image href={def.data} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        {:else if def.type === 'overlay'}
          <pattern id={svgDefId(def.id)} patternUnits="userSpaceOnUse" width={width} height={height}>
            <image href={def.data} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        {/if}
      {/each}
    </defs>

    <!-- Outer border -->
    <g>
      {#each outerRenderSegments as seg, i (i)}
        {#each segmentFills(seg) as fill}
          <path d={seg.d} fill="none" stroke={fill.stroke} stroke-width={seg.thick}
            stroke-dasharray={seg.dasharray === 'none' ? undefined : seg.dasharray}
            stroke-linecap={seg.linecap || 'butt'} stroke-linejoin={seg.linejoin || 'round'} />
        {/each}
      {/each}
    </g>

    <!-- Inner border (double) -->
    {#if innerRenderSegments.length > 0}
      <g transform="translate({doubleGapValue},{doubleGapValue})">
        {#each innerRenderSegments as seg, i (i)}
          {#each segmentFills(seg) as fill}
          <path d={seg.d} fill="none" stroke={fill.stroke} stroke-width={seg.thick}
            stroke-dasharray={seg.dasharray === 'none' ? undefined : seg.dasharray}
            stroke-linecap={seg.linecap || 'butt'} stroke-linejoin={seg.linejoin || 'round'} />
          {/each}
        {/each}
      </g>
    {/if}

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
