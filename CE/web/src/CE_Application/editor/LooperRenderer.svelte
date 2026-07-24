<script>
  // Gesture Looper — a stack of lanes, each showing its recorded value-over-loop
  // gesture as a filled curve, with a shared playhead sweeping the loop. Visual
  // only; recording + the clock are driven by the preview surface, which shares
  // looperLayout geometry (pad = 8). Live clock arrives via Looper.__phase, the
  // in-progress recording via Looper.__recLane / __recPoints.
  import {
    looperConfig, looperPhase, looperLanes, looperGeometry, laneRect, laneToPx,
    normalizeGesture, laneValueAt,
  } from '../utils/looperLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
  const SAMPLES = 48; // curve resolution per lane
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
  const LANE_PALETTE = ['rgba(57,217,138,1)', 'rgba(91,155,213,1)', 'rgba(242,153,74,1)', 'rgba(155,138,255,1)', 'rgba(242,201,76,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(looperConfig(control));
  let phase = $derived(looperPhase(control));
  let lanes = $derived(looperLanes(control));
  let geom = $derived(looperGeometry(width, height, Math.max(1, lanes.length), PAD));

  let laneCss = $derived(css(cfg.laneColour, 'rgba(14,14,19,1)'));
  let gridCss = $derived(css(cfg.gridColour, 'rgba(255,255,255,0.13)'));
  let playCss = $derived(css(cfg.playheadColour, 'rgba(255,255,255,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, Math.min(n(font?.size, 10), 12)));

  let recLane = $derived(cfg.__recLane !== undefined && cfg.__recLane !== null ? n(cfg.__recLane, -1) : -1);

  // Per-lane render model: rect, colour, gesture path, live dot, playhead value.
  let rows = $derived.by(() => lanes.map((l, i) => {
    const rect = laneRect(geom, i);
    const colour = l.colour ? css(l.colour) : LANE_PALETTE[i % LANE_PALETTE.length];
    // In-progress recording overrides the stored points for this lane.
    const pts = (recLane === i && Array.isArray(cfg.__recPoints)) ? normalizeGesture(cfg.__recPoints) : l.points;
    let d = '';
    let fill = '';
    if (pts.length >= 2) {
      const step = [];
      for (let k = 0; k <= SAMPLES; k += 1) {
        const t = k / SAMPLES;
        const q = laneToPx(rect, t, laneValueAt(pts, t, l.rest));
        step.push(`${q.px.toFixed(1)},${q.py.toFixed(1)}`);
      }
      d = `M ${step.join(' L ')}`;
      const base = rect.y + rect.h;
      fill = `${d} L ${(rect.x + rect.w).toFixed(1)} ${base.toFixed(1)} L ${rect.x.toFixed(1)} ${base.toFixed(1)} Z`;
    }
    const headV = pts.length ? laneValueAt(pts, phase, l.rest) : l.rest;
    const head = laneToPx(rect, phase, headV);
    return { i, l, rect, colour, d, fill, head, hasGesture: pts.length >= 2, recording: recLane === i };
  }));
</script>

<svg class="looper" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  {#each rows as row (row.i)}
    <rect x={row.rect.x} y={row.rect.y} width={row.rect.w} height={row.rect.h} rx="6" fill={laneCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />
    {#if cfg.showGrid !== false}
      {#each [0.25, 0.5, 0.75] as g (g)}
        <line x1={row.rect.x + row.rect.w * g} y1={row.rect.y} x2={row.rect.x + row.rect.w * g} y2={row.rect.y + row.rect.h} stroke={gridCss} stroke-width="1" />
      {/each}
      <line x1={row.rect.x} y1={row.rect.y + row.rect.h / 2} x2={row.rect.x + row.rect.w} y2={row.rect.y + row.rect.h / 2} stroke={gridCss} stroke-width="1" opacity="0.6" />
    {/if}

    {#if row.hasGesture}
      <path d={row.fill} fill={row.colour} opacity="0.16" />
      <path d={row.d} fill="none" stroke={row.colour} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity={row.l.enabled ? 1 : 0.4} />
    {:else}
      <text x={row.rect.x + row.rect.w / 2} y={row.rect.y + row.rect.h / 2 + 3} font-size={labelSize} fill="rgba(140,140,150,0.7)" text-anchor="middle">
        {row.recording ? 'recording…' : 'press & move to record'}
      </text>
    {/if}

    <!-- lane label + REC dot -->
    <text x={row.rect.x + 6} y={row.rect.y + 12} font-size={labelSize} fill={row.l.enabled ? labelCss : 'rgba(150,150,160,0.5)'} style="letter-spacing:.02em">{row.l.label}</text>
    {#if row.recording}
      <circle cx={row.rect.x + row.rect.w - 10} cy={row.rect.y + 10} r="4" fill="rgba(235,87,87,1)" />
    {/if}

    <!-- playhead dot on the lane -->
    {#if row.hasGesture}
      <circle cx={row.head.px} cy={row.head.py} r="3.5" fill={playCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />
    {/if}
  {/each}

  <!-- shared playhead -->
  {#if cfg.showPlayhead !== false}
    {@const hx = geom.x0 + phase * geom.w}
    <line x1={hx} y1={geom.y0} x2={hx} y2={geom.y0 + geom.h} stroke={playCss} stroke-width="1.5" opacity="0.55" />
  {/if}
</svg>

<style>
  .looper { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
