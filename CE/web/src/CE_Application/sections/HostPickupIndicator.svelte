<script>
  let { direction = 0 } = $props();
  let label = $derived(direction > 0 ? 'Pickup: move up to the current value' : 'Pickup: move down to the current value');
</script>

{#if direction === 1 || direction === -1}
  <span class="pickup-indicator" role="img" aria-label={label} title={label}
        data-testid="pickup-direction">{direction > 0 ? '↑' : '↓'}</span>
{/if}

<style>
  .pickup-indicator { display: inline-block; flex: none; color: var(--host-pending, #d7a44e);
    font-size: 16px; font-weight: 700; line-height: 1; padding: 0 3px; }
</style>
