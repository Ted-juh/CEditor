<script>
  // Expression Router — a source chip + live input bar, a drawable transfer curve
  // (dead-zone shaded, editable nodes, live input→output crosshair) and the
  // destination lanes it fans to. Visual only; the curve-node drag + the live
  // input are driven by the preview surface, which shares routerLayout geometry.
  // Live input arrives via Router.__input, a dragged node index via Router.__drag.
  import {
    routerConfig, routerInput, routerCurvePoints, routerCurveValue, routerDests,
    routerDestValue, routerGeometry, routerNodeToPx, routerCrosshairPx, routerSourceLabel,
    shapeInput,
  } from '../utils/routerLayout.js';
  import { envPath } from '../utils/envelopeLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
  const HEADER = 26;   // source chip / input bar row
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
  const DEST_PALETTE = ['rgba(57,217,138,1)', 'rgba(91,155,213,1)', 'rgba(155,138,255,1)', 'rgba(242,153,74,1)', 'rgba(242,201,76,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(routerConfig(control));
  let input = $derived(routerInput(control));
  let points = $derived(routerCurvePoints(control));
  let dests = $derived(routerDests(control));
  let curveOut = $derived(routerCurveValue(control));
  let dragIndex = $derived(cfg.__drag !== undefined && cfg.__drag !== null ? n(cfg.__drag, -1) : -1);

  let curveCss = $derived(css(cfg.curveColour, 'rgba(57,217,138,1)'));
  let inputCss = $derived(css(cfg.inputColour, 'rgba(242,201,76,1)'));
  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(10,10,15,1)'));
  let gridCss = $derived(css(cfg.gridColour, 'rgba(255,255,255,0.09)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, Math.min(n(font?.size, 11), 12)));

  // Split the body: transfer curve on the left, destination lanes on the right.
  let bodyY = $derived(PAD + HEADER);
  let bodyH = $derived(Math.max(20, height - bodyY - PAD));
  let curveW = $derived(Math.round((width - PAD * 2) * 0.52));
  let curveGeom = $derived(routerGeometry(curveW + PAD * 2, bodyH + PAD * 2, PAD));
  // Shift the curve geometry into place (it's computed from 0; offset by bodyY-PAD).
  let gy = $derived(bodyY - PAD);

  let cross = $derived(routerCrosshairPx(control, curveGeom));
  let curveD = $derived(points.length >= 2 ? envPath(points, curveGeom) : '');
  let dzX = $derived(routerNodeToPx({ x: n(cfg.deadzone, 0), y: 0 }, curveGeom).px);

  // Destination lane rows on the right.
  let lanesX = $derived(PAD + curveW + 14);
  let lanesW = $derived(Math.max(30, width - PAD - lanesX));
  let laneRows = $derived.by(() => {
    const rowH = Math.min(28, bodyH / Math.max(1, dests.length));
    const totalH = rowH * dests.length;
    const y0 = bodyY + (bodyH - totalH) / 2;
    return dests.map((d, i) => ({
      i, d,
      y: y0 + i * rowH, rowH,
      val: d.enabled ? routerDestValue(curveOut, d) : d.min,
      colour: d.colour ? css(d.colour) : DEST_PALETTE[i % DEST_PALETTE.length],
    }));
  });
  let inBarW = $derived(Math.max(24, (width - PAD * 2) * 0.42));
  let inBarX = $derived(width - PAD - inBarW);
</script>

<svg class="router" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <!-- Header: source chip + live input bar -->
  <rect x={PAD} y={PAD} width={Math.min(140, (width - PAD * 2) * 0.5)} height="20" rx="10" fill="rgba(23,23,32,1)" stroke="rgba(58,58,72,1)" />
  <circle cx={PAD + 12} cy={PAD + 10} r="4" fill={inputCss} />
  <text x={PAD + 21} y={PAD + 14} font-size={labelSize} fill={labelCss}>{routerSourceLabel(cfg.source ?? 'modwheel')}</text>
  <rect x={inBarX} y={PAD + 2} width={inBarW} height="16" rx="8" fill="rgba(10,10,15,1)" stroke="rgba(32,32,42,1)" />
  <rect x={inBarX} y={PAD + 2} width={Math.max(0, input * inBarW)} height="16" rx="8" fill={inputCss} opacity="0.6" />

  <!-- Transfer curve -->
  <g transform={`translate(0 ${gy})`}>
    <rect x={curveGeom.x0} y={curveGeom.y0} width={curveGeom.w} height={curveGeom.h} rx="6" fill={fieldCss} stroke="rgba(32,32,42,1)" />
    {#if cfg.showGrid !== false}
      {#each [0.25, 0.5, 0.75] as g (g)}
        <line x1={curveGeom.x0 + curveGeom.w * g} y1={curveGeom.y0} x2={curveGeom.x0 + curveGeom.w * g} y2={curveGeom.y0 + curveGeom.h} stroke={gridCss} />
        <line x1={curveGeom.x0} y1={curveGeom.y0 + curveGeom.h * g} x2={curveGeom.x0 + curveGeom.w} y2={curveGeom.y0 + curveGeom.h * g} stroke={gridCss} />
      {/each}
    {/if}
    <!-- dead-zone shading -->
    {#if n(cfg.deadzone, 0) > 0}
      <rect x={curveGeom.x0} y={curveGeom.y0} width={Math.max(0, dzX - curveGeom.x0)} height={curveGeom.h} fill="rgba(235,87,87,0.09)" />
    {/if}
    <!-- live input → output crosshair -->
    <line x1={cross.ix} y1={curveGeom.y0} x2={cross.ix} y2={curveGeom.y0 + curveGeom.h} stroke={inputCss} stroke-width="1" opacity="0.5" />
    <line x1={curveGeom.x0} y1={cross.oy} x2={curveGeom.x0 + curveGeom.w} y2={cross.oy} stroke={curveCss} stroke-width="1" opacity="0.4" />
    <!-- curve -->
    {#if curveD}
      <path d={curveD} fill="none" stroke={curveCss} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    {/if}
    <!-- editable nodes -->
    {#each points as p, i (p.id ?? i)}
      {@const q = routerNodeToPx(p, curveGeom)}
      <circle cx={q.px} cy={q.py} r={dragIndex === i ? 5.5 : 4} fill={dragIndex === i ? 'rgba(255,255,255,1)' : 'rgba(240,240,245,0.9)'} stroke="rgba(0,0,0,0.5)" stroke-width="1" />
    {/each}
    <!-- live output dot -->
    <circle cx={cross.ix} cy={cross.oy} r="4.5" fill={inputCss} stroke="rgba(10,10,15,1)" stroke-width="1.5" />
  </g>

  <!-- Destination lanes -->
  {#each laneRows as row (row.i)}
    {@const cy = row.y + row.rowH / 2}
    {@const trackX = lanesX + 4}
    {@const trackW = Math.max(8, lanesW - 8 - 34)}
    <text x={lanesX + 4} y={cy - 5} font-size={labelSize} fill={row.d.enabled ? 'rgba(220,220,228,1)' : 'rgba(150,150,160,0.5)'}>{row.d.label}</text>
    <rect x={trackX} y={cy + 1} width={trackW} height="7" rx="3.5" fill="rgba(14,14,18,1)" />
    <rect x={trackX} y={cy + 1} width={Math.max(0, row.val * trackW)} height="7" rx="3.5" fill={row.colour} opacity={row.d.enabled ? 1 : 0.4} />
    <text x={lanesX + lanesW} y={cy + 8} font-size={Math.max(8, labelSize - 1)} fill="rgba(232,232,238,1)" text-anchor="end" style="font-variant-numeric:tabular-nums">{Math.round(row.val * 100)}</text>
  {/each}
</svg>

<style>
  .router { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
