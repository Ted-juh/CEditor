<script>
  // Listbox — an always-open, scrollable list of the control's Value rows with
  // rich rows (icon / subtitle / badge / swatch / section headers), selection
  // styles, zebra / cards, hover, now-playing and a match highlight. Visual
  // only; selection / scroll / hover are driven by the preview surface.
  import {
    listboxRows, listboxConfig, isSelectableRow,
    listboxRowHeight, listboxRowGap, listboxPadTop,
    listboxContentHeight, listboxMaxScroll,
  } from '../utils/listboxLayout.js';

  let {
    control = null, width = 0, height = 0,
    selectedValue = undefined,   // single-select value
    selectedValues = null,       // Set of values (multi-select)
    pendingValue = undefined,    // row awaiting confirm (double/enter modes)
    nowPlayingValue = undefined, // the live/recalled row
    hoveredIndex = -1,           // row under the pointer
    scrollTop = 0,
    matchQuery = '',             // substring to highlight (search)
    filterText = '',             // filter-box query (reduces the visible rows)
  } = $props();

  function css(hex, fallback = 'rgba(224,224,224,1)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    }
    return fallback;
  }

  let cfg = $derived(listboxConfig(control));
  let effFilter = $derived(String(filterText ?? ''));
  let rows = $derived(listboxRows(control, effFilter));
  let rowH = $derived(listboxRowHeight(control));
  let gap = $derived(listboxRowGap(control));
  let padTop = $derived(listboxPadTop(control)); // includes the filter-bar height
  let padBottom = $derived(Math.max(0, Number(control?._children?.ContentLayout?.paddingTop) || 6));
  let effMatch = $derived(String(matchQuery || effFilter || ''));
  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let textCss = $derived(css(control?._children?.Text?._children?.Fill?.colour, 'rgba(224,224,224,1)'));
  let accentCss = $derived(css(cfg.accentColour || control?._children?.Background?._children?.Border?.colour, 'rgba(137,194,255,0.9)'));
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let fontSize = $derived(Math.max(6, Number(font?.size) || 12));
  let fontWeight = $derived(Number(font?.weightValue) || 400);
  let alignH = $derived(String(control?._children?.ContentLayout?.horizontalAlign ?? 'left'));
  let padLeft = $derived(Math.max(0, Number(control?._children?.ContentLayout?.paddingLeft) || 10));

  let selStyle = $derived(String(cfg.selectionStyle ?? 'bar'));
  let stride = $derived(rowH + gap);

  // Sliding selection indicator (animated): the visible-row index of the
  // single-selected row, so a bar can transition between rows.
  let selIndex = $derived.by(() => {
    if (cfg.selectionAnim !== true || cfg.multiSelect === true) return -1;
    return rows.findIndex((r) => r.isHeader !== true && isSelected(r));
  });

  // Scrollbar thumb geometry (visual indicator of position).
  let scrollbarMode = $derived(String(cfg.scrollbar ?? 'auto'));
  let contentH = $derived(listboxContentHeight(control, effFilter));
  let maxScroll = $derived(listboxMaxScroll(control, height, effFilter));
  let showScrollbar = $derived(scrollbarMode !== 'hidden' && maxScroll > 0 && (scrollbarMode === 'always' || scrollbarMode === 'thin' || scrollbarMode === 'auto'));
  let thumb = $derived.by(() => {
    if (!showScrollbar || contentH <= 0) return null;
    const trackH = Math.max(1, height);
    const h = Math.max(18, Math.round((trackH / contentH) * trackH));
    const t = Math.round((Math.max(0, scrollTop) / Math.max(1, maxScroll)) * (trackH - h));
    return { top: Math.max(0, Math.min(trackH - h, t)), height: h };
  });

  function rowValue(row) { return row?.internalValue ?? row?.id ?? ''; }
  function isSelected(row) {
    if (selectedValues && typeof selectedValues.has === 'function') return selectedValues.has(String(rowValue(row)));
    return String(rowValue(row)) === String(selectedValue ?? '');
  }
  function isNowPlaying(row) {
    return nowPlayingValue !== undefined && String(rowValue(row)) === String(nowPlayingValue);
  }
  function isPending(row) {
    return pendingValue !== undefined && pendingValue !== '' && String(rowValue(row)) === String(pendingValue);
  }
  function isImageIcon(icon) {
    const s = String(icon ?? '');
    return s.startsWith('data:') || /^https?:\/\//.test(s) || /\.(png|jpe?g|gif|svg|webp)$/i.test(s);
  }
  // Split a label into [before, match, after] for the highlight span.
  function matchParts(label) {
    const q = String(effMatch ?? '').trim();
    const s = String(label ?? '');
    if (!q) return [s, '', ''];
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return [s, '', ''];
    return [s.slice(0, i), s.slice(i, i + q.length), s.slice(i + q.length)];
  }
</script>

<div
  class="listbox"
  class:zebra={cfg.zebra === true}
  class:fade-edges={cfg.fadeEdges === true}
  role="listbox"
  aria-multiselectable={cfg.multiSelect === true}
  style={`width:${width}px; height:${height}px; color:${textCss}; font-family:${fontFamily}; font-size:${fontSize}px; font-weight:${fontWeight}; padding-top:${padTop}px; padding-bottom:${padBottom}px; --lb-accent:${accentCss};`}
>
  {#if thumb}
    <div class="listbox-scrollbar" class:thin={scrollbarMode === 'thin'}>
      <div class="listbox-thumb" style={`top:${thumb.top}px; height:${thumb.height}px;`}></div>
    </div>
  {/if}
  {#if rows.length === 0}
    <div class="listbox-empty" style={`padding-left:${padLeft}px;`}>{cfg.emptyText ?? 'No items'}</div>
  {:else}
    <div class="listbox-scroll" style={`transform: translateY(${-Math.max(0, scrollTop)}px);`}>
      {#if selIndex >= 0}
        <div class="listbox-sel-indicator" class:ind-outline={selStyle === 'outline'} style={`transform: translateY(${selIndex * stride}px); height:${rowH}px;`}></div>
      {/if}
      {#each rows as row, i (row.id ?? row.internalValue ?? row.displayText)}
        {#if row.isHeader === true}
          <div class="listbox-header" style={`height:${rowH}px; margin-bottom:${gap}px; padding-left:${padLeft}px;`}>{row.displayText ?? ''}</div>
        {:else}
          {@const sel = isSelected(row)}
          {@const disabled = row.enabled === false}
          {@const parts = matchParts(row.displayText)}
          <div
            class="listbox-row"
            class:selected={sel}
            class:disabled
            class:pending={isPending(row) && !sel}
            class:hovered={i === hoveredIndex && cfg.hoverHighlight !== false}
            class:card={cfg.cardRows === true}
            class:sel-bar={sel && selStyle === 'bar' && cfg.selectionAnim !== true}
            class:sel-stripe={sel && selStyle === 'stripe' && cfg.selectionAnim !== true}
            class:sel-outline={sel && selStyle === 'outline' && cfg.selectionAnim !== true}
            class:sel-bold={sel && selStyle === 'bold'}
            class:now-playing={cfg.nowPlaying === true && isNowPlaying(row)}
            class:hov-glow={cfg.hoverAnim === 'glow'}
            class:hov-slide={cfg.hoverAnim === 'slide'}
            class:hov-scale={cfg.hoverAnim === 'scale'}
            class:hov-icon={cfg.hoverAnim === 'icon'}
            role="option"
            aria-selected={sel}
            aria-disabled={disabled}
            style={`height:${rowH}px; margin-bottom:${gap}px; padding-left:${padLeft}px; text-align:${alignH};`}
          >
            {#if cfg.showSwatch === true && row.swatch}
              <span class="lb-swatch" style={`background:${css(row.swatch, 'transparent')};`}></span>
            {/if}
            {#if cfg.showIcons !== false && row.icon}
              {#if isImageIcon(row.icon)}
                <img class="lb-icon" src={row.icon} alt="" style={`width:${Math.round(fontSize * 1.2)}px;height:${Math.round(fontSize * 1.2)}px;`} />
              {:else}
                <span class="lb-icon-glyph">{row.icon}</span>
              {/if}
            {/if}
            <span class="lb-body">
              <span class="lb-label">{parts[0]}{#if parts[1]}<mark class="lb-match">{parts[1]}</mark>{/if}{parts[2]}</span>
              {#if cfg.twoLine === true && row.subtitle}
                <span class="lb-subtitle" style={`font-size:${Math.round(fontSize * 0.82)}px;`}>{row.subtitle}</span>
              {/if}
            </span>
            {#if cfg.showBadges !== false && row.badge}
              <span class="lb-badge">{row.badge}</span>
            {/if}
            {#if sel && selStyle === 'check'}
              <span class="lb-check">✓</span>
            {/if}
            {#if cfg.multiSelect === true}
              <span class="lb-checkbox" class:on={sel}>{sel ? '☑' : '☐'}</span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .listbox {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow: hidden;
    pointer-events: none;
  }
  .listbox-scroll {
    display: flex;
    flex-direction: column;
    will-change: transform;
  }
  .listbox-empty {
    display: flex;
    align-items: center;
    height: 100%;
    opacity: 0.5;
    font-style: italic;
  }
  .listbox-header {
    display: flex;
    align-items: flex-end;
    box-sizing: border-box;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    font-size: 0.82em;
    padding-bottom: 2px;
    overflow: hidden;
    white-space: nowrap;
  }
  .listbox-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding-right: 6px;
    white-space: nowrap;
    overflow: hidden;
    transition: background 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  }
  .zebra .listbox-row:nth-child(even) { background: rgba(255, 255, 255, 0.035); }
  .listbox-row.card {
    margin-left: 4px;
    margin-right: 4px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.04);
  }
  .listbox-row.disabled { opacity: 0.4; }
  .listbox-row.hovered { background: rgba(255, 255, 255, 0.08); }

  /* Selection styles */
  .listbox-row.sel-bar { background: var(--lb-accent); color: #0B0B0B; }
  .listbox-row.sel-bold { font-weight: 700; }
  .listbox-row.sel-stripe::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--lb-accent);
  }
  .listbox-row.sel-stripe { background: rgba(255, 255, 255, 0.05); }
  .listbox-row.sel-outline { box-shadow: inset 0 0 0 1.5px var(--lb-accent); }

  /* Pending pick (awaiting confirm in double/enter modes) */
  .listbox-row.pending { box-shadow: inset 0 0 0 1px var(--lb-accent); }
  .listbox-row.pending::before {
    content: ""; position: absolute; inset: 0; background: var(--lb-accent); opacity: 0.12;
  }

  /* Animated selection indicator (slides between rows) */
  .listbox-sel-indicator {
    position: absolute; left: 0; right: 0; top: 0; z-index: 0;
    background: var(--lb-accent); opacity: 0.22;
    border-left: 3px solid var(--lb-accent);
    box-sizing: border-box;
    transition: transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1), height 160ms ease;
    will-change: transform;
  }
  .listbox-sel-indicator.ind-outline {
    background: transparent; box-shadow: inset 0 0 0 1.5px var(--lb-accent); border-left: none;
  }
  .listbox-row { z-index: 1; background: transparent; }

  .listbox-row.now-playing::after {
    content: "▶"; position: absolute; right: 6px; font-size: 0.7em; color: var(--lb-accent);
  }

  /* Hover animations */
  .listbox-row.hovered.hov-glow { box-shadow: inset 0 0 0 1px var(--lb-accent), 0 0 8px -2px var(--lb-accent); }
  .listbox-row.hovered.hov-slide { transform: translateX(3px); }
  .listbox-row.hovered.hov-scale { transform: scale(1.02); z-index: 1; }
  .listbox-row.hov-icon .lb-icon,
  .listbox-row.hov-icon .lb-icon-glyph { opacity: 0; transition: opacity 120ms ease; }
  .listbox-row.hovered.hov-icon .lb-icon,
  .listbox-row.hovered.hov-icon .lb-icon-glyph { opacity: 1; }

  .lb-swatch { flex: 0 0 auto; width: 3px; align-self: stretch; margin: 3px 2px 3px 0; border-radius: 2px; }
  .lb-icon { flex: 0 0 auto; object-fit: contain; }
  .lb-icon-glyph { flex: 0 0 auto; }
  .lb-body { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 1 1 auto; overflow: hidden; }
  .lb-label { overflow: hidden; text-overflow: ellipsis; }
  .lb-subtitle { opacity: 0.6; overflow: hidden; text-overflow: ellipsis; }
  .lb-match { background: rgba(255, 220, 90, 0.35); color: inherit; border-radius: 2px; }
  .lb-badge {
    flex: 0 0 auto; font-size: 0.72em; padding: 1px 5px; border-radius: 8px;
    background: rgba(255, 255, 255, 0.14); opacity: 0.85;
  }
  .lb-check { flex: 0 0 auto; color: var(--lb-accent); font-weight: 700; }
  .lb-checkbox { flex: 0 0 auto; opacity: 0.8; }

  .listbox-scrollbar {
    position: absolute; top: 2px; right: 2px; bottom: 2px; width: 6px; z-index: 3;
    border-radius: 3px; pointer-events: none;
  }
  .listbox-scrollbar.thin { width: 3px; }
  .listbox-thumb {
    position: absolute; right: 0; width: 100%;
    background: rgba(255, 255, 255, 0.28); border-radius: 3px;
  }

  .fade-edges::before, .fade-edges::after {
    content: ""; position: absolute; left: 0; right: 0; height: 14px; pointer-events: none; z-index: 2;
  }
  .fade-edges::before { top: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.35), transparent); }
  .fade-edges::after { bottom: 0; background: linear-gradient(to top, rgba(0,0,0,0.35), transparent); }
</style>
