<script>
  /**
   * The same records on two measurements. No projection, no learned embedding: where a dot sits
   * IS its brightness and its attack. Dots are coloured by category.
   *
   * Drag a box on two filter axes and it becomes a search. Shift-click a dot to morph the
   * focused part between it and the selected sound. On the page the map fills the window, the
   * wheel zooms in around the selected sound, and the arrow keys walk to the nearest sound in
   * that direction and play it, so you can browse by ear.
   */
  import { MEASURED_AXES, measuredLabel, normalizeLibraryQuery } from '../../stores/instrumentHost.js';
  import { AXIS_LABELS, categoryColour, detailLine } from './soundsText.js';
  import { nearestInDirection } from '../../utils/soundMapWalk.js';
  import { sounds } from './soundsBrowser.svelte.js';

  let { layout = 'dock', canMorph = false, partName = '', onpick = () => {}, onmorph = () => {}, onwalk = () => {} } = $props();

  const page = $derived(layout === 'page');
  const MAP_AXES = [...MEASURED_AXES, 'noisiness', 'dynamics'];
  const LABELS = { ...AXIS_LABELS, noisiness: 'Noise', dynamics: 'Touch' };
  const valueLabel = (axis, v) => (axis === 'noisiness' || axis === 'dynamics' ? `${Math.round(v * 100)}%` : measuredLabel(axis, v));

  let axisX = $state('brightness');
  let axisY = $state('attack');
  let zoom = $state(1);
  let hovered = $state(null);
  let lasso = $state(null);   // { x0, y0, x1, y1 } in 0..1 of the drawing, while dragging

  const shown = $derived(sounds.records.filter((r) => r.sonic));
  const selected = $derived(sounds.selected);
  const selectedIds = $derived(new Set(sounds.selection));
  // Zoom keeps the selected sound where it is and spreads everything else out around it.
  const centre = $derived(zoom > 1 && selected?.sonic
    ? { x: selected.sonic[axisX], y: selected.sonic[axisY] } : { x: 0.5, y: 0.5 });
  const place = (v, c) => (zoom > 1 ? (v - c) * zoom + 0.5 : v);
  const at = (record) => ({ x: place(record.sonic[axisX], centre.x), y: 1 - place(record.sonic[axisY], centre.y) });
  const visible = (p) => p.x >= -0.02 && p.x <= 1.02 && p.y >= -0.02 && p.y <= 1.02;
  const categories = $derived([...new Set(shown.map((r) => r.category).filter(Boolean))].sort().slice(0, 10));
  const canLasso = $derived(zoom === 1 && MEASURED_AXES.includes(axisX) && MEASURED_AXES.includes(axisY));

  function mapPoint(event) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
             y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
  }
  function lassoDown(event) {
    // Dot buttons own their pointer gesture; a drag on the empty map is the box.
    if (event.target !== event.currentTarget || !canLasso) return;
    const p = mapPoint(event);
    lasso = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function lassoMove(event) { if (lasso) { const p = mapPoint(event); lasso = { ...lasso, x1: p.x, y1: p.y }; } }
  function lassoUp() {
    if (!lasso) return;
    const box = lasso;
    lasso = null;
    if (Math.abs(box.x1 - box.x0) < 0.02 || Math.abs(box.y1 - box.y0) < 0.02) return;
    // A rectangle on two measured axes IS a query: two active ranges, which can be saved and run again.
    const next = normalizeLibraryQuery(sounds.query);
    next.ranges[axisX] = { min: Math.min(box.x0, box.x1), max: Math.max(box.x0, box.x1), active: true };
    next.ranges[axisY] = { min: 1 - Math.max(box.y0, box.y1), max: 1 - Math.min(box.y0, box.y1), active: true };
    sounds.ask(next);
  }
  function clickDot(event, record) {
    if (event.shiftKey && canMorph && record.recordId !== selected?.recordId) { onmorph(record.recordId); return; }
    sounds.select(record.recordId, event);
    onpick(record);
  }
  function walk(event) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!dir || !selected?.sonic) return;
    event.preventDefault();
    const points = shown.map((r) => ({ id: r.recordId, ...at(r) }));
    const next = nearestInDirection(points, selected.recordId, dir);
    if (!next) return;
    sounds.selectOnly(next);
    onwalk(sounds.records.find((r) => r.recordId === next));
  }
  function wheel(event) {
    if (!page) return;
    event.preventDefault();
    zoom = Math.max(1, Math.min(6, zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    if (zoom < 1.05) zoom = 1;
  }
</script>

<div class="mapwrap" class:page data-testid="sound-map">
  <div class="mapaxes">
    <span class="flabel">Across</span>
    {#each MAP_AXES.filter((a) => a !== axisY) as axis (axis)}
      <button type="button" class="chip" class:on={axisX === axis} onclick={() => (axisX = axis)}>{LABELS[axis]}</button>
    {/each}
  </div>
  <div class="mapaxes">
    <span class="flabel">Up</span>
    {#each MAP_AXES.filter((a) => a !== axisX) as axis (axis)}
      <button type="button" class="chip" class:on={axisY === axis} onclick={() => (axisY = axis)}>{LABELS[axis]}</button>
    {/each}
    {#if page}
      <span class="zoom">
        <button type="button" class="ghost" aria-label="Zoom in around the selected sound" onclick={() => (zoom = Math.min(6, zoom * 1.5))}>+</button>
        <button type="button" class="ghost" aria-label="Zoom out" disabled={zoom === 1} onclick={() => (zoom = Math.max(1, zoom / 1.5 < 1.05 ? 1 : zoom / 1.5))}>−</button>
        <span class="zoomval">{zoom === 1 ? 'all' : `×${zoom.toFixed(1)}`}</span>
      </span>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="map" role="application" tabindex="0" data-testid="map-surface"
       aria-label="Sound map. Arrow keys walk to the nearest sound in that direction."
       onpointerdown={lassoDown} onpointermove={lassoMove} onpointerup={lassoUp}
       onpointercancel={() => (lasso = null)} onlostpointercapture={() => (lasso = null)}
       onkeydown={walk} onwheel={wheel}>
    {#each shown as record (record.recordId)}
      {@const p = at(record)}
      {#if visible(p)}
        <button type="button" class="ctl dot" tabindex="-1"
                class:sel={record.recordId === selected?.recordId} class:picked={selectedIds.has(record.recordId)}
                class:unavailable={!record.available} data-testid="map-dot" data-record={record.recordId}
                style={`left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%;--dot:${categoryColour(record.category)}`}
                title={`${record.name} — ${valueLabel(axisX, record.sonic[axisX])} × ${valueLabel(axisY, record.sonic[axisY])}`}
                onmouseenter={() => (hovered = record)} onmouseleave={() => (hovered = null)}
                onclick={(e) => clickDot(e, record)}></button>
      {/if}
    {/each}
    {#if page && selected?.sonic}
      {@const p = at(selected)}
      {#if visible(p)}<span class="dot-name" style={`left:${p.x * 100}%;top:${p.y * 100}%`}>{selected.name}</span>{/if}
    {/if}
    {#if canMorph}<span class="maphint">shift-click a second dot to morph {partName} between them</span>{/if}
    {#if lasso}
      <div class="lasso" style={`left:${Math.min(lasso.x0, lasso.x1) * 100}%;top:${Math.min(lasso.y0, lasso.y1) * 100}%;width:${Math.abs(lasso.x1 - lasso.x0) * 100}%;height:${Math.abs(lasso.y1 - lasso.y0) * 100}%`}></div>
    {/if}
    {#if zoom === 1}
      <span class="axlabel x0">{valueLabel(axisX, 0)}</span>
      <span class="axlabel x1">{valueLabel(axisX, 1)}</span>
      <span class="axlabel y0">{valueLabel(axisY, 0)}</span>
      <span class="axlabel y1">{valueLabel(axisY, 1)}</span>
    {/if}
    {#if page && categories.length > 0}
      <div class="legend" aria-hidden="true">
        {#each categories as category (category)}<span><i style={`background:${categoryColour(category)}`}></i>{category}</span>{/each}
      </div>
    {/if}
    {#if hovered}
      {@const p = at(hovered)}
      <div class="mapcard" style={`left:${Math.min(78, Math.max(0, p.x * 100))}%;top:${Math.min(72, Math.max(0, p.y * 100))}%`}>
        <span class="mapcard-name">{hovered.name}</span>
        <span class="mapcard-sub">{detailLine(hovered)}</span>
        <span class="mapcard-nums">
          {LABELS[axisX].toLowerCase()} {valueLabel(axisX, hovered.sonic[axisX])}
          · {LABELS[axisY].toLowerCase()} {valueLabel(axisY, hovered.sonic[axisY])}
        </span>
      </div>
    {/if}
  </div>

  <div class="mapfoot">
    <span class="hint">
      {#if canLasso}Drag a box to keep what is inside it — a box on two measured axes is a search, so it can be saved and run again.
      {:else if zoom > 1}Zoomed in around {selected?.name ?? 'the selection'}.
      {:else}Noise and touch are for looking, not filtering: pick two of the others to drag a box.{/if}
      {shown.length} of {sounds.records.length} shown; the rest have not been listened to.
      {#if page}Click the map, then use the arrow keys to walk and listen.{/if}
    </span>
  </div>
</div>

<style>
  .mapwrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; padding: 8px; }
  .mapwrap.page { overflow: hidden; }
  .mapaxes { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .flabel { color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; width: 72px; flex: 0 0 72px; }
  .zoom { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; }
  .zoomval { font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim); min-width: 34px; text-align: right; }
  .map {
    /* A fixed height in the dock: growing to fit pushed the audition bar off the bottom of the
       window, which is exactly the control somebody reaches for while browsing a map. */
    position: relative; height: 300px; flex: 0 0 300px;
    border: 1px solid var(--host-line-soft); border-radius: 5px;
    background:
      linear-gradient(#1c212633 1px, transparent 1px) 0 0 / 100% 20%,
      linear-gradient(90deg, #1c212633 1px, transparent 1px) 0 0 / 20% 100%,
      #101315;
    touch-action: none; cursor: crosshair; overflow: hidden;
  }
  .page .map { height: auto; flex: 1 1 auto; min-height: 220px; }
  .map:focus-visible { outline: 2px solid #79b9ee; outline-offset: 1px; }
  button.dot {
    position: absolute; width: 9px; height: 9px; padding: 0; margin: -4.5px 0 0 -4.5px; min-height: 0;
    border-radius: 50%; border: 1px solid var(--host-bg-deep); background: var(--dot, #7fb4e0); opacity: 0.85;
  }
  .page button.dot { width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; }
  button.dot:hover:not(:disabled) { opacity: 1; border-color: var(--host-text); }
  button.dot.picked { box-shadow: 0 0 0 2px #79b9ee; opacity: 1; }
  button.dot.sel { border: 2px solid #fff; box-shadow: 0 0 0 3px #7fb4e055; opacity: 1; z-index: 2; }
  button.dot.unavailable { opacity: 0.4; }
  .dot-name { position: absolute; margin: -22px 0 0 10px; font: 600 12px var(--host-font, sans-serif); color: var(--host-text);
              text-shadow: 0 0 4px #000, 0 0 2px #000; pointer-events: none; white-space: nowrap; z-index: 3; }
  .lasso { position: absolute; border: 1px dashed #7fb4e0; background: #7fb4e014; pointer-events: none; }
  .axlabel { position: absolute; color: #5b6570; font-size: 9.5px; pointer-events: none; }
  .axlabel.x0 { left: 5px; bottom: 3px; }
  .axlabel.x1 { right: 5px; bottom: 3px; }
  .axlabel.y0 { left: 5px; bottom: 14px; }
  .axlabel.y1 { left: 5px; top: 4px; }
  .legend { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 2px; padding: 6px 8px;
            background: #101418dd; border: 1px solid var(--host-line-soft); border-radius: 4px; font-size: 10.5px; color: var(--host-text-soft);
            pointer-events: none; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .maphint { position: absolute; left: 50%; transform: translateX(-50%); top: 6px; font-size: 10px; color: var(--host-text-dim); pointer-events: none; }
  .mapcard { position: absolute; margin: 10px 0 0 10px; padding: 6px 8px; width: 172px; background: var(--host-surface);
             border: 1px solid #4a86bd; border-radius: 4px; display: flex; flex-direction: column; gap: 1px; pointer-events: none;
             box-shadow: 0 8px 22px #000a; z-index: 4; }
  .mapcard-name { font-weight: 600; font-size: 11.5px; color: var(--host-text); }
  .mapcard-sub { color: var(--host-text-dim); font-size: 10px; }
  .mapcard-nums { color: var(--host-text-soft); font-size: 10px; margin-top: 3px; }
  .mapfoot { display: flex; }
  .hint { color: var(--host-text-dim); font-size: 10.5px; }
</style>
