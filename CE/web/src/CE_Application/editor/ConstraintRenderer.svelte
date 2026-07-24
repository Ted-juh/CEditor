<script>
  // Constraint Cell — a row of linked value bars with a rule badge. Dragging one
  // bar moves the others so the relationship holds (the preview surface runs the
  // solver). A chain glyph over the bars signals they're linked. Visual only;
  // live values arrive via Constraint.__values, a dragged index via __drag.
  import {
    constraintConfig, constraintMembers, constraintMode, constraintModeLabel,
    constraintGeometry, barRect,
  } from '../utils/constraintLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
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
  const MEMBER_PALETTE = ['rgba(57,217,138,1)', 'rgba(91,155,213,1)', 'rgba(155,138,255,1)', 'rgba(242,153,74,1)', 'rgba(242,201,76,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(constraintConfig(control));
  let mode = $derived(constraintMode(control));
  let members = $derived(constraintMembers(control));  // honors live __values
  let dragIndex = $derived(cfg.__drag !== undefined && cfg.__drag !== null ? n(cfg.__drag, -1) : -1);

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(14,14,19,1)'));
  let trackCss = $derived(css(cfg.trackColour, 'rgba(255,255,255,0.09)'));
  let linkCss = $derived(css(cfg.linkColour, 'rgba(242,201,76,0.33)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(7, Math.min(n(font?.size, 10), 12)));

  let geom = $derived(constraintGeometry(width, height, Math.max(1, members.length), PAD, 16));
  let bars = $derived.by(() => members.map((m, i) => ({
    m, i,
    r: barRect(geom, i, m.value),
    colour: m.colour ? css(m.colour) : MEMBER_PALETTE[i % MEMBER_PALETTE.length],
    isDrag: i === dragIndex,
  })));
  // The chain glyph runs across the bar tops (only when a rule links them).
  let linked = $derived(mode !== 'free' && bars.length > 1);
  let linkPts = $derived(bars.map((b) => `${b.r.cx.toFixed(1)},${(b.r.y).toFixed(1)}`).join(' '));
</script>

<svg class="constraint" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#each bars as b (b.i)}
    <rect x={b.r.x} y={b.r.topY} width={b.r.w} height={b.r.fullH} rx="3" fill={trackCss} />
    <rect x={b.r.x} y={b.r.y} width={b.r.w} height={b.r.h} rx="3" fill={b.colour} opacity={b.isDrag ? 1 : 0.85} />
    {#if b.isDrag}
      <rect x={b.r.x} y={b.r.topY} width={b.r.w} height={b.r.fullH} rx="3" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" />
    {/if}
  {/each}

  <!-- link chain across the bar tops -->
  {#if linked}
    <polyline points={linkPts} fill="none" stroke={linkCss} stroke-width="1.5" stroke-dasharray="3 3" />
    {#each bars as b (b.i)}
      <circle cx={b.r.cx} cy={b.r.y} r="2.5" fill={linkCss} />
    {/each}
  {/if}

  <!-- per-member value + label -->
  {#each bars as b (b.i)}
    {#if cfg.showValues !== false}
      <text x={b.r.cx} y={Math.max(geom.y0 + 9, b.r.y - 3)} font-size={Math.max(7, labelSize - 1)} fill="rgba(232,232,238,0.95)" text-anchor="middle" style="font-variant-numeric:tabular-nums">{Math.round(b.m.value * 100)}</text>
    {/if}
    <text x={b.r.cx} y={geom.y0 + geom.h + 12} font-size={labelSize} fill={labelCss} text-anchor="middle" style="letter-spacing:.01em">{b.m.label}</text>
  {/each}

  <!-- rule badge -->
  {#if cfg.showBadge !== false}
    <text x={geom.x0 + 1} y={geom.y0 + 9} font-size={Math.max(7, labelSize - 1)} fill={css(cfg.linkColour, 'rgba(242,201,76,0.95)')} text-anchor="start" opacity="0.95" style="font-weight:600">{constraintModeLabel(mode)}</text>
  {/if}
</svg>

<style>
  .constraint { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
