<script>
  // Envelope — a breakpoint / curve editor drawn as an SVG: grid, filled area
  // under the curve, the per-segment curve line, draggable nodes, a sustain
  // marker, optional loop markers and a moving playhead dot. Visual only; the
  // node dragging / add / remove is driven by the preview surface, which shares
  // the same envelopeLayout geometry (pad = 10) so hit-tests line up.
  import {
    envelopeConfig, envelopePoints, envelopeGeometry, envToPx,
    envPath, envFillPath, envValueAt,
  } from '../utils/envelopeLayout.js';
  import { linkedEnvelopeConfig } from '../utils/linkedEnvelope.js';
  import { envelopeLabelPosition } from '../utils/envelopeLabels.js';

  let { control = null, width = 0, height = 0, activeIndex = -1 } = $props();

  const PAD = 10;
  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }
  function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }

  let cfg = $derived(envelopeConfig(control));
  let linked = $derived(linkedEnvelopeConfig(control));
  let points = $derived(envelopePoints(control));
  let geom = $derived(envelopeGeometry(width, height, PAD));
  let line = $derived(envPath(points, geom, 24));
  let fill = $derived(cfg.fillUnder !== false ? envFillPath(points, geom, 24) : '');
  let nodesPx = $derived(points.map((p, i) => ({ ...envToPx(p, geom), i })));
  let sustainX = $derived.by(() => {
    const si = Math.round(n(cfg.sustainIndex, -1));
    return si >= 0 && si < points.length ? envToPx(points[si], geom).px : null;
  });
  let loopXs = $derived.by(() => {
    if (cfg.loopEnabled !== true) return null;
    const s = Math.max(0, Math.min(points.length - 1, Math.round(n(cfg.loopStart, 0))));
    const e = Math.max(0, Math.min(points.length - 1, Math.round(n(cfg.loopEnd, 0))));
    return { start: envToPx(points[s], geom).px, end: envToPx(points[e], geom).px };
  });
  let playhead = $derived.by(() => {
    if (cfg.showPlayhead !== true) return null;
    const ph = Math.max(0, Math.min(1, n(cfg.__phase ?? cfg.phase, 0)));
    return envToPx({ x: ph, y: envValueAt(points, ph) }, geom);
  });

  let gridLines = $derived.by(() => {
    if (cfg.showGrid === false) return { v: [], h: [] };
    const gx = Math.max(0, Math.round(n(cfg.gridX, 4)));
    const gy = Math.max(0, Math.round(n(cfg.gridY, 4)));
    const v = []; const h = [];
    for (let i = 1; i < gx; i += 1) v.push(geom.x0 + (geom.w * i) / gx);
    for (let i = 1; i < gy; i += 1) h.push(geom.y0 + (geom.h * i) / gy);
    return { v, h };
  });

  let lineCss = $derived(css(cfg.lineColour, 'rgba(91,155,213,1)'));
  let fillCss = $derived(css(cfg.fillColour, 'rgba(91,155,213,0.2)'));
  let nodeCss = $derived(css(cfg.nodeColour, 'rgba(242,242,242,1)'));
  let gridCss = $derived(css(cfg.gridColour, 'rgba(255,255,255,0.09)'));
  let sustainCss = $derived(css(cfg.sustainColour, 'rgba(242,201,76,1)'));
  let playheadCss = $derived(css(cfg.playheadColour, 'rgba(255,255,255,1)'));
  let nodeR = $derived(Math.max(2, n(cfg.nodeRadius, 4)));
  let lineW = $derived(Math.max(1, n(cfg.lineWidth, 2)));
  let baseY = $derived(geom.y0 + geom.h);
  // Where each stage letter goes: the side of its node furthest from the line (utils/envelopeLabels.js).
  let labelAt = $derived.by(() => {
    if (!linked) return [];
    const bounds = { x0: 2, y0: 2, x1: Math.max(4, width - 2), y1: Math.max(4, height - 2) };
    const at = (i) => ({ x: nodesPx[i].px, y: nodesPx[i].py });
    return nodesPx.map((_, i) => {
      const segments = [];
      if (i > 0) segments.push([at(i - 1), at(i)]);
      if (i < nodesPx.length - 1) segments.push([at(i), at(i + 1)]);
      return envelopeLabelPosition(at(i), segments, bounds);
    });
  });
</script>

  <svg class="envelope" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}>
  {#each gridLines.v as x (`v${x}`)}<line x1={x} y1={geom.y0} x2={x} y2={baseY} stroke={gridCss} stroke-width="1" />{/each}
  {#each gridLines.h as y (`h${y}`)}<line x1={geom.x0} y1={y} x2={geom.x0 + geom.w} y2={y} stroke={gridCss} stroke-width="1" />{/each}

  {#if loopXs}
    <rect x={Math.min(loopXs.start, loopXs.end)} y={geom.y0} width={Math.abs(loopXs.end - loopXs.start)} height={geom.h} fill={css(cfg.sustainColour, 'rgba(242,201,76,1)').replace(/[\d.]+\)$/, '0.08)')} />
    <line x1={loopXs.start} y1={geom.y0} x2={loopXs.start} y2={baseY} stroke={sustainCss} stroke-width="1" stroke-dasharray="2 2" />
    <line x1={loopXs.end} y1={geom.y0} x2={loopXs.end} y2={baseY} stroke={sustainCss} stroke-width="1" stroke-dasharray="2 2" />
  {/if}

  {#if fill}<path d={fill} fill={fillCss} stroke="none" />{/if}
  {#if line}<path d={line} fill="none" stroke={lineCss} stroke-width={lineW} stroke-linejoin="round" stroke-linecap="round" />{/if}

  {#if sustainX !== null}
    <line x1={sustainX} y1={geom.y0} x2={sustainX} y2={baseY} stroke={sustainCss} stroke-width="1.25" stroke-dasharray="3 3" />
  {/if}

  {#if playhead}
    <line x1={playhead.px} y1={geom.y0} x2={playhead.px} y2={baseY} stroke={playheadCss} stroke-width="1" opacity="0.5" />
    <circle cx={playhead.px} cy={playhead.py} r={nodeR - 0.5} fill={playheadCss} />
  {/if}

  {#each nodesPx as node (node.i)}
    {#if !linked || node.i > 0}
    <circle cx={node.px} cy={node.py} r={node.i === activeIndex ? nodeR + 2 : nodeR}
            data-envelope-stage={linked ? points[node.i].id : undefined}
            fill={node.i === Math.round(n(cfg.sustainIndex, -1)) ? sustainCss : nodeCss}
            stroke="rgba(0,0,0,0.5)" stroke-width="1"
            class:active={node.i === activeIndex} />
    {#if linked}
      {@const stage = points[node.i].id}
      <!-- A dark edge under the letter, so where it does meet the line it is still a letter. -->
      <text class="stage-letter" x={labelAt[node.i]?.x ?? node.px} y={labelAt[node.i]?.y ?? node.py - 8}
        fill={node.i === activeIndex ? sustainCss : nodeCss} text-anchor="middle" dominant-baseline="central"
        font-size="9" font-weight="700" font-family="sans-serif"
      >{stage.slice(0,1).toUpperCase()}</text>
    {/if}
    {/if}
  {/each}
  {#if linked && activeIndex > 0 && points[activeIndex]}
    {@const stage = points[activeIndex].id}
    <!-- The value being dragged. It was 8px, small enough that the stage letter in it was a guess. -->
    <text class="stage-letter" x={width - 7} y={13} text-anchor="end" fill={nodeCss} font-size="11" font-weight="700" font-family="monospace"
    >{stage === 'sustain' ? 'HOLD (view only)' : stage === 'decay' && linked.sustain
      ? `D ${cfg.__stageValues?.decay ?? linked.decay.defaultValue} / S ${cfg.__stageValues?.sustain ?? linked.sustain.defaultValue}`
      : `${stage.slice(0,1).toUpperCase()} ${cfg.__stageValues?.[stage] ?? linked[stage]?.defaultValue}`}</text>
  {/if}
</svg>

<style>
  .envelope { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
  circle.active { filter: drop-shadow(0 0 3px rgba(255,255,255,0.6)); }
  .stage-letter { paint-order: stroke; stroke: rgba(0, 0, 0, 0.85); stroke-width: 3px; stroke-linejoin: round; }
</style>
