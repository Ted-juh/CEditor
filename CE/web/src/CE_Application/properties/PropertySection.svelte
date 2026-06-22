<script>
  import { setContext } from 'svelte';
  import { propertyFilter } from '../stores/propertyFilter.js';

  let { title = '', collapsed = $bindable(false), ontoggle = null, children } = $props();

  let filter = $derived(String($propertyFilter ?? '').trim().toLowerCase());
  let filterActive = $derived(filter !== '');
  let titleMatches = $derived(filterActive && title.toLowerCase().includes(filter));

  // Visible-row counter, maintained by child PropertyCells via report(+/-1).
  let visibleCount = $state(0);

  // Shared with descendant cells via a $state proxy so reads stay reactive
  // across the component boundary; an effect mirrors the derived filter state in.
  let shared = $state({ filter: '', titleMatches: false });
  $effect(() => {
    shared.filter = filter;
    shared.titleMatches = titleMatches;
  });
  setContext('propertySection', {
    shared,
    report(delta) { visibleCount += delta; },
  });

  // While filtering, force the grid open so matching rows can show (and report)
  // even if the user had collapsed the section.
  let renderGrid = $derived(!collapsed || filterActive);
  // Hide the whole section when a filter matches neither its title nor any row.
  let hideSection = $derived(filterActive && !titleMatches && visibleCount === 0);

  function toggle() {
    collapsed = !collapsed;
    ontoggle?.(collapsed);
  }
</script>

<div class="property-section" class:filtered-hidden={hideSection}>
  <button class="property-section-header" onclick={toggle}>
    <svg class="chevron" class:collapsed={collapsed && !filterActive} width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="header-line"></span>
    <span class="property-section-title">{title}</span>
  </button>
  {#if renderGrid}
    <div class="property-grid">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .property-section {
    border-bottom: 1px solid #2A2A2A;
  }

  .property-section.filtered-hidden {
    display: none;
  }

  .property-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    color: #5B9BD5;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .header-line {
    flex: 1;
    height: 1px;
    background: #333;
  }

  .property-section-header:hover {
    background: #252525;
    color: #BBB;
  }

  .chevron {
    flex-shrink: 0;
    color: #555;
    transition: transform 0.1s ease;
  }

  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .property-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 4px;
    padding: 4px 8px 8px 8px;
  }
</style>
