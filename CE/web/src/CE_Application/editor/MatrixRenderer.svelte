<script>
  // Mod Matrix — a modulation routing grid: source rows × destination columns,
  // each cell a bipolar/unipolar amount shown as a centre-bar, fill or dot.
  // Visual only; cell dragging is driven by the preview surface, which shares
  // matrixLayout geometry so hit-tests line up. Live drag amounts arrive via
  // Matrix.__amounts (injected by the surface).
  import {
    matrixConfig, matrixRows, matrixCols, matrixAmounts,
    matrixGeometry, matrixCellRect, matrixIndex,
  } from '../utils/matrixLayout.js';

  let { control = null, width = 0, height = 0, activeCell = null } = $props();

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

  let cfg = $derived(matrixConfig(control));
  let rows = $derived(matrixRows(control));
  let cols = $derived(matrixCols(control));
  let geom = $derived(matrixGeometry(width, height, control));
  let amounts = $derived(Array.isArray(cfg.__amounts) ? cfg.__amounts : matrixAmounts(control));
  let bipolar = $derived(cfg.bipolar !== false);
  let style = $derived(String(cfg.cellStyle ?? 'bar'));

  let cellBg = $derived(css(cfg.cellBg, 'rgba(22,22,22,1)'));
  let gridCss = $derived(css(cfg.gridColour, 'rgba(255,255,255,0.13)'));
  let posCss = $derived(css(cfg.posColour, 'rgba(57,217,138,1)'));
  let negCss = $derived(css(cfg.negColour, 'rgba(235,87,87,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let activeCss = $derived(css(cfg.activeColour, 'rgba(255,255,255,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(7, Math.min(n(font?.size, 11), geom.headerH - 6 || 11)));

  // Cell descriptors (rect + amount + visual geometry) for the template.
  let cells = $derived.by(() => {
    const out = [];
    for (let r = 0; r < rows.length; r += 1) {
      for (let c = 0; c < cols.length; c += 1) {
        const rect = matrixCellRect(r, c, geom);
        const amt = Math.max(-1, Math.min(1, n(amounts[matrixIndex(r, c, cols.length)], 0)));
        const colour = amt >= 0 ? posCss : negCss;
        const pad = Math.min(4, rect.w * 0.14, rect.h * 0.14);
        out.push({ r, c, rect, amt, colour, pad, active: activeCell && activeCell.r === r && activeCell.c === c });
      }
    }
    return out;
  });
</script>

<div class="matrix" style={`width:${width}px; height:${height}px; font-family:${fontFamily};`}>
  {#if cfg.showLabels !== false}
    {#each cols as label, c (`c${c}`)}
      <div class="mx-col-label" style={`left:${geom.gridX0 + c * geom.cellW}px; top:0; width:${geom.cellW}px; height:${geom.headerH}px; color:${labelCss}; font-size:${labelSize}px;`}>{label}</div>
    {/each}
    {#each rows as label, r (`r${r}`)}
      <div class="mx-row-label" style={`left:0; top:${geom.gridY0 + r * geom.cellH}px; width:${geom.headerW}px; height:${geom.cellH}px; color:${labelCss}; font-size:${labelSize}px;`}>{label}</div>
    {/each}
  {/if}

  {#each cells as cell (`${cell.r}_${cell.c}`)}
    <div class="mx-cell" class:active={cell.active}
         style={`left:${cell.rect.x}px; top:${cell.rect.y}px; width:${cell.rect.w}px; height:${cell.rect.h}px; background:${cellBg}; box-shadow: inset 0 0 0 1px ${cell.active ? activeCss : gridCss};`}>
      {#if style === 'fill'}
        <div class="mx-fill" style={`background:${cell.colour}; opacity:${Math.abs(cell.amt).toFixed(3)};`}></div>
      {:else if style === 'dot'}
        {@const r = Math.max(0, Math.abs(cell.amt) * (Math.min(cell.rect.w, cell.rect.h) / 2 - cell.pad))}
        <div class="mx-dot" style={`width:${r * 2}px; height:${r * 2}px; background:${cell.colour};`}></div>
      {:else}
        {#if bipolar}
          <div class="mx-zero" style={`background:${gridCss};`}></div>
          <div class="mx-bar" style={`background:${cell.colour}; left:${cell.pad}px; right:${cell.pad}px; height:${(Math.abs(cell.amt) * (cell.rect.h / 2 - cell.pad)).toFixed(2)}px; ${cell.amt >= 0 ? `bottom:50%` : `top:50%`};`}></div>
        {:else}
          <div class="mx-bar" style={`background:${cell.colour}; left:${cell.pad}px; right:${cell.pad}px; bottom:${cell.pad}px; height:${(Math.abs(cell.amt) * (cell.rect.h - cell.pad * 2)).toFixed(2)}px;`}></div>
        {/if}
      {/if}
      {#if cfg.showValues === true && cell.amt !== 0}
        <div class="mx-val" style={`color:${activeCss}; font-size:${Math.max(7, labelSize - 1)}px;`}>{cell.amt.toFixed(2)}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .matrix { position: absolute; inset: 0; box-sizing: border-box; pointer-events: none; overflow: hidden; }
  .mx-col-label, .mx-row-label {
    position: absolute; display: flex; align-items: center; box-sizing: border-box;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .mx-col-label { justify-content: center; padding: 0 2px; }
  .mx-row-label { justify-content: flex-end; padding: 0 5px 0 2px; }
  .mx-cell { position: absolute; box-sizing: border-box; overflow: hidden; }
  .mx-cell.active { z-index: 1; }
  .mx-fill { position: absolute; inset: 0; }
  .mx-dot { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%; }
  .mx-bar { position: absolute; border-radius: 1px; }
  .mx-zero { position: absolute; left: 0; right: 0; top: 50%; height: 1px; transform: translateY(-0.5px); }
  .mx-val { position: absolute; right: 2px; bottom: 1px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 1px rgba(0,0,0,0.7); }
</style>
