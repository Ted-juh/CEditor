<script>
  /**
   * Draggable points for the three modes whose value is a SHAPE.
   *
   * WHY THESE THREE GET HANDLES WHEN THE ARC DID NOT. The arc handles were withdrawn from the
   * widget plan as fiddly, and rightly: an angle has an exact number, and dragging a dot to set it
   * loses typing, nudging and copying for nothing. Here there is no number worth typing. A bezier
   * is eight percentages nobody composes in their head, and polyline and freehand are vertex lists
   * — freehand's name says drawing. The shape IS the value, so the shape is what you edit.
   *
   * The numbers stay: this overlay writes the same properties the fields do, and both are on screen
   * at once. Dragging is an addition, not a replacement.
   */
  let {
    points = [],
    mode = 'bezier',
    onmove = () => {},
    onadd = () => {},
    onremove = () => {},
  } = $props();

  let boxEl = $state(null);
  let dragging = $state(-1);

  const isCurve = $derived(mode === 'bezier');

  /** The path drawn behind the glyphs — a readout, not a target. Pointer events stay on the
   *  handles so the line itself is never something you can grab by accident. */
  let d = $derived.by(() => {
    if (!points.length) return '';
    if (isCurve && points.length === 4) {
      const [s, c1, c2, e] = points;
      return `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
    }
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  });

  function pointerPercent(event) {
    const box = boxEl?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    };
  }

  function begin(index, event) {
    event.preventDefault();
    event.stopPropagation();
    dragging = index;
    // Capture is an optimisation, not the mechanism: pointermove and pointerup are bound on the
    // container, so the drag works without it. It throws NotFoundError when the id names no active
    // pointer, and letting that escape would abort the drag before it started.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function move(event) {
    if (dragging < 0) return;
    const at = pointerPercent(event);
    if (at) onmove(dragging, at.x, at.y);
  }

  function end() { dragging = -1; }

  function nudge(index, event) {
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    const point = points[index];
    if (point) onmove(index, point.x + dx, point.y + dy);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="patheditor"
  bind:this={boxEl}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
>
  <svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {#if isCurve && points.length === 4}
      <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} class="tangent" />
      <line x1={points[3].x} y1={points[3].y} x2={points[2].x} y2={points[2].y} class="tangent" />
    {/if}
    <path {d} class="path" />
  </svg>

  {#each points as point, index (point.key)}
    <button
      type="button"
      class="handle"
      class:control={point.control}
      class:dragging={dragging === index}
      style={`left:${point.x}%;top:${point.y}%;`}
      title={`${point.label} — drag, or arrow keys to nudge${point.control ? '' : ' · double-click to remove'}`}
      aria-label={`${point.label} at ${Math.round(point.x)}, ${Math.round(point.y)} percent`}
      onpointerdown={(event) => begin(index, event)}
      onkeydown={(event) => nudge(index, event)}
      ondblclick={(event) => { event.preventDefault(); if (!point.control) onremove(index); }}
    ></button>
  {/each}

  {#if !isCurve}
    <button type="button" class="addpoint" title="Add a point to the path" onclick={() => onadd(points.length - 2)}>+ point</button>
  {/if}
</div>

<style>
  .patheditor {
    position: absolute;
    inset: 0;
    touch-action: none;
  }

  .guide { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .path { fill: none; stroke: #2B3742; stroke-width: 0.6; vector-effect: non-scaling-stroke; stroke-dasharray: 4 3; }
  .tangent { stroke: #1F2A33; stroke-width: 0.5; vector-effect: non-scaling-stroke; }

  .handle {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -6px 0 0 -6px;
    padding: 0;
    border-radius: 50%;
    border: 1.5px solid #14B8A6;
    background: #0E1317;
    cursor: grab;
    touch-action: none;
  }
  .handle:hover { background: #0B2320; }
  .handle:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }
  .handle.dragging { cursor: grabbing; background: #14B8A6; }
  /* Control points read as secondary because they are not ON the path — the curve passes near
     them, not through them, and drawing them identically to the anchors invites the wrong mental
     model. */
  .handle.control {
    border-radius: 2px;
    border-color: #5B9BD5;
    border-style: dashed;
  }

  .addpoint {
    position: absolute;
    right: 6px;
    bottom: 6px;
    border: 1px solid #333B42;
    background: #12171A;
    border-radius: 3px;
    padding: 3px 7px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #9AA6AE;
    cursor: pointer;
  }
  .addpoint:hover { border-color: #0E7C70; color: #8FEDE3; }
</style>
