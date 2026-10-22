<script>
  /**
   * ce.anim.envelope's points, drawn as the shape the runtime plays and edited by dragging them: the
   * Values tab puts it under an envelope's row, as it puts the Animation tab's BezierEditor under a
   * drawn curve's. The line is the runtime's own sampling of the points (panelRuntime's
   * sampleEnvelope), so a curve a point carries bends it here as it bends the move.
   *
   * A drag draws live and hands the points over once, when it is let go, so one drag is one write and
   * one undo step, not sixty; the same for a point added (a double-click on the line's ground), one
   * taken out, and the selected point's x or y typed in its field (Enter, or leaving it). A point
   * stays between the two either side of it in x, and in 0 to 1: envelopePointEdit.js has the rules.
   *
   * The fields and the Remove button are the keyboard's way in; the points themselves are for the
   * pointer, as BezierEditor's handles are.
   */
  import { sampleEnvelope } from '../scripting/panelRuntime.js';
  import {
    editablePoints, levelRange, movePoint, addPoint, removePoint, shapeOf, shapeLine, round3,
  } from './envelopePointEdit.js';

  let {
    written = [],            // the points as the script holds them (the literal's value)
    points: read = [],       // the core's reading of them: [{ index, x, y }]
    width = 248,
    height = 128,
    onchange = () => {},     // ([{ x, y, from }]) → the sidebar writes them
  } = $props();

  const PAD = 9;
  let svg = $state(null);
  let draft = $state(null);         // the points while one is held
  let held = $state(-1);            // which, while dragging
  let chosen = $state(0);           // the point the fields are for

  let base = $derived(editablePoints(read));
  let shown = $derived(draft ?? base);
  // The levels the written points span: a drag moves a point toward 0 to 1 only, so the view holds
  // still under it.
  let range = $derived(levelRange(base));
  let selected = $derived(Math.min(Math.max(0, chosen), shown.length - 1));
  let line = $derived(shapeLine(sampleEnvelope(shapeOf(written, shown)), { width, height, pad: PAD, lo: range.lo, hi: range.hi }));

  const w = $derived(width - PAD * 2);
  const h = $derived(height - PAD * 2);
  const sx = (x) => PAD + x * w;
  const sy = (y) => PAD + ((range.hi - y) / (range.hi - range.lo || 1)) * h;

  function toUnit(event) {
    const box = svg.getBoundingClientRect();
    const px = (event.clientX - box.left) * (width / box.width);
    const py = (event.clientY - box.top) * (height / box.height);
    return { x: (px - PAD) / w, y: range.hi - ((py - PAD) / h) * (range.hi - range.lo) };
  }

  function grab(index, event) {
    event.preventDefault();
    event.stopPropagation();
    held = index;
    chosen = index;
    draft = shown.map((p) => ({ ...p }));
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function move(event) {
    if (held < 0 || !draft) return;
    const { x, y } = toUnit(event);
    draft = movePoint(draft, held, x, y);
  }

  function release() {
    if (held < 0) return;
    const next = draft;
    held = -1;
    draft = null;
    const moved = next && next.some((p, i) => p.x !== base[i]?.x || p.y !== base[i]?.y);
    if (moved) onchange(next);
  }

  function add(event) {
    // A double-click on a point is two grabs of it, not a new point under it.
    if (held >= 0 || event.target?.dataset?.point !== undefined) return;
    const { x, y } = toUnit(event);
    const { points: next, at } = addPoint(base, x, y);
    chosen = at;
    onchange(next);
  }

  function remove() {
    const next = removePoint(base, selected);
    if (!next) return;
    chosen = Math.max(0, selected - 1);
    onchange(next);
  }

  /** A field's number, written when Enter is pressed or the field is left; anything else is put back. */
  function setField(event, key) {
    const n = Number(String(event.currentTarget.value).trim());
    const p = base[selected];
    if (!p || String(event.currentTarget.value).trim() === '' || !Number.isFinite(n)) {
      event.currentTarget.value = String(p?.[key] ?? '');
      return;
    }
    const next = movePoint(base, selected, key === 'x' ? n : p.x, key === 'y' ? n : p.y);
    if (next[selected].x !== p.x || next[selected].y !== p.y) onchange(next);
    else event.currentTarget.value = String(round3(p[key]));
  }

  function fieldKey(event, key) {
    if (event.key === 'Enter') { event.preventDefault(); setField(event, key); }
    else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = String(base[selected]?.[key] ?? ''); event.currentTarget.blur(); }
  }
</script>

<div class="envpts">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg bind:this={svg} {width} {height} viewBox="0 0 {width} {height}" role="img"
       aria-label={`The envelope's shape, ${shown.length} points`}
       onpointermove={move} onpointerup={release} onpointercancel={release} ondblclick={add}>
    <rect x={PAD} y={sy(1)} width={w} height={sy(0) - sy(1)} class="unit" />
    <path d={line} class="shape" />
    {#each shown as point, i (i)}
      <!-- Pointer-only on purpose: the fields below are the keyboard's way in. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <circle cx={sx(point.x)} cy={sy(point.y)} r={i === selected ? 5.5 : 4.5}
              class={['node', i === selected && 'sel', i === held && 'held']} data-point={i}
              aria-hidden="true" onpointerdown={(event) => grab(i, event)} />
    {/each}
  </svg>
  <div class="row">
    <span class="which">Point {selected + 1} of {shown.length}</span>
    {#key `${selected}:${shown[selected]?.x}:${shown[selected]?.y}`}
      <label class="cell">x <input type="text" inputmode="decimal" spellcheck="false" value={String(shown[selected]?.x ?? '')}
        aria-label={`x of point ${selected + 1}, from 0 to 1`} onkeydown={(e) => fieldKey(e, 'x')} onblur={(e) => setField(e, 'x')} /></label>
      <label class="cell">y <input type="text" inputmode="decimal" spellcheck="false" value={String(shown[selected]?.y ?? '')}
        aria-label={`y of point ${selected + 1}, from 0 to 1`} onkeydown={(e) => fieldKey(e, 'y')} onblur={(e) => setField(e, 'y')} /></label>
    {/key}
    <button type="button" class="drop" disabled={shown.length <= 2}
            title={shown.length <= 2 ? 'An envelope needs two points' : 'Take this point out'}
            onclick={remove}>Remove</button>
  </div>
  <p class="hint">Drag a point to move it; double-click to add one.</p>
</div>

<style>
  .envpts { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }
  svg { display: block; border: 1px solid #2A3038; border-radius: 3px; background: #0C0F12; touch-action: none; cursor: crosshair; }
  .unit { fill: #12171A; stroke: #232A31; stroke-width: 1; }
  .shape { fill: none; stroke: #8FEDE3; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .node { fill: #173449; stroke: #5B9BD5; stroke-width: 1.5; cursor: grab; }
  .node.sel { fill: #5B9BD5; }
  .node.held { cursor: grabbing; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--txt-dim); }
  .which { min-width: 0; }
  .cell { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); }
  .cell input {
    width: 52px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 5px; padding: 2px 5px;
    color: #e0a23c; font-family: var(--mono); font-size: 12px; outline: none;
  }
  .cell input:focus { border-color: #6aa8ff; }
  .drop {
    margin-left: auto; background: none; border: 1px solid var(--line-2); border-radius: 5px; padding: 2px 8px;
    color: var(--txt-dim); font-size: 11.5px; cursor: pointer;
  }
  .drop:hover:not(:disabled) { color: var(--txt); border-color: var(--txt-dim); }
  .drop:disabled { opacity: 0.4; cursor: default; }
  .hint { margin: 0; font-size: 11px; color: var(--txt-faint); }
</style>
