<script>
  let {
    options = [],
    value = null,
    onchange = null,
    columns = 3,
    disabled = false,
  } = $props();
</script>

<div class="lt-grid" style:--cols={columns}>
  {#each options as opt (opt.value)}
    <button
      class="lt-btn"
      class:active={value === opt.value}
      title={opt.label}
      disabled={disabled}
      onclick={() => onchange?.(opt.value)}
    >
      {@html opt.svg}
    </button>
  {/each}
</div>

<style>
  .lt-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), 1fr);
    gap: 1px;
  }

  .lt-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 2px;
    color: #888;
    cursor: pointer;
    padding: 4px 2px;
    height: 28px;
    font-family: inherit;
    margin: 0;
    min-width: 0;
  }

  .lt-btn:hover:not(.active):not(:disabled) {
    border-color: #5B9BD5;
    color: #CCC;
  }

  .lt-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #DDD;
  }

  .lt-btn :global(svg) {
    width: 100%;
    height: 14px;
  }

  .lt-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
