<script>
  import { getContext } from 'svelte';
  import { setHint, clearHint } from '../stores/propertyHint.js';
  import { propertyFilter } from '../stores/propertyFilter.js';

  let { label = '', span = 1, disabled = false, hint = '', children } = $props();

  // A PropertyCell inside a PropertySection coordinates filtering through the
  // section's context (shared filter + title-match + a visible-row counter);
  // outside a section it falls back to the raw store.
  const section = getContext('propertySection');
  let filter = $derived(String($propertyFilter ?? '').trim().toLowerCase());
  let selfMatch = $derived(`${label} ${hint}`.toLowerCase().includes(filter));
  let visible = $derived(!filter || selfMatch || (section?.shared.titleMatches ?? false));

  // Report this cell's visibility into the section's counter so the section can
  // hide its header when a filter leaves it with no matching rows.
  $effect(() => {
    if (!section || !filter || !visible) return;
    section.report(1);
    return () => section.report(-1);
  });
</script>

<div
  class="property-cell"
  class:span-1={span === 1}
  class:span-2={span === 2}
  class:span-4={span === 4}
  class:disabled
  class:filtered-out={!visible}
  role="group"
  onmouseenter={() => hint && setHint(hint)}
  onmouseleave={() => hint && clearHint()}
>
  <span class="property-label">{label}</span>
  <div class="property-input">
    {@render children()}
  </div>
</div>

<style>
  .property-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .property-cell.span-1 { grid-column: span 1; }
  .property-cell.span-2 { grid-column: span 2; }
  .property-cell.span-4 { grid-column: span 4; }

  .property-cell.filtered-out { display: none; }

  .property-label {
    font-size: 10px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.1;
    padding-left: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
  }

  .property-input {
    min-width: 0;
    display: flex;
  }

  .property-input > :global(*) {
    flex: 1;
    min-width: 0;
  }

  .property-cell.disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .property-cell.disabled .property-label {
    color: #444;
  }
</style>
