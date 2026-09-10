<script>
  /**
   * The stack — the column that replaces eleven `*Order` number fields.
   *
   * Rows are front first. Dragging one writes new order numbers through `reorderTextStack`; the
   * row thumbnails show what each layer contributes on its own, which is the only way to tell
   * which of nine live effects is producing what you are looking at.
   *
   * Drag is pointer-based rather than HTML5 drag-and-drop: the dock is a small target, HTML5 drag
   * images look wrong over a dark panel, and pointer capture gives the same drop-line feedback the
   * layer tree already uses.
   */
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import EffectPreview from './EffectPreview.svelte';
  import { withOnlyEffect } from '../../utils/effectStack.js';

  let {
    control = null,
    domain = 'text',
    rows = [],
    unordered = [],
    ties = [],
    selectedKey = '',
    soloed = [],
    muted = [],
    onselect = () => {},
    ontoggle = () => {},
    onsolo = () => {},
    onmute = () => {},
    onreorder = () => {},
  } = $props();

  let dragKey = $state('');
  let dropIndex = $state(-1);
  let rowEls = $state([]);

  let stackable = $derived(rows.filter((row) => row.stackable));
  let tiedKeys = $derived(new Set(ties.flat().map((row) => row.key)));

  function previewFor(row) {
    return withOnlyEffect(control, domain, row.key);
  }

  function beginDrag(row, event) {
    if (!row.stackable || stackable.length < 2) return;
    event.preventDefault();
    dragKey = row.key;
    dropIndex = stackable.findIndex((entry) => entry.key === row.key);
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
      class:fillrow={row.key === 'fill'}
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

      <span class="snm">
        {row.label}{#if row.note}<i>— {row.note}</i>{/if}
      </span>

      <span class="sm">
        <button
          type="button"
          class:on={soloed.includes(row.key)}
          title={`Solo ${row.label} on the specimen`}
          onclick={(event) => { event.stopPropagation(); onsolo(row.key); }}
        >S</button>
        <button
          type="button"
          class:mu={muted.includes(row.key)}
          title={`Mute ${row.label} on the specimen`}
          onclick={(event) => { event.stopPropagation(); onmute(row.key); }}
        >M</button>
      </span>

      <span class="thumb" title={`${row.label} on its own`}>
        <EffectPreview control={previewFor(row)} boxWidth={44} boxHeight={22} fit="cover" zoom={1.25} maxScale={1.2} label={`${row.label} alone`} />
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
          <span class="snm">{row.label}</span>
          <span class="thumb">
            <EffectPreview control={previewFor(row)} boxWidth={44} boxHeight={22} fit="cover" zoom={1.25} maxScale={1.2} label={`${row.label} alone`} />
          </span>
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
    padding: 4px 5px;
    border-bottom: 1px solid #242424;
    font-size: 10px;
    position: relative;
    cursor: pointer;
    outline: none;
  }
  .srow:last-child { border-bottom: 0; }
  .srow:hover { background: #252525; }
  .srow:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .srow.sel { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }
  .srow.fillrow { background: #191F17; box-shadow: inset 2px 0 0 #6E8A4E; }
  .srow.fillrow.sel { background: #1E2A22; box-shadow: inset 2px 0 0 #5B9BD5; }
  .srow.off { opacity: 0.5; }
  .srow.dragging { background: #0B2320; box-shadow: inset 2px 0 0 #14B8A6; }
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
    background: #14B8A6;
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
  .dot.on { background: #14B8A6; border-color: #0E7C70; }
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
  .srow.fillrow .snm { color: #C7D9A8; }

  .sm { display: flex; gap: 2px; flex: 0 0 auto; }
  .sm button {
    width: 14px;
    height: 14px;
    padding: 0;
    border: 1px solid #333B42;
    border-radius: 2px;
    background: #12171A;
    font: 600 7.5px/12px 'IBM Plex Mono', ui-monospace, monospace;
    color: #69737B;
    cursor: pointer;
  }
  .sm button:hover { border-color: #4A555E; color: #9AA6AE; }
  .sm button.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .sm button.mu { border-color: #5C3A3A; background: #241616; color: #D98C8C; }

  .thumb {
    flex: 0 0 44px;
    height: 22px;
    border: 1px solid #2E3540;
    border-radius: 2px;
    background: #0C0F12;
    overflow: hidden;
    display: flex;
  }

  .tiebar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 6px;
    background: #241d10;
    border-top: 1px solid #4A3A1C;
    font: 400 8.5px/1.35 'IBM Plex Mono', ui-monospace, monospace;
    color: #E5A029;
  }

  .ungrouped { border-top: 1px solid #333; }
  .ungrouped-head {
    display: block;
    padding: 5px 6px 3px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #616C75;
  }
</style>
