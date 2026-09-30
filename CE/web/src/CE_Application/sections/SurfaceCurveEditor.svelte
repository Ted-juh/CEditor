<script>
  // Anchor-by-anchor editing of a flattened or smoothed path — the compound form of a `path` part,
  // curves, holes and islands (utils/bezierPath.js holds the geometry; this file is gestures and
  // drawing). SurfacePenTool hands a selected compound path here; a point-form path it edits itself.
  //
  //   anchor      drag to move it (its handles come with it); Alt-click to remove it — the last anchors
  //               of a hole remove the hole; double-click to switch it between corner and smooth
  //   handle      drag to bend the curve; on a smooth anchor the opposite handle turns with it, Alt
  //               breaks the pair into a corner
  //   outline     double-click to add an anchor exactly there (the curve is split, not changed)
  //
  // Handles show for the selected anchor and its neighbours, as vector tools show them, so a flattened
  // legend with hundreds of anchors stays legible. Everything is drawn where the part is drawn — turned
  // and scaled as its Layout says — and every drag is one undo step.
  import {
    insertAnchor, isSmooth, modelFromPart, moveAnchor, moveHandle, nearestOnOutline, partTransform,
    patchFromModel, removeAnchor, serializePathData, toggleAnchor,
  } from '../utils/bezierPath.js';
  import { POINT_HIT_RADIUS, clampToArtboard } from '../utils/penPath.js';

  let {
    name = '',
    part = null,
    artboardEl = null,
    artboardWidth = 220,
    artboardHeight = 120,
    zoom = 1,
    snapPoint = (point) => point,
    onPatchPart = () => {},
    onOutlineMouseDown = () => {},
  } = $props();

  let selected = $state(null);      // { s, i } — the anchor whose handles show
  let dragging = $state(null);      // { s, i, kind }

  let model = $derived(part ? modelFromPart(part, artboardWidth, artboardHeight) : []);
  let transform = $derived(partTransform(part, artboardWidth, artboardHeight));
  const screen = (p) => transform.toScreen(p);
  const size = () => 8 / Math.max(0.05, zoom);
  const radius = () => POINT_HIT_RADIUS / Math.max(0.05, zoom);

  // The outline as drawn on screen, for the double-click target.
  let outlineD = $derived(serializePathData(model.map(({ closed, nodes }) => ({
    closed,
    nodes: nodes.map((node) => ({ ...screen(node), in: node.in ? screen(node.in) : null, out: node.out ? screen(node.out) : null })),
  })), 3));

  // Handles shown: the selected anchor's, and its neighbours' facing it.
  let shownHandles = $derived.by(() => {
    if (!selected) return [];
    const subpath = model[selected.s];
    if (!subpath) return [];
    const count = subpath.nodes.length;
    const out = [];
    const add = (i, side) => {
      const node = subpath.nodes[i];
      if (node?.[side]) out.push({ s: selected.s, i, side, at: screen(node[side]), from: screen(node) });
    };
    add(selected.i, 'in');
    add(selected.i, 'out');
    const prev = selected.i - 1 >= 0 ? selected.i - 1 : (subpath.closed ? count - 1 : -1);
    const next = selected.i + 1 < count ? selected.i + 1 : (subpath.closed ? 0 : -1);
    if (prev >= 0 && prev !== selected.i) add(prev, 'out');
    if (next >= 0 && next !== selected.i) add(next, 'in');
    return out;
  });

  function pointerOnArtboard(event) {
    const rect = artboardEl?.getBoundingClientRect?.();
    if (!rect) return { x: 0, y: 0 };
    return clampToArtboard({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }, artboardWidth, artboardHeight);
  }

  /** Drag from a fixed start: every move re-derives the whole edit from the model at mousedown. */
  function drag(event, apply) {
    const startPart = part;
    const startModel = model;
    const move = (moveEvent) => {
      const point = transform.fromScreen(snapPoint(pointerOnArtboard(moveEvent), moveEvent));
      const next = apply(startModel, point, moveEvent);
      const patch = next && patchFromModel(startPart, next, artboardWidth, artboardHeight);
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

  function commit(next) {
    if (!next || next === model) return;
    const patch = patchFromModel(part, next, artboardWidth, artboardHeight);
    if (patch) onPatchPart(name, patch);
  }

  function anchorDown(s, i, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      commit(removeAnchor(model, s, i));
      selected = null;
      return;
    }
    if (event.detail > 1) {
      commit(toggleAnchor(model, s, i));
      return;
    }
    selected = { s, i };
    dragging = { s, i, kind: 'anchor' };
    drag(event, (start, point) => moveAnchor(start, s, i, point));
  }

  function handleDown(s, i, side, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = { s, i, kind: side };
    drag(event, (start, point, moveEvent) => moveHandle(start, s, i, side, point, { independent: moveEvent.altKey || event.altKey }));
  }

  function outlineDown(event) {
    if (event.detail > 1) {
      event.preventDefault();
      event.stopPropagation();
      const point = transform.fromScreen(pointerOnArtboard(event));
      const hit = nearestOnOutline(model, point);
      if (!hit || hit.distance > radius() * 2) return;
      const next = insertAnchor(model, hit.subpath, hit.segment, hit.t);
      commit(next);
      selected = { s: hit.subpath, i: hit.segment + 1 };
      return;
    }
    // A plain press on the outline moves the part, as it would without the editor over it.
    onOutlineMouseDown(event);
  }

  // A different part, or the same one reshaped by undo: forget an anchor that no longer exists.
  $effect(() => {
    if (selected && !model[selected.s]?.nodes[selected.i]) selected = null;
  });
</script>

{#if model.length}
  <svg
    class="curve-overlay"
    width={artboardWidth}
    height={artboardHeight}
    viewBox={`0 0 ${artboardWidth} ${artboardHeight}`}
    data-testid="curve-overlay"
    aria-hidden="true"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path class="curve-outline-hit" d={outlineD} style={`stroke-width:${radius() * 2}`} onmousedown={outlineDown}></path>
    <path class="curve-outline" d={outlineD} style={`stroke-width:${1 / zoom}`}></path>

    {#each shownHandles as handle (`${handle.s}:${handle.i}:${handle.side}`)}
      <line class="curve-handle-arm" x1={handle.from.x} y1={handle.from.y} x2={handle.at.x} y2={handle.at.y} style={`stroke-width:${1 / zoom}`}></line>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <circle
        class="curve-handle"
        class:dragging={dragging?.s === handle.s && dragging?.i === handle.i && dragging?.kind === handle.side}
        data-handle={`${handle.s}:${handle.i}:${handle.side}`}
        cx={handle.at.x} cy={handle.at.y} r={size() / 2.4}
        style={`stroke-width:${1 / zoom}`}
        onmousedown={(event) => handleDown(handle.s, handle.i, handle.side, event)}
      ><title>Drag to bend · Alt breaks a smooth pair</title></circle>
    {/each}

    {#each model as subpath, s (s)}
      {#each subpath.nodes as node, i (i)}
        {@const at = screen(node)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          class="curve-anchor"
          class:smooth={isSmooth(node)}
          class:selected={selected?.s === s && selected?.i === i}
          data-anchor={`${s}:${i}`}
          x={at.x - size() / 2} y={at.y - size() / 2}
          width={size()} height={size()}
          rx={isSmooth(node) ? size() / 2 : 0}
          style={`stroke-width:${1 / zoom}`}
          onmousedown={(event) => anchorDown(s, i, event)}
        ><title>Drag to move · double-click: corner / smooth · Alt-click to remove</title></rect>
      {/each}
    {/each}
  </svg>
{/if}

<style>
  .curve-overlay {
    position: absolute;
    left: 0;
    top: 0;
    /* As the Pen's overlay: above selection frames, below guides and toolbars. */
    z-index: 2350;
    overflow: visible;
    pointer-events: none;
  }

  .curve-outline-hit {
    fill: none;
    stroke: transparent;
    pointer-events: stroke;
    cursor: copy;
  }

  .curve-outline {
    fill: none;
    stroke: #14B8A6;
    opacity: 0.8;
    pointer-events: none;
  }

  .curve-handle-arm {
    stroke: #14B8A6;
    opacity: 0.7;
    pointer-events: none;
  }

  .curve-handle {
    fill: #14B8A6;
    stroke: #FFFFFF;
    pointer-events: all;
    cursor: crosshair;
  }

  .curve-handle.dragging {
    fill: #FFFFFF;
  }

  .curve-anchor {
    fill: #FFFFFF;
    stroke: #14B8A6;
    pointer-events: all;
    cursor: move;
  }

  .curve-anchor.selected {
    fill: #14B8A6;
  }
</style>
