<script>
  // Scroll Area — the scrollbars. The clipping and the child offset belong to the container's own
  // layout, for the same reason the tab container's page does: a renderer that moved children
  // itself would leave selection, drag and export reading the unmoved positions.
  //
  // A scrollbar appears only when there is something past the edge. A permanent one that never
  // moves is a promise the component is not keeping.
  import { scrollConfig, scrollGeometry, thumbRect } from '../utils/scrollAreaLayout.js';

  let { control = null, width = 0, height = 0, offset = null } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    return fallback;
  }

  let cfg = $derived(scrollConfig(control));
  let at = $derived(offset ?? { x: cfg.scrollX ?? 0, y: cfg.scrollY ?? 0 });
  let geom = $derived(scrollGeometry(width, height, control));
  let vThumb = $derived(geom.showY ? thumbRect('y', at, width, height, control) : null);
  let hThumb = $derived(geom.showX ? thumbRect('x', at, width, height, control) : null);

  let trackCss = $derived(css(cfg.trackColour, 'rgba(26,26,26,1)'));
  let thumbCss = $derived(css(cfg.thumbColour, 'rgba(69,69,80,1)'));
</script>

<svg class="scroll" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} width={width} height={height} aria-hidden="true">
  {#if geom.showY}
    <rect x={geom.viewport.w} y={0} width={geom.bar} height={geom.viewport.h} fill={trackCss} />
    {#if vThumb}
      <rect x={vThumb.x + 1.5} y={vThumb.y} width={Math.max(1, vThumb.w - 3)} height={vThumb.h} rx={3} fill={thumbCss} />
    {/if}
  {/if}
  {#if geom.showX}
    <rect x={0} y={geom.viewport.h} width={geom.viewport.w} height={geom.bar} fill={trackCss} />
    {#if hThumb}
      <rect x={hThumb.x} y={hThumb.y + 1.5} width={hThumb.w} height={Math.max(1, hThumb.h - 3)} rx={3} fill={thumbCss} />
    {/if}
  {/if}
</svg>

<style>
  .scroll { display: block; position: absolute; inset: 0; pointer-events: none; }
</style>
