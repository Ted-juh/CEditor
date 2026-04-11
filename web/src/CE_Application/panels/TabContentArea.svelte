<script>
  /**
   * The "cards" area of PropertiesPanel — either one big card in single-
   * tab mode or a stack of collapsible cards in multi-tab mode.
   *
   * Used in three places:
   *   - normal view (single icon bar)
   *   - split view, panel half (pinned panel props)
   *   - split view, component half
   *
   * Before this was extracted, each call site had a ~35-40 line inline
   * copy of the single/multi rendering block.
   *
   *   viewMode         — 'single' | 'multi'
   *   tabs             — full tab list (for looking up single-tab label)
   *   visibleTabs      — tabs to render in multi mode
   *   singleTabId      — the active tab id in single mode
   *   contextMode      — 'panel' | 'component' — forwarded to SectionRenderer
   *   control          — $selectedControl — forwarded to SectionRenderer
   *   ownerName        — shown in card-header / first multi-card-header
   *   collapsedCards   — { [id]: true } map
   *   collapsePrefix   — prefix added to card ids in the collapse map (the
   *                      pinned-panel half uses 'panel-' so it doesn't
   *                      collide with the component half's ids)
   *   ontogglecollapse — (id) => void — parent mutates the collapsedCards map
   */
  import { ChevronDown, ChevronRight } from 'lucide-svelte';
  import SectionRenderer from './SectionRenderer.svelte';

  let {
    viewMode,
    tabs = [],
    visibleTabs = [],
    singleTabId,
    contextMode,
    control = null,
    ownerName = '',
    collapsedCards = {},
    collapsePrefix = '',
    ontogglecollapse = null,
  } = $props();

  const cardId = (id) => collapsePrefix + id;
  const isCollapsed = (id) => collapsedCards[cardId(id)] === true;
</script>

{#if viewMode === 'single'}
  {#key singleTabId}
    <div class="card-header">
      <span class="card-title">{tabs.find(t => t.id === singleTabId)?.label ?? ''}</span>
      <span class="owner-label">{ownerName}</span>
    </div>
    <div class="card-content">
      <SectionRenderer
        {contextMode}
        tabId={singleTabId}
        {control}
        fallbackLabel={tabs.find(t => t.id === singleTabId)?.label ?? ''}
      />
    </div>
  {/key}
{:else}
  {#each visibleTabs as tab, i (tab.id)}
    <div class="multi-card">
      <button class="multi-card-header" onclick={() => ontogglecollapse?.(cardId(tab.id))}>
        {#if isCollapsed(tab.id)}
          <ChevronRight size={16} strokeWidth={1.5} />
        {:else}
          <ChevronDown size={16} strokeWidth={1.5} />
        {/if}
        <span class="multi-card-title">{tab.label}</span>
        {#if i === 0}<span class="owner-label">{ownerName}</span>{/if}
      </button>
      {#if !isCollapsed(tab.id)}
        <div class="multi-card-content">
          <SectionRenderer
            {contextMode}
            tabId={tab.id}
            {control}
            fallbackLabel={tab.label}
          />
        </div>
      {/if}
    </div>
  {/each}
{/if}

<style>
  .card-header {
    display: flex;
    align-items: center;
    height: 30px;
    flex-shrink: 0;
    padding: 0 12px;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .owner-label {
    margin-left: auto;
    font-size: 10px;
    font-weight: 400;
    color: #5B9BD5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
    text-align: right;
  }

  .card-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .multi-card {
    border-bottom: 1px solid #2A2A2A;
  }

  .multi-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: #252525;
    border: none;
    color: #BBB;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .multi-card-header:hover {
    background: #2A2A2A;
  }

  .multi-card-title {
    flex: 1;
  }

  .multi-card-content {
    padding: 8px;
  }
</style>
