<script>
  // Turing Modulator — a row of step bars (height = value), the live step glowing,
  // an optional gate row, and a "lock ↔ evolve" hint from the randomness. Visual
  // only; the clock + mutation are driven by the preview surface, which shares
  // turingLayout geometry (pad = 8). Live clock arrives via Turing.__phase, the
  // evolving register via Turing.__steps.
  import {
    turingConfig, turingSteps, turingLength, turingStepIndex, stepOutput, gateAt,
    turingGeometry, stepRect,
  } from '../utils/turingLayout.js';

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

  let cfg = $derived(turingConfig(control));
  let steps = $derived(turingSteps(control));
  let length = $derived(turingLength(control));
  let quant = $derived(n(cfg.quantizeLevels, 0));
  let gateThresh = $derived(n(cfg.gateThreshold, 0.5));
  let head = $derived(turingStepIndex(control));

  let showGate = $derived(cfg.showGate !== false);
  let gateH = $derived(showGate ? 10 : 0);
  let geom = $derived(turingGeometry(width, height - gateH, length, PAD));

  let barCss = $derived(css(cfg.barColour, 'rgba(57,217,138,1)'));
  let headCss = $derived(css(cfg.headColour, 'rgba(242,201,76,1)'));
  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(14,14,19,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let bars = $derived.by(() => steps.map((s, i) => {
    const v = stepOutput(steps, i, quant);
    const r = stepRect(geom, i, v);
    return { i, v, r, isHead: i === head, gate: gateAt(steps, i, gateThresh) === 1 };
  }));
  let rnd = $derived(Math.max(0, Math.min(1, n(cfg.randomness, 0))));
</script>

<svg class="turing" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#each bars as b (b.i)}
    <!-- track well -->
    <rect x={b.r.x} y={b.r.topY} width={b.r.w} height={b.r.fullH} rx="2" fill="rgba(255,255,255,0.04)" />
    <!-- value bar -->
    <rect x={b.r.x} y={b.r.y} width={b.r.w} height={b.r.h} rx="2" fill={b.isHead ? headCss : barCss} opacity={b.isHead ? 1 : 0.72} />
    <!-- head column highlight -->
    {#if b.isHead}
      <rect x={b.r.x} y={b.r.topY} width={b.r.w} height={b.r.fullH} rx="2" fill="none" stroke={headCss} stroke-width="1.5" opacity="0.9" />
    {/if}
  {/each}

  <!-- gate row -->
  {#if showGate}
    {#each bars as b (b.i)}
      <circle cx={b.r.x + b.r.w / 2} cy={height - gateH / 2} r={Math.min(3.5, b.r.w / 2 - 0.5)}
              fill={b.gate ? (b.isHead ? headCss : barCss) : 'rgba(255,255,255,0.12)'} opacity={b.gate ? (b.isHead ? 1 : 0.8) : 1} />
    {/each}
  {/if}

  <!-- lock ↔ evolve hint -->
  <text x={geom.x0 + geom.w} y={geom.y0 + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.6">
    {rnd <= 0.001 ? 'locked' : rnd >= 0.999 ? 'chaos' : `evolve ${Math.round(rnd * 100)}%`}
  </text>
</svg>

<style>
  .turing { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
