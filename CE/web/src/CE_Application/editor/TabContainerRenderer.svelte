<script>
  // Tab Container — the strip. The PAGE is drawn by the container's own children rendering, which
  // is why this file draws only the tabs: the page area is a normal container and every layout,
  // selection and drag behaviour that already works there keeps working.
  //
  // Which children are on the active page is decided in `tabContainerLayout.js` and applied where
  // children are laid out, not here — a renderer that hid children itself would leave them
  // selectable, draggable and exportable while invisible.
  import { activePageIndex, tabGeometry, tabPages, tabRect } from '../utils/tabContainerLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    return fallback;
  }

  let cfg = $derived(control?._children?.TabContainer ?? {});
  let pages = $derived(tabPages(control));
  let geom = $derived(tabGeometry(width, height, control));
  let active = $derived(activePageIndex(control));

  let stripCss = $derived(css(cfg.stripColour, 'rgba(27,27,32,1)'));
  let tabCss = $derived(css(cfg.tabColour, 'rgba(38,38,46,1)'));
  let activeCss = $derived(css(cfg.activeTabColour, 'rgba(58,90,128,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let activeLabelCss = $derived(css(cfg.activeLabelColour, 'rgba(255,255,255,1)'));
</script>

{#if cfg.showStrip !== false}
  <svg class="tabs" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} width={width} height={height} aria-hidden="true">
    <rect x={geom.strip.x} y={geom.strip.y} width={geom.strip.w} height={geom.strip.h} fill={stripCss} />
    {#each pages as page, index (page.id ?? index)}
      {@const rect = tabRect(geom, index, pages.length)}
      <rect
        x={rect.x + 1} y={rect.y + 1} width={Math.max(1, rect.w - 2)} height={Math.max(1, rect.h - 2)}
        rx={3}
        fill={index === active ? activeCss : tabCss}
      />
      <text
        x={rect.x + rect.w / 2} y={rect.y + rect.h / 2 + 3.5}
        fill={index === active ? activeLabelCss : labelCss}
        font-size={Math.min(11, rect.h * 0.5)}
        text-anchor="middle"
      >{page.label ?? `Page ${index + 1}`}</text>
    {/each}
  </svg>
{/if}

<style>
  .tabs { display: block; position: absolute; inset: 0; pointer-events: none; }
  text { font-family: inherit; user-select: none; }
</style>
