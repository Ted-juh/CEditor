<script>
  // A tiny on/off pill for a PropertySection's header tool slot — the W6
  // master-enable control. The section's single decision lives in its header,
  // so the body only needs to render when there is something to show.
  let { value = false, onLabel = 'On', offLabel = 'Off', title = '', onchange = null } = $props();
</script>

<button type="button"
        class="header-pill"
        class:on={value}
        {title}
        aria-pressed={value}
        onclick={() => onchange?.(!value)}>
  {value ? onLabel : offLabel}
</button>

<style>
  .header-pill {
    height: 16px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #252525;
    color: #777;
    font-size: 9px;
    font-family: inherit;
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
    line-height: 1;
  }

  .header-pill:hover {
    color: #CCC;
    border-color: #4A6E8C;
  }

  .header-pill.on {
    background: #094771;
    border-color: #335371;
    color: #5B9BD5;
  }

  .header-pill:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }
</style>
