<script>
  // Timbre Space — a 2D "sound map". Each anchor paints a soft colour region;
  // the puck blends the anchors (inverse-distance) and its glow tints toward the
  // nearest patches. Axis labels name the perceptual directions; a corner readout
  // reports how many targets are actually MIDI-addressable. Visual only — the
  // puck / anchor drag is driven by the preview surface (shared timbreLayout
  // geometry, pad = 10). Live puck arrives via Timbre.__x/__y, a drag via __drag.
  import {
    timbreConfig, timbreTargets, timbreAnchors, timbrePuck, anchorWeights,
    timbreGeometry, timbreToPx, timbreAddressableCount,
  } from '../utils/timbreLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

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
  const ANCHOR_PALETTE = ['rgba(91,155,213,1)', 'rgba(242,153,74,1)', 'rgba(57,217,138,1)', 'rgba(155,138,255,1)', 'rgba(242,201,76,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(timbreConfig(control));
  let geom = $derived(timbreGeometry(width, height, PAD));
  let targets = $derived(timbreTargets(control));
  let anchors = $derived(timbreAnchors(control));
  let puck = $derived({
    x: cfg.__x !== undefined ? n(cfg.__x, 0.5) : n(cfg.x, 0.5),
    y: cfg.__y !== undefined ? n(cfg.__y, 0.5) : n(cfg.y, 0.5),
  });
  let dragKind = $derived(String(cfg.__drag ?? ''));  // 'puck' | 'anchor:N'

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(12,12,18,1)'));
  let puckCss = $derived(css(cfg.puckColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, Math.min(n(font?.size, 11), 13)));

  let anchorPx = $derived(anchors.map((a, i) => ({
    a, i,
    q: timbreToPx(a, geom),
    colour: a.colour ? css(a.colour) : ANCHOR_PALETTE[i % ANCHOR_PALETTE.length],
  })));
  let puckPx = $derived(timbreToPx(puck, geom));
  let weights = $derived(anchorWeights(anchors, puck.x, puck.y, n(cfg.power, 2)));
  // Puck glow tint = weighted blend of anchor colours (dominant patch wins).
  let readout = $derived(timbreAddressableCount(control));

  // Label anchoring so text stays inside the pad.
  function anchorText(q) {
    const right = q.px > geom.x0 + geom.w * 0.6;
    return { x: right ? q.px - 10 : q.px + 10, anchor: right ? 'end' : 'start' };
  }
</script>

<svg class="timbre" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <defs>
    {#each anchorPx as ap (ap.i)}
      <radialGradient id={`tsHeat-${ap.i}`} gradientUnits="userSpaceOnUse" cx={ap.q.px} cy={ap.q.py} r={Math.max(20, Math.min(geom.w, geom.h) * 0.6)}>
        <stop offset="0" stop-color={ap.colour} stop-opacity="0.34" />
        <stop offset="1" stop-color={ap.colour} stop-opacity="0" />
      </radialGradient>
    {/each}
  </defs>

  <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx="8" fill={fieldCss} stroke="rgba(36,36,48,1)" />
  {#if cfg.showField !== false}
    {#each anchorPx as ap (ap.i)}
      <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx="8" fill={`url(#tsHeat-${ap.i})`} />
    {/each}
  {/if}

  <!-- anchors -->
  {#if cfg.showAnchors !== false}
    {#each anchorPx as ap (ap.i)}
      {@const at = anchorText(ap.q)}
      {@const dragging = dragKind === `anchor:${ap.i}`}
      <circle cx={ap.q.px} cy={ap.q.py} r={dragging ? 9 : 7} fill={ap.colour} stroke={dragging ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.5)'} stroke-width={dragging ? 2 : 1} />
      <text x={at.x} y={ap.q.py + 4} font-size={labelSize} fill={labelCss} text-anchor={at.anchor} style="font-weight:600" opacity="0.92">{ap.a.label}</text>
    {/each}
  {/if}

  <!-- puck -->
  <circle cx={puckPx.px} cy={puckPx.py} r="16" fill={puckCss} opacity="0.18" />
  <circle cx={puckPx.px} cy={puckPx.py} r="9" fill={puckCss} stroke={dragKind === 'puck' ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.5)'} stroke-width={dragKind === 'puck' ? 2 : 1} />
  <circle cx={puckPx.px - 3} cy={puckPx.py - 3} r="3" fill="rgba(255,255,255,0.85)" />

  <!-- axis labels -->
  <text x={geom.x0 + geom.w / 2} y={geom.y0 + geom.h - 5} font-size={labelSize} fill={labelCss} text-anchor="middle" opacity="0.75" style="letter-spacing:.04em">{cfg.axisX ?? ''}</text>
  <text x={geom.x0 + 4} y={geom.y0 + geom.h / 2} font-size={labelSize} fill={labelCss} text-anchor="middle" opacity="0.75" style="letter-spacing:.04em" transform={`rotate(-90 ${geom.x0 + 4} ${geom.y0 + geom.h / 2})`}>{cfg.axisY ?? ''}</text>

  <!-- honesty readout -->
  {#if cfg.showReadout !== false && readout.total > 0}
    <text x={geom.x0 + geom.w - 6} y={geom.y0 + 14} font-size={Math.max(8, labelSize - 2)} fill={readout.addressable < readout.total ? 'rgba(242,153,74,0.9)' : 'rgba(140,140,150,0.8)'} text-anchor="end">
      {readout.addressable}/{readout.total} MIDI
    </text>
  {/if}
</svg>

<style>
  .timbre { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
