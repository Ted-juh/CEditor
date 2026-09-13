<script>
  // Front-first rows share the renderer order; pointer and keyboard moves write it back.
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import EffectIcon from './EffectIcon.svelte';
  import { readSection } from '../../utils/effectStack.js';

  let {
    control = null,
    domain = 'text',
    rows = [],
    unordered = [],
    ties = [],
    selectedKey = '',
    onselect = () => {},
    ontoggle = () => {},
    onreorder = () => {},
  } = $props();

  let dragKey = $state('');
  let dropIndex = $state(-1);
  let rowEls = $state([]);

  let stackable = $derived(rows.filter((row) => row.stackable));
  let tiedKeys = $derived(new Set(ties.flat().map((row) => row.key)));

  function iconFor(row) {
    return domain === 'component' && row.key.startsWith('shadow:')
      ? readSection(control, row.root)?.type ?? 'shadow' : row.key;
  }


  function beginDrag(row, event) {
    if (!row.stackable || stackable.length < 2) return;
    event.preventDefault();
    dragKey = row.key;
    dropIndex = stackable.findIndex((entry) => entry.key === row.key);
    // Capture is an optimisation, not the mechanism: pointermove and pointerup are bound on the
    // container, so the drag works without it. It throws NotFoundError when the id names no active
    // pointer, and letting that escape would abort the drag before it started.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function moveDrag(event) {
    if (!dragKey) return;
    // Which row is the pointer over? Measured rather than tracked by delta, so a slow drag over
    // rows of differing heights still lands where the drop line says it will.
    const boxes = rowEls.filter(Boolean).map((el) => el.getBoundingClientRect());
    if (!boxes.length) return;
    let next = boxes.length - 1;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (event.clientY < box.top + box.height / 2) { next = i; break; }
    }
    dropIndex = Math.max(0, Math.min(stackable.length - 1, next));
  }

  function endDrag() {
    if (dragKey && dropIndex >= 0) onreorder(dragKey, dropIndex);
    dragKey = '';
    dropIndex = -1;
  }

  function keyReorder(row, event) {
    if (!row.stackable) return;
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!delta || !(event.altKey || event.metaKey)) return;
    event.preventDefault();
    const index = stackable.findIndex((entry) => entry.key === row.key);
    onreorder(row.key, index + delta);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="stack"
  role="listbox"
  tabindex="-1"
  aria-label="Effect stack, front to back"
  onpointermove={moveDrag}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  {#each rows as row, index (row.key)}
    <div
      class="srow"
      class:sel={row.key === selectedKey}
      class:off={!row.enabled}
      class:dragging={dragKey === row.key}
      class:tied={tiedKeys.has(row.key)}
      role="option"
      tabindex="0"
      aria-selected={row.key === selectedKey}
      bind:this={rowEls[index]}
      onclick={() => onselect(row.key)}
      onkeydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.key); }
        keyReorder(row, event);
      }}
    >
      {#if dragKey && dropIndex === index && dragKey !== row.key}
        <span class="dropline" aria-hidden="true"></span>
      {/if}

      <span
        class="grip"
        class:idle={!row.stackable}
        role="presentation"
        title={row.stackable ? 'Drag to restack (Alt+↑/↓)' : 'Not part of the visual stack'}
        onpointerdown={(event) => beginDrag(row, event)}
      >
        <GripVertical size={11} aria-hidden="true" />
      </span>

      <button
        type="button"
        class="dot"
        class:on={row.enabled}
        class:locked={row.alwaysOn}
        disabled={row.alwaysOn}
        title={row.alwaysOn ? `${row.label} is always drawn` : (row.enabled ? `Switch ${row.label} off` : `Switch ${row.label} on`)}
        aria-label={`${row.label} ${row.enabled ? 'on' : 'off'}`}
        onclick={(event) => { event.stopPropagation(); ontoggle(row); }}
      ></button>

      <EffectIcon name={iconFor(row)} size={20} />
      <span class="snm">
        {row.label}{#if row.note}<i>— {row.note}</i>{/if}
      </span>
    </div>
  {/each}

  {#if ties.length}
    <div class="tiebar" role="status">
      {#each ties as tie (tie.map((row) => row.key).join('+'))}
        <span>{tie.map((row) => row.label).join(' and ')} both sit at order {tie[0].order} — drag to separate</span>
      {/each}
    </div>
  {/if}

  {#if unordered.length}
    <div class="ungrouped">
      <span class="ungrouped-head">Not stacked</span>
      {#each unordered as row (row.key)}
        <div
          class="srow"
          class:sel={row.key === selectedKey}
          class:off={!row.enabled}
          role="option"
          tabindex="0"
          aria-selected={row.key === selectedKey}
          onclick={() => onselect(row.key)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.key); }
          }}
        >
          <span class="grip idle" aria-hidden="true"><GripVertical size={11} /></span>
          <button
            type="button"
            class="dot"
            class:on={row.enabled}
            class:locked={row.alwaysOn}
            disabled={row.alwaysOn}
            title={row.alwaysOn ? `${row.label} is always applied` : `Toggle ${row.label}`}
            aria-label={`${row.label} ${row.enabled ? 'on' : 'off'}`}
            onclick={(event) => { event.stopPropagation(); ontoggle(row); }}
          ></button>
          <EffectIcon name={iconFor(row)} size={20} />
          <span class="snm">{row.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .stack {
    background: #1E1E1E;
    border: 1px solid #333;
    border-radius: 4px;
    overflow: hidden;
    outline: none;
  }

  .srow {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px;
    min-height: 26px;
    box-sizing: border-box;
    border-bottom: 1px solid #242424;
    font-size: 11px;
    position: relative;
    cursor: pointer;
    outline: none;
  }
  .srow:last-child { border-bottom: 0; }
  .srow:hover { background: #252525; }
  .srow:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .srow.sel { background: #094771; box-shadow: inset 2px 0 0 #5B9BD5; }
  .srow.off .snm { color: #888; }
  .srow.off.sel .snm { color: #FFF; }
  .srow.dragging { background: #094771; box-shadow: inset 2px 0 0 #5B9BD5; }
  .srow.tied .snm::after {
    content: '⚠';
    color: #E5A029;
    margin-left: 5px;
    font-size: 9px;
  }

  .dropline {
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: #5B9BD5;
    border-radius: 1px;
    pointer-events: none;
  }

  .grip {
    flex: 0 0 11px;
    color: #4B545C;
    display: flex;
    align-items: center;
    cursor: grab;
    touch-action: none;
  }
  .grip.idle { cursor: default; opacity: 0.35; }
  .grip:active { cursor: grabbing; }

  .dot {
    flex: 0 0 9px;
    width: 9px;
    height: 9px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #3A434A;
    background: #2A2F33;
    cursor: pointer;
  }
  .dot.on { background: #5B9BD5; border-color: #0B6EB5; }
  .dot.locked { cursor: default; background: #6E8A4E; border-color: #55703C; }

  .snm {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #B9C8D4;
  }
  .snm i { font-style: normal; opacity: 0.55; margin-left: 4px; }
  .srow.sel .snm { color: #EAF5FF; }
  .srow :global(.effect-icon) { color: #AABAC7; }
  .srow.sel :global(.effect-icon) { color: #FFF; }

  .tiebar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 6px;
    background: #241d10;
    border-top: 1px solid #4A3A1C;
    font: inherit;
    font-size: 10px;
    color: #E5A029;
  }

  .ungrouped { border-top: 1px solid #333; }
  .ungrouped-head {
    display: block;
    padding: 5px 6px 3px;
    font: inherit;
    font-size: 10px;
    color: #616C75;
  }
</style>
