<script>
  let { title = '', collapsed = $bindable(false), ontoggle = null, children } = $props();

  function toggle() {
    collapsed = !collapsed;
    ontoggle?.(collapsed);
  }
</script>

<div class="property-section">
  <button class="property-section-header" onclick={toggle}>
    <svg class="chevron" class:collapsed width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="header-line"></span>
    <span class="property-section-title">{title}</span>
  </button>
  {#if !collapsed}
    <div class="property-grid">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .property-section {
    border-bottom: 1px solid #2A2A2A;
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
