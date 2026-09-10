<script>
  /**
   * One insert category, on hover from its rail button.
   *
   * WHY THIS IS BACK. `insertCatalog.js` was written for these — its own header says the catalog
   * feeds "the icon rail's category flyouts (which add per-type icons) and the menu bar's Insert
   * menu". The flyouts were traded for the + drawer in one commit on 2026-09-04, and the drawer is
   * two clicks and a read for something the rail has the room to just show: five groups, and the
   * largest holds thirteen items.
   *
   * The drawer stays. It does what a flyout cannot — search across all 56 types, a Recents row, and
   * the saved custom packages inline. These are the fast path, not a replacement for it.
   *
   * THE THING THAT MAKES OR BREAKS A HOVER FLYOUT is the gap between the button and the panel. Move
   * the pointer diagonally toward an item and it crosses that gap; close on `pointerleave` with no
   * grace and the menu vanishes under the cursor. So the panel starts flush against the rail (no
   * gap to cross at all) and the CLOSE is delayed — the rail owns that timer, because it also has
   * to survive the pointer travelling from one category button to the next.
   */
  import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
  import { TYPE_ICONS, FALLBACK_TYPE_ICON } from '../models/insertCatalogIcons.js';
  import { addControl } from '../stores/controls.js';

  let {
    categoryId = '',
    /** Pixels from the top of the viewport, so the panel opens beside its own button. */
    top = 0,
    hasActivePanel = false,
    onenter = () => {},
    onleave = () => {},
    onclose = () => {},
  } = $props();

  let category = $derived(INSERT_CATEGORIES.find((entry) => entry.id === categoryId) ?? null);

  function insert(item) {
    if (!hasActivePanel) return;
    addControl(item.type);
    onclose();
  }

  // The payload the canvas already reads on drop, identical to the drawer's — one insert path.
  function dragStart(item, event) {
    if (!hasActivePanel) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'type', type: item.type }));
  }
</script>

{#if category}
  <!--
    `role="group"`, not `role="menu"`. A menu owes the keyboard arrow-key navigation and roving
    focus; this is a hover panel of ordinary buttons, and claiming the role without the behaviour is
    worse for a screen reader than not claiming it. The buttons tab in order and Escape closes.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="insert-flyout"
    style={`top:${top}px`}
    role="group"
    aria-label={category.label}
    onpointerenter={onenter}
    onpointerleave={onleave}
  >
    <div class="fly-head">
      <span>{category.label}</span>
      <s>{category.items.length}</s>
    </div>

    {#if !hasActivePanel}
      <p class="fly-hint">Open or create a panel to insert components.</p>
    {/if}

    <div class="fly-items">
      {#each category.items as item (item.type)}
        {@const Icon = TYPE_ICONS[item.type] ?? FALLBACK_TYPE_ICON}
        <button
          type="button"
          class="fly-item"
          disabled={!hasActivePanel}
          draggable={hasActivePanel}
          title={`Insert ${item.label} — or drag it onto the canvas`}
          ondragstart={(event) => dragStart(item, event)}
          onclick={() => insert(item)}
        >
          <Icon size={14} strokeWidth={1.6} />
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .insert-flyout {
    position: fixed;
    /* Flush against the 46px rail: no gap for the pointer to fall through. */
    left: 46px;
    z-index: 90;
    min-width: 186px;
    max-height: calc(100vh - 96px);
    display: flex;
    flex-direction: column;
    padding: 6px;
    background: #242424;
    border: 1px solid #3A3A3A;
    border-radius: 0 6px 6px 0;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
    color: #DDD;
    overflow: hidden auto;
  }

  .fly-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 6px 6px;
    font: 600 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    letter-spacing: 0.04em;
    color: #8FB8DC;
    border-bottom: 1px solid #333;
    margin-bottom: 4px;
  }
  .fly-head s { margin-left: auto; text-decoration: none; color: #6A6A6A; font-weight: 400; }

  .fly-hint {
    margin: 0 0 4px;
    padding: 4px 6px;
    font: 400 10px/1.4 'IBM Plex Sans', system-ui, sans-serif;
    color: #B88972;
  }

  .fly-items { display: flex; flex-direction: column; gap: 1px; }

  .fly-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: #CCC;
    font: 400 11.5px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }
  .fly-item:hover:not(:disabled) { background: #3A3A3A; color: #FFF; }
  .fly-item:focus-visible { outline: none; border-color: #5B9BD5; }
  .fly-item:disabled { color: #5A5A5A; cursor: not-allowed; }
  .fly-item :global(svg) { flex: 0 0 auto; color: #8FB8DC; }
  .fly-item:disabled :global(svg) { color: #4E4E4E; }
</style>
