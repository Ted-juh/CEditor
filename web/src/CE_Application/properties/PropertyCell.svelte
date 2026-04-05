<script>
  import { setHint, clearHint } from '../stores/propertyHint.js';
  let { label = '', span = 1, disabled = false, hint = '', children } = $props();
</script>

<div
  class="property-cell"
  class:span-1={span === 1}
  class:span-2={span === 2}
  class:span-4={span === 4}
  class:disabled
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

  .property-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1;
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
