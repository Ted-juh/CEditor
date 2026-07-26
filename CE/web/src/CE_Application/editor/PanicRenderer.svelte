<script>
  // Panic — a button face. Deliberately styled like the emergency control it is:
  // red-bordered, high-contrast label, and it flashes when fired so you can see
  // it went out even though the result (silence) is invisible. Visual only; the
  // sending lives in the preview surface. The flash arrives via Panic.__flash.
  import { panicConfig, panicLabel, panicSummary, panicGeometry } from '../utils/panicLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 6;
  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }

  let cfg = $derived(panicConfig(control));
  let geom = $derived(panicGeometry(width, height, PAD));
  let flashing = $derived(cfg.__flash === true);

  let faceCss = $derived(css(cfg.faceColour, 'rgba(42,20,22,1)'));
  let borderCss = $derived(css(cfg.borderColour, 'rgba(224,92,92,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(242,201,76,1)'));
  let flashCss = $derived(css(cfg.flashColour, 'rgba(224,92,92,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let showSummary = $derived(cfg.showSummary !== false && geom.h >= 34);
  let labelSize = $derived(Math.max(10, Math.min(18, geom.h * (showSummary ? 0.36 : 0.46))));
</script>

<svg class="panic" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  {#if flashing}
    <rect x={geom.x - 3} y={geom.y - 3} width={geom.w + 6} height={geom.h + 6} rx="10" fill={flashCss} opacity="0.35" />
  {/if}
  <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h} rx="7"
        fill={flashing ? flashCss : faceCss}
        stroke={borderCss} stroke-width={flashing ? 2.5 : 1.5} />
  <text x={width / 2} y={geom.y + (showSummary ? geom.h * 0.44 : geom.h / 2 + labelSize * 0.35)}
        font-size={labelSize} fill={flashing ? '#fff' : labelCss}
        text-anchor="middle" style="font-weight:800; letter-spacing:1px">{panicLabel(control)}</text>
  {#if showSummary}
    <text x={width / 2} y={geom.y + geom.h - 8} font-size="8.5"
          fill={flashing ? 'rgba(255,255,255,0.85)' : borderCss} text-anchor="middle" opacity="0.85">
      {panicSummary(control)}
    </text>
  {/if}
</svg>

<style>
  .panic { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
