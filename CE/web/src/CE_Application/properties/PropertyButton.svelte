<script>
  /**
   * The shared action button — the `.action-btn` that 31 editors each declare for themselves.
   *
   * Three variants, because that is how many the pasted copies actually use once you read them:
   * `default` for an ordinary action, `primary` for the one the row is about, `danger` for
   * remove/clear. `active` is the pressed-in look a toggle-ish button wants (it is the same blue
   * PropertyToggle uses when on, so a button and a toggle in one row read as one family).
   *
   * Height comes from the panel token, so a button sitting beside a text field or a toggle lines
   * up with it instead of being one or three pixels off — which is most of what made the panel
   * look untidy at a glance without anyone being able to say why.
   */
  let {
    label = '',
    variant = 'default',
    active = false,
    disabled = false,
    compact = false,
    title = '',
    ariaLabel = '',
    onclick = null,
    children = undefined,
  } = $props();
</script>

<button
  type="button"
  class="pp-button {variant}"
  class:active
  class:compact
  {disabled}
  {title}
  aria-label={ariaLabel || undefined}
  aria-pressed={active ? 'true' : undefined}
  onclick={(e) => onclick?.(e)}
>
  {#if children}{@render children()}{:else}{label}{/if}
</button>

<style>
  .pp-button {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: var(--pp-field-height, 26px);
    padding: var(--pp-field-padding, 0 6px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--pp-field-bg, #1A1A1A);
    border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px);
    color: var(--pp-field-fg-muted, #888);
    font-size: var(--pp-field-font, 11px);
    font-family: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  /* For toolbars and button banks, where the token height is too generous. */
  .pp-button.compact {
    height: 20px;
    font-size: 10px;
  }

  .pp-button:hover:not(:disabled) {
    color: var(--pp-field-fg, #DDD);
    border-color: #444;
  }

  .pp-button.primary {
    color: var(--pp-field-fg, #DDD);
    border-color: #3A5A78;
  }

  .pp-button.danger:hover:not(:disabled) {
    color: #F2A0A0;
    border-color: #6B3030;
  }

  /* Same blue as PropertyToggle's on state, deliberately. */
  .pp-button.active {
    background: #094771;
    border-color: #0B6EB5;
    color: var(--pp-field-fg, #DDD);
  }

  .pp-button:focus-visible {
    outline: none;
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .pp-button:disabled {
    color: var(--pp-field-disabled-fg, #555);
    cursor: not-allowed;
  }
</style>
