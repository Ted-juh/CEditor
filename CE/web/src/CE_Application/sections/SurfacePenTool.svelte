<script>
  // The Pen tool and path point editing for the component design surface.
  //
  // DRAWING (tool P). Click to place points. Click the first point to close the shape (a filled
  // polygon); click the last point again, double-click, or press Enter to finish it open (a
  // stroked line). Shift keeps the new segment to 45° steps. Backspace takes back the last point,
  // Escape abandons the drawing. Points snap to the grid when snapping is on.
  //
  // EDITING. With one path part selected, its points get handles: drag one to move it, Alt-click
  // one to remove it, double-click the outline to add a point there.
  //
  // It lives in its own file because the surface editor has a line budget (surfaceDecomposition
  // test) and because none of this needs the editor's state beyond what is passed in. The geometry
  // is utils/penPath.js; this file is gestures and drawing.
  import {
    POINT_HIT_RADIUS, clampToArtboard, constrainTo45, insertPathPoint, movePathPoint,
    nearestPathSegment, pathIsClosed, pathPointsInArtboard, penClickAction, removePathPoint,
  } from '../utils/penPath.js';

  let {
    active = false,                  // the Pen is the current tool
    artboardEl = null,
    artboardWidth = 220,
    artboardHeight = 120,
    zoom = 1,
    snapPoint = (point) => point,    // (point, event) → the point, snapped as the surface snaps
    editPart = null,                 // { name, part } of the one selected path part, or null
    onCreate = () => {},             // (points, closed)
    onPatchPart = () => {},          // (name, patch) — patch paths are relative to the part
    onOutlineMouseDown = () => {},   // a plain press on the outline: the surface's own move gesture
  } = $props();

  let draft = $state([]);            // [[x, y], ...] in artboard units
  let hover = $state(null);          // where the next point would go
  let dragging = $state(null);       // { index } while a handle is dragged

  const radius = () => POINT_HIT_RADIUS / Math.max(0.05, zoom);
  const handleSize = () => 8 / Math.max(0.05, zoom);

  function pointFromEvent(event) {
    const rect = artboardEl?.getBoundingClientRect?.();
    if (!rect) return { x: 0, y: 0 };
    return clampToArtboard({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }, artboardWidth, artboardHeight);
  }

  function placed(event) {
    let point = snapPoint(pointFromEvent(event), event);
    if (event.shiftKey && draft.length) {
      const [lx, ly] = draft[draft.length - 1];
      point = constrainTo45({ x: lx, y: ly }, point);
    }
    return clampToArtboard(point, artboardWidth, artboardHeight);
  }

  function onWindowMove(event) {
    if (!draft.length) return;
    hover = placed(event);
  }

  $effect(() => {
    if (!draft.length) return undefined;
    window.addEventListener('mousemove', onWindowMove);
    return () => window.removeEventListener('mousemove', onWindowMove);
  });

  // Leaving the Pen abandons a drawing in progress.
  $effect(() => { if (!active) cancel(); });

  function finish(closed) {
    const points = draft.map(([x, y]) => [x, y]);
    draft = [];
    hover = null;
    if (points.length >= (closed ? 3 : 2)) onCreate(points, closed);
  }

  export function cancel() {
    draft = [];
    hover = null;
  }

  export function isDrawing() {
    return draft.length > 0;
  }

  /** The surface calls this for a mousedown on the artboard while the Pen is active. */
  export function pointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Hit-test the raw pointer (not the snapped point), so the first point is easy to click.
    const raw = pointFromEvent(event);
    const { action } = penClickAction(draft, raw, radius());
    if (action === 'close') { finish(true); return; }
    if (action === 'finish') { finish(false); return; }
    if (action === 'ignore') return;
    const point = placed(event);
    draft = [...draft, [point.x, point.y]];
    hover = point;
  }

  /** Keys while drawing. Returns true if the key was the Pen's. */
  export function handleKeydown(event) {
    if (!draft.length) return false;
    if (event.key === 'Enter') { event.preventDefault(); finish(false); return true; }
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return true; }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      draft = draft.slice(0, -1);
      if (!draft.length) hover = null;
      return true;
    }
    return false;
  }

  // --- Editing a selected path ------------------------------------------------------------------

  let editPoints = $derived(editPart && !active ? pathPointsInArtboard(editPart.part, artboardWidth, artboardHeight) : []);
  let editClosed = $derived(editPart ? pathIsClosed(editPart.part) : true);

  function beginHandleDrag(index, event) {
    if (event.button !== 0 || !editPart) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      const patch = removePathPoint(editPart.part, index, artboardWidth, artboardHeight);
      if (patch) onPatchPart(editPart.name, patch);
      return;
    }
    dragging = { index };
    const name = editPart.name;
    const move = (moveEvent) => {
      const part = editPart?.name === name ? editPart.part : null;
      if (!part) return;
      const point = snapPoint(pointFromEvent(moveEvent), moveEvent);
      const patch = movePathPoint(part, index, point, artboardWidth, artboardHeight);
      if (patch) onPatchPart(name, patch);
    };
    const up = () => {
      dragging = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function insertOnOutline(event) {
    if (!editPart) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const nearest = nearestPathSegment(editPart.part, point, artboardWidth, artboardHeight);
    if (!nearest || nearest.distance > radius() * 2) return;
    const patch = insertPathPoint(editPart.part, nearest.index, { x: nearest.x, y: nearest.y }, artboardWidth, artboardHeight);
    if (patch) onPatchPart(editPart.name, patch);
  }

  const svgPoints = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');
</script>

{#if draft.length || editPoints.length}
  <svg
    class="pen-overlay"
    class:drawing={draft.length > 0}
    width={artboardWidth}
    height={artboardHeight}
    viewBox={`0 0 ${artboardWidth} ${artboardHeight}`}
    data-testid="pen-overlay"
    aria-hidden="true"
  >
    {#if draft.length}
      <polyline class="pen-draft" points={svgPoints(hover ? [...draft, [hover.x, hover.y]] : draft)} style={`stroke-width:${1.5 / zoom}`}></polyline>
      {#each draft as [x, y], index (index)}
        <rect
          class="pen-point"
          class:first={index === 0 && draft.length >= 3}
          x={x - handleSize() / 2} y={y - handleSize() / 2}
          width={handleSize()} height={handleSize()}
          style={`stroke-width:${1 / zoom}`}
        ></rect>
      {/each}
    {:else}
      <!-- A wide, invisible copy of the outline, so a double-click near it adds a point. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svelte:element
        this={editClosed ? 'polygon' : 'polyline'}
        class="pen-outline-hit"
        points={svgPoints(editPoints)}
        style={`stroke-width:${radius() * 2}`}
        ondblclick={insertOnOutline}
        onmousedown={(event) => {
          // The outline sits over the part, so a plain press must still move the part as it
          // would without this; only the second press of a double-click belongs to the Pen.
          if (event.detail > 1) { event.stopPropagation(); return; }
          onOutlineMouseDown(event);
        }}
      ></svelte:element>
      {#each editPoints as [x, y], index (index)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          class="pen-handle"
          class:dragging={dragging?.index === index}
          data-point={index}
          x={x - handleSize() / 2} y={y - handleSize() / 2}
          width={handleSize()} height={handleSize()}
          style={`stroke-width:${1 / zoom}`}
          onmousedown={(event) => beginHandleDrag(index, event)}
        ><title>Drag to move · Alt-click to remove</title></rect>
      {/each}
    {/if}
  </svg>
{/if}

<style>
  .pen-overlay {
    position: absolute;
    left: 0;
    top: 0;
    /* Above every part's selection frame (1000 + the part's z) and the draw capture (2300), so the
       handles can be grabbed on a selected part; below guides and toolbars (2380 and up). */
    z-index: 2350;
    overflow: visible;
    pointer-events: none;
  }

  .pen-draft {
    fill: none;
    stroke: #14B8A6;
    stroke-dasharray: 4 3;
  }

  .pen-point {
    fill: #0E1418;
    stroke: #14B8A6;
  }

  .pen-point.first {
    fill: #14B8A6;
  }

  .pen-outline-hit {
    fill: none;
    stroke: transparent;
    pointer-events: stroke;
    cursor: copy;
  }

  .pen-handle {
    fill: #FFFFFF;
    stroke: #14B8A6;
    pointer-events: all;
    cursor: move;
  }

  .pen-handle.dragging {
    fill: #14B8A6;
  }
</style>
