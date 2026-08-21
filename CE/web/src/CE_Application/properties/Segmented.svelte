<script>
  // Short enums rendered flat — the panel's W4 widget. Every option is
  // visible, the current one is filled, and changing costs one click instead
  // of a dropdown round-trip. For 2–4 options only; longer enums keep the
  // select.
  //
  //   options: [{ value, label?, icon?, title? }]  — icon is a lucide-svelte
  //   component; give icon segments a title so the name survives.
  //   onchange(value) fires when a different segment is picked.
  let { options = [], value = undefined, onchange = null, ariaLabel = '' } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={ariaLabel}>
  {#each options as o (o.value)}
    <button type="button"
            class="seg"
            class:on={o.value === value}
            role="radio"
            aria-checked={o.value === value}
            title={o.title ?? o.label ?? String(o.value)}
            aria-label={o.title ?? o.label ?? String(o.value)}
            onclick={() => { if (o.value !== value) onchange?.(o.value); }}>
      {#if o.icon}
        <o.icon size={12} strokeWidth={2} />
      {:else}
        {o.label ?? o.value}
      {/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    height: 26px;
    flex: 1;
    min-width: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    overflow: hidden;
  }

  .seg {
    flex: 1;
    min-width: 0;
    border: none;
    border-right: 1px solid #262626;
    background: transparent;
    color: #888;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    padding: 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .seg:last-child {
    border-right: none;
  }

  .seg:hover {
    color: #CCC;
  }

  .seg.on {
    background: #094771;
    color: #CDE4F5;
  }

  .seg:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: -2px;
  }
</style>
