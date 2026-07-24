<script>
  // Macro — a "super-knob": a knob dial (value arc + pointer) plus assignment
  // lanes, each showing its destination, depth/curve chip and the live resolved
  // value. Visual only; the knob drag is driven by the preview surface, which
  // shares macroLayout geometry. Live value arrives via Macro.__value.
  import {
    macroConfig, macroValue, macroSlots, macroSlotValue,
    macroGeometry, macroKnobAngle,
  } from '../utils/macroLayout.js';

  let { control = null, width = 0, height = 0, dragging = false } = $props();

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
  const LANE_PALETTE = ['rgba(57,217,138,1)', 'rgba(91,155,213,1)', 'rgba(242,201,76,1)', 'rgba(242,153,74,1)', 'rgba(155,138,255,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(macroConfig(control));
  let value = $derived(cfg.__value !== undefined ? Math.max(0, Math.min(1, n(cfg.__value, 0.5))) : macroValue(control));
  let slots = $derived(macroSlots(control));
  let geom = $derived(macroGeometry(width, height, control));

  let arcCss = $derived(css(cfg.arcColour, 'rgba(91,155,213,1)'));
  let knobCss = $derived(css(cfg.knobColour, 'rgba(35,35,42,1)'));
  let trackCss = $derived(css(cfg.trackColour, 'rgba(14,14,18,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  // Knob arc geometry.
  function polar(cx, cy, r, deg) { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcPath(r, from, to) {
    const [ax, ay] = polar(geom.knobCX, geom.knobCY, r, from);
    const [bx, by] = polar(geom.knobCX, geom.knobCY, r, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M ${ax.toFixed(1)} ${ay.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  let angle = $derived(macroKnobAngle(value));
  let pointer = $derived(polar(geom.knobCX, geom.knobCY, geom.knobR * 0.72, angle));
  let arcR = $derived(geom.knobR + 6);

  // Lane rows.
  let laneRows = $derived.by(() => {
    if (!geom.showLanes) return [];
    const rowH = Math.min(26, (geom.knobBox) / Math.max(1, slots.length));
    const totalH = rowH * slots.length;
    const y0 = geom.knobCY - totalH / 2;
    const valW = cfg.showValues !== false ? 32 : 0;
    const labelW = Math.round(Math.min(geom.lanesW * 0.46, Math.max(70, geom.lanesW - valW - 90)));
    return slots.map((s, i) => {
      const val = s.enabled ? macroSlotValue(value, s) : 0;
      const trackX = geom.lanesX0 + labelW + 8;
      const trackW = Math.max(8, geom.lanesX0 + geom.lanesW - valW - 6 - trackX);
      return {
        i, s, val,
        y: y0 + i * rowH, rowH, labelW,
        trackX, trackW, valW,
        colour: s.colour ? css(s.colour) : LANE_PALETTE[i % LANE_PALETTE.length],
      };
    });
  });
  let labelSize = $derived(Math.max(8, Math.min(n(font?.size, 11), 12)));
</script>

<svg class="macro" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <defs>
    <radialGradient id="macroFace" cx="50%" cy="36%" r="72%">
      <stop offset="0" stop-color="rgba(255,255,255,0.14)" />
      <stop offset="1" stop-color="rgba(0,0,0,0.22)" />
    </radialGradient>
  </defs>

  <!-- Knob -->
  <circle cx={geom.knobCX} cy={geom.knobCY} r={arcR + 4} fill="rgba(0,0,0,0.35)" />
  <path d={arcPath(arcR, 135, 405)} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="5" stroke-linecap="round" />
  {#if value > 0}
    <path d={arcPath(arcR, 135, angle)} fill="none" stroke={arcCss} stroke-width="5" stroke-linecap="round" />
  {/if}
  <circle cx={geom.knobCX} cy={geom.knobCY} r={geom.knobR} fill={knobCss} stroke="rgba(0,0,0,0.6)" stroke-width="1" />
  <circle cx={geom.knobCX} cy={geom.knobCY} r={geom.knobR} fill="url(#macroFace)" />
  <line x1={geom.knobCX} y1={geom.knobCY} x2={pointer[0]} y2={pointer[1]} stroke={dragging ? 'rgba(255,255,255,1)' : 'rgba(240,240,245,0.92)'} stroke-width="3" stroke-linecap="round" />

  <!-- Knob readout / label -->
  {#if cfg.showValues !== false}
    <text x={geom.knobCX} y={geom.knobCY + geom.knobR + 15} font-size={Math.max(12, geom.knobR * 0.42)} fill="rgba(240,240,245,0.95)" text-anchor="middle" style="font-variant-numeric:tabular-nums;font-weight:700">{Math.round(value * 100)}</text>
  {/if}
  {#if cfg.label}
    <text x={geom.knobCX} y={geom.knobCY - geom.knobR - 7} font-size={labelSize} fill={labelCss} text-anchor="middle" style="letter-spacing:.12em;text-transform:uppercase" opacity="0.85">{cfg.label}</text>
  {/if}

  <!-- Lanes -->
  <defs>
    {#each laneRows as row (row.i)}
      <clipPath id={`lbl-${row.i}`}><rect x={geom.lanesX0} y={row.y} width={row.labelW} height={row.rowH} /></clipPath>
    {/each}
  </defs>
  {#each laneRows as row (row.i)}
    {@const cy = row.y + row.rowH / 2}
    <text x={geom.lanesX0} y={cy} font-size={labelSize} clip-path={`url(#lbl-${row.i})`}
          fill={row.s.enabled ? 'rgba(220,220,228,1)' : 'rgba(150,150,160,0.5)'} dominant-baseline="middle" style="letter-spacing:.01em">{row.s.label}</text>
    <rect x={row.trackX} y={cy - 4} width={row.trackW} height="8" rx="4" fill={trackCss} />
    <rect x={row.trackX} y={cy - 4} width={Math.max(0, row.val * row.trackW)} height="8" rx="4" fill={row.colour} opacity={row.s.enabled ? 1 : 0.4} />
    {#if row.valW > 0}
      <text x={geom.lanesX0 + geom.lanesW} y={cy} font-size={Math.max(8, labelSize - 1)} fill="rgba(232,232,238,1)" text-anchor="end" dominant-baseline="middle" style="font-variant-numeric:tabular-nums">{Math.round(row.val * 100)}%</text>
    {/if}
  {/each}
</svg>

<style>
  .macro { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
