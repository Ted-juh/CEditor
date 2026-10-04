<script>
  /**
   * What the animation changes, as a list you can edit.
   *
   * In the properties panel this is a twelve-row box of raw JSON. There is an "Append target"
   * button, but to delete one or change the order you edit the JSON by hand, and the only feedback
   * is a red parse error.
   *
   * Each row here says whether it does anything. A path the runtime does not animate is reported,
   * and so is a target on a part that does not exist, which the runtime builds and then never draws.
   * (Fill colour and Text colour, which the panel's own dropdown offers, were the first dead ones;
   * the runtime animates colour now.)
   *
   * And what each working one costs the browser: transform and opacity are moved by the compositor,
   * colour repaints, width and height re-run layout every frame (animationModel.targetCost). On a
   * panel of two hundred controls that is the difference between smooth and not, and nothing else
   * on screen says so.
   */
  import { tick } from 'svelte';
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import X from 'lucide-svelte/icons/x';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { targetCost } from '../../utils/animationModel.js';

  let {
    rows = [],
    selectedIndex = -1,
    onselect = () => {},
    onremove = () => {},
    onreorder = () => {},
  } = $props();

  let dragIndex = $state(-1);
  let dropIndex = $state(-1);
  let rowEls = $state([]);

  function beginDrag(index, event) {
    if (rows.length < 2) return;
    event.preventDefault();
    dragIndex = index;
    dropIndex = index;
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function moveDrag(event) {
    if (dragIndex < 0) return;
    const boxes = rowEls.filter(Boolean).map((el) => el.getBoundingClientRect());
    if (!boxes.length) return;
    let next = boxes.length - 1;
    for (let i = 0; i < boxes.length; i += 1) {
      if (event.clientY < boxes[i].top + boxes[i].height / 2) { next = i; break; }
    }
    dropIndex = Math.max(0, Math.min(rows.length - 1, next));
  }

  // Move a row, keeping the selection on the row it was on.
  function reorder(from, to) {
    let nextSelection = selectedIndex;
    if (selectedIndex === from) nextSelection = to;
    else if (from < to && selectedIndex > from && selectedIndex <= to) nextSelection -= 1;
    else if (to < from && selectedIndex >= to && selectedIndex < from) nextSelection += 1;
    onreorder(from, to);
    if (nextSelection !== selectedIndex) onselect(nextSelection);
  }

  // Alt+Up / Alt+Down on a focused row: the keyboard's way to drag it, as moving a line is in an editor.
  async function keyMove(index, step) {
    const to = index + step;
    if (to < 0 || to >= rows.length) return;
    reorder(index, to);
    await tick();
    rowEls[to]?.focus();
  }

  function endDrag() {
    if (dragIndex >= 0 && dropIndex >= 0 && dragIndex !== dropIndex) reorder(dragIndex, dropIndex);
    dragIndex = -1;
    dropIndex = -1;
  }

  /** "Parts.label.Layout.scale" reads better split up. */
  function shortPath(path) {
    const parts = String(path ?? '').split('.');
    if (parts[0] === 'Parts' && parts.length > 2) return { part: parts[1], rest: parts.slice(2).join('.') };
    return { part: '', rest: String(path ?? '') };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="targets" role="listbox" tabindex="-1" aria-label="What this animation changes"
     onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag}>
  {#each rows as row (row.index)}
    {@const bits = shortPath(row.path)}
    {@const cost = row.status.works ? targetCost(row.target) : null}
    <div
      class="trow"
      class:sel={row.index === selectedIndex}
      class:bad={!row.status.works}
      class:dragging={dragIndex === row.index}
      role="option"
      tabindex="0"
      aria-selected={row.index === selectedIndex}
      bind:this={rowEls[row.index]}
      title={row.status.works
        ? `Animates ${row.status.animates}${row.status.note ? `. ${row.status.note}` : ''}`
        : row.status.detail}
      onclick={() => onselect(row.index)}
      onkeydown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.index); }
        else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); keyMove(row.index, event.key === 'ArrowUp' ? -1 : 1); }
      }}
    >
      {#if dragIndex >= 0 && dropIndex === row.index && dragIndex !== row.index}
        <span class="dropline" aria-hidden="true"></span>
      {/if}

      <span class="grip" role="presentation" title="Drag to reorder (Alt+Up / Alt+Down on a row)"
            onpointerdown={(event) => beginDrag(row.index, event)}>
        <GripVertical size={13} aria-hidden="true" />
      </span>

      <span class="what">
        {#if bits.part}<b>{bits.part}</b>{/if}
        <i>{bits.rest || '(no path)'}</i>
      </span>

      <span class="does">
        {#if row.status.works}
          {row.status.animates}
          {#if row.status.note}<i class="note" title={row.status.note}>solid only</i>{/if}
        {:else}
          <TriangleAlert size={13} aria-hidden="true" /> does nothing
        {/if}
      </span>

      <span class="cost {cost?.level ?? ''}" title={cost?.detail ?? ''}>{cost?.label ?? ''}</span>

      <button type="button" class="drop" title="Remove this target"
              aria-label={`Remove ${row.path}`}
              onclick={(event) => { event.stopPropagation(); onremove(row.index); }}>
        <X size={13} />
      </button>
    </div>
  {/each}

  {#if !rows.length}
    <p class="none">This animation changes nothing yet. Pick a part and a property below and add one.</p>
  {/if}
</div>

<style>
  .targets { outline: none; }

  .trow {
    position: relative;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto auto 24px;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    padding: 0 4px 0 6px;
    border: 1px solid #232A31;
    border-radius: 6px;
    margin-bottom: 4px;
    background: #161B20;
    font: 400 13px/1.3 'IBM Plex Sans', system-ui, sans-serif;
    color: #E8EEF3;
    cursor: pointer;
    outline: none;
  }
  .trow:hover { border-color: #3A434D; }
  .trow:focus-visible { box-shadow: 0 0 0 2px #7CC4FF; }
  .trow.sel { background: #173A5A; border-color: #5AA9E6; }
  .trow.bad { background: #2E2410; border-color: #7A5C16; }
  .trow.bad.sel { border-color: #5AA9E6; }
  .trow.dragging { background: #10362F; }

  .dropline {
    position: absolute;
    left: 0;
    right: 0;
    top: -3px;
    height: 2px;
    background: #3DDBB4;
    border-radius: 1px;
  }

  .grip { color: #8A96A3; display: flex; cursor: grab; touch-action: none; }
  .grip:active { cursor: grabbing; }

  .what { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .what b { color: #BFF3E6; font-weight: 600; }
  .what i { font-style: normal; font-family: 'IBM Plex Mono', ui-monospace, monospace; color: #E8EEF3; margin-left: 5px; }

  .does {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #AEB9C4;
    white-space: nowrap;
  }
  .trow.bad .does { color: #F6D58A; font-weight: 600; }
  .does .note { font-style: normal; color: #AEB9C4; border: 1px solid #3A434D; border-radius: 4px; padding: 0 5px; }

  .cost { font-size: 12px; padding: 1px 6px; border-radius: 4px; color: #AEB9C4; }
  .cost:empty { padding: 0; }
  .cost.paint { color: #F6D58A; border: 1px solid #7A5C16; }
  .cost.layout { color: #FFC9C9; border: 1px solid #8A3B3B; }

  .drop {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: #8A96A3;
    cursor: pointer;
  }
  .drop:hover { border-color: #8A3B3B; color: #FFC9C9; }

  .none {
    margin: 0;
    padding: 6px 4px;
    font: 400 13px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #AEB9C4;
  }
</style>
