<script>
  /**
   * ButtonGroup — mutually exclusive toggle buttons.
   * Used for border style, corner style, text justification, etc.
   *
   * @prop {Array<{value: string, label?: string, icon?: Component}>} options
   * @prop {string} value - Currently selected value
   * @prop {function} onchange - Called with new value
   * @prop {boolean} disabled - Disable all buttons
   */
  let { options = [], value = '', onchange = null, disabled = false } = $props();

  function select(val) {
    if (!disabled && val !== value) onchange?.(val);
  }
</script>

<div class="button-group" class:disabled>
  {#each options as opt (opt.value)}
    <button
      class="group-btn"
      class:active={value === opt.value}
      {disabled}
      title={opt.label ?? opt.value}
      onclick={() => select(opt.value)}
    >
      {#if opt.icon}
        <opt.icon size={14} strokeWidth={1.5} />
      {:else}
        {opt.label ?? opt.value}
      {/if}
    </button>
  {/each}
</div>

<style>
  .button-group {
    display: flex;
    gap: 1px;
    border-radius: 3px;
    overflow: hidden;
    width: 100%;
  }

  .group-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    padding: 0 4px;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    white-space: nowrap;
    min-width: 0;
  }

  .group-btn + .group-btn {
    border-left: none;
  }

  .group-btn:first-child {
    border-radius: 3px 0 0 3px;
  }

  .group-btn:last-child {
    border-radius: 0 3px 3px 0;
  }

  .group-btn:only-child {
    border-radius: 3px;
  }

  .group-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #DDD;
  }

  .group-btn:hover:not(.active):not(:disabled) {
    border-color: #5B9BD5;
    color: #CCC;
  }

  .group-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
