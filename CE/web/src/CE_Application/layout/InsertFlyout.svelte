<script>
  /**
   * One insert flyout: a category on hover, or the search.
   *
   * WHY ONE COMPONENT FOR BOTH. The + used to open a 394-line drawer that listed every category out
   * again — the same browsing the five category buttons now do, one click further away. So the +
   * became the SEARCH, and search results belong in the same panel the categories open in: one
   * shape, one place on screen, whichever button you came from.
   *
   * `insertCatalog.js` was written for these; its own header calls them "the icon rail's category
   * flyouts (which add per-type icons)".
   *
   * THE THING THAT MAKES OR BREAKS A HOVER FLYOUT is the gap between the button and the panel. Move
   * the pointer diagonally toward an item and it crosses that gap; close on `pointerleave` with no
   * grace and the menu vanishes under the cursor. So the panel starts flush against the rail (no
   * gap to cross at all) and the CLOSE is delayed — the rail owns that timer, because it also has
   * to survive the pointer travelling from one category button to the next.
   *
   * THE PANEL IS THE EDITOR'S HEIGHT, always, whichever button opened it. `App.svelte`'s shell is
   * `grid-template-rows: 28px 1fr 24px` — menu bar, editor, status bar — so the editor band is
   * exactly 28px from the top and 24px from the bottom. Anchoring there rather than to the hovered
   * button means the panel does not jump up and down the screen as you move along the rail, and the
   * long categories never need scrolling.
   */
  import Search from 'lucide-svelte/icons/search';
  import Package from 'lucide-svelte/icons/package';
  import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
  import { TYPE_ICONS, CATEGORY_ICONS, FALLBACK_TYPE_ICON } from '../models/insertCatalogIcons.js';
  import { addControl, addCustomComponentPackage } from '../stores/controls.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { insertRecents } from '../stores/insertRecents.js';

  let {
    /** 'category' — one group's items. 'search' — a box, and what it finds. */
    mode = 'category',
    categoryId = '',
    hasActivePanel = false,
    onenter = () => {},
    onleave = () => {},
    onclose = () => {},
  } = $props();

  let category = $derived(INSERT_CATEGORIES.find((entry) => entry.id === categoryId) ?? null);

  let query = $state('');
  let inputEl = $state(null);

  // Opening the search means typing into it, so it takes focus. The + sits alone at the top of the
  // rail, away from the category buttons, so a stray hover on the way somewhere else is unlikely.
  $effect(() => {
    if (mode === 'search' && inputEl) inputEl.focus();
  });

  /** Every type, with the category it came from — a search result says where a thing lives. */
  const ALL_ITEMS = INSERT_CATEGORIES.flatMap((entry) =>
    entry.items.map((item) => ({ ...item, categoryId: entry.id, categoryLabel: entry.label }))
  );
  const ITEM_BY_TYPE = new Map(ALL_ITEMS.map((item) => [item.type, item]));

  // The same rule the drawer searched by: name, type id, or the category's name.
  let hits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(q)
      || item.type.toLowerCase().includes(q)
      || item.categoryLabel.toLowerCase().includes(q));
  });

  let packageHits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ($customComponentLibrary ?? []).filter((entry) => String(entry.name ?? '').toLowerCase().includes(q));
  });

  // Before anything is typed, the last few types used — an empty search box with nothing under it
  // is a worse start than no panel at all.
  let recents = $derived(
    ($insertRecents ?? []).filter((type) => ITEM_BY_TYPE.has(type)).map((type) => ITEM_BY_TYPE.get(type)).slice(0, 8)
  );

  let items = $derived(mode === 'search' ? (query.trim() ? hits : recents) : (category?.items ?? []));
  let heading = $derived(mode === 'search' ? 'Search' : (category?.label ?? ''));
  let countLabel = $derived(
    mode === 'search'
      ? (query.trim() ? String(hits.length + packageHits.length) : (recents.length ? 'recent' : ''))
      : String(category?.items.length ?? 0)
  );

  function insert(item) {
    if (!hasActivePanel) return;
    addControl(item.type);
    onclose();
  }

  function insertPackage(entry) {
    if (!hasActivePanel || !entry?.envelope) return;
    addCustomComponentPackage(entry.envelope);
    customComponentLibrary.markUsed(entry.id);
    onclose();
  }

  // The payload the canvas already reads on drop, identical to the one the drawer sent — one insert
  // path, not a second.
  function dragType(item, event) {
    if (!hasActivePanel) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'type', type: item.type }));
  }

  function dragPackage(entry, event) {
    if (!hasActivePanel || !entry?.id) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'package', id: entry.id }));
  }

  function keydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onclose();
  }
</script>

{#if mode === 'search' || category}
  <!--
    `role="group"`, not `role="menu"`. A menu owes the keyboard arrow-key navigation and roving
    focus; this is a panel of ordinary buttons, and claiming the role without the behaviour is worse
    for a screen reader than not claiming it. The buttons tab in order and Escape closes.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="insert-flyout"
    role="group"
    aria-label={mode === 'search' ? 'Search components' : heading}
    onpointerenter={onenter}
    onpointerleave={onleave}
    onkeydown={keydown}
  >
    <div class="fly-head">
      {#if mode === 'search'}<Search size={12} strokeWidth={1.8} aria-hidden="true" />{/if}
      <span>{heading}</span>
      {#if countLabel}<s>{countLabel}</s>{/if}
    </div>

    {#if mode === 'search'}
      <input
        class="fly-search"
        type="text"
        placeholder="Search components"
        aria-label="Search components"
        bind:this={inputEl}
        bind:value={query}
      />
    {/if}

    {#if !hasActivePanel}
      <p class="fly-hint">Open or create a panel to insert components.</p>
    {/if}

    <div class="fly-scroll">
      {#if mode === 'search' && !query.trim() && !recents.length}
        <p class="fly-none">Type to find any of the {ALL_ITEMS.length} components.</p>
      {/if}

      {#if mode === 'search' && !query.trim() && recents.length}
        <div class="fly-group">Recent</div>
      {/if}

      {#if mode === 'search' && query.trim() && !items.length && !packageHits.length}
        <p class="fly-none">Nothing matches “{query.trim()}”.</p>
      {/if}

      <div class="fly-items">
        {#each items as item (item.type)}
          {@const Icon = TYPE_ICONS[item.type] ?? FALLBACK_TYPE_ICON}
          {@const Badge = CATEGORY_ICONS[item.categoryId] ?? null}
          <button
            type="button"
            class="fly-item"
            disabled={!hasActivePanel}
            draggable={hasActivePanel}
            title={`Insert ${item.label} — or drag it onto the canvas`}
            ondragstart={(event) => dragType(item, event)}
            onclick={() => insert(item)}
          >
            <Icon size={14} strokeWidth={1.6} />
            <span>{item.label}</span>
            <!-- A search result says which group it came from; inside a group that would be noise. -->
            {#if mode === 'search' && query.trim() && Badge}
              <i class="fly-where" title={item.categoryLabel}><Badge size={11} strokeWidth={1.6} /></i>
            {/if}
          </button>
        {/each}
      </div>

      {#if packageHits.length}
        <div class="fly-group">Saved packages</div>
        <div class="fly-items">
          {#each packageHits as entry (entry.id)}
            <button
              type="button"
              class="fly-item package"
              disabled={!hasActivePanel}
              draggable={hasActivePanel}
              title={`Insert the saved ${entry.name} — or drag it onto the canvas`}
              ondragstart={(event) => dragPackage(entry, event)}
              onclick={() => insertPackage(entry)}
            >
              <Package size={14} strokeWidth={1.6} aria-hidden="true" />
              <span>{entry.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .insert-flyout {
    position: fixed;
    /* Flush against the rail: no gap for the pointer to fall through, and no hard-coded width to
       drift from `workspaceChrome.iconWidth`. */
    left: var(--icon-width, 48px);
    /* The editor band: App.svelte's shell is `28px 1fr 24px` — menu bar, editor, status bar. */
    top: 28px;
    bottom: 24px;
    z-index: 90;
    width: 236px;
    display: flex;
    flex-direction: column;
    padding: 8px 6px 6px;
    background: #242424;
    border: 1px solid #3A3A3A;
    border-left: none;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
    color: #DDD;
  }

  .fly-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px 7px;
    font: 600 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    letter-spacing: 0.04em;
    color: #8FB8DC;
    border-bottom: 1px solid #333;
    flex: 0 0 auto;
  }
  .fly-head s { margin-left: auto; text-decoration: none; color: #6A6A6A; font-weight: 400; }

  .fly-search {
    box-sizing: border-box;
    width: 100%;
    height: 26px;
    margin-top: 7px;
    padding: 0 7px;
    background: #1A1A1A;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    color: #DDD;
    font: 400 11.5px/1 'IBM Plex Sans', system-ui, sans-serif;
    outline: none;
    flex: 0 0 auto;
  }
  .fly-search:focus { border-color: #5B9BD5; }
  .fly-search::placeholder { color: #6A6A6A; }

  .fly-hint {
    margin: 7px 0 0;
    padding: 4px 6px;
    font: 400 10px/1.4 'IBM Plex Sans', system-ui, sans-serif;
    color: #B88972;
    flex: 0 0 auto;
  }

  .fly-scroll { margin-top: 6px; flex: 1 1 auto; min-height: 0; overflow: hidden auto; }

  .fly-group {
    padding: 6px 6px 4px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6A6A6A;
  }

  .fly-none {
    margin: 4px 0 0;
    padding: 4px 6px;
    font: 400 10.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #7A7A7A;
  }

  .fly-items { display: flex; flex-direction: column; gap: 1px; }

  .fly-item {
    display: flex;
    align-items: flex-start;
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
  }
  .fly-item:hover:not(:disabled) { background: #3A3A3A; color: #FFF; }
  .fly-item:focus-visible { outline: none; border-color: #5B9BD5; }
  .fly-item:disabled { color: #5A5A5A; cursor: not-allowed; }
  /* Several catalog labels carry a parenthetical — "Phrase Recorder (record + loop notes)" — and
     ellipsing them hides the half that says what the thing is. They wrap instead. */
  .fly-item > span { min-width: 0; line-height: 1.3; }
  .fly-item :global(svg) { flex: 0 0 auto; margin-top: 1px; color: #8FB8DC; }
  .fly-item:disabled :global(svg) { color: #4E4E4E; }
  .fly-item.package :global(svg) { color: #8FD3A8; }

  .fly-where { margin-left: auto; display: flex; align-self: flex-start; margin-top: 1px; opacity: 0.55; }
  .fly-where :global(svg) { color: #8A8A8A; }
</style>
