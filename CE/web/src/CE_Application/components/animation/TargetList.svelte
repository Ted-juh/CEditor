<script>
  /**
   * What the animation changes, as a list you can edit.
   *
   * In the properties panel this is a twelve-row box of raw JSON. There is an "Append target"
   * button, but to delete one or change the order you edit the JSON by hand, and the only feedback
   * is a red parse error.
   *
   * Each row here says whether it does anything. Two of the properties the panel's own dropdown
   * offers — Fill colour and Text colour — are not on the runtime's list, so they animate nothing,
   * and a target on a part that does not exist is built and then never drawn.
   */
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import X from 'lucide-svelte/icons/x';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

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

  function endDrag() {
    if (dragIndex >= 0 && dropIndex >= 0 && dragIndex !== dropIndex) onreorder(dragIndex, dropIndex);
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
        ? `Animates ${row.status.animates}`
        : row.status.detail}
      onclick={() => onselect(row.index)}
      onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.index); } }}
    >
      {#if dragIndex >= 0 && dropIndex === row.index && dragIndex !== row.index}
        <span class="dropline" aria-hidden="true"></span>
      {/if}

      <span class="grip" role="presentation" title="Drag to reorder"
            onpointerdown={(event) => beginDrag(row.index, event)}>
        <GripVertical size={10} aria-hidden="true" />
      </span>

      <span class="what">
        {#if bits.part}<b>{bits.part}</b>{/if}
        <i>{bits.rest || '(no path)'}</i>
      </span>

      <span class="does">
        {#if row.status.works}
          {row.status.animates}
        {:else}
          <TriangleAlert size={10} aria-hidden="true" /> does nothing
        {/if}
      </span>

      <button type="button" class="drop" title="Remove this target"
              aria-label={`Remove ${row.path}`}
              onclick={(event) => { event.stopPropagation(); onremove(row.index); }}>
        <X size={10} />
      </button>
    </div>
  {/each}

  {#if !rows.length}
    <p class="none">This animation changes nothing yet. Pick a part and a property below and add one.</p>
  {/if}
</div>

<style>
  .targets {
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    overflow: hidden;
    outline: none;
  }

  .trow {
    position: relative;
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto 18px;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-bottom: 1px solid #1E242A;
    font: 400 10px/1.3 'IBM Plex Mono', ui-monospace, monospace;
    color: #B9C8D4;
    cursor: pointer;
    outline: none;
  }
  .trow:last-child { border-bottom: 0; }
  .trow:hover { background: #1A2126; }
  .trow:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .trow.sel { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }
  .trow.bad { background: #221D12; box-shadow: inset 2px 0 0 #E5A029; }
  .trow.bad.sel { background: #2A2417; box-shadow: inset 2px 0 0 #5B9BD5; }
  .trow.dragging { background: #0B2320; }

  .dropline {
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: #14B8A6;
    border-radius: 1px;
  }

  .grip { color: #4B545C; display: flex; cursor: grab; touch-action: none; }
  .grip:active { cursor: grabbing; }

  .what { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .what b { color: #8FEDE3; font-weight: 600; }
  .what i { font-style: normal; color: #C3D0DA; margin-left: 4px; }

  .does {
    display: flex;
    align-items: center;
    gap: 3px;
    font: 400 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
  }
  .trow.bad .does { color: #E5A029; }

  .drop {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #4B545C;
    cursor: pointer;
  }
  .drop:hover { border-color: #5C3A3A; color: #D98C8C; }

  .none {
    margin: 0;
    padding: 14px 10px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
