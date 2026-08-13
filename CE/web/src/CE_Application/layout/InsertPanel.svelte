<script>
  /**
   * Insert panel — the single browsable palette for everything that can go
   * on a panel, opened from the rail's + button. Replaces the five hover
   * flyouts with one searchable, categorised drawer:
   *
   *   - search across all built-in types (name, type id, category)
   *   - a Recents row of the last-used types
   *   - every catalog category, each item click-to-insert AND drag-to-place
   *     (drop lands the control centred on the drop point)
   *   - custom component packages from the library, inline
   *
   * The custom library's own drawer (detail view, pinning, API preview)
   * stays available from its rail button; this panel links to it.
   */
  import Search from 'lucide-svelte/icons/search';
  import Container from 'lucide-svelte/icons/container';
  import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
  import { CATEGORY_ICONS, TYPE_ICONS, FALLBACK_TYPE_ICON } from '../models/insertCatalogIcons.js';
  import { addControl, addCustomComponentPackage } from '../stores/controls.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { insertRecents } from '../stores/insertRecents.js';

  let {
    hasActivePanel = false,
    onclose = () => {},
    onopenlibrary = () => {},
  } = $props();

  let query = $state('');

  const TYPE_LABELS = new Map(
    INSERT_CATEGORIES.flatMap((category) => category.items.map((item) => [item.type, item.label]))
  );

  let filteredCategories = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return INSERT_CATEGORIES
      .map((category) => ({
        ...category,
        icon: CATEGORY_ICONS[category.id] ?? FALLBACK_TYPE_ICON,
        items: q
          ? category.items.filter((item) =>
              item.label.toLowerCase().includes(q)
              || item.type.toLowerCase().includes(q)
              || category.label.toLowerCase().includes(q))
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  });

  let recentItems = $derived(
    $insertRecents
      .filter((type) => TYPE_LABELS.has(type))
      .map((type) => ({ type, label: TYPE_LABELS.get(type) }))
      .slice(0, 6)
  );

  let filteredPackages = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const entries = $customComponentLibrary ?? [];
    if (!q) return entries.slice(0, 6);
    return entries.filter((entry) => String(entry.name ?? '').toLowerCase().includes(q)).slice(0, 12);
  });

  function insertType(type) {
    if (!hasActivePanel) return;
    addControl(type);
  }

  function insertPackage(entry) {
    if (!hasActivePanel || !entry?.envelope) return;
    addCustomComponentPackage(entry.envelope);
    customComponentLibrary.markUsed(entry.id);
  }

  // Drag-to-place: the canvas reads this payload on drop and inserts at the
  // drop point (EditorCanvas → addControl(..., { at })).
  function handleTypeDragStart(type, e) {
    if (!hasActivePanel) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'type', type }));
  }

  function handlePackageDragStart(entry, e) {
    if (!hasActivePanel || !entry?.id) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-ceditor-insert', JSON.stringify({ kind: 'package', id: entry.id }));
  }
</script>

<div class="insert-panel">
  <div class="drawer-header">
    <div>
      <strong>Insert</strong>
      <span>click to add · drag to place</span>
    </div>
    <button class="close-btn" title="Close" onclick={onclose}>x</button>
  </div>

  <label class="search-row">
    <Search size={14} strokeWidth={1.6} />
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" placeholder="Search components" bind:value={query} autofocus />
  </label>

  {#if !hasActivePanel}
    <div class="panel-hint">Open or create a panel to insert components.</div>
  {/if}

  <div class="drawer-list">
    {#if recentItems.length && !query.trim()}
      <div class="section-title">Recent</div>
      <div class="recent-row">
        {#each recentItems as item (item.type)}
          {@const Icon = TYPE_ICONS[item.type] ?? FALLBACK_TYPE_ICON}
          <button
            class="recent-chip"
            title={`Insert ${item.label}`}
            disabled={!hasActivePanel}
            draggable={hasActivePanel}
            ondragstart={(e) => handleTypeDragStart(item.type, e)}
            onclick={() => insertType(item.type)}
          >
            <Icon size={13} strokeWidth={1.6} />
            <span>{item.label}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#each filteredCategories as category (category.id)}
      <div class="section-title">
        <category.icon size={12} strokeWidth={1.6} />
        <span>{category.label}</span>
      </div>
      {#each category.items as item (item.type)}
        {@const Icon = TYPE_ICONS[item.type] ?? FALLBACK_TYPE_ICON}
        <button
          class="insert-item"
          title={hasActivePanel ? `Insert ${item.label} — or drag it onto the panel` : `${item.label} (open a panel first)`}
          disabled={!hasActivePanel}
          draggable={hasActivePanel}
          ondragstart={(e) => handleTypeDragStart(item.type, e)}
          onclick={() => insertType(item.type)}
        >
          <span class="item-icon"><Icon size={15} strokeWidth={1.5} /></span>
          <span class="item-label">{item.label}</span>
        </button>
      {/each}
    {/each}

    {#if filteredPackages.length}
      <div class="section-title">
        <Container size={12} strokeWidth={1.6} />
        <span>Custom Library</span>
        <button class="link-btn" title="Open the full library (details, pinning, API)" onclick={onopenlibrary}>browse</button>
      </div>
      {#each filteredPackages as entry (entry.id)}
        <button
          class="insert-item"
          class:invalid={entry.validation?.ok === false}
          title={hasActivePanel ? `Insert ${entry.name} — or drag it onto the panel` : `${entry.name} (open a panel first)`}
          disabled={!hasActivePanel}
          draggable={hasActivePanel}
          ondragstart={(e) => handlePackageDragStart(entry, e)}
          onclick={() => insertPackage(entry)}
        >
          <span class="item-icon"><Container size={15} strokeWidth={1.5} /></span>
          <span class="item-label">{entry.name}</span>
          <span class="item-meta">{entry.version ?? ''}</span>
        </button>
      {/each}
    {/if}

    {#if !filteredCategories.length && !filteredPackages.length}
      <div class="empty-result">No components match "{query.trim()}".</div>
    {/if}
  </div>
</div>

<style>
  .insert-panel {
    position: fixed;
    left: 46px;
    top: 48px;
    bottom: 42px;
    width: 250px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: #242424;
    border: 1px solid #3A3A3A;
    border-radius: 0 6px 6px 0;
    box-shadow: 4px 0 18px rgba(0, 0, 0, 0.4);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .drawer-header strong {
    color: #DDD;
    font-size: 12px;
  }

  .drawer-header span {
    margin-left: 6px;
    color: #777;
    font-size: 10px;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
  }

  .close-btn:hover { color: #DDD; }

  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: #1C1C1C;
    border: 1px solid #383838;
    border-radius: 4px;
    color: #666;
  }

  .search-row input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
  }

  .search-row input::placeholder { color: #555; }

  .panel-hint {
    padding: 6px 8px;
    background: #2A2113;
    border: 1px solid #4A3A1A;
    border-radius: 4px;
    color: #C9A55B;
    font-size: 10px;
  }

  .drawer-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 2px;
  }

  .drawer-list::-webkit-scrollbar { width: 6px; }
  .drawer-list::-webkit-scrollbar-thumb { background: #3A3A3A; border-radius: 3px; }

  .section-title {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 8px 0 3px;
    color: #7A7A7A;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .section-title:first-child { margin-top: 0; }

  .link-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: #5B9BD5;
    font-size: 10px;
    cursor: pointer;
    text-transform: none;
    font-family: inherit;
    padding: 0;
  }

  .link-btn:hover { text-decoration: underline; }

  .recent-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .recent-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    background: #2D2D2D;
    border: 1px solid #3E3E3E;
    border-radius: 11px;
    color: #BBB;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
  }

  .recent-chip:hover:not(:disabled) {
    background: #094771;
    border-color: #5B9BD5;
    color: #FFF;
  }

  .insert-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #CCC;
    font-size: 11px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }

  .insert-item:hover:not(:disabled) {
    background: #094771;
    color: #FFF;
  }

  .insert-item:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .insert-item.invalid {
    color: #C98181;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: #1C1C1C;
    border: 1px solid #363636;
    border-radius: 4px;
    color: #8FB8DC;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    color: #666;
    font-size: 10px;
    flex-shrink: 0;
  }

  .empty-result {
    padding: 16px 8px;
    text-align: center;
    color: #666;
    font-size: 11px;
  }
</style>
